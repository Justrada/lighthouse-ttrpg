import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type { Character, CoreStatKey, DerivedStats, SkillPointBudget } from '@/types';
import type { DraftStore } from './contracts';
import {
  calculateDerivedStats,
  calculateSkillBudget,
  canLearnSkill,
  isLearned as engineIsLearned,
  applyLearn,
  applyUnlearn,
  getStatCost,
} from '@/engine';
import { findItem } from '@/data/skillTree';
import { useRosterStore } from './rosterStore';

const EMPTY_BUDGET: SkillPointBudget = {
  total: 0,
  spentOnStats: 0,
  spentOnSkills: 0,
  available: 0,
};

const STAT_MIN = 1;
const STAT_MAX = 12;

function freshCharacter(): Character {
  return {
    id: nanoid(10),
    name: '',
    level: 1,
    portraitSeed: nanoid(8),
    coreStats: { mind: 4, body: 4, soul: 4 },
    learnedSkills: ['center-0'],
    skillChoices: {},
    inventory: { armor: null, weapon: null, shield: null, accessories: [], backpack: [] },
    currentHP: 0,
    currentMP: 0,
    currentSP: 0,
    statusEffects: [],
    notes: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/** Recompute derived stats + budget for a draft and refill current resources. */
function derive(draft: Character): { derived: DerivedStats; budget: SkillPointBudget; draft: Character } {
  const derived = calculateDerivedStats(draft);
  const budget = calculateSkillBudget(draft);
  // In the forge a character is always at full health.
  const filled: Character = {
    ...draft,
    currentHP: derived.hp,
    currentMP: derived.mp,
    currentSP: derived.sp,
  };
  return { derived, budget, draft: filled };
}

export const useDraftStore = create<DraftStore>()((set, get) => {
  /** Apply a pure mutation to the draft, then recompute everything. */
  const update = (mutate: (d: Character) => Character) => {
    const current = get().draft;
    if (!current) return;
    const mutated = mutate(structuredClone(current));
    const { derived, budget, draft } = derive(mutated);
    set({ draft, derived, budget });
  };

  return {
    draft: null,
    derived: null,
    budget: EMPTY_BUDGET,

    startNew: () => {
      const { derived, budget, draft } = derive(freshCharacter());
      set({ draft, derived, budget });
    },

    editExisting: (character) => {
      const { derived, budget, draft } = derive(structuredClone(character));
      set({ draft, derived, budget });
    },

    setName: (name) => update((d) => ({ ...d, name })),

    setLevel: (level) => update((d) => ({ ...d, level: Math.max(1, Math.min(20, Math.floor(level) || 1)) })),

    changeStat: (stat: CoreStatKey, delta) =>
      update((d) => {
        const cur = d.coreStats[stat];
        if (delta > 0) {
          const budget = calculateSkillBudget(d);
          if (cur >= STAT_MAX) return d;
          if (budget.available < getStatCost(cur)) return d; // can't afford
          return { ...d, coreStats: { ...d.coreStats, [stat]: cur + 1 } };
        }
        if (cur <= STAT_MIN) return d;
        return { ...d, coreStats: { ...d.coreStats, [stat]: cur - 1 } };
      }),

    learnSkill: (nodeId) =>
      update((d) => {
        const budget = calculateSkillBudget(d);
        if (!canLearnSkill(d, nodeId, budget).ok) return d;
        return applyLearn(d, nodeId);
      }),

    unlearnSkill: (nodeId) => update((d) => applyUnlearn(d, nodeId)),

    canLearn: (nodeId) => {
      const d = get().draft;
      if (!d) return { ok: false, reason: 'No character' };
      return canLearnSkill(d, nodeId, calculateSkillBudget(d));
    },

    isLearned: (nodeId) => {
      const d = get().draft;
      return d ? engineIsLearned(d, nodeId) : false;
    },

    setSkillChoice: (nodeId, effectId, choice) =>
      update((d) => {
        const choices = { ...(d.skillChoices ?? {}) };
        const list = (choices[nodeId] ?? []).filter((c) => c.effectId !== effectId);
        list.push({ effectId, choice });
        choices[nodeId] = list;
        return { ...d, skillChoices: choices };
      }),

    equip: (itemId) =>
      update((d) => {
        const item = findItem(itemId);
        if (!item) return d;
        const inv = structuredClone(d.inventory);
        switch (item.itemType) {
          case 'Armor':
            inv.armor = itemId;
            break;
          case 'Weapon':
            inv.weapon = itemId;
            break;
          case 'Shield':
            inv.shield = itemId;
            break;
          case 'Accessory':
            if (!inv.accessories.includes(itemId)) inv.accessories.push(itemId);
            break;
          default:
            if (!inv.backpack.includes(itemId)) inv.backpack.push(itemId);
        }
        return { ...d, inventory: inv };
      }),

    unequip: (slot, itemId) =>
      update((d) => {
        const inv = structuredClone(d.inventory);
        if (slot === 'armor') inv.armor = null;
        else if (slot === 'weapon') inv.weapon = null;
        else if (slot === 'shield') inv.shield = null;
        else if (slot === 'accessory' && itemId)
          inv.accessories = inv.accessories.filter((id) => id !== itemId);
        return { ...d, inventory: inv };
      }),

    addToBackpack: (itemId) =>
      update((d) => {
        const inv = structuredClone(d.inventory);
        inv.backpack.push(itemId);
        return { ...d, inventory: inv };
      }),

    removeFromBackpack: (itemId) =>
      update((d) => {
        const inv = structuredClone(d.inventory);
        const idx = inv.backpack.indexOf(itemId);
        if (idx >= 0) inv.backpack.splice(idx, 1);
        return { ...d, inventory: inv };
      }),

    commit: () => {
      const d = get().draft;
      if (!d) return null;
      const finalized: Character = { ...d, name: d.name.trim() || 'Unnamed Hero', updatedAt: Date.now() };
      useRosterStore.getState().upsert(finalized);
      return finalized;
    },

    discard: () => set({ draft: null, derived: null, budget: EMPTY_BUDGET }),
  };
});
