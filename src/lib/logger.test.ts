import { describe, it, expect, vi, afterEach } from 'vitest';
import { logger } from './logger';

afterEach(() => vi.restoreAllMocks());

describe('logger', () => {
  it('warn/error emit through console with a [scope] tag and extra args', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    logger.warn('persistence', 'boom', { k: 1 });
    logger.error('session', 'kaboom');

    expect(warn).toHaveBeenCalledWith('[persistence] boom', { k: 1 });
    expect(error).toHaveBeenCalledWith('[session] kaboom');
  });
});
