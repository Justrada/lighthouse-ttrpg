import type { GameMessage, Role, ConnectionStatus } from '@/types';

/**
 * ============================================================================
 *  LIGHTHOUSE network layer — the `Transport` contract
 * ============================================================================
 *
 * LIGHTHOUSE is "P2P now, server-ready". Today the only transport is WebRTC via
 * PeerJS, but the rest of the app (Zustand stores, screens) must never import
 * `peerjs` or know that peers exist. They talk to this {@link Transport}
 * interface only. A future WebSocket / Colyseus / authoritative-server backend
 * is added by writing one more class that satisfies this same interface — no
 * consumer code changes.
 *
 * ---------------------------------------------------------------------------
 *  Mental model
 * ---------------------------------------------------------------------------
 * A Transport is a bidirectional, message-oriented link between this client and
 * its peer group, parameterised by {@link Role}:
 *
 *   - role `'gm'`    — this client is the hub. It accepts connections from many
 *                      players. `broadcast` fans a message out to every player.
 *                      `send(peerId, …)` targets one player.
 *   - role `'player'`— this client has exactly one logical upstream: the host
 *                      (GM). `broadcast` and `send(host, …)` both deliver to the
 *                      host, which is responsible for relaying to others.
 *
 * The transport guarantees nothing about *application* semantics (who is
 * authoritative, conflict resolution, etc.) — it only delivers
 * {@link GameMessage}s and reports link lifecycle as {@link TransportEvent}s.
 *
 * ---------------------------------------------------------------------------
 *  Event semantics (what every implementation MUST emit)
 * ---------------------------------------------------------------------------
 *  - `open`            once, after {@link Transport.start} resolves, carrying the
 *                      stable `selfId` (== the value `start()` resolved to).
 *  - `peer-connect`    each time a remote participant becomes reachable. For a
 *                      player this fires for the host; for a GM, once per player.
 *  - `peer-disconnect` each time a remote participant becomes unreachable.
 *  - `message`         for every inbound message that PASSES structural
 *                      validation ({@link isGameMessage}). Malformed / unknown
 *                      payloads MUST be dropped, never emitted, never thrown.
 *                      `from` is the sender's id (a player's peer id, or the
 *                      host's id when received by a player).
 *  - `status`          on every {@link ConnectionStatus} transition
 *                      (`connecting` → `connected` → `reconnecting` → …).
 *  - `error`           for any recoverable error, as a human-readable string.
 *                      Implementations MUST NOT throw out of their internal
 *                      callbacks into application code.
 *
 * Ordering: `open` precedes any `message`/`peer-*` events. `status` may be
 * emitted at any time. After {@link Transport.destroy} no further events fire.
 *
 * ---------------------------------------------------------------------------
 *  Reliability expectations (the heartbeat/reconnect contract)
 * ---------------------------------------------------------------------------
 * A production-grade implementation SHOULD:
 *   1. Send a `heartbeat` message on an interval (≈10s) and reply to inbound
 *      `heartbeat` with `heartbeat_ack`.
 *   2. Track last-inbound-traffic time; if it exceeds a liveness window (≈25s),
 *      transition `status` to `reconnecting` and attempt to re-establish the
 *      link with exponential backoff (1,2,4,8,16s capped at 30s).
 *   3. Emit `peer-disconnect` / `peer-connect` around drops and recoveries and
 *      return `status` to `connected` once healthy.
 * The in-memory {@link createMockTransport} short-circuits step 1–2 (its bus is
 * always live) but honours the same event surface.
 *
 * ---------------------------------------------------------------------------
 *  Writing a new backend — checklist
 * ---------------------------------------------------------------------------
 *  1. Implement every member below with the documented semantics.
 *  2. Validate ALL inbound data with {@link isGameMessage} before emitting
 *     `message`. Treat the wire as hostile.
 *  3. Resolve `start()` with a stable id and emit `open` with the same id.
 *  4. Make `send`/`broadcast` no-ops (not throws) before `start()` / after
 *     `destroy()`; surface transient send failures as `error` events.
 *  5. Map your transport's connection lifecycle onto `peer-connect` /
 *     `peer-disconnect` / `status`.
 *  6. `destroy()` must be idempotent and release every resource + listener.
 * ============================================================================
 */

/**
 * Every observable thing a {@link Transport} can report. Consumers subscribe via
 * {@link Transport.on} and switch on `type`.
 */
export type TransportEvent =
  | { type: 'open'; selfId: string }
  | { type: 'peer-connect'; peerId: string }
  | { type: 'peer-disconnect'; peerId: string }
  | { type: 'message'; from: string; message: GameMessage }
  | { type: 'status'; status: ConnectionStatus }
  | { type: 'error'; error: string };

/** Narrow a {@link TransportEvent} to one variant by its `type`. */
export type TransportEventOf<T extends TransportEvent['type']> = Extract<
  TransportEvent,
  { type: T }
>;

/** A subscriber callback. Returned by {@link Transport.on}; see {@link Unsubscribe}. */
export type TransportEventHandler = (event: TransportEvent) => void;

/** Calling the function returned by {@link Transport.on} removes the handler. */
export type Unsubscribe = () => void;

/**
 * The backend-swappable network seam. See the file header for full semantics.
 *
 * Implementations: {@link createPeerTransport} (WebRTC/PeerJS),
 * {@link createMockTransport} (in-memory, for tests + hotseat).
 */
export interface Transport {
  /** This client's stable id once {@link start} has resolved; otherwise null. */
  readonly selfId: string | null;

  /** Whether this client is the host (`'gm'`) or a participant (`'player'`). */
  readonly role: Role;

  /**
   * Bring the transport online.
   *
   * Resolves with this client's stable `selfId` (also emitted via `open`).
   * Rejects if the link cannot be established at all (e.g. the room code is
   * already taken for a GM, or the host is unreachable for a player). Recoverable
   * problems after a successful start are reported via `error`/`status`, not by
   * rejecting. Calling `start` more than once returns the in-flight/initial
   * promise rather than starting twice.
   */
  start(): Promise<string>;

  /**
   * Send a message to a single participant by id.
   *
   * For a player, the only meaningful target is the host; sending to anyone else
   * is a no-op. Unknown/closed targets are ignored (no throw). No-op before
   * `start()` or after `destroy()`.
   */
  send(peerId: string, message: GameMessage): void;

  /**
   * Fan a message out.
   *
   * GM → every connected player. Player → the host (which relays as needed).
   * No-op before `start()` or after `destroy()`.
   */
  broadcast(message: GameMessage): void;

  /**
   * Subscribe to {@link TransportEvent}s.
   *
   * @returns an {@link Unsubscribe} that removes exactly this handler.
   */
  on(handler: TransportEventHandler): Unsubscribe;

  /**
   * Permanently tear down the transport: close connections, clear timers, drop
   * all subscribers. Idempotent. After this the instance emits nothing more and
   * `send`/`broadcast` are no-ops.
   */
  destroy(): void;
}

/**
 * A minimal synchronous fan-out emitter used internally by the transports.
 *
 * Not exported from the package barrel — it is an implementation detail. Kept
 * tiny and dependency-free (PeerJS bundles `eventemitter3`, but the Transport
 * surface is small enough that a bespoke, fully-typed emitter is clearer and
 * avoids leaking a third-party event type to consumers).
 *
 * Behaviour notes:
 *  - Handlers are invoked synchronously in subscription order.
 *  - A throwing handler does not prevent the others from running, and the error
 *    is swallowed (optionally forwarded to `onHandlerError`) so one bad
 *    subscriber can never break delivery or crash the transport.
 *  - Safe to `emit` while handlers mutate the subscriber set (we iterate a copy).
 */
export class Emitter<E> {
  private handlers = new Set<(event: E) => void>();

  constructor(private readonly onHandlerError?: (err: unknown) => void) {}

  /** Subscribe; returns an unsubscribe function. */
  on(handler: (event: E) => void): Unsubscribe {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  /** Synchronously deliver `event` to all current subscribers. */
  emit(event: E): void {
    // Iterate a snapshot so handlers may subscribe/unsubscribe during dispatch.
    for (const handler of [...this.handlers]) {
      try {
        handler(event);
      } catch (err) {
        // A misbehaving subscriber must never break the transport.
        this.onHandlerError?.(err);
      }
    }
  }

  /** Current subscriber count (used in tests/diagnostics). */
  get size(): number {
    return this.handlers.size;
  }

  /** Drop every subscriber. */
  clear(): void {
    this.handlers.clear();
  }
}
