import { describe, it, expect, vi, afterEach } from 'vitest';
import { saveJSON, loadJSON } from './persistence';

afterEach(() => vi.restoreAllMocks());

describe('persistence surfaces silent failures', () => {
  it('warns (and does not throw) when a localStorage write fails', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceeded');
      });

    expect(() => saveJSON('characters', { a: 1 })).not.toThrow();
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0][0])).toContain('saveJSON failed');

    setItem.mockRestore();
  });

  it('warns and returns the fallback when stored JSON is corrupt', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('{ not valid json');

    const out = loadJSON('characters', ['fallback']);

    expect(out).toEqual(['fallback']);
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0][0])).toContain('loadJSON failed');
  });
});
