import { describe, it, expect, vi } from 'vitest';
import type { Character, CombatState, ResolvedAction } from '@/types';

// Inject a self-cast ability whose only effect is a TIMED 'Max SP -100' debuff —
// no shipped ability does this, but Worldforge/forge can persist arbitrary
// effects, so this exercises the apply/revert clamping path.
vi.mock('@/data/skillTree', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/data/skillTree')>();
  return {
    ...actual,
    findNode: (id: string) =>
      id === 'curse-node'
        ? ({
            id,
            label: 'Curse',
            x: 0,
            y: 0,
            isCenter: false,
            description: '',
            linkedItem: {
              id: 'curse',
              type: 'Ability',
              name: 'Curse',
              range: 'Self',
              aoe: 'Single Target',
              hitType: 'Auto Hit',
              effects: [
                { id: 'e1', type: 'Modify Stat', statToModify: 'Max SP', modification: '-100', durationValue: 1, durationUnit: 'Rounds' },
              ],
            },
          } as never)
        : actual.findNode(id),
  };
});

import { createCombatant, resolveAction, processEndOfRound } from './combat';

function mkChar(id: string): Character {
  return {
    id,
    name: id,
    level: 3,
    coreStats: { mind: 4, body: 4, soul: 4 },
    learnedSkills: ['center-0'],
    inventory: { armor: null, weapon: null, shield: null, accessories: [], backpack: [] },
    currentHP: 40,
    currentMP: 5,
    currentSP: 5,
  } as Character;
}

describe('timed Max-pool debuff reverts exactly (no inflation)', () => {
  it('a Max SP debuff that clamps the pool to 1 restores the original max on expiry', () => {
    const caster = createCombatant(mkChar('u'), { team: 'player', position: { q: 0, r: 0 } });
    caster.maxSP = 20;
    caster.currentSP = 20;
    const foe = createCombatant(mkChar('foe'), { team: 'npc', position: { q: 2, r: 0 } });
    let state: CombatState = {
      isActive: true, phase: 'resolving', round: 1, combatants: [caster, foe],
      declaredActions: {}, lockedActions: {}, resolutionQueue: [], activeResolutionIndex: -1, log: [],
    };
    const act = { actionIndex: 0, actionType: 'Use Ability', sourceId: 'u', targetId: 'u', actionId: 'curse-node', initiative: 1 } as ResolvedAction;
    state = resolveAction(state, act, () => 0.5).state;
    expect(state.combatants.find((c) => c.id === 'u')!.maxSP).toBe(1); // clamped on apply

    state = processEndOfRound(state); // the 1-round debuff expires
    expect(state.combatants.find((c) => c.id === 'u')!.maxSP).toBe(20); // restored, NOT 101
  });
});
