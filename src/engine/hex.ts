/**
 * Pure axial-hex math for the battlefield (pointy-top orientation).
 *
 * Coordinates are axial `{q, r}`. All functions here are pure and deterministic;
 * they back both the engine's positioning rules and the isometric board's layout.
 */
import type { HexCoord } from '@/types';

export interface GridDims {
  cols: number;
  rows: number;
}

export const hexKey = (c: HexCoord): string => `${c.q},${c.r}`;
export const hexEquals = (a: HexCoord, b: HexCoord): boolean => a.q === b.q && a.r === b.r;

/** The six axial neighbor directions (pointy-top). */
export const HEX_DIRECTIONS: readonly HexCoord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function hexNeighbors(c: HexCoord): HexCoord[] {
  return HEX_DIRECTIONS.map((d) => ({ q: c.q + d.q, r: c.r + d.r }));
}

/** Number of single-step moves between two hexes. */
export function hexDistance(a: HexCoord, b: HexCoord): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
}

/** Every hex within `radius` steps of `center` (inclusive). */
export function hexesInRange(center: HexCoord, radius: number): HexCoord[] {
  const out: HexCoord[] = [];
  for (let dq = -radius; dq <= radius; dq += 1) {
    const lo = Math.max(-radius, -dq - radius);
    const hi = Math.min(radius, -dq + radius);
    for (let dr = lo; dr <= hi; dr += 1) {
      out.push({ q: center.q + dq, r: center.r + dr });
    }
  }
  return out;
}

// --- cube helpers for rounding + line drawing ---
function cubeRound(x: number, y: number, z: number): HexCoord {
  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);
  const dx = Math.abs(rx - x);
  const dy = Math.abs(ry - y);
  const dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return { q: rx, r: rz };
}

/** Hexes along the straight line from `a` to `b` (inclusive of both). */
export function hexLineDraw(a: HexCoord, b: HexCoord): HexCoord[] {
  const n = hexDistance(a, b);
  if (n === 0) return [{ ...a }];
  const ax = a.q;
  const az = a.r;
  const ay = -a.q - a.r;
  const bx = b.q;
  const bz = b.r;
  const by = -b.q - b.r;
  const out: HexCoord[] = [];
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    out.push(cubeRound(ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t));
  }
  return out;
}

/** Neighbor of `from` that gets closest to `to`. */
export function stepToward(from: HexCoord, to: HexCoord): HexCoord {
  let best = from;
  let bestD = Infinity;
  for (const n of hexNeighbors(from)) {
    const d = hexDistance(n, to);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

/** Neighbor of `from` that gets furthest from `away`. */
export function stepAway(from: HexCoord, away: HexCoord): HexCoord {
  let best = from;
  let bestD = -Infinity;
  for (const n of hexNeighbors(from)) {
    const d = hexDistance(n, away);
    if (d > bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

// --- grid (offset-rectangular, odd-r pointy-top) ---
function offsetToAxial(col: number, row: number): HexCoord {
  return { q: col - ((row - (row & 1)) >> 1), r: row };
}
function axialToOffset(c: HexCoord): { col: number; row: number } {
  return { col: c.q + ((c.r - (c.r & 1)) >> 1), row: c.r };
}

export function inBounds(c: HexCoord, dims: GridDims): boolean {
  const { col, row } = axialToOffset(c);
  return row >= 0 && row < dims.rows && col >= 0 && col < dims.cols;
}

/** All hexes of the rectangular battlefield, row-major. */
export function gridHexes(dims: GridDims): HexCoord[] {
  const out: HexCoord[] = [];
  for (let row = 0; row < dims.rows; row += 1) {
    for (let col = 0; col < dims.cols; col += 1) {
      out.push(offsetToAxial(col, row));
    }
  }
  return out;
}

/**
 * Distinct starting hexes for a team, centered horizontally and placed a few rows
 * to either side of the midline (players below, enemies above) — leaving an open
 * gap between the lines instead of pinning them to the back rows. The GM can drag
 * everyone elsewhere during the setup phase. Returns exactly `count` hexes.
 */
export function deployHexes(team: 'player' | 'npc', count: number, dims: GridDims): HexCoord[] {
  const mid = Math.floor(dims.rows / 2);
  // Two-row gap around the midline; rows fan outward from there if more are needed.
  const rows =
    team === 'player'
      ? [mid + 2, mid + 3, mid + 4, mid + 1].filter((r) => r < dims.rows)
      : [mid - 2, mid - 3, mid - 4, mid - 1].filter((r) => r >= 0);
  const out: HexCoord[] = [];
  for (const row of rows) {
    if (out.length >= count) break;
    const need = Math.min(count - out.length, dims.cols);
    const start = Math.max(0, Math.floor((dims.cols - need) / 2));
    for (let i = 0; i < need; i += 1) out.push(offsetToAxial(start + i, row));
  }
  return out.slice(0, count);
}

/** Pointy-top axial → 2D pixel center (the flat layout the isometric view tilts). */
export function hexToPixel(c: HexCoord, size: number): { x: number; y: number } {
  return {
    x: size * Math.sqrt(3) * (c.q + c.r / 2),
    y: size * 1.5 * c.r,
  };
}

/**
 * Open hexes reachable from `from` within `maxSteps`, respecting grid bounds and
 * a `blocked` predicate (e.g. hexes occupied by other combatants). Excludes
 * `from` itself.
 */
export function reachableHexes(
  from: HexCoord,
  maxSteps: number,
  blocked: (c: HexCoord) => boolean,
  dims: GridDims,
): HexCoord[] {
  const seen = new Set<string>([hexKey(from)]);
  const out: HexCoord[] = [];
  let frontier: HexCoord[] = [from];
  for (let step = 0; step < maxSteps; step += 1) {
    const next: HexCoord[] = [];
    for (const c of frontier) {
      for (const n of hexNeighbors(c)) {
        const k = hexKey(n);
        if (seen.has(k) || !inBounds(n, dims) || blocked(n)) continue;
        seen.add(k);
        out.push(n);
        next.push(n);
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }
  return out;
}

/**
 * The reachable hex (within `maxSteps`) closest to `goal` — the destination for
 * a move toward a target that may be further than the move allowance.
 */
export function closestReachableTo(
  from: HexCoord,
  goal: HexCoord,
  maxSteps: number,
  blocked: (c: HexCoord) => boolean,
  dims: GridDims,
): HexCoord {
  let best = from;
  let bestD = hexDistance(from, goal);
  for (const c of reachableHexes(from, maxSteps, blocked, dims)) {
    const d = hexDistance(c, goal);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}
