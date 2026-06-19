import type { Character } from './character';
import type { CombatState, DeclaredAction, CombatLogEntry } from './combat';
import type { DiceRollResult } from './dice';
import type { Role } from './session';

/**
 * The wire protocol. Every message exchanged between GM and players is one of
 * these. The network layer is responsible only for delivery; stores interpret
 * the payloads. Keep this in sync on both ends — it is the integration seam.
 */
export type GameMessage =
  // --- handshake / presence ---
  | { type: 'hello'; payload: { role: Role; name: string } }
  | { type: 'player_join'; payload: { character: Character } }
  | { type: 'player_leave'; payload: { peerId: string } }
  | { type: 'character_update'; payload: { character: Character } }
  | { type: 'party_sync'; payload: { members: { peerId: string; character: Character }[] } }
  // --- combat lifecycle ---
  | { type: 'combat_start'; payload: { combat: CombatState; seq?: number } }
  | { type: 'combat_update'; payload: { combat: CombatState; seq?: number } }
  | { type: 'combat_patch'; payload: Partial<CombatState> }
  | { type: 'combat_end'; payload: { seq?: number } }
  | { type: 'declare_actions'; payload: { combatantId: string; actions: DeclaredAction[] } }
  | { type: 'lock_actions'; payload: { combatantId: string; locked: boolean } }
  // --- resources / state nudges ---
  | {
      type: 'resource_change';
      payload: { combatantId: string; resource: 'HP' | 'MP' | 'SP'; delta: number; note?: string };
    }
  | { type: 'condition_update'; payload: { combatantId: string; conditions: string[] } }
  | { type: 'rest'; payload: { kind: 'short' | 'long'; combatantId?: string } }
  // --- checks & dice ---
  | { type: 'check_request'; payload: { id: string; skill: string; dc?: number; targetPeerId: string } }
  | {
      type: 'check_result';
      payload: { id: string; skill: string; total: number; dc?: number; success?: boolean; roller: string };
    }
  | { type: 'dice_roll'; payload: DiceRollResult & { roller: string; secret?: boolean } }
  // --- misc ---
  | { type: 'log'; payload: CombatLogEntry }
  | { type: 'heartbeat'; payload: { t: number } }
  | { type: 'heartbeat_ack'; payload: { t: number } };

export type GameMessageType = GameMessage['type'];

/** Narrow a GameMessage to a specific variant by its `type`. */
export type MessageOf<T extends GameMessageType> = Extract<GameMessage, { type: T }>;
