import type { SkillTreeData, SkillNode, SkillEdge, WorldItem, WorldItems } from '@/types';
import raw from './skillTree.json';
import { extraItems } from './extraItems';

export const skillTree = raw as unknown as SkillTreeData;

export const skillNodes: SkillNode[] = skillTree.nodes;
export const skillEdges: SkillEdge[] = skillTree.edges;

/**
 * Merge the base world items from the data file with the expanded `extraItems`
 * catalog, per category bucket. Existing items are kept and the new ones are
 * appended; categories present only in `extraItems` (e.g. the new `shields`
 * bucket) are introduced. This runs before `allWorldItems`/`findItem` are built
 * so the equipment browser and item lookup see everything.
 */
function mergeWorldItems(base: WorldItems, extra: WorldItems): WorldItems {
  const merged: WorldItems = {};
  for (const key of new Set([...Object.keys(base), ...Object.keys(extra)])) {
    merged[key] = [...(base[key] ?? []), ...(extra[key] ?? [])];
  }
  return merged;
}

export const worldItems: WorldItems = mergeWorldItems(skillTree.worldItems, extraItems);

/** All world items flattened across category buckets. */
export const allWorldItems: WorldItem[] = Object.values(worldItems).flat();

const nodeById = new Map(skillNodes.map((n) => [n.id, n]));
const itemById = new Map(allWorldItems.map((i) => [i.id, i]));

export function findNode(id: string): SkillNode | undefined {
  return nodeById.get(id);
}

export function findItem(id: string): WorldItem | undefined {
  return itemById.get(id);
}

/** Outgoing edges treat the tree as a prerequisite graph rooted at `center-0`. */
export function childrenOf(nodeId: string): SkillNode[] {
  return skillEdges
    .filter((e) => e.sourceId === nodeId)
    .map((e) => nodeById.get(e.targetId))
    .filter((n): n is SkillNode => Boolean(n));
}

/** The immediate prerequisite node ids for a given node. */
export function prerequisitesOf(nodeId: string): string[] {
  return skillEdges.filter((e) => e.targetId === nodeId).map((e) => e.sourceId);
}
