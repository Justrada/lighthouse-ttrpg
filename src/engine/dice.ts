import type { AdvantageMode, DiceRollResult } from '@/types';

/**
 * A source of randomness in the range [0, 1), matching `Math.random`.
 * All dice functions accept one so tests can be made deterministic.
 */
export type Rng = () => number;

/** Roll a single die with `sides` faces using the provided rng. */
function rollDie(sides: number, rng: Rng): number {
  return Math.floor(rng() * sides) + 1;
}

/** A parsed dice expression. */
export interface ParsedDice {
  /** Number of dice (defaults to 1 when omitted, e.g. "d6"). */
  count: number;
  /** Faces per die. */
  sides: number;
  /** Flat modifier baked into the notation, e.g. the `+3` in "2d6+3". */
  modifier: number;
  /** True when the whole expression is negated, e.g. "-1d6". */
  negative: boolean;
}

/**
 * Accepts forms like "2d6", "1d20+3", "d8", "-1d6", "+2d4-1".
 * Whitespace around the inner +/- modifier is tolerated, matching the original.
 */
const DICE_RE = /^(\d*)d(\d+)(\s*[+-]\s*\d+)?$/;

/**
 * Parse dice notation into its components, or return `null` when the string is
 * not dice notation (e.g. a bare constant like "5"). Leading "+"/"-" marks the
 * whole roll positive/negative — negative dice were a real bug in the original
 * and are handled here by negating the final total in {@link roll}.
 */
export function parseDiceNotation(notation: string): ParsedDice | null {
  if (notation === undefined || notation === null) return null;
  let s = String(notation).trim();
  if (s === '') return null;

  let negative = false;
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }

  const m = s.match(DICE_RE);
  if (!m) return null;

  // Cap the dice count so a pasted/typed huge notation (e.g. 999999999d6) can't
  // freeze the tab building a giant array. Real rolls never need more than this.
  const count = Math.min(1000, Math.max(1, parseInt(m[1], 10) || 1));
  const sides = parseInt(m[2], 10);
  // A die must have at least one face. "1d0"/"d0" is nonsensical and previously
  // made rollDie(0) return 1 for any rng; reject it so callers treat it like
  // any other unparseable input.
  if (!(sides >= 1)) return null;
  const modifier = m[3] ? parseInt(m[3].replace(/\s/g, ''), 10) : 0;

  return { count, sides, modifier, negative };
}

/**
 * Roll a dice expression and return a structured result.
 *
 * Constants (e.g. "5") and unparseable input resolve to a zero-dice result with
 * `total` set to the integer value (or 0). Negative notation like "-1d6" rolls
 * normally then negates the total — faithfully reproducing the original engine's
 * behaviour, where negative dice are used for penalties.
 */
export function roll(notation: string, rng: Rng = Math.random): DiceRollResult {
  const parsed = parseDiceNotation(notation);

  if (!parsed) {
    // Only a bare integer literal resolves to a flat value; dice-shaped but
    // invalid input (e.g. "1d0") must not leak its leading digits as a total.
    const trimmed = String(notation).trim();
    const value = /^[+-]?\d+$/.test(trimmed) ? parseInt(trimmed, 10) : 0;
    return { notation: String(notation), rolls: [], modifier: 0, total: value };
  }

  const { count, sides, modifier, negative } = parsed;
  const rolls: number[] = [];
  let sum = 0;
  for (let i = 0; i < count; i++) {
    const r = rollDie(sides, rng);
    rolls.push(r);
    sum += r;
  }

  const base = sum + modifier;
  const total = negative ? -base : base;

  return { notation: String(notation), rolls, modifier, total };
}

/**
 * Roll damage from a notation, returning just the numeric total.
 * Damage is never negative from a roll, so results are floored at 0 — a "-1d6"
 * style penalty resolving below zero is clamped, matching how callers add it.
 */
export function rollDamage(notation: string, rng: Rng = Math.random): number {
  return Math.max(0, roll(notation, rng).total);
}

/**
 * Roll a d20 check with optional advantage/disadvantage.
 *
 * - `advantage` rolls two d20 and keeps the higher; `disadvantage` keeps the lower.
 * - The discarded die (if any) is recorded in `discarded`.
 * - A natural 20 sets `crit: 'success'`; a natural 1 sets `crit: 'fail'`. Crit is
 *   evaluated on the *kept* die.
 */
export function rollD20(
  mode: AdvantageMode = 'normal',
  modifier = 0,
  rng: Rng = Math.random,
  /** Lowest natural die that counts as a crit (default 20; enhancements lower it). */
  critThreshold = 20,
): DiceRollResult {
  const a = rollDie(20, rng);

  let kept = a;
  const allRolls = [a];
  const discarded: number[] = [];

  if (mode === 'advantage' || mode === 'disadvantage') {
    const b = rollDie(20, rng);
    allRolls.push(b);
    if (mode === 'advantage') {
      kept = Math.max(a, b);
      discarded.push(Math.min(a, b));
    } else {
      kept = Math.min(a, b);
      discarded.push(Math.max(a, b));
    }
  }

  const crit: 'success' | 'fail' | null =
    kept >= critThreshold ? 'success' : kept === 1 ? 'fail' : null;

  const result: DiceRollResult = {
    notation: '1d20',
    rolls: mode === 'normal' ? allRolls : [kept],
    modifier,
    total: kept + modifier,
    d20: true,
    advantage: mode,
    crit,
  };
  if (discarded.length > 0) result.discarded = discarded;
  return result;
}

/**
 * Combine two advantage modes (e.g. an attacker's advantage and a target's
 * Guard-imposed disadvantage). Matching advantage and disadvantage cancel to
 * normal; otherwise the present one wins.
 */
export function combineAdvantage(a: AdvantageMode, b: AdvantageMode): AdvantageMode {
  const adv = a === 'advantage' || b === 'advantage';
  const dis = a === 'disadvantage' || b === 'disadvantage';
  if (adv && dis) return 'normal';
  if (adv) return 'advantage';
  if (dis) return 'disadvantage';
  return 'normal';
}
