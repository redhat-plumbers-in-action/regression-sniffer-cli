import { Version2Client } from 'jira.js';

import { raise } from './util';
import {
  externalLinkSchema,
  JiraIssue,
  jiraIssueSchema,
  releaseSchema,
} from './schema/jira';
import { CommitDb, trackerDb } from './schema/db';
import { Logger } from './logger';
import chalk from 'chalk';

export class Jira {
  readonly api: Version2Client;
  readonly fields = {
    epic: 'customfield_12311140',
  };

  constructor(
    readonly instance: string,
    apiToken: string,
    readonly dry: boolean,
    readonly logger: Logger
  ) {
    this.api = new Version2Client({
      host: instance,
      authentication: {
        personalAccessToken: apiToken,
      },
    });
  }

  async getVersion(): Promise<string> {
    const response = await this.api.serverInfo.getServerInfo();
    return response.version ?? raise('Jira.getVersion(): missing version.');
  }

  getIssueURL(issue: string) {
    return `${this.instance}/browse/${issue}`;
  }

  async getFollowUpIssues(
    component: string,
    label: string
  ): Promise<JiraIssue[]> {
    const jql = `project = RHEL AND component = ${component} AND labels in (${label}) ORDER BY created DESC`;

    const response = await this.api.issueSearch.searchForIssuesUsingJqlPost({
      jql: jql,
      fields: [
        'id',
        'issuetype',
        'status',
        'summary',
        'description',
        'labels',
        'versions',
        this.fields.epic,
      ],
    });

    if (!response.issues || response.issues.length === 0) return [];

    return Promise.all(
      response.issues.map(async issue => {
        return jiraIssueSchema.parse({
          key: issue.key,
          url: this.getIssueURL(issue.key),
          type: issue.fields.issuetype.name,
          status: issue.fields.status.name,
          statusCategory: issue.fields.status.statusCategory?.name,
          summary: issue.fields.summary,
          labels: issue.fields.labels,
          links: await this.api.issueRemoteLinks.getRemoteIssueLinks({
            issueIdOrKey: issue.key,
          }),
          versions: (issue.fields.versions as { name: string }[]).map(
            version => version.name
          ),
          epic: issue.fields[this.fields.epic]?.value ?? undefined,
        });
      })
    );
  }

  async createIssue(
    release: string,
    component: string,
    epic: string,
    dbEntry: CommitDb
  ): Promise<trackerDb | undefined> {
    const title = `[follow-up to] - ${dbEntry.message.split('\n')[0]}`;
    const description =
      `Commit [${dbEntry.sha}|${dbEntry.url}] has follow-ups in the upstream project.\n` +
      `Please check follow-up commits and if they are relevant to the RHEL project, please backport them.\n` +
      `Otherwise, please close this issue.\n\n` +
      `[regression-sniffer-cli|https://github.com/redhat-plumbers-in-action/regression-sniffer-cli] was used to create this issue.`;
    const labels = ['systemd-followup'];

    const releaseParsed = releaseSchema.safeParse(release);
    const releaseSafe = releaseParsed.success ? releaseParsed.data : 10;
    const version = `CentOS Stream ${releaseSafe}`;

    if (this.dry) {
      this.logger.log(chalk.dim('Would create issue:'));
      this.logger.log(`Title: ${chalk.bold(title)}`);
      this.logger.log(`Description: ${chalk.italic(description)}`);
      this.logger.log(`Labels: ${chalk.yellow(labels.join(', '))}`);
      this.logger.log(`Version: ${chalk.green(version)}`);
      this.logger.log(chalk.dim('External links:'));
      this.logger.log(
        `[backport] - ${dbEntry.message.split('\n')[0]} - ${chalk.blue(dbEntry.url)}`
      );
      for (const cherryPick of dbEntry.cherryPicks) {
        this.logger.log(
          `[cherry-pick] - ${dbEntry.message.split('\n')[0]} - ${chalk.magenta(cherryPick.url)}`
        );
      }
      for (const followUp of dbEntry.followUps) {
        this.logger.log(
          `[follow-up] - ${followUp.message.split('\n')[0]} - ${chalk.yellow(followUp.url)}`
        );
      }
      for (const revert of dbEntry.reverts) {
        this.logger.log(
          `[revert] - ${revert.message.split('\n')[0]} - ${chalk.red(revert.url)}`
        );
      }
      return {
        id: 'DRY-007',
        type: 'Bug',
        url: 'https://issues.redhat.com/browse/DRY-007',
        status: 'New',
        statusCategory: 'To Do',
        versions: [version],
        summary: title,
      };
    }

    const issue = await this.api.issues.createIssue({
      fields: {
        project: {
          key: 'RHEL',
        },
        summary: title,
        description: description,
        issuetype: {
          name: 'Bug',
        },
        labels: labels,
        components: [
          {
            name: component,
          },
        ],
        versions: [{ name: version }],
        security: {
          id: '11694',
          name: 'Red Hat Engineering Authorized',
        },
        [this.fields.epic]: {
          value: epic,
        },
      },
    });

    await this.createExternalLink(
      issue.key,
      'backport',
      dbEntry.message.split('\n')[0],
      dbEntry.sha
    );

    for (const cherryPick of dbEntry.cherryPicks) {
      await this.createExternalLink(
        issue.key,
        'cherry-pick',
        dbEntry.message.split('\n')[0],
        cherryPick.url
      );
    }

    for (const followUp of dbEntry.followUps) {
      await this.createExternalLink(
        issue.key,
        'follow-up',
        followUp.message,
        followUp.url
      );
    }

    for (const revert of dbEntry.reverts) {
      await this.createExternalLink(
        issue.key,
        'revert',
        revert.message,
        revert.url
      );
    }

    return {
      id: issue.key,
      type: 'Bug',
      url: issue.self,
      status: 'New',
      statusCategory: 'To Do',
      versions: [version],
      summary: title,
    };
  }

  async createExternalLink(
    issue: string,
    type: 'follow-up' | 'revert' | 'cherry-pick' | 'backport',
    title: string,
    url: string
  ) {
    const link = externalLinkSchema.parse({
      object: {
        title: `[${type}] - ${title.split('\n')[0]}`,
        url: url,
      },
    });

    if (this.dry) {
      this.logger.log(
        `Would create external link: ${link.title.split('\n')[0]} - ${chalk.blue(link.url)}`
      );
      return;
    }

    await this.api.issueRemoteLinks.createOrUpdateRemoteIssueLink({
      issueIdOrKey: issue,
      object: {
        title: `[${type}] - ${link.title.split('\n')[0]}`,
        url,
        icon: {
          title: 'GitHub',
          url16x16: 'https://github.githubassets.com/favicon.ico',
        },
      },
    });
  }

  async transitionIssue(issue: string, status: 'New' | 'In Progress') {
    if (this.dry) {
      this.logger.log(
        `Would transition issue ${chalk.blue(issue)} to ${chalk.yellow(status)}`
      );
      return;
    }

    await this.api.issues.doTransition({
      issueIdOrKey: issue,
      transition: {
        name: status,
      },
    });
  }
}
