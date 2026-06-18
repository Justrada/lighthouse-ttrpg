import { describe, it, expect } from 'vitest';
import { normalizeCharacter } from './character';
import type { Character } from '@/types';

describe('normalizeCharacter', () => {
  it('fills safe defaults for a malformed/partial character', () => {
    const c = normalizeCharacter({ id: 'x', name: 'Broken' } as Partial<Character>);
    expect(c.learnedSkills).toContain('center-0');
    expect(c.inventory).toEqual({
      armor: null,
      weapon: null,
      shield: null,
      accessories: [],
      backpack: [],
    });
    expect(c.coreStats).toEqual({ mind: 4, body: 4, soul: 4 });
    expect(c.level).toBe(1);
    expect(Number.isFinite(c.currentHP)).toBe(true);
  });

  it('never throws on null/undefined input', () => {
    expect(() => normalizeCharacter(null)).not.toThrow();
    expect(() => normalizeCharacter(undefined)).not.toThrow();
    expect(normalizeCharacter(null).learnedSkills).toContain('center-0');
  });

  it('preserves valid data and guarantees center-0 is present', () => {
    const c = normalizeCharacter({
      id: 'y',
      name: 'Hero',
      level: 3,
      coreStats: { mind: 6, body: 5, soul: 4 },
      learnedSkills: ['node-1'],
      inventory: { armor: 'a1', weapon: null, shield: null, accessories: ['acc'], backpack: [] },
    } as Partial<Character>);
    expect(c.level).toBe(3);
    expect(c.coreStats).toEqual({ mind: 6, body: 5, soul: 4 });
    expect(c.learnedSkills).toEqual(['center-0', 'node-1']);
    expect(c.inventory.armor).toBe('a1');
    expect(c.inventory.accessories).toEqual(['acc']);
  });

  it('coerces non-finite numbers to safe values', () => {
    const c = normalizeCharacter({
      level: NaN,
      currentHP: Infinity,
      coreStats: { mind: NaN, body: 5, soul: 4 },
    } as unknown as Character);
    expect(c.level).toBe(1);
    expect(c.currentHP).toBe(0);
    expect(c.coreStats.mind).toBe(4);
    expect(c.coreStats.body).toBe(5);
  });
});
