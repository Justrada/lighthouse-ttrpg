import { nanoid } from 'nanoid';
import type { Character } from '@/types';
import { findNode } from '@/data/skillTree';

/** Core-stat bounds, mirroring the Forge (StatsSection / autobuild). */
const STAT_MIN = 1;
const STAT_MAX = 12;
const MAX_LEVEL = 20;
const MAX_NAME = 40;

function num(v: unknown, fallback: number): number {
  return Number.isFinite(v as number) ? (v as number) : fallback;
}

/** Truncate to a finite integer and clamp into `[lo, hi]`. */
function clampInt(v: unknown, lo: number, hi: number, fallback: number): number {
  return Math.max(lo, Math.min(hi, Math.trunc(num(v, fallback))));
}

/**
 * Coerce possibly-partial, legacy, or untrusted character data into a complete,
 * safe `Character`. Used at every boundary where character data enters the app
 * (localStorage load, peer `player_join`/`character_update`) so downstream code —
 * the engine, the sheet, combat — never crashes on a missing field *or* is fed
 * out-of-range values (corrupted saves, version skew, or a hostile peer payload).
 */
export function normalizeCharacter(raw: Partial<Character> | null | undefined): Character {
  const r = (raw ?? {}) as Partial<Character>;
  const inv = (r.inventory ?? {}) as Partial<Character['inventory']>;

  // Learned skills: keep only real, known nodes; de-duplicate; guarantee the
  // core. Dropping unknown ids also prevents the skill-budget double-count that
  // a duplicated entry would otherwise cause.
  const seen = new Set<string>();
  const learnedSkills: string[] = [];
  for (const s of Array.isArray(r.learnedSkills) ? r.learnedSkills : []) {
    if (typeof s !== 'string' || seen.has(s)) continue;
    if (!findNode(s)) continue;
    seen.add(s);
    learnedSkills.push(s);
  }
  if (!learnedSkills.includes('center-0')) learnedSkills.unshift('center-0');

  const name = (typeof r.name === 'string' ? r.name.trim().slice(0, MAX_NAME) : '') || 'Unnamed Hero';

  return {
    id: typeof r.id === 'string' && r.id ? r.id : nanoid(10),
    name,
    level: clampInt(r.level, 1, MAX_LEVEL, 1),
    portraitSeed: typeof r.portraitSeed === 'string' ? r.portraitSeed : undefined,
    coreStats: {
      mind: clampInt(r.coreStats?.mind, STAT_MIN, STAT_MAX, 4),
      body: clampInt(r.coreStats?.body, STAT_MIN, STAT_MAX, 4),
      soul: clampInt(r.coreStats?.soul, STAT_MIN, STAT_MAX, 4),
    },
    learnedSkills,
    skillChoices: r.skillChoices && typeof r.skillChoices === 'object' ? r.skillChoices : {},
    inventory: {
      armor: typeof inv.armor === 'string' ? inv.armor : null,
      weapon: typeof inv.weapon === 'string' ? inv.weapon : null,
      shield: typeof inv.shield === 'string' ? inv.shield : null,
      accessories: Array.isArray(inv.accessories) ? inv.accessories.filter((x) => typeof x === 'string') : [],
      backpack: Array.isArray(inv.backpack) ? inv.backpack.filter((x) => typeof x === 'string') : [],
    },
    currentHP: Math.max(0, num(r.currentHP, 0)),
    currentMP: Math.max(0, num(r.currentMP, 0)),
    currentSP: Math.max(0, num(r.currentSP, 0)),
    statusEffects: Array.isArray(r.statusEffects) ? r.statusEffects : [],
    notes: typeof r.notes === 'string' ? r.notes : '',
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : undefined,
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : undefined,
  };
}
