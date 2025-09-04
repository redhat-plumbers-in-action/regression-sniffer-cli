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
    for (const commit of this.commits) {
      const cherryPickUrls = commit.cherryPicks
        .map(cp => chalk.magenta(cp.url))
        .join('\n');
      const followUpUrls = commit.followUps
        ?.map(f => chalk.yellow(f.url))
        .join('\n');
      const revertUrls = commit.reverts?.map(r => chalk.red(r.url)).join('\n');

      this.logger.log(
        `Commit: ${chalk.blue(commit.url)}${cherryPickUrls ? ` - ${cherryPickUrls}` : ''}`
      );
      this.logger.log(`PR: ${chalk.green(commit.pr?.url)}`);
      if (followUpUrls) this.logger.log(followUpUrls);
      if (revertUrls) this.logger.log(revertUrls);
      this.logger.log();
    }
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
