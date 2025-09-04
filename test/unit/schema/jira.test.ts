import { describe, expect, test } from 'vitest';

import {
  externalLinkSchema,
  jiraIssueSchema,
  releaseSchema,
} from '../../../src/schema/jira';

describe('Jira schemas', () => {
  describe('externalLinkSchema', () => {
    test('parses a follow-up link', () => {
      const data = {
        object: {
          title: '[follow-up] - Fix edge case in handler',
          url: 'https://github.com/org/repo/commit/abc123',
        },
      };

      const result = externalLinkSchema.parse(data);
      expect(result.type).toBe('follow-up');
      expect(result.title).toBe('Fix edge case in handler');
      expect(result.sha).toBe('abc123');
      expect(result.url).toBe('https://github.com/org/repo/commit/abc123');
    });

    test('parses a revert link', () => {
      const data = {
        object: {
          title: '[revert] - Revert "Fix memory leak"',
          url: 'https://github.com/org/repo/commit/def456',
        },
      };

      const result = externalLinkSchema.parse(data);
      expect(result.type).toBe('revert');
      expect(result.title).toBe('Revert "Fix memory leak"');
      expect(result.sha).toBe('def456');
    });

    test('parses a cherry-pick link', () => {
      const data = {
        object: {
          title: '[cherry-pick] - Original commit message',
          url: 'https://github.com/org/repo/commit/cp789',
        },
      };

      const result = externalLinkSchema.parse(data);
      expect(result.type).toBe('cherry-pick');
      expect(result.title).toBe('Original commit message');
    });

    test('parses a backport link', () => {
      const data = {
        object: {
          title: '[backport] - Backported fix',
          url: 'https://github.com/org/repo/commit/bp111',
        },
      };

      const result = externalLinkSchema.parse(data);
      expect(result.type).toBe('backport');
      expect(result.title).toBe('Backported fix');
    });

    test('handles link with unknown type prefix', () => {
      const data = {
        object: {
          title: 'Random title without brackets',
          url: 'https://github.com/org/repo/commit/xyz',
        },
      };

      const result = externalLinkSchema.parse(data);
      expect(result.type).toBeUndefined();
      expect(result.title).toBe('Random title without brackets');
    });

    test('extracts SHA from URL path', () => {
      const data = {
        object: {
          title: '[follow-up] - msg',
          url: 'https://github.com/org/repo/commit/abcdef1234567890',
        },
      };

      const result = externalLinkSchema.parse(data);
      expect(result.sha).toBe('abcdef1234567890');
    });
  });

  describe('jiraIssueSchema', () => {
    test('transforms issue with all link types', () => {
      const data = {
        key: 'PROJ-100',
        url: 'https://issues.example.com/browse/PROJ-100',
        type: 'Bug',
        status: 'In Progress',
        statusCategory: 'In Progress',
        summary: '[follow-up to] - Fix crash on startup',
        labels: ['component-followup'],
        links: [
          {
            object: {
              title: '[backport] - Fix crash on startup',
              url: 'https://github.com/org/repo/commit/backport_sha',
            },
          },
          {
            object: {
              title: '[cherry-pick] - Fix crash on startup',
              url: 'https://github.com/org/repo/commit/cp_sha',
            },
          },
          {
            object: {
              title: '[follow-up] - Address crash edge case',
              url: 'https://github.com/org/repo/commit/fu_sha',
            },
          },
          {
            object: {
              title: '[revert] - Revert "Fix crash"',
              url: 'https://github.com/org/repo/commit/rv_sha',
            },
          },
        ],
        versions: ['CentOS Stream 9'],
        epic: 'EPIC-1',
      };

      const result = jiraIssueSchema.parse(data);

      expect(result.sha).toBe('backport_sha');
      expect(result.url).toBe(
        'https://github.com/org/repo/commit/backport_sha'
      );
      expect(result.message).toBe('Fix crash on startup');
      expect(result.cherryPicks).toHaveLength(1);
      expect(result.cherryPicks[0].sha).toBe('cp_sha');
      expect(result.followUp).toHaveLength(1);
      expect(result.followUp[0].sha).toBe('fu_sha');
      expect(result.revert).toHaveLength(1);
      expect(result.revert[0].sha).toBe('rv_sha');
      expect(result.tracker.id).toBe('PROJ-100');
      expect(result.tracker.statusCategory).toBe('In Progress');
    });

    test('handles issue with no links', () => {
      const data = {
        key: 'PROJ-200',
        url: 'https://issues.example.com/browse/PROJ-200',
        type: 'Bug',
        status: 'New',
        statusCategory: 'To Do',
        summary: 'Some issue',
        labels: [],
        links: [],
        versions: [],
      };

      const result = jiraIssueSchema.parse(data);

      expect(result.sha).toBe('');
      expect(result.url).toBe('');
      expect(result.message).toBe('');
      expect(result.cherryPicks).toHaveLength(0);
      expect(result.followUp).toHaveLength(0);
      expect(result.revert).toHaveLength(0);
    });

    test('handles issue with multiple follow-ups', () => {
      const data = {
        key: 'PROJ-300',
        url: 'https://issues.example.com/browse/PROJ-300',
        type: 'Bug',
        status: 'New',
        statusCategory: 'To Do',
        summary: 'Issue with multiple follow-ups',
        labels: ['label-a'],
        links: [
          {
            object: {
              title: '[backport] - Original commit',
              url: 'https://github.com/org/repo/commit/orig123',
            },
          },
          {
            object: {
              title: '[follow-up] - First follow-up',
              url: 'https://github.com/org/repo/commit/fu1',
            },
          },
          {
            object: {
              title: '[follow-up] - Second follow-up',
              url: 'https://github.com/org/repo/commit/fu2',
            },
          },
          {
            object: {
              title: '[follow-up] - Third follow-up',
              url: 'https://github.com/org/repo/commit/fu3',
            },
          },
        ],
        versions: ['CentOS Stream 10'],
      };

      const result = jiraIssueSchema.parse(data);

      expect(result.followUp).toHaveLength(3);
      expect(result.followUp[0].sha).toBe('fu1');
      expect(result.followUp[1].sha).toBe('fu2');
      expect(result.followUp[2].sha).toBe('fu3');
    });

    test('tracker contains correct status info', () => {
      const data = {
        key: 'PROJ-400',
        url: 'https://issues.example.com/browse/PROJ-400',
        type: 'Task',
        status: 'Done',
        statusCategory: 'Done',
        summary: 'Completed task',
        labels: [],
        links: [],
        versions: ['CentOS Stream 9', 'CentOS Stream 10'],
      };

      const result = jiraIssueSchema.parse(data);

      expect(result.tracker.status).toBe('Done');
      expect(result.tracker.statusCategory).toBe('Done');
      expect(result.tracker.type).toBe('Task');
      expect(result.tracker.versions).toEqual([
        'CentOS Stream 9',
        'CentOS Stream 10',
      ]);
    });
  });

  describe('releaseSchema', () => {
    test('accepts valid release numbers', () => {
      expect(releaseSchema.parse('8')).toBe(8);
      expect(releaseSchema.parse('9')).toBe(9);
      expect(releaseSchema.parse('10')).toBe(10);
      expect(releaseSchema.parse(9)).toBe(9);
    });

    test('rejects numbers below 8', () => {
      expect(() => releaseSchema.parse('7')).toThrow();
      expect(() => releaseSchema.parse('0')).toThrow();
    });

    test('rejects numbers above 10', () => {
      expect(() => releaseSchema.parse('11')).toThrow();
      expect(() => releaseSchema.parse('99')).toThrow();
    });

    test('rejects non-numeric strings', () => {
      expect(() => releaseSchema.parse('abc')).toThrow();
    });
  });
});
