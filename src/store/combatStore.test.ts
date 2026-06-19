import { describe, it, expect, beforeEach } from 'vitest';
import { useCombatStore } from './combatStore';
import { useSessionStore } from './sessionStore';
import { useUIStore } from './uiStore';
import type { Combatant, PartyMember, Character, ResolvedAction } from '@/types';

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

describe('combatStore — revive resets death saves (GM heal)', () => {
  it('clears death-save progress when healing a downed combatant above 0', () => {
    const downed = mkCombatant({
      id: 'c1',
      currentHP: 0,
      isUnconscious: true,
      deathSaves: { successes: 1, failures: 2 },
    });
    useCombatStore.getState().startCombat([downed]);
    useCombatStore.getState().adjustResource('c1', 'HP', 10);
    expect(find('c1').currentHP).toBe(10);
    expect(find('c1').isUnconscious).toBe(false);
    expect(find('c1').deathSaves).toEqual({ successes: 0, failures: 0 });
  });
});

describe('combatStore — setCombatantTeam guard', () => {
  it('does not flip allegiance mid-resolution', () => {
    const npc = mkCombatant({ id: 'n1', team: 'npc' });
    useCombatStore.getState().startCombat([npc]);
    useCombatStore.setState((s) => ({ combat: { ...s.combat, phase: 'resolving' } }));
    useCombatStore.getState().setCombatantTeam('n1', 'player');
    expect(find('n1').team).toBe('npc');
  });
});

describe('combatStore — locked orders are immutable', () => {
  it('rejects declare/clear once a combatant is locked', () => {
    const c = mkCombatant({ id: 'c1', team: 'npc' });
    useCombatStore.getState().startCombat([c]);
    useCombatStore.getState().beginRound();
    useCombatStore.getState().declareAction('c1', { actionIndex: 0, actionType: 'Pass' });
    useCombatStore.getState().lockActions('c1', true);
    // edits while locked are ignored
    useCombatStore.getState().declareAction('c1', { actionIndex: 1, actionType: 'Guard' });
    useCombatStore.getState().clearAction('c1', 0);
    expect(combat().declaredActions['c1']).toHaveLength(1);
    expect(combat().declaredActions['c1'][0].actionType).toBe('Pass');
  });
});

describe('combatStore — action-slot cap (anti-cheat)', () => {
  it('clamps a remote declare to the combatant action-slot budget', () => {
    const c = mkCombatant({ id: 'c1', team: 'player', peerId: 'peerA' });
    useSessionStore.setState({ role: 'gm', party: [member('peerA')] });
    useCombatStore.getState().startCombat([c]);
    useCombatStore.getState().beginRound();
    const tooMany = Array.from({ length: 6 }, (_, i) => ({
      actionIndex: i,
      actionType: 'Pass' as const,
    }));
    useCombatStore.getState().applyRemoteDeclare('c1', tooMany);
    // default slot count is 3 -> only indices 0..2 survive
    expect(combat().declaredActions['c1']).toHaveLength(3);
    expect(combat().declaredActions['c1'].every((a) => a.actionIndex < 3)).toBe(true);
  });
});

describe('combatStore — rebindCombatantPeer (reconnect)', () => {
  it('rebinds a combatant to a new peer id by stable character id', () => {
    const c = mkCombatant({ id: 'c1', team: 'player', peerId: 'old-peer', characterId: 'char-1' });
    useCombatStore.getState().startCombat([c]);
    useCombatStore.getState().rebindCombatantPeer('char-1', 'new-peer');
    expect(find('c1').peerId).toBe('new-peer');
  });
});

describe('combatStore — deploy overflow', () => {
  it('gives every combatant a unique position even past a team deploy cap', () => {
    const many = Array.from({ length: 80 }, (_, i) => mkCombatant({ id: `n${i}`, team: 'npc', peerId: null }));
    useCombatStore.getState().startCombat(many);
    const keys = combat().combatants.map((c) => `${c.position.q},${c.position.r}`);
    expect(new Set(keys).size).toBe(80); // no stacking at {0,0}
  });
});

describe('combatStore — double-resolve guard (empty queue)', () => {
  it('two resolveRound calls on an empty queue advance the round only once', async () => {
    const a = mkCombatant({ id: 'a', team: 'player', peerId: null });
    const b = mkCombatant({ id: 'b', team: 'npc', peerId: null });
    useCombatStore.getState().startCombat([a, b]);
    useCombatStore.getState().beginRound();
    const r0 = combat().round;
    await Promise.all([
      useCombatStore.getState().resolveRound(),
      useCombatStore.getState().resolveRound(),
    ]);
    expect(combat().round).toBe(r0 + 1);
  });
});

describe('combatStore — unique combatant ids', () => {
  it('de-dups ids when two combatants share one (same imported character)', () => {
    const a = mkCombatant({ id: 'hero', team: 'player', peerId: 'pA', characterId: 'hero' });
    const b = mkCombatant({ id: 'hero', team: 'player', peerId: 'pB', characterId: 'hero' });
    useCombatStore.getState().startCombat([a, b]);
    const ids = combat().combatants.map((c) => c.id);
    expect(new Set(ids).size).toBe(2); // unique combatant ids
    expect(combat().combatants.every((c) => c.characterId === 'hero')).toBe(true); // characterId preserved
  });
});

describe('combatStore — long rest recovery', () => {
  it('resets death saves and does not raise the dead', () => {
    const downed = mkCombatant({ id: 'd1', currentHP: 0, isUnconscious: true, deathSaves: { successes: 1, failures: 3 } });
    const dead = mkCombatant({ id: 'd2', currentHP: 0, isDead: true });
    useCombatStore.getState().startCombat([downed, dead]);
    useCombatStore.getState().applyRest('long');
    expect(find('d1').currentHP).toBe(find('d1').maxHP);
    expect(find('d1').isUnconscious).toBe(false);
    expect(find('d1').deathSaves).toEqual({ successes: 0, failures: 0 });
    expect(find('d2').isDead).toBe(true); // a long rest doesn't revive a corpse
  });
});

describe('combatStore — rebind ownership guard', () => {
  it('does not rebind a combatant whose owner is still connected', () => {
    const c = mkCombatant({ id: 'c1', team: 'player', peerId: 'owner', characterId: 'char-1' });
    useCombatStore.getState().startCombat([c]);
    // 'owner' still connected → an attacker claiming char-1 must NOT steal it.
    useCombatStore.getState().rebindCombatantPeer('char-1', 'attacker', new Set(['owner', 'attacker']));
    expect(find('c1').peerId).toBe('owner');
    // A genuine reconnect (old owner gone) does rebind.
    useCombatStore.getState().rebindCombatantPeer('char-1', 'newpeer', new Set(['newpeer']));
    expect(find('c1').peerId).toBe('newpeer');
  });
});

describe('combatStore — duplicate-character ownership survives settle', () => {
  it('keeps each shared-character combatant on its own peer after a round resolves', async () => {
    const a = mkCombatant({ id: 'hero', team: 'player', peerId: 'P1', characterId: 'hero' });
    const b = mkCombatant({ id: 'hero', team: 'player', peerId: 'P2', characterId: 'hero' });
    const npc = mkCombatant({ id: 'n1', team: 'npc', peerId: null });
    useSessionStore.setState({ role: 'gm', party: [member('P1'), member('P2')] });
    useCombatStore.getState().startCombat([a, b, npc]);
    useCombatStore.getState().beginRound();
    await useCombatStore.getState().resolveRound();
    const peers = combat().combatants.filter((c) => c.team === 'player').map((c) => c.peerId).sort();
    expect(peers).toEqual(['P1', 'P2']); // not collapsed onto one peer
  });
});

describe('combatStore — rebind binds at most one shared-character unit', () => {
  it('a single returning peer claims only ONE of two shared-character combatants', () => {
    const a = mkCombatant({ id: 'hero', team: 'player', peerId: 'pA', characterId: 'hero' });
    const b = mkCombatant({ id: 'hero', team: 'player', peerId: 'pB', characterId: 'hero' });
    useCombatStore.getState().startCombat([a, b]); // ids de-dup to hero, hero#2

    // Both players dropped; pA reconnects as pA2 (neither old peer in the connected set).
    useCombatStore.getState().rebindCombatantPeer('hero', 'pA2', new Set(['pA2']));
    expect(combat().combatants.filter((c) => c.peerId === 'pA2')).toHaveLength(1); // not both

    // The second player returns as pB2 → claims the remaining orphan, not zero.
    useCombatStore.getState().rebindCombatantPeer('hero', 'pB2', new Set(['pA2', 'pB2']));
    const peers = combat().combatants.map((c) => c.peerId).sort();
    expect(peers).toEqual(['pA2', 'pB2']); // each player controls exactly one unit, no lockout
  });
});

describe('combatStore — reconnect DURING resolution survives the playback loop', () => {
  it('a peer rebind mid-animation is preserved through settle (not reverted to the dead peer)', async () => {
    useUIStore.setState({ reduceMotion: true }); // 180ms per animated step
    const hero = mkCombatant({ id: 'hero', team: 'player', peerId: 'oldP', characterId: 'hero' });
    const ally = mkCombatant({ id: 'ally', team: 'player', peerId: 'P2', characterId: 'ally' });
    const npc = mkCombatant({ id: 'n1', team: 'npc', peerId: null });
    useSessionStore.setState({ role: 'gm', party: [member('oldP'), member('P2')] });
    useCombatStore.getState().startCombat([hero, ally, npc]);
    useCombatStore.getState().beginRound();

    // Three declared Guards => a multi-step animation, so a rebind in an early frame
    // is exposed to being clobbered by a later frame (the bug) unless preserved.
    const guard = (sourceId: string): ResolvedAction =>
      ({ actionIndex: 0, actionType: 'Guard', sourceId, initiative: 0 } as ResolvedAction);
    useCombatStore.getState().declareAction('hero', guard('hero'));
    useCombatStore.getState().declareAction('ally', guard('ally'));
    useCombatStore.getState().declareAction('n1', guard('n1'));

    const done = useCombatStore.getState().resolveRound(); // do NOT await — resolve animates
    await new Promise((r) => setTimeout(r, 90)); // land inside the first frame
    // Player reconnects under a fresh peer id (old peer gone); ally stays connected.
    useCombatStore.getState().rebindCombatantPeer('hero', 'newP', new Set(['newP', 'P2']));
    await done;

    expect(find('hero').peerId).toBe('newP'); // preserved, not reverted to 'oldP'
    expect(find('ally').peerId).toBe('P2'); // untouched
    useUIStore.setState({ reduceMotion: false });
  });
});
