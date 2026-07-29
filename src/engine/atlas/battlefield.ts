/**
 * Turning a place into a place you can fight in.
 *
 * This is the battle handoff: a pure function from a seed and an archetype to
 * the exact JSON-safe {@link Battlefield} the combat engine, the normalizer, and
 * the board already consume. Nothing about combat has to change to accept a
 * generated arena — the atlas does not *point at* a battlefield, it compiles
 * one.
 *
 * Three archetypes, each with a different failure mode to design against:
 *
 * - **interior** — rooms and doors. Subdivision runs on the *offset* rectangle,
 *   not on axial coordinates: axial space is sheared, so splitting there yields
 *   parallelograms rather than rooms.
 * - **cave** — cellular automata. The canonical "4-5 rule" is tuned for the 8
 *   neighbours of a square grid and does **not** transfer; on six neighbours it
 *   produces either mush or solid rock. B4/S4 at 45% fill is the hex equivalent.
 * - **open** — scattered cover. Obstacles are placed with a minimum separation
 *   of 2, which makes the map connected *by construction*: no two obstacles are
 *   adjacent, so each is an isolated cell whose six neighbours form a connected
 *   ring, and removing it cannot disconnect anything.
 *
 * Every archetype ends with a reachability sweep, because "the generator made
 * an unreachable pocket" is a bug the players discover, not the author.
 */
import type { Battlefield, DoorState, GridDims, HexCoord } from '@/types';
import { HEX_DIRECTIONS, edgeId, hexKey, inBounds, gridHexes } from '../hex';
import { deriveSeed, randInt, rngFor, shuffled, type Seed } from './rand';
import type { Rng } from '../dice';

export type ArenaArchetype = 'interior' | 'cave' | 'open';

export interface CompileBattlefieldOptions {
  seed: Seed;
  archetype: ArenaArchetype;
  /** Arena extent. Defaults are chosen per archetype (see {@link DEFAULT_DIMS}). */
  dims?: GridDims;
  /** Human-readable origin, surfaced in the combat log. */
  label?: string;
  /** Provenance, when this came from an atlas. */
  origin?: Battlefield['origin'];
}

/**
 * Default extents, sized against `MOVE_RANGE = 6` and the range bands.
 *
 * The rule of thumb the numbers support is *mean pairwise distance ≤ your
 * longest range band* — otherwise the average pair of combatants cannot engage
 * without spending a turn walking, and the outer thirds of the board are dead
 * space.
 */
export const DEFAULT_DIMS: Record<ArenaArchetype, GridDims> = {
  interior: { cols: 12, rows: 10 },
  cave: { cols: 14, rows: 12 },
  open: { cols: 16, rows: 12 },
};

// --- offset <-> axial (odd-r), mirroring src/engine/hex.ts ------------------
const toAxial = (col: number, row: number): HexCoord => ({
  q: col - ((row - (row & 1)) >> 1),
  r: row,
});

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Recursive binary subdivision of an offset rectangle into room-sized leaves. */
function bspLeaves(rng: Rng, rect: Rect, min: number, depth: number): Rect[] {
  const canSplitH = rect.h >= min * 2 + 1;
  const canSplitV = rect.w >= min * 2 + 1;
  if (depth <= 0 || (!canSplitH && !canSplitV)) return [rect];
  // Split the longer axis, so rooms stay roughly square rather than becoming
  // corridors by accident.
  const horizontal = canSplitH && (!canSplitV || rect.h > rect.w || rng() < 0.5);
  if (horizontal) {
    const cut = randInt(rng, min, rect.h - min - 1);
    return [
      ...bspLeaves(rng, { ...rect, h: cut }, min, depth - 1),
      ...bspLeaves(rng, { ...rect, y: rect.y + cut, h: rect.h - cut }, min, depth - 1),
    ];
  }
  const cut = randInt(rng, min, rect.w - min - 1);
  return [
    ...bspLeaves(rng, { ...rect, w: cut }, min, depth - 1),
    ...bspLeaves(rng, { ...rect, x: rect.x + cut, w: rect.w - cut }, min, depth - 1),
  ];
}

/** Minimal union-find, for the spanning tree that guarantees every room connects. */
function makeUnionFind(n: number) {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  return {
    find,
    union(a: number, b: number): boolean {
      const ra = find(a);
      const rb = find(b);
      if (ra === rb) return false;
      parent[ra] = rb;
      return true;
    },
  };
}

/** Every ordered pair of in-bounds adjacent hexes, each border visited once. */
function borders(dims: GridDims): { a: HexCoord; b: HexCoord; dir: number }[] {
  const out: { a: HexCoord; b: HexCoord; dir: number }[] = [];
  for (const a of gridHexes(dims)) {
    // Directions 0..2 only: each hex owns three of its six borders, so walking
    // just those visits every border in the grid exactly once.
    for (let d = 0; d < 3; d += 1) {
      const b = { q: a.q + HEX_DIRECTIONS[d].q, r: a.r + HEX_DIRECTIONS[d].r };
      if (inBounds(b, dims)) out.push({ a, b, dir: d });
    }
  }
  return out;
}

/**
 * Hexes reachable from `start`, honouring walls, doors, and solid cells.
 * Used to prove the generated arena has no isolated pockets.
 */
export function reachableFrom(start: HexCoord, field: Battlefield): Set<string> {
  const walls = new Set(field.walls ?? []);
  const doors = new Map(Object.entries(field.doors ?? {}).map(([k, v]) => [Number(k), v]));
  const solid = new Set(field.solid ?? []);
  const seen = new Set<string>([hexKey(start)]);
  const queue: HexCoord[] = [start];
  while (queue.length) {
    const c = queue.pop()!;
    for (let d = 0; d < 6; d += 1) {
      const id = edgeId(c, d);
      if (walls.has(id)) continue;
      const door = doors.get(id);
      if (door !== undefined && door !== 'open') continue;
      const n = { q: c.q + HEX_DIRECTIONS[d].q, r: c.r + HEX_DIRECTIONS[d].r };
      const k = hexKey(n);
      if (seen.has(k) || !inBounds(n, dims_(field)) || solid.has(k)) continue;
      seen.add(k);
      queue.push(n);
    }
  }
  return seen;
}

const dims_ = (f: Battlefield): GridDims => f.dims;

/** The open hexes of an arena, in row-major order. */
function openHexes(field: Battlefield): HexCoord[] {
  const solid = new Set(field.solid ?? []);
  return gridHexes(field.dims).filter((h) => !solid.has(hexKey(h)));
}

/**
 * Pick two deployment zones as far apart as the arena allows, drawn only from
 * hexes that are actually connected to each other.
 *
 * Generated over geometric ends: on an irregular cave the two ends of the
 * bounding box may both be solid rock, and the classic midline rows may lie
 * inside a wall.
 */
function deployZones(field: Battlefield, want: number): Battlefield['zones'] {
  const open = openHexes(field);
  if (open.length === 0) return undefined;
  const main = reachableFrom(open[0], field);
  const usable = open.filter((h) => main.has(hexKey(h)));
  if (usable.length < 2) return undefined;

  // Two extremes along opposite diagonals — cheap, and robust to odd shapes.
  const score = (h: HexCoord) => h.q + h.r * 0.5;
  const sorted = usable.slice().sort((a, b) => score(a) - score(b));
  const npc = sorted.slice(0, want);
  const player = sorted.slice(-want).reverse();
  return { player, npc };
}

// ---------------------------------------------------------------------------
// Archetypes
// ---------------------------------------------------------------------------

function compileInterior(rng: Rng, dims: GridDims): { walls: number[]; doors: Record<string, DoorState> } {
  const leaves = bspLeaves(rng, { x: 0, y: 0, w: dims.cols, h: dims.rows }, 3, 3);

  // Which room owns each hex.
  const roomOf = new Map<string, number>();
  leaves.forEach((rect, i) => {
    for (let row = rect.y; row < rect.y + rect.h; row += 1) {
      for (let col = rect.x; col < rect.x + rect.w; col += 1) {
        roomOf.set(hexKey(toAxial(col, row)), i);
      }
    }
  });

  // Every border between two rooms is a wall, and a candidate doorway.
  const walls = new Set<number>();
  const candidates = new Map<string, number[]>();
  for (const { a, b, dir } of borders(dims)) {
    const ra = roomOf.get(hexKey(a));
    const rb = roomOf.get(hexKey(b));
    if (ra === undefined || rb === undefined || ra === rb) continue;
    const id = edgeId(a, dir);
    walls.add(id);
    const pair = ra < rb ? `${ra}-${rb}` : `${rb}-${ra}`;
    const list = candidates.get(pair);
    if (list) list.push(id);
    else candidates.set(pair, [id]);
  }

  // A spanning tree over the rooms guarantees every room is reachable; the
  // extra edges matter for play rather than topology, because a pure tree gives
  // every room exactly one approach and combat degenerates into a queue.
  const uf = makeUnionFind(leaves.length);
  const doors: Record<string, DoorState> = {};
  const leftovers: number[][] = [];
  for (const pair of shuffled(rng, [...candidates.keys()])) {
    const [ra, rb] = pair.split('-').map(Number);
    const edges = candidates.get(pair)!;
    if (uf.union(ra, rb)) {
      const id = edges[Math.floor(rng() * edges.length)];
      walls.delete(id);
      doors[String(id)] = rng() < 0.25 ? 'closed' : 'open';
    } else {
      leftovers.push(edges);
    }
  }
  // At least one loop whenever the layout admits one — a spanning tree alone
  // gives every room exactly one approach, and the fight becomes a queue.
  const extra = leftovers.length > 0 ? Math.max(1, Math.round(leftovers.length * 0.25)) : 0;
  for (const edges of shuffled(rng, leftovers).slice(0, extra)) {
    const id = edges[Math.floor(rng() * edges.length)];
    walls.delete(id);
    doors[String(id)] = 'open';
  }

  return { walls: [...walls], doors };
}

/** Cellular-automata caves, tuned for six neighbours rather than eight. */
function compileCave(rng: Rng, dims: GridDims): string[] {
  const all = gridHexes(dims);
  const edgeRow = (h: HexCoord) => {
    // Force the rim solid so the cave has a boundary rather than an open edge.
    const { r } = h;
    return r === 0 || r === dims.rows - 1;
  };
  let solid = new Set<string>();
  for (const h of all) {
    if (edgeRow(h) || rng() < 0.45) solid.add(hexKey(h));
  }
  // B4/S4: a wall is born at 4+ solid neighbours and survives at 4+. The square
  // grid's B5/S4 leaves ~75% open here; B3/S3 leaves ~5%.
  for (let step = 0; step < 4; step += 1) {
    const next = new Set<string>();
    for (const h of all) {
      let n = 0;
      for (let d = 0; d < 6; d += 1) {
        const nb = { q: h.q + HEX_DIRECTIONS[d].q, r: h.r + HEX_DIRECTIONS[d].r };
        if (!inBounds(nb, dims) || solid.has(hexKey(nb))) n += 1;
      }
      const k = hexKey(h);
      if (edgeRow(h)) next.add(k);
      else if (solid.has(k) ? n >= 4 : n >= 4) next.add(k);
    }
    solid = next;
  }
  return [...solid];
}

/**
 * Blue-noise obstacle scatter. Mitchell's best-candidate rather than a full
 * Poisson-disc sampler: no spatial grid needed, and at a few hundred cells the
 * quadratic distance check is free.
 */
function compileOpen(rng: Rng, dims: GridDims): string[] {
  const all = gridHexes(dims);
  const chosen: HexCoord[] = [];
  const blocked = new Set<string>();
  const target = Math.floor(all.length * 0.12);
  for (const h of shuffled(rng, all)) {
    if (chosen.length >= target) break;
    if (blocked.has(hexKey(h))) continue;
    chosen.push(h);
    // Minimum separation of 2: no two obstacles adjacent, which is what makes
    // an isolated pocket impossible rather than merely unlikely.
    blocked.add(hexKey(h));
    for (let d = 0; d < 6; d += 1) {
      blocked.add(hexKey({ q: h.q + HEX_DIRECTIONS[d].q, r: h.r + HEX_DIRECTIONS[d].r }));
    }
  }
  return chosen.map(hexKey);
}

// ---------------------------------------------------------------------------

/**
 * Compile a place into an arena.
 *
 * Deterministic: the same options always produce the same battlefield, on every
 * peer, forever. The result is transmitted rather than regenerated remotely —
 * transcendental functions are not required to be bit-identical across
 * JavaScript engines, so shipping the compiled arena keeps any drift cosmetic
 * instead of turning it into a movement desync.
 */
export function compileBattlefield(opts: CompileBattlefieldOptions): Battlefield {
  const dims = opts.dims ?? DEFAULT_DIMS[opts.archetype];
  const rng = rngFor(deriveSeed(opts.seed, 'arena', opts.archetype));

  let field: Battlefield = { dims };
  if (opts.archetype === 'interior') {
    const { walls, doors } = compileInterior(rng, dims);
    field = { dims, walls, doors };
  } else if (opts.archetype === 'cave') {
    field = { dims, solid: compileCave(rng, dims) };
  } else {
    field = { dims, solid: compileOpen(rng, dims) };
  }

  // Prune anything the arena's main body can't reach. A cave in particular can
  // carve a sealed bubble, and a pocket nobody can enter reads as a bug.
  const open = openHexes(field);
  if (open.length > 0) {
    let best = new Set<string>();
    const visited = new Set<string>();
    for (const h of open) {
      if (visited.has(hexKey(h))) continue;
      const region = reachableFrom(h, field);
      for (const k of region) visited.add(k);
      if (region.size > best.size) best = region;
    }
    const stranded = open.filter((h) => !best.has(hexKey(h))).map(hexKey);
    if (stranded.length > 0) {
      field = { ...field, solid: [...(field.solid ?? []), ...stranded] };
    }
  }

  const zones = deployZones(field, 6);
  return {
    ...field,
    ...(zones ? { zones } : {}),
    ...(opts.label ? { label: opts.label } : {}),
    ...(opts.origin ? { origin: opts.origin } : {}),
  };
}
