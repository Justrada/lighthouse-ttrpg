import { describe, it, expect, beforeEach } from 'vitest';
import { useCombatStore } from './combatStore';
import { useSessionStore } from './sessionStore';
import { edgeId, hexKey, OCCUPIES } from '@/engine';
import type { Battlefield, Combatant } from '@/types';

const at = (q: number, r: number) => ({ q, r });

function mkCombatant(over: Partial<Combatant> & { id: string }): Combatant {
  return {
    peerId: null,
    name: over.id,
    team: 'player',
    position: at(0, 0),
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

const combat = () => useCombatStore.getState().combat;
const posOf = (id: string) => combat().combatants.find((c) => c.id === id)!.position;

beforeEach(() => {
  useCombatStore.getState().reset();
  useSessionStore.setState({ role: 'gm', party: [] });
});

describe('staging a fight on a map-derived arena', () => {
  it('keeps every combatant inside a small arena instead of the default 18x14', () => {
    const field: Battlefield = { dims: { cols: 6, rows: 6 }, label: 'The Salt Lantern' };
    useCombatStore.getState().startCombat(
      [mkCombatant({ id: 'a' }), mkCombatant({ id: 'b', team: 'npc' })],
      field,
    );
    for (const c of combat().combatants) {
      // odd-r offset: axial q for a 6x6 board spans roughly -2..5, r 0..5
      expect(c.position.r).toBeGreaterThanOrEqual(0);
      expect(c.position.r).toBeLessThan(6);
    }
  });

  it('stores the battlefield on the combat state so it rides every snapshot', () => {
    const field: Battlefield = { dims: { cols: 8, rows: 8 }, walls: [edgeId(at(2, 2), 0)] };
    useCombatStore.getState().startCombat([mkCombatant({ id: 'a' })], field);
    expect(combat().battlefield).toEqual(field);
  });

  it('leaves battlefield absent for an ordinary fight', () => {
    useCombatStore.getState().startCombat([mkCombatant({ id: 'a' })]);
    expect(combat().battlefield).toBeUndefined();
    expect(combat().groupId).toBeUndefined();
  });

  it('deploys each team into the zones the map nominated', () => {
    const field: Battlefield = {
      dims: { cols: 10, rows: 10 },
      zones: { player: [at(0, 9)], npc: [at(0, 0)] },
    };
    useCombatStore.getState().startCombat(
      [mkCombatant({ id: 'hero' }), mkCombatant({ id: 'foe', team: 'npc' })],
      field,
    );
    expect(posOf('hero')).toEqual(at(0, 9));
    expect(posOf('foe')).toEqual(at(0, 0));
  });

  it('does not spill an overflowing team into solid terrain', () => {
    // One zone hex for two heroes: the second falls through to the overflow
    // scan, which must skip the pillar rather than standing inside it.
    const free = at(0, 0);
    const dims = { cols: 4, rows: 4 };
    const allButOne: string[] = [];
    for (let r = 0; r < dims.rows; r += 1) {
      for (let col = 0; col < dims.cols; col += 1) {
        const q = col - ((r - (r & 1)) >> 1);
        const k = hexKey({ q, r });
        if (k !== hexKey(free)) allButOne.push(k);
      }
    }
    const field: Battlefield = {
      dims,
      solid: allButOne,
      zones: { player: [at(2, 2)], npc: [] },
    };
    useCombatStore.getState().startCombat(
      [mkCombatant({ id: 'first' }), mkCombatant({ id: 'second' })],
      field,
    );
    expect(posOf('first')).toEqual(at(2, 2)); // its nominated zone hex
    expect(posOf('second')).toEqual(free); // the only hex that isn't solid
  });

  it('names the place in the opening log line', () => {
    useCombatStore.getState().startCombat([mkCombatant({ id: 'a' })], {
      dims: { cols: 8, rows: 8 },
      label: 'The Salt Lantern — common room',
    });
    expect(combat().log[0].text).toContain('The Salt Lantern');
  });

  it('carries a group id for a split party', () => {
    useCombatStore.getState().startCombat([mkCombatant({ id: 'a' })], undefined, 'vanguard');
    expect(combat().groupId).toBe('vanguard');
  });
});

describe('occupancy is one rule everywhere', () => {
  it('a downed body blocks; a corpse does not', () => {
    expect(OCCUPIES({ isDead: false })).toBe(true);
    expect(OCCUPIES({ isDead: true })).toBe(false);
  });

  it('the GM cannot drop a combatant onto an unconscious one', () => {
    // The engine used to test `currentHP > 0` here while the store and board
    // tested `!isDead`, so a mover could walk onto a downed body and the board's
    // hex→combatant map would silently hide one of them.
    const downed = mkCombatant({
      id: 'downed',
      currentHP: 0,
      isUnconscious: true,
      position: at(3, 3),
    });
    const mover = mkCombatant({ id: 'mover', position: at(0, 0) });
    useCombatStore.getState().startCombat([downed, mover]);
    const target = combat().combatants.find((c) => c.id === 'downed')!.position;

    useCombatStore.getState().placeCombatant('mover', target);
    expect(posOf('mover')).not.toEqual(target);
  });
});

