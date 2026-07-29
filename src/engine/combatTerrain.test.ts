import { describe, it, expect, afterEach } from 'vitest';
import type { Battlefield, Combatant, CombatState, ResolvedAction, SkillNode } from '@/types';
import { isTargetInRange, resolveAction } from './combat';
import { compileTerrain, edgeId, hexKey } from './hex';
import { setActiveCatalog, buildActiveCatalog, resetActiveCatalog } from '@/data/skillTree';

const at = (q: number, r: number) => ({ q, r });

const mkCombatant = (o: Partial<Combatant> & { id: string }): Combatant => ({
  peerId: null,
  name: o.id,
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
  ...o,
});

const mkState = (combatants: Combatant[], battlefield?: Battlefield): CombatState => ({
  isActive: true,
  phase: 'declare',
  round: 1,
  battlefield,
  combatants,
  declaredActions: {},
  lockedActions: {},
  resolutionQueue: [],
  activeResolutionIndex: -1,
  log: [],
});

const move = (sourceId: string, targetHex: { q: number; r: number }): ResolvedAction => ({
  actionIndex: 0,
  actionType: 'Move',
  targetHex,
  sourceId,
  sourceTeam: 'player',
  initiative: 10,
});

const posOf = (state: CombatState, id: string) => state.combatants.find((c) => c.id === id)!.position;

describe('battlefield dimensions', () => {
  it('confines movement to a custom battlefield rather than the default arena', () => {
    // A cramped 4x4 room: a move aimed well outside it must stop at its edge.
    const hero = mkCombatant({ id: 'hero', position: at(0, 0) });
    const state = mkState([hero], { dims: { cols: 4, rows: 4 } });
    const { state: after } = resolveAction(state, move('hero', at(15, 0)));
    expect(posOf(after, 'hero').q).toBeLessThanOrEqual(3);
  });

  it('still uses the default arena when no battlefield is supplied', () => {
    const hero = mkCombatant({ id: 'hero', position: at(0, 0) });
    const { state: after } = resolveAction(mkState([hero]), move('hero', at(15, 0)));
    expect(posOf(after, 'hero').q).toBeGreaterThan(3);
  });
});

describe('walls block movement', () => {
  it('a Move cannot cross a walled border', () => {
    const hero = mkCombatant({ id: 'hero', position: at(2, 2) });
    // Seal the hex completely: the hero has nowhere to go.
    const walls = Array.from({ length: 6 }, (_, d) => edgeId(at(2, 2), d));
    const state = mkState([hero], { dims: { cols: 8, rows: 8 }, walls });
    const { state: after, log } = resolveAction(state, move('hero', at(6, 2)));
    expect(posOf(after, 'hero')).toEqual(at(2, 2));
    expect(log.map((l) => l.text).join(' ')).toContain('cannot move');
  });

  it('a Move routes around a wall to reach the far side', () => {
    const hero = mkCombatant({ id: 'hero', position: at(2, 2) });
    const goal = at(3, 2);
    const state = mkState([hero], {
      dims: { cols: 8, rows: 8 },
      walls: [edgeId(at(2, 2), 0)], // only the direct border is walled
    });
    const { state: after } = resolveAction(state, move('hero', goal));
    expect(posOf(after, 'hero')).toEqual(goal);
  });

  it('a solid hex is not a legal destination', () => {
    const hero = mkCombatant({ id: 'hero', position: at(2, 2) });
    const pillar = at(3, 2);
    const state = mkState([hero], { dims: { cols: 8, rows: 8 }, solid: [hexKey(pillar)] });
    const { state: after } = resolveAction(state, move('hero', pillar));
    expect(posOf(after, 'hero')).not.toEqual(pillar);
  });
});

describe('line of sight gates targeting', () => {
  const hero = mkCombatant({ id: 'hero', position: at(2, 2) });
  const foe = mkCombatant({ id: 'foe', team: 'npc', position: at(3, 2) });
  const wall = compileTerrain({ dims: { cols: 8, rows: 8 }, walls: [edgeId(at(2, 2), 0)] });

  it('a target in range but behind a wall is not targetable', () => {
    expect(isTargetInRange(hero, foe, 'Melee')).toBe(true);
    expect(isTargetInRange(hero, foe, 'Melee', wall)).toBe(false);
  });

  it('an open door restores the shot; a closed one does not', () => {
    const id = String(edgeId(at(2, 2), 0));
    const open = compileTerrain({ dims: { cols: 8, rows: 8 }, doors: { [id]: 'open' } });
    const shut = compileTerrain({ dims: { cols: 8, rows: 8 }, doors: { [id]: 'locked' } });
    expect(isTargetInRange(hero, foe, 'Melee', open)).toBe(true);
    expect(isTargetInRange(hero, foe, 'Melee', shut)).toBe(false);
  });

  it('unbounded "Battlefield" range still respects walls', () => {
    expect(isTargetInRange(hero, foe, 'Battlefield')).toBe(true);
    expect(isTargetInRange(hero, foe, 'Battlefield', wall)).toBe(false);
  });

  it('"Self" is a team check and is never gated by geometry', () => {
    const ally = mkCombatant({ id: 'ally', position: at(7, 7) });
    expect(isTargetInRange(hero, ally, 'Self', wall)).toBe(true);
  });
});

describe('forced movement respects walls', () => {
  // Forced movement walks its OWN step loop rather than going through
  // reachableHexes, so it is the one path that would silently keep shoving
  // combatants through solid stone if terrain weren't threaded into it.
  const SHOVE_NODE = {
    id: 'shove-node',
    x: 0,
    y: 0,
    label: 'Shove',
    description: '',
    isCenter: false,
    linkedItem: {
      id: 'shove',
      type: 'Ability',
      name: 'Shove',
      description: '',
      range: 'Melee',
      aoe: 'Single Target',
      hitType: 'Auto Hit',
      combatUse: true,
      // `rows` is the engine's hop count for a shove (see applyEffect's Move Target).
      effects: [{ id: 'e1', type: 'Move Target', direction: 'Away From', rows: 3 }],
    },
  } as unknown as SkillNode;

  const shove = (): ResolvedAction => ({
    actionIndex: 0,
    actionType: 'Use Ability',
    actionId: 'shove-node',
    sourceId: 'shover',
    targetId: 'victim',
    sourceTeam: 'player',
    initiative: 10,
  });

  const runShove = (battlefield: Battlefield) => {
    setActiveCatalog(buildActiveCatalog({ nodes: [SHOVE_NODE], edges: [], worldItems: {} }, 'extend'));
    const shover = mkCombatant({ id: 'shover', position: at(1, 2) });
    const victim = mkCombatant({ id: 'victim', team: 'npc', position: at(2, 2) });
    return resolveAction(mkState([shover, victim], battlefield), shove(), () => 0.5);
  };

  afterEach(() => resetActiveCatalog());

  it('pushes freely across open ground', () => {
    const { state } = runShove({ dims: { cols: 8, rows: 8 } });
    expect(posOf(state, 'victim').q).toBeGreaterThan(2);
  });

  it('stops at a wall instead of shoving through solid stone', () => {
    const { state } = runShove({
      dims: { cols: 8, rows: 8 },
      walls: [edgeId(at(2, 2), 0)], // wall immediately behind the victim
    });
    expect(posOf(state, 'victim')).toEqual(at(2, 2));
  });

  it('stops at a solid hex', () => {
    const { state } = runShove({ dims: { cols: 8, rows: 8 }, solid: [hexKey(at(3, 2))] });
    expect(posOf(state, 'victim')).toEqual(at(2, 2));
  });
});
