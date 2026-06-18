import { describe, it, expect, afterEach, vi } from 'vitest';
import type {
  Character,
  CombatState,
  GameMessage,
} from '@/types';
import { createMockTransport, __resetMockBuses } from './mockTransport';
import { createTransport } from './index';
import type { Transport, TransportEvent } from './transport';
import { generateRoomCode, normalizeRoomCode, peerIdForRoom } from './roomCode';
import { isGameMessage } from './validate';

/**
 * Collect events of a given type from a transport into an array for assertions.
 */
function collect<T extends TransportEvent['type']>(
  transport: Transport,
  type: T,
): Array<Extract<TransportEvent, { type: T }>> {
  const out: Array<Extract<TransportEvent, { type: T }>> = [];
  transport.on((e) => {
    if (e.type === type) out.push(e as Extract<TransportEvent, { type: T }>);
  });
  return out;
}

/** Minimal-but-valid Character fixture. */
function makeCharacter(name: string): Character {
  return {
    id: `char-${name}`,
    name,
    level: 1,
    coreStats: { mind: 2, body: 2, soul: 2 },
    learnedSkills: [],
    inventory: { armor: null, weapon: null, shield: null, accessories: [], backpack: [] },
    currentHP: 10,
    currentMP: 5,
    currentSP: 5,
  };
}

/** Minimal-but-valid CombatState fixture. */
function makeCombat(): CombatState {
  return {
    isActive: true,
    phase: 'declare',
    round: 1,
    combatants: [],
    declaredActions: {},
    lockedActions: {},
    resolutionQueue: [],
    activeResolutionIndex: 0,
    log: [],
  };
}

afterEach(() => {
  __resetMockBuses();
  vi.restoreAllMocks();
});

describe('roomCode helpers', () => {
  it('generates codes from the unambiguous alphabet only', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode();
      expect(code).toHaveLength(6);
      expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/);
      // No ambiguous glyphs.
      expect(code).not.toMatch(/[0O1IL]/);
    }
  });

  it('clamps length to 4..6', () => {
    expect(generateRoomCode(2)).toHaveLength(4);
    expect(generateRoomCode(99)).toHaveLength(6);
    expect(generateRoomCode(5)).toHaveLength(5);
  });

  it('normalizes case and strips non-alphabet characters', () => {
    expect(normalizeRoomCode('ab cd')).toBe('ABCD');
    expect(normalizeRoomCode('abc-234')).toBe('ABC234');
    expect(normalizeRoomCode('a!b@c#')).toBe('ABC');
  });

  it('derives a stable peer id regardless of formatting', () => {
    expect(peerIdForRoom('ab cd')).toBe(peerIdForRoom('ABCD'));
    expect(peerIdForRoom('ABC234')).toBe('lighthouse-ABC234');
  });
});

describe('isGameMessage', () => {
  it('accepts well-formed messages', () => {
    const msg: GameMessage = { type: 'heartbeat', payload: { t: 1 } };
    expect(isGameMessage(msg)).toBe(true);
    expect(isGameMessage({ type: 'combat_end', payload: {} })).toBe(true);
  });

  it('rejects malformed / unknown / non-object values', () => {
    expect(isGameMessage(null)).toBe(false);
    expect(isGameMessage(undefined)).toBe(false);
    expect(isGameMessage(42)).toBe(false);
    expect(isGameMessage('hello')).toBe(false);
    expect(isGameMessage([])).toBe(false);
    expect(isGameMessage({})).toBe(false);
    expect(isGameMessage({ type: 'nope', payload: {} })).toBe(false);
    expect(isGameMessage({ type: 'heartbeat' })).toBe(false); // missing payload
    expect(isGameMessage({ type: 'heartbeat', payload: 'x' })).toBe(false); // bad payload
  });
});

describe('mock transport round-trip (gm <-> player)', () => {
  it('exchanges player_join and combat_update over a shared room', async () => {
    const roomCode = generateRoomCode();
    const gm = createMockTransport({ role: 'gm', roomCode });
    const player = createMockTransport({ role: 'player', roomCode });

    const gmMessages = collect(gm, 'message');
    const playerMessages = collect(player, 'message');
    const gmPeerConnects = collect(gm, 'peer-connect');
    const playerPeerConnects = collect(player, 'peer-connect');

    const gmId = await gm.start();
    const playerId = await player.start();

    // Let the queued `open`/`peer-connect` microtasks flush.
    await Promise.resolve();
    await Promise.resolve();

    expect(gmId).toMatch(/^mock-gm-/);
    expect(playerId).toMatch(/^mock-player-/);

    // Both sides learned about each other.
    expect(gmPeerConnects.map((e) => e.peerId)).toContain(playerId);
    expect(playerPeerConnects.map((e) => e.peerId)).toContain(gmId);

    // Player → host: player_join.
    const character = makeCharacter('Aria');
    const joinMsg: GameMessage = { type: 'player_join', payload: { character } };
    player.broadcast(joinMsg);

    expect(gmMessages).toHaveLength(1);
    expect(gmMessages[0].from).toBe(playerId);
    expect(gmMessages[0].message.type).toBe('player_join');
    if (gmMessages[0].message.type === 'player_join') {
      expect(gmMessages[0].message.payload.character.name).toBe('Aria');
    }

    // Host → all players: combat_update.
    const combatMsg: GameMessage = { type: 'combat_update', payload: { combat: makeCombat() } };
    gm.broadcast(combatMsg);

    expect(playerMessages).toHaveLength(1);
    expect(playerMessages[0].from).toBe(gmId);
    expect(playerMessages[0].message.type).toBe('combat_update');
    if (playerMessages[0].message.type === 'combat_update') {
      expect(playerMessages[0].message.payload.combat.phase).toBe('declare');
    }

    gm.destroy();
    player.destroy();
  });

  it('targets a single peer with send()', async () => {
    const roomCode = generateRoomCode();
    const gm = createMockTransport({ role: 'gm', roomCode });
    const p1 = createMockTransport({ role: 'player', roomCode });
    const p2 = createMockTransport({ role: 'player', roomCode });

    const p1Messages = collect(p1, 'message');
    const p2Messages = collect(p2, 'message');

    await gm.start();
    const p1Id = await p1.start();
    await p2.start();
    await Promise.resolve();
    await Promise.resolve();

    const msg: GameMessage = { type: 'rest', payload: { kind: 'long' } };
    gm.send(p1Id, msg);

    expect(p1Messages).toHaveLength(1);
    expect(p2Messages).toHaveLength(0);

    gm.destroy();
    p1.destroy();
    p2.destroy();
  });
});

describe('mock transport drops malformed messages', () => {
  it('does not emit a message event for structurally invalid payloads', async () => {
    const roomCode = generateRoomCode();
    const gm = createMockTransport({ role: 'gm', roomCode });
    const player = createMockTransport({ role: 'player', roomCode });

    const gmMessages = collect(gm, 'message');
    const gmErrors = collect(gm, 'error');

    await gm.start();
    await player.start();
    await Promise.resolve();
    await Promise.resolve();

    // Bypass the type system to simulate a hostile/buggy sender on the wire.
    const bad = [
      { type: 'totally_unknown', payload: {} },
      { type: 'player_join' }, // missing payload
      { nope: true },
      null,
      'a string',
      42,
    ];
    for (const b of bad) {
      player.broadcast(b as unknown as GameMessage);
    }

    expect(gmMessages).toHaveLength(0);
    // Each malformed delivery surfaces a non-fatal error for diagnostics.
    expect(gmErrors.length).toBe(bad.length);

    // A subsequent well-formed message still gets through. (The mock has no
    // heartbeat protocol of its own, so a heartbeat passes through as a normal
    // message — the point here is only that valid traffic flows after garbage.)
    player.broadcast({ type: 'heartbeat', payload: { t: Date.now() } } as GameMessage);
    expect(gmMessages).toHaveLength(1);
    expect(gmMessages[0].message.type).toBe('heartbeat');

    gm.destroy();
    player.destroy();
  });
});

describe('lifecycle & status', () => {
  it('reports connecting -> connected -> disconnected', async () => {
    const roomCode = generateRoomCode();
    const gm = createMockTransport({ role: 'gm', roomCode });
    const statuses = collect(gm, 'status');

    await gm.start();
    await Promise.resolve();
    gm.destroy();

    const seq = statuses.map((s) => s.status);
    expect(seq[0]).toBe('connecting');
    expect(seq).toContain('connected');
    expect(seq[seq.length - 1]).toBe('disconnected');
  });

  it('emits peer-disconnect to remaining members when one leaves', async () => {
    const roomCode = generateRoomCode();
    const gm = createMockTransport({ role: 'gm', roomCode });
    const player = createMockTransport({ role: 'player', roomCode });

    const gmDisconnects = collect(gm, 'peer-disconnect');

    await gm.start();
    const playerId = await player.start();
    await Promise.resolve();
    await Promise.resolve();

    player.destroy();

    expect(gmDisconnects.map((e) => e.peerId)).toContain(playerId);
    gm.destroy();
  });

  it('is a no-op to send before start or after destroy', async () => {
    const roomCode = generateRoomCode();
    const gm = createMockTransport({ role: 'gm', roomCode });
    const player = createMockTransport({ role: 'player', roomCode });
    const gmMessages = collect(gm, 'message');

    // Before start: no-op, no throw.
    expect(() => player.broadcast({ type: 'heartbeat', payload: { t: 1 } })).not.toThrow();

    await gm.start();
    await player.start();
    await Promise.resolve();
    await Promise.resolve();

    player.destroy();
    // After destroy: no-op, no throw.
    expect(() => player.broadcast({ type: 'heartbeat', payload: { t: 1 } })).not.toThrow();
    expect(gmMessages).toHaveLength(0);

    gm.destroy();
  });
});

describe('createTransport factory', () => {
  it('returns a mock transport when mock:true and they interoperate', async () => {
    const roomCode = generateRoomCode();
    const gm = createTransport({ role: 'gm', roomCode, mock: true });
    const player = createTransport({ role: 'player', roomCode, mock: true });

    expect(gm.role).toBe('gm');
    expect(player.role).toBe('player');

    const gmMessages = collect(gm, 'message');
    await gm.start();
    const playerId = await player.start();
    await Promise.resolve();
    await Promise.resolve();

    player.broadcast({ type: 'log', payload: { id: 'l1', round: 1, text: 'hi', ts: 1 } });
    expect(gmMessages).toHaveLength(1);
    expect(gmMessages[0].from).toBe(playerId);

    gm.destroy();
    player.destroy();
  });
});
