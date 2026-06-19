import type { SkillKey } from '@/types';

/** Player-facing labels for the six skills, in canonical order. */
export const SKILL_LABELS: Record<SkillKey, string> = {
  physical: 'Physical',
  stealth: 'Stealth',
  lore: 'Lore',
  awareness: 'Awareness',
  influence: 'Influence',
  survival: 'Survival',
};

export const CORE_STAT_LABELS = {
  mind: 'Mind',
  body: 'Body',
  soul: 'Soul',
} as const;

/** Which core stats feed each skill (for tooltips / UI hints). */
export const SKILL_SOURCES: Record<SkillKey, string> = {
  physical: 'Body',
  stealth: 'Body + Mind',
  lore: 'Mind',
  awareness: 'Soul + Body',
  influence: 'Soul',
  survival: 'Soul + Mind',
};

/** Conditions the GM can toggle on combatants. */
export interface ConditionDef {
  key: string;
  label: string;
  icon: string;
  tone: 'buff' | 'debuff' | 'neutral';
  description: string;
}

export const CONDITIONS: ConditionDef[] = [
  { key: 'exhausted', label: 'Exhausted', icon: '😩', tone: 'debuff', description: 'Worn down; disadvantage on physical efforts.' },
  { key: 'poisoned', label: 'Poisoned', icon: '🤢', tone: 'debuff', description: 'Toxins course through; recurring harm.' },
  { key: 'frightened', label: 'Frightened', icon: '😱', tone: 'debuff', description: 'Fear grips the mind; disadvantage near the source.' },
  { key: 'blinded', label: 'Blinded', icon: '🙈', tone: 'debuff', description: 'Cannot see; attacks falter.' },
  { key: 'deafened', label: 'Deafened', icon: '🔇', tone: 'debuff', description: 'Cannot hear; misses spoken cues.' },
  { key: 'cursed', label: 'Cursed', icon: '💀', tone: 'debuff', description: 'A dark hex lingers.' },
  { key: 'blessed', label: 'Blessed', icon: '✨', tone: 'buff', description: 'Favored by fortune; advantage looms.' },
  { key: 'hidden', label: 'Hidden', icon: '🌫️', tone: 'buff', description: 'Out of sight; the next strike surprises.' },
];

/** Range bands, near→far. */
export const RANGE_ORDER = ['Self', 'Melee', 'Near', 'Far', 'Distant'] as const;

/**
 * Range band → maximum hex distance. One combatant per hex, so "Melee" means
 * adjacent (distance 1) rather than the old same-line distance 0. `Self` is
 * handled by team check, not distance; `Battlefield` is unbounded. Tunable.
 */
export const RANGE_TO_HEX_DISTANCE: Record<string, number> = {
  Self: 0,
  Melee: 1,
  Near: 2,
  Far: 4,
  Distant: 6,
  Battlefield: Infinity,
};

/** The hex battlefield: pointy-top, offset-rectangular. Roomy (~4× the original)
 * so combatants deploy near the middle with space to maneuver rather than jammed
 * against opposite back rows. The GM can reposition everyone during the setup
 * phase. Tunable. */
export const BATTLE_GRID = {
  cols: 18,
  rows: 14,
} as const;

/** Hexes a single Move action may cover. Tunable. */
export const MOVE_RANGE = 6;

/** Rest restoration rules (ported from the original ruleset). */
export const REST_RULES = {
  short: { hpPct: 0, mpPct: 0.5, spPct: 0.5 },
  long: { hpPct: 1, mpPct: 1, spPct: 1 },
} as const;

// ---------------------------------------------------------------------------
// Worldforge — creator systems & marketplace
// ---------------------------------------------------------------------------

/** The platform's facilitation fee on a marketplace sale; the creator keeps the
 *  remainder. Foundation for the future creator marketplace. Tunable. */
export const WORLDFORGE_FEE_RATE = 0.15;

/** Descriptors a worldpack may rename. The `key` is the canonical term the
 *  engine/UI uses internally; a pack maps it to a custom label so a creator can
 *  re-theme the whole system (e.g. Mind→Tech, Mana→Charge) without touching any
 *  mechanics. */
export const RESKINNABLE_TERMS: { key: string; label: string; group: 'Core Stat' | 'Resource' | 'Skill' }[] = [
  { key: 'Mind', label: 'Mind', group: 'Core Stat' },
  { key: 'Body', label: 'Body', group: 'Core Stat' },
  { key: 'Soul', label: 'Soul', group: 'Core Stat' },
  { key: 'HP', label: 'Health (HP)', group: 'Resource' },
  { key: 'MP', label: 'Mana (MP)', group: 'Resource' },
  { key: 'SP', label: 'Stamina (SP)', group: 'Resource' },
  { key: 'Physical', label: 'Physical', group: 'Skill' },
  { key: 'Stealth', label: 'Stealth', group: 'Skill' },
  { key: 'Lore', label: 'Lore', group: 'Skill' },
  { key: 'Awareness', label: 'Awareness', group: 'Skill' },
  { key: 'Influence', label: 'Influence', group: 'Skill' },
  { key: 'Survival', label: 'Survival', group: 'Skill' },
];
