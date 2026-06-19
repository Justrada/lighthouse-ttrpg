import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMyCombatant } from './selectors';
import { useSessionStore } from './sessionStore';
import { useCombatStore } from './combatStore';
import type { Character, Combatant } from '@/types';

function mk(over: Partial<Combatant>): Combatant {
  return {
    id: 'x', peerId: null, name: 'X', team: 'player', position: { q: 0, r: 0 }, characterId: 'hero',
    initiativeBonus: 0, maxHP: 20, maxMP: 5, maxSP: 5, currentHP: 20, currentMP: 5, currentSP: 5,
    ac: 10, statusEffects: [], isUnconscious: false, isDead: false, deathSaves: { successes: 0, failures: 0 },
    ...over,
  } as Combatant;
}

beforeEach(() => {
  useCombatStore.getState().reset();
  useSessionStore.setState({ selfPeerId: null, activeCharacter: null });
});

describe('useMyCombatant', () => {
  it('resolves by peerId even when another combatant shares the characterId', () => {
    const a = mk({ id: 'hero', peerId: 'pA', characterId: 'hero' });
    const b = mk({ id: 'hero#2', peerId: 'pB', characterId: 'hero' });
    useCombatStore.setState((s) => ({ combat: { ...s.combat, combatants: [a, b] } }));
    useSessionStore.setState({ selfPeerId: 'pB', activeCharacter: { id: 'hero' } as Character });
    const { result } = renderHook(() => useMyCombatant());
    expect(result.current?.peerId).toBe('pB');
    expect(result.current?.id).toBe('hero#2');
  });

  it('falls back to characterId when no peer matches (reconnect window)', () => {
    const a = mk({ id: 'hero', peerId: 'old', characterId: 'hero' });
    useCombatStore.setState((s) => ({ combat: { ...s.combat, combatants: [a] } }));
    useSessionStore.setState({ selfPeerId: 'newpeer', activeCharacter: { id: 'hero' } as Character });
    const { result } = renderHook(() => useMyCombatant());
    expect(result.current?.id).toBe('hero');
  });
});
