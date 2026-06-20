import type {
  SkillTreeData,
  SkillNode,
  SkillEdge,
  WorldItem,
  WorldItems,
  WorldpackContent,
  SystemBaseMode,
} from '@/types';
import raw from './skillTree.json';
import { extraItems } from './extraItems';

export const skillTree = raw as unknown as SkillTreeData;

// --- BASE catalog (immutable, baked-in) ---
// These exports are always the BASE system. Consumers that must reflect an
// active custom System call the getActive*() getters or the findNode/findItem
// resolvers below (which read the swappable active catalog). The reskin editor
// and the data audit intentionally read these base exports.
export const skillNodes: SkillNode[] = skillTree.nodes;
export const skillEdges: SkillEdge[] = skillTree.edges;

/**
 * Merge the base world items from the data file with the expanded `extraItems`
 * catalog, per category bucket. Existing items are kept and the new ones are
 * appended; categories present only in `extraItems` (e.g. the `shields` bucket)
 * are introduced.
 */
function mergeWorldItems(base: WorldItems, extra: WorldItems): WorldItems {
  const merged: WorldItems = {};
  for (const key of new Set([...Object.keys(base), ...Object.keys(extra)])) {
    merged[key] = [...(base[key] ?? []), ...(extra[key] ?? [])];
  }
  return merged;
}

export const worldItems: WorldItems = mergeWorldItems(skillTree.worldItems, extraItems);

/** All BASE world items flattened across category buckets. */
export const allWorldItems: WorldItem[] = Object.values(worldItems).flat();

// ---------------------------------------------------------------------------
// Active-catalog registry
//
// The engine resolves ALL content through findNode/findItem (and the graph
// helpers childrenOf/prerequisitesOf). Those read a swappable `active` catalog
// that DEFAULTS to base — so with no System active, behavior is identical to
// before. Activating a custom System (worldpackStore.setActive, or a multiplayer
// system_sync) swaps `active` to base∪custom (extend) or custom-only (replace).
// Resolution stays a pure Map lookup, so determinism holds: same active catalog
// + same inputs → same output. The swap is atomic (single-threaded JS), never
// mid-resolution. The engine still only IMPORTS this module — it never imports a
// store, preserving the store→data→engine dependency direction.
// ---------------------------------------------------------------------------

export interface ActiveCatalog {
  nodes: SkillNode[];
  edges: SkillEdge[];
  worldItems: WorldItems;
  allItems: WorldItem[];
  nodeById: Map<string, SkillNode>;
  itemById: Map<string, WorldItem>;
}

function buildCatalog(nodes: SkillNode[], edges: SkillEdge[], items: WorldItems): ActiveCatalog {
  const allItems = Object.values(items).flat();
  return {
    nodes,
    edges,
    worldItems: items,
    allItems,
    nodeById: new Map(nodes.map((n) => [n.id, n])),
    itemById: new Map(allItems.map((i) => [i.id, i])),
  };
}

const baseCatalog = buildCatalog(skillNodes, skillEdges, worldItems);
let active: ActiveCatalog = baseCatalog;
let activeVersion = 0;

/** Bumps whenever `active` changes — lets derived caches (e.g. skill tiers in
 *  stats.ts) invalidate without importing this module's mutable state. */
export function getCatalogVersion(): number {
  return activeVersion;
}

export function setActiveCatalog(catalog: ActiveCatalog | null): void {
  active = catalog ?? baseCatalog;
  activeVersion += 1;
}

export function resetActiveCatalog(): void {
  active = baseCatalog;
  activeVersion += 1;
}

function mergeById<T extends { id: string }>(base: T[], custom: T[]): T[] {
  const byId = new Map<string, T>();
  for (const x of base) byId.set(x.id, x);
  for (const x of custom) byId.set(x.id, x); // a custom id OVERRIDES the base one
  return [...byId.values()];
}

/** Merge item buckets so a custom item OVERRIDES a base item with the same id
 *  (the base copy is dropped; the custom one lands in its bucket) — no dupes. */
function mergeItemsOverride(base: WorldItems, custom: WorldItems): WorldItems {
  const customIds = new Set<string>();
  for (const arr of Object.values(custom)) for (const it of arr) customIds.add(it.id);
  const out: WorldItems = {};
  for (const [cat, arr] of Object.entries(base)) {
    out[cat] = arr.filter((it) => !customIds.has(it.id));
  }
  for (const [cat, arr] of Object.entries(custom)) {
    out[cat] = [...(out[cat] ?? []), ...arr];
  }
  return out;
}

/** center-0 is assumed to exist everywhere (learned-skill seeding, tier root).
 *  A 'replace' System that omits it gets the base center injected. */
function ensureCenter(nodes: SkillNode[]): SkillNode[] {
  if (nodes.some((n) => n.id === 'center-0' || n.isCenter)) return nodes;
  const center = skillNodes.find((n) => n.id === 'center-0');
  return center ? [center, ...nodes] : nodes;
}

/** Build an active catalog from a System's content + base mode. Pure. */
export function buildActiveCatalog(
  content: WorldpackContent | null | undefined,
  mode: SystemBaseMode = 'overlay',
): ActiveCatalog {
  if (!content || mode === 'overlay') return baseCatalog;
  if (mode === 'replace') {
    return buildCatalog(ensureCenter(content.nodes ?? []), content.edges ?? [], content.worldItems ?? {});
  }
  // extend: base ∪ custom, custom wins on id collisions.
  return buildCatalog(
    mergeById(skillNodes, content.nodes ?? []),
    mergeById(skillEdges, content.edges ?? []),
    mergeItemsOverride(worldItems, content.worldItems ?? {}),
  );
}

// --- resolvers (signatures unchanged; now read the active catalog) ---

export function findNode(id: string): SkillNode | undefined {
  return active.nodeById.get(id);
}

export function findItem(id: string): WorldItem | undefined {
  return active.itemById.get(id);
}

/** Outgoing edges treat the tree as a prerequisite graph rooted at `center-0`. */
export function childrenOf(nodeId: string): SkillNode[] {
  return active.edges
    .filter((e) => e.sourceId === nodeId)
    .map((e) => active.nodeById.get(e.targetId))
    .filter((n): n is SkillNode => Boolean(n));
}

/** The immediate prerequisite node ids for a given node. */
export function prerequisitesOf(nodeId: string): string[] {
  return active.edges.filter((e) => e.targetId === nodeId).map((e) => e.sourceId);
}

// --- active-catalog views for play/build screens ---
// The base consts above stay base; these reflect the active System so the Forge
// skill tree, equipment browser, and auto-build see custom content.

export function getActiveNodes(): SkillNode[] {
  return active.nodes;
}
export function getActiveEdges(): SkillEdge[] {
  return active.edges;
}
export function getActiveWorldItems(): WorldItems {
  return active.worldItems;
}
export function getActiveItems(): WorldItem[] {
  return active.allItems;
}
