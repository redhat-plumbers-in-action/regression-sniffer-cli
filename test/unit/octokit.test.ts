import { afterEach, describe, expect, test, vi } from 'vitest';

import { getOctokit } from '../../src/octokit';

let capturedThrottleOptions: any = {};

const actionsMocks = vi.hoisted(() => ({
  warning: vi.fn(),
  info: vi.fn(),
}));

vi.mock('@actions/core', () => ({
  warning: actionsMocks.warning,
  info: actionsMocks.info,
}));

vi.mock('@octokit/core', () => {
  return {
    Octokit: {
      plugin: () => {
        return class MockOctokit {
          constructor(options: any) {
            capturedThrottleOptions = options.throttle;
          }
        };
      },
    },
  };
});

vi.mock('@octokit/plugin-throttling', () => ({
  throttling: {},
}));

describe('Octokit', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    capturedThrottleOptions = {};
  });

  test('getOctokit() creates an instance', () => {
    const octokit = getOctokit('token');
    expect(octokit).toBeDefined();
  });

  describe('onRateLimit', () => {
    test('retries on first rate limit hit', () => {
      getOctokit('token');

      const result = capturedThrottleOptions.onRateLimit(
        60,
        { method: 'GET', url: '/repos/test' },
        {},
        0
      );

      expect(result).toBe(true);
      expect(actionsMocks.warning).toHaveBeenCalledWith(
        expect.stringContaining('Request quota exhausted')
      );
      expect(actionsMocks.info).toHaveBeenCalledWith(
        expect.stringContaining('Retrying after 60 seconds')
      );
    });

    test('does not retry after first attempt', () => {
      getOctokit('token');

      const result = capturedThrottleOptions.onRateLimit(
        60,
        { method: 'GET', url: '/repos/test' },
        {},
        1
      );

      expect(result).toBeUndefined();
      expect(actionsMocks.warning).toHaveBeenCalled();
    });
  });

  describe('onSecondaryRateLimit', () => {
    test('logs warning and does not retry', () => {
      getOctokit('token');

      const result = capturedThrottleOptions.onSecondaryRateLimit(
        60,
        { method: 'POST', url: '/repos/test/issues' },
        {}
      );

      expect(result).toBeUndefined();
      expect(actionsMocks.warning).toHaveBeenCalledWith(
        expect.stringContaining('SecondaryRateLimit detected')
      );
    });
  });
});
