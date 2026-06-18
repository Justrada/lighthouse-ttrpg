import { describe, it, expect } from 'vitest';
import type {
  Character,
  CombatState,
  Combatant,
  ResolvedAction,
} from '@/types';
import {
  createCombatant,
  resolveAction,
  resolveRound,
  processEndOfRound,
  getAOETargets,
  isTargetInRange,
  rollInitiativeForRound,
} from './combat';
import type { Rng } from './dice';

const SHORT_SWORD = 'inv_1747265725686_85e86a'; // 1d6 weapon
const MAGIC_LIGHT = 'node-1'; // Near, Roll to Hit (Lore), 1d4 damage
const POTION = 'inv_1747265797655_50203e'; // heals +1d10 HP

/** rng that always rolls max faces. */
const maxRng: Rng = () => 0.999999;
/** rng that always rolls 1. */
const minRng: Rng = () => 0;
/** rng yielding a fixed sequence (looping). */
function seqRng(seq: number[]): Rng {
  let i = 0;
  return () => seq[i++ % seq.length];
}

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: overrides.id ?? 'hero',
    name: overrides.name ?? 'Hero',
    level: 3,
    coreStats: { mind: 6, body: 8, soul: 4 },
    learnedSkills: ['center-0'],
    inventory: { armor: null, weapon: null, shield: null, accessories: [], backpack: [] },
    currentHP: 40,
    currentMP: 5,
    currentSP: 5,
    ...overrides,
  };
}

/** Build a simple two-combatant state, one player vs one npc, same line. */
function makeState(player: Combatant, npc: Combatant): CombatState {
  return {
    isActive: true,
    phase: 'resolving',
    round: 1,
    combatants: [player, npc],
    declaredActions: {},
    lockedActions: {},
    resolutionQueue: [],
    activeResolutionIndex: -1,
    log: [],
  };
}

function action(partial: Partial<ResolvedAction> & Pick<ResolvedAction, 'actionType' | 'sourceId'>): ResolvedAction {
  return {
    actionIndex: 0,
    sourceTeam: 'player',
    initiative: 0,
    ...partial,
  } as ResolvedAction;
}

describe('createCombatant', () => {
  it('derives max resources, AC, and the team battle line', () => {
    const c = createCombatant(makeCharacter(), { team: 'player' });
    expect(c.maxHP).toBe(40);
    expect(c.maxMP).toBe(5);
    expect(c.maxSP).toBe(5);
    expect(c.ac).toBe(14);
    expect(c.line).toBe(4); // BATTLE_LINES.playerStart
    expect(c.isUnconscious).toBe(false);
    expect(c.deathSaves).toEqual({ successes: 0, failures: 0 });
  });

  it('places npcs on the enemy line and starts KO at 0 HP', () => {
    const c = createCombatant(makeCharacter({ currentHP: 0 }), { team: 'npc' });
    expect(c.line).toBe(6);
    expect(c.isUnconscious).toBe(true);
  });
});

describe('isTargetInRange', () => {
  it('respects range bands by line distance', () => {
    const a = createCombatant(makeCharacter({ id: 'a' }), { team: 'player', line: 4 });
    const b = createCombatant(makeCharacter({ id: 'b' }), { team: 'npc', line: 5 });
    expect(isTargetInRange(a, b, 'Melee')).toBe(false); // distance 1
    expect(isTargetInRange(a, b, 'Near')).toBe(true); // distance <= 1
    b.line = 4;
    expect(isTargetInRange(a, b, 'Melee')).toBe(true); // same line
  });
});

describe('weapon attack resolution', () => {
  it('hits and deals weapon damage on a high roll', () => {
    const hero = createCombatant(makeCharacter({ id: 'hero', inventory: { armor: null, weapon: SHORT_SWORD, shield: null, accessories: [], backpack: [] } }), { team: 'player', line: 4 });
    const goblin = createCombatant(makeCharacter({ id: 'goblin', name: 'Goblin', coreStats: { mind: 4, body: 4, soul: 4 } }), { team: 'npc', line: 4 });
    const state = makeState(hero, goblin);
    const charLookup = (c: Combatant) =>
      c.id === 'hero' ? makeCharacter({ id: 'hero', inventory: { armor: null, weapon: SHORT_SWORD, shield: null, accessories: [], backpack: [] } }) : makeCharacter({ id: 'goblin', coreStats: { mind: 4, body: 4, soul: 4 } });

    // maxRng -> attack 20 (crit), weapon 1d6 -> 6, doubled to 12.
    const { state: after, results } = resolveAction(
      state,
      action({ actionType: 'Weapon Attack', sourceId: 'hero', sourceTeam: 'player', targetId: 'goblin', actionId: SHORT_SWORD }),
      maxRng,
      { charLookup },
    );

    const goblinAfter = after.combatants.find((c) => c.id === 'goblin')!;
    expect(goblinAfter.currentHP).toBe(40 - 12);
    expect(results.some((r) => r.kind === 'hit')).toBe(true);
  });

  it('misses on a natural 1', () => {
    const hero = createCombatant(makeCharacter({ id: 'hero', inventory: { armor: null, weapon: SHORT_SWORD, shield: null, accessories: [], backpack: [] } }), { team: 'player', line: 4 });
    const goblin = createCombatant(makeCharacter({ id: 'goblin', name: 'Goblin' }), { team: 'npc', line: 4 });
    const state = makeState(hero, goblin);

    const { state: after, results } = resolveAction(
      state,
      action({ actionType: 'Weapon Attack', sourceId: 'hero', targetId: 'goblin', actionId: SHORT_SWORD }),
      minRng,
    );
    const goblinAfter = after.combatants.find((c) => c.id === 'goblin')!;
    expect(goblinAfter.currentHP).toBe(40); // untouched
    expect(results.some((r) => r.kind === 'miss')).toBe(true);
  });

  it('does not mutate the input state', () => {
    const hero = createCombatant(makeCharacter({ id: 'hero', inventory: { armor: null, weapon: SHORT_SWORD, shield: null, accessories: [], backpack: [] } }), { team: 'player', line: 4 });
    const goblin = createCombatant(makeCharacter({ id: 'goblin' }), { team: 'npc', line: 4 });
    const state = makeState(hero, goblin);
    const before = JSON.parse(JSON.stringify(state));
    resolveAction(state, action({ actionType: 'Weapon Attack', sourceId: 'hero', targetId: 'goblin', actionId: SHORT_SWORD }), maxRng);
    expect(state).toEqual(before);
  });
});

describe('ability resolution', () => {
  it('spends MP and rolls to hit for Magic Light', () => {
    const caster = createCombatant(makeCharacter({ id: 'caster', currentMP: 5 }), { team: 'player', line: 5 });
    const target = createCombatant(makeCharacter({ id: 'target', name: 'Foe', coreStats: { mind: 4, body: 4, soul: 4 } }), { team: 'npc', line: 5 });
    const state = makeState(caster, target);
    const charLookup = (c: Combatant) =>
      c.id === 'caster' ? makeCharacter({ id: 'caster' }) : makeCharacter({ id: 'target', coreStats: { mind: 4, body: 4, soul: 4 } });

    // Magic Light costs 2 MP, Near range (distance 0 ok), 1d4 damage.
    const { state: after } = resolveAction(
      state,
      action({ actionType: 'Use Ability', sourceId: 'caster', sourceTeam: 'player', targetId: 'target', actionId: MAGIC_LIGHT }),
      maxRng,
      { charLookup },
    );
    const casterAfter = after.combatants.find((c) => c.id === 'caster')!;
    const targetAfter = after.combatants.find((c) => c.id === 'target')!;
    expect(casterAfter.currentMP).toBe(3); // 5 - 2
    // crit doubles 1d4 max (4) -> 8 damage
    expect(targetAfter.currentHP).toBe(40 - 8);
  });

  it('fails when out of range and does not spend resources', () => {
    const caster = createCombatant(makeCharacter({ id: 'caster', currentMP: 5 }), { team: 'player', line: 1 });
    const target = createCombatant(makeCharacter({ id: 'target' }), { team: 'npc', line: 9 });
    const state = makeState(caster, target);

    const { state: after, results } = resolveAction(
      state,
      action({ actionType: 'Use Ability', sourceId: 'caster', targetId: 'target', actionId: MAGIC_LIGHT }),
      maxRng,
    );
    const casterAfter = after.combatants.find((c) => c.id === 'caster')!;
    expect(casterAfter.currentMP).toBe(5); // not spent
    expect(results.some((r) => r.text.toLowerCase().includes('range'))).toBe(true);
  });
});

describe('healing item', () => {
  it('restores HP up to the maximum', () => {
    const healer = createCombatant(makeCharacter({ id: 'healer' }), { team: 'player', line: 4 });
    const ally = createCombatant(makeCharacter({ id: 'ally' }), { team: 'player', line: 4 });
    ally.currentHP = 10;
    const state = makeState(healer, ally);

    // Potion heals +1d10; maxRng -> 10.
    const { state: after, results } = resolveAction(
      state,
      action({ actionType: 'Use Item', sourceId: 'healer', targetId: 'ally', actionId: POTION }),
      maxRng,
    );
    const allyAfter = after.combatants.find((c) => c.id === 'ally')!;
    expect(allyAfter.currentHP).toBe(20); // 10 + 10
    expect(results.some((r) => r.kind === 'heal')).toBe(true);
  });
});

describe('guard', () => {
  it('marks the combatant as guarding with a Guarding effect', () => {
    const hero = createCombatant(makeCharacter({ id: 'hero' }), { team: 'player', line: 4 });
    const foe = createCombatant(makeCharacter({ id: 'foe' }), { team: 'npc', line: 4 });
    const state = makeState(hero, foe);
    const { state: after } = resolveAction(state, action({ actionType: 'Guard', sourceId: 'hero' }), maxRng);
    const heroAfter = after.combatants.find((c) => c.id === 'hero')!;
    expect(heroAfter.isGuarding).toBe(true);
    expect(heroAfter.statusEffects.some((e) => e.type === 'Guarding')).toBe(true);
  });
});

describe('death saves', () => {
  it('runs a death save when the source is unconscious at 0 HP', () => {
    const downed = createCombatant(makeCharacter({ id: 'downed', currentHP: 0 }), { team: 'player', line: 4 });
    expect(downed.isUnconscious).toBe(true);
    const foe = createCombatant(makeCharacter({ id: 'foe' }), { team: 'npc', line: 6 });
    const state = makeState(downed, foe);

    // minRng -> rolls 1 (nat 1) => +2 failures each time.
    let current = state;
    let failures = 0;
    for (let i = 0; i < 3; i++) {
      const res = resolveAction(current, action({ actionType: 'Pass', sourceId: 'downed' }), minRng);
      current = res.state;
      const c = current.combatants.find((x) => x.id === 'downed');
      if (!c) {
        // removed from combat -> dead
        expect(res.results.some((r) => r.kind === 'death')).toBe(true);
        return;
      }
      failures = c.deathSaves.failures;
    }
    // With nat-1 (+2 each), should be dead within 3 saves (2 then 4 then 6>=5).
    expect(current.combatants.find((x) => x.id === 'downed')).toBeUndefined();
  });

  it('stabilizes at 1 HP after enough successes (nat 20 = +2)', () => {
    const downed = createCombatant(makeCharacter({ id: 'downed', currentHP: 0 }), { team: 'player', line: 4 });
    const foe = createCombatant(makeCharacter({ id: 'foe' }), { team: 'npc', line: 6 });
    let current = makeState(downed, foe);

    // maxRng -> nat 20 each save (+2 successes); 3 saves -> 6 >= 5 -> revived.
    for (let i = 0; i < 3; i++) {
      const c = current.combatants.find((x) => x.id === 'downed')!;
      if (!c.isUnconscious) break;
      current = resolveAction(current, action({ actionType: 'Pass', sourceId: 'downed' }), maxRng).state;
    }
    const after = current.combatants.find((x) => x.id === 'downed')!;
    expect(after.isUnconscious).toBe(false);
    expect(after.currentHP).toBe(1);
  });
});

describe('lethal damage sets unconscious', () => {
  it('drops a target to 0 HP and marks it unconscious', () => {
    const hero = createCombatant(makeCharacter({ id: 'hero', inventory: { armor: null, weapon: SHORT_SWORD, shield: null, accessories: [], backpack: [] } }), { team: 'player', line: 4 });
    const weakling = createCombatant(makeCharacter({ id: 'weak', coreStats: { mind: 2, body: 2, soul: 2 } }), { team: 'npc', line: 4 });
    weakling.currentHP = 3; // less than a max 1d6 hit
    weakling.maxHP = 10;
    const state = makeState(hero, weakling);

    const { state: after } = resolveAction(
      state,
      action({ actionType: 'Weapon Attack', sourceId: 'hero', targetId: 'weak', actionId: SHORT_SWORD }),
      maxRng,
    );
    const weakAfter = after.combatants.find((c) => c.id === 'weak')!;
    expect(weakAfter.currentHP).toBe(0);
    expect(weakAfter.isUnconscious).toBe(true);
  });
});

describe('substitute cost protection', () => {
  it('diverts lethal overflow to the substitute resource, keeping HP at 1', () => {
    const hero = createCombatant(makeCharacter({ id: 'hero', inventory: { armor: null, weapon: SHORT_SWORD, shield: null, accessories: [], backpack: [] } }), { team: 'player', line: 4 });
    const tank = createCombatant(makeCharacter({ id: 'tank' }), { team: 'npc', line: 4 });
    tank.currentHP = 3;
    tank.maxHP = 40;
    tank.currentMP = 20;
    // Active Substitute Cost: gains HP by draining MP (most recent wins).
    tank.statusEffects.push({
      id: 'sub1',
      type: 'Substitute Cost',
      label: 'Substitute Cost',
      durationType: 'Rounds',
      durationValue: 5,
      // runtime fields read by the engine:
      ...( { resourceGained: 'HP', resourceDrained: 'MP', sourceTeam: 'npc' } as Record<string, unknown> ),
    });
    const state = makeState(hero, tank);

    // maxRng -> 1d6 weapon max = 6 (crit doubles to 12). Overflow beyond HP-1
    // should drain MP rather than knock the tank out.
    const { state: after } = resolveAction(
      state,
      action({ actionType: 'Weapon Attack', sourceId: 'hero', targetId: 'tank', actionId: SHORT_SWORD }),
      maxRng,
    );
    const tankAfter = after.combatants.find((c) => c.id === 'tank')!;
    expect(tankAfter.currentHP).toBe(1); // protected
    expect(tankAfter.isUnconscious).toBe(false);
    expect(tankAfter.currentMP).toBeLessThan(20); // MP was drained instead
  });
});

describe('AOE targeting', () => {
  it('hits all enemies within radius for an AOE pattern', () => {
    const caster = createCombatant(makeCharacter({ id: 'caster' }), { team: 'player', line: 4 });
    const e1 = createCombatant(makeCharacter({ id: 'e1' }), { team: 'npc', line: 5 });
    const e2 = createCombatant(makeCharacter({ id: 'e2' }), { team: 'npc', line: 6 });
    const e3 = createCombatant(makeCharacter({ id: 'e3' }), { team: 'npc', line: 9 });
    const state: CombatState = { ...makeState(caster, e1), combatants: [caster, e1, e2, e3] };

    const usable = { name: 'Blast', range: 'Far', aoe: 'AOE 3 (3 Rows)', hitType: 'Roll to Hit', effects: [] } as never;
    const targets = getAOETargets(state, e1, 'AOE 3 (3 Rows)', caster, usable);
    const ids = targets.map((t) => t.id).sort();
    // radius 1 around line 5 -> lines 4..6 -> e1 (5), e2 (6); e3 (9) excluded.
    expect(ids).toEqual(['e1', 'e2']);
  });
});

describe('round resolution', () => {
  it('rolls initiative and resolves declared actions in order', () => {
    const hero = createCombatant(makeCharacter({ id: 'hero', inventory: { armor: null, weapon: SHORT_SWORD, shield: null, accessories: [], backpack: [] } }), { team: 'player', line: 4 });
    const foe = createCombatant(makeCharacter({ id: 'foe', name: 'Foe' }), { team: 'npc', line: 4 });
    const state: CombatState = {
      ...makeState(hero, foe),
      declaredActions: {
        hero: [{ actionIndex: 0, actionType: 'Weapon Attack', actionId: SHORT_SWORD, targetId: 'foe' }],
        foe: [{ actionIndex: 0, actionType: 'Guard' }],
      },
    };

    const { steps, state: after } = resolveRound(state, seqRng([0.5, 0.5, 0.7, 0.3]));
    expect(steps.length).toBe(2);
    // every step carries a snapshot and a (possibly empty) result list
    for (const s of steps) {
      expect(s.snapshot).toBeDefined();
      expect(Array.isArray(s.results)).toBe(true);
    }
    expect(after.combatants.length).toBe(2);
  });

  it('processEndOfRound advances the round and clears Guard', () => {
    const hero = createCombatant(makeCharacter({ id: 'hero' }), { team: 'player', line: 4 });
    const foe = createCombatant(makeCharacter({ id: 'foe' }), { team: 'npc', line: 4 });
    hero.isGuarding = true;
    hero.statusEffects.push({ id: 'g1', type: 'Guarding', label: 'Guarding', durationType: 'Rounds', durationValue: 1 });
    const state = makeState(hero, foe);

    const next = processEndOfRound(state);
    expect(next.round).toBe(2);
    const heroAfter = next.combatants.find((c) => c.id === 'hero')!;
    expect(heroAfter.isGuarding).toBe(false);
    expect(heroAfter.statusEffects.some((e) => e.type === 'Guarding')).toBe(false);
  });

  it('rollInitiativeForRound emits one entry per declared action, sorted desc', () => {
    const hero = createCombatant(makeCharacter({ id: 'hero' }), { team: 'player', line: 4 });
    const foe = createCombatant(makeCharacter({ id: 'foe' }), { team: 'npc', line: 4 });
    const state: CombatState = {
      ...makeState(hero, foe),
      declaredActions: {
        hero: [
          { actionIndex: 0, actionType: 'Pass' },
          { actionIndex: 1, actionType: 'Pass' },
        ],
        foe: [{ actionIndex: 0, actionType: 'Pass' }],
      },
    };
    const queue = rollInitiativeForRound(state, seqRng([0.1, 0.9, 0.5]));
    expect(queue.length).toBe(3);
    for (let i = 1; i < queue.length; i++) {
      expect(queue[i - 1].initiative).toBeGreaterThanOrEqual(queue[i].initiative);
    }
  });
});

describe('damage-over-time at end of round (fix 1)', () => {
  /** Attach a pre-rolled DoT (Apply Damage) runtime effect to a combatant. */
  function attachDot(
    c: Combatant,
    rolledDamage: number,
    durationValue: number,
    sourceTeam: 'player' | 'npc' = 'npc',
  ): void {
    c.statusEffects.push({
      id: `dot_${c.id}`,
      type: 'Apply Damage',
      label: 'Searing Poison',
      durationType: 'Rounds',
      durationValue,
      ...({ durationUnit: 'Rounds', rolledDamage, sourceTeam } as Record<string, unknown>),
    });
  }

  it('applies stored DoT damage each round, logs danger, and expires', () => {
    const victim = createCombatant(makeCharacter({ id: 'victim' }), { team: 'player', line: 4 });
    const foe = createCombatant(makeCharacter({ id: 'foe' }), { team: 'npc', line: 6 });
    attachDot(victim, 4, 2);
    const state = makeState(victim, foe);

    // Round 1: 4 damage, DoT ticks to 1 remaining.
    const r1 = processEndOfRound(state);
    const v1 = r1.combatants.find((c) => c.id === 'victim')!;
    expect(v1.currentHP).toBe(40 - 4);
    expect(
      r1.log.some((e) => e.tone === 'danger' && /takes 4 damage from Searing Poison/.test(e.text)),
    ).toBe(true);
    const dot1 = v1.statusEffects.find((e) => e.type === 'Apply Damage') as
      | { durationValue?: number }
      | undefined;
    expect(dot1?.durationValue).toBe(1);

    // Round 2: another 4 damage, then the DoT expires.
    const r2 = processEndOfRound(r1);
    const v2 = r2.combatants.find((c) => c.id === 'victim')!;
    expect(v2.currentHP).toBe(40 - 8);
    expect(v2.statusEffects.some((e) => e.type === 'Apply Damage')).toBe(false);

    // Round 3: no DoT left, HP unchanged.
    const r3 = processEndOfRound(r2);
    const v3 = r3.combatants.find((c) => c.id === 'victim')!;
    expect(v3.currentHP).toBe(40 - 8);
  });

  it('knocks a combatant unconscious when DoT reaches 0 HP', () => {
    const victim = createCombatant(makeCharacter({ id: 'victim' }), { team: 'player', line: 4 });
    const foe = createCombatant(makeCharacter({ id: 'foe' }), { team: 'npc', line: 6 });
    victim.currentHP = 3;
    attachDot(victim, 5, 3);
    const state = makeState(victim, foe);

    const after = processEndOfRound(state);
    const v = after.combatants.find((c) => c.id === 'victim')!;
    expect(v.currentHP).toBe(0);
    expect(v.isUnconscious).toBe(true);
  });

  it('does not mutate the input state', () => {
    const victim = createCombatant(makeCharacter({ id: 'victim' }), { team: 'player', line: 4 });
    const foe = createCombatant(makeCharacter({ id: 'foe' }), { team: 'npc', line: 6 });
    attachDot(victim, 4, 2);
    const state = makeState(victim, foe);
    const before = JSON.parse(JSON.stringify(state));
    processEndOfRound(state);
    expect(state).toEqual(before);
  });
});

describe('revive with undefined maxHP (fix 3)', () => {
  it('does not write NaN HP when reviving a combatant without maxHP', () => {
    const downed = createCombatant(makeCharacter({ id: 'downed', currentHP: 0 }), { team: 'player', line: 4 });
    expect(downed.isUnconscious).toBe(true);
    // Simulate a combatant lacking a max HP value.
    (downed as { maxHP?: number }).maxHP = undefined;
    const ally = createCombatant(makeCharacter({ id: 'ally' }), { team: 'player', line: 4 });
    const state = makeState(downed, ally);

    // Potion heals +1d10; maxRng -> 10. Revives the downed combatant.
    const { state: after } = resolveAction(
      state,
      action({ actionType: 'Use Item', sourceId: 'ally', targetId: 'downed', actionId: POTION }),
      maxRng,
    );
    const downedAfter = after.combatants.find((c) => c.id === 'downed')!;
    expect(Number.isFinite(downedAfter.currentHP)).toBe(true);
    expect(downedAfter.currentHP).toBe(10);
    expect(downedAfter.isUnconscious).toBe(false);
  });
});

describe('unconscious / dead source gating (fix 4)', () => {
  it('an unconscious combatant with HP > 0 loses its turn without dealing damage', () => {
    const hero = createCombatant(
      makeCharacter({ id: 'hero', inventory: { armor: null, weapon: SHORT_SWORD, shield: null, accessories: [], backpack: [] } }),
      { team: 'player', line: 4 },
    );
    hero.isUnconscious = true; // GM-toggled KO while still at full HP
    const goblin = createCombatant(makeCharacter({ id: 'goblin', name: 'Goblin' }), { team: 'npc', line: 4 });
    const state = makeState(hero, goblin);

    const { state: after, results } = resolveAction(
      state,
      action({ actionType: 'Weapon Attack', sourceId: 'hero', targetId: 'goblin', actionId: SHORT_SWORD }),
      maxRng,
    );
    const goblinAfter = after.combatants.find((c) => c.id === 'goblin')!;
    expect(goblinAfter.currentHP).toBe(40); // untouched — hero never acted
    // No death save was rolled (HP > 0); just an informational skip.
    expect(results.some((r) => r.kind === 'save')).toBe(false);
    expect(results.some((r) => r.text.toLowerCase().includes('unconscious'))).toBe(true);
    // Hero is still standing (HP unchanged, no death save), not removed.
    expect(after.combatants.find((c) => c.id === 'hero')).toBeDefined();
  });

  it('a dead source does not act and rolls no death save', () => {
    const hero = createCombatant(
      makeCharacter({ id: 'hero', inventory: { armor: null, weapon: SHORT_SWORD, shield: null, accessories: [], backpack: [] } }),
      { team: 'player', line: 4 },
    );
    hero.isDead = true;
    hero.isUnconscious = true;
    hero.currentHP = 0;
    const goblin = createCombatant(makeCharacter({ id: 'goblin', name: 'Goblin' }), { team: 'npc', line: 4 });
    const state = makeState(hero, goblin);

    const { state: after, results } = resolveAction(
      state,
      action({ actionType: 'Weapon Attack', sourceId: 'hero', targetId: 'goblin', actionId: SHORT_SWORD }),
      maxRng,
    );
    expect(after.combatants.find((c) => c.id === 'goblin')!.currentHP).toBe(40);
    expect(results.some((r) => r.kind === 'save')).toBe(false);
  });
});

describe('Action-unit durations are not double-decremented (fix 5)', () => {
  it('stun for 2 Actions: per-action tick + end-of-round leaves 1 remaining', () => {
    const stunned = createCombatant(makeCharacter({ id: 'stunned' }), { team: 'player', line: 4 });
    const foe = createCombatant(makeCharacter({ id: 'foe' }), { team: 'npc', line: 6 });
    stunned.statusEffects.push({
      id: 'stun1',
      type: 'Stunned',
      label: 'Stunned',
      durationType: 'Actions',
      durationValue: 2,
      ...({ durationUnit: 'Actions' } as Record<string, unknown>),
    });
    const state = makeState(stunned, foe);

    // Per-action path consumes one stun charge (2 -> 1).
    const { state: afterAction } = resolveAction(
      state,
      action({ actionType: 'Pass', sourceId: 'stunned' }),
      maxRng,
    );
    const sMid = afterAction.combatants.find((c) => c.id === 'stunned')!;
    const stunMid = sMid.statusEffects.find((e) => e.type === 'Stunned') as
      | { durationValue?: number }
      | undefined;
    expect(stunMid?.durationValue).toBe(1);

    // End of round must NOT decrement an Actions-unit effect again.
    const afterRound = processEndOfRound(afterAction);
    const sEnd = afterRound.combatants.find((c) => c.id === 'stunned')!;
    const stunEnd = sEnd.statusEffects.find((e) => e.type === 'Stunned') as
      | { durationValue?: number }
      | undefined;
    expect(stunEnd?.durationValue).toBe(1); // still 1, not 0/expired
  });

  it('Rounds-unit effects still tick down and expire at end of round', () => {
    const c = createCombatant(makeCharacter({ id: 'c' }), { team: 'player', line: 4 });
    const foe = createCombatant(makeCharacter({ id: 'foe' }), { team: 'npc', line: 6 });
    c.statusEffects.push({
      id: 'buff1',
      type: 'SomeBuff',
      label: 'SomeBuff',
      durationType: 'Rounds',
      durationValue: 1,
      ...({ durationUnit: 'Rounds' } as Record<string, unknown>),
    });
    const state = makeState(c, foe);
    const after = processEndOfRound(state);
    const cAfter = after.combatants.find((x) => x.id === 'c')!;
    expect(cAfter.statusEffects.some((e) => e.type === 'SomeBuff')).toBe(false);
  });
});
