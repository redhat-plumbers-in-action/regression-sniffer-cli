import { Jira } from './jira';
import { JiraIssue } from './schema/jira';

export class Tracker {
  constructor(
    readonly data: JiraIssue['tracker'],
    readonly api: Jira
  ) {}

  get isOpen() {
    return this.data.statusCategory === 'To Do';
  }

  get isInProgress() {
    return this.data.statusCategory === 'In Progress';
  }

  get isDone() {
    return this.data.statusCategory === 'Done';
  }

  async createExternalLink(
    type: 'follow-up' | 'revert' | 'cherry-pick' | 'backport',
    title: string,
    url: string
  ) {
    await this.api.createExternalLink(this.data.id, type, title, url);
  }

  // async transferToInProgress() {
  //   await this.api.updateIssue(this.data.id, {
  //     fields: {
  //       status: {
  //         name: 'In Progress',
  //       },
  //     },
  //   });
  // }
}
