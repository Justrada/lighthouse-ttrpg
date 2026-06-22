import { describe, it, expect } from 'vitest';
import type { Character, Combatant, CombatState, DeclaredAction, ResolvedAction } from '@/types';
import { rollD20 } from './dice';
import { calculateDerivedStats } from './stats';
import { rollDamageNotation, applyResistance, rollInitiativeForRound, resolveAction } from './combat';
import { hexDistance } from './hex';

/** Deterministic rng cycling through the given [0,1) values. */
const seq = (vals: number[]): (() => number) => {
  let i = 0;
  return () => vals[i++] ?? 0;
};

const mkCombatant = (o: Partial<Combatant> & { id: string }): Combatant => ({
  peerId: null,
  name: o.id,
  team: 'player',
  position: { q: 0, r: 0 },
  initiativeBonus: 0,
  maxHP: 20,
  maxMP: 5,
  maxSP: 5,
  currentHP: 20,
  currentMP: 5,
  currentSP: 5,
  ac: 10,
  statusEffects: [],
  isUnconscious: false,
  isDead: false,
  deathSaves: { successes: 0, failures: 0 },
  ...o,
});

const mkState = (
  combatants: Combatant[],
  declaredActions: Record<string, DeclaredAction[]> = {},
): CombatState => ({
  isActive: true,
  phase: 'declare',
  round: 1,
  combatants,
  declaredActions,
  lockedActions: {},
  resolutionQueue: [],
  activeResolutionIndex: -1,
  log: [],
});

// --- MP/SP scaling (Soul/Mind) + negative skills --------------------------
describe('derived stats (rule changes)', () => {
  it('scales MP with Soul and SP with Mind', () => {
    const d = calculateDerivedStats({ coreStats: { mind: 7, body: 5, soul: 9 } } as Character);
    expect(d.mp).toBe(14); // 5 + soul 9
    expect(d.sp).toBe(12); // 5 + mind 7
    expect(d.hp).toBe(25); // max(10, 5*body)
  });

  it('allows negative skill scores at low core stats (no clamp)', () => {
    const d = calculateDerivedStats({ coreStats: { mind: 1, body: 1, soul: 1 } } as Character);
    expect(d.physical).toBe(-3); // body 1 - 4
    expect(d.lore).toBe(-3); // mind 1 - 4
  });
});

// --- Crit: double-dice / max-dice + threshold -----------------------------
describe('crit damage', () => {
  it('doubles the DICE only, not the flat modifier (double-dice)', () => {
    // 2d6+3 with both dice rolling 4 (rng 0.5 -> floor(0.5*6)+1 = 4): dice sum 8.
    const dmg = rollDamageNotation('2d6+3', seq([0.5, 0.5]), true, 'double-dice');
    expect(dmg).toBe(8 * 2 + 3); // dice doubled (16) + modifier once (3) = 19
  });

  it('maximizes dice on a max-dice crit (+ modifier once)', () => {
    const dmg = rollDamageNotation('2d6+3', seq([0, 0]), true, 'max-dice');
    expect(dmg).toBe(2 * 6 + 3); // 15, deterministic — no rolling
  });

  it('does not scale a flat (non-dice) amount on a crit', () => {
    expect(rollDamageNotation('5', seq([0]), true, 'double-dice')).toBe(5);
  });

  it('is a normal roll when not a crit', () => {
    expect(rollDamageNotation('2d6+3', seq([0.5, 0.5]), false, 'double-dice')).toBe(8 + 3);
  });

  it('rollD20 crits at/above a lowered threshold', () => {
    expect(rollD20('normal', 0, seq([0.9]), 19).crit).toBe('success'); // die 19, threshold 19
    expect(rollD20('normal', 0, seq([0.9]), 20).crit).toBeNull(); // die 19, threshold 20
    expect(rollD20('normal', 0, seq([0]), 19).crit).toBe('fail'); // die 1 always fails
  });
});

// --- Damage types: resist (half) / immune (none) --------------------------
describe('resist / immune', () => {
  const t = (o: Partial<Combatant>) => ({ ...mkCombatant({ id: 't' }), ...o });
  it('halves damage of a resisted type (case-insensitive, floored)', () => {
    expect(applyResistance(t({ resist: ['Fire'] }), 11, 'fire')).toBe(5);
  });
  it('zeroes damage of an immune type', () => {
    expect(applyResistance(t({ immune: ['Cold'] }), 12, 'cold')).toBe(0);
  });
  it('leaves untyped or unmatched damage unchanged', () => {
    expect(applyResistance(t({ resist: ['fire'] }), 10, 'slashing')).toBe(10);
    expect(applyResistance(t({}), 10, undefined)).toBe(10);
  });
});

// --- Initiative: ordered assignment + reroll ties -------------------------
describe('initiative', () => {
  it('assigns a combatant a rolls to its actions highest-first (declared order)', () => {
    const A = mkCombatant({ id: 'A' });
    const B = mkCombatant({ id: 'B' });
    // A: two init rolls 20 (0.95) then 10 (0.47), reroll 5 (0.22).
    // B: one init roll 15 (0.72), reroll 18 (0.88).
    const queue = rollInitiativeForRound(
      mkState([A, B], {
        A: [{ actionIndex: 0, actionType: 'Pass' }, { actionIndex: 1, actionType: 'Pass' }],
        B: [{ actionIndex: 0, actionType: 'Pass' }],
      }),
      seq([0.95, 0.47, 0.22, 0.72, 0.88]),
    );
    // A's highest (20) → its first action; global order: A0(20), B0(15), A1(10).
    expect(queue.map((q) => `${q.sourceId}:${q.actionIndex}`)).toEqual(['A:0', 'B:0', 'A:1']);
    expect(queue[0].initiative).toBe(20);
    expect(queue[2].initiative).toBe(10);
  });

  it('looks up declared actions by id, not peerId (no collision hijack)', () => {
    // B.peerId collides with A.id. B must still resolve its OWN 2 actions (keyed
    // by 'B'), not A's single action, and must not be skipped.
    const A = mkCombatant({ id: 'A' });
    const B = mkCombatant({ id: 'B', peerId: 'A' });
    const queue = rollInitiativeForRound(
      mkState([A, B], {
        A: [{ actionIndex: 0, actionType: 'Pass' }],
        B: [{ actionIndex: 0, actionType: 'Pass' }, { actionIndex: 1, actionType: 'Pass' }],
      }),
      seq([0.5, 0.5, 0.5, 0.5, 0.5, 0.5]),
    );
    expect(queue.filter((q) => q.sourceId === 'B').length).toBe(2);
    expect(queue.filter((q) => q.sourceId === 'A').length).toBe(1);
  });

  it('breaks cross-combatant ties by reroll (higher first)', () => {
    const A = mkCombatant({ id: 'A' });
    const B = mkCombatant({ id: 'B' });
    // Both roll init 15 (0.72); A reroll 5 (0.22), B reroll 18 (0.88) -> B wins.
    const queue = rollInitiativeForRound(
      mkState([A, B], {
        A: [{ actionIndex: 0, actionType: 'Pass' }],
        B: [{ actionIndex: 0, actionType: 'Pass' }],
      }),
      seq([0.72, 0.22, 0.72, 0.88]),
    );
    expect(queue.map((q) => q.sourceId)).toEqual(['B', 'A']);
  });
});

// --- Flee (away) / Chase (toward) -----------------------------------------
describe('flee / chase movement', () => {
  const chase = (sourceId: string, targetId: string): ResolvedAction => ({
    actionIndex: 0,
    actionType: 'Chase',
    targetId,
    sourceId,
    sourceTeam: 'player',
    initiative: 0,
  });
  const flee = (sourceId: string, targetId: string): ResolvedAction => ({
    ...chase(sourceId, targetId),
    actionType: 'Flee',
  });

  it('Chase moves the source closer to its target', () => {
    const A = mkCombatant({ id: 'A', position: { q: 0, r: 0 } });
    const B = mkCombatant({ id: 'B', team: 'npc', position: { q: 5, r: 0 } });
    const { state } = resolveAction(mkState([A, B]), chase('A', 'B'));
    const movedA = state.combatants.find((c) => c.id === 'A')!;
    expect(hexDistance(movedA.position, B.position)).toBeLessThan(5);
  });

  it('Flee moves the source further from its target', () => {
    const A = mkCombatant({ id: 'A', position: { q: 5, r: 5 } });
    const B = mkCombatant({ id: 'B', team: 'npc', position: { q: 6, r: 5 } });
    const before = hexDistance(A.position, B.position); // 1
    const { state } = resolveAction(mkState([A, B]), flee('A', 'B'));
    const movedA = state.combatants.find((c) => c.id === 'A')!;
    expect(hexDistance(movedA.position, B.position)).toBeGreaterThan(before);
  });
});
