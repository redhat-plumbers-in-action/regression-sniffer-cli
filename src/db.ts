import { readFileSync, writeFileSync } from 'node:fs';

import { Db, dbSchema } from './schema/db';
import { Logger } from './logger';
import chalk from 'chalk';

export class Database {
  constructor(
    public upstream: Db['upstream'],
    public downstream: Db['downstream'],
    public commits: Db['commits'] = [],
    readonly logger: Logger
  ) {}

  getDatabase(): Db {
    return {
      upstream: this.upstream,
      downstream: this.downstream,
      commits: this.commits,
    };
  }

  show(): void {
    this.commits.forEach(commit => {
      this.logger.log(
        `Commit: ${chalk.blue(commit.url)} - ${commit.cherryPicks.map(cherryPick => chalk.magenta(cherryPick.url)).join('\n') || ''}`
      );
      this.logger.log(`PR: ${chalk.green(commit.pr?.url)}`);
      this.logger.log(
        `${commit.followUps?.map(followUp => chalk.yellow(followUp.url)).join('\n') || ''}`
      );
      this.logger.log(
        `${commit.reverts?.map(revert => chalk.red(revert.url)).join('\n') || ''}`
      );
      this.logger.log();
    });
  }

  writeToFile(filePath: string): void {
    writeFileSync(filePath, JSON.stringify(this.getDatabase(), null, 2), {
      encoding: 'utf-8',
    });
  }

  static fromFile(filePath: string, logger: Logger): Database {
    const data = dbSchema.parse(
      JSON.parse(readFileSync(filePath, { encoding: 'utf-8' }))
    );

    return new Database(data.upstream, data.downstream, data.commits, logger);
  }
}
