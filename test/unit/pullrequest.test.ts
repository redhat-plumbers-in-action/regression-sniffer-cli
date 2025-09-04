import { afterEach, beforeEach, describe, expect, it, test, vi } from 'vitest';
import { PullRequest } from '../../src/pullrequest';

function createPR(
  overrides: {
    body?: string | null;
    labels?: { name: string }[];
    number?: number;
  } = {},
  octokitMock: any = {}
) {
  return new PullRequest(
    'owner',
    'repo',
    {
      body: overrides.body ?? 'PR description',
      labels: overrides.labels ?? [],
      number: overrides.number ?? 1,
      title: 'Test PR',
      html_url: 'https://github.com/owner/repo/pull/1',
    } as any,
    octokitMock
  );
}

describe('PullRequest class', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('can be instantiated', () => {
    const pr = createPR();
    expect(pr).toBeDefined();
    expect(pr).toBeInstanceOf(PullRequest);
    expect(pr.owner).toBe('owner');
    expect(pr.repo).toBe('repo');
    expect(pr.waived).toBe(false);
  });

  it('sets waived=true when follow-up-waived label is present', () => {
    const pr = createPR({
      labels: [{ name: 'follow-up-waived' }],
    });
    expect(pr.waived).toBe(true);
  });

  describe('hasLabel()', () => {
    test('returns false when label not present', () => {
      const pr = createPR({ labels: [] });
      expect(pr.hasLabel('test')).toBe(false);
    });

    test('returns true when label is present', () => {
      const pr = createPR({ labels: [{ name: 'bug' }, { name: 'test' }] });
      expect(pr.hasLabel('test')).toBe(true);
      expect(pr.hasLabel('bug')).toBe(true);
    });

    test('returns false for partial match', () => {
      const pr = createPR({ labels: [{ name: 'testing' }] });
      expect(pr.hasLabel('test')).toBe(false);
    });
  });

  describe('getCommentID()', () => {
    test('extracts comment ID from PR body', () => {
      const pr = createPR({
        body: 'Some text\n<!-- issue-commentator = {"comment-id":"12345678"} -->\nMore text',
      });
      expect(pr.getCommentID()).toBe('12345678');
    });

    test('returns undefined when no comment marker', () => {
      const pr = createPR({
        body: 'Regular PR description without markers',
      });
      expect(pr.getCommentID()).toBeUndefined();
    });

    test('returns undefined when body is null', () => {
      const pr = createPR({ body: null });
      expect(pr.getCommentID()).toBeUndefined();
    });

    test('handles comment ID with extra fields', () => {
      const pr = createPR({
        body: '<!-- issue-commentator = {"id":"bot","comment-id":"99999","extra":"data"} -->',
      });
      expect(pr.getCommentID()).toBe('99999');
    });
  });

  describe('isFollowUpWaived()', () => {
    test('returns false when PR is not waived', () => {
      const pr = createPR({ labels: [] });
      expect(pr.isFollowUpWaived('abc123')).toBe(false);
    });

    test('returns false when PR is waived but follow-up not reported', () => {
      const pr = createPR({
        labels: [{ name: 'follow-up-waived' }],
      });
      pr.comment = 'Some comment without marker';
      expect(pr.isFollowUpWaived('abc123')).toBe(false);
    });

    test('returns true when PR is waived and follow-up was reported', () => {
      const pr = createPR({
        labels: [{ name: 'follow-up-waived' }],
      });
      pr.comment =
        'Follow-ups found <!-- regression-sniffer = ["abc123","def456"] -->';
      expect(pr.isFollowUpWaived('abc123')).toBe(true);
    });

    test('returns false when PR is waived but different follow-up reported', () => {
      const pr = createPR({
        labels: [{ name: 'follow-up-waived' }],
      });
      pr.comment = 'Follow-ups <!-- regression-sniffer = ["xyz789"] -->';
      expect(pr.isFollowUpWaived('abc123')).toBe(false);
    });
  });

  describe('wasFollowUpReported()', () => {
    test('returns false when comment is undefined', () => {
      const pr = createPR();
      pr.comment = undefined;
      expect(pr.wasFollowUpReported('abc123')).toBe(false);
    });

    test('returns false when no regression-sniffer marker in comment', () => {
      const pr = createPR();
      pr.comment = 'A normal comment without any markers';
      expect(pr.wasFollowUpReported('abc123')).toBe(false);
    });

    test('returns true when follow-up SHA is in the list', () => {
      const pr = createPR();
      pr.comment =
        'Report <!-- regression-sniffer = ["sha111","sha222","sha333"] -->';
      expect(pr.wasFollowUpReported('sha222')).toBe(true);
      expect(pr.followUps).toEqual(['sha111', 'sha222', 'sha333']);
    });

    test('returns false when follow-up SHA is not in the list', () => {
      const pr = createPR();
      pr.comment = 'Report <!-- regression-sniffer = ["sha111","sha222"] -->';
      expect(pr.wasFollowUpReported('sha999')).toBe(false);
    });

    test('handles empty array in comment', () => {
      const pr = createPR();
      pr.comment = 'Report <!-- regression-sniffer = [] -->';
      expect(pr.wasFollowUpReported('abc123')).toBe(false);
      expect(pr.followUps).toEqual([]);
    });
  });

  describe('getCommentWithFollowUps()', () => {
    test('returns undefined when no comment ID in body', async () => {
      const pr = createPR({ body: 'No comment marker here' });
      const result = await pr.getCommentWithFollowUps();
      expect(result).toBeUndefined();
    });

    test('fetches and stores comment from API', async () => {
      const mockOctokit = {
        request: vi.fn().mockResolvedValue({
          data: {
            body: 'Fetched comment body <!-- regression-sniffer = ["aaa"] -->',
          },
        }),
      };

      const pr = createPR(
        {
          body: '<!-- issue-commentator = {"comment-id":"55555"} -->',
        },
        mockOctokit
      );

      const result = await pr.getCommentWithFollowUps();

      expect(result).toBe(
        'Fetched comment body <!-- regression-sniffer = ["aaa"] -->'
      );
      expect(pr.comment).toBe(result);
      expect(mockOctokit.request).toHaveBeenCalledWith(
        'GET /repos/{owner}/{repo}/issues/comments/{comment_id}',
        {
          owner: 'owner',
          repo: 'repo',
          comment_id: 55555,
        }
      );
    });
  });

  describe('getPullRequest() static method', () => {
    test('returns undefined when API returns empty array', async () => {
      const mockOctokit = {
        request: vi.fn().mockResolvedValue({ data: [] }),
      };

      const result = await PullRequest.getPullRequest(
        'abc123',
        mockOctokit as any,
        { owner: 'owner', repo: 'repo' }
      );

      expect(result).toBeUndefined();
    });

    test('returns PullRequest instance on success', async () => {
      const mockOctokit = {
        request: vi.fn().mockResolvedValue({
          data: [
            {
              number: 42,
              title: 'Test PR',
              body: 'Body content',
              html_url: 'https://github.com/owner/repo/pull/42',
              labels: [],
            },
          ],
        }),
      };

      const result = await PullRequest.getPullRequest(
        'abc123',
        mockOctokit as any,
        { owner: 'owner', repo: 'repo' }
      );

      expect(result).toBeInstanceOf(PullRequest);
      expect(result?.data.number).toBe(42);
    });

    test('returns undefined when API throws', async () => {
      const mockOctokit = {
        request: vi.fn().mockRejectedValue(new Error('API error')),
      };

      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const result = await PullRequest.getPullRequest(
        'abc123',
        mockOctokit as any,
        { owner: 'owner', repo: 'repo' }
      );

      expect(result).toBeUndefined();
      consoleSpy.mockRestore();
    });
  });

  describe('getIssueComment()', () => {
    test('retries on failure', async () => {
      const mockOctokit = {
        request: vi
          .fn()
          .mockRejectedValueOnce(new Error('Network error'))
          .mockResolvedValueOnce({
            data: { body: 'Comment body after retry' },
          }),
      };

      const pr = createPR(
        {
          body: '<!-- issue-commentator = {"comment-id":"11111"} -->',
        },
        mockOctokit
      );

      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const result = await pr.getIssueComment('11111', 2);

      expect(result).toBe('Comment body after retry');
      expect(mockOctokit.request).toHaveBeenCalledTimes(2);
      consoleSpy.mockRestore();
    });

    test('returns undefined after all retries fail', async () => {
      const mockOctokit = {
        request: vi.fn().mockRejectedValue(new Error('Persistent error')),
      };

      const pr = createPR({ body: 'body' }, mockOctokit);

      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const result = await pr.getIssueComment('11111', 2);

      expect(result).toBeUndefined();
      expect(mockOctokit.request).toHaveBeenCalledTimes(2);
      consoleSpy.mockRestore();
    });
  });
});
