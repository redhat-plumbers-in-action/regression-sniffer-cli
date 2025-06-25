import { afterEach, describe, expect, it, vi } from 'vitest';

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
  const Git = vi.fn(() => {
    return {
      grepLog: mocks.grepLog,
      getCommitMessage: mocks.getCommitMessage,
      getCommitUrl: mocks.getCommitUrl,
    };
  });

  return { Git };
});

describe('Commit class', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('can be instantiated', () => {
    vi.mocked(mocks.grepLog)
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
});
