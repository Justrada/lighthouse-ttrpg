import { describe, it, expect, afterEach } from 'vitest';
import type { Character, CombatState, ResolvedAction, WorldItem, SkillEffect } from '@/types';
import { createCombatant, resolveAction } from './combat';
import { setActiveCatalog, buildActiveCatalog, resetActiveCatalog } from '@/data/skillTree';
import { normalizeWorldpackContent } from '@/lib/worldpack';
import type { Rng } from './dice';

/**
 * Guards the High bug the QA swarm found: Creator-Studio weapons must deal their
 * listed damage ONCE, not twice. The double-count happened when a weapon's own
 * Apply-Damage effect had BOTH useWeaponDamage:true AND additionalDamage —
 * computeDamage then rolled the weapon's dice for the weapon-damage term and
 * AGAIN for the additional term. Base weapons (and now studio weapons) use
 * useWeaponDamage:false with the dice in additionalDamage = a single count.
 */

const weapon = (effect: Partial<SkillEffect>): WorldItem =>
  ({
    id: 'sw', type: 'Inventory Item', name: 'Studio Blade', description: '', itemType: 'Weapon',
    range: 'Melee', damage: '1d10', rollModifier: 'Physical',
    effects: [{ id: 'e', type: 'Apply Damage', additionalDamage: '1d10', ...effect }],
  }) as WorldItem;

const mkChar = (id: string, w?: string): Character =>
  ({
    id, name: id, level: 3, coreStats: { mind: 8, body: 8, soul: 8 }, learnedSkills: ['center-0'],
    inventory: { armor: null, weapon: w ?? null, shield: null, accessories: [], backpack: [] },
    currentHP: 100, currentMP: 50, currentSP: 50,
  }) as Character;

/** Resolve a single Weapon Attack with a guaranteed non-crit hit + max damage
 *  dice, returning the damage dealt to the defender. */
function damageDealt(w: WorldItem): number {
  setActiveCatalog(buildActiveCatalog({ nodes: [], edges: [], worldItems: { weapons: [w] } }, 'extend'));
  const atkChar = mkChar('atk', w.id);
  const foeChar = mkChar('foe');
  const atk = createCombatant(atkChar, { team: 'player', position: { q: 0, r: 0 } });
  const foe = createCombatant(foeChar, { team: 'npc', position: { q: 1, r: 0 } });
  foe.currentHP = 100;
  foe.maxHP = 100;
  foe.ac = 10; // attack 19 (+mods) always lands, but is not a nat-20 crit
  const state: CombatState = {
    isActive: true, phase: 'resolving', round: 1, combatants: [atk, foe],
    declaredActions: {}, lockedActions: {}, resolutionQueue: [], activeResolutionIndex: -1, log: [],
  };
  const act = { actionIndex: 0, actionType: 'Weapon Attack', sourceId: 'atk', targetId: 'foe', actionId: w.id, initiative: 1 } as ResolvedAction;
  // First draw → d20 face 19 (a hit, NOT a crit); all later draws → max dice.
  let i = 0;
  const rng: Rng = () => (i++ === 0 ? 0.92 : 0.999999);
  const after = resolveAction(state, act, rng, { charLookup: (c) => (c.id === 'atk' ? atkChar : foeChar) }).state;
  return 100 - after.combatants.find((c) => c.id === 'foe')!.currentHP;
}

afterEach(() => resetActiveCatalog());

describe('studio weapon damage is single-counted', () => {
  it('the CURRENT studio shape (useWeaponDamage:false) deals its dice once', () => {
    expect(damageDealt(weapon({ useWeaponDamage: false }))).toBe(10); // 1d10 max, once
  });

  it('the OLD shape (useWeaponDamage:true + dice) double-counts — the bug being guarded', () => {
    expect(damageDealt(weapon({ useWeaponDamage: true }))).toBe(20); // proves the test is non-vacuous
  });

  it('normalizeWorldpackContent heals the old shape back to a single count', () => {
    const healed = normalizeWorldpackContent({
      nodes: [], edges: [], worldItems: { weapons: [weapon({ useWeaponDamage: true })] },
    }).worldItems.weapons[0];
    expect(healed.effects[0].useWeaponDamage).toBe(false);
    expect(damageDealt(healed)).toBe(10); // legacy/imported weapon now deals once
  });
});
