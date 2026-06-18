import { Peer, type DataConnection, type PeerError } from 'peerjs';
import type { GameMessage, Role, ConnectionStatus } from '@/types';
import {
  Emitter,
  type Transport,
  type TransportEvent,
  type TransportEventHandler,
  type Unsubscribe,
} from './transport';
import { isGameMessage } from './validate';
import { peerIdForRoom } from './roomCode';

/**
 * WebRTC {@link Transport} backed by PeerJS.
 *
 * Topology is a star centred on the GM:
 *   - GM:     `new Peer(peerIdForRoom(code))` so the broker id is derivable from
 *             the room code. Accepts inbound {@link DataConnection}s (one per
 *             player), tracks them, and `broadcast`s by sending to all.
 *   - Player: `new Peer()` (random id), then `connect(peerIdForRoom(code))` to
 *             reach the host. `broadcast` sends to the host, which relays.
 *
 * Resilience (matches/extends the original app's best feature):
 *   - Heartbeat every {@link HEARTBEAT_INTERVAL_MS}; inbound `heartbeat` is
 *     answered with `heartbeat_ack`. Any inbound traffic counts as liveness.
 *   - If no inbound traffic for {@link LIVENESS_TIMEOUT_MS}, status → 'reconnecting'
 *     and a reconnect is attempted with exponential backoff
 *     ({@link BACKOFF_SCHEDULE_MS}, capped at {@link BACKOFF_CAP_MS}).
 *   - Connection drops/recoveries surface as `peer-disconnect`/`peer-connect`
 *     and drive the `status` lifecycle.
 *
 * Safety:
 *   - Every PeerJS callback is wrapped; errors become `error` events and never
 *     throw into the app.
 *   - Every inbound payload is structurally validated ({@link isGameMessage})
 *     before a `message` event is emitted; malformed/unknown data is dropped.
 */

/** How often to emit a heartbeat. */
const HEARTBEAT_INTERVAL_MS = 10_000;
/** No inbound traffic for this long ⇒ consider the link unhealthy. */
const LIVENESS_TIMEOUT_MS = 25_000;
/** Exponential backoff steps for reconnect attempts. */
const BACKOFF_SCHEDULE_MS = [1_000, 2_000, 4_000, 8_000, 16_000];
/** Backoff is clamped to this ceiling for attempts beyond the schedule. */
const BACKOFF_CAP_MS = 30_000;
/** Give up reconnecting after this many consecutive failed attempts. */
const MAX_RECONNECT_ATTEMPTS = 10;
/** How long to wait for a player's outbound connection to open before failing start. */
const CONNECT_OPEN_TIMEOUT_MS = 20_000;

type Timer = ReturnType<typeof setTimeout>;

abstract class BasePeerTransport implements Transport {
  abstract readonly role: Role;

  protected readonly emitter = new Emitter<TransportEvent>((err) => {
    // Subscriber threw — log to console (dev aid) but keep the link alive.
    // eslint-disable-next-line no-console
    console.error('[net] transport subscriber error', err);
  });

  protected peer: Peer | null = null;
  protected _selfId: string | null = null;
  protected destroyed = false;
  protected started = false;
  protected startPromise: Promise<string> | null = null;

  /** Current public status; used to suppress duplicate `status` emits. */
  protected status: ConnectionStatus = 'idle';

  /** Timestamp (ms) of the most recent inbound traffic from any peer. */
  protected lastInboundAt = 0;

  private heartbeatTimer: Timer | null = null;
  private livenessTimer: Timer | null = null;
  protected reconnectTimer: Timer | null = null;
  protected reconnectAttempt = 0;

  constructor(protected readonly roomCode: string) {}

  get selfId(): string | null {
    return this._selfId;
  }

  abstract start(): Promise<string>;
  abstract send(peerId: string, message: GameMessage): void;
  abstract broadcast(message: GameMessage): void;

  on(handler: TransportEventHandler): Unsubscribe {
    return this.emitter.on(handler);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.started = false;
    this.stopHeartbeat();
    this.clearReconnect();
    this.teardownConnections();
    try {
      this.peer?.destroy();
    } catch {
      /* ignore — we're tearing down anyway */
    }
    this.peer = null;
    this.setStatus('disconnected');
    this.emitter.clear();
  }

  /** Subclasses close their tracked DataConnections here. */
  protected abstract teardownConnections(): void;

  /** Subclasses kick off a reconnect cycle here (role-specific). */
  protected abstract reconnect(): void;

  // --- event helpers -------------------------------------------------------

  protected emit(event: TransportEvent): void {
    if (this.destroyed && event.type !== 'status') return;
    this.emitter.emit(event);
  }

  protected setStatus(next: ConnectionStatus): void {
    if (this.status === next) return;
    this.status = next;
    this.emitter.emit({ type: 'status', status: next });
  }

  protected emitError(context: string, err: unknown): void {
    const detail =
      err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err);
    this.emit({ type: 'error', error: `${context}: ${detail}` });
  }

  // --- inbound handling ----------------------------------------------------

  /**
   * Process a raw value received over a DataConnection.
   *
   * Validates structure, answers heartbeats, records liveness, and emits a
   * `message` event for well-formed application messages. Heartbeat traffic is
   * consumed here and not surfaced to consumers as `message` events.
   */
  protected handleInbound(from: string, raw: unknown, replyTo: DataConnection | null): void {
    this.markInbound();

    if (!isGameMessage(raw)) {
      // Drop hostile/garbage data. Surface as a non-fatal error for diagnostics.
      this.emitError('dropped malformed inbound', `from ${from}`);
      return;
    }

    // Heartbeat protocol is handled at the transport level.
    if (raw.type === 'heartbeat') {
      this.safeSend(replyTo, { type: 'heartbeat_ack', payload: { t: Date.now() } });
      return;
    }
    if (raw.type === 'heartbeat_ack') {
      // Liveness already recorded via markInbound(); nothing else to do.
      return;
    }

    this.emit({ type: 'message', from, message: raw });
  }

  /** Record that we just heard from a peer and recover from 'reconnecting'. */
  protected markInbound(): void {
    this.lastInboundAt = Date.now();
    if (this.status === 'reconnecting') {
      // Traffic resumed — we're healthy again.
      this.clearReconnect();
      this.reconnectAttempt = 0;
      this.setStatus('connected');
    }
  }

  // --- outbound helpers ----------------------------------------------------

  /** Send on a single connection, swallowing/forwarding any error. */
  protected safeSend(conn: DataConnection | null | undefined, message: GameMessage): void {
    if (!conn) return;
    if (!conn.open) return;
    try {
      void conn.send(message);
    } catch (err) {
      this.emitError('send failed', err);
    }
  }

  // --- heartbeat / liveness ------------------------------------------------

  /** Begin emitting heartbeats and watching for silence. Idempotent. */
  protected startHeartbeat(): void {
    this.lastInboundAt = Date.now();
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      if (this.destroyed) return;
      try {
        this.sendHeartbeat();
      } catch (err) {
        this.emitError('heartbeat send', err);
      }
    }, HEARTBEAT_INTERVAL_MS);

    // Check liveness slightly more often than the timeout for prompt detection.
    this.livenessTimer = setInterval(() => {
      if (this.destroyed) return;
      const silentFor = Date.now() - this.lastInboundAt;
      if (silentFor >= LIVENESS_TIMEOUT_MS && this.status === 'connected') {
        this.setStatus('reconnecting');
        this.scheduleReconnect();
      }
    }, Math.floor(LIVENESS_TIMEOUT_MS / 5));
  }

  protected stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.livenessTimer) {
      clearInterval(this.livenessTimer);
      this.livenessTimer = null;
    }
  }

  /** Subclasses implement how a heartbeat reaches the peer group. */
  protected abstract sendHeartbeat(): void;

  // --- reconnect with exponential backoff ----------------------------------

  /** Compute the delay for the current attempt from the backoff schedule. */
  protected backoffDelay(): number {
    const idx = Math.min(this.reconnectAttempt, BACKOFF_SCHEDULE_MS.length - 1);
    const base = BACKOFF_SCHEDULE_MS[idx];
    return Math.min(base, BACKOFF_CAP_MS);
  }

  /** Schedule the next reconnect attempt unless one is already pending. */
  protected scheduleReconnect(): void {
    if (this.destroyed) return;
    if (this.reconnectTimer) return; // attempt already queued
    if (this.reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
      // The peer is unreachable — stop spinning and surface a terminal state
      // rather than retrying forever. The user can leave and rejoin.
      this.setStatus('disconnected');
      this.emitError('reconnect', new Error('Unable to reconnect after repeated attempts.'));
      return;
    }

    const delay = this.backoffDelay();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.destroyed) return;
      this.reconnectAttempt += 1;
      try {
        this.reconnect();
      } catch (err) {
        this.emitError('reconnect', err);
        // Keep trying with the next (larger) backoff step.
        this.scheduleReconnect();
      }
    }, delay);
  }

  protected clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

// ===========================================================================
//  GM transport — the hub
// ===========================================================================

class GmPeerTransport extends BasePeerTransport {
  readonly role = 'gm' as const;

  /** Active player connections keyed by their peer id. */
  private connections = new Map<string, DataConnection>();

  start(): Promise<string> {
    if (this.startPromise) return this.startPromise;

    this.startPromise = new Promise<string>((resolve, reject) => {
      if (this.destroyed) {
        reject(new Error('transport destroyed'));
        return;
      }
      this.setStatus('connecting');

      const hostId = peerIdForRoom(this.roomCode);
      let settled = false;

      let peer: Peer;
      try {
        peer = new Peer(hostId);
      } catch (err) {
        this.setStatus('error');
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      this.peer = peer;

      peer.on('open', (id) => {
        if (this.destroyed) return;
        this._selfId = id;
        this.started = true;
        settled = true;
        this.emit({ type: 'open', selfId: id });
        this.setStatus('connected');
        this.startHeartbeat();
        resolve(id);
      });

      peer.on('connection', (conn) => {
        this.wrap(() => this.acceptConnection(conn));
      });

      peer.on('disconnected', () => {
        if (this.destroyed) return;
        // Lost the signalling server but existing DataConnections may persist.
        // Attempt to restore the broker link so new players can still join.
        this.setStatus('reconnecting');
        this.scheduleReconnect();
      });

      peer.on('error', (err: PeerError<string>) => {
        if (this.destroyed) return;
        // 'unavailable-id' on a GM means the room code is already in use.
        if (err.type === 'unavailable-id') {
          const msg = `Room code "${this.roomCode}" is already in use. Pick another.`;
          this.emit({ type: 'error', error: msg });
          if (!settled) {
            settled = true;
            this.setStatus('error');
            reject(new Error(msg));
          }
          return;
        }
        this.emitError(`peer error (${err.type})`, err);
        if (!settled && isFatalPeerError(err.type)) {
          settled = true;
          this.setStatus('error');
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
    });

    return this.startPromise;
  }

  send(peerId: string, message: GameMessage): void {
    if (!this.canSend()) return;
    this.safeSend(this.connections.get(peerId), message);
  }

  broadcast(message: GameMessage): void {
    if (!this.canSend()) return;
    for (const conn of this.connections.values()) {
      this.safeSend(conn, message);
    }
  }

  protected sendHeartbeat(): void {
    const hb: GameMessage = { type: 'heartbeat', payload: { t: Date.now() } };
    for (const conn of this.connections.values()) {
      this.safeSend(conn, hb);
    }
  }

  protected teardownConnections(): void {
    for (const conn of this.connections.values()) {
      try {
        conn.close();
      } catch {
        /* ignore */
      }
    }
    this.connections.clear();
  }

  protected reconnect(): void {
    if (this.destroyed || !this.peer) return;
    // For the GM the recoverable failure is the broker (signalling) link. If the
    // Peer is merely disconnected (not destroyed) we can reconnect with the same
    // id. If it was destroyed, re-create it.
    if (this.peer.destroyed) {
      this.recreatePeer();
      return;
    }
    if (this.peer.disconnected) {
      try {
        this.peer.reconnect();
      } catch (err) {
        this.emitError('peer.reconnect', err);
        this.recreatePeer();
      }
    }
  }

  /** Rebuild the Peer from scratch, keeping the same room/host id. */
  private recreatePeer(): void {
    const hostId = peerIdForRoom(this.roomCode);
    try {
      this.peer?.destroy();
    } catch {
      /* ignore */
    }
    let peer: Peer;
    try {
      peer = new Peer(hostId);
    } catch (err) {
      this.emitError('recreate peer', err);
      this.scheduleReconnect();
      return;
    }
    this.peer = peer;

    peer.on('open', (id) => {
      if (this.destroyed) return;
      this._selfId = id;
      this.clearReconnect();
      this.reconnectAttempt = 0;
      this.setStatus('connected');
      this.markInbound();
    });
    peer.on('connection', (conn) => this.wrap(() => this.acceptConnection(conn)));
    peer.on('disconnected', () => {
      if (this.destroyed) return;
      this.setStatus('reconnecting');
      this.scheduleReconnect();
    });
    peer.on('error', (err: PeerError<string>) => {
      if (this.destroyed) return;
      this.emitError(`peer error (${err.type})`, err);
      this.scheduleReconnect();
    });
  }

  private acceptConnection(conn: DataConnection): void {
    const register = () => {
      const peerId = conn.peer;
      this.connections.set(peerId, conn);
      this.markInbound();
      this.emit({ type: 'peer-connect', peerId });
      // Healthy again if we were waiting on players.
      if (this.status !== 'connected' && !this.destroyed) this.setStatus('connected');
    };

    // `open` may already have fired by the time we attach (rare) — guard both.
    if (conn.open) {
      register();
    } else {
      conn.on('open', () => this.wrap(register));
    }

    conn.on('data', (data) => this.wrap(() => this.handleInbound(conn.peer, data, conn)));

    conn.on('close', () =>
      this.wrap(() => {
        this.connections.delete(conn.peer);
        this.emit({ type: 'peer-disconnect', peerId: conn.peer });
      }),
    );

    conn.on('error', (err) => this.wrap(() => this.emitError(`connection error (${conn.peer})`, err)));
  }

  private canSend(): boolean {
    return this.started && !this.destroyed && this._selfId !== null;
  }

  /** Run a PeerJS callback body, converting any throw into an `error` event. */
  private wrap(fn: () => void): void {
    try {
      fn();
    } catch (err) {
      this.emitError('internal', err);
    }
  }
}

// ===========================================================================
//  Player transport — single upstream to the host
// ===========================================================================

class PlayerPeerTransport extends BasePeerTransport {
  readonly role = 'player' as const;

  private hostConn: DataConnection | null = null;
  private hostId: string;
  /** Resolves once we are connected enough for `start()` to complete. */
  private openTimeout: Timer | null = null;

  constructor(roomCode: string) {
    super(roomCode);
    this.hostId = peerIdForRoom(roomCode);
  }

  start(): Promise<string> {
    if (this.startPromise) return this.startPromise;

    this.startPromise = new Promise<string>((resolve, reject) => {
      if (this.destroyed) {
        reject(new Error('transport destroyed'));
        return;
      }
      this.setStatus('connecting');

      let settled = false;
      const fail = (err: unknown) => {
        if (settled) return;
        settled = true;
        this.clearOpenTimeout();
        this.setStatus('error');
        reject(err instanceof Error ? err : new Error(String(err)));
      };
      const succeed = (id: string) => {
        if (settled) return;
        settled = true;
        this.clearOpenTimeout();
        resolve(id);
      };

      let peer: Peer;
      try {
        peer = new Peer();
      } catch (err) {
        fail(err);
        return;
      }
      this.peer = peer;

      peer.on('open', (id) => {
        if (this.destroyed) return;
        this._selfId = id;
        this.started = true;
        this.emit({ type: 'open', selfId: id });
        // Now dial the host.
        this.openHostConnection(succeed, fail);
      });

      peer.on('disconnected', () => {
        if (this.destroyed) return;
        // Lost broker link; the host DataConnection may still work, but to be
        // safe we enter reconnecting and try to restore.
        if (this.status === 'connected') this.setStatus('reconnecting');
        this.scheduleReconnect();
      });

      peer.on('error', (err: PeerError<string>) => {
        if (this.destroyed) return;
        if (err.type === 'peer-unavailable') {
          const msg = `Host for room "${this.roomCode}" was not found. Check the code.`;
          this.emit({ type: 'error', error: msg });
          // Don't hard-fail start immediately on transient unavailability if we
          // already connected once; otherwise fail the initial start.
          if (this.status !== 'connected') fail(new Error(msg));
          else this.scheduleReconnect();
          return;
        }
        this.emitError(`peer error (${err.type})`, err);
        if (isFatalPeerError(err.type) && this.status !== 'connected') fail(err);
      });

      // Overall guard: if neither success nor failure happens in time, fail.
      this.openTimeout = setTimeout(() => {
        if (!settled) fail(new Error('Timed out connecting to host.'));
      }, CONNECT_OPEN_TIMEOUT_MS);
    });

    return this.startPromise;
  }

  send(peerId: string, message: GameMessage): void {
    if (!this.canSend()) return;
    // A player's only meaningful target is the host.
    if (peerId === this.hostId || peerId === this.hostConn?.peer) {
      this.safeSend(this.hostConn, message);
    }
  }

  broadcast(message: GameMessage): void {
    if (!this.canSend()) return;
    this.safeSend(this.hostConn, message);
  }

  protected sendHeartbeat(): void {
    this.safeSend(this.hostConn, { type: 'heartbeat', payload: { t: Date.now() } });
  }

  protected teardownConnections(): void {
    this.clearOpenTimeout();
    if (this.hostConn) {
      try {
        this.hostConn.close();
      } catch {
        /* ignore */
      }
      this.hostConn = null;
    }
  }

  protected reconnect(): void {
    if (this.destroyed || !this.peer) return;

    // If our broker link is down, restore it first; the 'open' handler set up
    // in start() won't re-run, so handle reconnect's open via reconnectPeer.
    if (this.peer.destroyed) {
      this.recreatePeer();
      return;
    }
    if (this.peer.disconnected) {
      try {
        this.peer.reconnect();
      } catch (err) {
        this.emitError('peer.reconnect', err);
        this.recreatePeer();
        return;
      }
    }
    // (Re)dial the host. openHostConnection will replace a stale connection.
    this.openHostConnection(
      () => {
        /* reconnected — markInbound() in data handler will flip status */
      },
      (err) => {
        this.emitError('reconnect dial', err);
        this.scheduleReconnect();
      },
    );
  }

  private recreatePeer(): void {
    try {
      this.peer?.destroy();
    } catch {
      /* ignore */
    }
    let peer: Peer;
    try {
      peer = new Peer();
    } catch (err) {
      this.emitError('recreate peer', err);
      this.scheduleReconnect();
      return;
    }
    this.peer = peer;
    peer.on('open', (id) => {
      if (this.destroyed) return;
      this._selfId = id;
      this.openHostConnection(
        () => {
          /* status recovers on first inbound */
        },
        (err) => {
          this.emitError('reconnect dial', err);
          this.scheduleReconnect();
        },
      );
    });
    peer.on('disconnected', () => {
      if (this.destroyed) return;
      this.scheduleReconnect();
    });
    peer.on('error', (err: PeerError<string>) => {
      if (this.destroyed) return;
      this.emitError(`peer error (${err.type})`, err);
      this.scheduleReconnect();
    });
  }

  /** Dial the host and wire the resulting DataConnection. */
  private openHostConnection(onOpen: (selfId: string) => void, onFail: (err: unknown) => void): void {
    if (this.destroyed || !this.peer) return;

    // Replace any stale connection.
    if (this.hostConn) {
      try {
        this.hostConn.close();
      } catch {
        /* ignore */
      }
      this.hostConn = null;
    }

    let conn: DataConnection;
    try {
      conn = this.peer.connect(this.hostId, { reliable: true });
    } catch (err) {
      onFail(err);
      return;
    }
    this.hostConn = conn;

    conn.on('open', () =>
      this.wrap(() => {
        this.markInbound();
        this.emit({ type: 'peer-connect', peerId: conn.peer });
        this.setStatus('connected');
        this.clearReconnect();
        this.reconnectAttempt = 0;
        this.startHeartbeat();
        onOpen(this._selfId ?? conn.peer);
      }),
    );

    conn.on('data', (data) => this.wrap(() => this.handleInbound(conn.peer, data, conn)));

    conn.on('close', () =>
      this.wrap(() => {
        this.emit({ type: 'peer-disconnect', peerId: conn.peer });
        if (this.hostConn === conn) this.hostConn = null;
        if (!this.destroyed) {
          this.setStatus('reconnecting');
          this.scheduleReconnect();
        }
      }),
    );

    conn.on('error', (err) =>
      this.wrap(() => {
        this.emitError('host connection error', err);
        onFail(err);
      }),
    );
  }

  private clearOpenTimeout(): void {
    if (this.openTimeout) {
      clearTimeout(this.openTimeout);
      this.openTimeout = null;
    }
  }

  private canSend(): boolean {
    return this.started && !this.destroyed && this._selfId !== null;
  }

  private wrap(fn: () => void): void {
    try {
      fn();
    } catch (err) {
      this.emitError('internal', err);
    }
  }
}

/** PeerJS error types that should fail `start()` outright (non-recoverable). */
function isFatalPeerError(type: string): boolean {
  return (
    type === 'browser-incompatible' ||
    type === 'invalid-id' ||
    type === 'invalid-key' ||
    type === 'ssl-unavailable' ||
    type === 'server-error'
  );
}

/**
 * Create a WebRTC {@link Transport} over PeerJS.
 *
 * @param opts.role     `'gm'` to host the room (broker id derived from the
 *                      code) or `'player'` to join it.
 * @param opts.roomCode the shared room code.
 */
export function createPeerTransport(opts: { role: Role; roomCode: string }): Transport {
  return opts.role === 'gm'
    ? new GmPeerTransport(opts.roomCode)
    : new PlayerPeerTransport(opts.roomCode);
}
