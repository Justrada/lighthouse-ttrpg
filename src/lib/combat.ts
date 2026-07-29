import type { Battlefield, CombatPhase, CombatState, DoorState, HexCoord } from '@/types';
import { EDGE_COORD_LIMIT } from '@/engine';

const PHASES: CombatPhase[] = ['setup', 'declare', 'resolving', 'between', 'ended'];

/** Largest arena we will render or path over. A board bigger than this would
 *  hang the client long before it was playable, so a wire value claiming
 *  100000×100000 is clamped rather than trusted. */
const MAX_GRID_SIDE = 200;
/** Caps on structure, generous for any hand-authored or generated interior. */
const MAX_WALLS = 20_000;
const MAX_SOLID = 20_000;
const MAX_ZONE = 200;

const DOOR_STATES: DoorState[] = ['open', 'closed', 'locked'];

const clampSide = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v)
    ? Math.min(MAX_GRID_SIDE, Math.max(1, Math.floor(v)))
    : fallback;

function cleanHexes(v: unknown): HexCoord[] {
  if (!Array.isArray(v)) return [];
  const out: HexCoord[] = [];
  for (const h of v.slice(0, MAX_ZONE)) {
    if (!h || typeof h !== 'object') continue;
    const { q, r } = h as HexCoord;
    if (!Number.isFinite(q) || !Number.isFinite(r)) continue;
    if (Math.abs(q) > EDGE_COORD_LIMIT || Math.abs(r) > EDGE_COORD_LIMIT) continue;
    out.push({ q: Math.trunc(q), r: Math.trunc(r) });
  }
  return out;
}

/**
 * Coerce an untrusted {@link Battlefield} into something safe to path over.
 *
 * The danger here isn't malice so much as arithmetic: `dims` feeds `gridHexes`
 * and the board renderer, so an absurd value would allocate until the tab dies.
 * Wall ids that don't correspond to any real border are harmless — they simply
 * never match — so they only need to be finite integers.
 */
export function normalizeBattlefield(raw: unknown): Battlefield | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Partial<Battlefield>;
  const dims = {
    cols: clampSide(r.dims?.cols, 1),
    rows: clampSide(r.dims?.rows, 1),
  };

  const walls = Array.isArray(r.walls)
    ? r.walls.slice(0, MAX_WALLS).filter((w): w is number => Number.isSafeInteger(w))
    : undefined;

  let doors: Record<string, DoorState> | undefined;
  if (r.doors && typeof r.doors === 'object' && !Array.isArray(r.doors)) {
    doors = {};
    for (const [k, v] of Object.entries(r.doors).slice(0, MAX_WALLS)) {
      if (Number.isSafeInteger(Number(k)) && DOOR_STATES.includes(v as DoorState)) {
        doors[k] = v as DoorState;
      }
    }
  }

  const solid = Array.isArray(r.solid)
    ? r.solid.slice(0, MAX_SOLID).filter((s): s is string => typeof s === 'string')
    : undefined;

  const zones = r.zones
    ? { player: cleanHexes(r.zones.player), npc: cleanHexes(r.zones.npc) }
    : undefined;

  return {
    dims,
    ...(walls?.length ? { walls } : {}),
    ...(doors && Object.keys(doors).length ? { doors } : {}),
    ...(solid?.length ? { solid } : {}),
    ...(zones ? { zones } : {}),
    ...(typeof r.label === 'string' && r.label.trim() ? { label: r.label.slice(0, 120) } : {}),
  };
}

/**
 * Coerce an untrusted combat snapshot (received from the GM over the wire) into a
 * structurally-valid {@link CombatState}. Players apply host snapshots wholesale,
 * so a malformed payload — missing `combatants`, a bad `phase`, etc. — would
 * otherwise crash every selector that does `combat.combatants.filter(...)`. This
 * guards the top-level shape; combatant interiors are trusted as the GM is
 * authoritative.
 */
export function normalizeCombatState(raw: unknown): CombatState {
  const r = (raw ?? {}) as Partial<CombatState>;
  const obj = <T>(v: unknown, fallback: T): T =>
    v && typeof v === 'object' && !Array.isArray(v) ? (v as T) : fallback;

  return {
    isActive: Boolean(r.isActive),
    phase: PHASES.includes(r.phase as CombatPhase) ? (r.phase as CombatPhase) : 'declare',
    round: Number.isFinite(r.round as number) ? (r.round as number) : 1,
    ...(r.battlefield ? { battlefield: normalizeBattlefield(r.battlefield) } : {}),
    // Keep only real combatant objects — a null/garbage entry from the wire would
    // crash every selector that reads `.team`/`.peerId`/`.position` off each one.
    combatants: Array.isArray(r.combatants)
      ? r.combatants.filter((c) => !!c && typeof c === 'object')
      : [],
    declaredActions: obj(r.declaredActions, {}),
    lockedActions: obj(r.lockedActions, {}),
    resolutionQueue: Array.isArray(r.resolutionQueue) ? r.resolutionQueue : [],
    activeResolutionIndex: Number.isFinite(r.activeResolutionIndex as number)
      ? (r.activeResolutionIndex as number)
      : -1,
    log: Array.isArray(r.log) ? r.log : [],
  };
}
