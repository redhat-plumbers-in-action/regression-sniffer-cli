import { afterEach, beforeEach, describe, expect, it, test, vi } from 'vitest';

import { Git } from '../../src/git';
import { filters } from '../../src/filter';

const mocks = vi.hoisted(() => {
  return {
    execSync: vi.fn(),
    existsSync: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  };
});

vi.mock('child_process', () => {
  return {
    execSync: mocks.execSync,
  };
});

vi.mock('fs', () => {
  return {
    existsSync: mocks.existsSync,
  };
});

vi.mock('@actions/core', () => {
  return {
    warning: mocks.warning,
    info: mocks.info,
  };
});

describe('Git class', () => {
  beforeEach(() => {
    vi.mocked(mocks.existsSync).mockImplementation(() => true);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('can be instantiated', () => {
    let git = new Git('owner', 'repo', 'path');

    expect(git).toBeDefined();
    expect(git).toBeInstanceOf(Git);
    expect(git.owner).toBe('owner');
    expect(git.repo).toBe('repo');
    expect(git.repoDir).toBe('path');
    expect(git.repoUrl).toBe('https://github.com/owner/repo.git');

    git = new Git('owner', 'repo');
    expect(git.repoDir).toBe('abc_Repo_cba');
  });

  test('clone()', () => {
    const git = new Git('owner', 'repo', 'path');
    vi.mocked(mocks.existsSync).mockImplementation(() => false);

    vi.mocked(mocks.execSync).mockImplementation(command => {
      expect(command).toMatchInlineSnapshot(
        `"git clone https://github.com/owner/repo.git path"`
      );
      return '';
    });

    git.clone();
    expect(mocks.existsSync).toHaveBeenCalledTimes(1);
    expect(mocks.existsSync).toHaveBeenCalledWith('path');
    expect(mocks.execSync).toHaveBeenCalledTimes(1);
  });

  test('clone() - repo already cloned', () => {
    const git = new Git('owner', 'repo', 'path');

    vi.mocked(mocks.execSync).mockImplementation(command => {
      expect(command).toMatchInlineSnapshot();
      return '';
    });

    git.clone();
    expect(mocks.existsSync).toHaveBeenCalledTimes(1);
    expect(mocks.existsSync).toHaveBeenCalledWith('path');
    expect(mocks.execSync).toHaveBeenCalledTimes(0);
  });

  test('grepLog()', () => {
    const git = new Git('owner', 'repo', 'path');

    vi.mocked(mocks.execSync).mockImplementation(command => {
      expect(command).toMatchInlineSnapshot(
        `"git -C path --no-pager log --no-merges --pretty=format:"%H" --regexp-ignore-case --perl-regexp --grep "^\\(cherry picked from commit (sha)\\)$" "`
      );
      return 'abcdef\nghijkl\nabc';
    });

    const result = git.grepLog('sha', filters.cherryPick);
    expect(result).toMatchInlineSnapshot(`
      [
        "abcdef",
        "ghijkl",
        "abc",
      ]
    `);
    expect(mocks.execSync).toHaveBeenCalledTimes(1);
  });

  test('getCommitMessage()', () => {
    const git = new Git('owner', 'repo', 'path');

    vi.mocked(mocks.execSync).mockImplementation(command => {
      expect(command).toMatchInlineSnapshot(
        `"git -C path --no-pager show --no-patch --pretty=format:"%B" abcdef"`
      );
      return 'commit message';
    });

    const result = git.getCommitMessage('abcdef');
    expect(result).toMatchInlineSnapshot(`"commit message"`);
    expect(mocks.execSync).toHaveBeenCalledTimes(1);
  });

  test('removeClone()', () => {
    const git = new Git('owner', 'repo', 'path');

    vi.mocked(mocks.execSync).mockImplementation(command => {
      expect(command).toMatchInlineSnapshot(`"rm -rf path"`);
      return '';
    });

    git.removeClone();
    expect(mocks.execSync).toHaveBeenCalledTimes(1);
  });

  test('getCommitUrl()', () => {
    const git = new Git('owner', 'repo', 'path');
    expect(git.getCommitUrl('abc123')).toBe(
      'https://github.com/owner/repo/commit/abc123'
    );
  });

  test('grepLog() with from parameter', () => {
    const git = new Git('owner', 'repo', 'path');

    vi.mocked(mocks.execSync).mockImplementation(command => {
      expect(command).toContain('v1.0...HEAD');
      return 'sha1\nsha2';
    });

    const result = git.grepLog('sha', filters.cherryPick, 'v1.0');
    expect(result).toEqual(['sha1', 'sha2']);
  });

  test('grepLog() returns empty array when no results', () => {
    const git = new Git('owner', 'repo', 'path');

    vi.mocked(mocks.execSync).mockImplementation(() => '');

    const result = git.grepLog('sha', filters.cherryPick);
    expect(result).toEqual([]);
  });

  test('grepLog() handles execSync error', () => {
    const git = new Git('owner', 'repo', 'path');

    vi.mocked(mocks.execSync).mockImplementation(() => {
      throw new Error('git command failed');
    });

    const result = git.grepLog('sha', filters.cherryPick);
    expect(result).toEqual([]);
    expect(mocks.warning).toHaveBeenCalledWith(
      expect.stringContaining('Unable to grep git log')
    );
  });

  test('getCommitMessage() handles execSync error', () => {
    const git = new Git('owner', 'repo', 'path');

    vi.mocked(mocks.execSync).mockImplementation(() => {
      throw new Error('git show failed');
    });

    const result = git.getCommitMessage('abc123');
    expect(result).toBe('');
    expect(mocks.warning).toHaveBeenCalledWith(
      expect.stringContaining('Unable to git show commit message')
    );
  });

  test('grepLog() constructs regex from multiple filters', () => {
    const git = new Git('owner', 'repo', 'path');

    vi.mocked(mocks.execSync).mockImplementation(command => {
      expect(command).toContain('filter1|filter2');
      return '';
    });

    git.grepLog('sha', ['filter1', 'filter2']);
    expect(mocks.execSync).toHaveBeenCalledTimes(1);
  });
});
