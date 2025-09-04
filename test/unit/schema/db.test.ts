import { describe, expect, test } from 'vitest';

import {
  followUpSchema,
  revertSchema,
  trackerSchema,
  prSchema,
  commitSchema,
  projectSchema,
} from '../../../src/schema/db';

describe('Database schemas', () => {
  describe('followUpSchema', () => {
    test('validates a valid follow-up', () => {
      const data = {
        sha: 'abc123def456',
        message: 'Follow-up: fix edge case',
        url: 'https://github.com/org/repo/commit/abc123def456',
      };

      const result = followUpSchema.parse(data);
      expect(result.sha).toBe('abc123def456');
      expect(result.message).toBe('Follow-up: fix edge case');
      expect(result.url).toBe(
        'https://github.com/org/repo/commit/abc123def456'
      );
    });

    test('accepts optional backported and waived fields', () => {
      const data = {
        sha: 'abc123',
        message: 'msg',
        url: 'https://github.com/org/repo/commit/abc123',
        backported: true,
        waived: false,
      };

      const result = followUpSchema.parse(data);
      expect(result.backported).toBe(true);
      expect(result.waived).toBe(false);
    });

    test('rejects missing sha', () => {
      const data = {
        message: 'msg',
        url: 'https://github.com/org/repo/commit/abc',
      };

      expect(() => followUpSchema.parse(data)).toThrow();
    });

    test('rejects invalid url', () => {
      const data = {
        sha: 'abc123',
        message: 'msg',
        url: 'not-a-valid-url',
      };

      expect(() => followUpSchema.parse(data)).toThrow();
    });
  });

  describe('revertSchema', () => {
    test('validates same structure as followUpSchema', () => {
      const data = {
        sha: 'revert123',
        message: 'Revert "Fix bug"',
        url: 'https://github.com/org/repo/commit/revert123',
      };

      const result = revertSchema.parse(data);
      expect(result.sha).toBe('revert123');
    });
  });

  describe('trackerSchema', () => {
    test('validates a valid tracker', () => {
      const data = {
        id: 'PROJ-1234',
        type: 'Bug',
        url: 'https://issues.example.com/browse/PROJ-1234',
        status: 'In Progress',
        statusCategory: 'In Progress',
        versions: ['CentOS Stream 9'],
        summary: '[follow-up to] - Fix memory leak',
      };

      const result = trackerSchema.parse(data);
      expect(result.id).toBe('PROJ-1234');
      expect(result.type).toBe('Bug');
      expect(result.versions).toHaveLength(1);
    });

    test('accepts optional clonedFrom', () => {
      const data = {
        id: 'PROJ-5678',
        type: 'Bug',
        url: 'https://issues.example.com/browse/PROJ-5678',
        status: 'New',
        statusCategory: 'To Do',
        versions: [],
        summary: 'Clone of PROJ-1234',
        clonedFrom: 'PROJ-1234',
      };

      const result = trackerSchema.parse(data);
      expect(result.clonedFrom).toBe('PROJ-1234');
    });

    test('rejects invalid url', () => {
      const data = {
        id: 'PROJ-1',
        type: 'Bug',
        url: 'invalid',
        status: 'New',
        statusCategory: 'To Do',
        versions: [],
        summary: 'summary',
      };

      expect(() => trackerSchema.parse(data)).toThrow();
    });

    test('rejects missing required fields', () => {
      expect(() => trackerSchema.parse({ id: 'PROJ-1' })).toThrow();
    });
  });

  describe('prSchema', () => {
    test('validates a valid PR', () => {
      const data = {
        number: 42,
        url: 'https://github.com/org/repo/pull/42',
      };

      const result = prSchema.parse(data);
      expect(result.number).toBe(42);
      expect(result.url).toBe('https://github.com/org/repo/pull/42');
    });

    test('accepts optional waived field', () => {
      const data = {
        number: 100,
        url: 'https://github.com/org/repo/pull/100',
        waived: true,
      };

      const result = prSchema.parse(data);
      expect(result.waived).toBe(true);
    });

    test('rejects non-number PR number', () => {
      const data = {
        number: 'not-a-number',
        url: 'https://github.com/org/repo/pull/1',
      };

      expect(() => prSchema.parse(data)).toThrow();
    });
  });

  describe('commitSchema', () => {
    test('validates a complete commit', () => {
      const data = {
        sha: 'abc123',
        url: 'https://github.com/org/repo/commit/abc123',
        cherryPicks: [
          {
            sha: 'cp1',
            url: 'https://github.com/org/repo/commit/cp1',
          },
        ],
        message: 'Fix issue\n\nSigned-off-by: Dev <dev@example.org>',
        followUps: [
          {
            sha: 'fu1',
            message: 'Follow-up fix',
            url: 'https://github.com/org/repo/commit/fu1',
          },
        ],
        reverts: [],
      };

      const result = commitSchema.parse(data);
      expect(result.sha).toBe('abc123');
      expect(result.cherryPicks).toHaveLength(1);
      expect(result.followUps).toHaveLength(1);
      expect(result.reverts).toHaveLength(0);
      expect(result.tracker).toBeUndefined();
      expect(result.pr).toBeUndefined();
    });

    test('validates commit with tracker and PR', () => {
      const data = {
        sha: 'abc123',
        url: 'https://github.com/org/repo/commit/abc123',
        cherryPicks: [],
        message: 'Fix',
        followUps: [],
        reverts: [],
        tracker: {
          id: 'PROJ-1',
          type: 'Bug',
          url: 'https://issues.example.com/browse/PROJ-1',
          status: 'New',
          statusCategory: 'To Do',
          versions: ['CentOS Stream 9'],
          summary: 'Fix issue',
        },
        pr: {
          number: 10,
          url: 'https://github.com/org/repo/pull/10',
          waived: false,
        },
      };

      const result = commitSchema.parse(data);
      expect(result.tracker?.id).toBe('PROJ-1');
      expect(result.pr?.number).toBe(10);
    });

    test('rejects missing required fields', () => {
      expect(() => commitSchema.parse({ sha: 'abc' })).toThrow();
    });
  });

  describe('projectSchema', () => {
    test('validates a complete project/database', () => {
      const data = {
        upstream: 'https://github.com/upstream/project.git',
        downstream: 'https://github.com/downstream/project.git',
        commits: [
          {
            sha: 'abc123',
            url: 'https://github.com/downstream/project/commit/abc123',
            cherryPicks: [],
            message: 'Fix bug',
            followUps: [],
            reverts: [],
          },
        ],
      };

      const result = projectSchema.parse(data);
      expect(result.upstream).toBe('https://github.com/upstream/project.git');
      expect(result.downstream).toBe(
        'https://github.com/downstream/project.git'
      );
      expect(result.commits).toHaveLength(1);
    });

    test('validates with empty commits', () => {
      const data = {
        upstream: 'https://github.com/upstream/project.git',
        downstream: 'https://github.com/downstream/project.git',
        commits: [],
      };

      const result = projectSchema.parse(data);
      expect(result.commits).toHaveLength(0);
    });

    test('rejects invalid upstream URL', () => {
      const data = {
        upstream: 'not-a-url',
        downstream: 'https://github.com/downstream/project.git',
        commits: [],
      };

      expect(() => projectSchema.parse(data)).toThrow();
    });
  });
});
