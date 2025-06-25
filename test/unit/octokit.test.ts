import { Octokit } from '@octokit/core';
import { describe, expect, test } from 'vitest';

import { getOctokit } from '../../src/octokit';

describe('Octokit object', () => {
  test('getOctokit()', () => {
    const octokit = getOctokit('token');

    expect(octokit).toBeDefined();
    expect(octokit).toBeInstanceOf(Octokit);
  });
});
