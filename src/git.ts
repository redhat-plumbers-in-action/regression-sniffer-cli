import { warning, info } from '@actions/core';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

import { Filters } from './schema/filter';

export class Git {
  readonly gitHubUrl = 'https://github.com';
  readonly repoUrl: string;

  constructor(
    readonly owner: string,
    readonly repo: string,
    readonly repoDir = 'abc_Repo_cba'
  ) {
    this.repoUrl = `${this.gitHubUrl}/${this.owner}/${this.repo}.git`;
  }

  clone() {
    if (existsSync(this.repoDir)) {
      info(`${this.repoUrl} is already cloned`);
      return;
    }

    const gitClone = `git clone ${this.repoUrl} ${this.repoDir}`;
    // info(gitClone);

    // https://stackoverflow.com/a/57669219/10221282
    execSync(gitClone, {
      stdio: [0, 1, 2], // we need this so node will print the command output
    });
  }

  grepLog(
    sha: string,
    filter: Filters[keyof Filters],
    from?: string
  ): string[] {
    const regex = filter.join('|').replaceAll('%{sha}%', sha);

    // Get all commit SHAs that matches provided regex
    const gitLog = `git -C ${this.repoDir} --no-pager log --pretty=format:"%H" --regexp-ignore-case --perl-regexp --grep "${regex}" ${from ? `${from}...HEAD` : ''}`;
    // info(`${gitLog}`);

    let stdout = '';
    try {
      stdout = execSync(gitLog).toString();
    } catch (error) {
      warning(`Unable to grep git log - stderr: '${error}'`);
    }

    const commits = stdout.split('\n');

    // When no commits are found, stdout will be an empty string. We want to return an empty array in this case
    return commits.length === 1 && commits[0] === '' ? [] : commits;
  }

  getCommitMessage(sha: string): string {
    // Get single commit message for provided SHA
    const gitShow = `git -C ${this.repoDir} --no-pager show --no-patch --pretty=format:"%B" ${sha}`;
    // info(`${gitShow}`);

    let stdout = '';
    try {
      stdout = execSync(gitShow).toString();
    } catch (error) {
      warning(`Unable to git show commit message - stderr: '${error}'`);
    }

    // When no commits are found, stdout will be an empty string. We want to return an empty array in this case
    return stdout;
  }

  getCommitUrl(sha: string): string {
    return `${this.gitHubUrl}/${this.owner}/${this.repo}/commit/${sha}`;
  }

  removeClone() {
    const remove = `rm -rf ${this.repoDir}`;
    // info(remove);

    execSync(remove, {
      stdio: [0, 1, 2], // we need this so node will print the command output
    });
  }
}
