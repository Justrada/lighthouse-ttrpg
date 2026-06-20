import { nanoid } from 'nanoid';
import type {
  ReskinEntry,
  Worldpack,
  WorldpackReskins,
  WorldpackContent,
  SkillNode,
  SkillEdge,
  SkillEffect,
  LinkedItem,
  WorldItem,
  WorldItems,
} from '@/types';
import { WORLDFORGE_FEE_RATE } from '@/data/constants';

// Hard caps so a hostile or runaway pack can't OOM a peer when it arrives over
// the wire or from an import. Generous enough for any hand-authored system.
const MAX_NODES = 1000;
const MAX_EDGES = 2000;
const MAX_ITEMS = 1000;
const MAX_EFFECTS = 50;
const STR = (v: unknown, n: number): string | undefined =>
  typeof v === 'string' && v.trim() ? v.slice(0, n) : undefined;

/** A blank pack ready for the editor. */
export function createEmptyWorldpack(over: Partial<Worldpack> = {}): Worldpack {
  const now = Date.now();
  return {
    id: nanoid(10),
    name: 'Untitled System',
    author: '',
    description: '',
    version: '1.0.0',
    createdAt: now,
    updatedAt: now,
    reskins: { nodes: {}, items: {}, terms: {} },
    baseMode: 'overlay',
    content: { nodes: [], edges: [], worldItems: {} },
    price: 0,
    published: false,
    ...over,
  };
}

function cleanReskinMap(v: unknown): Record<string, ReskinEntry> {
  if (!v || typeof v !== 'object') return {};
  const out: Record<string, ReskinEntry> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (!val || typeof val !== 'object') continue;
    const e = val as { name?: unknown; description?: unknown };
    const entry: ReskinEntry = {};
    if (typeof e.name === 'string' && e.name.trim()) entry.name = e.name.slice(0, 120);
    if (typeof e.description === 'string' && e.description.trim()) entry.description = e.description.slice(0, 600);
    if (entry.name || entry.description) out[k] = entry;
  }
  return out;
}

function cleanTerms(v: unknown): Record<string, string> {
  if (!v || typeof v !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'string' && val.trim()) out[k] = val.slice(0, 60);
  }
  return out;
}

/** Shallow own-prop copy that drops functions, blocks prototype-pollution keys,
 *  and caps string bloat. Preserves creator-authored fields (SkillEffect /
 *  LinkedItem / WorldItem are open-ended) without smuggling callables or
 *  unbounded strings across the import / network boundary. */
function cleanLooseFields(src: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(src)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    if (typeof val === 'function') continue;
    out[k] = typeof val === 'string' ? val.slice(0, 600) : val;
  }
  return out;
}

function cleanEffects(v: unknown): SkillEffect[] {
  if (!Array.isArray(v)) return [];
  const out: SkillEffect[] = [];
  for (const e of v.slice(0, MAX_EFFECTS)) {
    if (!e || typeof e !== 'object') continue;
    const src = e as Record<string, unknown>;
    if (typeof src.type !== 'string' || !src.type.trim()) continue; // an effect with no type can't resolve
    const eff = cleanLooseFields(src) as SkillEffect;
    if (typeof eff.id !== 'string' || !eff.id) eff.id = nanoid(8);
    out.push(eff);
  }
  return out;
}

function cleanLinkedItem(v: unknown): LinkedItem | null {
  if (!v || typeof v !== 'object') return null;
  const src = v as Record<string, unknown>;
  const li = cleanLooseFields(src) as unknown as LinkedItem;
  li.id = STR(src.id, 60) ?? nanoid(8);
  li.type = src.type === 'Enhancement' ? 'Enhancement' : 'Ability';
  li.name = STR(src.name, 120) ?? 'Custom';
  li.description = STR(src.description, 600) ?? '';
  li.effects = cleanEffects(src.effects);
  return li;
}

function cleanNodes(v: unknown): SkillNode[] {
  if (!Array.isArray(v)) return [];
  const out: SkillNode[] = [];
  const seen = new Set<string>();
  for (const n of v.slice(0, MAX_NODES)) {
    if (!n || typeof n !== 'object') continue;
    const src = n as Record<string, unknown>;
    const id = STR(src.id, 60);
    if (!id || seen.has(id)) continue; // need a unique string id to resolve/override
    seen.add(id);
    out.push({
      id,
      x: Number.isFinite(src.x as number) ? (src.x as number) : 0,
      y: Number.isFinite(src.y as number) ? (src.y as number) : 0,
      fx: Number.isFinite(src.fx as number) ? (src.fx as number) : undefined,
      fy: Number.isFinite(src.fy as number) ? (src.fy as number) : undefined,
      label: STR(src.label, 120) ?? 'Custom Node',
      description: STR(src.description, 600) ?? '',
      isCenter: Boolean(src.isCenter),
      linkedItem: cleanLinkedItem(src.linkedItem),
    });
  }
  return out;
}

function cleanEdges(v: unknown): SkillEdge[] {
  if (!Array.isArray(v)) return [];
  const out: SkillEdge[] = [];
  const seen = new Set<string>();
  for (const e of v.slice(0, MAX_EDGES)) {
    if (!e || typeof e !== 'object') continue;
    const src = e as Record<string, unknown>;
    const sourceId = STR(src.sourceId, 60);
    const targetId = STR(src.targetId, 60);
    if (!sourceId || !targetId) continue;
    const id = STR(src.id, 80) ?? `${sourceId}->${targetId}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, sourceId, targetId });
  }
  return out;
}

function cleanContentItems(v: unknown): WorldItems {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: WorldItems = {};
  let count = 0;
  for (const [cat, arr] of Object.entries(v as Record<string, unknown>)) {
    if (cat === '__proto__' || cat === 'constructor' || cat === 'prototype') continue;
    if (!Array.isArray(arr)) continue;
    const items: WorldItem[] = [];
    for (const it of arr) {
      if (count >= MAX_ITEMS) break;
      if (!it || typeof it !== 'object') continue;
      const src = it as Record<string, unknown>;
      const id = STR(src.id, 60);
      if (!id) continue;
      count += 1;
      const item = cleanLooseFields(src) as unknown as WorldItem;
      item.id = id;
      item.type = 'Inventory Item';
      item.name = STR(src.name, 120) ?? 'Custom Item';
      item.itemType = (STR(src.itemType, 30) as WorldItem['itemType']) ?? 'Accessory';
      item.effects = cleanEffects(src.effects);
      items.push(item);
    }
    out[cat.slice(0, 40)] = items;
  }
  return out;
}

/**
 * Coerce untrusted custom content (imported or received over the network) into a
 * safe, complete {@link WorldpackContent}. Never throws; drops malformed entries,
 * de-dupes ids, and caps sizes so a hostile pack can't crash or OOM a peer.
 */
export function normalizeWorldpackContent(raw: unknown): WorldpackContent {
  const r = (raw ?? {}) as Partial<WorldpackContent>;
  return {
    nodes: cleanNodes(r.nodes),
    edges: cleanEdges(r.edges),
    worldItems: cleanContentItems(r.worldItems),
  };
}

/**
 * Coerce untrusted / imported / legacy worldpack data into a safe, complete
 * {@link Worldpack}. Used at every boundary where pack data enters the app
 * (localStorage load, marketplace import) so a malformed pack can't crash the
 * editor or the game.
 */
export function normalizeWorldpack(raw: unknown): Worldpack {
  const r = (raw ?? {}) as Partial<Worldpack>;
  const reskins = (r.reskins ?? {}) as Partial<WorldpackReskins>;
  const now = Date.now();
  return {
    id: typeof r.id === 'string' && r.id ? r.id : nanoid(10),
    name: ((typeof r.name === 'string' ? r.name.trim() : '') || 'Untitled System').slice(0, 80),
    author: (typeof r.author === 'string' ? r.author.trim() : '').slice(0, 60),
    description: (typeof r.description === 'string' ? r.description : '').slice(0, 600),
    version: typeof r.version === 'string' ? r.version.slice(0, 20) : '1.0.0',
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : now,
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : now,
    reskins: {
      nodes: cleanReskinMap(reskins.nodes),
      items: cleanReskinMap(reskins.items),
      terms: cleanTerms(reskins.terms),
    },
    baseMode: r.baseMode === 'extend' || r.baseMode === 'replace' ? r.baseMode : 'overlay',
    content: normalizeWorldpackContent(r.content),
    price: Number.isFinite(r.price as number) ? Math.max(0, Math.min(1_000_000, Math.trunc(r.price as number))) : 0,
    published: Boolean(r.published),
    license: typeof r.license === 'string' ? r.license.slice(0, 120) : undefined,
  };
}

/** Total reskin overrides in a pack — a quick "how complete is this" measure. */
export function reskinCount(pack: Worldpack): number {
  return (
    Object.keys(pack.reskins.nodes).length +
    Object.keys(pack.reskins.items).length +
    Object.keys(pack.reskins.terms).length
  );
}

/** The platform's facilitation fee on a sale at `price`. */
export function platformCut(price: number): number {
  if (!Number.isFinite(price) || price <= 0) return 0;
  return Math.round(price * WORLDFORGE_FEE_RATE);
}

/** What the creator keeps after the platform fee. */
export function creatorPayout(price: number): number {
  if (!Number.isFinite(price) || price <= 0) return 0;
  return price - platformCut(price);
}
