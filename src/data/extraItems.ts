/**
 * extraItems — an expanded medieval-fantasy item catalog for LIGHTHOUSE.
 *
 * These items are authored to match the EXACT shape of the items already living
 * in `skillTree.json`'s `worldItems` object, so the equipment browser, combat
 * engine, and `findItem` lookup all pick them up without special-casing:
 *
 * - Weapons carry their attack dice in the first `Apply Damage` effect's
 *   `additionalDamage` field. That is the load-bearing field the combat engine
 *   reads (see `computeDamage`/`applyEffect` in `src/engine/combat.ts`). The
 *   top-level `damage`/`damageType` fields are display-only mirrors. Weapons use
 *   the same combat metadata as the existing ones:
 *   `combatUse: true, aoe: 'Single Target', hitType: 'Roll to Hit',
 *   rollModifier: 'Physical'`, plus a `range`. Heavy weapons add a `Modify Stat`
 *   Initiative penalty effect, mirroring Heavy Club / Plate Armor.
 *
 * - Magical weapons keep an `Apply Damage` effect (their dice + an elemental
 *   `damageType`) AND a passive `Modify Stat` that applies while the weapon is
 *   equipped (read by `applyItemBonuses` in `src/engine/stats.ts`).
 *
 * - Armor / Accessories grant passive `Modify Stat` bonuses while equipped.
 *   Armor may declare `weaknesses`.
 *
 * - Shields use `itemType: 'Shield'` with a `Modify Stat` AC effect; that AC is
 *   routed to the dedicated shield bucket in `applyItemBonuses`.
 *
 * - Consumables carry `charges: 1`. Instant effects (heals, resource restores,
 *   thrown damage) have no duration; temporary buffs use
 *   `durationType: 'Rounds'` + `durationValue`, which the engine turns into a
 *   timed status effect.
 *
 * Every id is prefixed `inv_x_` to stay readable and avoid colliding with the
 * timestamp-style `inv_*` ids already in the data. These are merged into
 * `worldItems` by `src/data/skillTree.ts`.
 *
 * Theme constraint: medieval fantasy only — magic is welcome, but no
 * steampunk / sci-fi / firearms.
 */

import type { WorldItem, WorldItems } from '@/types';

/** Stable, readable effect id helper (avoids clock/random for deterministic data). */
const fx = (slug: string): string => `eff_x_${slug}`;

/**
 * Weapons additionally carry combat-routing metadata (`combatUse`, `aoe`,
 * `hitType`, `rollModifier`) that the combat engine reads at runtime but that
 * the persisted `WorldItem` type intentionally omits — exactly like the weapons
 * already in `skillTree.json`. We model that here so the literal stays readable
 * and type-checked, then expose it through the plain `WorldItems` contract.
 */
type WeaponItem = WorldItem & {
  combatUse?: boolean;
  aoe?: string;
  hitType?: string;
  rollModifier?: string;
};

interface ExtraItems {
  weapons: WeaponItem[];
  armor: WorldItem[];
  shields: WorldItem[];
  accessories: WorldItem[];
  consumables: WorldItem[];
}

const catalog: ExtraItems = {
  // -------------------------------------------------------------------------
  // Weapons (14) — damage lives in the first `Apply Damage` effect's
  // `additionalDamage`; `damage`/`damageType` mirror it for display.
  // -------------------------------------------------------------------------
  weapons: [
    {
      id: 'inv_x_dagger',
      type: 'Inventory Item',
      name: 'Dagger',
      description: 'A slim, balanced blade that sits as easily in a boot as it does in a throwing hand.',
      itemType: 'Weapon',
      combatUse: true,
      range: 'Near',
      aoe: 'Single Target',
      hitType: 'Roll to Hit',
      rollModifier: 'Physical',
      damage: '1d4',
      damageType: 'Piercing',
      effects: [
        {
          id: fx('dagger_dmg'),
          type: 'Apply Damage',
          savingThrowEnabled: false,
          useWeaponDamage: false,
          weaponMultiplier: 1,
          additionalDamage: '1d4',
          damageType: 'Piercing',
          drainResourceEnabled: false,
        },
      ],
      instanceCount: 0,
    },
    {
      id: 'inv_x_rapier',
      type: 'Inventory Item',
      name: 'Rapier',
      description: 'A duelist\'s favorite — light, quick, and deadly in the hands of the nimble.',
      itemType: 'Weapon',
      combatUse: true,
      range: 'Melee',
      aoe: 'Single Target',
      hitType: 'Roll to Hit',
      rollModifier: 'Physical',
      damage: '1d6',
      damageType: 'Piercing',
      effects: [
        {
          id: fx('rapier_dmg'),
          type: 'Apply Damage',
          savingThrowEnabled: false,
          useWeaponDamage: false,
          weaponMultiplier: 1,
          additionalDamage: '1d6',
          damageType: 'Piercing',
          drainResourceEnabled: false,
        },
      ],
      instanceCount: 0,
    },
    {
      id: 'inv_x_mace',
      type: 'Inventory Item',
      name: 'Mace',
      description: 'A flanged head of cold iron that turns even plate into a poor comfort.',
      itemType: 'Weapon',
      combatUse: true,
      range: 'Melee',
      aoe: 'Single Target',
      hitType: 'Roll to Hit',
      rollModifier: 'Physical',
      damage: '1d6',
      damageType: 'Bludgeoning',
      effects: [
        {
          id: fx('mace_dmg'),
          type: 'Apply Damage',
          savingThrowEnabled: false,
          useWeaponDamage: false,
          weaponMultiplier: 1,
          additionalDamage: '1d6',
          damageType: 'Bludgeoning',
          drainResourceEnabled: false,
        },
      ],
      instanceCount: 0,
    },
    {
      id: 'inv_x_warhammer',
      type: 'Inventory Item',
      name: 'Warhammer',
      description: 'A heavy two-handed maul built to stove in shields and the warriors behind them.',
      itemType: 'Weapon',
      combatUse: true,
      range: 'Melee',
      aoe: 'Single Target',
      hitType: 'Roll to Hit',
      rollModifier: 'Physical',
      damage: '1d10',
      damageType: 'Bludgeoning',
      effects: [
        {
          id: fx('warhammer_dmg'),
          type: 'Apply Damage',
          savingThrowEnabled: false,
          useWeaponDamage: false,
          weaponMultiplier: 1,
          additionalDamage: '1d10',
          damageType: 'Bludgeoning',
          drainResourceEnabled: false,
        },
      ],
      instanceCount: 0,
    },
    {
      id: 'inv_x_halberd',
      type: 'Inventory Item',
      name: 'Halberd',
      description: 'A pole-mounted axe-and-spike whose reach lets you strike before the foe closes.',
      itemType: 'Weapon',
      combatUse: true,
      range: 'Near',
      aoe: 'Single Target',
      hitType: 'Roll to Hit',
      rollModifier: 'Physical',
      damage: '1d10',
      damageType: 'Slashing',
      effects: [
        {
          id: fx('halberd_dmg'),
          type: 'Apply Damage',
          savingThrowEnabled: false,
          useWeaponDamage: false,
          weaponMultiplier: 1,
          additionalDamage: '1d10',
          damageType: 'Slashing',
          drainResourceEnabled: false,
        },
      ],
      instanceCount: 0,
    },
    {
      id: 'inv_x_greatsword',
      type: 'Inventory Item',
      name: 'Greatsword',
      description: 'A massive blade swung in broad, sweeping arcs that few opponents walk away from.',
      itemType: 'Weapon',
      combatUse: true,
      range: 'Melee',
      aoe: 'Single Target',
      hitType: 'Roll to Hit',
      rollModifier: 'Physical',
      damage: '2d6',
      damageType: 'Slashing',
      effects: [
        {
          id: fx('greatsword_dmg'),
          type: 'Apply Damage',
          savingThrowEnabled: false,
          useWeaponDamage: false,
          weaponMultiplier: 1,
          additionalDamage: '2d6',
          damageType: 'Slashing',
          drainResourceEnabled: false,
        },
      ],
      instanceCount: 0,
    },
    {
      id: 'inv_x_flail',
      type: 'Inventory Item',
      name: 'Flail',
      description: 'A spiked ball on a chain that whips around guards and shields alike.',
      itemType: 'Weapon',
      combatUse: true,
      range: 'Melee',
      aoe: 'Single Target',
      hitType: 'Roll to Hit',
      rollModifier: 'Physical',
      damage: '1d8',
      damageType: 'Bludgeoning',
      effects: [
        {
          id: fx('flail_dmg'),
          type: 'Apply Damage',
          savingThrowEnabled: false,
          useWeaponDamage: false,
          weaponMultiplier: 1,
          additionalDamage: '1d8',
          damageType: 'Bludgeoning',
          drainResourceEnabled: false,
        },
      ],
      instanceCount: 0,
    },
    {
      id: 'inv_x_throwing_axe',
      type: 'Inventory Item',
      name: 'Throwing Axe',
      description: 'A short, weighted hatchet that flies true across the gap between fighters.',
      itemType: 'Weapon',
      combatUse: true,
      range: 'Far',
      aoe: 'Single Target',
      hitType: 'Roll to Hit',
      rollModifier: 'Physical',
      damage: '1d6',
      damageType: 'Slashing',
      effects: [
        {
          id: fx('throwing_axe_dmg'),
          type: 'Apply Damage',
          savingThrowEnabled: false,
          useWeaponDamage: false,
          weaponMultiplier: 1,
          additionalDamage: '1d6',
          damageType: 'Slashing',
          drainResourceEnabled: false,
        },
      ],
      instanceCount: 0,
    },
    {
      id: 'inv_x_hand_crossbow',
      type: 'Inventory Item',
      name: 'Hand Crossbow',
      description: 'A compact crossbow light enough to aim one-handed, favored by scouts and rogues.',
      itemType: 'Weapon',
      combatUse: true,
      range: 'Far',
      aoe: 'Single Target',
      hitType: 'Roll to Hit',
      rollModifier: 'Physical',
      damage: '1d6',
      damageType: 'Piercing',
      effects: [
        {
          id: fx('hand_crossbow_dmg'),
          type: 'Apply Damage',
          savingThrowEnabled: false,
          useWeaponDamage: false,
          weaponMultiplier: 1,
          additionalDamage: '1d6',
          damageType: 'Piercing',
          drainResourceEnabled: false,
        },
      ],
      instanceCount: 0,
    },
    {
      id: 'inv_x_sling',
      type: 'Inventory Item',
      name: 'Sling',
      description: 'A humble leather strap that sends a stone whistling with surprising force.',
      itemType: 'Weapon',
      combatUse: true,
      range: 'Far',
      aoe: 'Single Target',
      hitType: 'Roll to Hit',
      rollModifier: 'Physical',
      damage: '1d4',
      damageType: 'Bludgeoning',
      effects: [
        {
          id: fx('sling_dmg'),
          type: 'Apply Damage',
          savingThrowEnabled: false,
          useWeaponDamage: false,
          weaponMultiplier: 1,
          additionalDamage: '1d4',
          damageType: 'Bludgeoning',
          drainResourceEnabled: false,
        },
      ],
      instanceCount: 0,
    },
    {
      id: 'inv_x_quarterstaff',
      type: 'Inventory Item',
      name: 'Quarterstaff',
      description: 'A stout length of oak, equally at home steadying a traveler or cracking a skull.',
      itemType: 'Weapon',
      combatUse: true,
      range: 'Melee',
      aoe: 'Single Target',
      hitType: 'Roll to Hit',
      rollModifier: 'Physical',
      damage: '1d6',
      damageType: 'Bludgeoning',
      effects: [
        {
          id: fx('quarterstaff_dmg'),
          type: 'Apply Damage',
          savingThrowEnabled: false,
          useWeaponDamage: false,
          weaponMultiplier: 1,
          additionalDamage: '1d6',
          damageType: 'Bludgeoning',
          drainResourceEnabled: false,
        },
      ],
      instanceCount: 0,
    },
    // --- Magical weapons: Apply Damage (elemental) + passive Modify Stat ---
    {
      id: 'inv_x_flametongue',
      type: 'Inventory Item',
      name: 'Flametongue',
      description: 'A sword wreathed in living fire that scorches foes and steadies its wielder\'s arm.',
      itemType: 'Weapon',
      combatUse: true,
      range: 'Melee',
      aoe: 'Single Target',
      hitType: 'Roll to Hit',
      rollModifier: 'Physical',
      damage: '1d8',
      damageType: 'Fire',
      effects: [
        {
          id: fx('flametongue_dmg'),
          type: 'Apply Damage',
          savingThrowEnabled: false,
          useWeaponDamage: false,
          weaponMultiplier: 1,
          additionalDamage: '1d8',
          damageType: 'Fire',
          drainResourceEnabled: false,
        },
        {
          id: fx('flametongue_buff'),
          type: 'Modify Stat',
          savingThrowEnabled: false,
          statToModify: 'Physical',
          modification: '+1',
        },
      ],
      instanceCount: 0,
    },
    {
      id: 'inv_x_frostbrand',
      type: 'Inventory Item',
      name: 'Frostbrand',
      description: 'A rime-coated blade that bites with cold and sheathes its bearer in a frigid ward.',
      itemType: 'Weapon',
      combatUse: true,
      range: 'Melee',
      aoe: 'Single Target',
      hitType: 'Roll to Hit',
      rollModifier: 'Physical',
      damage: '1d8',
      damageType: 'Cold',
      effects: [
        {
          id: fx('frostbrand_dmg'),
          type: 'Apply Damage',
          savingThrowEnabled: false,
          useWeaponDamage: false,
          weaponMultiplier: 1,
          additionalDamage: '1d8',
          damageType: 'Cold',
          drainResourceEnabled: false,
        },
        {
          id: fx('frostbrand_buff'),
          type: 'Modify Stat',
          savingThrowEnabled: false,
          statToModify: 'AC',
          modification: '+1',
        },
      ],
      instanceCount: 0,
    },
    {
      id: 'inv_x_sword_of_sharpness',
      type: 'Inventory Item',
      name: 'Sword of Sharpness',
      description: 'An impossibly keen greatblade said to shear through steel as if it were silk.',
      itemType: 'Weapon',
      combatUse: true,
      range: 'Melee',
      aoe: 'Single Target',
      hitType: 'Roll to Hit',
      rollModifier: 'Physical',
      damage: '2d6',
      damageType: 'Slashing',
      effects: [
        {
          id: fx('sword_sharpness_dmg'),
          type: 'Apply Damage',
          savingThrowEnabled: false,
          useWeaponDamage: false,
          weaponMultiplier: 1,
          additionalDamage: '2d6',
          damageType: 'Slashing',
          drainResourceEnabled: false,
        },
        {
          id: fx('sword_sharpness_buff'),
          type: 'Modify Stat',
          savingThrowEnabled: false,
          statToModify: 'Physical',
          modification: '+2',
        },
      ],
      instanceCount: 0,
    },
    {
      id: 'inv_x_arcane_staff',
      type: 'Inventory Item',
      name: 'Arcane Staff',
      description: 'A rune-carved stave that hums with stored power, deepening its bearer\'s well of mana.',
      itemType: 'Weapon',
      combatUse: true,
      range: 'Far',
      aoe: 'Single Target',
      hitType: 'Roll to Hit',
      rollModifier: 'Physical',
      damage: '1d6',
      damageType: 'Force',
      effects: [
        {
          id: fx('arcane_staff_dmg'),
          type: 'Apply Damage',
          savingThrowEnabled: false,
          useWeaponDamage: false,
          weaponMultiplier: 1,
          additionalDamage: '1d6',
          damageType: 'Force',
          drainResourceEnabled: false,
        },
        {
          id: fx('arcane_staff_buff'),
          type: 'Modify Stat',
          savingThrowEnabled: false,
          statToModify: 'Max MP',
          modification: '+5',
        },
      ],
      instanceCount: 0,
    },
    {
      id: 'inv_x_arcane_wand',
      type: 'Inventory Item',
      name: 'Arcane Wand',
      description: 'A slender focus of bound crystal, channeling a caster\'s will into a bolt of force.',
      itemType: 'Weapon',
      combatUse: true,
      range: 'Far',
      aoe: 'Single Target',
      hitType: 'Roll to Hit',
      rollModifier: 'Physical',
      damage: '1d6',
      damageType: 'Force',
      effects: [
        {
          id: fx('arcane_wand_dmg'),
          type: 'Apply Damage',
          savingThrowEnabled: false,
          useWeaponDamage: false,
          weaponMultiplier: 1,
          additionalDamage: '1d6',
          damageType: 'Force',
          drainResourceEnabled: false,
        },
        {
          id: fx('arcane_wand_buff'),
          type: 'Modify Stat',
          savingThrowEnabled: false,
          statToModify: 'Max MP',
          modification: '+5',
        },
      ],
      instanceCount: 0,
    },
  ],

  // -------------------------------------------------------------------------
  // Armor (7) — passive `Modify Stat` AC (or resource) while equipped.
  // -------------------------------------------------------------------------
  armor: [
    {
      id: 'inv_x_padded_armor',
      type: 'Inventory Item',
      name: 'Padded Armor',
      description: 'Layers of quilted cloth that turn a glancing blow, light enough to sleep in.',
      itemType: 'Armor',
      weaknesses: ['Fire'],
      effects: [
        {
          id: fx('padded_ac'),
          type: 'Modify Stat',
          savingThrowEnabled: false,
          statToModify: 'AC',
          modification: '+1',
        },
      ],
      instanceCount: 0,
    },
    {
      id: 'inv_x_studded_leather',
      type: 'Inventory Item',
      name: 'Studded Leather',
      description: 'Supple leather reinforced with iron rivets, the rogue\'s reliable second skin.',
      itemType: 'Armor',
      weaknesses: ['Piercing'],
      effects: [
        {
          id: fx('studded_ac'),
          type: 'Modify Stat',
          savingThrowEnabled: false,
          statToModify: 'AC',
          modification: '+2',
        },
      ],
      instanceCount: 0,
    },
    {
      id: 'inv_x_scale_mail',
      type: 'Inventory Item',
      name: 'Scale Mail',
      description: 'Overlapping metal scales that shrug off cuts but rattle loose under heavy blows.',
      itemType: 'Armor',
      weaknesses: ['Bludgeoning'],
      effects: [
        {
          id: fx('scale_ac'),
          type: 'Modify Stat',
          savingThrowEnabled: false,
          statToModify: 'AC',
          modification: '+4',
        },
      ],
      instanceCount: 0,
    },
    {
      id: 'inv_x_splint_armor',
      type: 'Inventory Item',
      name: 'Splint Armor',
      description: 'Vertical strips of steel riveted to a leather backing — heavy, but a fortress to wear.',
      itemType: 'Armor',
      weaknesses: ['Bludgeoning'],
      effects: [
        {
          id: fx('splint_ac'),
          type: 'Modify Stat',
          savingThrowEnabled: false,
          statToModify: 'AC',
          modification: '+5',
        },
        {
          id: fx('splint_init'),
          type: 'Modify Stat',
          savingThrowEnabled: false,
          statToModify: 'Initiative',
          modification: '-5',
        },
      ],
      instanceCount: 0,
    },
    {
      id: 'inv_x_half_plate',
      type: 'Inventory Item',
      name: 'Half-Plate',
      description: 'Sculpted breastplate and pauldrons that balance solid protection with freedom to move.',
      itemType: 'Armor',
      weaknesses: ['Lightning'],
      effects: [
        {
          id: fx('halfplate_ac'),
          type: 'Modify Stat',
          savingThrowEnabled: false,
          statToModify: 'AC',
          modification: '+4',
        },
      ],
      instanceCount: 0,
    },
    {
      id: 'inv_x_apprentice_robes',
      type: 'Inventory Item',
      name: 'Apprentice Robes',
      description: 'Simple enchanted vestments that ease the flow of mana for a budding spellcaster.',
      itemType: 'Armor',
      effects: [
        {
          id: fx('apprentice_mp'),
          type: 'Modify Stat',
          savingThrowEnabled: false,
          statToModify: 'Max MP',
          modification: '+5',
        },
      ],
      instanceCount: 0,
    },
    {
      id: 'inv_x_archmage_robes',
      type: 'Inventory Item',
      name: 'Archmage Robes',
      description: 'Master-woven silks crackling with latent power, swelling the wearer\'s reserves and warding their flesh.',
      itemType: 'Armor',
      effects: [
        {
          id: fx('archmage_mp'),
          type: 'Modify Stat',
          savingThrowEnabled: false,
          statToModify: 'Max MP',
          modification: '+10',
        },
        {
          id: fx('archmage_ac'),
          type: 'Modify Stat',
          savingThrowEnabled: false,
          statToModify: 'AC',
          modification: '+1',
        },
      ],
      instanceCount: 0,
    },
  ],

  // -------------------------------------------------------------------------
  // Shields (5) — `itemType: 'Shield'`; AC routed to the shield bucket.
  // -------------------------------------------------------------------------
  shields: [
    {
      id: 'inv_x_buckler',
      type: 'Inventory Item',
      name: 'Buckler',
      description: 'A small fist-shield strapped to the forearm, perfect for deflecting a quick thrust.',
      itemType: 'Shield',
      effects: [
        {
          id: fx('buckler_ac'),
          type: 'Modify Stat',
          savingThrowEnabled: false,
          statToModify: 'AC',
          modification: '+1',
        },
      ],
      instanceCount: 0,
    },
    {
      id: 'inv_x_kite_shield',
      type: 'Inventory Item',
      name: 'Kite Shield',
      description: 'A tall, tapered shield that guards a rider\'s body from shoulder to shin.',
      itemType: 'Shield',
      effects: [
        {
          id: fx('kite_ac'),
          type: 'Modify Stat',
          savingThrowEnabled: false,
          statToModify: 'AC',
          modification: '+2',
        },
      ],
      instanceCount: 0,
    },
    {
      id: 'inv_x_tower_shield',
      type: 'Inventory Item',
      name: 'Tower Shield',
      description: 'A wall of banded oak and iron — slow to maneuver, but near-impassable to a foe.',
      itemType: 'Shield',
      effects: [
        {
          id: fx('tower_ac'),
          type: 'Modify Stat',
          savingThrowEnabled: false,
          statToModify: 'AC',
          modification: '+3',
        },
        {
          id: fx('tower_init'),
          type: 'Modify Stat',
          savingThrowEnabled: false,
          statToModify: 'Initiative',
          modification: '-3',
        },
      ],
      instanceCount: 0,
    },
    {
      id: 'inv_x_warding_shield',
      type: 'Inventory Item',
      name: 'Warding Shield',
      description: 'A rune-etched shield that turns aside steel and spell alike, humming with protective magic.',
      itemType: 'Shield',
      effects: [
        {
          id: fx('warding_ac'),
          type: 'Modify Stat',
          savingThrowEnabled: false,
          statToModify: 'AC',
          modification: '+2',
        },
        {
          id: fx('warding_mp'),
          type: 'Modify Stat',
          savingThrowEnabled: false,
          statToModify: 'Max MP',
          modification: '+2',
        },
      ],
      instanceCount: 0,
    },
    {
      id: 'inv_x_spiked_shield',
      type: 'Inventory Item',
      name: 'Spiked Shield',
      description: 'A round shield bristling with iron spikes, as eager to wound as it is to protect.',
      itemType: 'Shield',
      effects: [
        {
          id: fx('spiked_ac'),
          type: 'Modify Stat',
          savingThrowEnabled: false,
          statToModify: 'AC',
          modification: '+1',
        },
        {
          id: fx('spiked_phys'),
          type: 'Modify Stat',
          savingThrowEnabled: false,
          statToModify: 'Physical',
          modification: '+1',
        },
      ],
      instanceCount: 0,
    },
  ],

  // -------------------------------------------------------------------------
  // Accessories (9) — passive `Modify Stat` while equipped.
  // -------------------------------------------------------------------------
  accessories: [
    {
      id: 'inv_x_ring_of_protection',
      type: 'Inventory Item',
      name: 'Ring of Protection',
      description: 'A warm band of silver that nudges away blows you never quite see coming.',
      itemType: 'Accessory',
      effects: [
        {
          id: fx('ring_protection_ac'),
          type: 'Modify Stat',
          savingThrowEnabled: false,
          statToModify: 'AC',
          modification: '+1',
        },
      ],
      instanceCount: 0,
    },
    {
      id: 'inv_x_amulet_of_health',
      type: 'Inventory Item',
      name: 'Amulet of Health',
      description: 'A heartstone pendant that floods its wearer with hardy, lasting vigor.',
      itemType: 'Accessory',
      effects: [
        {
          id: fx('amulet_health_hp'),
          type: 'Modify Stat',
          savingThrowEnabled: false,
          statToModify: 'Max HP',
          modification: '+10',
        },
      ],
      instanceCount: 0,
    },
    {
      id: 'inv_x_circlet_of_intellect',
      type: 'Inventory Item',
      name: 'Circlet of Intellect',
      description: 'A delicate silver crown that sharpens the mind and widens the wearer\'s reservoir of magic.',
      itemType: 'Accessory',
      effects: [
        {
          id: fx('circlet_intellect_mp'),
          type: 'Modify Stat',
          savingThrowEnabled: false,
          statToModify: 'Max MP',
          modification: '+8',
        },
      ],
      instanceCount: 0,
    },
    {
      id: 'inv_x_belt_of_strength',
      type: 'Inventory Item',
      name: 'Belt of Strength',
      description: 'A broad girdle of giant-hide that lends the muscle of something far larger than you.',
      itemType: 'Accessory',
      effects: [
        {
          id: fx('belt_strength_phys'),
          type: 'Modify Stat',
          savingThrowEnabled: false,
          statToModify: 'Physical',
          modification: '+3',
        },
      ],
      instanceCount: 0,
    },
    {
      id: 'inv_x_boots_of_speed',
      type: 'Inventory Item',
      name: 'Boots of Speed',
      description: 'Feather-light boots that quicken your step and let you act before the fray erupts.',
      itemType: 'Accessory',
      effects: [
        {
          id: fx('boots_speed_init'),
          type: 'Modify Stat',
          savingThrowEnabled: false,
          statToModify: 'Initiative',
          modification: '+5',
        },
      ],
      instanceCount: 0,
    },
    {
      id: 'inv_x_cloak_of_elvenkind',
      type: 'Inventory Item',
      name: 'Cloak of Elvenkind',
      description: 'A gray-green mantle woven by forest folk that blurs your outline into any shadow.',
      itemType: 'Accessory',
      effects: [
        {
          id: fx('cloak_elven_stealth'),
          type: 'Modify Stat',
          savingThrowEnabled: false,
          statToModify: 'Stealth',
          modification: '+3',
        },
      ],
      instanceCount: 0,
    },
    {
      id: 'inv_x_ring_of_the_sage',
      type: 'Inventory Item',
      name: 'Ring of the Sage',
      description: 'An ink-dark ring that whispers half-remembered lore to the one who wears it.',
      itemType: 'Accessory',
      effects: [
        {
          id: fx('ring_sage_lore'),
          type: 'Modify Stat',
          savingThrowEnabled: false,
          statToModify: 'Lore',
          modification: '+3',
        },
      ],
      instanceCount: 0,
    },
    {
      id: 'inv_x_pendant_of_influence',
      type: 'Inventory Item',
      name: 'Pendant of Influence',
      description: 'A lustrous pearl pendant that lends honeyed weight to every word you speak.',
      itemType: 'Accessory',
      effects: [
        {
          id: fx('pendant_influence'),
          type: 'Modify Stat',
          savingThrowEnabled: false,
          statToModify: 'Influence',
          modification: '+3',
        },
      ],
      instanceCount: 0,
    },
    {
      id: 'inv_x_charm_of_survival',
      type: 'Inventory Item',
      name: 'Charm of Survival',
      description: 'A bundle of bound twigs and bone that seems to know which way the wild wind blows.',
      itemType: 'Accessory',
      effects: [
        {
          id: fx('charm_survival'),
          type: 'Modify Stat',
          savingThrowEnabled: false,
          statToModify: 'Survival',
          modification: '+3',
        },
      ],
      instanceCount: 0,
    },
  ],

  // -------------------------------------------------------------------------
  // Consumables (10) — `charges: 1`. Instant effects have no duration;
  // buffs use `durationType: 'Rounds'` + `durationValue`.
  // -------------------------------------------------------------------------
  consumables: [
    {
      id: 'inv_x_superior_healing',
      type: 'Inventory Item',
      name: 'Potion of Superior Healing',
      description: 'A rich crimson draught that knits deep wounds closed in moments.',
      itemType: 'Consumable',
      charges: 1,
      effects: [
        {
          id: fx('superior_healing_hp'),
          type: 'Modify Stat',
          savingThrowEnabled: false,
          statToModify: 'HP',
          modification: '+3d10',
        },
      ],
      instanceCount: 0,
    },
    {
      id: 'inv_x_potion_of_mana',
      type: 'Inventory Item',
      name: 'Potion of Mana',
      description: 'A swirling azure tonic that rekindles a spent spellcaster\'s inner fire.',
      itemType: 'Consumable',
      charges: 1,
      effects: [
        {
          id: fx('potion_mana_mp'),
          type: 'Modify Stat',
          savingThrowEnabled: false,
          statToModify: 'MP',
          modification: '+1d10',
        },
      ],
      instanceCount: 0,
    },
    {
      id: 'inv_x_potion_of_stamina',
      type: 'Inventory Item',
      name: 'Potion of Stamina',
      description: 'A bracing herbal brew that chases the ache from tired limbs.',
      itemType: 'Consumable',
      charges: 1,
      effects: [
        {
          id: fx('potion_stamina_sp'),
          type: 'Modify Stat',
          savingThrowEnabled: false,
          statToModify: 'SP',
          modification: '+1d10',
        },
      ],
      instanceCount: 0,
    },
    {
      id: 'inv_x_elixir_of_might',
      type: 'Inventory Item',
      name: 'Elixir of Might',
      description: 'A thick, iron-tasting elixir that surges through the muscles for a short, furious spell.',
      itemType: 'Consumable',
      charges: 1,
      effects: [
        {
          id: fx('elixir_might_phys'),
          type: 'Modify Stat',
          savingThrowEnabled: false,
          statToModify: 'Physical',
          modification: '+2',
          durationType: 'Rounds',
          durationValue: 3,
        },
      ],
      instanceCount: 0,
    },
    {
      id: 'inv_x_elixir_of_the_mind',
      type: 'Inventory Item',
      name: 'Elixir of the Mind',
      description: 'A clear, cool philter that lifts a fog from the thoughts and quickens recall.',
      itemType: 'Consumable',
      charges: 1,
      effects: [
        {
          id: fx('elixir_mind_lore'),
          type: 'Modify Stat',
          savingThrowEnabled: false,
          statToModify: 'Lore',
          modification: '+2',
          durationType: 'Rounds',
          durationValue: 3,
        },
      ],
      instanceCount: 0,
    },
    {
      id: 'inv_x_antitoxin',
      type: 'Inventory Item',
      name: 'Antitoxin',
      description: 'A bitter restorative that fortifies the body against creeping poisons.',
      itemType: 'Consumable',
      charges: 1,
      effects: [
        {
          id: fx('antitoxin_save'),
          type: 'Give Advantage/Disadvantage',
          // The engine reads `advDis`/`targetSkill` (see effects.ts); the older
          // `advantageType`/`appliesTo` names were silently ignored.
          advDis: 'Advantage',
          targetSkill: 'Saving Throw',
          durationType: 'Rounds',
          durationValue: 3,
        },
      ],
      instanceCount: 0,
    },
    {
      id: 'inv_x_alchemists_fire',
      type: 'Inventory Item',
      name: 'Alchemist\'s Fire',
      description: 'A fragile flask of sticky, self-igniting liquid that bursts into flame on impact.',
      itemType: 'Consumable',
      charges: 1,
      damage: '2d6',
      damageType: 'Fire',
      effects: [
        {
          id: fx('alchemists_fire_dmg'),
          type: 'Apply Damage',
          savingThrowEnabled: false,
          useWeaponDamage: false,
          weaponMultiplier: 1,
          additionalDamage: '2d6',
          damageType: 'Fire',
          drainResourceEnabled: false,
        },
      ],
      instanceCount: 0,
    },
    {
      id: 'inv_x_holy_water',
      type: 'Inventory Item',
      name: 'Holy Water',
      description: 'Consecrated water that sears the unholy with searing radiant light when hurled.',
      itemType: 'Consumable',
      charges: 1,
      damage: '2d6',
      damageType: 'Radiant',
      effects: [
        {
          id: fx('holy_water_dmg'),
          type: 'Apply Damage',
          savingThrowEnabled: false,
          useWeaponDamage: false,
          weaponMultiplier: 1,
          additionalDamage: '2d6',
          damageType: 'Radiant',
          drainResourceEnabled: false,
        },
      ],
      instanceCount: 0,
    },
    {
      id: 'inv_x_oil_of_sharpness',
      type: 'Inventory Item',
      name: 'Oil of Sharpness',
      description: 'A whetting oil that lends a blade a wicked edge for the next few exchanges.',
      itemType: 'Consumable',
      charges: 1,
      effects: [
        {
          id: fx('oil_sharpness_phys'),
          type: 'Modify Stat',
          savingThrowEnabled: false,
          statToModify: 'Physical',
          modification: '+1',
          durationType: 'Rounds',
          durationValue: 3,
        },
      ],
      instanceCount: 0,
    },
    {
      id: 'inv_x_potion_of_heroism',
      type: 'Inventory Item',
      name: 'Potion of Heroism',
      description: 'A golden cordial that fills the drinker with bold, fearless resolve for a time.',
      itemType: 'Consumable',
      charges: 1,
      effects: [
        {
          id: fx('heroism_hp'),
          type: 'Modify Stat',
          savingThrowEnabled: false,
          statToModify: 'Max HP',
          modification: '+5',
          durationType: 'Rounds',
          durationValue: 5,
        },
      ],
      instanceCount: 0,
    },
  ],
};

/**
 * The expanded catalog exposed under the shared `WorldItems` contract. Weapons
 * keep their extra combat metadata at runtime (the engine reads it), matching
 * the shape of the weapons already present in `skillTree.json`.
 */
export const extraItems: WorldItems = catalog as unknown as WorldItems;
