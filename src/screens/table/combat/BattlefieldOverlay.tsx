import { memo, useMemo } from 'react';
import type { Battlefield, HexCoord } from '@/types';
import { edgeId, gridHexes, hexKey } from '@/engine';

export interface BattlefieldOverlayProps {
  field: Battlefield;
  /** Pixel centre of each hex, keyed by `hexKey` — the board's own layout. */
  centerByKey: Map<string, { x: number; y: number }>;
  /** Hex radius in px, matching the tiles. */
  size: number;
  width: number;
  height: number;
}

/**
 * Walls and doors, drawn as **one board-spanning SVG** rather than per tile.
 *
 * Each `HexTile` is its own absolutely-positioned `<svg>`, so drawing a wall
 * inside them would paint every shared border twice — a visible seam, doubled
 * opacity, and two independent entrance animations on one wall.
 *
 * The geometry follows `HexTile`'s own vertex convention (pointy-top, first
 * vertex at −90°, then every 60°), so a wall lands exactly on the boundary
 * between the two tiles it separates:
 *
 * - direction 0 (east)  → the right edge,      vertices 1–2
 * - direction 1 (NE)    → the upper-right edge, vertices 0–1
 * - direction 2 (NW)    → the upper-left edge,  vertices 5–0
 *
 * Only those three are ever stored: each hex owns three of its six borders and
 * delegates the rest to its neighbour, so walking 0–2 over every hex visits
 * each border exactly once.
 */
const EDGE_VERTICES: Record<number, [number, number]> = {
  0: [1, 2],
  1: [0, 1],
  2: [5, 0],
};

function vertex(center: { x: number; y: number }, size: number, k: number) {
  const angle = (Math.PI / 180) * (60 * k - 90);
  return { x: center.x + size * Math.cos(angle), y: center.y + size * Math.sin(angle) };
}

interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: 'wall' | 'closed' | 'locked';
}

export const BattlefieldOverlay = memo(function BattlefieldOverlay({
  field,
  centerByKey,
  size,
  width,
  height,
}: BattlefieldOverlayProps) {
  const segments = useMemo(() => {
    const walls = new Set(field.walls ?? []);
    const doors = new Map(Object.entries(field.doors ?? {}).map(([k, v]) => [Number(k), v]));
    if (walls.size === 0 && doors.size === 0) return [];

    const out: Segment[] = [];
    for (const hex of gridHexes(field.dims)) {
      const center = centerByKey.get(hexKey(hex));
      if (!center) continue;
      for (let d = 0; d < 3; d += 1) {
        const id = edgeId(hex, d);
        const door = doors.get(id);
        // An open door is an absence of wall — nothing to draw.
        const kind: Segment['kind'] | null = walls.has(id)
          ? 'wall'
          : door === 'closed' || door === 'locked'
            ? door
            : null;
        if (!kind) continue;
        const [a, b] = EDGE_VERTICES[d];
        const p = vertex(center, size, a);
        const q = vertex(center, size, b);
        out.push({ x1: p.x, y1: p.y, x2: q.x, y2: q.y, kind });
      }
    }
    return out;
  }, [field, centerByKey, size]);

  if (segments.length === 0) return null;

  return (
    <svg
      className="pointer-events-none absolute left-0 top-0"
      width={width}
      height={height}
      aria-hidden
    >
      {segments.map((s, i) => (
        <line
          key={i}
          x1={s.x1}
          y1={s.y1}
          x2={s.x2}
          y2={s.y2}
          stroke={s.kind === 'wall' ? 'rgba(120,142,190,0.85)' : 'rgba(245,185,66,0.85)'}
          strokeWidth={s.kind === 'wall' ? 4 : 5}
          strokeLinecap="round"
          // A shut door reads as a barred gap rather than more masonry.
          strokeDasharray={s.kind === 'wall' ? undefined : '5 4'}
        />
      ))}
    </svg>
  );
});

/** The hexes a battlefield marks impassable, as a lookup the board can probe. */
export function solidKeys(field: Battlefield | undefined): Set<string> {
  return new Set(field?.solid ?? []);
}

export type { HexCoord };
