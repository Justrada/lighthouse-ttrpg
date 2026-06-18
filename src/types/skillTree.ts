import type { WorldItems } from './items';

export type ItemRefType = 'Ability' | 'Enhancement';
export type ResourceType = 'MP' | 'SP' | 'HP';

export type EffectType =
  | 'Apply Damage'
  | 'Modify Stat'
  | 'Stun'
  | 'Give Advantage/Disadvantage'
  | 'Substitute Cost'
  | 'Move Target'
  | 'Apply Healing';

/**
 * A single effect attached to an ability, enhancement, or item.
 * The source data uses a flat object with optional fields per `type`,
 * so most fields are optional and read conditionally on `type`.
 */
export interface SkillEffect {
  id: string;
  type: EffectType | string;

  // --- Apply Damage ---
  savingThrowEnabled?: boolean;
  savingThrowSkill?: string;
  savingThrowDC?: number | string;
  saveForHalf?: boolean;
  useWeaponDamage?: boolean;
  weaponMultiplier?: number;
  additionalDamage?: string;
  damageType?: string;
  drainResourceEnabled?: boolean;
  drainResource?: ResourceType;

  // --- Modify Stat / Healing ---
  statToModify?: string;
  modification?: string;
  durationType?: 'Instant' | 'Rounds' | 'Actions' | 'Permanent';
  durationValue?: number;

  // --- Give Advantage/Disadvantage ---
  advantageType?: 'Advantage' | 'Disadvantage';
  appliesTo?: string;

  // --- Move Target ---
  moveDirection?: 'Push' | 'Pull';
  moveDistance?: number;

  // --- Substitute Cost ---
  substituteFrom?: ResourceType;
  substituteTo?: ResourceType;

  /** Tolerate any additional fields present in the source data. */
  [key: string]: unknown;
}

export interface AbilityCost {
  type: ResourceType;
  value: number;
}

export interface LinkedItem {
  id: string;
  type: ItemRefType;
  name: string;
  description: string;
  cost?: AbilityCost;
  initiativeMod?: number;
  combatUse?: boolean;
  range?: string;
  aoe?: string;
  hitType?: string;
  rollModifier?: string;
  effects: SkillEffect[];
  instanceCount?: number;
  dragType?: string;
}

export interface SkillNode {
  id: string;
  x: number;
  y: number;
  fx?: number;
  fy?: number;
  label: string;
  description: string;
  isCenter: boolean;
  linkedItem: LinkedItem | null;
}

export interface SkillEdge {
  id: string;
  sourceId: string;
  targetId: string;
}

export interface SkillTreeData {
  nodes: SkillNode[];
  edges: SkillEdge[];
  worldItems: WorldItems;
}
