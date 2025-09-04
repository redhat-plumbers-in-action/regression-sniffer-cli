import { afterEach, describe, expect, it, test, vi } from 'vitest';

import { Commit } from '../../src/commit';
import { Git } from '../../src/git';

const mocks = vi.hoisted(() => {
  return {
    grepLog: vi.fn(),
    getCommitMessage: vi.fn(),
    getCommitUrl: vi.fn(),
  };
});

vi.mock('../../src/git.ts', () => {
  const Git = vi.fn(function () {
    return {
      grepLog: mocks.grepLog,
      getCommitMessage: mocks.getCommitMessage,
      getCommitUrl: mocks.getCommitUrl,
    };
  });

  return { Git };
});

function setupMocks(followUps: string[] = [], reverts: string[] = []) {
  mocks.grepLog
    .mockImplementationOnce(() => followUps)
    .mockImplementationOnce(() => reverts)
    .mockImplementation(() => []);

  mocks.getCommitMessage.mockImplementation(
    (sha: string) => `Commit message for ${sha}`
  );
  mocks.getCommitUrl.mockImplementation(
    (sha: string) => `https://github.com/owner/repo/commit/${sha}`
  );
}

describe('Commit class', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('can be instantiated', () => {
    mocks.grepLog
      .mockImplementationOnce((_sha, filter) => {
        expect(filter).toMatchInlineSnapshot(`
          [
            "(https:\\/\\/github\\.com\\/systemd\\/systemd\\/commit\\/)?(%{sha}%)",
            "follow-?up *(|:|-|for|to) *(https:\\/\\/github\\.com\\/systemd\\/systemd\\/commit\\/)?(%{sha}%)",
          ]
        `);

        return ['followUpSha1', 'followUpSha2'];
      })
      .mockImplementationOnce((_sha, filter) => {
        expect(filter).toMatchInlineSnapshot(`
          [
            "(This)? *reverts? *(commit)? *(|:|-) *(https:\\/\\/github\\.com\\/systemd\\/systemd\\/commit\\/)?(%{sha}%)",
          ]
        `);

        return ['revertSha1', 'revertSha2'];
      })
      .mockImplementation(() => []);

    vi.mocked(mocks.getCommitMessage).mockImplementation(
      (sha: string) => `Commit message for ${sha}`
    );
    vi.mocked(mocks.getCommitUrl).mockImplementation(
      (sha: string) => `https://github.com/owner/repo/commit/${sha}`
    );

    const commit = new Commit(
      'sha',
      'https://github.com/example/repo/commit/sha',
      'message\n(cherry picked from commit 941a12dcba57f6673230a9c413738c51374d2998)\n(cherry picked from commit 123456dcba57f6673230a9c413738c51374d2998)\n',
      new Git('owner', 'repo')
    );

    expect(commit).toBeDefined();
    expect(commit.cherryPicks).toMatchInlineSnapshot(`
      [
        {
          "sha": "941a12dcba57f6673230a9c413738c51374d2998",
          "url": "https://github.com/owner/repo/commit/941a12dcba57f6673230a9c413738c51374d2998",
        },
        {
          "sha": "123456dcba57f6673230a9c413738c51374d2998",
          "url": "https://github.com/owner/repo/commit/123456dcba57f6673230a9c413738c51374d2998",
        },
      ]
    `);

    expect(mocks.grepLog).toHaveBeenCalledTimes(4);
    expect(commit.followUps).toMatchInlineSnapshot(`
      [
        {
          "backported": undefined,
          "message": "Commit message for followUpSha1",
          "sha": "followUpSha1",
          "url": "https://github.com/owner/repo/commit/followUpSha1",
          "waived": undefined,
        },
        {
          "backported": undefined,
          "message": "Commit message for followUpSha2",
          "sha": "followUpSha2",
          "url": "https://github.com/owner/repo/commit/followUpSha2",
          "waived": undefined,
        },
      ]
    `);
    expect(commit.reverts).toMatchInlineSnapshot(`
      [
        {
          "backported": undefined,
          "message": "Commit message for revertSha1",
          "sha": "revertSha1",
          "url": "https://github.com/owner/repo/commit/revertSha1",
          "waived": undefined,
        },
        {
          "backported": undefined,
          "message": "Commit message for revertSha2",
          "sha": "revertSha2",
          "url": "https://github.com/owner/repo/commit/revertSha2",
          "waived": undefined,
        },
      ]
    `);
  });

  describe('getCherryPicks()', () => {
    test('extracts single cherry-pick', () => {
      setupMocks();

      const commit = new Commit(
        'sha1',
        'https://github.com/example/repo/commit/sha1',
        'Fix bug\n\n(cherry picked from commit abcdef1234567890abcdef1234567890abcdef12)\n',
        new Git('owner', 'repo')
      );

      expect(commit.cherryPicks).toHaveLength(1);
      expect(commit.cherryPicks[0].sha).toBe(
        'abcdef1234567890abcdef1234567890abcdef12'
      );
    });

    test('extracts multiple cherry-picks', () => {
      mocks.grepLog.mockImplementation(() => []);
      mocks.getCommitMessage.mockImplementation((sha: string) => `msg ${sha}`);
      mocks.getCommitUrl.mockImplementation(
        (sha: string) => `https://github.com/owner/repo/commit/${sha}`
      );

      const commit = new Commit(
        'sha1',
        'https://github.com/example/repo/commit/sha1',
        'Fix\n(cherry picked from commit aaaa1234567890abcdef1234567890abcdef1234)\n(cherry picked from commit bbbb1234567890abcdef1234567890abcdef1234)\n(cherry picked from commit cccc1234567890abcdef1234567890abcdef1234)\n',
        new Git('owner', 'repo')
      );

      expect(commit.cherryPicks).toHaveLength(3);
      expect(commit.cherryPicks[0].sha).toBe(
        'aaaa1234567890abcdef1234567890abcdef1234'
      );
      expect(commit.cherryPicks[1].sha).toBe(
        'bbbb1234567890abcdef1234567890abcdef1234'
      );
      expect(commit.cherryPicks[2].sha).toBe(
        'cccc1234567890abcdef1234567890abcdef1234'
      );
    });

    test('handles no cherry-picks', () => {
      setupMocks();

      const commit = new Commit(
        'sha1',
        'https://github.com/example/repo/commit/sha1',
        'Regular commit without cherry-pick info',
        new Git('owner', 'repo')
      );

      expect(commit.cherryPicks).toHaveLength(0);
    });

    test('handles short SHA (5+ chars)', () => {
      setupMocks();

      const commit = new Commit(
        'sha1',
        'https://github.com/example/repo/commit/sha1',
        'Fix\n(cherry picked from commit abcde)\n',
        new Git('owner', 'repo')
      );

      expect(commit.cherryPicks).toHaveLength(1);
      expect(commit.cherryPicks[0].sha).toBe('abcde');
    });
  });

  describe('removeDuplicates()', () => {
    test('removes follow-ups that are also reverts', () => {
      setupMocks();

      const commit = new Commit(
        'sha1',
        'https://github.com/example/repo/commit/sha1',
        'msg',
        new Git('owner', 'repo')
      );

      const followUps = [
        {
          sha: 'dup1',
          message: 'msg1',
          url: 'https://github.com/owner/repo/commit/dup1',
        },
        {
          sha: 'unique1',
          message: 'msg2',
          url: 'https://github.com/owner/repo/commit/unique1',
        },
      ];
      const reverts = [
        {
          sha: 'dup1',
          message: 'revert msg1',
          url: 'https://github.com/owner/repo/commit/dup1',
        },
      ];

      const result = commit.removeDuplicates(followUps, reverts);

      expect(result).toHaveLength(1);
      expect(result[0].sha).toBe('unique1');
    });

    test('removes duplicate follow-ups (keeps first occurrence)', () => {
      setupMocks();

      const commit = new Commit(
        'sha1',
        'https://github.com/example/repo/commit/sha1',
        'msg',
        new Git('owner', 'repo')
      );

      const followUps = [
        {
          sha: 'aaa',
          message: 'first',
          url: 'https://github.com/owner/repo/commit/aaa',
        },
        {
          sha: 'aaa',
          message: 'duplicate',
          url: 'https://github.com/owner/repo/commit/aaa',
        },
        {
          sha: 'bbb',
          message: 'other',
          url: 'https://github.com/owner/repo/commit/bbb',
        },
      ];

      const result = commit.removeDuplicates(followUps, []);

      expect(result).toHaveLength(2);
      expect(result[0].sha).toBe('aaa');
      expect(result[0].message).toBe('first');
      expect(result[1].sha).toBe('bbb');
    });

    test('returns all when no duplicates', () => {
      setupMocks();

      const commit = new Commit(
        'sha1',
        'https://github.com/example/repo/commit/sha1',
        'msg',
        new Git('owner', 'repo')
      );

      const followUps = [
        {
          sha: 'aaa',
          message: 'msg1',
          url: 'https://github.com/owner/repo/commit/aaa',
        },
        {
          sha: 'bbb',
          message: 'msg2',
          url: 'https://github.com/owner/repo/commit/bbb',
        },
      ];

      const result = commit.removeDuplicates(followUps, []);

      expect(result).toHaveLength(2);
    });
  });

  describe('checkBackportedCommits()', () => {
    test('marks follow-ups as backported if cherry-picked', () => {
      mocks.grepLog.mockImplementation(() => []);
      mocks.getCommitMessage.mockImplementation(() => 'msg');
      mocks.getCommitUrl.mockImplementation(
        (sha: string) => `https://github.com/owner/repo/commit/${sha}`
      );

      const commit = new Commit(
        'sha1',
        'https://github.com/example/repo/commit/sha1',
        'msg',
        new Git('owner', 'repo')
      );

      commit.followUps = [
        {
          sha: 'followup1',
          message: 'Follow-up commit',
          url: 'https://github.com/owner/repo/commit/followup1',
        },
        {
          sha: 'followup2',
          message: 'Another follow-up',
          url: 'https://github.com/owner/repo/commit/followup2',
        },
      ];

      const otherCommit = new Commit(
        'sha2',
        'https://github.com/example/repo/commit/sha2',
        'msg',
        new Git('owner', 'repo')
      );
      otherCommit.cherryPicks = [
        {
          sha: 'followup1',
          url: 'https://github.com/owner/repo/commit/followup1',
        },
      ];

      commit.checkBackportedCommits([otherCommit]);

      expect(commit.followUps[0].backported).toBe(true);
      expect(commit.followUps[1].backported).toBeUndefined();
    });

    test('marks reverts as backported if cherry-picked', () => {
      mocks.grepLog.mockImplementation(() => []);
      mocks.getCommitMessage.mockImplementation(() => 'msg');
      mocks.getCommitUrl.mockImplementation(
        (sha: string) => `https://github.com/owner/repo/commit/${sha}`
      );

      const commit = new Commit(
        'sha1',
        'https://github.com/example/repo/commit/sha1',
        'msg',
        new Git('owner', 'repo')
      );

      commit.reverts = [
        {
          sha: 'revert1',
          message: 'Revert commit',
          url: 'https://github.com/owner/repo/commit/revert1',
        },
      ];

      const otherCommit = new Commit(
        'sha2',
        'https://github.com/example/repo/commit/sha2',
        'msg',
        new Git('owner', 'repo')
      );
      otherCommit.cherryPicks = [
        {
          sha: 'revert1',
          url: 'https://github.com/owner/repo/commit/revert1',
        },
      ];

      commit.checkBackportedCommits([otherCommit]);

      expect(commit.reverts[0].backported).toBe(true);
    });

    test('does not mark when not backported', () => {
      mocks.grepLog.mockImplementation(() => []);
      mocks.getCommitMessage.mockImplementation(() => 'msg');
      mocks.getCommitUrl.mockImplementation(
        (sha: string) => `https://github.com/owner/repo/commit/${sha}`
      );

      const commit = new Commit(
        'sha1',
        'https://github.com/example/repo/commit/sha1',
        'msg',
        new Git('owner', 'repo')
      );

      commit.followUps = [
        {
          sha: 'followup1',
          message: 'Not backported',
          url: 'https://github.com/owner/repo/commit/followup1',
        },
      ];

      commit.checkBackportedCommits([]);

      expect(commit.followUps[0].backported).toBeUndefined();
    });
  });

  describe('needsBackport()', () => {
    test('returns combined follow-ups and reverts', () => {
      mocks.grepLog.mockImplementation(() => []);
      mocks.getCommitMessage.mockImplementation(() => 'msg');
      mocks.getCommitUrl.mockImplementation(
        (sha: string) => `https://github.com/owner/repo/commit/${sha}`
      );

      const commit = new Commit(
        'sha1',
        'https://github.com/example/repo/commit/sha1',
        'msg',
        new Git('owner', 'repo')
      );

      commit.followUps = [
        {
          sha: 'f1',
          message: 'follow-up',
          url: 'https://github.com/owner/repo/commit/f1',
        },
      ];
      commit.reverts = [
        {
          sha: 'r1',
          message: 'revert',
          url: 'https://github.com/owner/repo/commit/r1',
        },
      ];

      const result = commit.needsBackport();
      expect(result).toHaveLength(2);
    });

    test('returns empty array when no follow-ups or reverts', () => {
      mocks.grepLog.mockImplementation(() => []);
      mocks.getCommitMessage.mockImplementation(() => 'msg');
      mocks.getCommitUrl.mockImplementation(
        (sha: string) => `https://github.com/owner/repo/commit/${sha}`
      );

      const commit = new Commit(
        'sha1',
        'https://github.com/example/repo/commit/sha1',
        'msg',
        new Git('owner', 'repo')
      );

      const result = commit.needsBackport();
      expect(result).toHaveLength(0);
    });
  });

  describe('fromJiraIssue() static method', () => {
    test('creates Commit from JiraIssue data', () => {
      mocks.grepLog.mockImplementation(() => []);
      mocks.getCommitMessage.mockImplementation(() => 'msg');
      mocks.getCommitUrl.mockImplementation(
        (sha: string) => `https://github.com/owner/repo/commit/${sha}`
      );

      const jiraIssue = {
        sha: 'jira_sha_123',
        url: 'https://github.com/upstream/project/commit/jira_sha_123',
        cherryPicks: [
          {
            sha: 'cp1',
            url: 'https://github.com/upstream/project/commit/cp1',
            message: 'cherry pick msg',
          },
        ],
        message: 'Original commit message',
        followUp: [
          {
            sha: 'fu1',
            message: 'Follow-up fix',
            url: 'https://github.com/upstream/project/commit/fu1',
          },
        ],
        revert: [
          {
            sha: 'rv1',
            message: 'Revert original',
            url: 'https://github.com/upstream/project/commit/rv1',
          },
        ],
        tracker: {
          id: 'PROJ-555',
          type: 'Bug',
          url: 'https://issues.example.com/browse/PROJ-555',
          status: 'In Progress',
          statusCategory: 'In Progress',
          versions: ['CentOS Stream 9'],
          summary: '[follow-up to] - Original commit',
        },
      };

      const git = new Git('owner', 'repo');
      const commit = Commit.fromJiraIssue(jiraIssue as any, git);

      expect(commit.sha).toBe('jira_sha_123');
      expect(commit.url).toBe(
        'https://github.com/upstream/project/commit/jira_sha_123'
      );
      expect(commit.cherryPicks).toHaveLength(1);
      expect(commit.followUps).toHaveLength(1);
      expect(commit.reverts).toHaveLength(1);
      expect(commit.tracker?.id).toBe('PROJ-555');
    });
  });
});
