import { filters } from './filter';
import { Git } from './git';
import { PullRequest } from './pullrequest';
import { CommitDb, followUpDb, revertDb, trackerDb } from './schema/db';
import { JiraIssue } from './schema/jira';

export class Commit {
  cherryPicks: CommitDb['cherryPicks'] = [];

  followUps: followUpDb[] = [];
  reverts: revertDb[] = [];

  backport: boolean = false;
  pr: PullRequest | undefined;
  tracker: trackerDb | undefined;

  constructor(
    readonly sha: string,
    readonly url: string,
    readonly message: string,
    readonly upstreamGit: Git
  ) {
    this.getCherryPicks();
    this.getFollowUps();
    this.followUps = this.removeDuplicates(this.followUps, this.reverts);
  }

  getFollowUps() {
    this.cherryPicks.forEach(cherryPick => {
      this.followUps.push(
        ...this.toDBObject(
          this.upstreamGit.grepLog(cherryPick.sha, [
            ...filters.mention,
            ...filters.followUp,
          ])
        )
      );
      this.reverts.push(
        ...this.toDBObject(
          this.upstreamGit.grepLog(cherryPick.sha, filters.revert)
        )
      );
    });
  }

  toDBObject(sha: string[]): followUpDb[] | revertDb[] {
    return sha.map(singleSha => {
      return {
        sha: singleSha,
        message: this.upstreamGit.getCommitMessage(singleSha),
        url: this.upstreamGit.getCommitUrl(singleSha),
        backported: undefined,
        waived: undefined,
      };
    });
  }

  checkBackportedCommits(commits: Commit[]) {
    this.followUps.forEach(followUp => {
      const backported = commits.some(commit =>
        commit.cherryPicks.some(cherryPick => cherryPick.sha === followUp.sha)
      );

      if (backported) {
        followUp.backported = true;
      }
    });

    this.reverts.forEach(revert => {
      const backported = commits.some(commit =>
        commit.cherryPicks.some(cherryPick => cherryPick.sha === revert.sha)
      );

      if (backported) {
        revert.backported = true;
      }
    });
  }

  needsBackport() {
    const toBackport = [...this.followUps, ...this.reverts];

    return toBackport;
  }

  removeDuplicates(followUps: followUpDb[], reverts: revertDb[]): followUpDb[] {
    const seenShas = new Set<string>();

    reverts.forEach(revert => seenShas.add(revert.sha));

    return followUps.filter(followUp => {
      if (seenShas.has(followUp.sha)) {
        return false;
      }
      seenShas.add(followUp.sha);
      return true;
    });
  }

  getCherryPicks() {
    const regexp = /\(cherry picked from commit (\b[0-9a-f]{5,40}\b)\) *\n?/g;

    const matches = [...this.message.matchAll(regexp)];
    const cherryPicks = Array.isArray(matches)
      ? matches.map(match => {
          return match[1].toString();
        })
      : [];

    this.cherryPicks = cherryPicks.map(sha => ({
      sha,
      url: this.upstreamGit.getCommitUrl(sha),
    }));
  }

  static fromJiraIssue(issue: JiraIssue, upstreamGit: Git): Commit {
    let commit = new Commit(issue.sha, issue.url, issue.message, upstreamGit);

    commit.cherryPicks = issue.cherryPicks;
    commit.followUps = issue.followUp;
    commit.reverts = issue.revert;
    commit.tracker = issue.tracker;

    return commit;
  }
}
