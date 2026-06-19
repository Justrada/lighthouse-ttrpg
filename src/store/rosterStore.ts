import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type { Character } from '@/types';
import type { RosterStore } from './contracts';
import { loadJSON, saveJSON, KEYS } from './persistence';
import { normalizeCharacter } from '@/lib/character';

function persist(characters: Character[]) {
  saveJSON(KEYS.characters, characters);
}

/** Load + normalize persisted characters so legacy/partial data can't crash the app. */
function loadCharacters(): Character[] {
  const raw = loadJSON<unknown[]>(KEYS.characters, []);
  return Array.isArray(raw) ? raw.map((c) => normalizeCharacter(c as Character)) : [];
}

export const useRosterStore = create<RosterStore>()((set, get) => ({
  characters: loadCharacters(),

  load: () => set({ characters: loadCharacters() }),

  get: (id) => get().characters.find((c) => c.id === id),

  upsert: (character) =>
    set((s) => {
      const now = Date.now();
      const exists = s.characters.some((c) => c.id === character.id);
      const next = exists
        ? s.characters.map((c) =>
            c.id === character.id ? { ...character, updatedAt: now } : c,
          )
        : [...s.characters, { ...character, createdAt: character.createdAt ?? now, updatedAt: now }];
      persist(next);
      return { characters: next };
    }),

  remove: (id) =>
    set((s) => {
      const next = s.characters.filter((c) => c.id !== id);
      persist(next);
      return { characters: next };
    }),

  duplicate: (id) =>
    set((s) => {
      const original = s.characters.find((c) => c.id === id);
      if (!original) return {} as Partial<RosterStore>;
      const copy: Character = {
        ...structuredClone(original),
        id: nanoid(10),
        name: `${original.name} (copy)`.slice(0, 40),
        portraitSeed: nanoid(8),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const next = [...s.characters, copy];
      persist(next);
      return { characters: next };
    }),
}));
