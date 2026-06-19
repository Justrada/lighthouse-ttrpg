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

  it('clamps out-of-range core stats into [1, 12]', () => {
    const c = normalizeCharacter({ coreStats: { mind: -50, body: 9999, soul: 0 } } as unknown as Character);
    expect(c.coreStats).toEqual({ mind: 1, body: 12, soul: 1 });
  });

  it('clamps level into [1, 20]', () => {
    expect(normalizeCharacter({ level: 99999 } as Partial<Character>).level).toBe(20);
    expect(normalizeCharacter({ level: -5 } as Partial<Character>).level).toBe(1);
  });

  it('drops unknown and duplicate learned skills, keeping center-0', () => {
    const c = normalizeCharacter({
      learnedSkills: ['center-0', 'center-0', 'node-1', 'node-1', 'totally-fake-node'],
    } as Partial<Character>);
    expect(c.learnedSkills).toEqual(['center-0', 'node-1']);
  });

  it('trims whitespace and truncates an overlong name', () => {
    const c = normalizeCharacter({ name: '   ' + 'a'.repeat(100) } as Partial<Character>);
    expect(c.name).toHaveLength(40);
    expect(normalizeCharacter({ name: '   ' } as Partial<Character>).name).toBe('Unnamed Hero');
  });

  it('clamps negative current resources to zero', () => {
    const c = normalizeCharacter({ currentHP: -999, currentMP: -1, currentSP: -3 } as unknown as Character);
    expect(c.currentHP).toBe(0);
    expect(c.currentMP).toBe(0);
    expect(c.currentSP).toBe(0);
  });

  it('drops non-array skillChoices values so corrupt data cannot crash stats', () => {
    const c = normalizeCharacter({
      skillChoices: { 'node-1': [{ effectId: 'e', choice: 'Lore' }], 'node-2': { bad: true } },
    } as unknown as Character);
    expect(Array.isArray(c.skillChoices!['node-1'])).toBe(true);
    expect(c.skillChoices!['node-2']).toBeUndefined(); // non-array dropped
  });
});
