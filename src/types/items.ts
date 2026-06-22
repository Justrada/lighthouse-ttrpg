import type { SkillEffect } from './skillTree';

export type ItemCategory = 'Weapon' | 'Armor' | 'Shield' | 'Accessory' | 'Consumable';

export interface WorldItem {
  id: string;
  type: 'Inventory Item';
  name: string;
  description: string;
  itemType: ItemCategory;
  weaknesses?: string[];
  /** Damage types this item grants its wearer resistance (half) / immunity (none) to. */
  resist?: string[];
  immune?: string[];
  /** Weapon damage dice notation, when present. */
  damage?: string;
  damageType?: string;
  range?: string;
  /** Consumable charges. */
  charges?: number;

  // --- ammo module (guns, bows, anything that reloads) ---
  /** If set, this weapon uses ammo: rounds in a loaded clip. Firing depletes it;
   *  a Reload action refills it. Omit for a no-ammo weapon (sword, fists). */
  clipSize?: number;
  /** Rounds consumed per shot (default 1). */
  ammoPerShot?: number;
  /** Shots fired per Weapon Attack action — burst/multi-shot (default 1). */
  shots?: number;
  /** Finite spare rounds beyond the first loaded clip; omit ⇒ unlimited reserve. */
  reserveAmmo?: number;

  effects: SkillEffect[];
  instanceCount?: number;
}

/** worldItems is grouped by category bucket: weapons, armor, accessories, consumables. */
export type WorldItems = Record<string, WorldItem[]>;
