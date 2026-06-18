import { create } from 'zustand';
import type { Character, PartyMember, GameMessage, ConnectionStatus } from '@/types';
import type { SessionStore } from './contracts';
import {
  createTransport,
  generateRoomCode,
  normalizeRoomCode,
  type Transport,
  type TransportEvent,
} from '@/net';
import { useCombatStore } from './combatStore';
import { useUIStore } from './uiStore';
import { normalizeCharacter } from '@/lib/character';

export interface PendingCheck {
  id: string;
  skill: string;
  dc?: number;
}

export interface SessionStoreImpl extends SessionStore {
  transport: Transport | null;
  pendingCheck: PendingCheck | null;
  setPendingCheck: (check: PendingCheck | null) => void;
}

export const useSessionStore = create<SessionStoreImpl>()((set, get) => {
  /** Subscribe a transport to this store and the network router. */
  function wire(transport: Transport) {
    transport.on((e: TransportEvent) => {
      switch (e.type) {
        case 'open':
          set({ selfPeerId: e.selfId });
          break;
        case 'status':
          set({ status: e.status as ConnectionStatus });
          break;
        case 'peer-disconnect':
          set((s) => ({ party: s.party.filter((m) => m.peerId !== e.peerId) }));
          break;
        case 'message':
          try {
            route(e.from, e.message, transport);
          } catch {
            /* never let a malformed message crash the session */
          }
          break;
        case 'error':
          useUIStore.getState().pushToast({ title: 'Connection issue', body: e.error, tone: 'danger' });
          break;
      }
    });
  }

  /** Interpret an inbound message based on our role. */
  function route(from: string, msg: GameMessage, transport: Transport) {
    const combat = useCombatStore.getState();
    const ui = useUIStore.getState();
    const role = get().role;

    if (role === 'gm') {
      // A player may only affect a combatant they own (their own peer).
      const ownsCombatant = (id: string) =>
        combat.combat.combatants.some((c) => c.id === id && c.peerId === from);
      switch (msg.type) {
        case 'player_join': {
          const character = normalizeCharacter(msg.payload.character);
          set((s) => {
            const others = s.party.filter((m) => m.peerId !== from);
            const member: PartyMember = {
              peerId: from,
              name: character.name,
              character,
              status: 'connected',
              lastSeen: Date.now(),
            };
            return { party: [...others, member] };
          });
          ui.pushToast({ title: `${character.name} joined the table`, tone: 'arcane' });
          // Sync party to everyone and bring the newcomer up to date.
          broadcastParty();
          if (combat.combat.isActive) {
            transport.send(from, { type: 'combat_update', payload: { combat: combat.combat } });
          }
          break;
        }
        case 'character_update': {
          const character = normalizeCharacter(msg.payload.character);
          set((s) => ({
            party: s.party.map((m) => (m.peerId === from ? { ...m, character, name: character.name } : m)),
          }));
          broadcastParty();
          break;
        }
        case 'declare_actions':
          if (ownsCombatant(msg.payload.combatantId))
            combat.applyRemoteDeclare(msg.payload.combatantId, msg.payload.actions);
          break;
        case 'lock_actions':
          if (ownsCombatant(msg.payload.combatantId))
            combat.applyRemoteLock(msg.payload.combatantId, msg.payload.locked);
          break;
        case 'resource_change':
          if (ownsCombatant(msg.payload.combatantId))
            combat.adjustResource(msg.payload.combatantId, msg.payload.resource, msg.payload.delta);
          break;
        case 'rest': {
          // Players may only rest their OWN combatant — never trigger a party-wide rest.
          const own = combat.combat.combatants.find((c) => c.peerId === from);
          if (own) combat.applyRest(msg.payload.kind, own.id);
          break;
        }
        case 'dice_roll':
          ui.recordRoll(msg.payload);
          if (!msg.payload.secret) get().send(msg); // relay to other players
          break;
        case 'check_result':
          ui.pushToast({
            title: `${msg.payload.roller}: ${msg.payload.skill} ${msg.payload.total}`,
            body: msg.payload.dc != null ? (msg.payload.success ? 'Success' : 'Failure') : undefined,
            tone: msg.payload.success ? 'success' : 'arcane',
          });
          break;
        case 'log':
          combat.appendLog(msg.payload);
          break;
      }
      return;
    }

    // --- player role: GM is authoritative ---
    switch (msg.type) {
      case 'party_sync':
        set({
          party: msg.payload.members.map((m) => ({
            peerId: m.peerId,
            name: m.character.name,
            character: m.character,
            status: 'connected' as ConnectionStatus,
            lastSeen: Date.now(),
          })),
        });
        break;
      case 'combat_start':
      case 'combat_update':
        combat.ingest(msg.payload.combat);
        break;
      case 'combat_end':
        combat.reset();
        ui.pushToast({ title: 'Combat has ended', tone: 'arcane' });
        break;
      case 'check_request':
        if (msg.payload.targetPeerId === get().selfPeerId) {
          set({ pendingCheck: { id: msg.payload.id, skill: msg.payload.skill, dc: msg.payload.dc } });
          ui.pushToast({ title: `The GM requests a ${msg.payload.skill} check`, tone: 'arcane' });
        }
        break;
      case 'dice_roll':
        ui.recordRoll(msg.payload);
        break;
      case 'log':
        combat.appendLog(msg.payload);
        break;
    }
  }

  function broadcastParty() {
    const members = get().party.map((m) => ({ peerId: m.peerId, character: m.character }));
    get().send({ type: 'party_sync', payload: { members } });
  }

  return {
    role: null,
    roomCode: null,
    selfName: '',
    selfPeerId: null,
    status: 'idle',
    party: [],
    activeCharacter: null,
    transport: null,
    pendingCheck: null,

    hostGame: async (gmName, roomCode) => {
      if (get().transport) get().leave(); // tear down any prior session first
      const code = roomCode ? normalizeRoomCode(roomCode) : generateRoomCode();
      const transport = createTransport({ role: 'gm', roomCode: code });
      wire(transport);
      set({ role: 'gm', roomCode: code, selfName: gmName, status: 'connecting', transport, party: [] });
      try {
        const selfId = await transport.start();
        set({ selfPeerId: selfId, status: 'connected' });
        return code;
      } catch (err) {
        transport.destroy();
        set({ role: null, roomCode: null, selfPeerId: null, status: 'idle', transport: null });
        throw err;
      }
    },

    joinGame: async (roomCode, character, playerName) => {
      if (get().transport) get().leave(); // tear down any prior session first
      const code = normalizeRoomCode(roomCode);
      const safeCharacter = normalizeCharacter(character);
      const transport = createTransport({ role: 'player', roomCode: code });
      wire(transport);
      set({
        role: 'player',
        roomCode: code,
        selfName: playerName,
        activeCharacter: safeCharacter,
        status: 'connecting',
        transport,
      });
      try {
        const selfId = await transport.start();
        set({ selfPeerId: selfId });
        transport.broadcast({ type: 'hello', payload: { role: 'player', name: playerName } });
        transport.broadcast({ type: 'player_join', payload: { character: safeCharacter } });
        set({ status: 'connected' });
      } catch (err) {
        transport.destroy();
        set({
          role: null,
          roomCode: null,
          selfPeerId: null,
          status: 'idle',
          transport: null,
          activeCharacter: null,
        });
        throw err;
      }
    },

    leave: () => {
      get().transport?.destroy();
      useCombatStore.getState().reset();
      set({
        role: null,
        roomCode: null,
        selfPeerId: null,
        status: 'idle',
        party: [],
        activeCharacter: null,
        transport: null,
        pendingCheck: null,
      });
    },

    send: (message) => {
      get().transport?.broadcast(message);
    },

    updateActiveCharacter: (character: Character) => {
      set({ activeCharacter: character });
      if (get().role === 'player') {
        get().send({ type: 'character_update', payload: { character } });
      }
    },

    setPendingCheck: (check) => set({ pendingCheck: check }),
  };
});
