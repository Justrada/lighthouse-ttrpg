import { describe, it, expect, beforeEach } from 'vitest';
import { useCombatStore } from './combatStore';
import { useSessionStore } from './sessionStore';
import type { Combatant, PartyMember, Character } from '@/types';

function mkCombatant(over: Partial<Combatant>): Combatant {
  return {
    id: 'c1',
    peerId: null,
    name: 'Combatant',
    team: 'player',
    position: { q: 0, r: 0 },
    initiativeBonus: 0,
    maxHP: 20,
    maxMP: 5,
    maxSP: 5,
    currentHP: 20,
    currentMP: 5,
    currentSP: 5,
    ac: 10,
    statusEffects: [],
    isUnconscious: false,
    isDead: false,
    deathSaves: { successes: 0, failures: 0 },
    ...over,
  };
}

const member = (peerId: string): PartyMember => ({
  peerId,
  name: peerId,
  character: {} as Character,
  status: 'connected',
  lastSeen: 0,
});

const combat = () => useCombatStore.getState().combat;
const find = (id: string) => combat().combatants.find((c) => c.id === id)!;

beforeEach(() => {
  useCombatStore.getState().reset();
  useSessionStore.setState({ role: 'gm', party: [], transport: null });
});

describe('combatStore — deadlock guard (allLocked)', () => {
  it('ignores dead, unconscious, and disconnected combatants', () => {
    const connected = mkCombatant({ id: 'p1', peerId: 'peerA', team: 'player' });
    const downed = mkCombatant({ id: 'p2', peerId: 'peerB', team: 'player', isUnconscious: true });
    const gone = mkCombatant({ id: 'p3', peerId: 'peerGONE', team: 'player' });
    const dead = mkCombatant({ id: 'p4', peerId: 'peerC', team: 'player', isDead: true });
    const npc = mkCombatant({ id: 'n1', peerId: null, team: 'npc' });

    // Only peerA and peerC remain in the party (peerB downed, peerGONE disconnected).
    useSessionStore.setState({ role: 'gm', party: [member('peerA'), member('peerC')] });
    useCombatStore.getState().startCombat([connected, downed, gone, dead, npc]);
    useCombatStore.getState().beginRound(); // leave setup → declare so locks apply

    // Must-lock set should be just p1 (connected player) and n1 (NPC).
    expect(useCombatStore.getState().allLocked()).toBe(false);
    useCombatStore.getState().lockActions('p1', true);
    expect(useCombatStore.getState().allLocked()).toBe(false);
    useCombatStore.getState().lockActions('n1', true);
    expect(useCombatStore.getState().allLocked()).toBe(true); // downed/disconnected don't block
  });
});

describe('combatStore — adjustResource', () => {
  it('rejects non-finite deltas (no NaN corruption)', () => {
    useCombatStore.getState().startCombat([mkCombatant({ id: 'c1', currentHP: 10 })]);
    useCombatStore.getState().adjustResource('c1', 'HP', NaN);
    expect(find('c1').currentHP).toBe(10);
    useCombatStore.getState().adjustResource('c1', 'HP', Infinity);
    expect(find('c1').currentHP).toBe(10);
  });

  it('clamps to [0, max] and toggles unconscious at 0 HP', () => {
    useCombatStore.getState().startCombat([mkCombatant({ id: 'c1', currentHP: 10, maxHP: 20 })]);
    useCombatStore.getState().adjustResource('c1', 'HP', 100);
    expect(find('c1').currentHP).toBe(20);
    useCombatStore.getState().adjustResource('c1', 'HP', -100);
    expect(find('c1').currentHP).toBe(0);
    expect(find('c1').isUnconscious).toBe(true);
    useCombatStore.getState().adjustResource('c1', 'HP', 5);
    expect(find('c1').isUnconscious).toBe(false);
  });
});

describe('combatStore — resolving-phase guard', () => {
  it('blocks resource/rest/condition mutations while resolving', () => {
    useCombatStore.getState().startCombat([mkCombatant({ id: 'c1', currentHP: 10, currentMP: 0 })]);
    useCombatStore.setState((s) => ({ combat: { ...s.combat, phase: 'resolving' } }));
    useCombatStore.getState().adjustResource('c1', 'HP', -5);
    useCombatStore.getState().applyRest('long', 'c1');
    expect(find('c1').currentHP).toBe(10);
    expect(find('c1').currentMP).toBe(0);
  });
});

describe('combatStore — endCombat', () => {
  it('resets synchronously so a resolve loop cannot resurrect it', () => {
    useCombatStore.getState().startCombat([mkCombatant({ id: 'c1' })]);
    expect(combat().isActive).toBe(true);
    useCombatStore.getState().endCombat();
    expect(combat().isActive).toBe(false);
    expect(combat().combatants).toHaveLength(0);
  });
});

describe('combatStore — applyRest scoping', () => {
  it('targets a single combatant when an id is given', () => {
    const a = mkCombatant({ id: 'a', team: 'player', currentMP: 0, maxMP: 10 });
    const b = mkCombatant({ id: 'b', team: 'player', currentMP: 0, maxMP: 10 });
    useCombatStore.getState().startCombat([a, b]);
    useCombatStore.getState().applyRest('long', 'a');
    expect(find('a').currentMP).toBe(10);
    expect(find('b').currentMP).toBe(0);
  });
});
