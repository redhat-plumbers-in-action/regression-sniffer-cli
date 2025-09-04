import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  getDefaultValue,
  getOptions,
  getUserFromLogin,
  isDefaultValuesDisabled,
  raise,
  tokenUnavailable,
} from '../../src/util';

describe('Utility functions', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('raise()', () => {
    expect(() => raise('test')).toThrow('test');
  });

  test('tokenUnavailable()', () => {
    expect(() => tokenUnavailable('jira')).toThrowErrorMatchingInlineSnapshot(`
      [Error: JIRA_API_TOKEN not set.
      Please set the JIRA_API_TOKEN environment variable in '~/.config/regression-sniffer/.env' or '~/.env.regression-sniffer' or '~/.env.']
    `);

    expect(() => tokenUnavailable('github'))
      .toThrowErrorMatchingInlineSnapshot(`
      [Error: GITHUB_API_TOKEN not set.
      Please set the GITHUB_API_TOKEN environment variable in '~/.config/regression-sniffer/.env' or '~/.env.regression-sniffer' or '~/.env.']
    `);
  });

  test('isDefaultValuesDisabled()', () => {
    vi.stubEnv('NODEFAULTS', 'true');

    expect(isDefaultValuesDisabled()).toBe(true);

    vi.stubEnv('NODEFAULTS', '');

    expect(isDefaultValuesDisabled()).toBe(false);
  });

  test('getDefaultValue()', () => {
    let value = getDefaultValue('COMPONENT');
    expect(value).toBeUndefined();

    vi.stubEnv('NODEFAULTS', 'true');
    vi.stubEnv('COMPONENT', 'test');
    value = getDefaultValue('COMPONENT');
    expect(value).toBeUndefined();

    vi.stubEnv('NODEFAULTS', '');
    value = getDefaultValue('COMPONENT');
    expect(value).toBe('test');

    value = getDefaultValue('DRY');
    expect(value).toBe(false);

    vi.stubEnv('DRY', 'true');
    value = getDefaultValue('DRY');
    expect(value).toBe('true');
  });

  test('getDefaultValue() falls back to getUserFromLogin for LOGIN', () => {
    const value = getDefaultValue('LOGIN');
    expect(value).toMatch(/@redhat\.com$/);
  });

  test('getDefaultValue() for NOCOLOR without env returns false', () => {
    expect(getDefaultValue('NOCOLOR')).toBe(false);
  });

  test('getDefaultValue() for CLEANUP without env returns false', () => {
    expect(getDefaultValue('CLEANUP')).toBe(false);
  });

  test('getDefaultValue() for CLEANUP with env returns the value', () => {
    vi.stubEnv('CLEANUP', 'true');
    expect(getDefaultValue('CLEANUP')).toBe('true');
  });

  test('getUserFromLogin() returns email format', () => {
    const result = getUserFromLogin();
    expect(result).toBeDefined();
    expect(result).toMatch(/@redhat\.com$/);
  });

  test('getOptions()', () => {
    vi.stubEnv('COMPONENT', 'test');
    vi.stubEnv('UPSTREAM', 'systemd/systemd');
    vi.stubEnv('LOGIN', 'test@test.com');

    expect(
      getOptions({
        label: 'systemd-followup',
      })
    ).toMatchInlineSnapshot(`
      {
        "component": "test",
        "downstream": undefined,
        "epic": undefined,
        "label": "systemd-followup",
        "login": "test@test.com",
        "release": undefined,
        "upstream": "systemd/systemd",
      }
    `);

    vi.stubEnv('NODEFAULTS', 'true');
    expect(
      getOptions({
        component: 'systemd',
        label: 'systemd-followup',
      })
    ).toMatchInlineSnapshot(`
      {
        "component": "systemd",
        "downstream": undefined,
        "epic": undefined,
        "label": "systemd-followup",
        "login": undefined,
        "release": undefined,
        "upstream": undefined,
      }
    `);
  });

  test('getOptions() uses input values when present', () => {
    vi.stubEnv('COMPONENT', 'env-component');

    const result = getOptions({
      component: 'cli-component',
      release: '10',
      epic: 'EPIC-1',
      upstream: 'org/upstream',
      downstream: 'org/downstream',
      login: 'cli@example.com',
    });

    expect(result.component).toBe('cli-component');
    expect(result.release).toBe('10');
    expect(result.login).toBe('cli@example.com');
  });
});
