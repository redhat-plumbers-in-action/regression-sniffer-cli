import { afterEach, beforeEach, describe, expect, it, test, vi } from 'vitest';

import { Git } from '../../src/git';
import { filters } from '../../src/filter';

const mocks = vi.hoisted(() => {
  return {
    execSync: vi.fn(),
    existsSync: vi.fn(),
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
        `"git -C path --no-pager log --pretty=format:"%H" --regexp-ignore-case --perl-regexp --grep "^\\(cherry picked from commit (sha)\\)$" "`
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
});
