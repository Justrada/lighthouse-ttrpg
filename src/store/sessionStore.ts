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
import { useWorldpackStore, ensureActiveCatalog, setWorldpackSessionLock } from './worldpackStore';
import { normalizeCharacter } from '@/lib/character';
import { normalizeCombatState } from '@/lib/combat';
import { normalizeWorldpackContent } from '@/lib/worldpack';
import { setActiveCatalog, buildActiveCatalog } from '@/data/skillTree';
import type { SystemBaseMode } from '@/types';

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
  // Highest combat-snapshot sequence this client (as a player) has applied, so
  // stale/reordered GM messages can be dropped. Reset on leave / re-baselined
  // by each combat_start.
  let lastRxSeq = -1;
  // While hosting, re-broadcast the active System whenever the GM switches or
  // edits it, so players' resolvers stay in lockstep. Torn down on leave.
  let unsubWorldpack: (() => void) | null = null;

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
          // Bring the joiner's resolver registry in line with the GM's active
          // System FIRST (before party/combat data) so custom content resolves
          // for them — and so a joiner who lacks the pack can still play it.
          transport.send(from, systemSyncMessage());
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
            // A reconnecting player is assigned a fresh peer id; rebind their
            // existing combatant (matched by the stable character id) to it so
            // they regain control instead of being locked out under the old id.
            combat.rebindCombatantPeer(character.id, from, new Set(get().party.map((m) => m.peerId)));
            transport.send(from, {
              type: 'combat_update',
              payload: { combat: useCombatStore.getState().combat },
            });
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
          // Relay to the OTHER players only — the original roller already recorded
          // it locally, so echoing it back would show them their own roll twice.
          if (!msg.payload.secret) {
            for (const m of get().party) {
              if (m.peerId !== from) transport.send(m.peerId, msg);
            }
          }
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
      case 'system_sync': {
        // The GM's active System is authoritative for the session. Build the same
        // catalog locally so our action menus / sheet / combat resolve identically
        // — even if we don't own the pack. Content is normalized at this boundary.
        const baseMode: SystemBaseMode =
          msg.payload?.baseMode === 'extend' || msg.payload?.baseMode === 'replace'
            ? msg.payload.baseMode
            : 'overlay';
        setActiveCatalog(buildActiveCatalog(normalizeWorldpackContent(msg.payload?.content), baseMode));
        break;
      }
      case 'party_sync':
        set({
          party: msg.payload.members.map((m) => {
            // Normalize each member like every other peer-data boundary, so a
            // malformed member can't crash PartyPanel via calculateDerivedStats.
            const character = normalizeCharacter(m.character);
            return {
              peerId: m.peerId,
              name: character.name,
              character,
              status: 'connected' as ConnectionStatus,
              lastSeen: Date.now(),
            };
          }),
        });
        break;
      case 'combat_start': {
        // Drop a replayed/reordered opening snapshot. A genuine new fight always
        // carries a strictly-higher seq (the GM's txSeq only increments), so a
        // seq <= the last applied one can only be a stale duplicate — which would
        // otherwise resurrect ended combat and rewind the ordering gate.
        const seq = msg.payload.seq;
        if (seq != null && seq <= lastRxSeq) break;
        if (seq != null) lastRxSeq = seq;
        combat.ingest(normalizeCombatState(msg.payload?.combat));
        break;
      }
      case 'combat_update': {
        // Drop stale/reordered snapshots so an old update can't rewind state or
        // resurrect combat after a newer snapshot (or combat_end) was applied.
        const seq = msg.payload.seq;
        if (seq != null && seq <= lastRxSeq) break;
        if (seq != null) lastRxSeq = seq;
        combat.ingest(normalizeCombatState(msg.payload?.combat));
        break;
      }
      case 'combat_end': {
        const seq = msg.payload.seq;
        if (seq != null && seq < lastRxSeq) break; // ignore a stale end
        if (seq != null) lastRxSeq = seq;
        combat.reset();
        ui.pushToast({ title: 'Combat has ended', tone: 'arcane' });
        break;
      }
      case 'check_request':
        if (msg.payload.targetPeerId === get().selfPeerId) {
          set({ pendingCheck: { id: msg.payload.id, skill: msg.payload.skill, dc: msg.payload.dc } });
          ui.pushToast({ title: `The GM requests a ${msg.payload.skill} check`, tone: 'arcane' });
        }
        break;
      case 'dice_roll':
        // Secret rolls are never meant for other players; ignore any that slip through.
        if (!msg.payload.secret) ui.recordRoll(msg.payload);
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

  /** The current active System as a wire message. Only extend/replace packs carry
   *  mechanical content; an overlay (reskin-only) pack syncs as base. */
  function systemSyncMessage(): GameMessage {
    const pack = useWorldpackStore.getState().getActive();
    const baseMode = (pack?.baseMode ?? 'overlay') as SystemBaseMode;
    const content = pack && baseMode !== 'overlay' ? pack.content ?? null : null;
    return { type: 'system_sync', payload: { content, baseMode } };
  }

  /** GM → all players: push the active System so their resolvers match. */
  function broadcastActiveSystem() {
    if (get().role !== 'gm' || !get().transport) return;
    get().send(systemSyncMessage());
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
      // An all-ambiguous custom code (e.g. "OIL") normalizes to ''; fall back to a
      // generated code rather than hosting an empty/invalid room.
      const code = (roomCode && normalizeRoomCode(roomCode)) || generateRoomCode();
      const transport = createTransport({ role: 'gm', roomCode: code });
      wire(transport);
      set({ role: 'gm', roomCode: code, selfName: gmName, status: 'connecting', transport, party: [] });
      try {
        const selfId = await transport.start();
        set({ selfPeerId: selfId, status: 'connected' });
        // Re-broadcast whenever the GM switches or edits the active System so
        // players' resolvers track it mid-session (joiners get it on player_join).
        unsubWorldpack?.();
        unsubWorldpack = useWorldpackStore.subscribe((s, prev) => {
          const cur = s.worldpacks.find((p) => p.id === s.activeId);
          const old = prev.worldpacks.find((p) => p.id === prev.activeId);
          if (s.activeId !== prev.activeId || cur !== old) broadcastActiveSystem();
        });
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
      if (!code) throw new Error('Enter a valid room code (letters A–Z and digits 2–9).');
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
        // The GM's System is authoritative for the session — stop our local pack
        // activations from clobbering the synced catalog until we leave.
        setWorldpackSessionLock(true);
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
      lastRxSeq = -1;
      unsubWorldpack?.();
      unsubWorldpack = null;
      get().transport?.destroy();
      useCombatStore.getState().reset();
      // Restore our OWN active System — a player may have had the GM's synced over
      // theirs for the session; reverting keeps solo play on the local pack.
      setWorldpackSessionLock(false);
      ensureActiveCatalog();
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
