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
 * Fully-custom content (new nodes/items with their own mechanics) is a planned
 * extension; the reskin layer is the foundation it will build on.
 */

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

  // --- marketplace metadata (foundation for the creator marketplace) ---
  /** Asking price in whole credits; 0 = free. */
  price: number;
  /** Whether the author has listed it for sale/sharing. */
  published: boolean;
  /** Author-supplied license / usage terms. */
  license?: string;
}
