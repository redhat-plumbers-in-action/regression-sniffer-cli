import cliProgress from 'cli-progress';
import { Commit } from './commit';
import { filters } from './filter';
import { Git } from './git';
import { Logger } from './logger';

export type Repo = { owner: string; repo: string };

export class Stream {
  readonly git: Git;

  // backportedCommits are used to store the SHA of all commits that have been backported (has been cherry-picked)
  // it is used to check if follow-ups have been reported backported
  backportedCommits: string[] = [];

  // commits with follow-ups are stored here
  commits: Commit[] = [];

  constructor(
    repo: Repo,
    readonly logger: Logger
  ) {
    this.git = new Git(
      repo.owner,
      repo.repo,
      `abc_${repo.owner}-${repo.repo}_cba`
    );
  }

  getBackportedCommits(upstreamGit: Git, from: string): void | string {
    // Create progress bar
    const progressBar = new cliProgress.SingleBar({
      format:
        'Processing commits [{bar}] {percentage}% | {value}/{total} commits | {eta_formatted} remaining',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true,
    });

    this.logger.log('🔍 Searching for backported commits...');
    this.backportedCommits = this.git.grepLog(`\\S+`, filters.cherryPick, from);

    if (this.backportedCommits.length === 0) {
      return 'No backported commits found.';
    }

    this.logger.log(
      `✅ Found ${this.backportedCommits.length} backported commits`
    );
    this.logger.log('📊 Processing commit details...');

    // Start progress bar
    progressBar.start(this.backportedCommits.length, 0);

    this.backportedCommits.forEach((sha, index) => {
      const commitMessage = this.git.getCommitMessage(sha);
      this.commits.push(
        new Commit(sha, this.git.getCommitUrl(sha), commitMessage, upstreamGit)
      );

      // Update progress bar
      progressBar.update(index + 1);
    });

    // Stop progress bar
    progressBar.stop();
    this.logger.log('✅ Commit processing completed');
  }

  removeAlreadyBackported() {
    this.commits.forEach(commit => {
      commit.checkBackportedCommits(this.commits);
    });
  }

  static getOwnerRepo(name: string): Repo;
  static getOwnerRepo(name: string | undefined):
    | {
        owner: string;
        repo: string;
      }
    | undefined {
    if (name === undefined) {
      return name;
    }

    const [owner, repo] = name.split('/');

    return { owner, repo };
  }
}
