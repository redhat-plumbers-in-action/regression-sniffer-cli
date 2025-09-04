import { afterEach, describe, expect, it, test, vi } from 'vitest';
import { Stream } from '../../src/stream';
import { Commit } from '../../src/commit';
import { Logger } from '../../src/logger';

const mocks = vi.hoisted(() => {
  return {
    grepLog: vi.fn(),
    getCommitMessage: vi.fn(),
    getCommitUrl: vi.fn(),
    clone: vi.fn(),
    removeClone: vi.fn(),
  };
});

vi.mock('../../src/git.ts', () => {
  const Git = vi.fn(function (
    this: any,
    owner: string,
    repo: string,
    repoDir: string
  ) {
    this.owner = owner;
    this.repo = repo;
    this.repoDir = repoDir;
    this.repoUrl = `https://github.com/${owner}/${repo}.git`;
    this.grepLog = mocks.grepLog;
    this.getCommitMessage = mocks.getCommitMessage;
    this.getCommitUrl = mocks.getCommitUrl;
    this.clone = mocks.clone;
    this.removeClone = mocks.removeClone;
  });

  return { Git };
});

vi.mock('cli-progress', () => {
  return {
    default: {
      SingleBar: class {
        start() {}
        update() {}
        stop() {}
      },
    },
  };
});

function createLogger(): Logger {
  const logger = new Logger(true);
  vi.spyOn(logger, 'log').mockImplementation(() => {});
  return logger;
}

describe('Stream class', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('can be instantiated', () => {
    const stream = new Stream({ owner: 'owner', repo: 'repo' }, createLogger());

    expect(stream).toBeDefined();
    expect(stream).toBeInstanceOf(Stream);
    expect(stream.git.owner).toBe('owner');
    expect(stream.git.repo).toBe('repo');
    expect(stream.git.repoDir).toBe('abc_owner-repo_cba');
    expect(stream.git.repoUrl).toBe('https://github.com/owner/repo.git');
  });

  describe('getOwnerRepo()', () => {
    test('parses owner/repo string', () => {
      const result = Stream.getOwnerRepo('myorg/myrepo');
      expect(result).toEqual({ owner: 'myorg', repo: 'myrepo' });
    });

    test('handles nested paths', () => {
      const result = Stream.getOwnerRepo('org/repo-name');
      expect(result).toEqual({ owner: 'org', repo: 'repo-name' });
    });

    test('returns undefined for undefined input', () => {
      const result = (Stream as any).getOwnerRepo(undefined);
      expect(result).toBeUndefined();
    });
  });

  describe('getBackportedCommits()', () => {
    test('returns message when no backported commits found', () => {
      mocks.grepLog.mockReturnValue([]);

      const stream = new Stream(
        { owner: 'downstream', repo: 'project' },
        createLogger()
      );

      const upstreamGit = {
        grepLog: vi.fn(),
        getCommitMessage: vi.fn(),
        getCommitUrl: vi.fn(),
      } as any;

      const result = stream.getBackportedCommits(upstreamGit, 'v1.0');
      expect(result).toBe('No backported commits found.');
      expect(stream.commits).toHaveLength(0);
    });

    test('processes found backported commits', () => {
      mocks.grepLog.mockReturnValueOnce(['sha_a', 'sha_b']);
      mocks.getCommitMessage
        .mockReturnValueOnce(
          'Fix A\n(cherry picked from commit aaaa1111222233334444555566667777aaaabbbb)\n'
        )
        .mockReturnValueOnce(
          'Fix B\n(cherry picked from commit bbbb1111222233334444555566667777aaaabbbb)\n'
        );
      mocks.getCommitUrl.mockImplementation(
        (sha: string) => `https://github.com/downstream/project/commit/${sha}`
      );

      const upstreamGit = {
        grepLog: vi.fn().mockReturnValue([]),
        getCommitMessage: vi.fn().mockReturnValue('upstream msg'),
        getCommitUrl: vi
          .fn()
          .mockImplementation(
            (sha: string) => `https://github.com/upstream/project/commit/${sha}`
          ),
      } as any;

      const stream = new Stream(
        { owner: 'downstream', repo: 'project' },
        createLogger()
      );

      const result = stream.getBackportedCommits(upstreamGit, 'v1.0');
      expect(result).toBeUndefined();
      expect(stream.backportedCommits).toEqual(['sha_a', 'sha_b']);
      expect(stream.commits).toHaveLength(2);
    });
  });

  describe('removeAlreadyBackported()', () => {
    test('marks follow-ups as backported when they exist as cherry-picks', () => {
      mocks.grepLog.mockReturnValue([]);
      mocks.getCommitMessage.mockReturnValue('msg');
      mocks.getCommitUrl.mockImplementation(
        (sha: string) => `https://github.com/owner/repo/commit/${sha}`
      );

      const stream = new Stream(
        { owner: 'downstream', repo: 'project' },
        createLogger()
      );

      const commit1 = new Commit(
        'sha1',
        'https://github.com/downstream/project/commit/sha1',
        'msg',
        stream.git as any
      );
      commit1.followUps = [
        {
          sha: 'followup_sha',
          message: 'Follow-up',
          url: 'https://github.com/upstream/project/commit/followup_sha',
        },
      ];

      const commit2 = new Commit(
        'sha2',
        'https://github.com/downstream/project/commit/sha2',
        'msg',
        stream.git as any
      );
      commit2.cherryPicks = [
        {
          sha: 'followup_sha',
          url: 'https://github.com/upstream/project/commit/followup_sha',
        },
      ];

      stream.commits = [commit1, commit2];
      stream.removeAlreadyBackported();

      expect(commit1.followUps[0].backported).toBe(true);
    });
  });
});
