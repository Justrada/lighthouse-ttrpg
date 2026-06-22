import type { ActiveStatusEffect } from './character';

export type Team = 'player' | 'npc';

/** Axial hex coordinate on the battlefield grid. */
export interface HexCoord {
  q: number;
  r: number;
}

export interface Combatant {
  id: string;
  /** PeerJS connection id for player combatants; null for GM-controlled NPCs. */
  peerId: string | null;
  /** Source character id, if spawned from a saved character. */
  characterId?: string;
  name: string;
  team: Team;
  /** Position on the hex battlefield (axial coordinate). */
  position: HexCoord;
  /** Weapon swapped to mid-combat; overrides the source character's equipped weapon. */
  equippedWeaponId?: string | null;
  /** Remaining uses of each consumable item id this combat (tallied from the
   *  backpack at creation) so a single potion can't be used indefinitely. */
  consumables?: Record<string, number>;
  /** Loaded rounds in each ammo weapon's clip this combat (weapon id → loaded).
   *  Only weapons with a `clipSize` get an entry; Reload refills from reserve. */
  ammo?: Record<string, number>;
  /** Spare rounds beyond the loaded clip (weapon id → reserve). A missing entry
   *  means unlimited reserve (Reload always tops the clip back to full). */
  ammoReserve?: Record<string, number>;
  initiativeBonus: number;
  maxHP: number;
  maxMP: number;
  maxSP: number;
  currentHP: number;
  currentMP: number;
  currentSP: number;
  ac: number;
  /** Damage types taken at half (resist) or zero (immune); compared case-insensitively. */
  resist?: string[];
  immune?: string[];
  /** Lowest natural d20 that crits (default 20); enhancements can drop it to 19/18. */
  critThreshold?: number;
  /** How a crit scales damage: double the dice (default) or maximize them. */
  critMode?: 'double-dice' | 'max-dice';
  portraitSeed?: string;
  statusEffects: ActiveStatusEffect[];
  isUnconscious: boolean;
  isDead: boolean;
  isGuarding?: boolean;
  deathSaves: { successes: number; failures: number };
  lastActionResult?: ActionResult | null;
}

export type ActionType =
  | 'Move'
  | 'Chase'
  | 'Guard'
  | 'Use Ability'
  | 'Weapon Attack'
  | 'Reload'
  | 'Use Item'
  | 'Change Equipment'
  | 'Flee'
  | 'Pass';

export interface DeclaredAction {
  actionIndex: number;
  actionType: ActionType;
  /** Ability node id or world item id, when applicable. */
  actionId?: string;
  label?: string;
  targetId?: string | null;
  targetIds?: string[];
  /** Destination hex for Move actions. */
  targetHex?: HexCoord;
  resolved?: boolean;
}

export interface ResolvedAction extends DeclaredAction {
  sourceId: string;
  sourceTeam: Team;
  initiative: number;
}

export interface ActionResult {
  kind: 'hit' | 'miss' | 'heal' | 'move' | 'guard' | 'effect' | 'death' | 'save' | 'info';
  amount?: number;
  text: string;
  targetId?: string;
}

export type CombatPhase = 'setup' | 'declare' | 'resolving' | 'between' | 'ended';

export interface CombatLogEntry {
  id: string;
  round: number;
  text: string;
  tone?: 'beam' | 'arcane' | 'danger' | 'success' | 'muted';
  ts: number;
}

export interface CombatState {
  isActive: boolean;
  phase: CombatPhase;
  round: number;
  combatants: Combatant[];
  /** combatantId -> declared actions for the round. */
  declaredActions: Record<string, DeclaredAction[]>;
  /** combatantId -> whether their actions are locked in. */
  lockedActions: Record<string, boolean>;
  resolutionQueue: ResolvedAction[];
  /** Index of the action currently resolving (for animated playback). */
  activeResolutionIndex: number;
  log: CombatLogEntry[];
}
