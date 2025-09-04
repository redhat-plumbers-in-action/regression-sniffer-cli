import { filters } from './filter';
import { Git } from './git';
import { PullRequest } from './pullrequest';
import { CommitDb, FollowUpDb, RevertDb, TrackerDb } from './schema/db';
import { JiraIssue } from './schema/jira';

export class Commit {
  cherryPicks: CommitDb['cherryPicks'] = [];

  followUps: FollowUpDb[] = [];
  reverts: RevertDb[] = [];

  backport: boolean = false;
  pr: PullRequest | undefined;
  tracker: TrackerDb | undefined;

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
    for (const cherryPick of this.cherryPicks) {
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
    }
  }

  toDBObject(sha: string[]): FollowUpDb[] {
    return sha.map(singleSha => ({
      sha: singleSha,
      message: this.upstreamGit.getCommitMessage(singleSha),
      url: this.upstreamGit.getCommitUrl(singleSha),
      backported: undefined,
      waived: undefined,
    }));
  }

  checkBackportedCommits(commits: Commit[]) {
    const allCherryPickShas = new Set<string>();
    for (const commit of commits) {
      for (const cp of commit.cherryPicks) {
        allCherryPickShas.add(cp.sha);
      }
    }

    for (const followUp of this.followUps) {
      if (allCherryPickShas.has(followUp.sha)) {
        followUp.backported = true;
      }
    }

    for (const revert of this.reverts) {
      if (allCherryPickShas.has(revert.sha)) {
        revert.backported = true;
      }
    }
  }

  needsBackport() {
    return [...this.followUps, ...this.reverts];
  }

  removeDuplicates(followUps: FollowUpDb[], reverts: RevertDb[]): FollowUpDb[] {
    const seenShas = new Set<string>(reverts.map(revert => revert.sha));

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
    const cherryPicks = matches.map(match => match[1].toString());

    this.cherryPicks = cherryPicks.map(sha => ({
      sha,
      url: this.upstreamGit.getCommitUrl(sha),
    }));
  }

  static fromJiraIssue(issue: JiraIssue, upstreamGit: Git): Commit {
    const commit = new Commit(issue.sha, issue.url, issue.message, upstreamGit);

    commit.cherryPicks = issue.cherryPicks;
    commit.followUps = issue.followUp;
    commit.reverts = issue.revert;
    commit.tracker = issue.tracker;

    return commit;
  }
}
