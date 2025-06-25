import { describe, expect, it } from 'vitest';
import { Stream } from '../../src/stream';

describe('Stream class', () => {
  it('can be instantiated', () => {
    const stream = new Stream({ owner: 'owner', repo: 'repo' });

    expect(stream).toBeDefined();
    expect(stream).toBeInstanceOf(Stream);
    expect(stream.git.owner).toBe('owner');
    expect(stream.git.repo).toBe('repo');
    expect(stream.git.repoDir).toBe('abc_owner-repo_cba');
    expect(stream.git.repoUrl).toBe('https://github.com/owner/repo.git');
  });
});
