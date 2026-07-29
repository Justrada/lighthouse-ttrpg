import { describe, it, expect } from 'vitest';
import {
  HEX_DIRECTIONS,
  dirIndex,
  edgeId,
  compileTerrain,
  edgeBlocks,
  hexIsSolid,
  hasLineOfSight,
  reachableHexes,
  closestReachableTo,
  deployHexes,
  hexKey,
  EDGE_COORD_LIMIT,
} from './hex';
import type { Battlefield, HexCoord } from '@/types';

const DIMS = { cols: 8, rows: 8 };
const never = () => false;
const at = (q: number, r: number): HexCoord => ({ q, r });
const step = (c: HexCoord, d: number): HexCoord => ({
  q: c.q + HEX_DIRECTIONS[d].q,
  r: c.r + HEX_DIRECTIONS[d].r,
});

describe('dirIndex', () => {
  it('recovers the direction between adjacent hexes', () => {
    const origin = at(3, 3);
    for (let d = 0; d < 6; d += 1) {
      expect(dirIndex(origin, step(origin, d))).toBe(d);
    }
  });

  it('returns -1 for hexes that are not adjacent', () => {
    expect(dirIndex(at(0, 0), at(0, 0))).toBe(-1);
    expect(dirIndex(at(0, 0), at(3, 0))).toBe(-1);
  });
});

describe('edgeId', () => {
  it('gives both hexes sharing a border the SAME id', () => {
    // This is the whole point of edge ownership: a wall stored once must block
    // movement in both directions.
    const c = at(2, 3);
    for (let d = 0; d < 6; d += 1) {
      const n = step(c, d);
      expect(edgeId(c, d)).toBe(edgeId(n, (d + 3) % 6));
    }
  });

  it('is injective across a realistic board — no two borders alias', () => {
    const ids = new Set<number>();
    let borders = 0;
    for (let q = -20; q <= 20; q += 1) {
      for (let r = -20; r <= 20; r += 1) {
        for (let d = 0; d < 3; d += 1) {
          ids.add(edgeId(at(q, r), d));
          borders += 1;
        }
      }
    }
    expect(ids.size).toBe(borders);
  });

  it('stays a non-negative safe integer at the documented coordinate limit', () => {
    // Naming an edge normalizes to the hex that owns it, which can sit one step
    // further out than the caller — the packing must not wrap at the boundary.
    const lim = EDGE_COORD_LIMIT;
    const corners = [at(lim, lim), at(-lim, -lim), at(lim, -lim), at(-lim, lim)];
    const ids = new Set<number>();
    for (const c of corners) {
      for (let d = 0; d < 6; d += 1) {
        const id = edgeId(c, d);
        expect(Number.isSafeInteger(id)).toBe(true);
        expect(id).toBeGreaterThanOrEqual(0);
        ids.add(id);
      }
    }
    // Four far-apart hexes share no borders, so all 24 ids must be distinct.
    expect(ids.size).toBe(24);
  });
});

describe('compileTerrain', () => {
  it('returns undefined for an open arena so every check short-circuits', () => {
    expect(compileTerrain(undefined)).toBeUndefined();
    expect(compileTerrain({ dims: DIMS })).toBeUndefined();
    expect(compileTerrain({ dims: DIMS, walls: [], solid: [], doors: {} })).toBeUndefined();
  });

  it('parses JSON-safe door keys back into numeric edge ids', () => {
    const id = edgeId(at(1, 1), 0);
    const t = compileTerrain({ dims: DIMS, doors: { [String(id)]: 'closed' } });
    expect(t?.doors.get(id)).toBe('closed');
  });

  it('drops non-finite wall ids rather than poisoning the lookup', () => {
    const t = compileTerrain({ dims: DIMS, walls: [NaN, 42, Infinity] } as unknown as Battlefield);
    expect([...(t?.walls ?? [])]).toEqual([42]);
  });
});

describe('edgeBlocks', () => {
  const c = at(2, 2);
  const wall = edgeId(c, 0);

  it('blocks from both sides of the wall', () => {
    const t = compileTerrain({ dims: DIMS, walls: [wall] });
    expect(edgeBlocks(t, c, 0)).toBe(true);
    expect(edgeBlocks(t, step(c, 0), 3)).toBe(true);
  });

  it('treats an open door as passable and a shut one as solid', () => {
    const open = compileTerrain({ dims: DIMS, doors: { [String(wall)]: 'open' } });
    expect(edgeBlocks(open, c, 0)).toBe(false);
    for (const state of ['closed', 'locked'] as const) {
      const t = compileTerrain({ dims: DIMS, doors: { [String(wall)]: state } });
      expect(edgeBlocks(t, c, 0)).toBe(true);
    }
  });

  it('never blocks without terrain', () => {
    expect(edgeBlocks(undefined, c, 0)).toBe(false);
  });
});

describe('reachableHexes with terrain', () => {
  it('is unchanged when no terrain is supplied', () => {
    const plain = reachableHexes(at(3, 3), 2, never, DIMS);
    const withEmpty = reachableHexes(at(3, 3), 2, never, DIMS, compileTerrain({ dims: DIMS }));
    expect(withEmpty.map(hexKey).sort()).toEqual(plain.map(hexKey).sort());
  });

  it('will not step through a wall', () => {
    const from = at(3, 3);
    const beyond = step(from, 0);
    const t = compileTerrain({ dims: DIMS, walls: [edgeId(from, 0)] });
    const keys = reachableHexes(from, 1, never, DIMS, t).map(hexKey);
    expect(keys).not.toContain(hexKey(beyond));
    expect(keys).toContain(hexKey(step(from, 1)));
  });

  it('seals a hex in completely when all six borders are walled', () => {
    const from = at(3, 3);
    const walls = Array.from({ length: 6 }, (_, d) => edgeId(from, d));
    const t = compileTerrain({ dims: DIMS, walls });
    expect(reachableHexes(from, 6, never, DIMS, t)).toEqual([]);
  });

  it('routes around a wall rather than treating it as a dead end', () => {
    // Wall only the direct border; the neighbour must still be reachable the long way.
    const from = at(3, 3);
    const beyond = step(from, 0);
    const t = compileTerrain({ dims: DIMS, walls: [edgeId(from, 0)] });
    const keys = reachableHexes(from, 3, never, DIMS, t).map(hexKey);
    expect(keys).toContain(hexKey(beyond));
  });

  it('excludes solid hexes', () => {
    const from = at(3, 3);
    const pillar = step(from, 0);
    const t = compileTerrain({ dims: DIMS, solid: [hexKey(pillar)] });
    expect(reachableHexes(from, 2, never, DIMS, t).map(hexKey)).not.toContain(hexKey(pillar));
  });

  it('closestReachableTo respects walls', () => {
    const from = at(3, 3);
    const goal = at(6, 3);
    const walls = [edgeId(from, 0), edgeId(from, 1), edgeId(from, 5)];
    const t = compileTerrain({ dims: DIMS, walls });
    const open = closestReachableTo(from, goal, 1, never, DIMS);
    const walled = closestReachableTo(from, goal, 1, never, DIMS, t);
    expect(hexKey(open)).not.toBe(hexKey(from));
    expect(hexKey(walled)).toBe(hexKey(from)); // every step toward the goal is walled off
  });
});

describe('hasLineOfSight', () => {
  it('is true everywhere on an open field', () => {
    expect(hasLineOfSight(at(0, 0), at(5, 2), undefined)).toBe(true);
    expect(hasLineOfSight(at(0, 0), at(5, 2), compileTerrain({ dims: DIMS }))).toBe(true);
  });

  it('is blocked by a wall directly between two adjacent hexes', () => {
    const a = at(2, 2);
    const t = compileTerrain({ dims: DIMS, walls: [edgeId(a, 0)] });
    expect(hasLineOfSight(a, step(a, 0), t)).toBe(false);
  });

  it('gives the same answer in both directions', () => {
    // hexLineDraw's rounding is not symmetric, so LOS is evaluated both ways and
    // OR-ed; the observable behaviour must not depend on who is looking.
    const a = at(1, 1);
    const b = at(5, 4);
    const walls = [edgeId(at(3, 2), 0), edgeId(at(3, 2), 1), edgeId(at(2, 3), 0)];
    const t = compileTerrain({ dims: DIMS, walls });
    expect(hasLineOfSight(a, b, t)).toBe(hasLineOfSight(b, a, t));
  });

  it('sees through an open door but not a shut one', () => {
    const a = at(2, 2);
    const b = step(a, 0);
    const id = edgeId(a, 0);
    expect(hasLineOfSight(a, b, compileTerrain({ dims: DIMS, doors: { [String(id)]: 'open' } }))).toBe(true);
    expect(hasLineOfSight(a, b, compileTerrain({ dims: DIMS, doors: { [String(id)]: 'closed' } }))).toBe(false);
  });
});

describe('hexIsSolid', () => {
  it('reads the solid set, and is false without terrain', () => {
    const t = compileTerrain({ dims: DIMS, solid: ['1,1'] });
    expect(hexIsSolid(t, at(1, 1))).toBe(true);
    expect(hexIsSolid(t, at(1, 2))).toBe(false);
    expect(hexIsSolid(undefined, at(1, 1))).toBe(false);
  });
});

describe('deployHexes with zones', () => {
  const zones = {
    player: [at(0, 7), at(1, 7)],
    npc: [at(0, 0), at(1, 0), at(2, 0)],
  };

  it('draws from the supplied zone instead of the midline rows', () => {
    expect(deployHexes('player', 2, DIMS, zones)).toEqual(zones.player);
    expect(deployHexes('npc', 2, DIMS, zones)).toEqual(zones.npc.slice(0, 2));
  });

  it('returns a short list rather than inventing hexes outside the zone', () => {
    // The caller places the overflow; silently spilling into walls would be worse.
    expect(deployHexes('player', 5, DIMS, zones)).toHaveLength(2);
  });

  it('falls back to the classic midline rows when a zone is absent or empty', () => {
    const classic = deployHexes('player', 3, DIMS);
    expect(deployHexes('player', 3, DIMS, undefined)).toEqual(classic);
    expect(deployHexes('player', 3, DIMS, { player: [], npc: [] })).toEqual(classic);
  });

  it('copies zone hexes so a caller cannot mutate the battlefield', () => {
    const out = deployHexes('npc', 1, DIMS, zones);
    out[0].q = 99;
    expect(zones.npc[0].q).toBe(0);
  });
});
