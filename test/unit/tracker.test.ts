import { afterEach, describe, expect, it, test, vi } from 'vitest';
import { Tracker } from '../../src/tracker';

const mockApi = {
  createExternalLink: vi.fn(),
};

vi.mock('../../src/jira', () => ({
  Jira: vi.fn(),
}));

function createTracker(statusCategory: string) {
  return new Tracker(
    {
      id: 'PROJ-123',
      type: 'Bug',
      url: 'https://issues.example.com/browse/PROJ-123',
      status: 'New',
      statusCategory,
      versions: ['CentOS Stream 9'],
      summary: '[follow-up to] - Fix issue',
    },
    mockApi as any
  );
}

describe('Tracker class', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('can be instantiated', () => {
    const tracker = createTracker('To Do');
    expect(tracker).toBeDefined();
    expect(tracker).toBeInstanceOf(Tracker);
    expect(tracker.data.id).toBe('PROJ-123');
  });

  describe('isOpen', () => {
    test('returns true when statusCategory is "To Do"', () => {
      const tracker = createTracker('To Do');
      expect(tracker.isOpen).toBe(true);
    });

    test('returns false for other status categories', () => {
      expect(createTracker('In Progress').isOpen).toBe(false);
      expect(createTracker('Done').isOpen).toBe(false);
    });
  });

  describe('isInProgress', () => {
    test('returns true when statusCategory is "In Progress"', () => {
      const tracker = createTracker('In Progress');
      expect(tracker.isInProgress).toBe(true);
    });

    test('returns false for other status categories', () => {
      expect(createTracker('To Do').isInProgress).toBe(false);
      expect(createTracker('Done').isInProgress).toBe(false);
    });
  });

  describe('isDone', () => {
    test('returns true when statusCategory is "Done"', () => {
      const tracker = createTracker('Done');
      expect(tracker.isDone).toBe(true);
    });

    test('returns false for other status categories', () => {
      expect(createTracker('To Do').isDone).toBe(false);
      expect(createTracker('In Progress').isDone).toBe(false);
    });
  });

  describe('createExternalLink()', () => {
    test('delegates to api.createExternalLink', async () => {
      mockApi.createExternalLink.mockResolvedValue(undefined);
      const tracker = createTracker('To Do');

      await tracker.createExternalLink(
        'follow-up',
        'Fix edge case',
        'https://github.com/org/repo/commit/abc123'
      );

      expect(mockApi.createExternalLink).toHaveBeenCalledWith(
        'PROJ-123',
        'follow-up',
        'Fix edge case',
        'https://github.com/org/repo/commit/abc123'
      );
    });

    test('works with all link types', async () => {
      mockApi.createExternalLink.mockResolvedValue(undefined);
      const tracker = createTracker('To Do');

      const types = ['follow-up', 'revert', 'cherry-pick', 'backport'] as const;

      for (const type of types) {
        await tracker.createExternalLink(
          type,
          `${type} title`,
          `https://github.com/org/repo/commit/${type}`
        );
      }

      expect(mockApi.createExternalLink).toHaveBeenCalledTimes(4);
    });
  });
});
