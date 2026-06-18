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
