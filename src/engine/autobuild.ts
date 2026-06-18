/**
 * Quick-Build auto-allocator.
 *
 * Given a name, level, and a play-style archetype, this produces a complete,
 * valid {@link Character}: it spends the skill-point budget on core stats and a
 * constellation of learned skills, picks themed starter gear, and finalises the
 * sheet via {@link normalizeCharacter} so current HP/MP/SP are filled to maxes.
 *
 * It is pure and deterministic given its `rng` (default `Math.random`): the same
 * seed always yields the same character, while different seeds vary the build —
 * stats are raised by archetype-weighted random choice and skills are picked by
 * archetype fit plus a per-candidate random jitter.
 *
 * Budget and learnability rules are never reimplemented here; this module only
 * orchestrates the existing engine functions ({@link calculateSkillBudget},
 * {@link getStatCost}, {@link getReachableNodes}, {@link canLearnSkill},
 * {@link applyLearn}, {@link getSkillCost}).
 */
import type { Character, CoreStatKey } from '@/types';
import { nanoid } from 'nanoid';
import { normalizeCharacter } from '@/lib/character';
import { findNode } from '@/data/skillTree';
import {
  calculateSkillBudget,
  calculateDerivedStats,
  getStatCost,
  getSkillCost,
} from './stats';
import { getReachableNodes, canLearnSkill, applyLearn } from './skills';

export type Archetype = 'magic' | 'skill' | 'balanced';

export interface AutoBuildOptions {
  name: string;
  level: number;
  archetype: Archetype;
  /** Injectable RNG in [0,1). Defaults to `Math.random`. */
  rng?: () => number;
}

/**
 * Base value every core stat starts at. Dump stats are simply left here — the
 * allocator only ever *raises* stats, so nothing is pushed below this floor of 4
 * (comfortably above the rules' minimum of 3).
 */
const BASE_STAT = 4;
/** Hard ceiling matching the Forge's manual stepper. */
const STAT_MAX = 12;

/**
 * Per-archetype weights for which core stat to raise next. Higher weight = more
 * likely to receive the next point. "Dump" stats keep a small non-zero weight so
 * a build is never perfectly lopsided, but they are heavily de-prioritised.
 */
const STAT_WEIGHTS: Record<Archetype, Record<CoreStatKey, number>> = {
  // Magic: Mind primary, Soul secondary, Body dump.
  magic: { mind: 6, soul: 3, body: 1 },
  // Skill: Body primary, Soul secondary, Mind dump.
  skill: { body: 6, soul: 3, mind: 1 },
  // Balanced: even across the board.
  balanced: { mind: 1, body: 1, soul: 1 },
};

/** Pick a key from a weight map using `r` in [0,1). Returns null if all weights 0. */
function weightedPick<T extends string>(
  weights: Record<string, number>,
  keys: T[],
  r: number,
): T | null {
  const total = keys.reduce((sum, k) => sum + Math.max(0, weights[k] ?? 0), 0);
  if (total <= 0) return null;
  let threshold = r * total;
  for (const k of keys) {
    threshold -= Math.max(0, weights[k] ?? 0);
    if (threshold < 0) return k;
  }
  return keys[keys.length - 1];
}

const CORE_KEYS: CoreStatKey[] = ['mind', 'body', 'soul'];

/**
 * Raise core stats one point at a time by archetype-weighted random choice.
 *
 * The base stats (three at {@link BASE_STAT}) already consume part of the budget
 * per {@link calculateSkillBudget}'s costing, so "spent on stats" here means
 * `spentOnStats − base`: the points the build chooses to invest in *raising*
 * stats. We target ~55–65% of the discretionary budget (`available` after the
 * base is paid for) going into stat raises, jittered per build via `rng`, and
 * leave the remainder for skills. Affordability is checked against the live
 * {@link calculateSkillBudget} so this can never overspend, and stats are only
 * ever raised (never lowered below their base of {@link BASE_STAT}).
 */
function allocateStats(character: Character, archetype: Archetype, rng: () => number): Character {
  // Discretionary points = what's available once base stats are accounted for.
  const discretionary = calculateSkillBudget(character).available;
  if (discretionary <= 0) return character;

  // Fraction of the discretionary pool to invest in raising stats: 0.55–0.65.
  const targetFraction = 0.55 + rng() * 0.1;
  const statBudget = discretionary * targetFraction;

  const weights = STAT_WEIGHTS[archetype];
  const coreStats = { ...character.coreStats };
  let spentOnRaises = 0;

  // Guard against pathological loops; the budget bounds real iterations.
  let guard = 0;
  while (guard++ < 500) {
    // Remaining points overall (recomputed via the engine so we never overspend).
    const remaining = calculateSkillBudget({ ...character, coreStats }).available;
    if (remaining <= 0) break;

    // Stats that can still be raised: under the ceiling and affordable.
    const raisable = CORE_KEYS.filter((k) => {
      const cur = coreStats[k];
      if (cur >= STAT_MAX) return false;
      return getStatCost(cur) <= remaining;
    });
    if (raisable.length === 0) break;

    // Stop once we've invested the stat budget (but always raise ≥1 point).
    if (spentOnRaises >= statBudget && spentOnRaises > 0) break;

    // Restrict weights to currently-raisable stats.
    const localWeights: Record<string, number> = {};
    for (const k of raisable) localWeights[k] = weights[k];
    const choice = weightedPick(localWeights, raisable, rng());
    if (!choice) break;

    const cost = getStatCost(coreStats[choice]);
    if (cost > remaining) break;
    coreStats[choice] += 1;
    spentOnRaises += cost;
  }

  return { ...character, coreStats };
}

/** Classify a node for archetype scoring. */
interface NodeProfile {
  isAbility: boolean;
  costType: 'MP' | 'SP' | 'HP' | null;
  isEnhancement: boolean;
  /** Stats this enhancement modifies, upper-cased (may be empty). */
  enhStats: string[];
}

function profileNode(nodeId: string): NodeProfile {
  const node = findNode(nodeId);
  const li = node?.linkedItem ?? null;
  const isAbility = li?.type === 'Ability';
  const isEnhancement = li?.type === 'Enhancement';
  const costType = (li?.cost?.type as NodeProfile['costType']) ?? null;
  const enhStats: string[] = [];
  if (isEnhancement && li) {
    for (const e of li.effects ?? []) {
      if (e.type === 'Modify Stat' && e.statToModify) {
        enhStats.push(String(e.statToModify).toUpperCase());
      }
    }
  }
  return { isAbility, costType, isEnhancement, enhStats };
}

const MAGIC_ENH_STATS = new Set(['HP', 'MAX HP', 'MP', 'MAX MP']);
const SKILL_ENH_STATS = new Set([
  'HP',
  'MAX HP',
  'SP',
  'MAX SP',
  'AC',
  'PHYSICAL',
]);

/**
 * Archetype-fit score for a candidate node, before random jitter. Higher is a
 * better thematic fit. The bands are spaced wide enough that fit dominates ties
 * but the jitter (added by the caller) still reshuffles same-band candidates.
 */
function archetypeScore(archetype: Archetype, p: NodeProfile): number {
  if (archetype === 'magic') {
    if (p.isAbility && p.costType === 'MP') return 10;
    if (p.isAbility && p.costType === 'SP') return 2;
    if (p.isAbility) return 4;
    if (p.isEnhancement) {
      return p.enhStats.some((s) => MAGIC_ENH_STATS.has(s)) ? 6 : 3;
    }
    return 1;
  }
  if (archetype === 'skill') {
    if (p.isAbility && p.costType === 'SP') return 10;
    if (p.isAbility && p.costType === 'MP') return 2;
    if (p.isAbility) return 4;
    if (p.isEnhancement) {
      return p.enhStats.some((s) => SKILL_ENH_STATS.has(s)) ? 6 : 3;
    }
    return 1;
  }
  // balanced — abilities and enhancements both favoured, no resource bias.
  if (p.isAbility) return 8;
  if (p.isEnhancement) return 7;
  return 1;
}

/**
 * Spend the remaining budget on skills via frontier expansion. Each pass asks
 * the engine for reachable nodes, keeps the affordable + learnable ones, scores
 * each by archetype fit plus a random jitter, learns the top-scored node, and
 * repeats until nothing affordable remains. Frontier expansion naturally
 * satisfies prerequisites, since a node only becomes reachable once a connected
 * node is learned.
 */
function allocateSkills(character: Character, archetype: Archetype, rng: () => number): Character {
  let char = character;
  let guard = 0;
  while (guard++ < 1000) {
    const budget = calculateSkillBudget(char);
    if (budget.available <= 0) break;

    const reachable = getReachableNodes(char).filter((id) => {
      const cost = getSkillCost(id);
      if (cost > budget.available) return false;
      return canLearnSkill(char, id, budget).ok;
    });
    if (reachable.length === 0) break;

    let bestId: string | null = null;
    let bestScore = -Infinity;
    for (const id of reachable) {
      const score = archetypeScore(archetype, profileNode(id)) + rng() * 3;
      if (score > bestScore) {
        bestScore = score;
        bestId = id;
      }
    }
    if (!bestId) break;

    char = applyLearn(char, bestId);
  }
  return char;
}

/** Themed starter gear per archetype, using existing world-item ids. */
const STARTER_GEAR: Record<Archetype, { armor: string; weapon: string | null }> = {
  // Mage's robes only.
  magic: { armor: 'inv_1747407355525_a31a5b', weapon: null },
  // Fine Leather + Battle Axe.
  skill: { armor: 'inv_1747270377888_fd21f8', weapon: 'inv_1747404359725_32824c' },
  // Fine Leather + Long Sword.
  balanced: { armor: 'inv_1747270377888_fd21f8', weapon: 'inv_1747317465886_544d9f' },
};

/**
 * Auto-build a complete character from a name, level, and archetype.
 *
 * @see module docs for the algorithm and determinism guarantees.
 */
export function autoBuildCharacter(opts: AutoBuildOptions): Character {
  const rng = opts.rng ?? Math.random;
  const level = Math.max(1, Math.min(20, Math.floor(opts.level) || 1));

  // 1) Base character.
  const now = Date.now();
  let char: Character = {
    id: nanoid(10),
    name: opts.name,
    level,
    portraitSeed: nanoid(8),
    coreStats: { mind: BASE_STAT, body: BASE_STAT, soul: BASE_STAT },
    learnedSkills: ['center-0'],
    skillChoices: {},
    inventory: { armor: null, weapon: null, shield: null, accessories: [], backpack: [] },
    currentHP: 0,
    currentMP: 0,
    currentSP: 0,
    statusEffects: [],
    notes: '',
    createdAt: now,
    updatedAt: now,
  };

  // 2) Stats, then 3) skills (skills read whatever budget stats left behind).
  char = allocateStats(char, opts.archetype, rng);
  char = allocateSkills(char, opts.archetype, rng);

  // 4) Starter gear.
  const gear = STARTER_GEAR[opts.archetype];
  char = {
    ...char,
    inventory: {
      ...char.inventory,
      armor: gear.armor,
      weapon: gear.weapon,
    },
  };

  // 5) Name + portrait, then fill current HP/MP/SP to their derived maxes (the
  // sheet should open at full health) and finalise via normalizeCharacter so
  // every field is complete and safe.
  const maxes = calculateDerivedStats(char);
  const built = normalizeCharacter({
    ...char,
    name: opts.name,
    portraitSeed: char.portraitSeed,
    currentHP: maxes.hp,
    currentMP: maxes.mp,
    currentSP: maxes.sp,
  });

  // Invariant: a Quick Build must never overspend its budget.
  const finalBudget = calculateSkillBudget(built);
  if (finalBudget.available < 0) {
    throw new Error(
      `autoBuildCharacter overspent the budget (available=${finalBudget.available}).`,
    );
  }

  return built;
}
