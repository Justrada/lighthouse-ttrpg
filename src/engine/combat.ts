import type {
  ActionResult,
  Character,
  Combatant,
  CombatLogEntry,
  CombatState,
  DeclaredAction,
  DiceRollResult,
  HexCoord,
  LinkedItem,
  ResolvedAction,
  SkillEffect,
  Team,
  WorldItem,
} from '@/types';
import { BATTLE_GRID, MOVE_RANGE, RANGE_ORDER, RANGE_TO_HEX_DISTANCE } from '@/data/constants';
import { findItem, findNode } from '@/data/skillTree';
import { calculateDerivedStats } from './stats';
import {
  combineAdvantage,
  rollD20,
  roll,
  type Rng,
} from './dice';
import {
  createStatusEffect,
  nextEffectId,
  tickDurations,
  type RuntimeEffect,
} from './effects';
import {
  closestReachableTo,
  hexDistance,
  hexEquals,
  hexLineDraw,
  inBounds,
  stepAway,
  stepToward,
} from './hex';
import type { AdvantageMode } from '@/types';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

/**
 * Combat-relevant fields shared by abilities and weapons. `WorldItem` weapons
 * carry `aoe`/`hitType`/`rollModifier` in the data even though the persisted
 * type omits them, so we surface them as optional here for safe access.
 */
interface CombatFields {
  name?: string;
  range?: string;
  aoe?: string;
  hitType?: string;
  rollModifier?: string;
}

/** A skill or weapon's usable data — abilities and world items share this shape. */
type UsableData = (LinkedItem | WorldItem) & CombatFields;

/** The result bundle returned by resolving a single action. */
export interface ResolveResult {
  state: CombatState;
  results: ActionResult[];
  log: CombatLogEntry[];
}

/** One step of an animated round playback. */
export interface RoundStep {
  action: ResolvedAction;
  results: ActionResult[];
  log: CombatLogEntry[];
  /** A snapshot of combat state immediately *after* this action resolved. */
  snapshot: CombatState;
}

// ---------------------------------------------------------------------------
// Small pure utilities
// ---------------------------------------------------------------------------

/** Structured deep clone of combat state, so resolution never mutates input. */
function cloneState(state: CombatState): CombatState {
  return {
    ...state,
    combatants: state.combatants.map((c) => cloneCombatant(c)),
    declaredActions: Object.fromEntries(
      Object.entries(state.declaredActions).map(([k, v]) => [k, v.map((a) => ({ ...a }))]),
    ),
    lockedActions: { ...state.lockedActions },
    resolutionQueue: state.resolutionQueue.map((a) => ({ ...a })),
    log: state.log.map((e) => ({ ...e })),
  };
}

function cloneCombatant(c: Combatant): Combatant {
  return {
    ...c,
    statusEffects: (c.statusEffects ?? []).map((e) => ({ ...e })),
    deathSaves: { ...c.deathSaves },
    consumables: c.consumables ? { ...c.consumables } : c.consumables,
    ammo: c.ammo ? { ...c.ammo } : c.ammo,
    ammoReserve: c.ammoReserve ? { ...c.ammoReserve } : c.ammoReserve,
    lastActionResult: c.lastActionResult ? { ...c.lastActionResult } : c.lastActionResult,
  };
}

let _logSeq = 0;

/** Append a log line to a log array, returning the created entry. */
function pushLog(
  log: CombatLogEntry[],
  round: number,
  text: string,
  tone?: CombatLogEntry['tone'],
): void {
  _logSeq += 1;
  // `ts` is left at 0 to keep the engine deterministic; callers (the store/UI)
  // can stamp wall-clock time on ingest if they want chronological ordering.
  log.push({ id: `log_${_logSeq}_${Math.random().toString(36).slice(2, 8)}`, round, text, tone, ts: 0 });
}

const find = (state: CombatState, id?: string | null): Combatant | undefined =>
  id ? state.combatants.find((c) => c.id === id) : undefined;

/** A combatant is "defeated" (out of the fight) when at 0 HP and not merely KO'd. */
function isDefeated(c: Combatant): boolean {
  return c.currentHP <= 0 && !c.isUnconscious;
}

// ---------------------------------------------------------------------------
// Combatant construction
// ---------------------------------------------------------------------------

export interface CreateCombatantOptions {
  team: Team;
  peerId?: string | null;
  /**
   * Starting hex. Defaults to `{ q: 0, r: 0 }`; real placement is assigned by the
   * caller via {@link deployHexes}.
   */
  position?: HexCoord;
  /** Carry current HP/MP/SP from a saved character; defaults to full. */
  currentHP?: number;
  currentMP?: number;
  currentSP?: number;
}

/**
 * Build a {@link Combatant} from a character. Max resources and AC come from
 * derived stats; current resources default to max unless carried over. The
 * position defaults to the origin hex `{ q: 0, r: 0 }`; callers assign real
 * battlefield placement via {@link deployHexes}. Death saves start zeroed; a
 * character entering at 0 HP starts unconscious — matching the original setup.
 */
/** Fallback weapon profile for weaponless combatants (natural-weapon beasts,
 *  the disarmed) so a Weapon Attack still resolves — a 1d4 melee strike. */
const UNARMED_STRIKE: WorldItem = {
  id: 'unarmed-strike',
  type: 'Inventory Item',
  name: 'Unarmed Strike',
  description: 'A desperate swing — fists, claws, or fangs.',
  itemType: 'Weapon',
  range: 'Melee',
  effects: [{ id: 'unarmed-dmg', type: 'Apply Damage', useWeaponDamage: true }],
};

/**
 * A combatant's action slots this round: its derived base plus any active timed
 * "Actions per Round" Modify-Stat effects (e.g. Rage +1, Hobble -1). The UI and
 * the network slot-cap read this so live buffs actually grant/remove actions.
 */
export function actionSlotsFor(
  character: Character | null | undefined,
  combatant?: Combatant | null,
): number {
  const base = character ? calculateDerivedStats(character).actionsPerRound : 3;
  let bonus = 0;
  for (const raw of combatant?.statusEffects ?? []) {
    const e = raw as RuntimeEffect;
    if (e.type !== 'Modify Stat') continue;
    if (String(e.statToModify).toUpperCase() !== 'ACTIONS PER ROUND') continue;
    if (typeof e.durationValue === 'number' && e.durationValue <= 0) continue;
    bonus += typeof e.rolledValue === 'number' ? e.rolledValue : parseInt(String(e.modification), 10) || 0;
  }
  return Math.max(1, base + bonus);
}

export function createCombatant(
  character: Character,
  opts: CreateCombatantOptions,
): Combatant {
  const derived = calculateDerivedStats(character);
  const position = opts.position ?? { q: 0, r: 0 };

  const currentHP = opts.currentHP ?? character.currentHP ?? derived.hp;
  const currentMP = opts.currentMP ?? character.currentMP ?? derived.mp;
  const currentSP = opts.currentSP ?? character.currentSP ?? derived.sp;

  // Tally consumable charges from the backpack so each one has finite uses.
  const consumables: Record<string, number> = {};
  for (const itemId of character.inventory?.backpack ?? []) {
    const item = findItem(itemId);
    if (item?.itemType !== 'Consumable') continue;
    consumables[itemId] = (consumables[itemId] ?? 0) + (item.charges ?? 1);
  }

  // Load a clip for any weapon (equipped or carried) that uses ammo, and stock
  // its finite reserve. Weapons without a clipSize never get an entry → they fire
  // freely, exactly as before.
  const ammo: Record<string, number> = {};
  const ammoReserve: Record<string, number> = {};
  const weaponIds = [character.inventory?.weapon, ...(character.inventory?.backpack ?? [])];
  for (const wid of weaponIds) {
    if (!wid) continue;
    const w = findItem(wid);
    if (!w || w.itemType !== 'Weapon' || !w.clipSize || w.clipSize <= 0) continue;
    ammo[wid] = w.clipSize;
    if (typeof w.reserveAmmo === 'number' && Number.isFinite(w.reserveAmmo)) {
      ammoReserve[wid] = Math.max(0, Math.floor(w.reserveAmmo));
    }
  }

  return {
    id: character.id,
    peerId: opts.peerId ?? null,
    characterId: character.id,
    name: character.name,
    team: opts.team,
    position,
    equippedWeaponId: undefined,
    consumables,
    ammo,
    ammoReserve,
    initiativeBonus: derived.initiative,
    maxHP: derived.hp,
    maxMP: derived.mp,
    maxSP: derived.sp,
    currentHP,
    currentMP,
    currentSP,
    ac: derived.ac,
    portraitSeed: character.portraitSeed,
    statusEffects: [],
    isUnconscious: currentHP === 0,
    isDead: false,
    isGuarding: false,
    deathSaves: { successes: 0, failures: 0 },
    lastActionResult: null,
  };
}

// ---------------------------------------------------------------------------
// Effective stats during combat
// ---------------------------------------------------------------------------

/** A combatant's base derived stats reconstructed from its max values + AC. */
interface EffectiveStats {
  ac: number;
  initiative: number;
  physical: number;
  stealth: number;
  lore: number;
  awareness: number;
  influence: number;
  survival: number;
}

const SKILL_STAT_KEYS = [
  'physical',
  'stealth',
  'lore',
  'awareness',
  'influence',
  'survival',
] as const;

/**
 * Effective combat stats: start from the combatant's static stats (AC and
 * initiative bonus) and layer on active "Modify Stat" duration effects. Skill
 * scores are not stored on the combatant, so the source character is used for
 * the base when available. Ported from `calculateEffectiveStats`, adapted to the
 * combatant model.
 */
function effectiveStats(combatant: Combatant, character?: Character): EffectiveStats {
  const base: EffectiveStats = character
    ? (() => {
        const d = calculateDerivedStats(character);
        return {
          ac: d.ac,
          initiative: d.initiative,
          physical: d.physical,
          stealth: d.stealth,
          lore: d.lore,
          awareness: d.awareness,
          influence: d.influence,
          survival: d.survival,
        };
      })()
    : {
        ac: combatant.ac,
        initiative: combatant.initiativeBonus,
        physical: 0,
        stealth: 0,
        lore: 0,
        awareness: 0,
        influence: 0,
        survival: 0,
      };

  for (const raw of combatant.statusEffects ?? []) {
    const e = raw as RuntimeEffect;
    if (e.type !== 'Modify Stat') continue;
    if (!e.durationValue || e.durationValue <= 0) continue;
    if (!e.statToModify) continue;
    const value =
      typeof e.rolledValue === 'number'
        ? e.rolledValue
        : parseInt(String(e.modification), 10) || 0;
    const key = e.statToModify.toUpperCase();
    switch (key) {
      case 'AC':
        base.ac += value;
        break;
      case 'INITIATIVE':
        base.initiative += value;
        break;
      case 'PHYSICAL':
        base.physical += value;
        break;
      case 'STEALTH':
        base.stealth += value;
        break;
      case 'LORE':
        base.lore += value;
        break;
      case 'AWARENESS':
        base.awareness += value;
        break;
      case 'INFLUENCE':
        base.influence += value;
        break;
      case 'SURVIVAL':
        base.survival += value;
        break;
      default:
        break;
    }
  }

  return base;
}

/** A skill score (physical, lore, …) for a combatant, including effects. */
function skillScore(
  combatant: Combatant,
  skill: string | undefined,
  character?: Character,
): number {
  if (!skill) return 0;
  const key = skill.toLowerCase();
  const stats = effectiveStats(combatant, character);
  if ((SKILL_STAT_KEYS as readonly string[]).includes(key)) {
    return stats[key as (typeof SKILL_STAT_KEYS)[number]];
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Advantage / disadvantage from status effects
// ---------------------------------------------------------------------------

/** Net advantage mode a combatant has on a given roll type from its effects. */
function advantageFromEffects(combatant: Combatant, rollType: string): AdvantageMode {
  let adv = false;
  let dis = false;
  for (const raw of combatant.statusEffects ?? []) {
    const e = raw as RuntimeEffect;
    if (e.type !== 'Give Advantage/Disadvantage') continue;
    if (e.targetSkill !== rollType) continue;
    if (!(typeof e.durationValue === 'number' ? e.durationValue > 0 : true)) continue;
    if (e.advDis === 'Advantage') adv = true;
    if (e.advDis === 'Disadvantage') dis = true;
  }
  if (adv && dis) return 'normal';
  if (adv) return 'advantage';
  if (dis) return 'disadvantage';
  return 'normal';
}

// ---------------------------------------------------------------------------
// Range & targeting
// ---------------------------------------------------------------------------

/**
 * Whether `target` is within `range` of `source`, by hex distance. `Self`
 * resolves by team (any ally counts). Every other band maps through
 * {@link RANGE_TO_HEX_DISTANCE}: `Melee` is adjacent (distance 1), up to
 * `Battlefield` (Infinity → always in range). Unknown bands are out of range.
 */
export function isTargetInRange(
  source: Combatant,
  target: Combatant | undefined,
  range: string | undefined,
): boolean {
  if (!source || !target) return false;
  if (range === 'Self') return target.team === source.team;
  const max = range ? RANGE_TO_HEX_DISTANCE[range] : undefined;
  if (max === undefined) return false;
  if (max === Infinity) return true;
  return hexDistance(source.position, target.position) <= max;
}

/** True when a usable only carries supportive (ally-targeting) effects. */
function isSupportive(data: UsableData): boolean {
  if (data.range === 'Self') return true;
  // Anything that deals damage is offensive, even when it also carries a buff —
  // otherwise a damaging AOE with a "+" stat rider would wrongly target allies.
  if ((data.effects ?? []).some((e) => e.type === 'Apply Damage')) return false;
  return (data.effects ?? []).some(
    (e) =>
      e.type === 'Apply Healing' ||
      (e.type === 'Modify Stat' &&
        (String(e.modification).startsWith('+') || e.statToModify === 'HP')),
  );
}

/**
 * Build the hexes of a line/cone of length `n` projected from `source` through
 * `primary` and continuing in the same direction. The line begins at `primary`
 * (the impact point) and steps outward; if it has not yet covered `n` hexes it
 * keeps stepping away from the source. Returns a deduplicated set of hex keys.
 */
function lineHexKeys(source: HexCoord, primary: HexCoord, n: number): Set<string> {
  const keys = new Set<string>();
  if (n <= 0) return keys;
  // The drawn segment from source→primary establishes direction; we want the run
  // of `n` hexes starting at the primary and extending outward.
  const seg = hexLineDraw(source, primary);
  let cursor = primary;
  let prev = seg.length >= 2 ? seg[seg.length - 2] : source;
  keys.add(`${cursor.q},${cursor.r}`);
  while (keys.size < n) {
    // Step further from `prev` (which trails behind cursor along the line).
    const next = stepAway(cursor, prev);
    if (hexEquals(next, cursor)) break;
    prev = cursor;
    cursor = next;
    keys.add(`${cursor.q},${cursor.r}`);
  }
  return keys;
}

/**
 * Expand a primary target into the full set affected by an AOE pattern, ported
 * from `getAOETargets`. Supports "Single Target", "AOE N" (a hex blast of radius
 * `floor(N/2)` around the primary), and "Target Line (N Row)"/"Line" (a line/cone
 * of length N from the source through the primary). Area effects are
 * team-agnostic — a blast catches EVERY combatant in the zone, ally and enemy
 * alike. Combatants already removed from the fight are skipped, and damaging
 * effects spare the downed (unconscious).
 */
export function getAOETargets(
  state: CombatState,
  primary: Combatant,
  aoe: string | undefined,
  source: Combatant,
  data: UsableData,
): Combatant[] {
  if (!primary || !aoe || aoe === 'Single Target') return [primary];

  const supportive = isSupportive(data);
  const targets: Combatant[] = [];

  // Area effects are team-agnostic: a blast catches allies and enemies alike.
  const eligible = (c: Combatant): boolean => {
    if (c.currentHP <= 0 && !c.isUnconscious) return false; // removed from the fight
    if (!supportive && c.isUnconscious) return false; // damage spares the downed
    return true;
  };

  if (aoe.includes('AOE')) {
    const size = parseInt(aoe.match(/AOE (\d+)/)?.[1] ?? '1', 10);
    const radius = Math.floor(size / 2);
    for (const c of state.combatants) {
      if (hexDistance(c.position, primary.position) <= radius && eligible(c)) targets.push(c);
    }
  } else if (aoe.includes('Target Line') || aoe.includes('Line')) {
    const lineSize = parseInt(aoe.match(/(\d+)/)?.[1] ?? '1', 10);
    const onLine = lineHexKeys(source.position, primary.position, lineSize);
    for (const c of state.combatants) {
      if (onLine.has(`${c.position.q},${c.position.r}`) && eligible(c)) targets.push(c);
    }
  }

  return targets.length > 0 ? targets : [primary];
}

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------

interface MoveOutcome {
  moved: boolean;
  from: HexCoord;
  to: HexCoord;
  blockedReason: 'boundary' | 'already adjacent' | null;
}

/**
 * Compute a forced move of `target` relative to `source` along the hex line
 * between them. "Away From" pushes the target away from the source; "Towards"
 * pulls it toward the source without passing through it. The shove walks one hex
 * at a time for up to `distance` steps, stopping early at the grid edge (sets
 * `blockedReason: 'boundary'`) or before a hex occupied by another living
 * combatant. A "Towards" target already adjacent to the source cannot be pulled
 * (`blockedReason: 'already adjacent'`). Mutates `target.position` on success.
 */
function moveTarget(
  state: CombatState,
  target: Combatant,
  source: Combatant,
  direction: string | undefined,
  distance: number,
): MoveOutcome {
  const from = { ...target.position };

  const occupied = (h: HexCoord): boolean =>
    state.combatants.some(
      (c) => c.id !== target.id && c.id !== source.id && c.currentHP > 0 && hexEquals(c.position, h),
    );

  if (direction === 'Towards' && hexDistance(target.position, source.position) <= 1) {
    return { moved: false, from, to: from, blockedReason: 'already adjacent' };
  }

  let cursor = { ...target.position };
  let blockedReason: MoveOutcome['blockedReason'] = null;
  let steps = 0;

  for (let i = 0; i < distance; i += 1) {
    let next: HexCoord;
    if (direction === 'Towards') {
      // Stop once adjacent — never pass through the source.
      if (hexDistance(cursor, source.position) <= 1) break;
      next = stepToward(cursor, source.position);
    } else {
      // Default / "Away From": move further from the source.
      next = stepAway(cursor, source.position);
    }
    if (hexEquals(next, cursor)) break;
    if (!inBounds(next, BATTLE_GRID)) {
      blockedReason = 'boundary';
      break;
    }
    if (occupied(next)) {
      blockedReason = 'boundary';
      break;
    }
    cursor = next;
    steps += 1;
  }

  if (steps === 0) {
    return { moved: false, from, to: from, blockedReason };
  }
  target.position = cursor;
  return { moved: true, from, to: cursor, blockedReason };
}

// ---------------------------------------------------------------------------
// Resource spending & damage with substitution
// ---------------------------------------------------------------------------

type ResourceKey = 'currentHP' | 'currentMP' | 'currentSP';

/** The active substitute-cost effect on a combatant, if any (most recent wins). */
function activeSubstitute(combatant: Combatant): RuntimeEffect | null {
  const subs = (combatant.statusEffects ?? []).filter(
    (e) => (e as RuntimeEffect).type === 'Substitute Cost',
  ) as RuntimeEffect[];
  let best: RuntimeEffect | null = null;
  for (const e of subs) {
    if (!best || (e.durationValue ?? 0) > (best.durationValue ?? 0)) best = e;
  }
  return best;
}

interface SpendResult {
  success: boolean;
  reason?: string;
  spent: { HP: number; MP: number; SP: number };
}

/**
 * Spend `amount` of a resource, falling back to a substitute resource when an
 * active Substitute Cost effect permits it (keeping HP at a floor of 1). Mutates
 * the combatant. Ported from `spendResourceWithSubstitute`.
 */
function spendResource(
  combatant: Combatant,
  resource: 'HP' | 'MP' | 'SP',
  amount: number,
): SpendResult {
  // Clamp the cost to a non-negative integer: a negative cost would REFUND the
  // resource (and overheal HP past max) — a resource-printer exploit — and a
  // non-finite cost would poison the pool. A 0 cost is a free, always-castable ability.
  amount = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
  const key = `current${resource}` as ResourceKey;
  const current = combatant[key] ?? 0;
  const spent = { HP: 0, MP: 0, SP: 0 };

  if (current >= amount) {
    spent[resource] = amount;
    combatant[key] -= amount;
    return { success: true, spent };
  }

  const sub = activeSubstitute(combatant);
  if (!sub || sub.resourceGained !== resource) {
    return { success: false, reason: `Insufficient ${resource}`, spent };
  }

  const subResource = sub.resourceDrained as 'HP' | 'MP' | 'SP' | undefined;
  if (!subResource) return { success: false, reason: `Insufficient ${resource}`, spent };
  const subKey = `current${subResource}` as ResourceKey;
  const available = combatant[subKey] ?? 0;
  const shortfall = amount - current;

  let maxDrain = available;
  if (subResource === 'HP' && maxDrain > 0) maxDrain = Math.max(0, available - 1);
  if (maxDrain < shortfall) {
    return { success: false, reason: `Insufficient ${subResource} for substitution`, spent };
  }

  spent[resource] = current;
  spent[subResource] = shortfall;
  combatant[key] = 0;
  combatant[subKey] -= shortfall;
  if (subResource === 'HP' && combatant.currentHP < 1) combatant.currentHP = 1;

  return { success: true, spent };
}

interface DamageResult {
  actualDamage: number;
  affected: { HP: number; MP: number; SP: number };
}

/** Mark a combatant unconscious at 0 HP, clearing enemy-applied effects. */
function checkUnconscious(combatant: Combatant): void {
  if (combatant.currentHP === 0 && !combatant.isUnconscious) {
    combatant.isUnconscious = true;
    combatant.deathSaves = { successes: 0, failures: 0 };
    combatant.statusEffects = (combatant.statusEffects ?? []).filter(
      (e) => (e as RuntimeEffect).sourceTeam === combatant.team,
    );
  }
}

/**
 * Apply `damage` to a combatant, honoring an HP-protecting Substitute Cost
 * effect (which diverts overflow to another resource, keeping HP ≥ 1 until that
 * resource is exhausted). Mutates the combatant and may set it unconscious.
 * Ported from `applyDamageWithSubstitute`.
 */
function applyDamageWithSubstitute(combatant: Combatant, damage: number): DamageResult {
  const affected = { HP: 0, MP: 0, SP: 0 };
  const currentHP = combatant.currentHP ?? 0;

  if (currentHP > damage) {
    affected.HP = damage;
    combatant.currentHP -= damage;
    checkUnconscious(combatant);
    return { actualDamage: damage, affected };
  }

  const sub = activeSubstitute(combatant);
  if (!sub || sub.resourceGained !== 'HP') {
    affected.HP = Math.min(damage, currentHP);
    combatant.currentHP = Math.max(0, currentHP - damage);
    checkUnconscious(combatant);
    return { actualDamage: affected.HP, affected };
  }

  const subResource = sub.resourceDrained as 'HP' | 'MP' | 'SP' | undefined;
  if (!subResource) {
    affected.HP = Math.min(damage, currentHP);
    combatant.currentHP = Math.max(0, currentHP - damage);
    checkUnconscious(combatant);
    return { actualDamage: affected.HP, affected };
  }
  const subKey = `current${subResource}` as ResourceKey;
  const available = combatant[subKey] ?? 0;
  const overflow = damage - Math.max(0, currentHP - 1);

  let maxDrain = available;
  if (subResource === 'HP' && maxDrain > 0) maxDrain = Math.max(0, available - 1);

  const actualSub = Math.min(overflow, maxDrain);
  const actualHP = Math.min(damage - actualSub, Math.max(0, currentHP - 1));

  affected.HP = actualHP;
  affected[subResource] = actualSub;
  combatant.currentHP = Math.max(1, currentHP - actualHP);
  combatant[subKey] = Math.max(0, (combatant[subKey] ?? 0) - actualSub);

  let extraHP = 0;
  if (actualSub < overflow && combatant[subKey] === 0) {
    extraHP = overflow - actualSub;
    combatant.currentHP = Math.max(0, combatant.currentHP - extraHP);
    affected.HP += extraHP;
  }

  checkUnconscious(combatant);
  // Include the overflow that fell back onto HP after the substitute pool was
  // exhausted, so the reported damage (and any drain credit) matches reality.
  return { actualDamage: actualHP + actualSub + extraHP, affected };
}

/** Add to a combatant resource, clamping to [0, max]; revives KO at >0 HP heal. */
function modifyResource(combatant: Combatant, resource: 'HP' | 'MP' | 'SP', value: number): void {
  const key = `current${resource}` as ResourceKey;
  const maxKey = `max${resource}` as 'maxHP' | 'maxMP' | 'maxSP';
  const max = combatant[maxKey];

  if (resource === 'HP' && value > 0 && combatant.isUnconscious && combatant.currentHP === 0) {
    combatant.isUnconscious = false;
    combatant.deathSaves = { successes: 0, failures: 0 };
    combatant.currentHP = max ? Math.min(value, max) : value;
    return;
  }

  combatant[key] = Math.max(0, (combatant[key] ?? 0) + value);
  if (max) combatant[key] = Math.min(combatant[key], max);
}

// ---------------------------------------------------------------------------
// Saving throws
// ---------------------------------------------------------------------------

interface SaveResult {
  success: boolean;
  total: number;
  roll: DiceRollResult;
  crit: 'success' | 'fail' | null;
}

/**
 * Roll a saving throw for a combatant: d20 (with advantage/disadvantage from
 * effects) + the relevant skill score vs DC. Natural 20 always succeeds, natural
 * 1 always fails. Ported from `rollSavingThrow`.
 */
function rollSavingThrow(
  combatant: Combatant,
  skill: string,
  dc: number,
  rng: Rng,
  character?: Character,
): SaveResult {
  const mode = advantageFromEffects(combatant, 'Saving Throw');
  const score = skillScore(combatant, skill, character);
  const r = rollD20(mode, score, rng);
  const total = r.total;
  const success = r.crit === 'success' || (r.crit !== 'fail' && total >= dc);
  return { success, total, roll: r, crit: r.crit ?? null };
}

// ---------------------------------------------------------------------------
// Death saves
// ---------------------------------------------------------------------------

type DeathSaveOutcome = 'continue' | 'revived' | 'dead';

/**
 * Process one death saving throw for an unconscious combatant. Nat 20 = +2
 * successes, nat 1 = +2 failures, ≥10 = success, else failure. 5 successes
 * stabilizes at 1 HP; 5 failures kills. Mutates the combatant. Ported from
 * `processDeathSave`.
 */
function processDeathSave(
  combatant: Combatant,
  round: number,
  log: CombatLogEntry[],
  results: ActionResult[],
  rng: Rng,
): DeathSaveOutcome {
  const r = rollD20('normal', 0, rng);
  const roll = r.rolls[0];

  const stabilize = (): DeathSaveOutcome => {
    combatant.currentHP = 1;
    combatant.isUnconscious = false;
    combatant.deathSaves = { successes: 0, failures: 0 };
    return 'revived';
  };

  if (r.crit === 'success') {
    combatant.deathSaves.successes += 2;
    if (combatant.deathSaves.successes >= 5) {
      pushLog(log, round, `${combatant.name} fights for their life [${roll}] — NATURAL 20! Revived at 1 HP.`, 'success');
      results.push({ kind: 'save', text: `${combatant.name} stabilizes!`, targetId: combatant.id });
      return stabilize();
    }
    pushLog(log, round, `${combatant.name} fights for their life [${roll}] — NATURAL 20! (${combatant.deathSaves.successes} successes)`, 'success');
    results.push({ kind: 'save', text: `${combatant.name}: ${combatant.deathSaves.successes} death-save successes`, targetId: combatant.id });
    return 'continue';
  }

  if (r.crit === 'fail') {
    combatant.deathSaves.failures += 2;
    if (combatant.deathSaves.failures >= 5) {
      pushLog(log, round, `${combatant.name} fights for their life [${roll}] — NATURAL 1! They have died.`, 'danger');
      results.push({ kind: 'death', text: `${combatant.name} has died.`, targetId: combatant.id });
      return 'dead';
    }
    pushLog(log, round, `${combatant.name} fights for their life [${roll}] — NATURAL 1! (${combatant.deathSaves.failures} failures)`, 'danger');
    results.push({ kind: 'save', text: `${combatant.name}: ${combatant.deathSaves.failures} death-save failures`, targetId: combatant.id });
    return 'continue';
  }

  if (roll >= 10) {
    combatant.deathSaves.successes += 1;
    if (combatant.deathSaves.successes >= 5) {
      pushLog(log, round, `${combatant.name} fights for their life [${roll}] — a spark remains. Revived at 1 HP.`, 'success');
      results.push({ kind: 'save', text: `${combatant.name} stabilizes!`, targetId: combatant.id });
      return stabilize();
    }
    pushLog(log, round, `${combatant.name} fights for their life [${roll}] — a spark remains (${combatant.deathSaves.successes} success${combatant.deathSaves.successes > 1 ? 'es' : ''})`, 'success');
    results.push({ kind: 'save', text: `${combatant.name}: ${combatant.deathSaves.successes} death-save successes`, targetId: combatant.id });
    return 'continue';
  }

  combatant.deathSaves.failures += 1;
  if (combatant.deathSaves.failures >= 5) {
    pushLog(log, round, `${combatant.name} fights for their life [${roll}] — death takes them.`, 'danger');
    results.push({ kind: 'death', text: `${combatant.name} has died.`, targetId: combatant.id });
    return 'dead';
  }
  pushLog(log, round, `${combatant.name} fights for their life [${roll}] — death creeps closer (${combatant.deathSaves.failures} failure${combatant.deathSaves.failures > 1 ? 's' : ''})`, 'danger');
  results.push({ kind: 'save', text: `${combatant.name}: ${combatant.deathSaves.failures} death-save failures`, targetId: combatant.id });
  return 'continue';
}

// ---------------------------------------------------------------------------
// Effect application
// ---------------------------------------------------------------------------

/** Roll-once cache for shared values applied identically across AOE targets. */
interface RolledCache {
  /**
   * Rolled damage keyed by effect id. Caching per effect means a single roll is
   * shared across all AOE targets of the *same* effect, while distinct effects on
   * one usable — e.g. an immediate hit and its separate damage-over-time tick —
   * each roll their own value instead of the DoT inheriting the hit's number.
   */
  damage: Record<string, number>;
  stats: Record<string, number>;
}

/** Compute the base damage for an Apply Damage effect (weapon + additional). */
function computeDamage(
  effect: SkillEffect,
  source: Combatant,
  sourceChar: Character | undefined,
  isCrit: boolean,
  rng: Rng,
): number {
  let weaponDamage = 0;
  if (effect.useWeaponDamage) {
    // A mid-combat equipment swap (source.equippedWeaponId) overrides the source
    // character's persisted equipped weapon.
    const weaponId = source.equippedWeaponId ?? sourceChar?.inventory?.weapon;
    const weapon = weaponId ? findItem(weaponId) : undefined;
    const weaponEffect = weapon?.effects?.find((e) => e.type === 'Apply Damage');
    if (weaponEffect?.additionalDamage) {
      weaponDamage = roll(weaponEffect.additionalDamage, rng).total * (effect.weaponMultiplier ?? 1);
    }
    if (weaponDamage === 0) {
      weaponDamage = roll('1d4', rng).total * (effect.weaponMultiplier ?? 1);
    }
  }
  const additional = effect.additionalDamage ? roll(effect.additionalDamage, rng).total : 0;
  let total = weaponDamage + additional;
  if (isCrit) total *= 2;
  return total;
}

interface ApplyContext {
  state: CombatState;
  source: Combatant;
  sourceChar?: Character;
  data: UsableData;
  isCrit: boolean;
  round: number;
  log: CombatLogEntry[];
  results: ActionResult[];
  rng: Rng;
  charLookup?: (c: Combatant) => Character | undefined;
}

/** Apply one resolved effect to one target. Mutates the target combatant. */
function applyEffect(
  ctx: ApplyContext,
  target: Combatant,
  effect: SkillEffect & { isHalved?: boolean },
  cache: RolledCache,
): void {
  const { source, sourceChar, data, isCrit, round, log, results, rng } = ctx;
  const name = data.name ?? 'an effect';

  switch (effect.type) {
    case 'Apply Damage': {
      const dkey = effect.id || 'damage';
      if (cache.damage[dkey] === undefined) {
        cache.damage[dkey] = computeDamage(effect, source, sourceChar, isCrit, rng);
      }
      let damage = cache.damage[dkey];
      if (effect.isHalved) damage = Math.floor(damage / 2);

      // Damage-over-time: attach as a duration effect rather than apply now.
      if (effect.durationValue && (effect.durationUnit || effect.durationType)) {
        const dot = createStatusEffect(effect, {
          sourceId: source.id,
          sourceName: name,
          sourceTeam: source.team,
        });
        dot.rolledDamage = damage;
        target.statusEffects.push(dot);
        pushLog(log, round, `${target.name} is afflicted with ${effect.additionalDamage} damage over ${effect.durationValue} ${String(effect.durationUnit ?? 'Rounds').toLowerCase()}.`, 'arcane');
        results.push({ kind: 'effect', text: `${target.name} afflicted by ${name}`, targetId: target.id });
        break;
      }

      const dmg = applyDamageWithSubstitute(target, damage);
      target.lastActionResult = { ...(target.lastActionResult ?? { kind: 'hit', text: '' }), kind: 'hit', amount: dmg.actualDamage, text: `${damage} damage` };
      pushLog(log, round, `${target.name} takes ${damage} damage${isCrit ? ' (CRITICAL!)' : ''}${effect.isHalved ? ' (halved)' : ''}. (${Math.max(0, target.currentHP)} HP left)`, 'danger');
      results.push({ kind: 'hit', amount: dmg.actualDamage, text: `${target.name} takes ${damage}`, targetId: target.id });

      if (effect.drainResourceEnabled) {
        applyDrain(ctx, target, effect, dmg.actualDamage);
      }
      break;
    }

    case 'Stun': {
      const stun = createStatusEffect(effect, {
        sourceId: source.id,
        sourceName: name,
        sourceTeam: source.team,
        typeOverride: 'Stunned',
        label: 'Stunned',
      });
      target.statusEffects.push(stun);
      pushLog(log, round, `${target.name} is Stunned for ${effect.durationValue} ${String(effect.durationUnit ?? 'Actions').toLowerCase()}.`, 'arcane');
      results.push({ kind: 'effect', text: `${target.name} is Stunned`, targetId: target.id });
      break;
    }

    case 'Modify Stat': {
      const statKey = String(effect.statToModify);
      // Cache the roll per EFFECT (not per stat) so two effects on the same stat
      // each roll/parse independently, while one effect still shares a single roll
      // across its AOE targets — mirroring the per-effect Apply Damage cache.
      const skey = effect.id || statKey;
      if (cache.stats[skey] === undefined) {
        cache.stats[skey] = roll(String(effect.modification), rng).total;
      }
      let value = cache.stats[skey];
      if (effect.isHalved) value = Math.floor(value / 2);

      // Max-pool buffs (e.g. War Cry's "+1d10 Max HP") adjust the combatant's
      // max pool. effectiveStats never reads a "Max HP" effect, so apply it
      // directly. A *timed* buff also stores a revert token that processEndOfRound
      // undoes on expiry; an untimed one is a permanent encounter change.
      const upperMax = statKey.toUpperCase();
      if (upperMax === 'MAX HP' || upperMax === 'MAX MP' || upperMax === 'MAX SP') {
        const maxKey = upperMax === 'MAX HP' ? 'maxHP' : upperMax === 'MAX MP' ? 'maxMP' : 'maxSP';
        const curKey = upperMax === 'MAX HP' ? 'currentHP' : upperMax === 'MAX MP' ? 'currentMP' : 'currentSP';
        // Apply against a floor of 1 and record the ACTUAL applied delta. A debuff
        // that clamps the pool to 1 removed less than its raw value, so the revert
        // must undo only what was applied — storing the raw value would over-restore
        // and permanently inflate the pool.
        const beforeMax = target[maxKey];
        target[maxKey] = Math.max(1, beforeMax + value);
        const appliedDelta = target[maxKey] - beforeMax;
        // Only grant fresh current headroom to a combatant that's up. Adding
        // current HP to a downed (0-HP, unconscious) unit would leave a "zombie"
        // (HP > 0 yet unconscious), so the downed gain max only and stay down.
        if (appliedDelta >= 0) {
          if (!target.isUnconscious) target[curKey] += appliedDelta;
        } else {
          target[curKey] = Math.min(target[curKey], target[maxKey]);
        }
        if (effect.durationValue && (effect.durationUnit || effect.durationType)) {
          const revert = createStatusEffect(effect, { sourceId: source.id, sourceName: name, sourceTeam: source.team });
          revert.rolledValue = appliedDelta; // exact delta to undo on expiry
          target.statusEffects.push(revert);
        }
        const pool = upperMax.slice(4);
        pushLog(log, round, `${target.name}'s maximum ${pool} ${value >= 0 ? 'rises' : 'falls'} by ${Math.abs(value)}.`, value >= 0 ? 'success' : 'danger');
        results.push({ kind: value >= 0 ? 'heal' : 'effect', amount: Math.abs(value), text: `${target.name} ${value >= 0 ? '+' : '-'}${Math.abs(value)} max ${pool}`, targetId: target.id });
        break;
      }

      if (effect.durationValue && (effect.durationUnit || effect.durationType)) {
        const statEffect = createStatusEffect(effect, {
          sourceId: source.id,
          sourceName: name,
          sourceTeam: source.team,
        });
        statEffect.rolledValue = value;
        target.statusEffects.push(statEffect);
        pushLog(log, round, `${target.name}'s ${statKey} will change by ${value >= 0 ? '+' : ''}${value} for ${effect.durationValue} ${String(effect.durationUnit ?? 'Rounds').toLowerCase()}.`, 'arcane');
        results.push({ kind: 'effect', text: `${target.name}: ${statKey} ${value >= 0 ? '+' : ''}${value}`, targetId: target.id });
        break;
      }

      const upper = statKey.toUpperCase();
      // A permanent or untimed buff on a NON-pool stat (AC/Initiative/skills) must
      // still apply — via a no-expire status effect that effectiveStats reads.
      // Without this, "+5 AC, Permanent" (the natural way to author a passive) and
      // any duration-0 stat buff silently did nothing.
      if (upper !== 'HP' && upper !== 'MP' && upper !== 'SP') {
        const statEffect = createStatusEffect(effect, { sourceId: source.id, sourceName: name, sourceTeam: source.team });
        statEffect.rolledValue = value;
        // Persist forever: effectiveStats requires durationValue>0; tickDurations
        // never decrements a 'Permanent' effect.
        statEffect.durationUnit = 'Permanent';
        statEffect.durationType = 'Permanent';
        statEffect.durationValue = 1;
        target.statusEffects.push(statEffect);
        pushLog(log, round, `${target.name}'s ${statKey} ${value >= 0 ? 'rises' : 'falls'} by ${Math.abs(value)}.`, value >= 0 ? 'success' : 'danger');
        results.push({ kind: 'effect', text: `${target.name}: ${statKey} ${value >= 0 ? '+' : ''}${value}`, targetId: target.id });
        break;
      }

      if (upper === 'HP' || upper === 'MP' || upper === 'SP') {
        const before = target.currentHP;
        modifyResource(target, upper as 'HP' | 'MP' | 'SP', value);
        if (value > 0) {
          const healed = upper === 'HP' ? target.currentHP - before : value;
          pushLog(log, round, `${target.name} restores ${Math.abs(value)} ${upper}.`, 'success');
          results.push({ kind: 'heal', amount: Math.max(0, healed), text: `${target.name} +${Math.abs(value)} ${upper}`, targetId: target.id });
          target.lastActionResult = { kind: 'heal', amount: Math.abs(value), text: `+${Math.abs(value)} ${upper}` };
        } else {
          pushLog(log, round, `${target.name} loses ${Math.abs(value)} ${upper}.`, 'danger');
          results.push({ kind: 'effect', amount: value, text: `${target.name} -${Math.abs(value)} ${upper}`, targetId: target.id });
        }
      }
      break;
    }

    case 'Apply Healing': {
      const res = String(effect.statToModify ?? 'HP').toUpperCase();
      const pool: 'HP' | 'MP' | 'SP' = res === 'MP' ? 'MP' : res === 'SP' ? 'SP' : 'HP';
      let amount = roll(String(effect.modification ?? '0'), rng).total;
      if (effect.isHalved) amount = Math.floor(amount / 2);
      if (amount < 0) amount = 0;
      const beforeRes = pool === 'HP' ? target.currentHP : pool === 'MP' ? target.currentMP : target.currentSP;
      modifyResource(target, pool, amount);
      const afterRes = pool === 'HP' ? target.currentHP : pool === 'MP' ? target.currentMP : target.currentSP;
      pushLog(log, round, `${target.name} is healed for ${amount} ${pool}.`, 'success');
      results.push({ kind: 'heal', amount: Math.max(0, afterRes - beforeRes), text: `${target.name} +${amount} ${pool}`, targetId: target.id });
      target.lastActionResult = { kind: 'heal', amount, text: `+${amount} ${pool}` };
      break;
    }

    case 'Give Advantage/Disadvantage': {
      const adv = createStatusEffect(effect, {
        sourceId: source.id,
        sourceName: name,
        sourceTeam: source.team,
      });
      target.statusEffects.push(adv);
      const word = effect.advDis === 'Advantage' ? 'advantage' : 'disadvantage';
      pushLog(log, round, `${target.name} gains ${word} on ${effect.targetSkill} for ${effect.durationValue} ${String(effect.durationUnit ?? 'Rounds').toLowerCase()}.`, 'arcane');
      results.push({ kind: 'effect', text: `${target.name}: ${word} on ${effect.targetSkill}`, targetId: target.id });
      break;
    }

    case 'Move Target': {
      // Any saving throw is already resolved upstream by processSavingThrows: a
      // successful Negate save drops this effect before it reaches here, and a
      // failed save lets it through. Re-rolling here was double jeopardy, so just
      // apply the shove.
      const move = moveTarget(ctx.state, target, source, effect.direction as string, Number(effect.rows) || 0);
      if (move.moved) {
        const word = effect.direction === 'Away From' ? 'pushed away' : 'pulled closer';
        pushLog(log, round, `${target.name} is ${word}.`, 'beam');
        results.push({ kind: 'move', text: `${target.name} ${word}`, targetId: target.id });
      }
      break;
    }

    case 'Substitute Cost': {
      const sub = createStatusEffect(effect, {
        sourceId: source.id,
        sourceName: name,
        sourceTeam: source.team,
      });
      target.statusEffects.push(sub);
      pushLog(log, round, `${target.name} can substitute ${effect.resourceGained} with ${effect.resourceDrained} for ${effect.durationValue} ${String(effect.durationUnit ?? 'Rounds').toLowerCase()}.`, 'arcane');
      results.push({ kind: 'effect', text: `${target.name}: substitute cost active`, targetId: target.id });
      break;
    }

    default:
      break;
  }
}

/** Drain a resource from `target` and replenish the source. Ported from drain logic. */
function applyDrain(
  ctx: ApplyContext,
  target: Combatant,
  effect: SkillEffect,
  drainedAmount: number,
): void {
  const { source, round, log, results } = ctx;
  const targetResource = effect.resourceDrainedFromTarget as 'HP' | 'MP' | 'SP' | undefined;
  const selfResource = effect.resourceReplenishedToSelf as 'HP' | 'MP' | 'SP' | undefined;
  if (!targetResource || !selfResource) return;

  const tKey = `current${targetResource}` as ResourceKey;
  let actualDrained: number;
  if (targetResource === 'HP') {
    // The 'Apply Damage' step already removed this HP from the target — applyDrain
    // is only ever called right after applyDamageWithSubstitute. Draining HP must
    // NOT subtract a second time; it only transfers a share of the damage already
    // dealt to the source as healing. `drainedAmount` is that actual HP loss.
    actualDrained = Math.max(0, drainedAmount);
  } else {
    // A different pool (MP/SP) was untouched by the damage — drain it now.
    const available = target[tKey] ?? 0;
    actualDrained = Math.min(drainedAmount, available);
    if (actualDrained <= 0) return;
    target[tKey] = Math.max(0, available - actualDrained);
  }
  if (actualDrained <= 0) return;

  let replenish = actualDrained;
  if (effect.replenishAmount === 'Half') replenish = Math.floor(actualDrained / 2);
  if (replenish <= 0) return;

  const sKey = `current${selfResource}` as ResourceKey;
  // Clamp to the source's TRUE max. A genuine max of 0 must cap at 0 — don't fall
  // back to 100, which would let a fully-debuffed pool bank resource above its max.
  const sMaxRaw = source[`max${selfResource}` as 'maxHP' | 'maxMP' | 'maxSP'];
  const sMax = typeof sMaxRaw === 'number' && Number.isFinite(sMaxRaw) ? sMaxRaw : 100;
  source[sKey] = Math.min(sMax, (source[sKey] ?? 0) + replenish);

  pushLog(log, round, `${source.name} drains ${actualDrained} ${targetResource} from ${target.name} and gains ${replenish} ${selfResource}.`, 'arcane');
  results.push({ kind: 'effect', text: `${source.name} drains ${target.name}`, targetId: target.id });
}

/**
 * Run saving throws for effects that have them, returning the surviving effects
 * (with `isHalved` set where a "Halve" save succeeded). Ported from
 * `processSavingThrows`: one roll per save-skill group, evaluated per effect DC.
 */
function processSavingThrows(
  target: Combatant,
  effects: SkillEffect[],
  round: number,
  log: CombatLogEntry[],
  rng: Rng,
  character?: Character,
): Array<SkillEffect & { isHalved?: boolean }> {
  const groups = new Map<string, SkillEffect[]>();
  const noSave: SkillEffect[] = [];

  for (const effect of effects) {
    if (!effect.savingThrowEnabled || typeof effect.saveSkill !== 'string') {
      noSave.push(effect);
    } else {
      const skill = effect.saveSkill;
      if (!groups.has(skill)) groups.set(skill, []);
      groups.get(skill)!.push(effect);
    }
  }

  const final: Array<SkillEffect & { isHalved?: boolean }> = [...noSave];

  for (const [skill, groupEffects] of groups) {
    const highestDC = Math.max(...groupEffects.map((e) => Number(e.saveDC) || 0));
    const save = rollSavingThrow(target, skill, highestDC, rng, character);
    pushLog(log, round, `${target.name} rolls ${skill} save: ${save.total}.`, 'muted');

    for (const effect of groupEffects) {
      const dc = Number(effect.saveDC) || 0;
      const success = save.crit === 'success' || (save.crit !== 'fail' && save.total >= dc);
      if (success) {
        if (effect.saveOutcome === 'Halve') {
          final.push({ ...effect, isHalved: true });
          pushLog(log, round, `${target.name} saves vs ${effect.type} — effect halved.`, 'success');
        } else {
          pushLog(log, round, `${target.name} saves vs ${effect.type} — negated.`, 'success');
        }
      } else {
        final.push(effect);
        pushLog(log, round, `${target.name} fails save vs ${effect.type}.`, 'danger');
      }
    }
  }

  return final;
}

// ---------------------------------------------------------------------------
// Initiative
// ---------------------------------------------------------------------------

/**
 * Roll initiative for every declared action and return them sorted descending.
 * Each declared action rolls a d20 + the source's effective initiative bonus,
 * faithful to the original per-action initiative model. Stable for equal totals
 * by declaration order.
 */
export function rollInitiativeForRound(
  state: CombatState,
  rng: Rng = Math.random,
  charLookup?: (c: Combatant) => Character | undefined,
): ResolvedAction[] {
  const queue: ResolvedAction[] = [];

  for (const combatant of state.combatants) {
    const actions =
      state.declaredActions[combatant.peerId ?? ''] ?? state.declaredActions[combatant.id] ?? [];
    if (actions.length === 0) continue;

    const bonus = effectiveStats(combatant, charLookup?.(combatant)).initiative;

    for (const action of actions) {
      const initiative = rollD20('normal', bonus, rng).total;
      queue.push({
        ...action,
        sourceId: combatant.id,
        sourceTeam: combatant.team,
        initiative,
      });
    }
  }

  return queue
    .map((a, i) => ({ a, i }))
    .sort((x, y) => y.a.initiative - x.a.initiative || x.i - y.i)
    .map(({ a }) => a);
}

// ---------------------------------------------------------------------------
// Action resolution
// ---------------------------------------------------------------------------

/**
 * A predicate marking hexes blocked for `mover`: any OTHER living combatant
 * occupies the hex. The mover's own hex is never blocked.
 */
function blockedBy(state: CombatState, mover: Combatant): (h: HexCoord) => boolean {
  return (h: HexCoord) =>
    state.combatants.some(
      (c) => c.id !== mover.id && c.currentHP > 0 && hexEquals(c.position, h),
    );
}

/**
 * Resolve a Move action on the hex grid. With an explicit `targetHex` the source
 * walks toward it (up to {@link MOVE_RANGE} steps, stopping at the closest
 * reachable open hex). Without one, the legacy labels apply: "Approach" moves
 * toward the action target and stops adjacent; "Flee"/anything else moves away.
 */
function resolveMove(
  state: CombatState,
  source: Combatant,
  action: DeclaredAction,
  round: number,
  log: CombatLogEntry[],
  results: ActionResult[],
): void {
  const blocked = blockedBy(state, source);

  let goal: HexCoord | undefined = action.targetHex;
  let stopAdjacent = false;
  if (!goal) {
    const ref = find(state, action.targetId);
    if (action.label === 'Approach' && ref) {
      goal = ref.position;
      stopAdjacent = true;
    } else if (ref) {
      // Flee / default: aim at a far hex on the opposite side of the reference.
      const dir = { q: source.position.q - ref.position.q, r: source.position.r - ref.position.r };
      goal = { q: source.position.q + dir.q * MOVE_RANGE, r: source.position.r + dir.r * MOVE_RANGE };
    }
  }

  if (!goal) {
    pushLog(log, round, `${source.name} holds position.`, 'muted');
    results.push({ kind: 'info', text: `${source.name} holds position`, targetId: source.id });
    return;
  }

  const dest = closestReachableTo(source.position, goal, MOVE_RANGE, blocked, BATTLE_GRID);

  // When approaching a specific combatant, don't end on top of it: if the closest
  // reachable hex is the target's own hex, fall back toward an adjacent hex.
  let finalDest = dest;
  if (stopAdjacent && hexEquals(dest, goal)) {
    finalDest = source.position;
  }

  if (hexEquals(finalDest, source.position)) {
    pushLog(log, round, `${source.name} cannot move any closer.`, 'muted');
    results.push({ kind: 'info', text: `${source.name} is blocked`, targetId: source.id });
    return;
  }

  source.position = finalDest;
  pushLog(log, round, `${source.name} moves.`, 'beam');
  results.push({ kind: 'move', text: `${source.name} moves`, targetId: source.id });
}

/** Resolve a Flee action: step away from the target up to {@link MOVE_RANGE} hexes. */
function resolveFlee(
  state: CombatState,
  source: Combatant,
  target: Combatant | undefined,
  round: number,
  log: CombatLogEntry[],
  results: ActionResult[],
): void {
  if (!target) {
    pushLog(log, round, `${source.name} tries to flee but has no one to flee from.`, 'muted');
    results.push({ kind: 'info', text: `${source.name} cannot flee`, targetId: source.id });
    return;
  }

  const blocked = blockedBy(state, source);
  // Aim at a hex far on the opposite side of the target, then take as many steps
  // toward it as the move allowance permits.
  const dir = {
    q: source.position.q - target.position.q,
    r: source.position.r - target.position.r,
  };
  const farGoal =
    dir.q === 0 && dir.r === 0
      ? { q: source.position.q + MOVE_RANGE, r: source.position.r }
      : { q: source.position.q + dir.q * MOVE_RANGE, r: source.position.r + dir.r * MOVE_RANGE };
  const dest = closestReachableTo(source.position, farGoal, MOVE_RANGE, blocked, BATTLE_GRID);

  if (hexEquals(dest, source.position)) {
    pushLog(log, round, `${source.name} tries to flee but is cornered.`, 'muted');
    results.push({ kind: 'info', text: `${source.name} is cornered`, targetId: source.id });
    return;
  }

  source.position = dest;
  pushLog(log, round, `${source.name} flees from ${target.name}.`, 'beam');
  results.push({ kind: 'move', text: `${source.name} flees`, targetId: source.id });
}

/** Resolve a Guard action (defensive stance giving attackers disadvantage). */
function resolveGuard(
  source: Combatant,
  round: number,
  log: CombatLogEntry[],
  results: ActionResult[],
): void {
  source.isGuarding = true;
  source.statusEffects.push({
    id: nextEffectId('guard'),
    type: 'Guarding',
    label: 'Guarding',
    sourceId: source.id,
    sourceName: 'Guard',
    durationType: 'Rounds',
    durationValue: 1,
    durationUnit: 'Rounds',
    sourceTeam: source.team,
    tone: 'buff',
  } as RuntimeEffect);
  pushLog(log, round, `${source.name} takes a defensive stance.`, 'beam');
  results.push({ kind: 'guard', text: `${source.name} guards`, targetId: source.id });
}

/** Resolve using an ability or weapon: range, cost, hit roll, effects. */
function resolveUsable(
  ctx: ApplyContext,
  source: Combatant,
  target: Combatant | undefined,
  data: UsableData,
  opts: { isWeaponAttack: boolean },
): void {
  const { state, round, log, results, rng } = ctx;
  const name = data.name ?? 'an ability';

  const supportive = (data.effects ?? []).some(
    (e) =>
      e.type === 'Apply Healing' ||
      (e.type === 'Modify Stat' && ['HP', 'MP', 'SP'].includes(String(e.statToModify))),
  );

  // An AOE still detonates on its zone (hitting live combatants near the primary)
  // even if the primary target itself is down — only a single-target attack on a
  // downed target is a no-op.
  const isAOE = !!(data as { aoe?: string }).aoe && (data as { aoe?: string }).aoe !== 'Single Target';
  if (
    target &&
    ((target.currentHP <= 0 && !target.isUnconscious) || target.isUnconscious) &&
    !supportive &&
    !isAOE
  ) {
    pushLog(log, round, `${source.name} tries to use ${name}, but ${target.name} is down.`, 'muted');
    results.push({ kind: 'info', text: `${target?.name ?? 'Target'} is down`, targetId: target?.id });
    return;
  }

  if (!isTargetInRange(source, target, data.range)) {
    pushLog(log, round, `${source.name} tries to use ${name}, but ${target?.name ?? 'the target'} is out of range.`, 'muted');
    results.push({ kind: 'info', text: `Out of range`, targetId: target?.id });
    return;
  }

  // Spend resources for abilities (weapon attacks are free).
  if (!opts.isWeaponAttack) {
    const cost = (data as LinkedItem).cost;
    if (cost) {
      const spend = spendResource(source, cost.type, cost.value);
      if (!spend.success) {
        pushLog(log, round, `${source.name} tries to use ${name}, but ${spend.reason}.`, 'muted');
        results.push({ kind: 'info', text: spend.reason ?? 'Cannot afford', targetId: source.id });
        return;
      }
    }
  }

  if (data.range === 'Self') {
    if (!target || target.team !== source.team) {
      pushLog(log, round, `${source.name} uses ${name}, but needs a valid ally target.`, 'muted');
      results.push({ kind: 'info', text: 'No valid target', targetId: source.id });
      return;
    }
  } else if (!target) {
    pushLog(log, round, `${source.name} uses ${name}, but has no target.`, 'muted');
    results.push({ kind: 'info', text: 'No target', targetId: source.id });
    return;
  }

  const allTargets = getAOETargets(state, target!, data.aoe, source, data);
  const autoHit = data.hitType === 'Auto Hit' || data.range === 'Self';
  const cache: RolledCache = { stats: {}, damage: {} };

  if (autoHit) {
    pushLog(log, round, `${source.name} uses ${name}${allTargets.length > 1 ? ` affecting ${allTargets.length} targets` : ` on ${target!.name}`}.`, 'arcane');
    for (const t of allTargets) {
      t.lastActionResult = { kind: 'effect', text: '' };
      const effs = processSavingThrows(t, data.effects ?? [], round, log, rng, ctx.charLookup?.(t));
      for (const eff of effs) applyEffect(ctx, t, eff, cache);
    }
    return;
  }

  // Roll-to-hit path.
  const attackSkill = data.rollModifier;
  const score = skillScore(source, attackSkill, ctx.sourceChar);

  let mode = advantageFromEffects(source, 'Attack Roll');
  // Guard on the primary target imposes disadvantage (and is consumed).
  const guarding = (target!.statusEffects ?? []).find(
    (e) => (e as RuntimeEffect).type === 'Guarding',
  );
  if (guarding) {
    mode = combineAdvantage(mode, 'disadvantage');
    target!.statusEffects = (target!.statusEffects ?? []).filter((e) => e !== guarding);
    target!.isGuarding = false;
  }

  const attack = rollD20(mode, score, rng);
  const isCrit = attack.crit === 'success';
  const isCritFail = attack.crit === 'fail';
  ctx.isCrit = isCrit;

  pushLog(log, round, `${source.name} attacks with ${name}${allTargets.length > 1 ? ` (AOE × ${allTargets.length})` : ''}: ${attack.total}${isCrit ? ' NATURAL 20!' : isCritFail ? ' NATURAL 1!' : ''}.`, 'beam');

  const hitTargets: Combatant[] = [];
  for (const t of allTargets) {
    const targetAC = effectiveStats(t, ctx.charLookup?.(t)).ac;
    t.lastActionResult = { kind: 'miss', text: 'miss' };
    if (isCritFail) {
      pushLog(log, round, `Critical miss against ${t.name} (AC ${targetAC}).`, 'muted');
      results.push({ kind: 'miss', text: `Critical miss on ${t.name}`, targetId: t.id });
    } else if (isCrit || attack.total >= targetAC) {
      hitTargets.push(t);
      t.lastActionResult = { kind: 'hit', text: 'hit' };
      pushLog(log, round, `${isCrit ? 'CRITICAL HIT' : 'Hits'} ${t.name} (AC ${targetAC})!`, 'danger');
      results.push({ kind: 'hit', text: `Hits ${t.name}`, targetId: t.id });
    } else {
      pushLog(log, round, `Misses ${t.name} (AC ${targetAC}).`, 'muted');
      results.push({ kind: 'miss', text: `Misses ${t.name}`, targetId: t.id });
    }
  }

  for (const t of hitTargets) {
    const effs = processSavingThrows(t, data.effects ?? [], round, log, rng, ctx.charLookup?.(t));
    for (const eff of effs) applyEffect(ctx, t, eff, cache);
  }
}

export interface ResolveOptions {
  /** Optional lookup to recover a combatant's source character for skill scores. */
  charLookup?: (combatant: Combatant) => Character | undefined;
}

/**
 * Resolve a single {@link ResolvedAction} against combat state, returning a new
 * state plus the action's results and log entries. PURE — the input state is
 * cloned and never mutated. Handles death-save turns, stun skips, and all action
 * types (Move, Guard, Use Ability, Weapon Attack, Use Item, Flee, Pass).
 */
export function resolveAction(
  state: CombatState,
  action: ResolvedAction,
  rng: Rng = Math.random,
  options: ResolveOptions = {},
): ResolveResult {
  const next = cloneState(state);
  const log: CombatLogEntry[] = [];
  const results: ActionResult[] = [];
  const round = next.round;

  const source = find(next, action.sourceId);
  const target = find(next, action.targetId);

  if (!source) {
    pushLog(log, round, `A combatant was not found; action skipped.`, 'muted');
    return { state: next, results, log };
  }

  // A dead source never acts.
  if (source.isDead) {
    pushLog(log, round, `${source.name} was already defeated.`, 'muted');
    return { state: next, results, log };
  }

  // An unconscious source cannot take a normal action. At 0 HP it is dying and
  // rolls a death save; if it is unconscious but still has HP (e.g. a GM toggle)
  // it simply loses its turn without rolling.
  if (source.isUnconscious) {
    if (source.currentHP === 0) {
      const outcome = processDeathSave(source, round, log, results, rng);
      if (outcome === 'dead') {
        source.isDead = true;
        next.combatants = next.combatants.filter((c) => c.id !== source.id);
      }
    } else {
      pushLog(log, round, `${source.name} is unconscious and cannot act.`, 'muted');
      results.push({ kind: 'info', text: `${source.name} is unconscious`, targetId: source.id });
    }
    return { state: next, results, log };
  }

  // A defeated (0 HP, not merely KO'd) source is out of the fight.
  if (isDefeated(source)) {
    pushLog(log, round, `${source.name} was already defeated.`, 'muted');
    return { state: next, results, log };
  }

  // Stunned source loses the action; one stun charge ticks down.
  const stun = (source.statusEffects ?? []).find(
    (e) => (e as RuntimeEffect).type === 'Stunned',
  ) as RuntimeEffect | undefined;
  if (stun) {
    pushLog(log, round, `${source.name} is Stunned and cannot act!`, 'arcane');
    results.push({ kind: 'info', text: `${source.name} is Stunned`, targetId: source.id });
    if (typeof stun.durationValue === 'number') stun.durationValue -= 1;
    source.statusEffects = (source.statusEffects ?? []).filter(
      (e) => (e as RuntimeEffect) !== stun || ((e as RuntimeEffect).durationValue ?? 0) > 0,
    );
    return { state: next, results, log };
  }

  const ctxBase = {
    state: next,
    source,
    sourceChar: options.charLookup?.(source),
    isCrit: false,
    round,
    log,
    results,
    rng,
    charLookup: options.charLookup,
  };

  switch (action.actionType) {
    case 'Move':
      resolveMove(next, source, action, round, log, results);
      break;

    case 'Flee':
      resolveFlee(next, source, target, round, log, results);
      break;

    case 'Change Equipment': {
      source.equippedWeaponId = action.actionId ?? null;
      const weapon = action.actionId ? findItem(action.actionId) : undefined;
      const what = weapon?.name ? `the ${weapon.name}` : 'a different weapon';
      pushLog(log, round, `${source.name} readies ${what}.`, 'beam');
      results.push({ kind: 'info', text: `${source.name} swaps equipment`, targetId: source.id });
      break;
    }

    case 'Guard':
      resolveGuard(source, round, log, results);
      break;

    case 'Pass':
      pushLog(log, round, `${source.name} waits.`, 'muted');
      results.push({ kind: 'info', text: `${source.name} passes`, targetId: source.id });
      break;

    case 'Use Item': {
      const item = action.actionId ? findItem(action.actionId) : undefined;
      if (!item) {
        pushLog(log, round, `${source.name} tries to use an item, but it wasn't found.`, 'muted');
        break;
      }
      if (!target) {
        pushLog(log, round, `${source.name} tries to use ${item.name}, but has no target.`, 'muted');
        break;
      }
      // Enforce the per-combat consumable tally — a single item is not infinite.
      const remaining = source.consumables?.[item.id];
      if (remaining !== undefined && remaining <= 0) {
        pushLog(log, round, `${source.name} reaches for ${item.name}, but has none left.`, 'muted');
        results.push({ kind: 'info', text: `No ${item.name} remaining`, targetId: source.id });
        break;
      }
      pushLog(log, round, `${source.name} uses ${item.name} on ${target.name}.`, 'arcane');
      const cache: RolledCache = { stats: {}, damage: {} };
      const ctx: ApplyContext = { ...ctxBase, data: item };
      const effs = processSavingThrows(target, item.effects ?? [], round, log, rng, options.charLookup?.(target));
      for (const eff of effs) applyEffect(ctx, target, eff, cache);
      if (source.consumables && remaining !== undefined) {
        source.consumables[item.id] = remaining - 1;
      }
      break;
    }

    case 'Weapon Attack': {
      // A mid-combat equipment swap overrides the declared weapon id. Weaponless
      // combatants (natural-weapon beasts, the disarmed) fall back to an unarmed
      // strike so they can still attack instead of no-opping.
      const weaponId = source.equippedWeaponId ?? action.actionId;
      const weapon = (weaponId ? findItem(weaponId) : undefined) ?? UNARMED_STRIKE;
      if (!target) {
        pushLog(log, round, `${source.name} swings ${weapon.name}, but has no target.`, 'muted');
        break;
      }
      if ((target.currentHP <= 0 && !target.isUnconscious) || target.isUnconscious) {
        pushLog(log, round, `${source.name} tries to attack, but ${target.name} is down.`, 'muted');
        break;
      }
      if (!isTargetInRange(source, target, weapon.range)) {
        pushLog(log, round, `${source.name} tries to attack, but ${target.name} is out of range.`, 'muted');
        break;
      }
      const usesAmmo = typeof weapon.clipSize === 'number' && weapon.clipSize > 0;
      const perShot = Math.max(1, Math.floor(weapon.ammoPerShot ?? 1));
      const shots = Math.min(20, Math.max(1, Math.floor(weapon.shots ?? 1))); // cap the burst loop
      if (usesAmmo) {
        if (!source.ammo) source.ammo = {};
        // Lazily load a clip for a weapon that wasn't stocked at creation (e.g. an
        // NPC or a mid-combat swap), so it isn't permanently empty.
        if (source.ammo[weapon.id] == null) source.ammo[weapon.id] = weapon.clipSize as number;
        if ((source.ammo[weapon.id] ?? 0) < perShot) {
          pushLog(log, round, `${source.name}'s ${weapon.name} clicks empty — reload!`, 'muted');
          results.push({ kind: 'info', text: `${weapon.name} is empty`, targetId: source.id });
          break;
        }
      }
      pushLog(log, round, `${source.name} attacks ${target.name} with ${weapon.name}${shots > 1 ? ` (×${shots})` : ''}!`, 'beam');
      const ctx: ApplyContext = { ...ctxBase, data: weapon };
      // An AOE burst keeps firing into the zone (each shot re-targets every live
      // combatant); only a single-target burst aborts when its target drops.
      const weaponAoe = (weapon as { aoe?: string }).aoe;
      const aoeWeapon = !!weaponAoe && weaponAoe !== 'Single Target';
      for (let s = 0; s < shots; s += 1) {
        // Check the target-down stop BEFORE spending ammo, so a kill doesn't waste
        // a round on a shot that never fires.
        if (!aoeWeapon && ((target.currentHP <= 0 && !target.isUnconscious) || target.isUnconscious)) break;
        if (usesAmmo) {
          if ((source.ammo![weapon.id] ?? 0) < perShot) break; // ran dry mid-burst
          source.ammo![weapon.id] -= perShot;
        }
        resolveUsable(ctx, source, target, weapon, { isWeaponAttack: true });
      }
      if (usesAmmo) {
        pushLog(log, round, `${weapon.name}: ${source.ammo![weapon.id] ?? 0}/${weapon.clipSize} loaded.`, 'muted');
      }
      break;
    }

    case 'Reload': {
      const weaponId = source.equippedWeaponId ?? action.actionId;
      const weapon = weaponId ? findItem(weaponId) : undefined;
      if (!weapon || !weapon.clipSize) {
        pushLog(log, round, `${source.name} has nothing to reload.`, 'muted');
        break;
      }
      if (!source.ammo) source.ammo = {};
      const loaded = source.ammo[weapon.id] ?? 0;
      const need = weapon.clipSize - loaded;
      if (need <= 0) {
        pushLog(log, round, `${source.name}'s ${weapon.name} is already full.`, 'muted');
        break;
      }
      // Draw from a finite reserve if one is tracked; otherwise the reserve is
      // unlimited and the clip simply tops off.
      let drawn = need;
      if (source.ammoReserve && typeof source.ammoReserve[weapon.id] === 'number') {
        const reserve = source.ammoReserve[weapon.id];
        drawn = Math.min(need, reserve);
        source.ammoReserve[weapon.id] = reserve - drawn;
      }
      if (drawn <= 0) {
        pushLog(log, round, `${source.name} is out of ammo for ${weapon.name}.`, 'muted');
        results.push({ kind: 'info', text: `No reserve for ${weapon.name}`, targetId: source.id });
        break;
      }
      source.ammo[weapon.id] = loaded + drawn;
      pushLog(log, round, `${source.name} reloads ${weapon.name} (${source.ammo[weapon.id]}/${weapon.clipSize}).`, 'beam');
      results.push({ kind: 'info', text: `${source.name} reloads ${weapon.name}`, targetId: source.id });
      break;
    }

    case 'Use Ability': {
      const node = action.actionId ? findNode(action.actionId) : undefined;
      const ability = node?.linkedItem;
      if (!ability) {
        pushLog(log, round, `${source.name} tries to use an ability, but it wasn't found.`, 'muted');
        break;
      }
      const ctx: ApplyContext = { ...ctxBase, data: ability };
      resolveUsable(ctx, source, target, ability, { isWeaponAttack: false });
      break;
    }

    default:
      pushLog(log, round, `${source.name} does nothing.`, 'muted');
      break;
  }

  // Append this action's log to the running combat log on the returned state.
  next.log = [...next.log, ...log];
  return { state: next, results, log };
}

// ---------------------------------------------------------------------------
// Round lifecycle
// ---------------------------------------------------------------------------

/**
 * Apply every active damage-over-time effect on a combatant for this round,
 * subtracting its pre-rolled damage from current HP (clamped at 0) and logging a
 * danger line. A DoT that brings the combatant to 0 HP knocks it out via the
 * same path as direct damage. Mutates the combatant; appends to `log`. Skips the
 * dead and combatants already at 0 HP.
 *
 * Damage is read from the runtime effect's cached `rolledDamage` (rolled once at
 * application time), so this stays pure and needs no rng.
 */
function applyDamageOverTime(
  combatant: Combatant,
  round: number,
  log: CombatLogEntry[],
): void {
  if (combatant.isDead) return;
  const effects = (combatant.statusEffects ?? []) as RuntimeEffect[];
  for (const effect of effects) {
    if (effect.type !== 'Apply Damage') continue;
    if (typeof effect.rolledDamage !== 'number' || effect.rolledDamage <= 0) continue;
    if (typeof effect.durationValue !== 'number' || effect.durationValue <= 0) continue;
    if (combatant.currentHP <= 0) break; // already down; remaining DoT is moot this tick

    const dmg = effect.rolledDamage;
    combatant.currentHP = Math.max(0, combatant.currentHP - dmg);
    pushLog(
      log,
      round,
      `${combatant.name} takes ${dmg} damage from ${effect.label ?? effect.type}.`,
      'danger',
    );
    checkUnconscious(combatant);
  }
}

/**
 * End-of-round housekeeping (pure): apply damage-over-time effects, tick
 * duration effects down on every combatant, drop expired ones, clear transient
 * Guard, and advance the round counter. Returns a new state.
 */
/** Undo a timed Max-pool buff/debuff when its effect expires: shift the max back
 *  by the stored delta and re-clamp the current pool. */
function revertMaxPoolEffect(c: Combatant, e: RuntimeEffect): void {
  const stat = String(e.statToModify ?? '').toUpperCase();
  const maxKey = stat === 'MAX HP' ? 'maxHP' : stat === 'MAX MP' ? 'maxMP' : stat === 'MAX SP' ? 'maxSP' : null;
  if (!maxKey || typeof e.rolledValue !== 'number' || e.rolledValue === 0) return;
  const curKey = maxKey === 'maxHP' ? 'currentHP' : maxKey === 'maxMP' ? 'currentMP' : 'currentSP';
  c[maxKey] = Math.max(1, c[maxKey] - e.rolledValue);
  c[curKey] = Math.min(c[curKey], c[maxKey]);
}

export function processEndOfRound(state: CombatState): CombatState {
  const next = cloneState(state);
  const round = next.round;
  const log: CombatLogEntry[] = [];
  for (const combatant of next.combatants) {
    // Apply DoTs first (using this round's remaining duration), then tick.
    applyDamageOverTime(combatant, round, log);
    const before = (combatant.statusEffects ?? []) as RuntimeEffect[];
    const survivors = tickDurations(combatant).filter(
      (e) => (e as RuntimeEffect).type !== 'Guarding',
    ) as RuntimeEffect[];
    // Revert any timed Max-pool buff/debuff that just expired this tick.
    const surviving = new Set(survivors.map((e) => e.id));
    for (const e of before) {
      if (!surviving.has(e.id)) revertMaxPoolEffect(combatant, e);
    }
    combatant.statusEffects = survivors;
    combatant.isGuarding = false;
  }
  next.log = [...next.log, ...log];
  next.round += 1;
  next.activeResolutionIndex = -1;
  return next;
}

/**
 * Resolve a full round from its declared actions, returning the ordered playback
 * steps and the final state. Rolls initiative, then folds {@link resolveAction}
 * over the queue, snapshotting after each step so a UI can animate. Does NOT
 * advance the round or tick durations — call {@link processEndOfRound} after
 * playback. PURE.
 */
export function resolveRound(
  state: CombatState,
  rng: Rng = Math.random,
  options: ResolveOptions = {},
): { steps: RoundStep[]; state: CombatState } {
  const queue = rollInitiativeForRound(state, rng, options.charLookup);

  let current = cloneState(state);
  current.resolutionQueue = queue;
  current.phase = 'resolving';

  const steps: RoundStep[] = [];

  queue.forEach((action, index) => {
    current.activeResolutionIndex = index;
    const { state: after, results, log } = resolveAction(current, action, rng, options);
    after.resolutionQueue = queue;
    after.activeResolutionIndex = index;
    current = after;
    steps.push({ action, results, log, snapshot: cloneState(after) });
  });

  return { steps, state: current };
}

export { RANGE_ORDER };
