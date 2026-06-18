import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type { UIStore } from './contracts';
import { loadJSON, saveJSON, KEYS } from './persistence';

const initialPrefs = loadJSON<{ reduceMotion?: boolean }>(KEYS.prefs, {});

export const useUIStore = create<UIStore>()((set, get) => ({
  toasts: [],
  pushToast: (toast) => {
    const id = nanoid(8);
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
    // Auto-dismiss after a beat.
    setTimeout(() => get().dismissToast(id), 4800);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  diceTrayOpen: false,
  toggleDiceTray: (open) => set((s) => ({ diceTrayOpen: open ?? !s.diceTrayOpen })),

  rollFeed: [],
  recordRoll: (roll) => set((s) => ({ rollFeed: [roll, ...s.rollFeed].slice(0, 40) })),

  reduceMotion: initialPrefs.reduceMotion ?? false,
  setReduceMotion: (v) => {
    set({ reduceMotion: v });
    saveJSON(KEYS.prefs, { ...loadJSON(KEYS.prefs, {}), reduceMotion: v });
  },
}));
