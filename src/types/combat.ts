import type { ActiveStatusEffect } from './character';

export type Team = 'player' | 'npc';

export interface Combatant {
  id: string;
  /** PeerJS connection id for player combatants; null for GM-controlled NPCs. */
  peerId: string | null;
  /** Source character id, if spawned from a saved character. */
  characterId?: string;
  name: string;
  team: Team;
  /** Position on the abstract battle line (lower = player side). */
  line: number;
  initiativeBonus: number;
  maxHP: number;
  maxMP: number;
  maxSP: number;
  currentHP: number;
  currentMP: number;
  currentSP: number;
  ac: number;
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
  | 'Guard'
  | 'Use Ability'
  | 'Weapon Attack'
  | 'Use Item'
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
  targetLine?: number;
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
