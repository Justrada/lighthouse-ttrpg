import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type { Worldpack } from '@/types';
import type { WorldpackStore } from './contracts';
import { loadJSON, saveJSON, KEYS } from './persistence';
import { normalizeWorldpack } from '@/lib/worldpack';
import { setActiveCatalog, buildActiveCatalog } from '@/data/skillTree';
import { logger } from '@/lib/logger';

function loadPacks(): Worldpack[] {
  const raw = loadJSON<unknown[]>(KEYS.worldpacks, []);
  return Array.isArray(raw) ? raw.map((p) => normalizeWorldpack(p)) : [];
}

function loadActive(): string | null {
  return loadJSON<string | null>(KEYS.activeWorldpack, null);
}

// While a player is in a multiplayer session, the GM's synced System is
// authoritative. We suppress LOCAL catalog application so a player who activates
// or edits a local pack mid-session can't clobber the GM-synced catalog (which
// would desync their combat resolution). Their activeId still updates and is
// restored on leave via ensureActiveCatalog. Set by sessionStore (players only).
let _sessionLocked = false;
export function setWorldpackSessionLock(v: boolean): void {
  _sessionLocked = v;
}

/** Push the active pack's custom content into the resolver registry (base when
 *  there's no active pack or it's overlay-only). Keeps findNode/findItem and the
 *  Forge/combat in sync with the activated System. No-op while a player session
 *  holds the lock (the GM's synced catalog stays authoritative). */
function applyCatalog(packs: Worldpack[], activeId: string | null): void {
  if (_sessionLocked) return;
  const pack = packs.find((p) => p.id === activeId) ?? null;
  setActiveCatalog(pack ? buildActiveCatalog(pack.content, pack.baseMode ?? 'overlay') : null);
}

/** Idempotently apply the persisted active System to the resolver registry.
 *  rosterStore calls this BEFORE it normalizes saved characters — otherwise a
 *  character's custom skills would be dropped by normalizeCharacter (findNode). */
export function ensureActiveCatalog(): void {
  const { worldpacks, activeId } = useWorldpackStore.getState();
  applyCatalog(worldpacks, activeId);
}

export const useWorldpackStore = create<WorldpackStore>()((set, get) => ({
  worldpacks: loadPacks(),
  activeId: loadActive(),

  load: () =>
    set(() => {
      const worldpacks = loadPacks();
      const activeId = loadActive();
      applyCatalog(worldpacks, activeId);
      return { worldpacks, activeId };
    }),

  get: (id) => get().worldpacks.find((p) => p.id === id),

  getActive: () => {
    const { worldpacks, activeId } = get();
    return worldpacks.find((p) => p.id === activeId) ?? null;
  },

  save: (pack) =>
    set((s) => {
      const finalized = normalizeWorldpack({ ...pack, updatedAt: Date.now() });
      const exists = s.worldpacks.some((p) => p.id === finalized.id);
      const next = exists
        ? s.worldpacks.map((p) => (p.id === finalized.id ? finalized : p))
        : [...s.worldpacks, finalized];
      saveJSON(KEYS.worldpacks, next);
      // If the edited pack is the active System, re-apply so content edits take
      // effect live (the Forge/combat see the new nodes/items immediately).
      if (s.activeId === finalized.id) applyCatalog(next, s.activeId);
      return { worldpacks: next };
    }),

  remove: (id) =>
    set((s) => {
      const next = s.worldpacks.filter((p) => p.id !== id);
      saveJSON(KEYS.worldpacks, next);
      const activeId = s.activeId === id ? null : s.activeId;
      if (activeId !== s.activeId) {
        saveJSON(KEYS.activeWorldpack, activeId);
        applyCatalog(next, activeId); // dropped the active pack → fall back to base
      }
      return { worldpacks: next, activeId };
    }),

  duplicate: (id) => {
    const orig = get().worldpacks.find((p) => p.id === id);
    if (!orig) return null;
    const copy = normalizeWorldpack({
      ...structuredClone(orig),
      id: nanoid(10),
      name: `${orig.name} (copy)`.slice(0, 80),
      published: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      // Record lineage so a fork credits the original creator.
      derivedFrom: { id: orig.id, name: orig.name, author: orig.author },
    });
    set((s) => {
      const next = [...s.worldpacks, copy];
      saveJSON(KEYS.worldpacks, next);
      return { worldpacks: next };
    });
    return copy;
  },

  setActive: (id) =>
    set((s) => {
      saveJSON(KEYS.activeWorldpack, id);
      applyCatalog(s.worldpacks, id);
      return { activeId: id };
    }),

  importPack: (raw) => {
    let parsed: unknown = raw;
    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        logger.warn('worldpack', 'import failed — not valid JSON', err);
        return null;
      }
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    // Give imports a fresh id so they never clobber an existing local pack, and
    // land them as private drafts — the importer hasn't listed them for sale.
    const pack = normalizeWorldpack({ ...(parsed as object), id: nanoid(10), published: false });
    set((s) => {
      const next = [...s.worldpacks, pack];
      saveJSON(KEYS.worldpacks, next);
      return { worldpacks: next };
    });
    return pack;
  },
}));

// Apply the persisted active System to the resolver registry as soon as this
// module loads — rosterStore imports `ensureActiveCatalog`, which forces this to
// run before any saved character is normalized, so custom skills survive load.
ensureActiveCatalog();
