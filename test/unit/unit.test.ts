import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  getDefaultValue,
  getOptions,
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

  test('getOptions()', () => {
    vi.stubEnv('COMPONENT', 'test');
    vi.stubEnv('UPSTREAM', 'systemd/systemd');

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
        "release": undefined,
        "upstream": undefined,
      }
    `);
  });
});
