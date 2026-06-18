import { describe, it, expect } from 'vitest';
import type { HexCoord } from '@/types';
import {
  hexDistance,
  hexNeighbors,
  hexEquals,
  hexKey,
  hexesInRange,
  hexLineDraw,
  reachableHexes,
  closestReachableTo,
  inBounds,
  deployHexes,
  type GridDims,
} from './hex';

const GRID: GridDims = { cols: 9, rows: 7 };

/** Convert a hex list to a sorted set of keys for order-independent comparison. */
const keys = (hexes: HexCoord[]): string[] => hexes.map(hexKey).sort();

describe('hexDistance', () => {
  it('is zero to itself and grows by one per step', () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 0, r: 0 })).toBe(0);
    expect(hexDistance({ q: 0, r: 0 }, { q: 1, r: 0 })).toBe(1);
    expect(hexDistance({ q: 0, r: 0 }, { q: 2, r: 0 })).toBe(2);
    expect(hexDistance({ q: 0, r: 0 }, { q: 4, r: 0 })).toBe(4);
  });

  it('is symmetric and counts diagonals correctly', () => {
    const a = { q: 1, r: -1 };
    const b = { q: -2, r: 2 };
    expect(hexDistance(a, b)).toBe(hexDistance(b, a));
    // moving along the {-1,+1} diagonal is a single step per hex
    expect(hexDistance({ q: 0, r: 0 }, { q: -3, r: 3 })).toBe(3);
  });

  it('every direct neighbor is exactly distance 1', () => {
    const center = { q: 2, r: 2 };
    for (const n of hexNeighbors(center)) {
      expect(hexDistance(center, n)).toBe(1);
    }
  });
});

describe('hexNeighbors', () => {
  it('returns six distinct adjacent hexes', () => {
    const center = { q: 0, r: 0 };
    const ns = hexNeighbors(center);
    expect(ns).toHaveLength(6);
    expect(new Set(ns.map(hexKey)).size).toBe(6);
    expect(ns.some((n) => hexEquals(n, center))).toBe(false);
  });
});

describe('hexesInRange', () => {
  it('radius 0 is just the center', () => {
    const out = hexesInRange({ q: 3, r: 3 }, 0);
    expect(out).toHaveLength(1);
    expect(hexEquals(out[0], { q: 3, r: 3 })).toBe(true);
  });

  it('counts follow the centered-hexagonal numbers (1, 7, 19)', () => {
    // |range r| = 1 + 3*r*(r+1)
    expect(hexesInRange({ q: 0, r: 0 }, 1)).toHaveLength(7);
    expect(hexesInRange({ q: 0, r: 0 }, 2)).toHaveLength(19);
    expect(hexesInRange({ q: 0, r: 0 }, 3)).toHaveLength(37);
  });

  it('contains exactly the hexes within the radius', () => {
    const center = { q: 0, r: 0 };
    const out = hexesInRange(center, 2);
    for (const h of out) expect(hexDistance(center, h)).toBeLessThanOrEqual(2);
    // and includes a known edge hex
    expect(out.some((h) => hexEquals(h, { q: 2, r: 0 }))).toBe(true);
  });
});

describe('hexLineDraw', () => {
  it('a zero-length line is the single shared hex', () => {
    const out = hexLineDraw({ q: 2, r: 2 }, { q: 2, r: 2 });
    expect(out).toHaveLength(1);
    expect(hexEquals(out[0], { q: 2, r: 2 })).toBe(true);
  });

  it('includes both endpoints and has length distance + 1', () => {
    const a = { q: 0, r: 0 };
    const b = { q: 4, r: 0 };
    const out = hexLineDraw(a, b);
    expect(out).toHaveLength(hexDistance(a, b) + 1);
    expect(hexEquals(out[0], a)).toBe(true);
    expect(hexEquals(out[out.length - 1], b)).toBe(true);
  });

  it('steps one hex at a time with no gaps', () => {
    const out = hexLineDraw({ q: 0, r: 0 }, { q: 3, r: -2 });
    for (let i = 1; i < out.length; i += 1) {
      expect(hexDistance(out[i - 1], out[i])).toBe(1);
    }
  });
});

describe('inBounds', () => {
  it('accepts the corners of the deploy zones and rejects neighbors past the edge', () => {
    expect(inBounds({ q: 0, r: 0 }, GRID)).toBe(true);
    expect(inBounds({ q: 8, r: 0 }, GRID)).toBe(true);
    expect(inBounds({ q: 0, r: 6 }, GRID)).toBe(true);
    expect(inBounds({ q: -1, r: 0 }, GRID)).toBe(false);
    expect(inBounds({ q: 9, r: 0 }, GRID)).toBe(false);
    expect(inBounds({ q: 0, r: 7 }, GRID)).toBe(false);
    expect(inBounds({ q: 0, r: -1 }, GRID)).toBe(false);
  });
});

describe('reachableHexes', () => {
  const open = () => false;

  it('reaches exactly the open hexes within the step budget, excluding the origin', () => {
    const from = { q: 4, r: 3 }; // interior, clear of all edges
    const out = reachableHexes(from, 2, open, GRID);
    expect(out.some((h) => hexEquals(h, from))).toBe(false);
    for (const h of out) {
      expect(hexDistance(from, h)).toBeLessThanOrEqual(2);
      expect(inBounds(h, GRID)).toBe(true);
    }
    // interior with no blocks: full radius-2 ring minus the origin = 18
    expect(out).toHaveLength(hexesInRange(from, 2).length - 1);
  });

  it('never returns out-of-bounds hexes', () => {
    const corner = { q: 0, r: 0 };
    const out = reachableHexes(corner, 3, open, GRID);
    for (const h of out) expect(inBounds(h, GRID)).toBe(true);
  });

  it('respects the blocked predicate (a wall cannot be entered or passed)', () => {
    const from = { q: 0, r: 0 };
    // Block the only two cells adjacent to the corner: {1,0} and {0,1}.
    const wall = new Set([hexKey({ q: 1, r: 0 }), hexKey({ q: 0, r: 1 })]);
    const blocked = (h: HexCoord) => wall.has(hexKey(h));
    const out = reachableHexes(from, 5, blocked, GRID);
    // Both walls are excluded...
    expect(out.some((h) => hexEquals(h, { q: 1, r: 0 }))).toBe(false);
    expect(out.some((h) => hexEquals(h, { q: 0, r: 1 }))).toBe(false);
    // ...and with the corner sealed off, nothing is reachable.
    expect(out).toHaveLength(0);
  });

  it('honors the step budget (1 step = only the immediate neighbors)', () => {
    const from = { q: 4, r: 3 };
    const out = reachableHexes(from, 1, open, GRID);
    expect(out).toHaveLength(6);
    for (const h of out) expect(hexDistance(from, h)).toBe(1);
  });
});

describe('closestReachableTo', () => {
  const open = () => false;

  it('walks all the way to a goal within reach', () => {
    const from = { q: 2, r: 3 };
    const goal = { q: 5, r: 3 }; // distance 3
    const dest = closestReachableTo(from, goal, 4, open, GRID);
    expect(hexEquals(dest, goal)).toBe(true);
  });

  it('stops at the nearest reachable hex when the goal is too far', () => {
    const from = { q: 1, r: 3 };
    const goal = { q: 8, r: 3 }; // distance 7, budget 4
    const dest = closestReachableTo(from, goal, 4, open, GRID);
    expect(hexDistance(from, dest)).toBeLessThanOrEqual(4);
    expect(hexDistance(dest, goal)).toBe(hexDistance(from, goal) - 4);
  });

  it('routes around a blocker rather than landing on it', () => {
    const from = { q: 2, r: 3 };
    const goal = { q: 4, r: 3 };
    const blocked = (h: HexCoord) => hexEquals(h, goal);
    const dest = closestReachableTo(from, goal, 4, blocked, GRID);
    expect(hexEquals(dest, goal)).toBe(false);
    expect(hexDistance(dest, goal)).toBe(1); // adjacent, as close as possible
  });

  it('returns the origin when no closer hex exists', () => {
    const from = { q: 3, r: 3 };
    // Goal is the origin itself: nothing is closer.
    const dest = closestReachableTo(from, from, 4, open, GRID);
    expect(hexEquals(dest, from)).toBe(true);
  });
});

describe('deployHexes', () => {
  it('returns the requested count of distinct in-bounds hexes', () => {
    const hexes = deployHexes('player', 6, GRID);
    expect(hexes).toHaveLength(6);
    expect(new Set(hexes.map(hexKey)).size).toBe(6);
    for (const h of hexes) expect(inBounds(h, GRID)).toBe(true);
  });

  it('places players below the midline and enemies above, with a gap between', () => {
    const mid = Math.floor(GRID.rows / 2);
    const players = deployHexes('player', 3, GRID);
    const enemies = deployHexes('npc', 3, GRID);
    expect(players.every((h) => h.r > mid)).toBe(true);
    expect(enemies.every((h) => h.r < mid)).toBe(true);
    const nearestPlayer = Math.min(...players.map((h) => h.r));
    const nearestEnemy = Math.max(...enemies.map((h) => h.r));
    expect(nearestPlayer - nearestEnemy).toBeGreaterThan(1); // open lane between the lines
  });

  it('overflows onto the next row when a row fills, staying in the zone', () => {
    const players = deployHexes('player', 12, GRID);
    expect(players).toHaveLength(12);
    const rows = new Set(players.map((h) => h.r));
    expect(rows.has(GRID.rows - 1)).toBe(true);
    expect(rows.has(GRID.rows - 2)).toBe(true);
    // never crosses into the enemy half
    expect(players.every((h) => h.r >= GRID.rows - 3)).toBe(true);
  });

  it('caps at the deployment-zone capacity (3 rows × cols)', () => {
    const players = deployHexes('player', 999, GRID);
    expect(players.length).toBe(3 * GRID.cols);
    expect(new Set(players.map(hexKey)).size).toBe(players.length);
  });
});

describe('hex helpers', () => {
  it('hexKey and hexEquals agree', () => {
    const a = { q: 1, r: -2 };
    const b = { q: 1, r: -2 };
    const c = { q: 1, r: 2 };
    expect(hexKey(a)).toBe(hexKey(b));
    expect(hexEquals(a, b)).toBe(true);
    expect(hexEquals(a, c)).toBe(false);
    expect(hexKey(a)).not.toBe(hexKey(c));
  });

  it('keys round-trips uniquely for a small patch', () => {
    const patch = hexesInRange({ q: 0, r: 0 }, 2);
    expect(new Set(keys(patch)).size).toBe(patch.length);
  });
});
