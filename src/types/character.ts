export interface CoreStats {
  mind: number;
  body: number;
  soul: number;
}

export type CoreStatKey = keyof CoreStats;

export type SkillKey =
  | 'physical'
  | 'stealth'
  | 'lore'
  | 'awareness'
  | 'influence'
  | 'survival';

export const SKILL_KEYS: SkillKey[] = [
  'physical',
  'stealth',
  'lore',
  'awareness',
  'influence',
  'survival',
];

export interface Inventory {
  armor: string | null;
  weapon: string | null;
  shield: string | null;
  accessories: string[];
  backpack: string[];
}

export interface SkillChoice {
  effectId: string;
  choice: string;
}

/** A live effect carried on a character/combatant (buff, debuff, condition). */
export interface ActiveStatusEffect {
  id: string;
  label: string;
  type: string;
  sourceId?: string;
  sourceName?: string;
  durationType?: 'Rounds' | 'Actions' | 'Permanent';
  durationValue?: number;
  /** Visual hint for tinting the badge. */
  tone?: 'buff' | 'debuff' | 'neutral';
  data?: Record<string, unknown>;
}

export interface Character {
  id: string;
  name: string;
  level: number;
  /** Deterministic seed used to render a generated portrait/sigil. */
  portraitSeed?: string;
  coreStats: CoreStats;
  learnedSkills: string[];
  skillChoices?: Record<string, SkillChoice[]>;
  inventory: Inventory;
  currentHP: number;
  currentMP: number;
  currentSP: number;
  statusEffects?: ActiveStatusEffect[];
  notes?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface DerivedStats {
  hp: number;
  mp: number;
  sp: number;
  ac: number;
  shield: number;
  initiative: number;
  physical: number;
  stealth: number;
  lore: number;
  awareness: number;
  influence: number;
  survival: number;
  actionsPerRound: number;
}

export interface SkillPointBudget {
  total: number;
  spentOnStats: number;
  spentOnSkills: number;
  available: number;
}
