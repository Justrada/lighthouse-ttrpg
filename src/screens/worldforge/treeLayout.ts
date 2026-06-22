import type { WorldpackContent } from '@/types';

/**
 * Shared geometry for the visual skill-tree editor. The board grows rightward
 * from a fixed Core anchor on the left: a node's COLUMN encodes its tier (hops
 * from Core), which is exactly what the engine charges skill points for
 * (`getSkillTiers`/`getSkillCost`). Keeping placement tier-aligned means the map
 * you see matches the cost a player pays — "n columns out" == "tier n".
 */

export const BASE_W = 640;
export const BASE_H = 360;
/** Core sits at a fixed point; the canvas grows around it (never re-centers). */
export const CENTER: { x: number; y: number } = { x: 48, y: BASE_H / 2 };

/** Horizontal gap between tiers (one column == one prerequisite hop). */
const COL = 132;
/** Vertical gap when fanning siblings of the same parent. */
const ROW = 78;
/** Hard cap on auto-placed depth so a runaway chain can't fling a node off-canvas. */
const MAX_TIER = 14;

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Canvas size that fits every node — grows right/down past the base so deep or
 *  wide trees scroll (the container is overflow-auto) instead of clipping. */
export function canvasSize(content: WorldpackContent): { width: number; height: number } {
  let maxX = CENTER.x;
  let maxY = CENTER.y;
  for (const n of content.nodes) {
    if (n.x > maxX) maxX = n.x;
    if (n.y > maxY) maxY = n.y;
  }
  return { width: Math.max(BASE_W, maxX + 100), height: Math.max(BASE_H, maxY + 60) };
}

/** BFS depth (hops from `center-0`) of every reachable node over prerequisite
 *  edges. Mirrors the engine's `getSkillTiers`, so a node's depth here is the
 *  tier its skill-point cost is computed from. Unreachable nodes are absent. */
export function depthFromCenter(content: WorldpackContent): Map<string, number> {
  const adj = new Map<string, string[]>();
  for (const e of content.edges) {
    const list = adj.get(e.sourceId);
    if (list) list.push(e.targetId);
    else adj.set(e.sourceId, [e.targetId]);
  }
  const depth = new Map<string, number>([['center-0', 0]]);
  const queue = ['center-0'];
  while (queue.length) {
    const cur = queue.shift()!;
    const d = depth.get(cur)!;
    for (const t of adj.get(cur) ?? []) {
      if (!depth.has(t)) {
        depth.set(t, d + 1);
        queue.push(t);
      }
    }
  }
  return depth;
}

/**
 * Where to drop a new child of `parentId`: one tier further from Core (its
 * column reads as its tier) and fanned vertically around the parent so repeated
 * children of the same node don't stack on top of each other. Coordinates are
 * capped to sane bounds; the canvas grows via {@link canvasSize} to reveal them.
 */
export function placeChild(content: WorldpackContent, parentId: string): { x: number; y: number } {
  const depth = depthFromCenter(content);
  const childTier = Math.min(MAX_TIER, (depth.get(parentId) ?? 0) + 1);
  const parent = parentId === 'center-0' ? CENTER : content.nodes.find((n) => n.id === parentId);
  const py = parent?.y ?? CENTER.y;

  // Fan siblings outward: 1st straight out, then +1, -1, +2, -2 rows … around the parent.
  const siblings = content.edges.filter((e) => e.sourceId === parentId).length;
  const step = Math.ceil(siblings / 2);
  const fan = siblings === 0 ? 0 : (siblings % 2 === 1 ? 1 : -1) * step * ROW;

  return {
    x: clamp(CENTER.x + childTier * COL, 20, CENTER.x + MAX_TIER * COL),
    y: clamp(py + fan, 20, BASE_H * 4),
  };
}
