import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- Constants: 40-char hex SHAs for realistic mock data ---

// Upstream original commits (cherry-picked into downstream)
const UPSTREAM_SHA_1 = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0';
const UPSTREAM_SHA_2 = 'b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0';
const UPSTREAM_SHA_3 = 'c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0';
const UPSTREAM_SHA_4 = 'd1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0';

// Downstream commit SHAs
const DOWN_COMMIT_1 = 'da00000000000000000000000000000000000001';
const DOWN_COMMIT_2 = 'db00000000000000000000000000000000000002';
const DOWN_COMMIT_3 = 'dc00000000000000000000000000000000000003';
const DOWN_COMMIT_4 = 'dd00000000000000000000000000000000000004';

// Follow-up SHAs
const FOLLOWUP_KNOWN_1 = 'f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0';
const FOLLOWUP_NEW_1 = 'f3c4d5e6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2';
const FOLLOWUP_KNOWN_2 = 'f2b3c4d5e6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1';
const FOLLOWUP_NEW_2 = 'f4d5e6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3';
const FOLLOWUP_BRAND_NEW = 'f5e6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4';
const FOLLOWUP_WAIVED = 'f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5';

const DOWNSTREAM_ORG = 'testorg';
const DOWNSTREAM_REPO = 'downstream-project';
const UPSTREAM_ORG = 'testorg';
const UPSTREAM_REPO = 'upstream-project';

const DOWNSTREAM_DIR = `abc_${DOWNSTREAM_ORG}-${DOWNSTREAM_REPO}_cba`;
const UPSTREAM_DIR = `abc_${UPSTREAM_ORG}-${UPSTREAM_REPO}_cba`;

function downstreamUrl(sha: string) {
  return `https://github.com/${DOWNSTREAM_ORG}/${DOWNSTREAM_REPO}/commit/${sha}`;
}
function upstreamUrl(sha: string) {
  return `https://github.com/${UPSTREAM_ORG}/${UPSTREAM_REPO}/commit/${sha}`;
}

// --- Mocks setup ---

const mocks = vi.hoisted(() => ({
  execSync: vi.fn(),
  existsSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execSync: mocks.execSync,
}));

vi.mock('node:fs', () => ({
  existsSync: mocks.existsSync,
  writeFileSync: mocks.writeFileSync,
  readFileSync: mocks.readFileSync,
  mkdirSync: mocks.mkdirSync,
}));

vi.mock('cli-progress', () => ({
  default: {
    SingleBar: class {
      start() {}
      update() {}
      stop() {}
    },
  },
}));

vi.mock('@actions/core', () => ({
  info: vi.fn(),
  warning: vi.fn(),
}));

// --- Jira API mock ---

const jiraApi = {
  serverInfo: { getServerInfo: vi.fn() },
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

vi.mock('jira.js', () => ({
  Version3Client: class {
    serverInfo = jiraApi.serverInfo;
    issueSearch = jiraApi.issueSearch;
    issueRemoteLinks = jiraApi.issueRemoteLinks;
    issues = jiraApi.issues;
  },
}));

// --- Octokit mock ---

const octokitRequest = vi.fn();

vi.mock('@octokit/core', () => ({
  Octokit: {
    plugin: () =>
      class {
        request = octokitRequest;
      },
  },
}));

vi.mock('@octokit/plugin-throttling', () => ({
  throttling: {},
}));

// --- Downstream commit messages ---

const downstreamMessages: Record<string, string> = {
  [DOWN_COMMIT_1]: `Fix memory leak in event loop\n\nSigned-off-by: Dev <dev@example.org>\n(cherry picked from commit ${UPSTREAM_SHA_1})\n`,
  [DOWN_COMMIT_2]: `Fix race condition in service manager\n\nSigned-off-by: Dev <dev@example.org>\n(cherry picked from commit ${UPSTREAM_SHA_2})\n`,
  [DOWN_COMMIT_3]: `Add error handling for dbus timeout\n\nSigned-off-by: Dev <dev@example.org>\n(cherry picked from commit ${UPSTREAM_SHA_3})\n`,
  [DOWN_COMMIT_4]: `Fix signal handling in shutdown path\n\nSigned-off-by: Dev <dev@example.org>\n(cherry picked from commit ${UPSTREAM_SHA_4})\n`,
};

const followUpMessages: Record<string, string> = {
  [FOLLOWUP_KNOWN_1]: 'Fix additional edge case in event loop cleanup',
  [FOLLOWUP_NEW_1]: 'Follow-up: handle nested event callbacks properly',
  [FOLLOWUP_KNOWN_2]: 'Address race in service restart path',
  [FOLLOWUP_NEW_2]: 'Follow-up: fix ordering issue in service stop',
  [FOLLOWUP_BRAND_NEW]: 'Follow-up: validate dbus message before dispatch',
  [FOLLOWUP_WAIVED]: 'Follow-up: cosmetic fix for signal handler logging',
};

// --- execSync mock implementation ---

function mockExecSync(command: string): string {
  // git clone commands - just succeed
  if (command.startsWith('git clone')) return '';

  // rm -rf commands
  if (command.startsWith('rm -rf')) return '';

  // Downstream grepLog for cherry-picks (looking for all backported commits)
  if (command.includes(`-C ${DOWNSTREAM_DIR}`) && command.includes('log')) {
    return [DOWN_COMMIT_1, DOWN_COMMIT_2, DOWN_COMMIT_3, DOWN_COMMIT_4].join(
      '\n'
    );
  }

  // Downstream getCommitMessage
  if (command.includes(`-C ${DOWNSTREAM_DIR}`) && command.includes('show')) {
    const sha = command.split(' ').pop()!;
    return downstreamMessages[sha] ?? '';
  }

  // Upstream grepLog for follow-ups/reverts
  if (command.includes(`-C ${UPSTREAM_DIR}`) && command.includes('log')) {
    // Determine which SHA is being searched for by checking the --grep regex
    if (command.includes(UPSTREAM_SHA_1)) {
      if (command.includes('revert')) return '';
      return [FOLLOWUP_KNOWN_1, FOLLOWUP_NEW_1].join('\n');
    }
    if (command.includes(UPSTREAM_SHA_2)) {
      if (command.includes('revert')) return '';
      return [FOLLOWUP_KNOWN_2, FOLLOWUP_NEW_2].join('\n');
    }
    if (command.includes(UPSTREAM_SHA_3)) {
      if (command.includes('revert')) return '';
      return FOLLOWUP_BRAND_NEW;
    }
    if (command.includes(UPSTREAM_SHA_4)) {
      if (command.includes('revert')) return '';
      return FOLLOWUP_WAIVED;
    }
    return '';
  }

  // Upstream getCommitMessage
  if (command.includes(`-C ${UPSTREAM_DIR}`) && command.includes('show')) {
    const sha = command.split(' ').pop()!;
    return followUpMessages[sha] ?? '';
  }

  return '';
}

// --- GitHub API mock data ---

function mockOctokitRequest(route: string, params: any) {
  // PR lookup for each downstream commit
  if (route === 'GET /repos/{owner}/{repo}/commits/{commit_sha}/pulls') {
    const sha = params.commit_sha;

    if (sha === DOWN_COMMIT_1) {
      return {
        data: [
          {
            number: 10,
            title: 'Backport: Fix memory leak',
            body: 'Backport for event loop fix',
            html_url: `https://github.com/${DOWNSTREAM_ORG}/${DOWNSTREAM_REPO}/pull/10`,
            labels: [],
          },
        ],
      };
    }

    if (sha === DOWN_COMMIT_2) {
      return {
        data: [
          {
            number: 20,
            title: 'Backport: Fix race condition',
            body: 'Backport for service manager',
            html_url: `https://github.com/${DOWNSTREAM_ORG}/${DOWNSTREAM_REPO}/pull/20`,
            labels: [],
          },
        ],
      };
    }

    if (sha === DOWN_COMMIT_3) {
      return {
        data: [
          {
            number: 30,
            title: 'Backport: Add error handling',
            body: 'Backport for dbus timeout',
            html_url: `https://github.com/${DOWNSTREAM_ORG}/${DOWNSTREAM_REPO}/pull/30`,
            labels: [],
          },
        ],
      };
    }

    if (sha === DOWN_COMMIT_4) {
      return {
        data: [
          {
            number: 40,
            title: 'Backport: Fix signal handling',
            body: `Backport for shutdown path\n<!-- issue-commentator = {"comment-id":"99999"} -->`,
            html_url: `https://github.com/${DOWNSTREAM_ORG}/${DOWNSTREAM_REPO}/pull/40`,
            labels: [{ name: 'follow-up-waived' }],
          },
        ],
      };
    }

    return { data: [] };
  }

  // Comment fetch for waived PR
  if (route === 'GET /repos/{owner}/{repo}/issues/comments/{comment_id}') {
    if (params.comment_id === 99999) {
      return {
        data: {
          body: `Follow-ups detected and waived.\n<!-- regression-sniffer = ["${FOLLOWUP_WAIVED}"] -->`,
        },
      };
    }
    return { data: { body: '' } };
  }

  return { data: [] };
}

// --- Jira API mock data ---

function setupJiraMocks() {
  // getFollowUpIssues → searchForIssuesUsingJqlEnhancedSearchPost
  jiraApi.issueSearch.searchForIssuesUsingJqlEnhancedSearchPost.mockResolvedValue(
    {
      issues: [
        {
          key: 'PROJ-100',
          fields: {
            issuetype: { name: 'Bug' },
            status: {
              name: 'In Progress',
              statusCategory: { name: 'In Progress' },
            },
            summary: '[follow-up to] - Fix memory leak in event loop',
            labels: ['test-component-followup'],
            versions: [{ name: 'CentOS Stream 9' }],
            customfield_10014: undefined,
          },
        },
        {
          key: 'PROJ-200',
          fields: {
            issuetype: { name: 'Bug' },
            status: { name: 'Closed', statusCategory: { name: 'Done' } },
            summary: '[follow-up to] - Fix race condition in service manager',
            labels: ['test-component-followup'],
            versions: [{ name: 'CentOS Stream 9' }],
            customfield_10014: undefined,
          },
        },
      ],
      nextPageToken: undefined,
    }
  );

  // getRemoteIssueLinks for PROJ-100
  jiraApi.issueRemoteLinks.getRemoteIssueLinks.mockImplementation(
    ({ issueIdOrKey }: { issueIdOrKey: string }) => {
      if (issueIdOrKey === 'PROJ-100') {
        return Promise.resolve([
          {
            object: {
              title: '[backport] - Fix memory leak in event loop',
              url: downstreamUrl(DOWN_COMMIT_1),
            },
          },
          {
            object: {
              title: '[cherry-pick] - Fix memory leak in event loop',
              url: upstreamUrl(UPSTREAM_SHA_1),
            },
          },
          {
            object: {
              title: `[follow-up] - ${followUpMessages[FOLLOWUP_KNOWN_1]}`,
              url: upstreamUrl(FOLLOWUP_KNOWN_1),
            },
          },
        ]);
      }

      if (issueIdOrKey === 'PROJ-200') {
        return Promise.resolve([
          {
            object: {
              title: '[backport] - Fix race condition in service manager',
              url: downstreamUrl(DOWN_COMMIT_2),
            },
          },
          {
            object: {
              title: '[cherry-pick] - Fix race condition in service manager',
              url: upstreamUrl(UPSTREAM_SHA_2),
            },
          },
          {
            object: {
              title: `[follow-up] - ${followUpMessages[FOLLOWUP_KNOWN_2]}`,
              url: upstreamUrl(FOLLOWUP_KNOWN_2),
            },
          },
        ]);
      }

      return Promise.resolve([]);
    }
  );

  // createOrUpdateRemoteIssueLink - just succeed
  jiraApi.issueRemoteLinks.createOrUpdateRemoteIssueLink.mockResolvedValue({});

  // createIssue - for brand new issues
  jiraApi.issues.createIssue.mockResolvedValue({
    key: 'PROJ-400',
    self: 'https://issues.example.com/rest/api/3/issue/PROJ-400',
  });

  // getIssue - for cloneIssue flow
  let cloneAttempt = 0;
  jiraApi.issues.getIssue.mockImplementation(
    ({ issueIdOrKey }: { issueIdOrKey: string }) => {
      if (issueIdOrKey === 'PROJ-200') {
        cloneAttempt++;
        if (cloneAttempt === 1) {
          // First call: no clone exists yet
          return Promise.resolve({ fields: { issuelinks: [] } });
        }
        // Subsequent: clone created
        return Promise.resolve({
          fields: {
            issuelinks: [
              {
                type: { outward: 'clones' },
                inwardIssue: {
                  key: 'PROJ-300',
                  fields: {
                    summary:
                      '[rhel-9] [follow-up to] - Fix race condition in service manager',
                    status: { statusCategory: { name: 'To Do' } },
                  },
                },
              },
            ],
          },
        });
      }

      // getIssueTracker for PROJ-300
      if (issueIdOrKey === 'PROJ-300') {
        return Promise.resolve({
          key: 'PROJ-300',
          fields: {
            issuetype: { name: 'Bug' },
            status: { name: 'New', statusCategory: { name: 'To Do' } },
            summary:
              '[rhel-9] [follow-up to] - Fix race condition in service manager',
            versions: [{ name: 'CentOS Stream 9' }],
          },
        });
      }

      return Promise.resolve({ fields: { issuelinks: [] } });
    }
  );

  // editIssue - for triggering clone
  jiraApi.issues.editIssue.mockResolvedValue({});
}

// --- Test ---

describe('Integration: runProgram', () => {
  let originalArgv: string[];

  beforeEach(() => {
    vi.clearAllMocks();

    originalArgv = process.argv;
    process.argv = [
      'node',
      'regression-sniffer',
      '-c',
      'test-component',
      '-r',
      '9',
      '-e',
      'EPIC-TEST-1',
      '-d',
      `${DOWNSTREAM_ORG}/${DOWNSTREAM_REPO}`,
      '-u',
      `${UPSTREAM_ORG}/${UPSTREAM_REPO}`,
      '-l',
      'user@example.com',
      '-f',
      'v255',
      '-n',
    ];

    vi.stubEnv('JIRA_API_TOKEN', 'mock-jira-token');
    vi.stubEnv('GITHUB_API_TOKEN', 'mock-github-token');
    vi.stubEnv('NODEFAULTS', 'true');

    mocks.existsSync.mockReturnValue(false);
    mocks.writeFileSync.mockImplementation(() => {});
    mocks.execSync.mockImplementation((cmd: string) => mockExecSync(cmd));

    octokitRequest.mockImplementation((route: string, params: any) =>
      mockOctokitRequest(route, params)
    );

    setupJiraMocks();
  });

  afterEach(() => {
    process.argv = originalArgv;
    vi.unstubAllEnvs();
    vi.resetAllMocks();
  });

  it('processes existing issues with new follow-ups, clones done issues, creates new issues, and skips waived', async () => {
    const runProgram = (await import('../src/cli')).default;
    await runProgram();

    // --- Verify git clone was called for both repos ---
    const cloneCalls = mocks.execSync.mock.calls.filter((call: string[]) =>
      call[0].startsWith('git clone')
    );
    expect(cloneCalls).toHaveLength(2);
    expect(cloneCalls[0][0]).toContain(UPSTREAM_REPO);
    expect(cloneCalls[1][0]).toContain(DOWNSTREAM_REPO);

    // --- Verify Jira search was performed ---
    expect(
      jiraApi.issueSearch.searchForIssuesUsingJqlEnhancedSearchPost
    ).toHaveBeenCalled();

    // --- Verify remote links fetched for existing issues ---
    expect(jiraApi.issueRemoteLinks.getRemoteIssueLinks).toHaveBeenCalledWith({
      issueIdOrKey: 'PROJ-100',
    });
    expect(jiraApi.issueRemoteLinks.getRemoteIssueLinks).toHaveBeenCalledWith({
      issueIdOrKey: 'PROJ-200',
    });

    // --- Verify GitHub PRs were fetched for all 4 commits ---
    const prCalls = octokitRequest.mock.calls.filter(
      (call: any[]) =>
        call[0] === 'GET /repos/{owner}/{repo}/commits/{commit_sha}/pulls'
    );
    expect(prCalls).toHaveLength(4);

    // --- Verify comment was fetched for waived PR ---
    const commentCalls = octokitRequest.mock.calls.filter(
      (call: any[]) =>
        call[0] === 'GET /repos/{owner}/{repo}/issues/comments/{comment_id}'
    );
    expect(commentCalls).toHaveLength(1);
    expect(commentCalls[0][1].comment_id).toBe(99999);

    // --- Verify clone flow for PROJ-200 (Done tracker with new follow-ups) ---
    expect(jiraApi.issues.editIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        issueIdOrKey: 'PROJ-200',
      })
    );

    // --- Verify new external links created ---
    const linkCalls =
      jiraApi.issueRemoteLinks.createOrUpdateRemoteIssueLink.mock.calls;

    // Links for PROJ-100: new follow-up fff333
    const proj100Links = linkCalls.filter(
      (call: any[]) => call[0].issueIdOrKey === 'PROJ-100'
    );
    expect(proj100Links.length).toBeGreaterThanOrEqual(1);
    expect(
      proj100Links.some((call: any[]) =>
        call[0].object.url.includes(FOLLOWUP_NEW_1)
      )
    ).toBe(true);

    // Links for PROJ-300 (clone): recreated links + new follow-up fff444
    const proj300Links = linkCalls.filter(
      (call: any[]) => call[0].issueIdOrKey === 'PROJ-300'
    );
    expect(proj300Links.length).toBeGreaterThanOrEqual(1);

    // Links for PROJ-400 (brand new issue): backport + cherry-pick + follow-up
    const proj400Links = linkCalls.filter(
      (call: any[]) => call[0].issueIdOrKey === 'PROJ-400'
    );
    expect(proj400Links.length).toBeGreaterThanOrEqual(2);

    // --- Verify brand new issue was created ---
    expect(jiraApi.issues.createIssue).toHaveBeenCalledTimes(1);
    const createCall = jiraApi.issues.createIssue.mock.calls[0][0];
    expect(createCall.fields.summary).toContain('follow-up to');
    expect(createCall.fields.summary).toContain(
      'Add error handling for dbus timeout'
    );
    expect(createCall.fields.components[0].name).toBe('test-component');

    // --- Verify database was written (twice: initial + final) ---
    expect(mocks.writeFileSync).toHaveBeenCalledTimes(2);

    const finalDbWrite = JSON.parse(mocks.writeFileSync.mock.calls[1][1]);
    expect(finalDbWrite.upstream).toContain(UPSTREAM_REPO);
    expect(finalDbWrite.downstream).toContain(DOWNSTREAM_REPO);

    // DB should contain all 4 commits
    expect(finalDbWrite.commits).toHaveLength(4);

    // Verify existing issue (PROJ-100) got the new follow-up added
    const dbCommit1 = finalDbWrite.commits.find(
      (c: any) => c.sha === DOWN_COMMIT_1
    );
    expect(dbCommit1).toBeDefined();
    expect(dbCommit1.followUps.some((f: any) => f.sha === FOLLOWUP_NEW_1)).toBe(
      true
    );
    expect(dbCommit1.tracker.id).toBe('PROJ-100');

    // Verify cloned issue (PROJ-200 → PROJ-300)
    const dbCommit2 = finalDbWrite.commits.find(
      (c: any) => c.sha === DOWN_COMMIT_2
    );
    expect(dbCommit2).toBeDefined();
    expect(dbCommit2.tracker.id).toBe('PROJ-300');
    expect(dbCommit2.tracker.clonedFrom).toBe('PROJ-200');
    expect(dbCommit2.followUps.some((f: any) => f.sha === FOLLOWUP_NEW_2)).toBe(
      true
    );

    // Verify brand new issue
    const dbCommit3 = finalDbWrite.commits.find(
      (c: any) => c.sha === DOWN_COMMIT_3
    );
    expect(dbCommit3).toBeDefined();
    expect(dbCommit3.tracker.id).toBe('PROJ-400');
    expect(
      dbCommit3.followUps.some((f: any) => f.sha === FOLLOWUP_BRAND_NEW)
    ).toBe(true);
    expect(dbCommit3.followUps[0].waived).toBe(false);

    // Verify waived commit - no tracker since issue creation was skipped
    const dbCommit4 = finalDbWrite.commits.find(
      (c: any) => c.sha === DOWN_COMMIT_4
    );
    expect(dbCommit4).toBeDefined();
    expect(dbCommit4.tracker).toBeUndefined();
    expect(dbCommit4.followUps[0].sha).toBe(FOLLOWUP_WAIVED);
    expect(dbCommit4.followUps[0].waived).toBe(true);
    expect(dbCommit4.pr.waived).toBe(true);
  });
});
