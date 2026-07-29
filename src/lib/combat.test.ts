import { describe, it, expect } from 'vitest';
import { normalizeCombatState, normalizeBattlefield } from './combat';

describe('normalizeCombatState', () => {
  it('defaults a missing combatants array so player selectors cannot crash', () => {
    const c = normalizeCombatState({ isActive: true });
    expect(Array.isArray(c.combatants)).toBe(true);
    expect(c.combatants).toHaveLength(0);
    expect(() => c.combatants.filter(Boolean)).not.toThrow();
  });

  it('coerces an invalid phase to declare and bad numbers to defaults', () => {
    const c = normalizeCombatState({ phase: 'nonsense', round: NaN, activeResolutionIndex: 'x' } as never);
    expect(c.phase).toBe('declare');
    expect(c.round).toBe(1);
    expect(c.activeResolutionIndex).toBe(-1);
  });

  it('never throws on null/garbage input', () => {
    expect(() => normalizeCombatState(null)).not.toThrow();
    expect(() => normalizeCombatState(42)).not.toThrow();
    expect(normalizeCombatState(undefined).declaredActions).toEqual({});
  });

  it('preserves a well-formed snapshot', () => {
    const snap = {
      isActive: true,
      phase: 'resolving',
      round: 4,
      combatants: [{ id: 'a' }],
      declaredActions: { a: [] },
      lockedActions: { a: true },
      resolutionQueue: [],
      activeResolutionIndex: 2,
      log: [{ id: 'l' }],
    };
    const c = normalizeCombatState(snap as never);
    expect(c.phase).toBe('resolving');
    expect(c.round).toBe(4);
    expect(c.combatants).toHaveLength(1);
    expect(c.lockedActions).toEqual({ a: true });
    expect(c.activeResolutionIndex).toBe(2);
  });

  it('drops non-object combatant entries from a hostile snapshot', () => {
    const c = normalizeCombatState({ combatants: [null, { id: 'x', team: 'player' }, 'bad', 42] } as never);
    expect(c.combatants).toHaveLength(1);
    expect((c.combatants[0] as { id?: string }).id).toBe('x');
  });

  it('carries a battlefield through, normalized', () => {
    const c = normalizeCombatState({ battlefield: { dims: { cols: 10, rows: 8 } } } as never);
    expect(c.battlefield?.dims).toEqual({ cols: 10, rows: 8 });
  });

  it('leaves battlefield absent for a plain-arena snapshot', () => {
    expect(normalizeCombatState({ isActive: true }).battlefield).toBeUndefined();
  });
});

describe('normalizeBattlefield', () => {
  it('clamps absurd dimensions instead of allocating until the tab dies', () => {
    const b = normalizeBattlefield({ dims: { cols: 1e9, rows: -5 } });
    expect(b?.dims.cols).toBe(200);
    expect(b?.dims.rows).toBe(1);
  });

  it('coerces missing or non-numeric dimensions to a usable minimum', () => {
    expect(normalizeBattlefield({}) ?.dims).toEqual({ cols: 1, rows: 1 });
    expect(normalizeBattlefield({ dims: { cols: 'x', rows: NaN } } as never)?.dims).toEqual({
      cols: 1,
      rows: 1,
    });
  });

  it('drops wall ids that are not safe integers', () => {
    const b = normalizeBattlefield({ dims: { cols: 4, rows: 4 }, walls: [1, NaN, 'x', 2.5, 7] } as never);
    expect(b?.walls).toEqual([1, 7]);
  });

  it('keeps only recognized door states, keyed by a numeric string', () => {
    const b = normalizeBattlefield({
      dims: { cols: 4, rows: 4 },
      doors: { '10': 'open', '11': 'ajar', notANumber: 'closed', '12': 'locked' },
    } as never);
    expect(b?.doors).toEqual({ '10': 'open', '12': 'locked' });
  });

  it('drops zone hexes with garbage or out-of-range coordinates', () => {
    const b = normalizeBattlefield({
      dims: { cols: 4, rows: 4 },
      zones: { player: [{ q: 1, r: 1 }, { q: NaN, r: 0 }, { q: 99999, r: 0 }, null], npc: 'nope' },
    } as never);
    expect(b?.zones?.player).toEqual([{ q: 1, r: 1 }]);
    expect(b?.zones?.npc).toEqual([]);
  });

  it('omits empty structure so an open arena short-circuits every check', () => {
    const b = normalizeBattlefield({ dims: { cols: 4, rows: 4 }, walls: [], solid: [], doors: {} });
    expect(b).toEqual({ dims: { cols: 4, rows: 4 } });
  });

  it('returns undefined for a non-object, and never throws', () => {
    expect(normalizeBattlefield(null)).toBeUndefined();
    expect(normalizeBattlefield([1, 2])).toBeUndefined();
    expect(() => normalizeBattlefield('nonsense')).not.toThrow();
  });
});
