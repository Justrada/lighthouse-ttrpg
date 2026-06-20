/**
 * Worldforge data model.
 *
 * A **Worldpack** is a creator-authored "system": a presentational overlay on
 * top of the base LIGHTHOUSE ruleset. It renames and re-describes skills,
 * abilities, items, and core descriptors (stats/resources) so a creator can
 * theme the whole game — sci-fi, mythic, grimdark, anything — WITHOUT changing
 * any mechanics (effects, costs, ranges, balance are untouched). That separation
 * is what makes packs safe to share and, eventually, sell on a creator
 * marketplace (the platform facilitates the sale for a small fee).
 *
 * A pack may ALSO carry a custom-content catalog (`content`) — wholly new
 * skill-tree nodes, abilities, and items that the engine resolves alongside (or
 * instead of) the base catalog, per `baseMode`. The reskin layer themes the base
 * system; the content layer extends or replaces it. Both stay pure data the pure
 * engine resolves identically, which is what keeps packs safe to share and sell.
 */

import type { SkillNode, SkillEdge } from './skillTree';
import type { WorldItems } from './items';

/** Per-entity presentational override. Mechanics are never stored here. */
export interface ReskinEntry {
  name?: string;
  description?: string;
}

export interface WorldpackReskins {
  /** Skill-tree node id → name/description override. */
  nodes: Record<string, ReskinEntry>;
  /** World item id → name/description override. */
  items: Record<string, ReskinEntry>;
  /** Global term (canonical key, e.g. 'Mind', 'HP', 'Stealth') → custom label. */
  terms: Record<string, string>;
}

/**
 * How a pack's custom `content` relates to the base ruleset:
 * - `overlay`  — reskin only; no custom content resolves (today's behavior).
 * - `extend`   — base ∪ content; a custom id overrides the base id of the same name.
 * - `replace`  — only custom content resolves; the base catalog is hidden.
 */
export type SystemBaseMode = 'overlay' | 'extend' | 'replace';

/**
 * A custom-content catalog. Reuses the engine's own content types so custom
 * nodes/items resolve through the exact same code paths as the base catalog.
 * Any slice may be empty — a node-only pack (skill tree) or an item-only pack
 * are both valid.
 */
export interface WorldpackContent {
  nodes: SkillNode[];
  edges: SkillEdge[];
  worldItems: WorldItems;
}

export interface Worldpack {
  id: string;
  name: string;
  author: string;
  description: string;
  /** Author-managed version string. */
  version: string;
  createdAt?: number;
  updatedAt?: number;
  /** The presentational overlay this pack applies. */
  reskins: WorldpackReskins;

  // --- custom content (optional; absent/empty ⇒ a pure reskin pack) ---
  /** How `content` relates to the base ruleset. Absent ⇒ 'overlay'. */
  baseMode?: SystemBaseMode;
  /** Wholly custom nodes/abilities/items this pack adds or replaces. */
  content?: WorldpackContent;

  // --- marketplace metadata (foundation for the creator marketplace) ---
  /** Asking price in whole credits; 0 = free. */
  price: number;
  /** Whether the author has listed it for sale/sharing. */
  published: boolean;
  /** Author-supplied license / usage terms. */
  license?: string;
  /** Lineage: the pack this one was forked from (for attribution + remixing). */
  derivedFrom?: { id: string; name: string; author: string };
}
