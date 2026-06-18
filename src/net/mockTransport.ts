import type { GameMessage, Role, ConnectionStatus } from '@/types';
import {
  Emitter,
  type Transport,
  type TransportEvent,
  type TransportEventHandler,
  type Unsubscribe,
} from './transport';
import { isGameMessage } from './validate';
import { normalizeRoomCode } from './roomCode';

/**
 * In-memory {@link Transport} implementation.
 *
 * Two (or more) `MockTransport`s created with the same `roomCode` share a
 * module-level message bus and can talk to each other within a single
 * tab/process. This powers:
 *   - unit tests (no WebRTC, no signalling server, deterministic),
 *   - a future "hotseat" mode (GM + players on one machine),
 *   - local development without network flakiness.
 *
 * It mirrors {@link createPeerTransport}'s event semantics exactly (`open`,
 * `peer-connect`, `peer-disconnect`, `message`, `status`, `error`), including
 * the structural-validation guarantee: malformed inbound payloads are dropped,
 * never emitted. Because the bus is always live, there is no heartbeat /
 * reconnect machinery — those concerns don't exist for an in-process link — but
 * the status lifecycle (`connecting` → `connected` → `disconnected`) is still
 * reported so consumers behave identically against either backend.
 */

/**
 * A shared, per-room rendezvous point. Every {@link MockTransport} in a room
 * registers itself here so siblings can find each other and deliver messages.
 */
interface MockBus {
  readonly room: string;
  /** Live members keyed by their selfId. */
  readonly members: Map<string, MockTransport>;
}

/** Module-level registry of buses, keyed by normalized room code. */
const buses = new Map<string, MockBus>();

function getBus(room: string): MockBus {
  let bus = buses.get(room);
  if (!bus) {
    bus = { room, members: new Map() };
    buses.set(room, bus);
  }
  return bus;
}

/**
 * Test/diagnostic helper: forget every in-memory bus.
 *
 * Useful in `afterEach` to guarantee isolation between test cases. Not part of
 * the {@link Transport} contract.
 */
export function __resetMockBuses(): void {
  for (const bus of buses.values()) {
    for (const member of [...bus.members.values()]) {
      member.destroy();
    }
  }
  buses.clear();
}

let mockIdCounter = 0;

/** Generate a unique, role-tagged id for a mock participant. */
function nextMockId(role: Role, room: string): string {
  mockIdCounter += 1;
  // GMs get a deterministic, room-derived id so a "player" mock can be pointed
  // at "the host" the same way the real peer transport derives it from the code.
  if (role === 'gm') return `mock-gm-${room}`;
  return `mock-player-${room}-${mockIdCounter}`;
}

class MockTransport implements Transport {
  readonly role: Role;
  private readonly room: string;
  private readonly emitter = new Emitter<TransportEvent>();

  private _selfId: string | null = null;
  private bus: MockBus | null = null;
  private started = false;
  private destroyed = false;
  private startPromise: Promise<string> | null = null;

  constructor(opts: { role: Role; roomCode: string }) {
    this.role = opts.role;
    this.room = normalizeRoomCode(opts.roomCode);
  }

  get selfId(): string | null {
    return this._selfId;
  }

  start(): Promise<string> {
    if (this.startPromise) return this.startPromise;

    this.startPromise = new Promise<string>((resolve) => {
      if (this.destroyed) {
        // Honour the "no throw" posture; resolve with a dead id and report.
        this.emitStatus('disconnected');
        this.emit({ type: 'error', error: 'mock transport: started after destroy' });
        const deadId = nextMockId(this.role, this.room);
        this._selfId = deadId;
        resolve(deadId);
        return;
      }

      this.emitStatus('connecting');

      const id = nextMockId(this.role, this.room);
      this._selfId = id;
      this.started = true;

      const bus = getBus(this.room);
      this.bus = bus;

      // Announce ourselves to existing members and learn about them.
      const existing = [...bus.members.values()];
      bus.members.set(id, this);

      // Resolve & emit `open` asynchronously so subscribers attached
      // immediately after `start()` (but before awaiting) still receive it,
      // matching the real transport where `open` arrives on a later tick.
      queueMicrotask(() => {
        if (this.destroyed) return;
        this.emit({ type: 'open', selfId: id });
        this.emitStatus('connected');

        // Symmetric peer-connect notifications between us and each existing peer.
        for (const peer of existing) {
          if (peer.destroyed || !peer._selfId) continue;
          this.emit({ type: 'peer-connect', peerId: peer._selfId });
          peer.emit({ type: 'peer-connect', peerId: id });
        }
      });

      resolve(id);
    });

    return this.startPromise;
  }

  send(peerId: string, message: GameMessage): void {
    if (!this.canSend()) return;
    const target = this.bus?.members.get(peerId);
    if (!target || target.destroyed || !target._selfId) return;
    target.deliver(this._selfId!, message);
  }

  broadcast(message: GameMessage): void {
    if (!this.canSend() || !this.bus) return;

    if (this.role === 'gm') {
      // Host → every other member.
      for (const member of this.bus.members.values()) {
        if (member === this || member.destroyed || !member._selfId) continue;
        member.deliver(this._selfId!, message);
      }
    } else {
      // Player → the host(s). There is normally exactly one GM in a room.
      for (const member of this.bus.members.values()) {
        if (member.role === 'gm' && !member.destroyed && member._selfId) {
          member.deliver(this._selfId!, message);
        }
      }
    }
  }

  on(handler: TransportEventHandler): Unsubscribe {
    return this.emitter.on(handler);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.started = false;

    const id = this._selfId;
    if (this.bus && id) {
      this.bus.members.delete(id);
      // Notify remaining members of our departure.
      for (const member of this.bus.members.values()) {
        if (member.destroyed) continue;
        member.emit({ type: 'peer-disconnect', peerId: id });
      }
      // Garbage-collect empty buses so the registry doesn't grow unbounded.
      if (this.bus.members.size === 0) {
        buses.delete(this.bus.room);
      }
    }

    this.emitStatus('disconnected');
    this.bus = null;
    this.emitter.clear();
  }

  // --- internals -----------------------------------------------------------

  /** Receive a message from another member; validate before surfacing. */
  private deliver(from: string, message: GameMessage): void {
    if (this.destroyed) return;
    // Treat the "wire" as hostile even in-process: a buggy caller could pass a
    // malformed object. Drop anything that isn't a well-formed GameMessage.
    if (!isGameMessage(message)) {
      this.emit({
        type: 'error',
        error: `mock transport: dropped malformed message from ${from}`,
      });
      return;
    }
    this.emit({ type: 'message', from, message });
  }

  private canSend(): boolean {
    return this.started && !this.destroyed && this._selfId !== null;
  }

  private emit(event: TransportEvent): void {
    if (this.destroyed && event.type !== 'status') return;
    this.emitter.emit(event);
  }

  private emitStatus(status: ConnectionStatus): void {
    this.emitter.emit({ type: 'status', status });
  }
}

/**
 * Create an in-memory {@link Transport}.
 *
 * @param opts.role     `'gm'` to act as the room host, `'player'` to join it.
 * @param opts.roomCode the shared room key; transports with the same normalized
 *                      code can exchange messages in-process.
 */
export function createMockTransport(opts: { role: Role; roomCode: string }): Transport {
  return new MockTransport(opts);
}
