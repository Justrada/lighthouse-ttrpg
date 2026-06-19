import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCombatantCharacter } from './useCombatantCharacter';
import { useRosterStore, useSessionStore } from '@/store';
import type { Character, Combatant } from '@/types';

function baseChar(): Character {
  return {
    id: 'hero',
    name: 'Hero',
    level: 3,
    coreStats: { mind: 4, body: 4, soul: 4 },
    learnedSkills: ['center-0'],
    skillChoices: {},
    inventory: { armor: null, weapon: 'wpn-A', shield: null, accessories: [], backpack: ['wpn-B'] },
    currentHP: 40,
    currentMP: 5,
    currentSP: 5,
  } as Character;
}

beforeEach(() => {
  useRosterStore.setState({ characters: [baseChar()] });
  useSessionStore.setState({ party: [], activeCharacter: null });
});

describe('useCombatantCharacter — mid-combat weapon swap', () => {
  it('keeps the displaced weapon swappable after equipping a backpack weapon', () => {
    const combatant = {
      id: 'hero',
      characterId: 'hero',
      peerId: null,
      equippedWeaponId: 'wpn-B',
    } as unknown as Combatant;
    const { result } = renderHook(() => useCombatantCharacter(combatant));
    expect(result.current?.inventory.weapon).toBe('wpn-B'); // now wielding the swap
    expect(result.current?.inventory.backpack).toContain('wpn-A'); // original stays available to swap back
  });
});
