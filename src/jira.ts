import { Version3Client } from 'jira.js';

import { IssueLink } from 'jira.js/dist/esm/types/version3/models';

import { raise } from './util';
import {
  externalLinkSchema,
  JiraIssue,
  jiraIssueSchema,
  releaseSchema,
} from './schema/jira';
import { CommitDb, TrackerDb } from './schema/db';
import { Logger } from './logger';
import chalk from 'chalk';

function firstLine(message: string): string {
  return message.split('\n')[0];
}

export class Jira {
  readonly api: Version3Client;
  readonly fields = {
    severity: 'customfield_10840',
    epic: 'customfield_10014',
    requestClones: 'customfield_10941',
  };
  readonly cloneOptions = [
    {
      rhel: '9',
      value: '20558',
    },
    {
      rhel: '10',
      value: '20557',
    },
  ];

  constructor(
    readonly instance: string,
    email: string,
    apiToken: string,
    readonly dry: boolean,
    readonly logger: Logger
  ) {
    this.api = new Version3Client({
      host: instance,
      authentication: {
        basic: {
          email,
          apiToken,
        },
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
    const fields = [
      'id',
      'issuetype',
      'status',
      'summary',
      'description',
      'labels',
      'versions',
      this.fields.epic,
    ];

    let response =
      await this.api.issueSearch.searchForIssuesUsingJqlEnhancedSearchPost({
        jql,
        fields,
        maxResults: 100,
      });

    const allIssues = response.issues ?? [];

    while (response.nextPageToken) {
      response =
        await this.api.issueSearch.searchForIssuesUsingJqlEnhancedSearchPost({
          jql,
          fields,
          maxResults: 100,
          nextPageToken: response.nextPageToken,
        });

      if (response.issues) allIssues.push(...response.issues);
    }

    if (allIssues.length === 0) return [];

    const concurrency = 5;
    const results: JiraIssue[] = [];

    for (let i = 0; i < allIssues.length; i += concurrency) {
      const batch = allIssues.slice(i, i + concurrency);
      const batchLinks = await Promise.all(
        batch.map(issue => this.getRemoteLinksWithRetry(issue.key))
      );

      for (let j = 0; j < batch.length; j++) {
        const issue = batch[j];
        results.push(
          jiraIssueSchema.parse({
            key: issue.key,
            url: this.getIssueURL(issue.key),
            type: issue.fields.issuetype.name,
            status: issue.fields.status.name,
            statusCategory: issue.fields.status.statusCategory?.name,
            summary: issue.fields.summary,
            labels: issue.fields.labels,
            links: batchLinks[j],
            versions: (issue.fields.versions as { name: string }[]).map(
              version => version.name
            ),
            epic: issue.fields[this.fields.epic]?.value ?? undefined,
          })
        );
      }
    }

    return results;
  }

  private async getRemoteLinksWithRetry(
    issueKey: string,
    retries = 3
  ): Promise<unknown[]> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await this.api.issueRemoteLinks.getRemoteIssueLinks({
          issueIdOrKey: issueKey,
        });
      } catch (error) {
        if (attempt < retries) {
          const delay = 1000 * 2 ** (attempt - 1);
          this.logger.log(
            `Failed to fetch remote links for ${issueKey} (attempt ${attempt}/${retries}), retrying in ${delay}ms...`
          );
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          this.logger.log(
            `Failed to fetch remote links for ${issueKey} after ${retries} attempts, skipping`
          );
          return [];
        }
      }
    }
    return [];
  }

  async createIssue(
    release: string,
    component: string,
    epic: string,
    dbEntry: CommitDb
  ): Promise<TrackerDb | undefined> {
    const title = `[follow-up to] - ${firstLine(dbEntry.message)}`;
    const description =
      `Commit [${dbEntry.sha}|${dbEntry.url}] has follow-ups in the upstream project.\n` +
      `Please check follow-up commits and if they are relevant to the RHEL project, please backport them.\n` +
      `Otherwise, please close this issue.\n\n` +
      `[regression-sniffer-cli|https://github.com/redhat-plumbers-in-action/regression-sniffer-cli] was used to create this issue.`;
    const labels = ['systemd-followup'];

    const releaseParsed = releaseSchema.safeParse(release);
    const releaseSafe = releaseParsed.success ? releaseParsed.data : 10;
    const version = `CentOS Stream ${releaseSafe}`;

    this.logger.log(
      `Creating issue: ${chalk.bold(title)}\n` +
        `Description: ${chalk.italic(description)}\n` +
        `Component: ${chalk.yellow(component)}\n` +
        `Labels: ${chalk.yellow(labels.join(', '))}\n` +
        `Version: ${chalk.green(version)}\n` +
        `Epic: ${chalk.cyan(epic)}\n`
    );

    if (this.dry) {
      this.logger.log(
        `[backport] - ${firstLine(dbEntry.message)} - ${chalk.blue(dbEntry.url)}`
      );
      for (const cherryPick of dbEntry.cherryPicks) {
        this.logger.log(
          `[cherry-pick] - ${firstLine(dbEntry.message)} - ${chalk.magenta(cherryPick.url)}`
        );
      }
      for (const followUp of dbEntry.followUps) {
        this.logger.log(
          `[follow-up] - ${firstLine(followUp.message)} - ${chalk.yellow(followUp.url)}`
        );
      }
      for (const revert of dbEntry.reverts) {
        this.logger.log(
          `[revert] - ${firstLine(revert.message)} - ${chalk.red(revert.url)}`
        );
      }
      return {
        id: 'DRY-007',
        type: 'Bug',
        url: 'https://redhat.atlassian.net/browse/DRY-007',
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
        // set severity to "Low"
        [this.fields.severity]: {
          id: '19920',
        },
        labels: labels,
        components: [
          {
            name: component,
          },
        ],
        versions: [{ name: version }],
        security: {
          id: '10036',
          name: 'Red Hat Engineering Authorized',
        },
        [this.fields.epic]: epic,
      },
    });

    await this.createAllExternalLinks(issue.key, dbEntry);

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
    const linkTitle = `[${type}] - ${firstLine(title)}`;

    this.logger.log(
      `Creating external link: ${linkTitle} - ${chalk.blue(url)}`
    );

    if (this.dry) return;

    await this.api.issueRemoteLinks.createOrUpdateRemoteIssueLink({
      issueIdOrKey: issue,
      object: {
        title: linkTitle,
        url,
        icon: {
          title: 'GitHub',
          url16x16: 'https://github.githubassets.com/favicon.ico',
        },
      },
    });
  }

  async getIssueTracker(issueKey: string): Promise<TrackerDb> {
    if (this.dry) {
      return {
        id: issueKey,
        type: 'Bug',
        url: this.getIssueURL(issueKey),
        status: 'New',
        statusCategory: 'To Do',
        versions: [],
        summary: '',
      };
    }

    const issue = await this.api.issues.getIssue({
      issueIdOrKey: issueKey,
      fields: ['issuetype', 'status', 'summary', 'versions'],
    });

    return {
      id: issue.key,
      type: issue.fields.issuetype?.name ?? 'Bug',
      url: this.getIssueURL(issue.key),
      status: issue.fields.status.name ?? 'New',
      statusCategory: issue.fields.status.statusCategory?.name ?? 'To Do',
      versions:
        (issue.fields.versions as { name: string }[])?.map(v => v.name) ?? [],
      summary: issue.fields.summary ?? '',
    };
  }

  async transitionIssue(issue: string, status: 'In Progress') {
    this.logger.log(
      `Transitioning issue ${chalk.blue(issue)} to ${chalk.yellow(status)}`
    );

    if (this.dry) return;

    await this.api.issues.doTransition({
      issueIdOrKey: issue,
      transition: {
        id: '111',
      },
    });
  }

  async createAllExternalLinks(issueKey: string, dbEntry: CommitDb) {
    await this.createExternalLink(
      issueKey,
      'backport',
      firstLine(dbEntry.message),
      dbEntry.url
    );

    for (const cherryPick of dbEntry.cherryPicks) {
      await this.createExternalLink(
        issueKey,
        'cherry-pick',
        firstLine(dbEntry.message),
        cherryPick.url
      );
    }

    for (const followUp of dbEntry.followUps) {
      await this.createExternalLink(
        issueKey,
        'follow-up',
        followUp.message,
        followUp.url
      );
    }

    for (const revert of dbEntry.reverts) {
      await this.createExternalLink(
        issueKey,
        'revert',
        revert.message,
        revert.url
      );
    }
  }

  async recreateRemoteLinks(toIssue: string, dbEntry: CommitDb) {
    this.logger.log(
      `Recreating remote links on ${chalk.blue(toIssue)} from db entry`
    );

    await this.createAllExternalLinks(toIssue, dbEntry);
  }

  async getCloneIssue(issue: string, release: string) {
    const issueResponse = await this.api.issues.getIssue({
      issueIdOrKey: issue,
      fields: ['issuelinks'],
    });

    return issueResponse.fields.issuelinks?.find(
      link =>
        link.type?.outward === 'clones' &&
        link.inwardIssue?.fields?.summary?.includes(`[rhel-${release}]`) &&
        link.inwardIssue?.fields?.status?.statusCategory?.name === 'To Do'
    );
  }

  async cloneIssue(issue: string, release: string) {
    if (this.dry) {
      this.logger.log(`Would clone issue ${chalk.blue(issue)}`);
      return `DRY-CLONE-${issue}`;
    }

    // check if the issue is already cloned
    const cloneIssue = await this.getCloneIssue(issue, release);
    if (cloneIssue?.inwardIssue?.key) {
      return cloneIssue.inwardIssue.key;
    }

    const requestCloneValue = this.cloneOptions.find(
      option => option.rhel === release
    )?.value;

    if (!requestCloneValue) {
      throw new Error(`Request clone value not found for release ${release}`);
    }

    this.logger.log(
      `Cloning issue ${chalk.blue(issue)} for release ${release}`
    );
    await this.api.issues.editIssue({
      issueIdOrKey: issue,
      fields: {
        [this.fields.requestClones]: { id: String(requestCloneValue) },
      },
    });

    // wait for clone to be created and then return key of the clone
    for (let attempt = 1; attempt <= 10; attempt++) {
      const cloneIssue = await this.getCloneIssue(issue, release);
      if (cloneIssue?.inwardIssue?.key) {
        return cloneIssue.inwardIssue.key;
      }

      if (attempt < 10) {
        this.logger.log(`Waiting for clone to be created...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    return undefined;
  }
}
