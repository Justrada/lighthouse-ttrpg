import { describe, it, expect, afterEach } from 'vitest';
import type { Character, CombatState, Combatant, ResolvedAction, WorldItem } from '@/types';
import { createCombatant, resolveAction } from './combat';
import { setActiveCatalog, buildActiveCatalog, resetActiveCatalog } from '@/data/skillTree';
import type { Rng } from './dice';

const maxRng: Rng = () => 0.999999; // always hits; 1d6 -> 6

const weapon = (over: Partial<WorldItem>): WorldItem =>
  ({
    id: 'w', type: 'Inventory Item', name: 'W', description: '', itemType: 'Weapon', range: 'Far',
    damage: '1d6', rollModifier: 'Physical',
    effects: [{ id: 'e', type: 'Apply Damage', useWeaponDamage: true, additionalDamage: '1d6' }],
    ...over,
  }) as WorldItem;

const GUN = weapon({ id: 'gun', name: 'Blaster', clipSize: 3, ammoPerShot: 1, shots: 1, reserveAmmo: 6 });
const AUTOGUN = weapon({ id: 'autogun', name: 'Repeater', clipSize: 6, ammoPerShot: 1, shots: 3 });
const BLADE = weapon({ id: 'blade', name: 'Blade', range: 'Melee' }); // no clipSize → no ammo

afterEach(() => resetActiveCatalog());

function setup(weaponId: string): { state: CombatState; atk: Combatant } {
  setActiveCatalog(buildActiveCatalog({ nodes: [], edges: [], worldItems: { weapons: [GUN, AUTOGUN, BLADE] } }, 'extend'));
  const mk = (id: string, w?: string): Character =>
    ({
      id, name: id, level: 3, coreStats: { mind: 6, body: 6, soul: 6 }, learnedSkills: ['center-0'],
      inventory: { armor: null, weapon: w ?? null, shield: null, accessories: [], backpack: [] },
      currentHP: 100, currentMP: 50, currentSP: 50,
    }) as Character;
  const atk = createCombatant(mk('atk', weaponId), { team: 'player', position: { q: 0, r: 0 } });
  const foe = createCombatant(mk('foe'), { team: 'npc', position: { q: 1, r: 0 } });
  foe.currentHP = 100; foe.maxHP = 100;
  return {
    state: {
      isActive: true, phase: 'resolving', round: 1, combatants: [atk, foe],
      declaredActions: {}, lockedActions: {}, resolutionQueue: [], activeResolutionIndex: -1, log: [],
    },
    atk,
  };
}

const fire = (wid: string): ResolvedAction =>
  ({ actionIndex: 0, actionType: 'Weapon Attack', sourceId: 'atk', targetId: 'foe', actionId: wid, initiative: 1 }) as ResolvedAction;
const reload = (wid: string): ResolvedAction =>
  ({ actionIndex: 0, actionType: 'Reload', sourceId: 'atk', actionId: wid, initiative: 1 }) as ResolvedAction;

const atkOf = (s: CombatState) => s.combatants.find((c) => c.id === 'atk')!;
const foeOf = (s: CombatState) => s.combatants.find((c) => c.id === 'foe')!;

describe('weapon ammo', () => {
  it('loads a full clip at combat start', () => {
    const { atk } = setup('gun');
    expect(atk.ammo?.gun).toBe(3);
    expect(atk.ammoReserve?.gun).toBe(6);
  });

  it('a shot consumes one round and deals damage', () => {
    const { state } = setup('gun');
    const after = resolveAction(state, fire('gun'), maxRng).state;
    expect(atkOf(after).ammo?.gun).toBe(2);
    expect(foeOf(after).currentHP).toBeLessThan(100);
  });

  it('an empty clip blocks the attack (no damage) until reloaded', () => {
    const { state } = setup('gun');
    atkOf(state).ammo!.gun = 0;
    const after = resolveAction(state, fire('gun'), maxRng);
    expect(foeOf(after.state).currentHP).toBe(100); // nothing fired
    expect(after.log.some((l) => /empty/i.test(l.text))).toBe(true);
  });

  it('reload refills the clip from a finite reserve', () => {
    const { state } = setup('gun');
    atkOf(state).ammo!.gun = 0;
    atkOf(state).ammoReserve!.gun = 6;
    const after = resolveAction(state, reload('gun'), maxRng).state;
    expect(atkOf(after).ammo?.gun).toBe(3); // clip full
    expect(atkOf(after).ammoReserve?.gun).toBe(3); // 6 - 3 drawn
  });

  it('a finite reserve runs dry — reload draws what it can, then nothing', () => {
    const { state } = setup('gun');
    atkOf(state).ammo!.gun = 0;
    atkOf(state).ammoReserve!.gun = 2;
    const s1 = resolveAction(state, reload('gun'), maxRng).state;
    expect(atkOf(s1).ammo?.gun).toBe(2); // drew min(need 3, reserve 2)
    expect(atkOf(s1).ammoReserve?.gun).toBe(0);
    const s2 = resolveAction(s1, reload('gun'), maxRng);
    expect(atkOf(s2.state).ammo?.gun).toBe(2); // unchanged, reserve empty
    expect(s2.log.some((l) => /out of ammo/i.test(l.text))).toBe(true);
  });

  it('multi-shot fires several rounds in one action', () => {
    const { state } = setup('autogun');
    expect(atkOf(state).ammo?.autogun).toBe(6);
    const after = resolveAction(state, fire('autogun'), maxRng);
    expect(atkOf(after.state).ammo?.autogun).toBe(3); // 6 - 3 shots
    const hits = after.log.filter((l) => /takes \d+ damage/.test(l.text)).length;
    expect(hits).toBe(3); // three separate shots resolved
  });

  it('a burst stops when the clip runs dry mid-action', () => {
    const { state } = setup('autogun');
    atkOf(state).ammo!.autogun = 2; // only 2 rounds for a 3-shot burst
    const after = resolveAction(state, fire('autogun'), maxRng);
    expect(atkOf(after.state).ammo?.autogun).toBe(0);
    expect(after.log.filter((l) => /takes \d+ damage/.test(l.text)).length).toBe(2);
  });

  it('a no-ammo weapon fires freely and tracks no clip', () => {
    const { state } = setup('blade');
    expect(atkOf(state).ammo?.blade).toBeUndefined();
    let s = state;
    for (let i = 0; i < 5; i += 1) s = resolveAction(s, fire('blade'), maxRng).state;
    expect(foeOf(s).currentHP).toBeLessThan(100); // kept swinging
    expect(atkOf(s).ammo?.blade).toBeUndefined();
  });

  // Regression: a kill before the last shot must not waste an ammo round.
  it('does not over-debit ammo when the kill lands before the final shot', () => {
    const { state } = setup('autogun'); // shots:3, clipSize:6
    foeOf(state).currentHP = 1;
    foeOf(state).maxHP = 1; // dies on shot 1
    const after = resolveAction(state, fire('autogun'), maxRng);
    expect(after.log.filter((l) => /takes \d+ damage/.test(l.text)).length).toBe(1); // burst stopped
    expect(atkOf(after.state).ammo?.autogun).toBe(5); // 6 - 1 round (not 4)
  });
});

describe('multi-shot AOE burst', () => {
  const scatter = {
    id: 'scatter', type: 'Inventory Item', name: 'Scatter', description: '', itemType: 'Weapon',
    range: 'Battlefield', damage: '1d6', rollModifier: 'Physical', hitType: 'Auto Hit', aoe: 'AOE 4',
    clipSize: 9, ammoPerShot: 1, shots: 3,
    effects: [{ id: 'e', type: 'Apply Damage', useWeaponDamage: false, additionalDamage: '1d6' }],
  } as unknown as WorldItem;

  const ch = (id: string, w?: string): Character =>
    ({
      id, name: id, level: 3, coreStats: { mind: 6, body: 6, soul: 6 }, learnedSkills: ['center-0'],
      inventory: { armor: null, weapon: w ?? null, shield: null, accessories: [], backpack: [] },
      currentHP: 100, currentMP: 50, currentSP: 50,
    }) as Character;

  it('keeps hitting a live bystander after the primary target dies mid-burst', () => {
    setActiveCatalog(buildActiveCatalog({ nodes: [], edges: [], worldItems: { weapons: [scatter] } }, 'extend'));
    const atk = createCombatant(ch('atk', 'scatter'), { team: 'player', position: { q: 0, r: 0 } });
    const primary = createCombatant(ch('primary'), { team: 'npc', position: { q: 5, r: 0 } });
    const bystander = createCombatant(ch('bystander'), { team: 'npc', position: { q: 6, r: 0 } }); // dist 1 from primary, in radius
    primary.currentHP = 1; primary.maxHP = 1; // dies on shot 1
    bystander.currentHP = 100000; bystander.maxHP = 100000;
    const state: CombatState = {
      isActive: true, phase: 'resolving', round: 1, combatants: [atk, primary, bystander],
      declaredActions: {}, lockedActions: {}, resolutionQueue: [], activeResolutionIndex: -1, log: [],
    };
    const act = { actionIndex: 0, actionType: 'Weapon Attack', sourceId: 'atk', targetId: 'primary', actionId: 'scatter', initiative: 1 } as ResolvedAction;
    const after = resolveAction(state, act, maxRng);
    const bystanderHits = after.log.filter((l) => /bystander takes \d+ damage/.test(l.text)).length;
    expect(bystanderHits).toBe(3); // all 3 shots land on the survivor (burst not aborted by primary's death)
  });
});
