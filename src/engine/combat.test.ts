import { describe, it, expect } from 'vitest';
import type {
  Character,
  CombatState,
  Combatant,
  HexCoord,
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
import { hexDistance } from './hex';
import type { Rng } from './dice';

const SHORT_SWORD = 'inv_1747265725686_85e86a'; // 1d6 Melee weapon
const LONG_SWORD = 'inv_1747317465886_544d9f'; // 1d8 Melee weapon
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

/** Shorthand for an axial hex. */
const hex = (q: number, r: number): HexCoord => ({ q, r });

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

/** Build a simple two-combatant state, one player vs one npc. */
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
  it('derives max resources, AC, and a default origin position', () => {
    const c = createCombatant(makeCharacter(), { team: 'player' });
    expect(c.maxHP).toBe(40);
    expect(c.maxMP).toBe(5);
    expect(c.maxSP).toBe(5);
    expect(c.ac).toBe(14);
    expect(c.position).toEqual({ q: 0, r: 0 }); // caller assigns real placement
    expect(c.equippedWeaponId).toBeUndefined();
    expect(c.isUnconscious).toBe(false);
    expect(c.deathSaves).toEqual({ successes: 0, failures: 0 });
  });

  it('honors an explicit position and starts KO at 0 HP', () => {
    const c = createCombatant(makeCharacter({ currentHP: 0 }), { team: 'npc', position: hex(3, 0) });
    expect(c.position).toEqual({ q: 3, r: 0 });
    expect(c.isUnconscious).toBe(true);
  });
});

describe('isTargetInRange', () => {
  it('treats Melee as adjacent (distance 1)', () => {
    const a = createCombatant(makeCharacter({ id: 'a' }), { team: 'player', position: hex(0, 0) });
    const b = createCombatant(makeCharacter({ id: 'b' }), { team: 'npc', position: hex(1, 0) });
    expect(hexDistance(a.position, b.position)).toBe(1);
    expect(isTargetInRange(a, b, 'Melee')).toBe(true); // adjacent
    b.position = hex(2, 0); // distance 2
    expect(isTargetInRange(a, b, 'Melee')).toBe(false); // no longer adjacent
  });

  it('maps each band to its hex distance', () => {
    const a = createCombatant(makeCharacter({ id: 'a' }), { team: 'player', position: hex(0, 0) });
    const b = createCombatant(makeCharacter({ id: 'b' }), { team: 'npc', position: hex(2, 0) });
    // distance 2: out of Melee(1), in Near(2)/Far(4)/Distant(6)
    expect(isTargetInRange(a, b, 'Melee')).toBe(false);
    expect(isTargetInRange(a, b, 'Near')).toBe(true);
    b.position = hex(4, 0); // distance 4
    expect(isTargetInRange(a, b, 'Near')).toBe(false);
    expect(isTargetInRange(a, b, 'Far')).toBe(true);
    b.position = hex(6, 0); // distance 6
    expect(isTargetInRange(a, b, 'Far')).toBe(false);
    expect(isTargetInRange(a, b, 'Distant')).toBe(true);
    expect(isTargetInRange(a, b, 'Battlefield')).toBe(true); // always
  });

  it('resolves Self by team, regardless of distance', () => {
    const a = createCombatant(makeCharacter({ id: 'a' }), { team: 'player', position: hex(0, 0) });
    const ally = createCombatant(makeCharacter({ id: 'ally' }), { team: 'player', position: hex(8, 6) });
    const enemy = createCombatant(makeCharacter({ id: 'enemy' }), { team: 'npc', position: hex(0, 0) });
    expect(isTargetInRange(a, ally, 'Self')).toBe(true);
    expect(isTargetInRange(a, enemy, 'Self')).toBe(false);
  });

  it('returns false for an unknown range band', () => {
    const a = createCombatant(makeCharacter({ id: 'a' }), { team: 'player', position: hex(0, 0) });
    const b = createCombatant(makeCharacter({ id: 'b' }), { team: 'npc', position: hex(0, 0) });
    expect(isTargetInRange(a, b, 'Nonsense')).toBe(false);
  });
});

describe('weapon attack resolution', () => {
  const heroChar = () =>
    makeCharacter({ id: 'hero', inventory: { armor: null, weapon: SHORT_SWORD, shield: null, accessories: [], backpack: [] } });

  it('hits and deals weapon damage on a high roll', () => {
    const hero = createCombatant(heroChar(), { team: 'player', position: hex(0, 0) });
    const goblin = createCombatant(makeCharacter({ id: 'goblin', name: 'Goblin', coreStats: { mind: 4, body: 4, soul: 4 } }), { team: 'npc', position: hex(1, 0) });
    const state = makeState(hero, goblin);
    const charLookup = (c: Combatant) =>
      c.id === 'hero' ? heroChar() : makeCharacter({ id: 'goblin', coreStats: { mind: 4, body: 4, soul: 4 } });

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
    const hero = createCombatant(heroChar(), { team: 'player', position: hex(0, 0) });
    const goblin = createCombatant(makeCharacter({ id: 'goblin', name: 'Goblin' }), { team: 'npc', position: hex(1, 0) });
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

  it('is out of range when the target is two hexes away (melee)', () => {
    const hero = createCombatant(heroChar(), { team: 'player', position: hex(0, 0) });
    const goblin = createCombatant(makeCharacter({ id: 'goblin', name: 'Goblin' }), { team: 'npc', position: hex(2, 0) });
    const state = makeState(hero, goblin);

    const { state: after, log } = resolveAction(
      state,
      action({ actionType: 'Weapon Attack', sourceId: 'hero', targetId: 'goblin', actionId: SHORT_SWORD }),
      maxRng,
    );
    expect(after.combatants.find((c) => c.id === 'goblin')!.currentHP).toBe(40); // not hit
    expect(log.some((e) => e.text.toLowerCase().includes('out of range'))).toBe(true);
  });

  it('does not mutate the input state', () => {
    const hero = createCombatant(heroChar(), { team: 'player', position: hex(0, 0) });
    const goblin = createCombatant(makeCharacter({ id: 'goblin' }), { team: 'npc', position: hex(1, 0) });
    const state = makeState(hero, goblin);
    const before = JSON.parse(JSON.stringify(state));
    resolveAction(state, action({ actionType: 'Weapon Attack', sourceId: 'hero', targetId: 'goblin', actionId: SHORT_SWORD }), maxRng);
    expect(state).toEqual(before);
  });
});

describe('Change Equipment', () => {
  it('sets equippedWeaponId and costs the action', () => {
    const hero = createCombatant(makeCharacter({ id: 'hero' }), { team: 'player', position: hex(0, 0) });
    const foe = createCombatant(makeCharacter({ id: 'foe' }), { team: 'npc', position: hex(1, 0) });
    const state = makeState(hero, foe);

    const { state: after, results } = resolveAction(
      state,
      action({ actionType: 'Change Equipment', sourceId: 'hero', actionId: LONG_SWORD }),
      maxRng,
    );
    const heroAfter = after.combatants.find((c) => c.id === 'hero')!;
    expect(heroAfter.equippedWeaponId).toBe(LONG_SWORD);
    expect(results.some((r) => r.text.toLowerCase().includes('swap'))).toBe(true);
  });

  it('changes which weapon a Weapon Attack uses', () => {
    // Hero's character has a short sword equipped (1d6 -> crit 12). After swapping
    // to the long sword (1d8 -> crit 16), the next attack uses the new weapon even
    // though the declared actionId still names the short sword.
    const heroChar = makeCharacter({ id: 'hero', inventory: { armor: null, weapon: SHORT_SWORD, shield: null, accessories: [], backpack: [] } });
    const hero = createCombatant(heroChar, { team: 'player', position: hex(0, 0) });
    hero.equippedWeaponId = LONG_SWORD; // swapped earlier this fight
    const goblin = createCombatant(makeCharacter({ id: 'goblin', coreStats: { mind: 4, body: 4, soul: 4 } }), { team: 'npc', position: hex(1, 0) });
    const state = makeState(hero, goblin);
    const charLookup = (c: Combatant) => (c.id === 'hero' ? heroChar : makeCharacter({ id: 'goblin', coreStats: { mind: 4, body: 4, soul: 4 } }));

    const { state: after } = resolveAction(
      state,
      action({ actionType: 'Weapon Attack', sourceId: 'hero', targetId: 'goblin', actionId: SHORT_SWORD }),
      maxRng,
      { charLookup },
    );
    const goblinAfter = after.combatants.find((c) => c.id === 'goblin')!;
    // Long sword (1d8 max 8, crit x2) = 16 damage, not the short sword's 12.
    expect(goblinAfter.currentHP).toBe(40 - 16);
  });
});

describe('ability resolution', () => {
  it('spends MP and rolls to hit for Magic Light', () => {
    const caster = createCombatant(makeCharacter({ id: 'caster', currentMP: 5 }), { team: 'player', position: hex(0, 0) });
    const target = createCombatant(makeCharacter({ id: 'target', name: 'Foe', coreStats: { mind: 4, body: 4, soul: 4 } }), { team: 'npc', position: hex(1, 0) });
    const state = makeState(caster, target);
    const charLookup = (c: Combatant) =>
      c.id === 'caster' ? makeCharacter({ id: 'caster' }) : makeCharacter({ id: 'target', coreStats: { mind: 4, body: 4, soul: 4 } });

    // Magic Light costs 2 MP, Near range (distance 1 ok), 1d4 damage.
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
    const caster = createCombatant(makeCharacter({ id: 'caster', currentMP: 5 }), { team: 'player', position: hex(0, 0) });
    const target = createCombatant(makeCharacter({ id: 'target' }), { team: 'npc', position: hex(8, 0) }); // distance 8 > Near
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
    const healer = createCombatant(makeCharacter({ id: 'healer' }), { team: 'player', position: hex(0, 0) });
    const ally = createCombatant(makeCharacter({ id: 'ally' }), { team: 'player', position: hex(1, 0) });
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
    const hero = createCombatant(makeCharacter({ id: 'hero' }), { team: 'player', position: hex(0, 0) });
    const foe = createCombatant(makeCharacter({ id: 'foe' }), { team: 'npc', position: hex(1, 0) });
    const state = makeState(hero, foe);
    const { state: after } = resolveAction(state, action({ actionType: 'Guard', sourceId: 'hero' }), maxRng);
    const heroAfter = after.combatants.find((c) => c.id === 'hero')!;
    expect(heroAfter.isGuarding).toBe(true);
    expect(heroAfter.statusEffects.some((e) => e.type === 'Guarding')).toBe(true);
  });
});

describe('movement', () => {
  it('walks to a target hex within MOVE_RANGE', () => {
    const hero = createCombatant(makeCharacter({ id: 'hero' }), { team: 'player', position: hex(0, 3) });
    const foe = createCombatant(makeCharacter({ id: 'foe' }), { team: 'npc', position: hex(8, 0) });
    const state = makeState(hero, foe);

    const { state: after, results } = resolveAction(
      state,
      action({ actionType: 'Move', sourceId: 'hero', targetHex: hex(3, 3) }), // distance 3 <= MOVE_RANGE(4)
      maxRng,
    );
    const heroAfter = after.combatants.find((c) => c.id === 'hero')!;
    expect(heroAfter.position).toEqual({ q: 3, r: 3 });
    expect(results.some((r) => r.kind === 'move')).toBe(true);
  });

  it('stops at the closest reachable hex when the target is beyond MOVE_RANGE', () => {
    const hero = createCombatant(makeCharacter({ id: 'hero' }), { team: 'player', position: hex(0, 3) });
    const foe = createCombatant(makeCharacter({ id: 'foe' }), { team: 'npc', position: hex(8, 6) });
    const state = makeState(hero, foe);

    const { state: after } = resolveAction(
      state,
      action({ actionType: 'Move', sourceId: 'hero', targetHex: hex(8, 3) }), // distance 8, budget MOVE_RANGE(6)
      maxRng,
    );
    const heroAfter = after.combatants.find((c) => c.id === 'hero')!;
    expect(hexDistance(hex(0, 3), heroAfter.position)).toBeLessThanOrEqual(6);
    expect(hexDistance(heroAfter.position, hex(8, 3))).toBe(2); // got as close as the budget allows
  });

  it('does not land on a hex occupied by another combatant', () => {
    const hero = createCombatant(makeCharacter({ id: 'hero' }), { team: 'player', position: hex(0, 3) });
    const blocker = createCombatant(makeCharacter({ id: 'blocker' }), { team: 'npc', position: hex(2, 3) });
    const state = makeState(hero, blocker);

    const { state: after } = resolveAction(
      state,
      action({ actionType: 'Move', sourceId: 'hero', targetHex: hex(2, 3) }), // occupied
      maxRng,
    );
    const heroAfter = after.combatants.find((c) => c.id === 'hero')!;
    expect(heroAfter.position).not.toEqual({ q: 2, r: 3 }); // never on the blocker
    expect(hexDistance(heroAfter.position, hex(2, 3))).toBe(1); // adjacent, as close as possible
  });
});

describe('flee', () => {
  it('moves the source away from its pursuer', () => {
    const hero = createCombatant(makeCharacter({ id: 'hero' }), { team: 'player', position: hex(4, 3) });
    const foe = createCombatant(makeCharacter({ id: 'foe' }), { team: 'npc', position: hex(2, 3) });
    const state = makeState(hero, foe);

    const distBefore = hexDistance(hero.position, foe.position);
    const { state: after, results } = resolveAction(
      state,
      action({ actionType: 'Flee', sourceId: 'hero', targetId: 'foe' }),
      maxRng,
    );
    const heroAfter = after.combatants.find((c) => c.id === 'hero')!;
    expect(hexDistance(heroAfter.position, hex(2, 3))).toBeGreaterThan(distBefore);
    expect(results.some((r) => r.kind === 'move')).toBe(true);
  });
});

describe('push / pull (Move Target effect)', () => {
  // "Knock Knock" (node-86): Melee, Roll to Hit (Physical), pushes the target
  //   2 hexes Away From the source (save: Physical DC 15 to negate).
  // "Parry" (node-94): Near, Roll to Hit (Stealth), pulls the target 1 hex
  //   Towards the source (no save on the move).
  const KNOCK_KNOCK = 'node-86';
  const PARRY = 'node-94';

  /** Strong attacker so it lands; the target is feeble so it fails its save. */
  const strong = (id: string) => makeCharacter({ id, coreStats: { mind: 6, body: 10, soul: 8 }, currentSP: 50 });
  const feeble = (id: string) => makeCharacter({ id, coreStats: { mind: 2, body: 2, soul: 2 } });
  const lookup = (srcId: string) => (c: Combatant) => (c.id === srcId ? strong(srcId) : feeble(c.id));

  /** rng: attack rolls a nat 20 (hit), every subsequent roll is a nat 1 (save fails). */
  const hitThenFailSave = (): Rng => {
    let i = 0;
    const seq = [0.999999, 0, 0, 0, 0, 0, 0, 0];
    return () => seq[Math.min(i++, seq.length - 1)];
  };

  it('pushes the target away from the source', () => {
    const src = createCombatant(strong('src'), { team: 'npc', position: hex(4, 3) });
    const tgt = createCombatant(feeble('tgt'), { team: 'player', position: hex(5, 3) }); // adjacent (melee)
    const { state: after } = resolveAction(
      makeState(src, tgt),
      action({ actionType: 'Use Ability', sourceId: 'src', sourceTeam: 'npc', targetId: 'tgt', actionId: KNOCK_KNOCK }),
      hitThenFailSave(),
      { charLookup: lookup('src') },
    );
    const t = after.combatants.find((c) => c.id === 'tgt')!;
    // Pushed 2 hexes further from the source along the line.
    expect(hexDistance(t.position, hex(4, 3))).toBe(3);
    expect(t.position).toEqual({ q: 7, r: 3 });
  });

  it('a push stops before a hex occupied by another combatant', () => {
    const src = createCombatant(strong('src'), { team: 'npc', position: hex(4, 3) });
    const tgt = createCombatant(feeble('tgt'), { team: 'player', position: hex(5, 3) }); // adjacent
    const wall = createCombatant(feeble('wall'), { team: 'player', position: hex(7, 3) }); // two hexes out
    const state: CombatState = { ...makeState(src, tgt), combatants: [src, tgt, wall] };
    const { state: after } = resolveAction(
      state,
      action({ actionType: 'Use Ability', sourceId: 'src', sourceTeam: 'npc', targetId: 'tgt', actionId: KNOCK_KNOCK }),
      hitThenFailSave(),
      { charLookup: lookup('src') },
    );
    const t = after.combatants.find((c) => c.id === 'tgt')!;
    // Step 1 to {6,3} is open; step 2 would hit the wall at {7,3}, so it halts.
    expect(t.position).toEqual({ q: 6, r: 3 });
    expect(after.combatants.find((c) => c.id === 'wall')!.position).toEqual({ q: 7, r: 3 });
  });

  it('a push stops at the grid edge', () => {
    const src = createCombatant(strong('src'), { team: 'npc', position: hex(14, 3) });
    const tgt = createCombatant(feeble('tgt'), { team: 'player', position: hex(15, 3) }); // adjacent, against the right edge
    const { state: after } = resolveAction(
      makeState(src, tgt),
      action({ actionType: 'Use Ability', sourceId: 'src', sourceTeam: 'npc', targetId: 'tgt', actionId: KNOCK_KNOCK }),
      hitThenFailSave(),
      { charLookup: lookup('src') },
    );
    const t = after.combatants.find((c) => c.id === 'tgt')!;
    // Only one of the two push steps fits before the rightmost column; it halts there.
    expect(t.position).toEqual({ q: 16, r: 3 });
    expect(hexDistance(hex(15, 3), t.position)).toBe(1);
  });

  it('pulls the target one hex toward the source', () => {
    const src = createCombatant(strong('src'), { team: 'npc', position: hex(0, 3) });
    const tgt = createCombatant(feeble('tgt'), { team: 'player', position: hex(2, 3) }); // distance 2 (Near)
    const { state: after } = resolveAction(
      makeState(src, tgt),
      action({ actionType: 'Use Ability', sourceId: 'src', sourceTeam: 'npc', targetId: 'tgt', actionId: PARRY }),
      maxRng, // Parry's move has no save, so a clean hit always pulls
      { charLookup: lookup('src') },
    );
    const t = after.combatants.find((c) => c.id === 'tgt')!;
    expect(t.position).toEqual({ q: 1, r: 3 });
    expect(hexDistance(t.position, hex(0, 3))).toBe(1); // closer, but not on top of the source
  });

  it('a pull cannot move a target that is already adjacent', () => {
    const src = createCombatant(strong('src'), { team: 'npc', position: hex(1, 3) });
    const tgt = createCombatant(feeble('tgt'), { team: 'player', position: hex(2, 3) }); // already adjacent
    const { state: after } = resolveAction(
      makeState(src, tgt),
      action({ actionType: 'Use Ability', sourceId: 'src', sourceTeam: 'npc', targetId: 'tgt', actionId: PARRY }),
      maxRng,
      { charLookup: lookup('src') },
    );
    const t = after.combatants.find((c) => c.id === 'tgt')!;
    expect(t.position).toEqual({ q: 2, r: 3 }); // unmoved
  });
});

describe('death saves', () => {
  it('runs a death save when the source is unconscious at 0 HP', () => {
    const downed = createCombatant(makeCharacter({ id: 'downed', currentHP: 0 }), { team: 'player', position: hex(0, 6) });
    expect(downed.isUnconscious).toBe(true);
    const foe = createCombatant(makeCharacter({ id: 'foe' }), { team: 'npc', position: hex(0, 0) });
    const state = makeState(downed, foe);

    // minRng -> rolls 1 (nat 1) => +2 failures each time.
    let current = state;
    for (let i = 0; i < 3; i++) {
      const res = resolveAction(current, action({ actionType: 'Pass', sourceId: 'downed' }), minRng);
      current = res.state;
      const c = current.combatants.find((x) => x.id === 'downed');
      if (!c) {
        expect(res.results.some((r) => r.kind === 'death')).toBe(true);
        return;
      }
    }
    expect(current.combatants.find((x) => x.id === 'downed')).toBeUndefined();
  });

  it('stabilizes at 1 HP after enough successes (nat 20 = +2)', () => {
    const downed = createCombatant(makeCharacter({ id: 'downed', currentHP: 0 }), { team: 'player', position: hex(0, 6) });
    const foe = createCombatant(makeCharacter({ id: 'foe' }), { team: 'npc', position: hex(0, 0) });
    let current = makeState(downed, foe);

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
    const hero = createCombatant(makeCharacter({ id: 'hero', inventory: { armor: null, weapon: SHORT_SWORD, shield: null, accessories: [], backpack: [] } }), { team: 'player', position: hex(0, 0) });
    const weakling = createCombatant(makeCharacter({ id: 'weak', coreStats: { mind: 2, body: 2, soul: 2 } }), { team: 'npc', position: hex(1, 0) });
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
    const hero = createCombatant(makeCharacter({ id: 'hero', inventory: { armor: null, weapon: SHORT_SWORD, shield: null, accessories: [], backpack: [] } }), { team: 'player', position: hex(0, 0) });
    const tank = createCombatant(makeCharacter({ id: 'tank' }), { team: 'npc', position: hex(1, 0) });
    tank.currentHP = 3;
    tank.maxHP = 40;
    tank.currentMP = 20;
    tank.statusEffects.push({
      id: 'sub1',
      type: 'Substitute Cost',
      label: 'Substitute Cost',
      durationType: 'Rounds',
      durationValue: 5,
      ...( { resourceGained: 'HP', resourceDrained: 'MP', sourceTeam: 'npc' } as Record<string, unknown> ),
    });
    const state = makeState(hero, tank);

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
  it('hits all enemies within the hex-distance radius for an AOE pattern', () => {
    const caster = createCombatant(makeCharacter({ id: 'caster' }), { team: 'player', position: hex(0, 0) });
    const e1 = createCombatant(makeCharacter({ id: 'e1' }), { team: 'npc', position: hex(4, 0) }); // primary
    const e2 = createCombatant(makeCharacter({ id: 'e2' }), { team: 'npc', position: hex(5, 0) }); // dist 1 from e1
    const e3 = createCombatant(makeCharacter({ id: 'e3' }), { team: 'npc', position: hex(8, 0) }); // dist 4 from e1
    const state: CombatState = { ...makeState(caster, e1), combatants: [caster, e1, e2, e3] };

    const usable = { name: 'Blast', range: 'Far', aoe: 'AOE 3', hitType: 'Roll to Hit', effects: [] } as never;
    // AOE 3 -> radius floor(3/2)=1 around e1: e1 (0) and e2 (1); e3 (4) excluded.
    const targets = getAOETargets(state, e1, 'AOE 3', caster, usable);
    expect(targets.map((t) => t.id).sort()).toEqual(['e1', 'e2']);
  });

  it('selects combatants along a line/cone from the source through the primary', () => {
    const caster = createCombatant(makeCharacter({ id: 'caster' }), { team: 'player', position: hex(0, 0) });
    // primary on the same row two hexes out; the line projects outward from there.
    const p = createCombatant(makeCharacter({ id: 'p' }), { team: 'npc', position: hex(2, 0) });
    const behind = createCombatant(makeCharacter({ id: 'behind' }), { team: 'npc', position: hex(4, 0) }); // on the projected line
    const offLine = createCombatant(makeCharacter({ id: 'off' }), { team: 'npc', position: hex(3, 2) }); // off to the side
    const state: CombatState = { ...makeState(caster, p), combatants: [caster, p, behind, offLine] };

    const usable = { name: 'Lance', range: 'Far', aoe: 'Target Line (4 Row)', hitType: 'Roll to Hit', effects: [] } as never;
    const targets = getAOETargets(state, p, 'Target Line (4 Row)', caster, usable);
    const ids = targets.map((t) => t.id).sort();
    expect(ids).toContain('p');
    expect(ids).toContain('behind');
    expect(ids).not.toContain('off');
  });
});

describe('round resolution', () => {
  it('rolls initiative and resolves declared actions in order', () => {
    const hero = createCombatant(makeCharacter({ id: 'hero', inventory: { armor: null, weapon: SHORT_SWORD, shield: null, accessories: [], backpack: [] } }), { team: 'player', position: hex(0, 0) });
    const foe = createCombatant(makeCharacter({ id: 'foe', name: 'Foe' }), { team: 'npc', position: hex(1, 0) });
    const state: CombatState = {
      ...makeState(hero, foe),
      declaredActions: {
        hero: [{ actionIndex: 0, actionType: 'Weapon Attack', actionId: SHORT_SWORD, targetId: 'foe' }],
        foe: [{ actionIndex: 0, actionType: 'Guard' }],
      },
    };

    const { steps, state: after } = resolveRound(state, seqRng([0.5, 0.5, 0.7, 0.3]));
    expect(steps.length).toBe(2);
    for (const s of steps) {
      expect(s.snapshot).toBeDefined();
      expect(Array.isArray(s.results)).toBe(true);
    }
    expect(after.combatants.length).toBe(2);
  });

  it('processEndOfRound advances the round and clears Guard', () => {
    const hero = createCombatant(makeCharacter({ id: 'hero' }), { team: 'player', position: hex(0, 0) });
    const foe = createCombatant(makeCharacter({ id: 'foe' }), { team: 'npc', position: hex(1, 0) });
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
    const hero = createCombatant(makeCharacter({ id: 'hero' }), { team: 'player', position: hex(0, 0) });
    const foe = createCombatant(makeCharacter({ id: 'foe' }), { team: 'npc', position: hex(1, 0) });
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
    const victim = createCombatant(makeCharacter({ id: 'victim' }), { team: 'player', position: hex(0, 6) });
    const foe = createCombatant(makeCharacter({ id: 'foe' }), { team: 'npc', position: hex(0, 0) });
    attachDot(victim, 4, 2);
    const state = makeState(victim, foe);

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

    const r2 = processEndOfRound(r1);
    const v2 = r2.combatants.find((c) => c.id === 'victim')!;
    expect(v2.currentHP).toBe(40 - 8);
    expect(v2.statusEffects.some((e) => e.type === 'Apply Damage')).toBe(false);

    const r3 = processEndOfRound(r2);
    const v3 = r3.combatants.find((c) => c.id === 'victim')!;
    expect(v3.currentHP).toBe(40 - 8);
  });

  it('knocks a combatant unconscious when DoT reaches 0 HP', () => {
    const victim = createCombatant(makeCharacter({ id: 'victim' }), { team: 'player', position: hex(0, 6) });
    const foe = createCombatant(makeCharacter({ id: 'foe' }), { team: 'npc', position: hex(0, 0) });
    victim.currentHP = 3;
    attachDot(victim, 5, 3);
    const state = makeState(victim, foe);

    const after = processEndOfRound(state);
    const v = after.combatants.find((c) => c.id === 'victim')!;
    expect(v.currentHP).toBe(0);
    expect(v.isUnconscious).toBe(true);
  });

  it('does not mutate the input state', () => {
    const victim = createCombatant(makeCharacter({ id: 'victim' }), { team: 'player', position: hex(0, 6) });
    const foe = createCombatant(makeCharacter({ id: 'foe' }), { team: 'npc', position: hex(0, 0) });
    attachDot(victim, 4, 2);
    const state = makeState(victim, foe);
    const before = JSON.parse(JSON.stringify(state));
    processEndOfRound(state);
    expect(state).toEqual(before);
  });
});

describe('revive with undefined maxHP (fix 3)', () => {
  it('does not write NaN HP when reviving a combatant without maxHP', () => {
    const downed = createCombatant(makeCharacter({ id: 'downed', currentHP: 0 }), { team: 'player', position: hex(0, 6) });
    expect(downed.isUnconscious).toBe(true);
    (downed as { maxHP?: number }).maxHP = undefined;
    const ally = createCombatant(makeCharacter({ id: 'ally' }), { team: 'player', position: hex(1, 6) });
    const state = makeState(downed, ally);

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
      { team: 'player', position: hex(0, 0) },
    );
    hero.isUnconscious = true; // GM-toggled KO while still at full HP
    const goblin = createCombatant(makeCharacter({ id: 'goblin', name: 'Goblin' }), { team: 'npc', position: hex(1, 0) });
    const state = makeState(hero, goblin);

    const { state: after, results } = resolveAction(
      state,
      action({ actionType: 'Weapon Attack', sourceId: 'hero', targetId: 'goblin', actionId: SHORT_SWORD }),
      maxRng,
    );
    const goblinAfter = after.combatants.find((c) => c.id === 'goblin')!;
    expect(goblinAfter.currentHP).toBe(40); // untouched — hero never acted
    expect(results.some((r) => r.kind === 'save')).toBe(false);
    expect(results.some((r) => r.text.toLowerCase().includes('unconscious'))).toBe(true);
    expect(after.combatants.find((c) => c.id === 'hero')).toBeDefined();
  });

  it('a dead source does not act and rolls no death save', () => {
    const hero = createCombatant(
      makeCharacter({ id: 'hero', inventory: { armor: null, weapon: SHORT_SWORD, shield: null, accessories: [], backpack: [] } }),
      { team: 'player', position: hex(0, 0) },
    );
    hero.isDead = true;
    hero.isUnconscious = true;
    hero.currentHP = 0;
    const goblin = createCombatant(makeCharacter({ id: 'goblin', name: 'Goblin' }), { team: 'npc', position: hex(1, 0) });
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
    const stunned = createCombatant(makeCharacter({ id: 'stunned' }), { team: 'player', position: hex(0, 6) });
    const foe = createCombatant(makeCharacter({ id: 'foe' }), { team: 'npc', position: hex(0, 0) });
    stunned.statusEffects.push({
      id: 'stun1',
      type: 'Stunned',
      label: 'Stunned',
      durationType: 'Actions',
      durationValue: 2,
      ...({ durationUnit: 'Actions' } as Record<string, unknown>),
    });
    const state = makeState(stunned, foe);

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

    const afterRound = processEndOfRound(afterAction);
    const sEnd = afterRound.combatants.find((c) => c.id === 'stunned')!;
    const stunEnd = sEnd.statusEffects.find((e) => e.type === 'Stunned') as
      | { durationValue?: number }
      | undefined;
    expect(stunEnd?.durationValue).toBe(1);
  });

  it('Rounds-unit effects still tick down and expire at end of round', () => {
    const c = createCombatant(makeCharacter({ id: 'c' }), { team: 'player', position: hex(0, 6) });
    const foe = createCombatant(makeCharacter({ id: 'foe' }), { team: 'npc', position: hex(0, 0) });
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

describe('damage-over-time independence (per-effect roll cache)', () => {
  it('rolls a DoT separately from the immediate hit instead of inheriting it', () => {
    const caster = createCombatant(makeCharacter({ id: 'caster', coreStats: { mind: 8, body: 6, soul: 4 } }), { team: 'player', position: hex(0, 0) });
    caster.currentMP = 99; // Fire Blast costs 7 MP
    const foe = createCombatant(makeCharacter({ id: 'foe', name: 'Foe', coreStats: { mind: 4, body: 4, soul: 4 } }), { team: 'npc', position: hex(2, 0) });
    const state = makeState(caster, foe);
    // node-47 Fire Blast: 2d6 immediate + 1d4 DoT (Survival save to negate).
    // Sequence: attack 20 (crit hit), save 1 (DoT lands), then mid damage dice.
    const { state: after } = resolveAction(
      state,
      action({ actionType: 'Use Ability', sourceId: 'caster', sourceTeam: 'player', targetId: 'foe', actionId: 'node-47' }),
      seqRng([0.95, 0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]),
    );
    const foeAfter = after.combatants.find((c) => c.id === 'foe')!;
    const dot = foeAfter.statusEffects.find(
      (e) => typeof (e as { rolledDamage?: number }).rolledDamage === 'number',
    ) as { rolledDamage: number } | undefined;
    expect(dot).toBeTruthy();
    // The DoT rolls its own 1d4 (max 4, ×2 crit = 8). The bug reused the 2d6
    // immediate roll (16 here), which would exceed this bound.
    expect(dot!.rolledDamage).toBeGreaterThan(0);
    expect(dot!.rolledDamage).toBeLessThanOrEqual(8);
  });
});

describe('AOE classification — damage overrides buff riders', () => {
  it('treats a damaging AOE that also grants a buff as offensive (hits foes, not allies)', () => {
    const caster = createCombatant(makeCharacter({ id: 'caster' }), { team: 'player', position: hex(0, 0) });
    const e1 = createCombatant(makeCharacter({ id: 'e1' }), { team: 'npc', position: hex(4, 0) }); // primary
    const e2 = createCombatant(makeCharacter({ id: 'e2' }), { team: 'npc', position: hex(3, 0) }); // dist 1
    const ally = createCombatant(makeCharacter({ id: 'ally' }), { team: 'player', position: hex(5, 0) }); // dist 1
    const state: CombatState = { ...makeState(caster, e1), combatants: [caster, e1, e2, ally] };
    // Apply Damage + a "+" Modify Stat rider previously misflagged this as supportive.
    const usable = {
      name: 'Searing Ward',
      range: 'Far',
      aoe: 'AOE 3',
      hitType: 'Roll to Hit',
      effects: [
        { type: 'Apply Damage', additionalDamage: '2d6' },
        { type: 'Modify Stat', statToModify: 'AC', modification: '+2' },
      ],
    } as never;
    const ids = getAOETargets(state, e1, 'AOE 3', caster, usable).map((t) => t.id).sort();
    expect(ids).toEqual(['e1', 'e2']);
    expect(ids).not.toContain('ally');
  });
});

describe('consumable charges', () => {
  it('tallies backpack consumables and spends a charge per use', () => {
    const heroChar = makeCharacter({
      id: 'hero',
      currentHP: 10,
      inventory: { armor: null, weapon: null, shield: null, accessories: [], backpack: [POTION] },
    });
    const hero = createCombatant(heroChar, { team: 'player', position: hex(0, 0) });
    expect(hero.consumables?.[POTION]).toBe(1);
    const foe = createCombatant(makeCharacter({ id: 'foe', name: 'Foe' }), { team: 'npc', position: hex(1, 0) });
    const state = makeState(hero, foe);

    // First use heals and spends the only charge.
    const r1 = resolveAction(
      state,
      action({ actionType: 'Use Item', sourceId: 'hero', targetId: 'hero', actionId: POTION }),
      maxRng,
    );
    const after1 = r1.state.combatants.find((c) => c.id === 'hero')!;
    expect(after1.currentHP).toBeGreaterThan(10);
    expect(after1.consumables?.[POTION]).toBe(0);

    // Second use is refused — no charges left, no further healing.
    const hpAfter1 = after1.currentHP;
    const r2 = resolveAction(
      r1.state,
      action({ actionType: 'Use Item', sourceId: 'hero', targetId: 'hero', actionId: POTION }),
      maxRng,
    );
    const after2 = r2.state.combatants.find((c) => c.id === 'hero')!;
    expect(after2.currentHP).toBe(hpAfter1);
    expect(r2.results.some((x) => /no .*remaining/i.test(x.text))).toBe(true);
  });
});

describe('max-pool buffs', () => {
  it('raises the combatant max and current pool (Magic Armor II)', () => {
    const caster = createCombatant(makeCharacter({ id: 'mage' }), { team: 'player', position: hex(0, 0) });
    caster.currentMP = 99; // node-57 (Magic Armor II) costs 8 MP, grants +2d10 Max HP
    const beforeMax = caster.maxHP;
    const beforeCur = caster.currentHP;
    const foe = createCombatant(makeCharacter({ id: 'foe', name: 'Foe' }), { team: 'npc', position: hex(1, 0) });
    const state = makeState(caster, foe);
    const { state: after } = resolveAction(
      state,
      action({ actionType: 'Use Ability', sourceId: 'mage', targetId: 'mage', actionId: 'node-57' }),
      maxRng,
    );
    const m = after.combatants.find((c) => c.id === 'mage')!;
    expect(m.maxHP).toBeGreaterThan(beforeMax);
    expect(m.currentHP).toBeGreaterThan(beforeCur);
  });
});
