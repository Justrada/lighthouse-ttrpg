import { describe, it, expect, vi } from 'vitest';
import type { Character, CombatState, Combatant, ResolvedAction } from '@/types';

// Inject synthetic drain abilities so these tests are decoupled from shipped
// skill-tree data. Each is Auto Hit + no save so damage lands deterministically
// with no attack-roll crit doubling.
vi.mock('@/data/skillTree', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/data/skillTree')>();
  const drainAbility = (over: Record<string, unknown>) => ({
    id: 'ab',
    type: 'Ability',
    name: 'Drain',
    range: 'Near',
    aoe: 'Single Target',
    hitType: 'Auto Hit',
    effects: [
      {
        id: 'e1',
        type: 'Apply Damage',
        savingThrowEnabled: false,
        useWeaponDamage: false,
        weaponMultiplier: 1,
        additionalDamage: '1d6',
        drainResourceEnabled: true,
        resourceDrainedFromTarget: 'HP',
        resourceReplenishedToSelf: 'HP',
        replenishAmount: 'Full',
        ...over,
      },
    ],
  });
  const node = (id: string, ability: unknown) => ({
    id, label: id, x: 0, y: 0, isCenter: false, description: '', linkedItem: ability,
  });
  const nodes: Record<string, unknown> = {
    'drain-hp-full': node('drain-hp-full', drainAbility({})),
    'drain-hp-half': node('drain-hp-half', drainAbility({ replenishAmount: 'Half' })),
    'drain-mp-full': node(
      'drain-mp-full',
      drainAbility({ resourceDrainedFromTarget: 'MP', resourceReplenishedToSelf: 'MP', replenishAmount: 'Full' }),
    ),
  };
  return {
    ...actual,
    findNode: (id: string) => (id in nodes ? (nodes[id] as never) : actual.findNode(id)),
  };
});

import { createCombatant, resolveAction } from './combat';
import type { Rng } from './dice';

const maxRng: Rng = () => 0.999999; // 1d6 -> 6

function mkChar(id: string): Character {
  return {
    id, name: id, level: 3, coreStats: { mind: 4, body: 4, soul: 4 }, learnedSkills: ['center-0'],
    inventory: { armor: null, weapon: null, shield: null, accessories: [], backpack: [] },
    currentHP: 40, currentMP: 5, currentSP: 5,
  } as Character;
}

function makeFighters(): { atk: Combatant; foe: Combatant } {
  const atk = createCombatant(mkChar('atk'), { team: 'player', position: { q: 0, r: 0 } });
  const foe = createCombatant(mkChar('foe'), { team: 'npc', position: { q: 1, r: 0 } });
  return { atk, foe };
}

function stateOf(atk: Combatant, foe: Combatant): CombatState {
  return {
    isActive: true, phase: 'resolving', round: 1, combatants: [atk, foe],
    declaredActions: {}, lockedActions: {}, resolutionQueue: [], activeResolutionIndex: -1, log: [],
  };
}

const useAbility = (sourceId: string, targetId: string, actionId: string): ResolvedAction =>
  ({ actionIndex: 0, actionType: 'Use Ability', sourceId, targetId, actionId, initiative: 1 } as ResolvedAction);

describe('HP-from-HP drain applies damage exactly once', () => {
  it('a vampiric (HP->HP, Full) drain removes the rolled damage ONCE, not twice', () => {
    const { atk, foe } = makeFighters();
    atk.currentHP = 10; atk.maxHP = 100;
    foe.currentHP = 60; foe.maxHP = 100;

    const after = resolveAction(stateOf(atk, foe), useAbility('atk', 'foe', 'drain-hp-full'), maxRng).state;
    const foeAfter = after.combatants.find((c) => c.id === 'foe')!;
    const atkAfter = after.combatants.find((c) => c.id === 'atk')!;

    expect(foeAfter.currentHP).toBe(54); // 60 - 6 (single subtraction). The bug double-hit -> 48.
    expect(atkAfter.currentHP).toBe(16); // Full replenish heals by the 6 dealt.
  });

  it('a Half-replenish HP drain still damages once and heals half', () => {
    const { atk, foe } = makeFighters();
    atk.currentHP = 10; atk.maxHP = 100;
    foe.currentHP = 60; foe.maxHP = 100;

    const after = resolveAction(stateOf(atk, foe), useAbility('atk', 'foe', 'drain-hp-half'), maxRng).state;
    const foeAfter = after.combatants.find((c) => c.id === 'foe')!;
    const atkAfter = after.combatants.find((c) => c.id === 'atk')!;

    expect(foeAfter.currentHP).toBe(54); // damage once
    expect(atkAfter.currentHP).toBe(13); // floor(6/2) = 3 healed
  });
});

describe('cross-pool drain (MP) is unaffected by the HP fix', () => {
  it('still drains the MP pool the damage never touched', () => {
    const { atk, foe } = makeFighters();
    atk.currentMP = 5; atk.maxMP = 100;
    foe.currentHP = 60; foe.maxHP = 100;
    foe.currentMP = 20; foe.maxMP = 100;

    const after = resolveAction(stateOf(atk, foe), useAbility('atk', 'foe', 'drain-mp-full'), maxRng).state;
    const foeAfter = after.combatants.find((c) => c.id === 'foe')!;
    const atkAfter = after.combatants.find((c) => c.id === 'atk')!;

    expect(foeAfter.currentHP).toBe(54); // HP damage applied once
    expect(foeAfter.currentMP).toBe(14); // 20 - 6 MP drained (different pool, still subtracts)
    expect(atkAfter.currentMP).toBe(11); // 5 + 6 replenished
  });
});

describe('drain replenish caps at the source TRUE max', () => {
  it('a source whose max is 0 banks nothing (no fallback-to-100)', () => {
    const { atk, foe } = makeFighters();
    atk.currentMP = 0; atk.maxMP = 0; // fully-debuffed pool
    foe.currentHP = 60; foe.maxHP = 100;
    foe.currentMP = 20; foe.maxMP = 100;

    const after = resolveAction(stateOf(atk, foe), useAbility('atk', 'foe', 'drain-mp-full'), maxRng).state;
    const atkAfter = after.combatants.find((c) => c.id === 'atk')!;
    const foeAfter = after.combatants.find((c) => c.id === 'foe')!;

    expect(atkAfter.currentMP).toBe(0); // capped at the real max of 0. The bug banked up to 100 -> 6.
    expect(foeAfter.currentMP).toBe(14); // drain still landed on the victim
  });
});
