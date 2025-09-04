import chalk from 'chalk';
import {
  describe,
  expect,
  it,
  vi,
  beforeEach,
  afterEach,
  MockInstance,
} from 'vitest';

import { Logger } from '../../src/logger';

describe('Logger class', () => {
  let spy: MockInstance<typeof console.log>;

  beforeEach(() => {
    spy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it(`can be instantiated`, () => {
    const logger = new Logger();
    expect(logger).toBeDefined();
    expect(logger).toBeInstanceOf(Logger);
    expect(logger.noColor).toBe(false);
  });

  it(`can log messages`, () => {
    const logger = new Logger();

    logger.log('message');

    expect(spy).toHaveBeenCalledWith('message');
  });

  it(`can log messages without color`, () => {
    const logger = new Logger(true);

    logger.log(`${chalk.red('message')}`);

    expect(spy).toHaveBeenCalledWith('message');
  });

  it('does not log when message is undefined', () => {
    const logger = new Logger();

    logger.log(undefined);

    expect(spy).not.toHaveBeenCalled();
  });

  it('does not log when message is empty string', () => {
    const logger = new Logger();

    logger.log('');

    expect(spy).not.toHaveBeenCalled();
  });

  it('strips multiple ANSI codes from a single message', () => {
    const logger = new Logger(true);

    logger.log(`${chalk.red('red')} and ${chalk.blue('blue')} text`);

    expect(spy).toHaveBeenCalledWith('red and blue text');
  });

  it('strips bold and other chalk styles', () => {
    const logger = new Logger(true);

    logger.log(`${chalk.bold('bold')} ${chalk.italic('italic')}`);

    expect(spy).toHaveBeenCalledWith('bold italic');
  });

  it('preserves message without color codes when noColor is true', () => {
    const logger = new Logger(true);

    logger.log('plain text message');

    expect(spy).toHaveBeenCalledWith('plain text message');
  });

  it('defaults noColor to false', () => {
    const logger = new Logger();
    expect(logger.noColor).toBe(false);
  });

  it('colorRegex is a static property', () => {
    expect(Logger.colorRegex).toBeInstanceOf(RegExp);
  });
});
