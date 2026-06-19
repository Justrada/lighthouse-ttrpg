import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type { Worldpack } from '@/types';
import type { WorldpackStore } from './contracts';
import { loadJSON, saveJSON, KEYS } from './persistence';
import { normalizeWorldpack } from '@/lib/worldpack';

function loadPacks(): Worldpack[] {
  const raw = loadJSON<unknown[]>(KEYS.worldpacks, []);
  return Array.isArray(raw) ? raw.map((p) => normalizeWorldpack(p)) : [];
}

function loadActive(): string | null {
  return loadJSON<string | null>(KEYS.activeWorldpack, null);
}

export const useWorldpackStore = create<WorldpackStore>()((set, get) => ({
  worldpacks: loadPacks(),
  activeId: loadActive(),

  load: () => set({ worldpacks: loadPacks(), activeId: loadActive() }),

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
      return { worldpacks: next };
    }),

  remove: (id) =>
    set((s) => {
      const next = s.worldpacks.filter((p) => p.id !== id);
      saveJSON(KEYS.worldpacks, next);
      const activeId = s.activeId === id ? null : s.activeId;
      if (activeId !== s.activeId) saveJSON(KEYS.activeWorldpack, activeId);
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
    });
    set((s) => {
      const next = [...s.worldpacks, copy];
      saveJSON(KEYS.worldpacks, next);
      return { worldpacks: next };
    });
    return copy;
  },

  setActive: (id) =>
    set(() => {
      saveJSON(KEYS.activeWorldpack, id);
      return { activeId: id };
    }),

  importPack: (raw) => {
    let parsed: unknown = raw;
    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw);
      } catch {
        return null;
      }
    }
    if (!parsed || typeof parsed !== 'object') return null;
    // Give imports a fresh id so they never clobber an existing local pack.
    const pack = normalizeWorldpack({ ...(parsed as object), id: nanoid(10) });
    set((s) => {
      const next = [...s.worldpacks, pack];
      saveJSON(KEYS.worldpacks, next);
      return { worldpacks: next };
    });
    return pack;
  },
}));
