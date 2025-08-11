import { Command } from 'commander';

import path from 'node:path';
import os from 'node:os';

import { Logger } from './logger';
import { getOctokit } from './octokit';
import { getDefaultValue, getOptions, tokenUnavailable } from './util';
import { Stream } from './stream';
import { PullRequest } from './pullrequest';
import { Jira } from './jira';
import { Database } from './db';
import { Commit } from './commit';

export function cli(): Command {
  const program = new Command();

  program
    .name('regression-sniffer')
    .description(
      '🔍 A CLI tool that searches for follow-up and revert commits in upstream projects and creates Jira issues to track them.'
    )
    .version('1.0.1');

  program
    .requiredOption(
      '-c, --component <component>',
      'component name',
      getDefaultValue('COMPONENT')
    )
    .requiredOption(
      '-r, --release <release>',
      'RHEL major release version, e.g. 8, 9, 10, etc.',
      getDefaultValue('RELEASE')
    )
    .requiredOption(
      '-e, --epic <epic>',
      'Jira epic name',
      getDefaultValue('EPIC')
    )
    .requiredOption(
      '-d, --downstream <downstream>',
      'GitHub downstream source-git org/repo',
      getDefaultValue('DOWNSTREAM')
    )
    .option(
      '-f, --from <from>',
      'upstream version(tag) from which to start searching for backported commits'
    )
    .option(
      '-u, --upstream <upstream>',
      'GitHub upstream org/repo',
      getDefaultValue('UPSTREAM')
    )
    .option(
      '-L, --label <label>',
      'Jira issue label that indicates issues reported by this tool',
      getDefaultValue('LABEL')
    )
    .option(
      '-w, --cleanup',
      'cleanup cloned repositories',
      getDefaultValue('CLEANUP')
    )
    .option('-n, --nocolor', 'disable color output', getDefaultValue('NOCOLOR'))
    .option('-x, --dry', 'dry run', getDefaultValue('DRY'));

  return program;
}

const runProgram = async () => {
  const program = cli();
  program.parse();

  const options = getOptions(program.opts());
  const logger = new Logger(!!options.nocolor);

  const jiraToken = process.env.JIRA_API_TOKEN ?? tokenUnavailable('jira');
  const jira = new Jira(
    'https://issues.redhat.com',
    jiraToken,
    options.dry,
    logger
  );

  const githubToken =
    process.env.GITHUB_API_TOKEN ?? tokenUnavailable('github');
  const octokit = getOctokit(githubToken);

  const reportedFollowUpIssues =
    (await jira.getFollowUpIssues(
      options.component,
      options.label ?? `${options.component}-followup`
    )) ?? [];

  const upstreamRepo = Stream.getOwnerRepo(options.upstream) ?? {
    owner: options.component,
    repo: options.component,
  };
  const upstream = new Stream(upstreamRepo, logger);

  const downstreamRepo = Stream.getOwnerRepo(options.downstream);
  const downstream = new Stream(downstreamRepo, logger);

  let reportedFollowUps: Commit[] = reportedFollowUpIssues.map(commit => {
    return Commit.fromJiraIssue(commit, upstream.git);
  });

  // ---------------------------

  const db = new Database(
    upstream.git.repoUrl,
    downstream.git.repoUrl,
    reportedFollowUps.map(commit => {
      return {
        sha: commit.sha,
        url: commit.url,
        cherryPicks: commit.cherryPicks.map(cherryPick => ({
          sha: cherryPick.sha,
          url: cherryPick.url,
        })),
        message: commit.message,
        followUps: commit.followUps,
        reverts: commit.reverts,
        tracker: commit.tracker,
        pr: commit.pr
          ? {
              number: commit.pr.data.number,
              url: commit.pr.data.html_url ?? '',
              waived: commit.pr.waived,
            }
          : undefined,
      };
    }),
    logger
  );

  const dbFilePath = path.join(
    os.homedir(),
    '.config',
    'regression-sniffer',
    `${options.component}.json`
  );

  try {
    logger.log(`💾 Writing to ${dbFilePath}`);
    db.writeToFile(dbFilePath);
  } catch (err) {
    console.error(err);
  }

  // ---------------------------

  upstream.git.clone();
  downstream.git.clone();

  logger.log(downstream.getBackportedCommits(upstream.git, options.from));

  downstream.removeAlreadyBackported();

  for (const commit of downstream.commits) {
    if (
      commit.followUps.some(followUp => followUp?.waived === undefined) ||
      commit.reverts.some(revert => revert?.waived === undefined)
    ) {
      commit.pr = await PullRequest.getPullRequest(
        commit.sha,
        octokit,
        downstreamRepo
      );

      await commit.pr?.getCommentWithFollowUps();

      const dbEntry = db.commits.find(entry => entry.sha === commit.sha);

      if (dbEntry) {
        for (const followUp of commit.followUps) {
          for (const dbFollowup of dbEntry.followUps) {
            if (followUp.sha !== dbFollowup.sha) {
              dbEntry.followUps.push({
                sha: followUp.sha,
                message: followUp.message,
                url: followUp.url,
                waived: commit.pr?.isFollowUpWaived(followUp.sha) ?? false,
              });

              if (dbEntry.tracker) {
                if (dbEntry.tracker.statusCategory === 'Done') {
                  await jira.transitionIssue(dbEntry.tracker.id, 'In Progress');
                  dbEntry.tracker.status = 'In Progress';
                  dbEntry.tracker.statusCategory = 'To Do';
                }
                await jira.createExternalLink(
                  dbEntry.tracker.id,
                  'follow-up',
                  followUp.message,
                  followUp.url
                );
              }
              break;
            }
          }
        }

        for (const revert of commit.reverts) {
          for (const dbRevert of dbEntry.reverts) {
            if (revert.sha !== dbRevert.sha) {
              dbEntry.reverts.push({
                sha: revert.sha,
                message: revert.message,
                url: revert.url,
                waived: commit.pr?.isFollowUpWaived(revert.sha) ?? false,
              });

              if (dbEntry.tracker) {
                if (dbEntry.tracker.statusCategory === 'Done') {
                  await jira.transitionIssue(dbEntry.tracker.id, 'In Progress');
                  dbEntry.tracker.status = 'In Progress';
                  dbEntry.tracker.statusCategory = 'To Do';
                }
                await jira.createExternalLink(
                  dbEntry.tracker.id,
                  'revert',
                  revert.message,
                  revert.url
                );
              }

              break;
            }
          }
        }

        if (commit.pr) {
          dbEntry.pr = {
            number: commit.pr.data.number,
            url: commit.pr.data.html_url ?? '',
            waived: commit.pr.waived,
          };
        }
      } else {
        db.commits.push({
          sha: commit.sha,
          url: downstream.git.getCommitUrl(commit.sha),
          cherryPicks: commit.cherryPicks,
          message: commit.message,
          followUps: commit.followUps.map(followUp => ({
            ...followUp,
            waived: commit.pr?.isFollowUpWaived(followUp.sha) ?? false,
          })),
          reverts: commit.reverts.map(revert => ({
            ...revert,
            waived: commit.pr?.isFollowUpWaived(revert.sha) ?? false,
          })),
          pr: commit.pr
            ? {
                number: commit.pr.data.number,
                url: commit.pr.data.html_url ?? '',
                waived: commit.pr.waived,
              }
            : undefined,
        });

        const tracker = await jira.createIssue(
          options.release,
          options.component,
          options.epic,
          db.commits[db.commits.length - 1]
        );

        db.commits[db.commits.length - 1].tracker = tracker;
      }
    }
  }

  db.show();

  try {
    logger.log(`💾 Writing to ${dbFilePath}`);
    db.writeToFile(dbFilePath);
  } catch (err) {
    console.error(err);
  }

  // Clean up
  if (options.cleanup) {
    downstream.git.removeClone();
    upstream.git.removeClone();
  }
};

export default runProgram;
