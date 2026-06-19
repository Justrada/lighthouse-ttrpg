import { describe, it, expect } from 'vitest';
import { normalizeCombatState } from './combat';

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
});
