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
/** Trim, then cap by CODE POINTS (not UTF-16 units) so truncation can't split a
 *  multi-byte emoji into a lone surrogate. Blank → undefined. */
const STR = (v: unknown, n: number): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t ? [...t].slice(0, n).join('') : undefined;
};
/** A finite integer clamped to [lo,hi], or undefined for non-numbers — keeps
 *  hostile/garbage numeric fields from reaching the engine as NaN or huge loops. */
const INT = (v: unknown, lo: number, hi: number): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.floor(v))) : undefined;

// --- enum canonicalization (case-insensitive + common aliases, safe defaults) ---
// Imported/hand-authored packs can carry arbitrary strings in fields the studio
// gates with selects. Coercing them here stops "always out of range" / silent
// no-op content from ever reaching the engine.
const RANGES = ['Self', 'Melee', 'Near', 'Far', 'Distant', 'Battlefield'];
const RANGE_ALIAS: Record<string, string> = { adjacent: 'Melee', reach: 'Melee', touch: 'Melee', unlimited: 'Battlefield', sight: 'Battlefield' };
function normRange(v: unknown): string | undefined {
  const s = STR(v, 30);
  if (!s) return undefined;
  return RANGES.find((r) => r.toLowerCase() === s.toLowerCase()) ?? RANGE_ALIAS[s.toLowerCase()] ?? 'Melee';
}
const HIT_TYPES = ['Auto Hit', 'Roll to Hit'];
function normHitType(v: unknown): string | undefined {
  const s = STR(v, 30);
  if (!s) return undefined;
  return HIT_TYPES.find((h) => h.toLowerCase() === s.toLowerCase()) ?? 'Roll to Hit';
}
const SKILLS = ['Physical', 'Stealth', 'Lore', 'Awareness', 'Influence', 'Survival'];
function normSkill(v: unknown): string | undefined {
  const s = STR(v, 30);
  if (!s) return undefined;
  return SKILLS.find((k) => k.toLowerCase() === s.toLowerCase()) ?? s; // unknown left as-is (engine reads +0)
}
const STAT_CANON: Record<string, string> = {
  hp: 'HP', mp: 'MP', sp: 'SP', health: 'HP', mana: 'MP', stamina: 'SP', 'hit points': 'HP',
  'max hp': 'Max HP', 'max mp': 'Max MP', 'max sp': 'Max SP',
  ac: 'AC', armor: 'AC', armour: 'AC', 'armor class': 'AC', initiative: 'Initiative',
  physical: 'Physical', stealth: 'Stealth', lore: 'Lore', awareness: 'Awareness', influence: 'Influence', survival: 'Survival',
  'actions per round': 'Actions Per Round',
};
function normStat(v: unknown): string | undefined {
  const s = STR(v, 40);
  if (!s) return undefined;
  return STAT_CANON[s.toLowerCase()] ?? s; // known stats canonicalized; unknown left as-is
}
const DURATION_UNITS = ['Instant', 'Rounds', 'Actions', 'Permanent'];
function normDurationUnit(v: unknown): string | undefined {
  const s = STR(v, 20);
  if (!s) return undefined;
  return DURATION_UNITS.find((u) => u.toLowerCase() === s.toLowerCase()) ?? 'Rounds';
}
function normAoe(v: unknown): string | undefined {
  const s = STR(v, 40);
  if (!s) return undefined;
  if (/^single target$/i.test(s)) return 'Single Target';
  const blast = s.match(/^aoe\b\s*(\d+)?/i);
  if (blast) return `AOE ${Math.max(1, parseInt(blast[1] ?? '2', 10) || 2)}`;
  const line = s.match(/^(?:target line|line)\b\s*(\d+)?/i);
  if (line) return `Target Line ${Math.max(1, parseInt(line[1] ?? '1', 10) || 1)} Row`;
  return 'Single Target'; // unrecognized → safe single-target
}
const RESOURCE_TYPES = ['MP', 'SP', 'HP'];

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
    // Clamp duration (coercing numeric strings) + whitelist the unit so an
    // imported string/negative/huge/garbage duration can't corrupt a Stun/DoT/buff.
    if ('durationValue' in eff) {
      const dv = typeof eff.durationValue === 'string' ? Number(eff.durationValue) : eff.durationValue;
      eff.durationValue = INT(dv, 0, 999);
    }
    if (eff.durationUnit != null) eff.durationUnit = normDurationUnit(eff.durationUnit) as never;
    if (eff.durationType != null) eff.durationType = normDurationUnit(eff.durationType) as never;
    if (eff.statToModify != null) eff.statToModify = normStat(eff.statToModify); // health->HP, ac casing, etc.
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
  // Canonicalize combat enums so a typo/case/import can't make the ability
  // permanently "out of range" or silently unusable.
  if (li.range != null) li.range = normRange(li.range);
  if (li.hitType != null) li.hitType = normHitType(li.hitType);
  if (li.rollModifier != null) li.rollModifier = normSkill(li.rollModifier);
  if (li.aoe != null) li.aoe = normAoe(li.aoe);
  // Cost: coerce to a safe {type, value} (non-negative int, valid pool) or drop junk.
  const rawCost = src.cost as { type?: unknown; value?: unknown } | undefined;
  if (rawCost && typeof rawCost === 'object' && !Array.isArray(rawCost)) {
    li.cost = {
      type: (RESOURCE_TYPES.includes(String(rawCost.type)) ? String(rawCost.type) : 'MP') as never,
      value: INT(rawCost.value, 0, 99) ?? 0,
    };
  } else {
    const liRec = li as unknown as Record<string, unknown>;
    if ('cost' in liRec) delete liRec.cost;
  }
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
    if (id === '__proto__' || id === 'constructor' || id === 'prototype') continue; // proto-pollution guard
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

const PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
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
    if (PROTO_KEYS.has(sourceId) || PROTO_KEYS.has(targetId)) continue; // proto-pollution guard
    if (sourceId === targetId) continue; // a self-loop prerequisite is meaningless
    const pair = `${sourceId}->${targetId}`;
    if (seen.has(pair)) continue; // de-dup by ENDPOINTS, not id (honest prerequisite counts)
    seen.add(pair);
    out.push({ id: STR(src.id, 80) ?? pair, sourceId, targetId });
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
      // A weapon's own Apply-Damage effect must not BOTH scale with weapon damage
      // AND re-roll its own dice — that double-counts (computeDamage rolls the
      // weapon's dice once for useWeaponDamage and again for additionalDamage).
      // Heal it here so legacy/imported custom weapons stop dealing ~2x damage.
      if (item.itemType === 'Weapon') {
        item.effects = item.effects.map((e) =>
          e.type === 'Apply Damage' && e.useWeaponDamage && e.additionalDamage ? { ...e, useWeaponDamage: false } : e,
        );
      }
      // Ammo module — coerce to bounded ints so the engine can trust them.
      item.clipSize = INT(src.clipSize, 0, 9999);
      item.ammoPerShot = INT(src.ammoPerShot, 1, 999);
      item.shots = INT(src.shots, 1, 50);
      item.reserveAmmo = INT(src.reserveAmmo, 0, 1_000_000);
      // Canonicalize weapon combat enums + cross-clamp ammo so a shot can never
      // cost more than the clip holds (which would jam the gun forever).
      const ix = item as unknown as Record<string, unknown>;
      if (item.range != null) item.range = normRange(item.range);
      if (ix.aoe != null) ix.aoe = normAoe(ix.aoe);
      if (ix.hitType != null) ix.hitType = normHitType(ix.hitType);
      if (ix.rollModifier != null) ix.rollModifier = normSkill(ix.rollModifier);
      if (item.clipSize && item.ammoPerShot && item.ammoPerShot > item.clipSize) item.ammoPerShot = item.clipSize;
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
  const nodes = cleanNodes(r.nodes);
  // Drop dangling prerequisite edges (an endpoint that isn't a real node) so they
  // can't create phantom tier entries or unreachable links. center-0 is always valid.
  const ids = new Set(nodes.map((n) => n.id));
  ids.add('center-0');
  const edges = cleanEdges(r.edges).filter((e) => ids.has(e.sourceId) && ids.has(e.targetId));
  return { nodes, edges, worldItems: cleanContentItems(r.worldItems) };
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
    createdAt: Number.isFinite(r.createdAt as number) ? (r.createdAt as number) : now,
    updatedAt: Number.isFinite(r.updatedAt as number) ? (r.updatedAt as number) : now,
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
    derivedFrom: cleanDerivedFrom(r.derivedFrom),
  };
}

function cleanDerivedFrom(v: unknown): Worldpack['derivedFrom'] {
  if (!v || typeof v !== 'object') return undefined;
  const d = v as Record<string, unknown>;
  const name = STR(d.name, 80);
  const id = STR(d.id, 40);
  if (!name && !id) return undefined;
  return { id: id ?? '', name: name ?? 'Unknown', author: STR(d.author, 60) ?? '' };
}

/** Total reskin overrides in a pack — a quick "how complete is this" measure. */
export function reskinCount(pack: Worldpack): number {
  return (
    Object.keys(pack.reskins.nodes).length +
    Object.keys(pack.reskins.items).length +
    Object.keys(pack.reskins.terms).length
  );
}

/** How many custom nodes / items a pack carries. */
export function contentCounts(pack: Worldpack): { nodes: number; items: number } {
  const nodes = pack.content?.nodes?.length ?? 0;
  const items = Object.values(pack.content?.worldItems ?? {}).reduce((n, arr) => n + (arr?.length ?? 0), 0);
  return { nodes, items };
}

export type PackKind = 'World' | 'Skill Tree' | 'Item Pack' | 'Reskin' | 'Empty';

/** Classify a pack by what it actually contains — drives the marketplace label
 *  ("sell just a skill tree / item pack / a whole world"). */
export function packKind(pack: Worldpack): PackKind {
  const { nodes, items } = contentCounts(pack);
  if (nodes > 0 && items > 0) return 'World';
  if (nodes > 0) return 'Skill Tree';
  if (items > 0) return 'Item Pack';
  if (reskinCount(pack) > 0) return 'Reskin';
  return 'Empty';
}

/** Extract one slice of a pack's content as a NEW additive pack (fresh id, fork
 *  lineage recorded) — so a creator can package and sell just the skill tree or
 *  just the item pack out of a larger world. */
export function sliceWorldpack(pack: Worldpack, slice: 'tree' | 'items'): Worldpack {
  const content = pack.content ?? { nodes: [], edges: [], worldItems: {} };
  // Deep-clone so editing the slice can't mutate the source pack through shared
  // nested references (normalize only rebuilds top-level fields).
  const sliced =
    slice === 'tree'
      ? { nodes: structuredClone(content.nodes), edges: structuredClone(content.edges), worldItems: {} }
      : { nodes: [], edges: [], worldItems: structuredClone(content.worldItems) };
  return normalizeWorldpack({
    ...pack,
    id: nanoid(10),
    name: `${pack.name} — ${slice === 'tree' ? 'Skill Tree' : 'Item Pack'}`.slice(0, 80),
    baseMode: 'extend', // a slice is additive content layered on the base
    content: sliced,
    reskins: { nodes: {}, items: {}, terms: {} },
    derivedFrom: { id: pack.id, name: pack.name, author: pack.author },
    published: false,
  });
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
