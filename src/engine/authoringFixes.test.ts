import { describe, it, expect, afterEach } from 'vitest';
import type { Character, CombatState, Combatant, ResolvedAction, SkillNode, SkillEffect } from '@/types';
import { createCombatant, resolveAction, processEndOfRound } from './combat';
import { setActiveCatalog, buildActiveCatalog, resetActiveCatalog } from '@/data/skillTree';
import type { Rng } from './dice';

const maxRng: Rng = () => 0.999999;

function abilityNode(effects: SkillEffect[], over: Record<string, unknown> = {}): SkillNode {
  return {
    id: 'cn', x: 0, y: 0, label: 'Test', description: '', isCenter: false,
    linkedItem: {
      id: 'ab', type: 'Ability', name: 'Test', description: '',
      range: 'Self', aoe: 'Single Target', hitType: 'Auto Hit', combatUse: true,
      effects, ...over,
    },
  } as never;
}

function mkChar(id: string): Character {
  return {
    id, name: id, level: 3, coreStats: { mind: 6, body: 6, soul: 6 }, learnedSkills: ['center-0'],
    inventory: { armor: null, weapon: null, shield: null, accessories: [], backpack: [] },
    currentHP: 40, currentMP: 10, currentSP: 10,
  } as Character;
}

function selfCast(node: SkillNode): Combatant {
  setActiveCatalog(buildActiveCatalog({ nodes: [node], edges: [], worldItems: {} }, 'extend'));
  const c = createCombatant(mkChar('u'), { team: 'player', position: { q: 0, r: 0 } });
  const state: CombatState = {
    isActive: true, phase: 'resolving', round: 1, combatants: [c],
    declaredActions: {}, lockedActions: {}, resolutionQueue: [], activeResolutionIndex: -1, log: [],
  };
  const act = { actionIndex: 0, actionType: 'Use Ability', sourceId: 'u', targetId: 'u', actionId: 'cn', initiative: 1 } as ResolvedAction;
  return resolveAction(state, act, maxRng).state.combatants.find((x) => x.id === 'u')!;
}

const acEffect = (over: Partial<SkillEffect>): SkillEffect =>
  ({ id: 'e', type: 'Modify Stat', statToModify: 'AC', modification: '+5', ...over }) as SkillEffect;

afterEach(() => resetActiveCatalog());

describe('Modify-Stat non-pool buffs apply (no silent no-op)', () => {
  it('a Permanent +5 AC buff is applied and persists across a round', () => {
    const after = selfCast(abilityNode([acEffect({ durationUnit: 'Permanent', durationValue: 0 })]));
    const buff = after.statusEffects.find((e) => (e as { statToModify?: string }).statToModify === 'AC');
    expect(buff).toBeTruthy();
    expect((buff as { rolledValue?: number }).rolledValue).toBe(5);
    // survives end-of-round ticking (Permanent never expires)
    const ticked = processEndOfRound({ isActive: true, phase: 'resolving', round: 1, combatants: [after], declaredActions: {}, lockedActions: {}, resolutionQueue: [], activeResolutionIndex: -1, log: [] } as CombatState);
    expect(ticked.combatants[0].statusEffects.some((e) => (e as { statToModify?: string }).statToModify === 'AC')).toBe(true);
  });

  it('an untimed (no-duration) +3 AC buff still applies', () => {
    const after = selfCast(abilityNode([acEffect({ modification: '+3' })])); // no durationValue/unit at all
    const buff = after.statusEffects.find((e) => (e as { statToModify?: string }).statToModify === 'AC');
    expect(buff).toBeTruthy();
    expect((buff as { rolledValue?: number }).rolledValue).toBe(3);
  });

  it('a timed +2 AC buff still expires as before (no regression)', () => {
    const after = selfCast(abilityNode([acEffect({ modification: '+2', durationUnit: 'Rounds', durationValue: 1 })]));
    expect(after.statusEffects.some((e) => (e as { statToModify?: string }).statToModify === 'AC')).toBe(true);
    const ticked = processEndOfRound({ isActive: true, phase: 'resolving', round: 1, combatants: [after], declaredActions: {}, lockedActions: {}, resolutionQueue: [], activeResolutionIndex: -1, log: [] } as CombatState);
    expect(ticked.combatants[0].statusEffects.some((e) => (e as { statToModify?: string }).statToModify === 'AC')).toBe(false); // 1-round buff gone
  });
});

describe('negative ability cost cannot refund resources', () => {
  it('a cost of -5 MP does not increase the caster MP', () => {
    const node = abilityNode(
      [{ id: 'd', type: 'Apply Damage', useWeaponDamage: false, additionalDamage: '1d4' } as SkillEffect],
      { cost: { type: 'MP', value: -5 } },
    );
    const after = selfCast(node);
    expect(after.currentMP).toBe(10); // unchanged — NOT 15 (no refund)
  });
});
