import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { Character, Combatant, DerivedStats } from '@/types';
import { calculateDerivedStats } from '@/engine';
import { useSessionStore } from './sessionStore';
import { useCombatStore } from './combatStore';

/** Are we the Game Master in the current session? */
export function useIsGM(): boolean {
  return useSessionStore((s) => s.role === 'gm');
}

/** Memoized derived stats for a character (HP/MP/SP/AC/skills/initiative). */
export function useDerived(character: Character | null | undefined): DerivedStats | null {
  return useMemo(() => (character ? calculateDerivedStats(character) : null), [character]);
}

/** The local player's combatant in the active combat, if any. */
export function useMyCombatant(): Combatant | undefined {
  const selfPeerId = useSessionStore((s) => s.selfPeerId);
  const activeId = useSessionStore((s) => s.activeCharacter?.id);
  return useCombatStore((s) =>
    s.combat.combatants.find(
      (c) =>
        (selfPeerId != null && c.peerId === selfPeerId) ||
        (activeId != null && c.characterId === activeId),
    ),
  );
}

export function usePlayerCombatants(): Combatant[] {
  return useCombatStore(useShallow((s) => s.combat.combatants.filter((c) => c.team === 'player')));
}

export function useNpcCombatants(): Combatant[] {
  return useCombatStore(useShallow((s) => s.combat.combatants.filter((c) => c.team === 'npc')));
}

/** True when it's the declare phase and our combatant still needs to lock in. */
export function useNeedsToDeclare(): boolean {
  const mine = useMyCombatant();
  return useCombatStore((s) => {
    if (!mine || s.combat.phase !== 'declare') return false;
    return !s.combat.lockedActions[mine.id];
  });
}
