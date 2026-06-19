/**
 * Store API contracts — the integration seam between screens and state.
 *
 * Screens are written against these interfaces; the concrete Zustand stores
 * (implemented in this folder) satisfy them. Engine + network layers are called
 * from inside the stores, never directly from screens.
 */
import type {
  Character,
  DerivedStats,
  SkillPointBudget,
  CombatState,
  Combatant,
  DeclaredAction,
  HexCoord,
  Team,
  PartyMember,
  Role,
  ConnectionStatus,
  GameMessage,
  DiceRollResult,
  AdvantageMode,
  Worldpack,
} from '@/types';
import type { Archetype } from '@/engine';

export type { Archetype };

export interface RosterStore {
  characters: Character[];
  load: () => void;
  get: (id: string) => Character | undefined;
  upsert: (character: Character) => void;
  remove: (id: string) => void;
  duplicate: (id: string) => void;
}

export interface WorldpackStore {
  worldpacks: Worldpack[];
  /** Id of the pack currently re-skinning the game (null = base system). */
  activeId: string | null;
  load: () => void;
  get: (id: string) => Worldpack | undefined;
  getActive: () => Worldpack | null;
  /** Create or update a pack (by id). */
  save: (pack: Worldpack) => void;
  remove: (id: string) => void;
  duplicate: (id: string) => Worldpack | null;
  setActive: (id: string | null) => void;
  /** Validate + add an imported pack (JSON string or object). Returns it, or null. */
  importPack: (raw: unknown) => Worldpack | null;
}

export interface DraftStore {
  draft: Character | null;
  budget: SkillPointBudget;
  derived: DerivedStats | null;
  startNew: () => void;
  editExisting: (character: Character) => void;
  /**
   * Auto-generate a complete, editable draft from a name, level, and archetype
   * (Quick Build). Replaces the current draft via the same derive path as
   * `startNew`/`editExisting`, so the result is fully editable afterward.
   */
  quickBuild: (opts: { name: string; level: number; archetype: Archetype }) => void;
  setName: (name: string) => void;
  setLevel: (level: number) => void;
  changeStat: (stat: 'mind' | 'body' | 'soul', delta: number) => void;
  learnSkill: (nodeId: string) => void;
  unlearnSkill: (nodeId: string) => void;
  /** Whether a node can currently be learned, with a reason if not. */
  canLearn: (nodeId: string) => { ok: boolean; reason?: string };
  isLearned: (nodeId: string) => boolean;
  setSkillChoice: (nodeId: string, effectId: string, choice: string) => void;
  equip: (itemId: string) => void;
  unequip: (slot: 'armor' | 'weapon' | 'shield' | 'accessory', itemId?: string) => void;
  addToBackpack: (itemId: string) => void;
  removeFromBackpack: (itemId: string) => void;
  commit: () => Character | null;
  discard: () => void;
}

export interface SessionStore {
  role: Role | null;
  roomCode: string | null;
  selfName: string;
  selfPeerId: string | null;
  status: ConnectionStatus;
  party: PartyMember[];
  /** The local player's active character (player role only). */
  activeCharacter: Character | null;
  hostGame: (gmName: string, roomCode?: string) => Promise<string>;
  joinGame: (roomCode: string, character: Character, playerName: string) => Promise<void>;
  leave: () => void;
  send: (message: GameMessage) => void;
  updateActiveCharacter: (character: Character) => void;
}

export interface CombatStore {
  combat: CombatState;
  startCombat: (combatants: Combatant[]) => void;
  /** Leave the GM setup/placement phase and begin round 1's declarations. */
  beginRound: () => void;
  /** GM places a combatant on a hex (setup placement + free repositioning). */
  placeCombatant: (combatantId: string, hex: HexCoord) => void;
  /** GM reassigns a combatant's team (e.g. recruit a beast as a party ally). */
  setCombatantTeam: (combatantId: string, team: Team) => void;
  endCombat: () => void;
  declareAction: (combatantId: string, action: DeclaredAction) => void;
  clearAction: (combatantId: string, actionIndex: number) => void;
  lockActions: (combatantId: string, locked: boolean) => void;
  allLocked: () => boolean;
  resolveRound: () => Promise<void>;
  adjustResource: (combatantId: string, resource: 'HP' | 'MP' | 'SP', delta: number) => void;
  applyRest: (kind: 'short' | 'long', combatantId?: string) => void;
  toggleCondition: (combatantId: string, conditionKey: string) => void;
  /** Apply an authoritative combat snapshot received over the network. */
  ingest: (combat: CombatState) => void;
}

export interface ToastMessage {
  id: string;
  title: string;
  body?: string;
  tone?: 'neutral' | 'arcane' | 'success' | 'danger' | 'warn';
}

export interface UIStore {
  toasts: ToastMessage[];
  pushToast: (toast: Omit<ToastMessage, 'id'>) => void;
  dismissToast: (id: string) => void;
  diceTrayOpen: boolean;
  toggleDiceTray: (open?: boolean) => void;
  rollFeed: (DiceRollResult & { roller: string })[];
  recordRoll: (roll: DiceRollResult & { roller: string }) => void;
  /** Convenience: roll + record + (optionally) broadcast handled by caller. */
  reduceMotion: boolean;
  setReduceMotion: (v: boolean) => void;
}

export type { AdvantageMode };
