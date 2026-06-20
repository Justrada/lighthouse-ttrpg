import { describe, it, expect, afterEach } from 'vitest';
import type {
  WorldpackContent,
  SkillNode,
  CombatState,
  Character,
  ResolvedAction,
} from '@/types';
import {
  findNode,
  childrenOf,
  prerequisitesOf,
  buildActiveCatalog,
  setActiveCatalog,
  resetActiveCatalog,
} from './skillTree';
import { createCombatant, resolveAction } from '@/engine/combat';
import type { Rng } from '@/engine/dice';

// Always restore base so one test's active System can't leak into another.
afterEach(() => resetActiveCatalog());

const node = (id: string, over: Partial<SkillNode> = {}): SkillNode => ({
  id, x: 0, y: 0, label: id, description: '', isCenter: false, linkedItem: null, ...over,
});

const content = (over: Partial<WorldpackContent> = {}): WorldpackContent => ({
  nodes: [], edges: [], worldItems: {}, ...over,
});

describe('active-catalog resolution', () => {
  it('overlay / empty content resolves identically to base', () => {
    setActiveCatalog(buildActiveCatalog(content(), 'overlay'));
    expect(findNode('center-0')).toBeDefined();
    expect(findNode('node-1')).toBeDefined(); // a base ability
    expect(findNode('custom-x')).toBeUndefined();
  });

  it('extend adds custom content while base still resolves', () => {
    const custom = content({
      nodes: [
        node('custom-fireball', {
          label: 'Custom Fireball',
          linkedItem: { id: 'cf', type: 'Ability', name: 'CF', description: '', effects: [] } as never,
        }),
      ],
      edges: [{ id: 'e1', sourceId: 'center-0', targetId: 'custom-fireball' }],
    });
    setActiveCatalog(buildActiveCatalog(custom, 'extend'));
    expect(findNode('custom-fireball')?.label).toBe('Custom Fireball');
    expect(findNode('node-1')).toBeDefined(); // base preserved
    expect(childrenOf('center-0').some((n) => n.id === 'custom-fireball')).toBe(true);
    expect(prerequisitesOf('custom-fireball')).toContain('center-0');
  });

  it('extend: a custom node OVERRIDES a base node of the same id', () => {
    const baseLabel = findNode('node-1')?.label;
    setActiveCatalog(buildActiveCatalog(content({ nodes: [node('node-1', { label: 'REBALANCED' })] }), 'extend'));
    expect(findNode('node-1')?.label).toBe('REBALANCED');
    expect(findNode('node-1')?.label).not.toBe(baseLabel);
  });

  it('replace hides base and injects center-0', () => {
    setActiveCatalog(buildActiveCatalog(content({ nodes: [node('only-node', { label: 'Only' })] }), 'replace'));
    expect(findNode('node-1')).toBeUndefined(); // base hidden
    expect(findNode('only-node')?.label).toBe('Only');
    expect(findNode('center-0')).toBeDefined(); // injected so learned-skill seeding still works
  });

  it('resetActiveCatalog restores base', () => {
    setActiveCatalog(buildActiveCatalog(content({ nodes: [node('temp')] }), 'replace'));
    resetActiveCatalog();
    expect(findNode('node-1')).toBeDefined();
    expect(findNode('temp')).toBeUndefined();
  });
});

describe('custom content resolves in the pure engine, deterministically', () => {
  const mkChar = (id: string): Character =>
    ({
      id, name: id, level: 3, coreStats: { mind: 6, body: 6, soul: 6 }, learnedSkills: ['center-0'],
      inventory: { armor: null, weapon: null, shield: null, accessories: [], backpack: [] },
      currentHP: 50, currentMP: 50, currentSP: 50,
    }) as Character;

  it('a custom Auto-Hit damage ability deals identical damage across runs', () => {
    const custom = content({
      nodes: [
        node('zap', {
          linkedItem: {
            id: 'zap-ab', type: 'Ability', name: 'Zap', description: '',
            range: 'Near', aoe: 'Single Target', hitType: 'Auto Hit',
            effects: [{ id: 'd', type: 'Apply Damage', useWeaponDamage: false, additionalDamage: '2d6', savingThrowEnabled: false }],
          } as never,
        }),
      ],
    });
    setActiveCatalog(buildActiveCatalog(custom, 'extend'));

    const run = (): number => {
      const a = createCombatant(mkChar('a'), { team: 'player', position: { q: 0, r: 0 } });
      const b = createCombatant(mkChar('b'), { team: 'npc', position: { q: 1, r: 0 } });
      b.currentHP = 50; b.maxHP = 50;
      const state: CombatState = {
        isActive: true, phase: 'resolving', round: 1, combatants: [a, b],
        declaredActions: {}, lockedActions: {}, resolutionQueue: [], activeResolutionIndex: -1, log: [],
      };
      const act = { actionIndex: 0, actionType: 'Use Ability', sourceId: 'a', targetId: 'b', actionId: 'zap', initiative: 1 } as ResolvedAction;
      let i = 0;
      const seq: Rng = () => [0.5, 0.5, 0.5, 0.5][i++ % 4];
      return resolveAction(state, act, seq).state.combatants.find((c) => c.id === 'b')!.currentHP;
    };

    const hp1 = run();
    const hp2 = run();
    expect(hp1).toBe(hp2); // deterministic resolution of custom content
    expect(hp1).toBeLessThan(50); // the custom ability actually dealt damage
  });
});
