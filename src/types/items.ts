import type { SkillEffect } from './skillTree';

export type ItemCategory = 'Weapon' | 'Armor' | 'Shield' | 'Accessory' | 'Consumable';

export interface WorldItem {
  id: string;
  type: 'Inventory Item';
  name: string;
  description: string;
  itemType: ItemCategory;
  weaknesses?: string[];
  /** Weapon damage dice notation, when present. */
  damage?: string;
  damageType?: string;
  range?: string;
  /** Consumable charges. */
  charges?: number;
  effects: SkillEffect[];
  instanceCount?: number;
}

/** worldItems is grouped by category bucket: weapons, armor, accessories, consumables. */
export type WorldItems = Record<string, WorldItem[]>;
