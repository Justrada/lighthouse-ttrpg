import { describe, it, expect } from 'vitest';
import type { Character, CombatState, Combatant, ResolvedAction } from '@/types';
import { createCombatant, resolveAction } from './combat';
import type { Rng } from './dice';
import { skillNodes, worldItems } from '@/data/skillTree';

/**
 * Exhaustive data audit: resolve EVERY shipped combat ability, weapon, and
 * consumable against a dummy under several RNG seeds, asserting universal
 * invariants. No "correct number" is known per ability, but these properties
 * must hold for all of them:
 *   1. resolution never throws,
 *   2. all resources stay finite (no NaN/Infinity),
 *   3. the combat log contains no "NaN"/"Infinity"/"undefined",
 *   4. a combatant never loses MORE HP than the log reported as damage (plus any
 *      Max-HP reduction). This is exactly the property the Vampiric-Drain
 *      double-damage bug violated.
 */

const maxRng: Rng = () => 0.999999;
const minRng: Rng = () => 0;
const midRng: Rng = () => 0.5;
function seqRng(seq: number[]): Rng {
  let i = 0;
  return () => seq[i++ % seq.length];
}
const SEEDS: Array<[string, Rng]> = [
  ['max', maxRng],
  ['min', minRng],
  ['mid', midRng],
  ['seq', seqRng([0.9, 0.1, 0.7, 0.3, 0.5, 0.95, 0.05, 0.42])],
];

function mkChar(id: string, name: string): Character {
  return {
    id, name, level: 5, coreStats: { mind: 8, body: 8, soul: 8 }, learnedSkills: ['center-0'],
    inventory: { armor: null, weapon: null, shield: null, accessories: [], backpack: [] },
    currentHP: 9999, currentMP: 9999, currentSP: 9999,
  } as Character;
}

function fighters(): { caster: Combatant; dummy: Combatant; lookup: (c: Combatant) => Character } {
  const casterChar = mkChar('caster', 'Caster');
  const dummyChar = mkChar('dummy', 'Dummy');
  const caster = createCombatant(casterChar, { team: 'player', position: { q: 0, r: 0 } });
  const dummy = createCombatant(dummyChar, { team: 'npc', position: { q: 1, r: 0 } });
  // Huge pools so costs are always affordable and damage never clamps at the 0
  // floor (which would legitimately make removed < reported and mask the check).
  for (const c of [caster, dummy]) {
    c.currentHP = 9999; c.maxHP = 9999;
    c.currentMP = 9999; c.maxMP = 9999;
    c.currentSP = 9999; c.maxSP = 9999;
  }
  const lookup = (c: Combatant) => (c.id === 'caster' ? casterChar : dummyChar);
  return { caster, dummy, lookup };
}

function stateOf(caster: Combatant, dummy: Combatant): CombatState {
  return {
    isActive: true, phase: 'resolving', round: 1, combatants: [caster, dummy],
    declaredActions: {}, lockedActions: {}, resolutionQueue: [], activeResolutionIndex: -1, log: [],
  };
}

/** Sum "<Name> takes <N> damage" entries for a combatant in the log. */
function reportedDamage(log: { text: string }[], name: string): number {
  const re = new RegExp(`${name} takes (\\d+) damage`, 'g');
  return log.reduce((sum, e) => {
    let m: RegExpExecArray | null;
    let total = 0;
    const r = new RegExp(re.source, 'g');
    while ((m = r.exec(e.text))) total += parseInt(m[1], 10);
    return sum + total;
  }, 0);
}

/** Run one action and return any invariant violations. */
function audit(label: string, act: ResolvedAction, rng: Rng): string[] {
  const problems: string[] = [];
  const { caster, dummy, lookup } = fighters();
  const before = { caster: { ...caster }, dummy: { ...dummy } };
  let after: CombatState;
  let log: { text: string }[];
  try {
    const res = resolveAction(stateOf(caster, dummy), act, rng, { charLookup: lookup });
    after = res.state;
    log = res.log ?? after.log;
  } catch (e) {
    return [`${label}: THREW ${(e as Error)?.message ?? e}`];
  }

  for (const c of after.combatants) {
    const nums: Array<[string, number]> = [
      ['currentHP', c.currentHP], ['currentMP', c.currentMP], ['currentSP', c.currentSP],
      ['maxHP', c.maxHP], ['maxMP', c.maxMP], ['maxSP', c.maxSP], ['ac', c.ac],
    ];
    for (const [k, v] of nums) {
      if (!Number.isFinite(v)) problems.push(`${label}: ${c.id}.${k} not finite (${v})`);
    }
    const pre = c.id === 'caster' ? before.caster : before.dummy;
    const name = c.id === 'caster' ? 'Caster' : 'Dummy';
    const removed = Math.max(0, pre.currentHP - c.currentHP);
    const maxDrop = Math.max(0, pre.maxHP - c.maxHP);
    const reported = reportedDamage(log, name);
    // A combatant cannot lose more HP than the log accounted for (damage reported
    // + any Max-HP reduction). Catches double-application like the drain bug.
    if (removed > reported + maxDrop) {
      problems.push(`${label}: ${c.id} lost ${removed} HP but log reported only ${reported} (maxDrop ${maxDrop})`);
    }
  }

  for (const e of log) {
    if (/NaN|Infinity|undefined/.test(e.text)) problems.push(`${label}: dirty log "${e.text}"`);
  }
  return problems;
}

describe('data audit — combat abilities', () => {
  const combatAbilities = skillNodes.filter(
    (n) => {
      const li = n.linkedItem as { type?: string; combatUse?: boolean } | null;
      return li?.type === 'Ability' && li.combatUse === true;
    },
  );

  it(`exercises every combat ability (${combatAbilities.length}) without violating invariants`, () => {
    expect(combatAbilities.length).toBeGreaterThan(40); // guard: data actually loaded
    const problems: string[] = [];
    for (const node of combatAbilities) {
      const name = (node.linkedItem as { name?: string })?.name ?? node.id;
      for (const [seed, rng] of SEEDS) {
        const act = {
          actionIndex: 0, actionType: 'Use Ability', sourceId: 'caster', targetId: 'dummy',
          actionId: node.id, initiative: 1,
        } as ResolvedAction;
        problems.push(...audit(`ability ${node.id} (${name}) [${seed}]`, act, rng));
      }
    }
    expect(problems).toEqual([]);
  });
});

describe('data audit — weapons', () => {
  const weapons = worldItems.weapons ?? [];
  it(`exercises every weapon (${weapons.length}) without violating invariants`, () => {
    const problems: string[] = [];
    for (const w of weapons) {
      for (const [seed, rng] of SEEDS) {
        const act = {
          actionIndex: 0, actionType: 'Weapon Attack', sourceId: 'caster', targetId: 'dummy',
          actionId: w.id, initiative: 1,
        } as ResolvedAction;
        problems.push(...audit(`weapon ${w.id} (${w.name}) [${seed}]`, act, rng));
      }
    }
    expect(problems).toEqual([]);
  });
});

describe('data audit — consumables', () => {
  const consumables = worldItems.consumables ?? [];
  it(`exercises every consumable (${consumables.length}) without violating invariants`, () => {
    const problems: string[] = [];
    for (const item of consumables) {
      for (const [seed, rng] of SEEDS) {
        const act = {
          actionIndex: 0, actionType: 'Use Item', sourceId: 'caster', targetId: 'dummy',
          actionId: item.id, initiative: 1,
        } as ResolvedAction;
        problems.push(...audit(`consumable ${item.id} (${item.name}) [${seed}]`, act, rng));
      }
    }
    expect(problems).toEqual([]);
  });
});
