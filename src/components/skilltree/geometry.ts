import type { SkillNode, SkillEdge } from '@/types';

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

/** Axis-aligned bounding box of a set of nodes, with a uniform padding. */
export function computeBounds(nodes: SkillNode[], pad = 80): Bounds {
  if (nodes.length === 0) {
    return {
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
      width: 0,
      height: 0,
      centerX: 0,
      centerY: 0,
    };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x > maxX) maxX = n.x;
    if (n.y > maxY) maxY = n.y;
  }
  minX -= pad;
  minY -= pad;
  maxX += pad;
  maxY += pad;
  const width = maxX - minX;
  const height = maxY - minY;
  return {
    minX,
    minY,
    maxX,
    maxY,
    width,
    height,
    centerX: minX + width / 2,
    centerY: minY + height / 2,
  };
}

export interface ViewTransform {
  /** Data-space point that sits at the centre of the viewport. */
  x: number;
  y: number;
  /** Pixels per data unit. */
  scale: number;
}

export const MIN_SCALE = 0.4;
export const MAX_SCALE = 2.5;

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/**
 * A transform that fits `bounds` inside a viewport of `vw`×`vh`, centred on
 * `focus` (data coordinates). Scale is clamped to the allowed band.
 */
export function fitTransform(
  bounds: Bounds,
  vw: number,
  vh: number,
  focus: { x: number; y: number },
): ViewTransform {
  if (vw <= 0 || vh <= 0 || bounds.width <= 0 || bounds.height <= 0) {
    return { x: focus.x, y: focus.y, scale: 1 };
  }
  const scale = clampScale(Math.min(vw / bounds.width, vh / bounds.height) * 0.92);
  return { x: focus.x, y: focus.y, scale };
}

export interface ResolvedEdge {
  id: string;
  sourceId: string;
  targetId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Resolve edge endpoints to coordinates using a node lookup. Edges whose
 * endpoints are missing are dropped.
 */
export function resolveEdges(
  edges: SkillEdge[],
  byId: Map<string, SkillNode>,
): ResolvedEdge[] {
  const out: ResolvedEdge[] = [];
  for (const e of edges) {
    const a = byId.get(e.sourceId);
    const b = byId.get(e.targetId);
    if (!a || !b) continue;
    out.push({
      id: e.id,
      sourceId: e.sourceId,
      targetId: e.targetId,
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
    });
  }
  return out;
}

/** A gentle quadratic-curve path between two points, bowed perpendicular. */
export function curvePath(e: ResolvedEdge, bow = 0.12): string {
  const mx = (e.x1 + e.x2) / 2;
  const my = (e.y1 + e.y2) / 2;
  const dx = e.x2 - e.x1;
  const dy = e.y2 - e.y1;
  // Perpendicular offset for a subtle arc.
  const cx = mx - dy * bow;
  const cy = my + dx * bow;
  return `M ${e.x1} ${e.y1} Q ${cx} ${cy} ${e.x2} ${e.y2}`;
}
