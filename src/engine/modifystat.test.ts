import { describe, it, expect, vi } from 'vitest';
import type { Character, CombatState, ResolvedAction } from '@/types';

// Inject a self-cast ability with TWO Modify-Stat effects on the SAME stat.
vi.mock('@/data/skillTree', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/data/skillTree')>();
  return {
    ...actual,
    findNode: (id: string) =>
      id === 'double-ac'
        ? ({
            id, label: 'Wards', x: 0, y: 0, isCenter: false, description: '',
            linkedItem: {
              id: 'wards', type: 'Ability', name: 'Wards', range: 'Self', aoe: 'Single Target', hitType: 'Auto Hit',
              effects: [
                { id: 'a1', type: 'Modify Stat', statToModify: 'AC', modification: '+2', durationValue: 3, durationUnit: 'Rounds' },
                { id: 'a2', type: 'Modify Stat', statToModify: 'AC', modification: '+5', durationValue: 3, durationUnit: 'Rounds' },
              ],
            },
          } as never)
        : actual.findNode(id),
  };
});

import { createCombatant, resolveAction } from './combat';

function mkChar(id: string): Character {
  return {
    id, name: id, level: 3, coreStats: { mind: 4, body: 4, soul: 4 }, learnedSkills: ['center-0'],
    inventory: { armor: null, weapon: null, shield: null, accessories: [], backpack: [] },
    currentHP: 40, currentMP: 5, currentSP: 5,
  } as Character;
}

describe('two Modify-Stat effects on the same stat roll independently', () => {
  it('applies +2 and +5 (not +2 twice)', () => {
    const c = createCombatant(mkChar('u'), { team: 'player', position: { q: 0, r: 0 } });
    const foe = createCombatant(mkChar('foe'), { team: 'npc', position: { q: 2, r: 0 } });
    const state: CombatState = {
      isActive: true, phase: 'resolving', round: 1, combatants: [c, foe],
      declaredActions: {}, lockedActions: {}, resolutionQueue: [], activeResolutionIndex: -1, log: [],
    };
    const act = { actionIndex: 0, actionType: 'Use Ability', sourceId: 'u', targetId: 'u', actionId: 'double-ac', initiative: 1 } as ResolvedAction;
    const after = resolveAction(state, act, () => 0.5).state;
    const vals = after.combatants
      .find((x) => x.id === 'u')!
      .statusEffects.filter((e) => (e as { statToModify?: string }).statToModify === 'AC')
      .map((e) => (e as { rolledValue?: number }).rolledValue)
      .sort((x, y) => (x ?? 0) - (y ?? 0));
    expect(vals).toEqual([2, 5]); // independent rolls, not [2, 2]
  });
});
