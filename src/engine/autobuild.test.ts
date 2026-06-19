import { describe, it, expect } from 'vitest';
import { autoBuildCharacter, type Archetype } from './autobuild';
import { calculateSkillBudget } from './stats';
import { findNode } from '@/data/skillTree';
import type { Character } from '@/types';

/** Deterministic, seedable PRNG (mulberry32) in [0,1). */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Count learned nodes whose linked ability costs the given resource. */
function countAbilityCost(c: Character, costType: 'MP' | 'SP'): number {
  return c.learnedSkills.filter((id) => {
    const li = findNode(id)?.linkedItem;
    return li?.type === 'Ability' && li.cost?.type === costType;
  }).length;
}

const LEVELS = [1, 3, 5, 10] as const;
const ARCHETYPES: Archetype[] = ['magic', 'skill', 'balanced'];

describe('autoBuildCharacter', () => {
  it('produces a valid, on-budget character for each archetype × level', () => {
    for (const archetype of ARCHETYPES) {
      for (const level of LEVELS) {
        const c = autoBuildCharacter({
          name: 'Test Hero',
          level,
          archetype,
          rng: seeded(level * 100 + archetype.length),
        });

        // Structural validity.
        expect(c.id).toBeTruthy();
        expect(c.name).toBe('Test Hero');
        expect(c.level).toBe(level);
        expect(c.learnedSkills).toContain('center-0');
        expect(c.coreStats.mind).toBeGreaterThanOrEqual(4);
        expect(c.coreStats.body).toBeGreaterThanOrEqual(4);
        expect(c.coreStats.soul).toBeGreaterThanOrEqual(4);
        // normalizeCharacter filled current resources to maxes (non-zero).
        expect(c.currentHP).toBeGreaterThan(0);
        expect(c.currentMP).toBeGreaterThan(0);
        expect(c.currentSP).toBeGreaterThan(0);
        // Themed gear is always equipped.
        expect(c.inventory.armor).toBeTruthy();

        // Never overspent.
        expect(calculateSkillBudget(c).available).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('learns more skills as level increases', () => {
    for (const archetype of ARCHETYPES) {
      const counts = LEVELS.map(
        (level) =>
          autoBuildCharacter({
            name: 'X',
            level,
            archetype,
            rng: seeded(7),
          }).learnedSkills.length,
      );
      // Strictly increasing across [1,3,5,10].
      for (let i = 1; i < counts.length; i++) {
        expect(counts[i]).toBeGreaterThan(counts[i - 1]);
      }
    }
  });

  it('biases ability resource-cost by archetype (magic→MP, skill→SP)', () => {
    // Average over several seeds at a mid level so the bias is unambiguous.
    const seeds = [1, 2, 3, 4, 5];
    const level = 10;

    let magicMP = 0;
    let magicSP = 0;
    let skillMP = 0;
    let skillSP = 0;

    for (const s of seeds) {
      const magic = autoBuildCharacter({ name: 'M', level, archetype: 'magic', rng: seeded(s) });
      const skill = autoBuildCharacter({ name: 'S', level, archetype: 'skill', rng: seeded(s) });
      magicMP += countAbilityCost(magic, 'MP');
      magicSP += countAbilityCost(magic, 'SP');
      skillMP += countAbilityCost(skill, 'MP');
      skillSP += countAbilityCost(skill, 'SP');
    }

    // A magic build leans on MP abilities; a skill build leans on SP abilities.
    expect(magicMP).toBeGreaterThan(skillMP);
    expect(skillSP).toBeGreaterThan(magicSP);
    // And each archetype favours its own resource over the other.
    expect(magicMP).toBeGreaterThan(magicSP);
    expect(skillSP).toBeGreaterThan(skillMP);
  });

  it('is deterministic for a given seed', () => {
    for (const archetype of ARCHETYPES) {
      const a = autoBuildCharacter({ name: 'Twin', level: 6, archetype, rng: seeded(42) });
      const b = autoBuildCharacter({ name: 'Twin', level: 6, archetype, rng: seeded(42) });
      // Ignore id/portraitSeed (nanoid) and timestamps; compare the build itself.
      expect(b.coreStats).toEqual(a.coreStats);
      expect([...b.learnedSkills].sort()).toEqual([...a.learnedSkills].sort());
      expect(b.inventory).toEqual(a.inventory);
    }
  });

  it('varies the build with different seeds', () => {
    // Across a spread of seeds, builds should not all be identical.
    const signatures = new Set<string>();
    for (const s of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const c = autoBuildCharacter({ name: 'V', level: 8, archetype: 'balanced', rng: seeded(s) });
      const sig = JSON.stringify({
        stats: c.coreStats,
        skills: [...c.learnedSkills].sort(),
      });
      signatures.add(sig);
    }
    expect(signatures.size).toBeGreaterThan(1);
  });

  it('keeps the archetype primary stat the highest (magic→mind, skill→body)', () => {
    for (const s of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const mage = autoBuildCharacter({ name: 'M', level: 10, archetype: 'magic', rng: seeded(s) });
      expect(mage.coreStats.mind).toBeGreaterThanOrEqual(mage.coreStats.soul);
      expect(mage.coreStats.mind).toBeGreaterThanOrEqual(mage.coreStats.body);

      const rogue = autoBuildCharacter({ name: 'S', level: 10, archetype: 'skill', rng: seeded(s) });
      expect(rogue.coreStats.body).toBeGreaterThanOrEqual(rogue.coreStats.mind);
      expect(rogue.coreStats.body).toBeGreaterThanOrEqual(rogue.coreStats.soul);
    }
  });
});
