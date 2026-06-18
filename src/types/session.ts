import type { Character } from './character';

export type Role = 'gm' | 'player';

export type ConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

/** A player as seen by the GM in the lobby / party. */
export interface PartyMember {
  peerId: string;
  name: string;
  character: Character;
  status: ConnectionStatus;
  lastSeen: number;
}

export interface SessionInfo {
  role: Role | null;
  /** Human-friendly room code that doubles as the host peer id. */
  roomCode: string | null;
  selfName: string;
  status: ConnectionStatus;
}
