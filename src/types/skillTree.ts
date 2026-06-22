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

  // Field names below match what the engine (combat.ts) and the effect-text
  // renderer actually read, so display and resolution never diverge.

  // --- Apply Damage ---
  savingThrowEnabled?: boolean;
  saveSkill?: string;
  saveDC?: number | string;
  saveOutcome?: string; // e.g. 'Negate' | 'Halve'
  useWeaponDamage?: boolean;
  weaponMultiplier?: number;
  additionalDamage?: string;
  damageType?: string;
  // Drain sub-mode: steal a resource from the target and replenish the source.
  drainResourceEnabled?: boolean;
  resourceDrainedFromTarget?: ResourceType;
  resourceReplenishedToSelf?: string; // a ResourceType, or 'Half'

  // --- Modify Stat / Healing ---
  statToModify?: string;
  modification?: string;
  durationType?: 'Instant' | 'Rounds' | 'Actions' | 'Permanent';
  durationUnit?: 'Rounds' | 'Actions' | 'Permanent';
  durationValue?: number;

  // --- Give Advantage/Disadvantage ---
  advDis?: 'Advantage' | 'Disadvantage';
  targetSkill?: string; // the roll type it applies to, e.g. 'Attack Roll'

  // --- Move Target ---
  direction?: string; // 'Towards' | 'Away From'
  rows?: number; // hexes to move

  // --- Substitute Cost ---
  resourceGained?: ResourceType; // the cost-resource being substituted for
  resourceDrained?: ResourceType; // the resource actually spent instead

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
