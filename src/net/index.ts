/**
 * LIGHTHOUSE network layer — public surface.
 *
 * Consumers (Zustand stores, hotseat tooling) import from `@/net` only. They
 * get a backend-swappable {@link Transport} via {@link createTransport} and the
 * event/types needed to subscribe. Nothing here leaks PeerJS types.
 *
 * @example
 * import { createTransport, type TransportEvent } from '@/net';
 *
 * const transport = createTransport({ role: 'gm', roomCode: generateRoomCode() });
 * const off = transport.on((e: TransportEvent) => {
 *   if (e.type === 'message') applyToStore(e.from, e.message);
 * });
 * const selfId = await transport.start();
 * // …later
 * off();
 * transport.destroy();
 */
import type { Role } from '@/types';
import type { Transport } from './transport';
import { createPeerTransport } from './peerTransport';
import { createMockTransport } from './mockTransport';

// --- the contract & its event surface ---
export type {
  Transport,
  TransportEvent,
  TransportEventOf,
  TransportEventHandler,
  Unsubscribe,
} from './transport';
export { Emitter } from './transport';

// --- concrete backends (also reachable via the factory below) ---
export { createPeerTransport } from './peerTransport';
export { createMockTransport, __resetMockBuses } from './mockTransport';

// --- room codes ---
export {
  generateRoomCode,
  normalizeRoomCode,
  peerIdForRoom,
  ROOM_PEER_ID_PREFIX,
} from './roomCode';

// --- structural validation (re-exported for stores that double-check) ---
export { isGameMessage, isGameMessageType } from './validate';

/** Options accepted by {@link createTransport}. */
export interface CreateTransportOptions {
  /** Whether this client hosts (`'gm'`) or joins (`'player'`). */
  role: Role;
  /** Shared room code (host's derivable id; players join by it). */
  roomCode: string;
  /**
   * Use the in-memory {@link createMockTransport} instead of WebRTC. Intended
   * for tests, local development, and a future hotseat mode. Defaults to false.
   */
  mock?: boolean;
}

/**
 * Construct a {@link Transport}, selecting the backend.
 *
 * This is the single entry point the rest of the app should use so that
 * swapping the underlying implementation (PeerJS today, a real server later)
 * is a one-line change here, not a refactor across stores.
 */
export function createTransport(opts: CreateTransportOptions): Transport {
  const { role, roomCode, mock = false } = opts;
  return mock
    ? createMockTransport({ role, roomCode })
    : createPeerTransport({ role, roomCode });
}
