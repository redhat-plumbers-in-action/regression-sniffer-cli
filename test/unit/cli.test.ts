import { afterEach, describe, expect, it, test, vi } from 'vitest';

import { cli } from '../../src/cli';

describe('CLI setup', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('creates a Command with correct name and version', () => {
    vi.stubEnv('NODEFAULTS', 'true');
    const program = cli();

    expect(program.name()).toBe('regression-sniffer');
    expect(program.version()).toBe('1.0.1');
  });

  it('has required options defined', () => {
    vi.stubEnv('NODEFAULTS', 'true');
    const program = cli();
    const options = program.options;

    const optionNames = options.map(opt => opt.long);
    expect(optionNames).toContain('--component');
    expect(optionNames).toContain('--release');
    expect(optionNames).toContain('--epic');
    expect(optionNames).toContain('--downstream');
    expect(optionNames).toContain('--login');
  });

  it('has optional options defined', () => {
    vi.stubEnv('NODEFAULTS', 'true');
    const program = cli();
    const options = program.options;

    const optionNames = options.map(opt => opt.long);
    expect(optionNames).toContain('--from');
    expect(optionNames).toContain('--upstream');
    expect(optionNames).toContain('--label');
    expect(optionNames).toContain('--cleanup');
    expect(optionNames).toContain('--nocolor');
    expect(optionNames).toContain('--dry');
  });

  describe('option parsing', () => {
    test('parses all required options', () => {
      vi.stubEnv('NODEFAULTS', 'true');
      const program = cli();

      program.parse([
        'node',
        'test',
        '-c',
        'my-component',
        '-r',
        '9',
        '-e',
        'EPIC-123',
        '-d',
        'org/downstream-repo',
        '-l',
        'user@example.com',
      ]);

      const opts = program.opts();
      expect(opts.component).toBe('my-component');
      expect(opts.release).toBe('9');
      expect(opts.epic).toBe('EPIC-123');
      expect(opts.downstream).toBe('org/downstream-repo');
      expect(opts.login).toBe('user@example.com');
    });

    test('parses optional flags', () => {
      vi.stubEnv('NODEFAULTS', 'true');
      const program = cli();

      program.parse([
        'node',
        'test',
        '-c',
        'component',
        '-r',
        '10',
        '-e',
        'EPIC-1',
        '-d',
        'org/repo',
        '-l',
        'user@example.com',
        '-u',
        'upstream-org/upstream-repo',
        '-f',
        'v250',
        '-L',
        'custom-label',
        '-w',
        '-n',
        '-x',
      ]);

      const opts = program.opts();
      expect(opts.upstream).toBe('upstream-org/upstream-repo');
      expect(opts.from).toBe('v250');
      expect(opts.label).toBe('custom-label');
      expect(opts.cleanup).toBe(true);
      expect(opts.nocolor).toBe(true);
      expect(opts.dry).toBe(true);
    });

    test('uses environment variable defaults', () => {
      vi.stubEnv('COMPONENT', 'env-component');
      vi.stubEnv('RELEASE', '9');
      vi.stubEnv('EPIC', 'ENV-EPIC');
      vi.stubEnv('DOWNSTREAM', 'env-org/env-repo');
      vi.stubEnv('LOGIN', 'env-user@example.com');

      const program = cli();
      program.parse(['node', 'test']);

      const opts = program.opts();
      expect(opts.component).toBe('env-component');
      expect(opts.release).toBe('9');
      expect(opts.epic).toBe('ENV-EPIC');
      expect(opts.downstream).toBe('env-org/env-repo');
      expect(opts.login).toBe('env-user@example.com');
    });

    test('command-line options override env defaults', () => {
      vi.stubEnv('COMPONENT', 'env-component');
      vi.stubEnv('RELEASE', '9');
      vi.stubEnv('EPIC', 'ENV-EPIC');
      vi.stubEnv('DOWNSTREAM', 'env-org/env-repo');
      vi.stubEnv('LOGIN', 'env@example.com');

      const program = cli();
      program.parse(['node', 'test', '-c', 'cli-component', '-r', '10']);

      const opts = program.opts();
      expect(opts.component).toBe('cli-component');
      expect(opts.release).toBe('10');
    });
  });
});
