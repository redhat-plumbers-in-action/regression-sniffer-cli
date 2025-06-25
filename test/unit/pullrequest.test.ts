import { beforeEach, describe, expect, it, test, vi } from 'vitest';
import { PullRequest } from '../../src/pullrequest';

describe('PullRequest class', () => {
  it('can be instantiated', () => {
    const pr = new PullRequest(
      'owner',
      'repo',
      {
        body: 'body',
        labels: [],
        number: 1,
        title: 'title',
      } as any,
      {} as any
    );
    expect(pr).toBeDefined();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('hasLabel()', () => {
    const pr = new PullRequest(
      'owner',
      'repo',
      {
        body: 'body',
        labels: [],
        number: 1,
        title: 'title',
      } as any,
      {} as any
    );

    expect(pr.hasLabel('test')).toBe(false);

    pr.data.labels = [{ name: 'test' }] as any;
    expect(pr.hasLabel('test')).toBe(true);
  });
});
