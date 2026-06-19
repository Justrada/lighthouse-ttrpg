import { nanoid } from 'nanoid';
import type { ReskinEntry, Worldpack, WorldpackReskins } from '@/types';
import { WORLDFORGE_FEE_RATE } from '@/data/constants';

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
    price: Number.isFinite(r.price as number) ? Math.max(0, Math.trunc(r.price as number)) : 0,
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
  return Math.round(Math.max(0, price) * WORLDFORGE_FEE_RATE);
}

/** What the creator keeps after the platform fee. */
export function creatorPayout(price: number): number {
  return Math.max(0, price) - platformCut(price);
}
