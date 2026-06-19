import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Force the session store to use the in-memory transport so two endpoints in one
// process can talk over the shared per-room bus (no real WebRTC in tests).
vi.mock('@/net', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/net')>();
  return {
    ...actual,
    createTransport: (opts: Parameters<typeof actual.createTransport>[0]) =>
      actual.createTransport({ ...opts, mock: true }),
  };
});

import { useSessionStore } from './sessionStore';
import { useCombatStore } from './combatStore';
import { createMockTransport, __resetMockBuses, type Transport } from '@/net';
import { createCombatant } from '@/engine';
import { performRoll } from './actions';
import type { Character } from '@/types';

const flush = async (rounds = 3) => {
  for (let i = 0; i < rounds; i += 1) await new Promise((r) => setTimeout(r, 0));
};

const validChar = (id: string, name: string): Character => ({
  id,
  name,
  level: 1,
  coreStats: { mind: 4, body: 4, soul: 4 },
  learnedSkills: ['center-0'],
  skillChoices: {},
  inventory: { armor: null, weapon: null, shield: null, accessories: [], backpack: [] },
  currentHP: 20,
  currentMP: 5,
  currentSP: 5,
  statusEffects: [],
});

let player: Transport | null = null;

beforeEach(() => {
  __resetMockBuses();
  useCombatStore.getState().reset();
});

afterEach(() => {
  player?.destroy();
  player = null;
  useSessionStore.getState().leave();
});

describe('sessionStore — network trust boundary', () => {
  it('normalizes a malformed character received on player_join', async () => {
    await useSessionStore.getState().hostGame('GM', 'ROOMA');
    player = createMockTransport({ role: 'player', roomCode: 'ROOMA' });
    await player.start();

    // Deliberately malformed: missing coreStats/learnedSkills/inventory.
    player.broadcast({ type: 'player_join', payload: { character: { id: 'pc', name: 'Bad' } as Character } });
    await flush();

    const party = useSessionStore.getState().party;
    expect(party).toHaveLength(1);
    expect(party[0].character.learnedSkills).toContain('center-0');
    expect(party[0].character.inventory).toBeDefined();
    expect(party[0].character.coreStats).toEqual({ mind: 4, body: 4, soul: 4 });
  });

  it('rejects a resource_change for a combatant the sender does not own, but applies its own', async () => {
    await useSessionStore.getState().hostGame('GM', 'ROOMB');
    player = createMockTransport({ role: 'player', roomCode: 'ROOMB' });
    const pid = await player.start();

    player.broadcast({ type: 'player_join', payload: { character: validChar('pc', 'Player') } });
    await flush();

    const myChar = useSessionStore.getState().party[0].character;
    const mine = createCombatant(myChar, { team: 'player', peerId: pid });
    const npc = createCombatant({ ...validChar('npc', 'Goblin') }, { team: 'npc' });
    useCombatStore.getState().startCombat([mine, npc]);

    const npcId = useCombatStore.getState().combat.combatants.find((c) => c.team === 'npc')!.id;
    const npcBefore = useCombatStore.getState().combat.combatants.find((c) => c.id === npcId)!.currentHP;

    // Malicious: damage a combatant we don't own → must be ignored.
    player.broadcast({ type: 'resource_change', payload: { combatantId: npcId, resource: 'HP', delta: -999 } });
    await flush();
    const npcAfter = useCombatStore.getState().combat.combatants.find((c) => c.id === npcId)!.currentHP;
    expect(npcAfter).toBe(npcBefore);

    // Legit: damage our own combatant → applied.
    const mineBefore = useCombatStore.getState().combat.combatants.find((c) => c.id === mine.id)!.currentHP;
    player.broadcast({ type: 'resource_change', payload: { combatantId: mine.id, resource: 'HP', delta: -3 } });
    await flush();
    const mineAfter = useCombatStore.getState().combat.combatants.find((c) => c.id === mine.id)!.currentHP;
    expect(mineAfter).toBe(mineBefore - 3);
  });

  it('scopes a player-triggered rest to their own combatant only', async () => {
    await useSessionStore.getState().hostGame('GM', 'ROOMC');
    player = createMockTransport({ role: 'player', roomCode: 'ROOMC' });
    const pid = await player.start();
    player.broadcast({ type: 'player_join', payload: { character: validChar('pc', 'Player') } });
    await flush();

    const myChar = useSessionStore.getState().party[0].character;
    const mine = createCombatant(myChar, { team: 'player', peerId: pid });
    mine.currentMP = 0;
    const ally = createCombatant({ ...validChar('ally', 'Ally') }, { team: 'player' });
    ally.currentMP = 0;
    useCombatStore.getState().startCombat([mine, ally]);

    player.broadcast({ type: 'rest', payload: { kind: 'long' } });
    await flush();

    const mineAfter = useCombatStore.getState().combat.combatants.find((c) => c.id === mine.id)!;
    const allyAfter = useCombatStore.getState().combat.combatants.find((c) => c.id === ally.id)!;
    expect(mineAfter.currentMP).toBe(mineAfter.maxMP); // own combatant rested
    expect(allyAfter.currentMP).toBe(0); // not a party-wide heal
  });
});

describe('sessionStore — combat snapshot ordering', () => {
  it('drops a stale combat_update that arrives after a newer snapshot / combat_end', async () => {
    const gm = createMockTransport({ role: 'gm', roomCode: 'ROOMSEQ' });
    await gm.start();
    await useSessionStore.getState().joinGame('ROOMSEQ', validChar('pc', 'P'), 'P');
    await flush();

    const activeCombat = {
      isActive: true,
      phase: 'declare',
      round: 1,
      combatants: [],
      declaredActions: {},
      lockedActions: {},
      resolutionQueue: [],
      activeResolutionIndex: -1,
      log: [],
    };

    gm.broadcast({ type: 'combat_start', payload: { combat: activeCombat as never, seq: 5 } });
    await flush();
    expect(useCombatStore.getState().combat.isActive).toBe(true);

    gm.broadcast({ type: 'combat_end', payload: { seq: 6 } });
    await flush();
    expect(useCombatStore.getState().combat.isActive).toBe(false);

    // A reordered, older update must NOT resurrect the ended combat.
    gm.broadcast({ type: 'combat_update', payload: { combat: activeCombat as never, seq: 4 } });
    await flush();
    expect(useCombatStore.getState().combat.isActive).toBe(false);

    // A genuinely newer snapshot still applies.
    gm.broadcast({ type: 'combat_update', payload: { combat: activeCombat as never, seq: 7 } });
    await flush();
    expect(useCombatStore.getState().combat.isActive).toBe(true);

    gm.destroy();
  });

  it('drops a replayed combat_start that would resurrect ended combat', async () => {
    const gm = createMockTransport({ role: 'gm', roomCode: 'ROOMSTART' });
    await gm.start();
    await useSessionStore.getState().joinGame('ROOMSTART', validChar('pc', 'P'), 'P');
    await flush();

    const active = {
      isActive: true,
      phase: 'declare',
      round: 1,
      combatants: [],
      declaredActions: {},
      lockedActions: {},
      resolutionQueue: [],
      activeResolutionIndex: -1,
      log: [],
    };

    gm.broadcast({ type: 'combat_start', payload: { combat: active as never, seq: 10 } });
    await flush();
    expect(useCombatStore.getState().combat.isActive).toBe(true);

    gm.broadcast({ type: 'combat_end', payload: { seq: 11 } });
    await flush();
    expect(useCombatStore.getState().combat.isActive).toBe(false);

    // A replayed/reordered OLDER opening snapshot must not resurrect combat.
    gm.broadcast({ type: 'combat_start', payload: { combat: active as never, seq: 9 } });
    await flush();
    expect(useCombatStore.getState().combat.isActive).toBe(false);

    gm.destroy();
  });
});

describe('sessionStore — dice roll relay', () => {
  it('relays a non-secret roll to other players but not back to the roller', async () => {
    await useSessionStore.getState().hostGame('GM', 'ROOMDICE');
    const a = createMockTransport({ role: 'player', roomCode: 'ROOMDICE' });
    const b = createMockTransport({ role: 'player', roomCode: 'ROOMDICE' });
    const aPid = await a.start();
    await b.start();
    let aGot = 0;
    let bGot = 0;
    a.on((e) => { if (e.type === 'message' && e.message.type === 'dice_roll') aGot += 1; });
    b.on((e) => { if (e.type === 'message' && e.message.type === 'dice_roll') bGot += 1; });

    a.broadcast({ type: 'player_join', payload: { character: validChar('pa', 'A') } });
    b.broadcast({ type: 'player_join', payload: { character: validChar('pb', 'B') } });
    await flush();

    a.broadcast({
      type: 'dice_roll',
      payload: { notation: '1d20', rolls: [10], modifier: 0, total: 10, roller: 'A', secret: false } as never,
    });
    await flush();

    expect(bGot).toBe(1); // the other player receives the relay
    expect(aGot).toBe(0); // the roller does NOT get its own roll echoed back

    void aPid;
    a.destroy();
    b.destroy();
  });

  it('never broadcasts a secret roll to the table', async () => {
    await useSessionStore.getState().hostGame('GM', 'ROOMSECRET');
    const b = createMockTransport({ role: 'player', roomCode: 'ROOMSECRET' });
    await b.start();
    let bGot = 0;
    b.on((e) => { if (e.type === 'message' && e.message.type === 'dice_roll') bGot += 1; });
    b.broadcast({ type: 'player_join', payload: { character: validChar('pb', 'B') } });
    await flush();

    performRoll({ notation: '1d20', secret: true });
    await flush();
    expect(bGot).toBe(0); // secret roll stays with the roller

    performRoll({ notation: '1d20', secret: false });
    await flush();
    expect(bGot).toBe(1); // a normal roll does reach the table

    b.destroy();
  });
});
