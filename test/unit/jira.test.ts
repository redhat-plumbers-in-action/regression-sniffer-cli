import { afterEach, beforeEach, describe, expect, it, test, vi } from 'vitest';

import { Jira } from '../../src/jira';
import { Logger } from '../../src/logger';
import { CommitDb } from '../../src/schema/db';

const mockApi = {
  serverInfo: {
    getServerInfo: vi.fn(),
  },
  issueSearch: {
    searchForIssuesUsingJqlEnhancedSearchPost: vi.fn(),
  },
  issueRemoteLinks: {
    getRemoteIssueLinks: vi.fn(),
    createOrUpdateRemoteIssueLink: vi.fn(),
  },
  issues: {
    createIssue: vi.fn(),
    getIssue: vi.fn(),
    editIssue: vi.fn(),
    doTransition: vi.fn(),
  },
};

vi.mock('jira.js', () => {
  return {
    Version3Client: class {
      serverInfo = mockApi.serverInfo;
      issueSearch = mockApi.issueSearch;
      issueRemoteLinks = mockApi.issueRemoteLinks;
      issues = mockApi.issues;
    },
  };
});

function createLogger(): Logger {
  const logger = new Logger(true);
  vi.spyOn(logger, 'log').mockImplementation(() => {});
  return logger;
}

function createJira(dry = false): Jira {
  return new Jira(
    'https://issues.example.com',
    'user@example.com',
    'mock-token-value',
    dry,
    createLogger()
  );
}

function createDbEntry(overrides: Partial<CommitDb> = {}): CommitDb {
  return {
    sha: 'abc123def456',
    url: 'https://github.com/example/project/commit/abc123def456',
    cherryPicks: [
      {
        sha: 'cherry123',
        url: 'https://github.com/example/project/commit/cherry123',
      },
    ],
    message:
      'Fix resource cleanup on shutdown\n\nSigned-off-by: Dev <dev@example.org>',
    followUps: [
      {
        sha: 'followup456',
        message: 'Follow-up: handle additional cleanup paths',
        url: 'https://github.com/upstream/project/commit/followup456',
        waived: false,
      },
    ],
    reverts: [
      {
        sha: 'revert789',
        message: 'Revert "Fix resource cleanup on shutdown"',
        url: 'https://github.com/upstream/project/commit/revert789',
        waived: false,
      },
    ],
    ...overrides,
  };
}

describe('Jira class', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('can be instantiated', () => {
    const jira = createJira();

    expect(jira).toBeDefined();
    expect(jira).toBeInstanceOf(Jira);
    expect(jira.instance).toBe('https://issues.example.com');
    expect(jira.dry).toBe(false);
  });

  test('getIssueURL()', () => {
    const jira = createJira();

    expect(jira.getIssueURL('PROJ-123')).toBe(
      'https://issues.example.com/browse/PROJ-123'
    );
    expect(jira.getIssueURL('PROJ-9999')).toBe(
      'https://issues.example.com/browse/PROJ-9999'
    );
  });

  test('getVersion()', async () => {
    const jira = createJira();
    mockApi.serverInfo.getServerInfo.mockResolvedValue({
      version: '9.4.0',
    });

    const version = await jira.getVersion();
    expect(version).toBe('9.4.0');
    expect(mockApi.serverInfo.getServerInfo).toHaveBeenCalledTimes(1);
  });

  test('getVersion() - throws when version is missing', async () => {
    const jira = createJira();
    mockApi.serverInfo.getServerInfo.mockResolvedValue({});

    await expect(jira.getVersion()).rejects.toThrow();
  });

  describe('getFollowUpIssues()', () => {
    test('returns empty array when no issues found', async () => {
      const jira = createJira();
      mockApi.issueSearch.searchForIssuesUsingJqlEnhancedSearchPost.mockResolvedValue(
        {
          issues: [],
        }
      );

      const result = await jira.getFollowUpIssues('component-a', 'label-a');

      expect(result).toEqual([]);
    });

    test('returns parsed issues with remote links', async () => {
      const jira = createJira();

      mockApi.issueSearch.searchForIssuesUsingJqlEnhancedSearchPost.mockResolvedValue(
        {
          issues: [
            {
              key: 'PROJ-100',
              fields: {
                issuetype: { name: 'Bug' },
                status: { name: 'New', statusCategory: { name: 'To Do' } },
                summary: '[follow-up to] - Fix resource cleanup',
                labels: ['component-followup'],
                versions: [{ name: 'CentOS Stream 9' }],
                customfield_10014: { value: 'EPIC-1' },
              },
            },
          ],
          nextPageToken: undefined,
        }
      );

      mockApi.issueRemoteLinks.getRemoteIssueLinks.mockResolvedValue([
        {
          object: {
            title: '[backport] - Fix resource cleanup',
            url: 'https://github.com/example/project/commit/abc123',
          },
        },
        {
          object: {
            title: '[follow-up] - Handle edge case',
            url: 'https://github.com/upstream/project/commit/def456',
          },
        },
      ]);

      const result = await jira.getFollowUpIssues(
        'component-a',
        'component-followup'
      );

      expect(result).toHaveLength(1);
      expect(result[0].sha).toBe('abc123');
      expect(result[0].followUp).toHaveLength(1);
      expect(result[0].tracker.id).toBe('PROJ-100');
      expect(result[0].tracker.statusCategory).toBe('To Do');
    });

    test('handles pagination', async () => {
      const jira = createJira();

      mockApi.issueSearch.searchForIssuesUsingJqlEnhancedSearchPost
        .mockResolvedValueOnce({
          issues: [
            {
              key: 'PROJ-1',
              fields: {
                issuetype: { name: 'Bug' },
                status: { name: 'New', statusCategory: { name: 'To Do' } },
                summary: 'Issue 1',
                labels: ['label-a'],
                versions: [{ name: 'CentOS Stream 9' }],
                customfield_10014: undefined,
              },
            },
          ],
          nextPageToken: 'page2',
        })
        .mockResolvedValueOnce({
          issues: [
            {
              key: 'PROJ-2',
              fields: {
                issuetype: { name: 'Bug' },
                status: { name: 'New', statusCategory: { name: 'To Do' } },
                summary: 'Issue 2',
                labels: ['label-a'],
                versions: [{ name: 'CentOS Stream 9' }],
                customfield_10014: undefined,
              },
            },
          ],
          nextPageToken: undefined,
        });

      mockApi.issueRemoteLinks.getRemoteIssueLinks.mockResolvedValue([
        {
          object: {
            title: '[backport] - Some commit',
            url: 'https://github.com/example/project/commit/aaa111',
          },
        },
      ]);

      const result = await jira.getFollowUpIssues('component-a', 'label-a');

      expect(result).toHaveLength(2);
      expect(
        mockApi.issueSearch.searchForIssuesUsingJqlEnhancedSearchPost
      ).toHaveBeenCalledTimes(2);
    });
  });

  describe('createIssue()', () => {
    test('dry run returns mock tracker', async () => {
      const jira = createJira(true);
      const entry = createDbEntry();

      const tracker = await jira.createIssue(
        '9',
        'component-a',
        'EPIC-1',
        entry
      );

      expect(tracker).toBeDefined();
      expect(tracker?.id).toBe('DRY-007');
      expect(tracker?.type).toBe('Bug');
      expect(tracker?.statusCategory).toBe('To Do');
      expect(tracker?.versions).toContain('CentOS Stream 9');
      expect(mockApi.issues.createIssue).not.toHaveBeenCalled();
    });

    test('creates issue and remote links', async () => {
      const jira = createJira(false);
      const entry = createDbEntry();

      mockApi.issues.createIssue.mockResolvedValue({
        key: 'PROJ-500',
        self: 'https://issues.example.com/rest/api/3/issue/PROJ-500',
      });
      mockApi.issueRemoteLinks.createOrUpdateRemoteIssueLink.mockResolvedValue(
        {}
      );

      const tracker = await jira.createIssue(
        '9',
        'component-a',
        'EPIC-1',
        entry
      );

      expect(tracker).toBeDefined();
      expect(tracker?.id).toBe('PROJ-500');
      expect(mockApi.issues.createIssue).toHaveBeenCalledTimes(1);
      // backport + 1 cherry-pick + 1 follow-up + 1 revert = 4 links
      expect(
        mockApi.issueRemoteLinks.createOrUpdateRemoteIssueLink
      ).toHaveBeenCalledTimes(4);
    });

    test('handles release parsing for version string', async () => {
      const jira = createJira(true);
      const entry = createDbEntry();

      const tracker = await jira.createIssue(
        '10',
        'component-a',
        'EPIC-1',
        entry
      );
      expect(tracker?.versions).toContain('CentOS Stream 10');
    });

    test('defaults to version 10 for invalid release', async () => {
      const jira = createJira(true);
      const entry = createDbEntry();

      const tracker = await jira.createIssue(
        'invalid',
        'component-a',
        'EPIC-1',
        entry
      );
      expect(tracker?.versions).toContain('CentOS Stream 10');
    });
  });

  describe('createExternalLink()', () => {
    test('dry run skips API call', async () => {
      const jira = createJira(true);

      await jira.createExternalLink(
        'PROJ-100',
        'follow-up',
        'Fix edge case',
        'https://github.com/upstream/project/commit/abc123'
      );

      expect(
        mockApi.issueRemoteLinks.createOrUpdateRemoteIssueLink
      ).not.toHaveBeenCalled();
    });

    test('creates remote link via API', async () => {
      const jira = createJira(false);
      mockApi.issueRemoteLinks.createOrUpdateRemoteIssueLink.mockResolvedValue(
        {}
      );

      await jira.createExternalLink(
        'PROJ-100',
        'revert',
        'Revert bad commit',
        'https://github.com/upstream/project/commit/def456'
      );

      expect(
        mockApi.issueRemoteLinks.createOrUpdateRemoteIssueLink
      ).toHaveBeenCalledTimes(1);
      expect(
        mockApi.issueRemoteLinks.createOrUpdateRemoteIssueLink
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          issueIdOrKey: 'PROJ-100',
          object: expect.objectContaining({
            url: 'https://github.com/upstream/project/commit/def456',
          }),
        })
      );
    });
  });

  describe('getIssueTracker()', () => {
    test('dry run returns mock tracker', async () => {
      const jira = createJira(true);

      const tracker = await jira.getIssueTracker('PROJ-100');

      expect(tracker.id).toBe('PROJ-100');
      expect(tracker.status).toBe('New');
      expect(tracker.statusCategory).toBe('To Do');
      expect(mockApi.issues.getIssue).not.toHaveBeenCalled();
    });

    test('fetches issue from API', async () => {
      const jira = createJira(false);
      mockApi.issues.getIssue.mockResolvedValue({
        key: 'PROJ-100',
        fields: {
          issuetype: { name: 'Bug' },
          status: {
            name: 'In Progress',
            statusCategory: { name: 'In Progress' },
          },
          summary: '[follow-up to] - Fix issue',
          versions: [{ name: 'CentOS Stream 9' }],
        },
      });

      const tracker = await jira.getIssueTracker('PROJ-100');

      expect(tracker.id).toBe('PROJ-100');
      expect(tracker.type).toBe('Bug');
      expect(tracker.status).toBe('In Progress');
      expect(tracker.statusCategory).toBe('In Progress');
      expect(tracker.versions).toEqual(['CentOS Stream 9']);
      expect(tracker.summary).toBe('[follow-up to] - Fix issue');
    });
  });

  describe('transitionIssue()', () => {
    test('dry run skips API call', async () => {
      const jira = createJira(true);

      await jira.transitionIssue('PROJ-100', 'In Progress');

      expect(mockApi.issues.doTransition).not.toHaveBeenCalled();
    });

    test('calls doTransition API', async () => {
      const jira = createJira(false);
      mockApi.issues.doTransition.mockResolvedValue({});

      await jira.transitionIssue('PROJ-100', 'In Progress');

      expect(mockApi.issues.doTransition).toHaveBeenCalledWith({
        issueIdOrKey: 'PROJ-100',
        transition: { id: '111' },
      });
    });
  });

  describe('recreateRemoteLinks()', () => {
    test('creates links for backport, cherry-picks, follow-ups, and reverts', async () => {
      const jira = createJira(false);
      mockApi.issueRemoteLinks.createOrUpdateRemoteIssueLink.mockResolvedValue(
        {}
      );

      const entry = createDbEntry();
      await jira.recreateRemoteLinks('PROJ-200', entry);

      // backport + 1 cherry-pick + 1 follow-up + 1 revert = 4
      expect(
        mockApi.issueRemoteLinks.createOrUpdateRemoteIssueLink
      ).toHaveBeenCalledTimes(4);
    });

    test('handles entry with no cherry-picks, follow-ups, or reverts', async () => {
      const jira = createJira(false);
      mockApi.issueRemoteLinks.createOrUpdateRemoteIssueLink.mockResolvedValue(
        {}
      );

      const entry = createDbEntry({
        cherryPicks: [],
        followUps: [],
        reverts: [],
      });
      await jira.recreateRemoteLinks('PROJ-200', entry);

      // Only backport link
      expect(
        mockApi.issueRemoteLinks.createOrUpdateRemoteIssueLink
      ).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCloneIssue()', () => {
    test('finds clone issue matching release', async () => {
      const jira = createJira(false);
      mockApi.issues.getIssue.mockResolvedValue({
        fields: {
          issuelinks: [
            {
              type: { outward: 'clones' },
              inwardIssue: {
                key: 'PROJ-300',
                fields: {
                  summary: 'Clone [rhel-9] something',
                  status: { statusCategory: { name: 'To Do' } },
                },
              },
            },
          ],
        },
      });

      const clone = await jira.getCloneIssue('PROJ-100', '9');

      expect(clone).toBeDefined();
      expect(clone?.inwardIssue?.key).toBe('PROJ-300');
    });

    test('returns undefined when no matching clone', async () => {
      const jira = createJira(false);
      mockApi.issues.getIssue.mockResolvedValue({
        fields: {
          issuelinks: [
            {
              type: { outward: 'is blocked by' },
              inwardIssue: {
                key: 'PROJ-400',
                fields: {
                  summary: 'Unrelated issue',
                  status: { statusCategory: { name: 'To Do' } },
                },
              },
            },
          ],
        },
      });

      const clone = await jira.getCloneIssue('PROJ-100', '9');
      expect(clone).toBeUndefined();
    });
  });

  describe('cloneIssue()', () => {
    test('dry run returns mock key', async () => {
      const jira = createJira(true);

      const result = await jira.cloneIssue('PROJ-100', '9');

      expect(result).toBe('DRY-CLONE-PROJ-100');
      expect(mockApi.issues.editIssue).not.toHaveBeenCalled();
    });

    test('returns existing clone if already exists', async () => {
      const jira = createJira(false);
      mockApi.issues.getIssue.mockResolvedValue({
        fields: {
          issuelinks: [
            {
              type: { outward: 'clones' },
              inwardIssue: {
                key: 'PROJ-300',
                fields: {
                  summary: 'Clone [rhel-9] something',
                  status: { statusCategory: { name: 'To Do' } },
                },
              },
            },
          ],
        },
      });

      const result = await jira.cloneIssue('PROJ-100', '9');

      expect(result).toBe('PROJ-300');
      expect(mockApi.issues.editIssue).not.toHaveBeenCalled();
    });

    test('throws for unsupported release', async () => {
      const jira = createJira(false);
      mockApi.issues.getIssue.mockResolvedValue({
        fields: { issuelinks: [] },
      });

      await expect(jira.cloneIssue('PROJ-100', '7')).rejects.toThrow(
        'Request clone value not found for release 7'
      );
    });

    test('returns undefined when clone is not created after max retries', async () => {
      vi.useFakeTimers();
      const jira = createJira(false);
      mockApi.issues.getIssue.mockResolvedValue({
        fields: { issuelinks: [] },
      });
      mockApi.issues.editIssue.mockResolvedValue({});

      const promise = jira.cloneIssue('PROJ-100', '9');

      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(5000);
      }

      const result = await promise;
      expect(result).toBeUndefined();
      expect(mockApi.issues.editIssue).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });

    test('triggers clone and waits for it to appear', async () => {
      vi.useFakeTimers();
      const jira = createJira(false);
      let callCount = 0;

      mockApi.issues.getIssue.mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.resolve({ fields: { issuelinks: [] } });
        }
        return Promise.resolve({
          fields: {
            issuelinks: [
              {
                type: { outward: 'clones' },
                inwardIssue: {
                  key: 'PROJ-350',
                  fields: {
                    summary: 'Clone [rhel-10] something',
                    status: { statusCategory: { name: 'To Do' } },
                  },
                },
              },
            ],
          },
        });
      });
      mockApi.issues.editIssue.mockResolvedValue({});

      const promise = jira.cloneIssue('PROJ-100', '10');

      for (let i = 0; i < 3; i++) {
        await vi.advanceTimersByTimeAsync(5000);
      }

      const result = await promise;
      expect(result).toBe('PROJ-350');
      expect(mockApi.issues.editIssue).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });
  });

  describe('getFollowUpIssues() - batch remote links', () => {
    test('handles remote link fetch failures gracefully', async () => {
      vi.useFakeTimers();
      const jira = createJira();

      mockApi.issueSearch.searchForIssuesUsingJqlEnhancedSearchPost.mockResolvedValue(
        {
          issues: [
            {
              key: 'PROJ-1',
              fields: {
                issuetype: { name: 'Bug' },
                status: { name: 'New', statusCategory: { name: 'To Do' } },
                summary: 'Issue 1',
                labels: ['label-a'],
                versions: [{ name: 'CentOS Stream 9' }],
                customfield_10014: undefined,
              },
            },
          ],
          nextPageToken: undefined,
        }
      );

      mockApi.issueRemoteLinks.getRemoteIssueLinks
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'));

      const promise = jira.getFollowUpIssues('component', 'label');

      for (let i = 0; i < 3; i++) {
        await vi.advanceTimersByTimeAsync(5000);
      }

      const result = await promise;

      expect(result).toHaveLength(1);
      expect(result[0].sha).toBe('');
      vi.useRealTimers();
    });
  });

  describe('createAllExternalLinks()', () => {
    test('creates links for all entry types', async () => {
      const jira = createJira(false);
      mockApi.issueRemoteLinks.createOrUpdateRemoteIssueLink.mockResolvedValue(
        {}
      );

      const entry = createDbEntry({
        cherryPicks: [
          { sha: 'cp1', url: 'https://github.com/org/repo/commit/cp1' },
          { sha: 'cp2', url: 'https://github.com/org/repo/commit/cp2' },
        ],
        followUps: [
          {
            sha: 'fu1',
            message: 'Follow-up 1',
            url: 'https://github.com/org/repo/commit/fu1',
            waived: false,
          },
        ],
        reverts: [],
      });

      await jira.recreateRemoteLinks('PROJ-500', entry);

      // backport + 2 cherry-picks + 1 follow-up = 4 links
      expect(
        mockApi.issueRemoteLinks.createOrUpdateRemoteIssueLink
      ).toHaveBeenCalledTimes(4);
    });
  });
});
