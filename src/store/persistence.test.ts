import { describe, it, expect, beforeEach } from 'vitest';
import { loadJSON, saveJSON, KEYS } from './persistence';

beforeEach(() => localStorage.clear());

describe('loadJSON', () => {
  it('returns the fallback when the stored value is literally "null"', () => {
    localStorage.setItem('lighthouse:prefs', 'null');
    expect(loadJSON(KEYS.prefs, { reduceMotion: false })).toEqual({ reduceMotion: false });
  });

  it('returns the fallback for missing or corrupt values', () => {
    expect(loadJSON('nope', { a: 1 })).toEqual({ a: 1 });
    localStorage.setItem('lighthouse:bad', '{not json');
    expect(loadJSON('bad', { a: 1 })).toEqual({ a: 1 });
  });

  it('round-trips a real value', () => {
    saveJSON('x', { hi: 5 });
    expect(loadJSON('x', null)).toEqual({ hi: 5 });
  });
});
