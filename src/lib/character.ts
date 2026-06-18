import { nanoid } from 'nanoid';
import type { Character } from '@/types';

function num(v: unknown, fallback: number): number {
  return Number.isFinite(v as number) ? (v as number) : fallback;
}

/**
 * Coerce possibly-partial, legacy, or untrusted character data into a complete,
 * safe `Character`. Used at every boundary where character data enters the app
 * (localStorage load, peer `player_join`/`character_update`) so downstream code —
 * the engine, the sheet, combat — never crashes on a missing field.
 */
export function normalizeCharacter(raw: Partial<Character> | null | undefined): Character {
  const r = (raw ?? {}) as Partial<Character>;
  const inv = (r.inventory ?? {}) as Partial<Character['inventory']>;

  const learnedSkills = Array.isArray(r.learnedSkills)
    ? r.learnedSkills.filter((s): s is string => typeof s === 'string')
    : [];
  if (!learnedSkills.includes('center-0')) learnedSkills.unshift('center-0');

  return {
    id: typeof r.id === 'string' && r.id ? r.id : nanoid(10),
    name: typeof r.name === 'string' ? r.name : 'Unnamed Hero',
    level: Math.max(1, Math.trunc(num(r.level, 1))),
    portraitSeed: typeof r.portraitSeed === 'string' ? r.portraitSeed : undefined,
    coreStats: {
      mind: num(r.coreStats?.mind, 4),
      body: num(r.coreStats?.body, 4),
      soul: num(r.coreStats?.soul, 4),
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
    currentHP: num(r.currentHP, 0),
    currentMP: num(r.currentMP, 0),
    currentSP: num(r.currentSP, 0),
    statusEffects: Array.isArray(r.statusEffects) ? r.statusEffects : [],
    notes: typeof r.notes === 'string' ? r.notes : '',
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : undefined,
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : undefined,
  };
}
