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
  return useCombatStore((s) => {
    const cs = s.combat.combatants;
    // peerId is the definitive per-connection identity and must win; the
    // characterId fallback only covers the reconnect window before a fresh peer
    // id is bound. (Two players sharing one character id would otherwise resolve
    // to each other's combatant.)
    const byPeer = selfPeerId != null ? cs.find((c) => c.peerId === selfPeerId) : undefined;
    if (byPeer) return byPeer;
    return activeId != null ? cs.find((c) => c.characterId === activeId) : undefined;
  });
}

export function usePlayerCombatants(): Combatant[] {
  return useCombatStore(useShallow((s) => s.combat.combatants.filter((c) => c.team === 'player')));
}

export function useNpcCombatants(): Combatant[] {
  return useCombatStore(useShallow((s) => s.combat.combatants.filter((c) => c.team === 'npc')));
}

/**
 * Every combatant the GM may order: any unit NOT driven by a *connected* player —
 * i.e. enemies, GM-controlled allies, and (when no one is connected to that slot)
 * player tokens too. This is what powers the GM's "order anyone" roster.
 */
export function useGMControlledCombatants(): Combatant[] {
  const party = useSessionStore((s) => s.party);
  const combatants = useCombatStore((s) => s.combat.combatants);
  return useMemo(() => {
    const peers = new Set(party.map((m) => m.peerId));
    return combatants.filter((c) => c.peerId == null || !peers.has(c.peerId));
  }, [party, combatants]);
}

/** True when it's the declare phase and our combatant still needs to lock in. */
export function useNeedsToDeclare(): boolean {
  const mine = useMyCombatant();
  return useCombatStore((s) => {
    if (!mine || s.combat.phase !== 'declare') return false;
    return !s.combat.lockedActions[mine.id];
  });
}
