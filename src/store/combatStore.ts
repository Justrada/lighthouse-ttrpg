import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type {
  Character,
  Combatant,
  CombatState,
  CombatLogEntry,
  DeclaredAction,
} from '@/types';
import type { CombatStore } from './contracts';
import { resolveRound, processEndOfRound, deployHexes } from '@/engine';
import { CONDITIONS, BATTLE_GRID } from '@/data/constants';
import { useSessionStore } from './sessionStore';
import { useRosterStore } from './rosterStore';
import { useUIStore } from './uiStore';
import { findNpcTemplate } from '@/data/npcTemplates';

/** Extra internal actions the network router calls (superset of the contract). */
export interface CombatStoreImpl extends CombatStore {
  applyRemoteDeclare: (combatantId: string, actions: DeclaredAction[]) => void;
  applyRemoteLock: (combatantId: string, locked: boolean) => void;
  appendLog: (entry: CombatLogEntry) => void;
  forceResolve: () => void;
  reset: () => void;
}

function emptyCombat(): CombatState {
  return {
    isActive: false,
    phase: 'setup',
    round: 0,
    combatants: [],
    declaredActions: {},
    lockedActions: {},
    resolutionQueue: [],
    activeResolutionIndex: -1,
    log: [],
  };
}

function logEntry(round: number, text: string, tone?: CombatLogEntry['tone']): CombatLogEntry {
  return { id: nanoid(8), round, text, tone, ts: Date.now() };
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const isGM = () => useSessionStore.getState().role === 'gm';

/** Push authoritative combat state to the network (GM → players). */
function broadcast(combat: CombatState) {
  if (isGM()) useSessionStore.getState().send({ type: 'combat_update', payload: { combat } });
}

/**
 * Assign starting hex positions to the incoming combatants. Combatants are
 * grouped by team; each team draws distinct deployment hexes from
 * {@link deployHexes} (players on the bottom rows, enemies on the top rows) and
 * the positions are written back in order. This fixes the default `{q:0,r:0}`
 * collision that occurs when combatants are created without an explicit hex.
 */
function placeCombatants(combatants: Combatant[]): Combatant[] {
  const byTeam: Record<Combatant['team'], Combatant[]> = { player: [], npc: [] };
  for (const c of combatants) byTeam[c.team].push(c);

  const positionFor = new Map<string, Combatant['position']>();
  (Object.keys(byTeam) as Combatant['team'][]).forEach((team) => {
    const team_members = byTeam[team];
    const hexes = deployHexes(team, team_members.length, BATTLE_GRID);
    team_members.forEach((c, i) => {
      const hex = hexes[i];
      if (hex) positionFor.set(c.id, hex);
    });
  });

  return combatants.map((c) => {
    const hex = positionFor.get(c.id);
    return hex ? { ...c, position: hex } : c;
  });
}

/** Resolve a combatant's source Character for skill scores during resolution. */
function buildCharLookup(): (c: Combatant) => Character | undefined {
  const party = useSessionStore.getState().party;
  const roster = useRosterStore.getState().characters;
  return (c) => {
    if (c.characterId) {
      const p = party.find((m) => m.character.id === c.characterId)?.character;
      if (p) return p;
      const r = roster.find((x) => x.id === c.characterId);
      if (r) return r;
      // Bestiary NPCs aren't in the party or roster; their instances carry
      // synthetic ids like "npc-goblin-thug#2". Strip the suffix and resolve
      // against the template registry so their abilities/weapon still apply.
      const baseId = c.characterId.split('#')[0];
      const template = findNpcTemplate(baseId);
      if (template) return template;
    }
    if (c.peerId) return party.find((m) => m.peerId === c.peerId)?.character;
    return undefined;
  };
}

export const useCombatStore = create<CombatStoreImpl>()((set, get) => ({
  combat: emptyCombat(),

  startCombat: (combatants) => {
    const placed = placeCombatants(combatants);
    const combat: CombatState = {
      ...emptyCombat(),
      isActive: true,
      phase: 'declare',
      round: 1,
      combatants: placed,
      log: [logEntry(1, '⚔️ Combat begins. Declare your actions.', 'beam')],
    };
    set({ combat });
    if (isGM()) useSessionStore.getState().send({ type: 'combat_start', payload: { combat } });
  },

  endCombat: () => {
    if (isGM()) useSessionStore.getState().send({ type: 'combat_end', payload: {} });
    // Reset synchronously so any in-flight resolveRound loop sees isActive=false and
    // aborts on its next tick (prevents combat "resurrecting" after End Combat).
    set({ combat: emptyCombat() });
  },

  declareAction: (combatantId, action) => {
    set((s) => {
      const existing = s.combat.declaredActions[combatantId] ?? [];
      const next = existing.filter((a) => a.actionIndex !== action.actionIndex);
      next.push(action);
      next.sort((a, b) => a.actionIndex - b.actionIndex);
      return {
        combat: { ...s.combat, declaredActions: { ...s.combat.declaredActions, [combatantId]: next } },
      };
    });
    const actions = get().combat.declaredActions[combatantId] ?? [];
    if (isGM()) broadcast(get().combat);
    else useSessionStore.getState().send({ type: 'declare_actions', payload: { combatantId, actions } });
  },

  clearAction: (combatantId, actionIndex) => {
    set((s) => {
      const existing = s.combat.declaredActions[combatantId] ?? [];
      return {
        combat: {
          ...s.combat,
          declaredActions: {
            ...s.combat.declaredActions,
            [combatantId]: existing.filter((a) => a.actionIndex !== actionIndex),
          },
        },
      };
    });
    const actions = get().combat.declaredActions[combatantId] ?? [];
    if (isGM()) broadcast(get().combat);
    else useSessionStore.getState().send({ type: 'declare_actions', payload: { combatantId, actions } });
  },

  lockActions: (combatantId, locked) => {
    set((s) => ({
      combat: { ...s.combat, lockedActions: { ...s.combat.lockedActions, [combatantId]: locked } },
    }));
    if (isGM()) broadcast(get().combat);
    else useSessionStore.getState().send({ type: 'lock_actions', payload: { combatantId, locked } });
  },

  allLocked: () => {
    const { combatants, lockedActions } = get().combat;
    const partyPeers = new Set(useSessionStore.getState().party.map((m) => m.peerId));
    // Only alive, conscious, still-connected combatants must lock in. An unconscious
    // player has no Lock button, and a disconnected player can't act — neither should
    // be able to permanently stall the round (they're handled during resolution).
    const mustLock = combatants.filter(
      (c) => !c.isDead && !c.isUnconscious && (c.peerId == null || partyPeers.has(c.peerId)),
    );
    return mustLock.length > 0 && mustLock.every((c) => lockedActions[c.id]);
  },

  /** Resolve regardless of locks — GM escape hatch if someone won't/can't lock. */
  forceResolve: () => {
    void get().resolveRound();
  },

  resolveRound: async () => {
    if (!isGM()) return;
    const state = get().combat;
    if (!state.isActive || state.phase === 'resolving') return;

    set((s) => ({ combat: { ...s.combat, phase: 'resolving' } }));
    const reduceMotion = useUIStore.getState().reduceMotion;
    const { steps, state: afterActions } = resolveRound(state, Math.random, {
      charLookup: buildCharLookup(),
    });

    // Animate playback step by step, broadcasting each snapshot.
    for (const step of steps) {
      // Bail if combat was ended/reset during the await — don't resurrect it.
      if (!get().combat.isActive) return;
      const stamped = step.log.map((l) => ({ ...l, ts: Date.now() }));
      set((s) => ({
        combat: { ...step.snapshot, phase: 'resolving', log: [...s.combat.log, ...stamped] },
      }));
      broadcast(get().combat);
      await delay(reduceMotion ? 180 : 1050);
    }

    if (!get().combat.isActive) return;

    // Settle the round: tick durations, advance round, clear declarations.
    const accumulatedLog = get().combat.log;
    const settled = processEndOfRound({ ...afterActions, log: accumulatedLog });
    const nextRoundLog = [...settled.log, logEntry(settled.round, `— Round ${settled.round} —`, 'arcane')];
    set({
      combat: {
        ...settled,
        phase: 'declare',
        declaredActions: {},
        lockedActions: {},
        resolutionQueue: [],
        activeResolutionIndex: -1,
        log: nextRoundLog,
      },
    });
    broadcast(get().combat);
  },

  adjustResource: (combatantId, resource, delta) => {
    if (get().combat.phase === 'resolving') return;
    // Reject NaN/Infinity — a non-finite delta would poison currentHP irreversibly.
    const d = Number.isFinite(delta) ? Math.trunc(delta) : 0;
    if (d === 0) return;
    set((s) => ({
      combat: {
        ...s.combat,
        combatants: s.combat.combatants.map((c) => {
          if (c.id !== combatantId) return c;
          const key = resource === 'HP' ? 'currentHP' : resource === 'MP' ? 'currentMP' : 'currentSP';
          const maxKey = resource === 'HP' ? 'maxHP' : resource === 'MP' ? 'maxMP' : 'maxSP';
          const next = Math.max(0, Math.min(c[maxKey], c[key] + d));
          const updated: Combatant = { ...c, [key]: next } as Combatant;
          if (resource === 'HP') updated.isUnconscious = next <= 0 && !updated.isDead;
          return updated;
        }),
      },
    }));
    if (isGM()) {
      const c = get().combat.combatants.find((x) => x.id === combatantId);
      get().appendLog(
        logEntry(
          get().combat.round,
          `${c?.name ?? 'Someone'} ${d >= 0 ? 'gains' : 'loses'} ${Math.abs(d)} ${resource}.`,
          d >= 0 ? 'success' : 'danger',
        ),
      );
      broadcast(get().combat);
    } else {
      useSessionStore.getState().send({ type: 'resource_change', payload: { combatantId, resource, delta: d } });
    }
  },

  applyRest: (kind, combatantId) => {
    if (get().combat.phase === 'resolving') return;
    if (!isGM()) {
      useSessionStore.getState().send({ type: 'rest', payload: { kind, combatantId } });
      return;
    }
    set((s) => ({
      combat: {
        ...s.combat,
        combatants: s.combat.combatants.map((c) => {
          if (combatantId && c.id !== combatantId) return c;
          if (!combatantId && c.team !== 'player') return c;
          if (kind === 'long') {
            return { ...c, currentHP: c.maxHP, currentMP: c.maxMP, currentSP: c.maxSP, isUnconscious: false };
          }
          return {
            ...c,
            currentMP: Math.min(c.maxMP, c.currentMP + Math.ceil(c.maxMP * 0.5)),
            currentSP: Math.min(c.maxSP, c.currentSP + Math.ceil(c.maxSP * 0.5)),
          };
        }),
      },
    }));
    get().appendLog(logEntry(get().combat.round, `🌙 The party takes a ${kind} rest.`, 'arcane'));
    broadcast(get().combat);
  },

  toggleCondition: (combatantId, conditionKey) => {
    if (!isGM() || get().combat.phase === 'resolving') return;
    const def = CONDITIONS.find((c) => c.key === conditionKey);
    set((s) => ({
      combat: {
        ...s.combat,
        combatants: s.combat.combatants.map((c) => {
          if (c.id !== combatantId) return c;
          const has = c.statusEffects.some((e) => e.data?.conditionKey === conditionKey);
          const statusEffects = has
            ? c.statusEffects.filter((e) => e.data?.conditionKey !== conditionKey)
            : [
                ...c.statusEffects,
                {
                  id: nanoid(8),
                  label: def?.label ?? conditionKey,
                  type: 'Condition',
                  tone: def?.tone ?? 'neutral',
                  durationType: 'Permanent' as const,
                  data: { conditionKey },
                },
              ];
          return { ...c, statusEffects };
        }),
      },
    }));
    broadcast(get().combat);
  },

  ingest: (combat) => set({ combat }),

  // --- network-router entry points (GM side) ---
  applyRemoteDeclare: (combatantId, actions) => {
    if (get().combat.phase === 'resolving') return;
    set((s) => ({
      combat: { ...s.combat, declaredActions: { ...s.combat.declaredActions, [combatantId]: actions } },
    }));
    broadcast(get().combat);
  },

  applyRemoteLock: (combatantId, locked) => {
    if (get().combat.phase === 'resolving') return;
    set((s) => ({
      combat: { ...s.combat, lockedActions: { ...s.combat.lockedActions, [combatantId]: locked } },
    }));
    broadcast(get().combat);
  },

  appendLog: (entry) => set((s) => ({ combat: { ...s.combat, log: [...s.combat.log, entry].slice(-200) } })),

  reset: () => set({ combat: emptyCombat() }),
}));
