import { Command } from 'commander';
import chalk from 'chalk';

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
      'upstream version(tag) from which to start searching for backported commits',
      getDefaultValue('FROM')
    )
    .option(
      '-u, --upstream <upstream>',
      'GitHub upstream org/repo',
      getDefaultValue('UPSTREAM')
    )
    .requiredOption(
      '-l, --login <email>',
      'Jira login email',
      getDefaultValue('LOGIN')
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
    'https://redhat.atlassian.net',
    options.login,
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

  const reportedFollowUps: Commit[] = (() => {
    const all = reportedFollowUpIssues.map(issue =>
      Commit.fromJiraIssue(issue, upstream.git)
    );

    const bySha = new Map<string, Commit>();
    for (const commit of all) {
      const existing = bySha.get(commit.sha);
      if (
        !existing ||
        (existing.tracker?.statusCategory === 'Done' &&
          commit.tracker?.statusCategory !== 'Done')
      ) {
        bySha.set(commit.sha, commit);
      }
    }

    return Array.from(bySha.values());
  })();

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

  const stats = {
    issuesOpened: 0,
    issuesCloned: 0,
    issuesSkippedClosed: 0,
    issuesSkippedWaived: 0,
    newFollowUps: 0,
    newReverts: 0,
  };

  const dbCommitIndex = new Map(db.commits.map(c => [c.sha, c]));

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

      const dbEntry = dbCommitIndex.get(commit.sha);

      if (dbEntry) {
        const knownFollowUps = new Set(dbEntry.followUps.map(f => f.sha));
        const knownReverts = new Set(dbEntry.reverts.map(r => r.sha));

        const hasNewFollowUps = commit.followUps.some(
          f => !knownFollowUps.has(f.sha)
        );
        const hasNewReverts = commit.reverts.some(
          r => !knownReverts.has(r.sha)
        );

        if (
          dbEntry.tracker?.statusCategory === 'Done' &&
          !hasNewFollowUps &&
          !hasNewReverts
        ) {
          logger.log(
            `Skipping ${commit.sha} - tracker ${dbEntry.tracker.id} is already closed and has no new follow-ups`
          );
          stats.issuesSkippedClosed++;
          continue;
        }

        if (
          dbEntry.tracker?.statusCategory === 'Done' &&
          (hasNewFollowUps || hasNewReverts)
        ) {
          const originalIssueId = dbEntry.tracker.id;
          logger.log(
            `Cloning ${originalIssueId} - new follow-ups found for resolved tracker`
          );

          const clonedKey = await jira.cloneIssue(
            originalIssueId,
            options.release
          );

          if (clonedKey) {
            await jira.recreateRemoteLinks(clonedKey, dbEntry);

            const clonedTracker = await jira.getIssueTracker(clonedKey);
            clonedTracker.clonedFrom = originalIssueId;
            dbEntry.tracker = clonedTracker;
            stats.issuesCloned++;
          } else {
            logger.log(`Failed to clone ${originalIssueId}, skipping`);
            continue;
          }
        }

        for (const followUp of commit.followUps) {
          if (knownFollowUps.has(followUp.sha)) continue;

          dbEntry.followUps.push({
            sha: followUp.sha,
            message: followUp.message,
            url: followUp.url,
            waived: commit.pr?.isFollowUpWaived(followUp.sha) ?? false,
          });

          stats.newFollowUps++;

          if (dbEntry.tracker) {
            await jira.createExternalLink(
              dbEntry.tracker.id,
              'follow-up',
              followUp.message,
              followUp.url
            );
          }
        }

        for (const revert of commit.reverts) {
          if (knownReverts.has(revert.sha)) continue;

          dbEntry.reverts.push({
            sha: revert.sha,
            message: revert.message,
            url: revert.url,
            waived: commit.pr?.isFollowUpWaived(revert.sha) ?? false,
          });

          stats.newReverts++;

          if (dbEntry.tracker) {
            await jira.createExternalLink(
              dbEntry.tracker.id,
              'revert',
              revert.message,
              revert.url
            );
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

        const newDbEntry = db.commits[db.commits.length - 1];
        dbCommitIndex.set(newDbEntry.sha, newDbEntry);

        stats.newFollowUps += newDbEntry.followUps.filter(
          f => !f.waived && !f.backported
        ).length;
        stats.newReverts += newDbEntry.reverts.filter(
          r => !r.waived && !r.backported
        ).length;

        if (
          newDbEntry.followUps.every(
            followUp => followUp.waived || followUp.backported
          ) &&
          newDbEntry.reverts.every(revert => revert.waived || revert.backported)
        ) {
          logger.log(
            `Skipping issue creation for ${commit.sha} because all follow-ups and reverts were waived or already backported`
          );
          stats.issuesSkippedWaived++;
          continue;
        }

        const tracker = await jira.createIssue(
          options.release,
          options.component,
          options.epic,
          newDbEntry
        );

        newDbEntry.tracker = tracker;
        stats.issuesOpened++;
      }
    }
  }

  db.show();

  // Print run statistics
  logger.log(`\n${'─'.repeat(60)}`);
  logger.log(`📊 Run Statistics`);
  logger.log(`${'─'.repeat(60)}`);
  logger.log(
    `  New follow-ups discovered:  ${chalk.yellow(String(stats.newFollowUps))}`
  );
  logger.log(
    `  New reverts discovered:     ${chalk.red(String(stats.newReverts))}`
  );
  logger.log(
    `  Issues opened:              ${chalk.green(String(stats.issuesOpened))}`
  );
  logger.log(
    `  Issues cloned:              ${chalk.cyan(String(stats.issuesCloned))}`
  );
  logger.log(
    `  Skipped Issues (waived/backported):${chalk.gray(` ${stats.issuesSkippedWaived}`)}`
  );
  logger.log(`${'─'.repeat(60)}\n`);

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
