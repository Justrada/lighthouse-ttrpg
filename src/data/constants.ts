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

/** The hex battlefield: pointy-top, offset-rectangular. Players deploy on the
 * bottom rows, enemies on the top rows. */
export const BATTLE_GRID = {
  cols: 9,
  rows: 7,
} as const;

/** Hexes a single Move action may cover. Tunable. */
export const MOVE_RANGE = 4;

/** Rest restoration rules (ported from the original ruleset). */
export const REST_RULES = {
  short: { hpPct: 0, mpPct: 0.5, spPct: 0.5 },
  long: { hpPct: 1, mpPct: 1, spPct: 1 },
} as const;
