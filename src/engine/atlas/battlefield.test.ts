import { describe, it, expect } from 'vitest';
import { compileBattlefield, reachableFrom, DEFAULT_DIMS, type ArenaArchetype } from './battlefield';
import { hashPath } from './rand';
import { gridHexes, hexKey, compileTerrain, edgeBlocks, HEX_DIRECTIONS } from '../hex';
import { normalizeBattlefield } from '@/lib/combat';
import type { Battlefield, HexCoord } from '@/types';

const ARCHETYPES: ArenaArchetype[] = ['interior', 'cave', 'open'];
const seedFor = (s: string) => hashPath([s]);

/** Every hex that isn't solid. */
const openHexes = (f: Battlefield): HexCoord[] => {
  const solid = new Set(f.solid ?? []);
  return gridHexes(f.dims).filter((h) => !solid.has(hexKey(h)));
};

describe.each(ARCHETYPES)('compileBattlefield — %s', (archetype) => {
  const field = compileBattlefield({ seed: seedFor('a-seed'), archetype });

  it('is deterministic for a seed', () => {
    const again = compileBattlefield({ seed: seedFor('a-seed'), archetype });
    expect(again).toEqual(field);
  });

  it('differs between seeds', () => {
    const other = compileBattlefield({ seed: seedFor('other-seed'), archetype });
    expect(other).not.toEqual(field);
  });

  it('uses the archetype default extent', () => {
    expect(field.dims).toEqual(DEFAULT_DIMS[archetype]);
  });

  it('is JSON-safe — it has to ride a combat snapshot and localStorage', () => {
    const round = JSON.parse(JSON.stringify(field));
    expect(round).toEqual(field);
  });

  it('survives the wire trust boundary unchanged', () => {
    expect(normalizeBattlefield(field)).toEqual(field);
  });

  it('LEAVES NO STRANDED HEXES — every open hex reaches every other', () => {
    // The failure this guards against is the one players find, not the author:
    // a sealed pocket that looks like ordinary floor.
    const open = openHexes(field);
    expect(open.length).toBeGreaterThan(10);
    const reached = reachableFrom(open[0], field);
    const stranded = open.filter((h) => !reached.has(hexKey(h)));
    expect(stranded).toEqual([]);
  });

  it('nominates two disjoint deployment zones', () => {
    expect(field.zones).toBeDefined();
    const player = field.zones!.player.map(hexKey);
    const npc = field.zones!.npc.map(hexKey);
    expect(player.length).toBeGreaterThan(0);
    expect(npc.length).toBeGreaterThan(0);
    expect(player.filter((k) => npc.includes(k))).toEqual([]);
  });

  it('puts both deployment zones on standable, mutually reachable ground', () => {
    const solid = new Set(field.solid ?? []);
    const reached = reachableFrom(field.zones!.player[0], field);
    for (const h of [...field.zones!.player, ...field.zones!.npc]) {
      expect(solid.has(hexKey(h))).toBe(false);
      expect(reached.has(hexKey(h))).toBe(true);
    }
  });

  it('starts the two sides apart rather than face to face', () => {
    const p = field.zones!.player[0];
    const n = field.zones!.npc[0];
    const dq = p.q - n.q;
    const dr = p.r - n.r;
    const dist = (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
    expect(dist).toBeGreaterThanOrEqual(6);
  });
});

describe('interiors', () => {
  const field = compileBattlefield({ seed: seedFor('tavern'), archetype: 'interior' });

  it('builds walls without consuming a single standable hex', () => {
    // The whole reason walls are edges: a seven-room interior costs ~100 edge
    // records instead of a third of the board.
    expect(field.walls!.length).toBeGreaterThan(20);
    expect(field.solid ?? []).toEqual([]);
    expect(openHexes(field).length).toBe(field.dims.cols * field.dims.rows);
  });

  it('cuts doors through those walls', () => {
    expect(Object.keys(field.doors ?? {}).length).toBeGreaterThan(2);
  });

  it('never leaves a door on the same edge as a wall', () => {
    // A door that a wall also covers would be a door you can see and not use.
    const walls = new Set(field.walls ?? []);
    for (const k of Object.keys(field.doors ?? {})) {
      expect(walls.has(Number(k))).toBe(false);
    }
  });

  it('actually blocks movement across a wall', () => {
    const terrain = compileTerrain(field);
    const wall = field.walls![0];
    let blockedSomewhere = false;
    for (const h of gridHexes(field.dims)) {
      for (let d = 0; d < 6; d += 1) {
        if (edgeBlocks(terrain, h, d)) blockedSomewhere = true;
      }
    }
    expect(wall).toBeGreaterThan(0);
    expect(blockedSomewhere).toBe(true);
  });

  it('gives the layout at least one LOOP, not just a spanning tree', () => {
    // Tested as the property that matters rather than as a door count: a door
    // whose removal still leaves the arena connected is a second route. With a
    // pure spanning tree every door is a bridge, every room has exactly one
    // approach, and the fight degenerates into a corridor queue.
    const doorIds = Object.keys(field.doors ?? {});
    expect(doorIds.length).toBeGreaterThan(0);

    const total = field.dims.cols * field.dims.rows;
    const hasAlternateRoute = doorIds.some((id) => {
      const sealed: Battlefield = {
        ...field,
        walls: [...(field.walls ?? []), Number(id)],
        doors: Object.fromEntries(Object.entries(field.doors!).filter(([k]) => k !== id)),
      };
      return reachableFrom(openHexes(sealed)[0], sealed).size === total;
    });
    expect(hasAlternateRoute).toBe(true);
  });
});

describe('caves', () => {
  const field = compileBattlefield({ seed: seedFor('deep'), archetype: 'cave' });

  it('carves rock without inventing walls', () => {
    expect(field.solid!.length).toBeGreaterThan(0);
    expect(field.walls ?? []).toEqual([]);
  });

  it('leaves a playable amount of floor', () => {
    // B4/S4 at 45% fill is the hex-tuned rule. The square-grid rule ported
    // naively gives either near-total open space or near-solid rock.
    const total = field.dims.cols * field.dims.rows;
    const open = openHexes(field).length;
    expect(open / total).toBeGreaterThan(0.25);
    expect(open / total).toBeLessThan(0.85);
  });

  it('seals the rim so the cave has a boundary', () => {
    const solid = new Set(field.solid!);
    for (const h of gridHexes(field.dims)) {
      if (h.r === 0 || h.r === field.dims.rows - 1) expect(solid.has(hexKey(h))).toBe(true);
    }
  });
});

describe('open ground', () => {
  const field = compileBattlefield({ seed: seedFor('moor'), archetype: 'open' });

  it('scatters cover without walling anything', () => {
    expect(field.solid!.length).toBeGreaterThan(3);
    expect(field.walls ?? []).toEqual([]);
  });

  it('never places two obstacles adjacent — which is what guarantees connectivity', () => {
    const solid = new Set(field.solid!);
    for (const k of solid) {
      const [q, r] = k.split(',').map(Number);
      for (let d = 0; d < 6; d += 1) {
        const nb = hexKey({ q: q + HEX_DIRECTIONS[d].q, r: r + HEX_DIRECTIONS[d].r });
        expect(solid.has(nb)).toBe(false);
      }
    }
  });

  it('leaves most of the field open', () => {
    const total = field.dims.cols * field.dims.rows;
    expect(field.solid!.length / total).toBeLessThan(0.2);
  });
});

describe('provenance and labelling', () => {
  it('carries a label into the arena for the combat log', () => {
    const field = compileBattlefield({
      seed: seedFor('x'),
      archetype: 'interior',
      label: 'The Salt Lantern — common room',
    });
    expect(field.label).toBe('The Salt Lantern — common room');
  });

  it('records where it was compiled from', () => {
    const origin = { atlasId: 'atl_1', path: '/P7/R3/L2/S9/B0/F-1/K4', genMajor: 1 };
    const field = compileBattlefield({ seed: seedFor('x'), archetype: 'cave', origin });
    expect(field.origin).toEqual(origin);
    expect(normalizeBattlefield(field)?.dims).toEqual(field.dims);
  });

  it('honours an explicit size', () => {
    const field = compileBattlefield({
      seed: seedFor('x'),
      archetype: 'interior',
      dims: { cols: 8, rows: 8 },
    });
    expect(field.dims).toEqual({ cols: 8, rows: 8 });
  });
});

describe('robustness across many seeds', () => {
  it.each(ARCHETYPES)('%s stays connected and deployable for 40 seeds', (archetype) => {
    for (let i = 0; i < 40; i += 1) {
      const field = compileBattlefield({ seed: seedFor(`seed-${i}`), archetype });
      const open = openHexes(field);
      expect(open.length).toBeGreaterThan(10);
      const reached = reachableFrom(open[0], field);
      expect(reached.size).toBe(open.length);
      expect(field.zones?.player.length).toBeGreaterThan(0);
      expect(field.zones?.npc.length).toBeGreaterThan(0);
    }
  });
});
