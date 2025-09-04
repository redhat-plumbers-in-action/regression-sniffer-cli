import { afterEach, describe, expect, it, test, vi } from 'vitest';

import { Database } from '../../src/db';
import { Logger } from '../../src/logger';
import { CommitDb } from '../../src/schema/db';

const mocks = vi.hoisted(() => {
  return {
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

vi.mock('node:fs', () => {
  return {
    readFileSync: mocks.readFileSync,
    writeFileSync: mocks.writeFileSync,
  };
});

function createLogger(): Logger {
  return new Logger(true);
}

function createCommit(overrides: Partial<CommitDb> = {}): CommitDb {
  return {
    sha: 'abc123def456',
    url: 'https://github.com/example/project/commit/abc123def456',
    cherryPicks: [
      {
        sha: 'cherry123',
        url: 'https://github.com/example/project/commit/cherry123',
      },
    ],
    message:
      'Fix memory leak in event handler\n\nSigned-off-by: Dev <dev@example.org>',
    followUps: [
      {
        sha: 'followup456',
        message: 'Follow-up: address edge case in event handler',
        url: 'https://github.com/upstream/project/commit/followup456',
        waived: false,
      },
    ],
    reverts: [
      {
        sha: 'revert789',
        message: 'Revert "Fix memory leak in event handler"',
        url: 'https://github.com/upstream/project/commit/revert789',
        waived: false,
      },
    ],
    tracker: {
      id: 'PROJ-1234',
      type: 'Bug',
      url: 'https://issues.example.com/browse/PROJ-1234',
      status: 'New',
      statusCategory: 'To Do',
      versions: ['CentOS Stream 9'],
      summary: '[follow-up to] - Fix memory leak in event handler',
    },
    pr: {
      number: 42,
      url: 'https://github.com/example/project/pull/42',
      waived: false,
    },
    ...overrides,
  };
}

describe('Database class', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('can be instantiated with no commits', () => {
    const db = new Database(
      'https://github.com/upstream/project.git',
      'https://github.com/downstream/project.git',
      [],
      createLogger()
    );

    expect(db).toBeDefined();
    expect(db).toBeInstanceOf(Database);
    expect(db.upstream).toBe('https://github.com/upstream/project.git');
    expect(db.downstream).toBe('https://github.com/downstream/project.git');
    expect(db.commits).toEqual([]);
  });

  it('can be instantiated with commits', () => {
    const commit = createCommit();
    const db = new Database(
      'https://github.com/upstream/project.git',
      'https://github.com/downstream/project.git',
      [commit],
      createLogger()
    );

    expect(db.commits).toHaveLength(1);
    expect(db.commits[0].sha).toBe('abc123def456');
  });

  test('getDatabase()', () => {
    const commit = createCommit();
    const db = new Database(
      'https://github.com/upstream/project.git',
      'https://github.com/downstream/project.git',
      [commit],
      createLogger()
    );

    const result = db.getDatabase();

    expect(result).toEqual({
      upstream: 'https://github.com/upstream/project.git',
      downstream: 'https://github.com/downstream/project.git',
      commits: [commit],
    });
  });

  test('writeToFile()', () => {
    const commit = createCommit();
    const db = new Database(
      'https://github.com/upstream/project.git',
      'https://github.com/downstream/project.git',
      [commit],
      createLogger()
    );

    db.writeToFile('/tmp/test-db.json');

    expect(mocks.writeFileSync).toHaveBeenCalledTimes(1);
    expect(mocks.writeFileSync).toHaveBeenCalledWith(
      '/tmp/test-db.json',
      expect.any(String),
      { encoding: 'utf-8' }
    );

    const written = JSON.parse(mocks.writeFileSync.mock.calls[0][1]);
    expect(written.upstream).toBe('https://github.com/upstream/project.git');
    expect(written.downstream).toBe(
      'https://github.com/downstream/project.git'
    );
    expect(written.commits).toHaveLength(1);
    expect(written.commits[0].sha).toBe('abc123def456');
  });

  test('fromFile()', () => {
    const fileData = {
      upstream: 'https://github.com/upstream/project.git',
      downstream: 'https://github.com/downstream/project.git',
      commits: [createCommit()],
    };

    mocks.readFileSync.mockReturnValue(JSON.stringify(fileData));

    const db = Database.fromFile('/tmp/test-db.json', createLogger());

    expect(mocks.readFileSync).toHaveBeenCalledWith('/tmp/test-db.json', {
      encoding: 'utf-8',
    });
    expect(db).toBeInstanceOf(Database);
    expect(db.upstream).toBe('https://github.com/upstream/project.git');
    expect(db.downstream).toBe('https://github.com/downstream/project.git');
    expect(db.commits).toHaveLength(1);
  });

  test('fromFile() - throws on invalid data', () => {
    mocks.readFileSync.mockReturnValue('{ "invalid": true }');

    expect(() => Database.fromFile('/tmp/bad.json', createLogger())).toThrow();
  });

  test('show() logs commit info', () => {
    const logger = createLogger();
    const logSpy = vi.spyOn(logger, 'log').mockImplementation(() => {});

    const db = new Database(
      'https://github.com/upstream/project.git',
      'https://github.com/downstream/project.git',
      [createCommit()],
      logger
    );

    db.show();

    expect(logSpy).toHaveBeenCalled();
  });

  test('show() with empty commits', () => {
    const logger = createLogger();
    const logSpy = vi.spyOn(logger, 'log').mockImplementation(() => {});

    const db = new Database(
      'https://github.com/upstream/project.git',
      'https://github.com/downstream/project.git',
      [],
      logger
    );

    db.show();

    expect(logSpy).not.toHaveBeenCalled();
  });

  test('commits can be mutated after construction', () => {
    const db = new Database(
      'https://github.com/upstream/project.git',
      'https://github.com/downstream/project.git',
      [],
      createLogger()
    );

    expect(db.commits).toHaveLength(0);

    db.commits.push(createCommit());
    expect(db.commits).toHaveLength(1);

    db.commits.push(createCommit({ sha: 'def789' }));
    expect(db.commits).toHaveLength(2);
  });

  test('show() with commit that has no follow-ups or reverts', () => {
    const logger = createLogger();
    const logSpy = vi.spyOn(logger, 'log').mockImplementation(() => {});

    const db = new Database(
      'https://github.com/upstream/project.git',
      'https://github.com/downstream/project.git',
      [createCommit({ followUps: [], reverts: [] })],
      logger
    );

    db.show();

    expect(logSpy).toHaveBeenCalled();
    const calls = logSpy.mock.calls.map(c => c[0]);
    expect(
      calls.some(c => typeof c === 'string' && c.includes('Commit:'))
    ).toBe(true);
  });

  test('show() with commit that has no cherry-picks', () => {
    const logger = createLogger();
    const logSpy = vi.spyOn(logger, 'log').mockImplementation(() => {});

    const db = new Database(
      'https://github.com/upstream/project.git',
      'https://github.com/downstream/project.git',
      [createCommit({ cherryPicks: [] })],
      logger
    );

    db.show();

    expect(logSpy).toHaveBeenCalled();
  });

  test('show() with commit that has no PR', () => {
    const logger = createLogger();
    const logSpy = vi.spyOn(logger, 'log').mockImplementation(() => {});

    const db = new Database(
      'https://github.com/upstream/project.git',
      'https://github.com/downstream/project.git',
      [createCommit({ pr: undefined })],
      logger
    );

    db.show();

    expect(logSpy).toHaveBeenCalled();
    const calls = logSpy.mock.calls.map(c => c[0]);
    expect(calls.some(c => typeof c === 'string' && c.includes('PR:'))).toBe(
      true
    );
  });

  test('show() with multiple commits', () => {
    const logger = createLogger();
    const logSpy = vi.spyOn(logger, 'log').mockImplementation(() => {});

    const db = new Database(
      'https://github.com/upstream/project.git',
      'https://github.com/downstream/project.git',
      [
        createCommit({ sha: 'commit1' }),
        createCommit({
          sha: 'commit2',
          followUps: [],
          reverts: [],
          cherryPicks: [],
          pr: undefined,
        }),
      ],
      logger
    );

    db.show();

    const commitCalls = logSpy.mock.calls.filter(
      c => typeof c[0] === 'string' && c[0].includes('Commit:')
    );
    expect(commitCalls).toHaveLength(2);
  });
});
