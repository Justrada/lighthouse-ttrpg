import { describe, it, expect } from 'vitest';
import {
  normalizeWorldpack,
  normalizeWorldpackContent,
  platformCut,
  creatorPayout,
  packKind,
  contentCounts,
  sliceWorldpack,
} from './worldpack';
import type { Worldpack } from '@/types';

describe('normalizeWorldpack', () => {
  it('coerces hostile/partial input into a safe pack', () => {
    const p = normalizeWorldpack({
      name: 123,
      price: -5,
      reskins: { nodes: 'x', terms: { Mind: 7, Body: 'Brawn' } },
    } as unknown as Worldpack);
    expect(typeof p.name).toBe('string');
    expect(p.price).toBe(0); // negative → 0
    expect(p.reskins.nodes).toEqual({}); // non-object map → {}
    expect(p.reskins.terms.Body).toBe('Brawn'); // valid string kept
    expect(p.reskins.terms.Mind).toBeUndefined(); // non-string dropped
  });

  it('clamps a non-finite price to 0', () => {
    expect(normalizeWorldpack({ price: Infinity } as unknown as Worldpack).price).toBe(0);
    expect(normalizeWorldpack({ price: NaN } as unknown as Worldpack).price).toBe(0);
  });

  it('never throws on null/garbage', () => {
    expect(() => normalizeWorldpack(null)).not.toThrow();
    expect(() => normalizeWorldpack(42)).not.toThrow();
    expect(normalizeWorldpack(undefined).reskins.terms).toEqual({});
  });
});

describe('marketplace fee math', () => {
  it('splits a price by the platform rate', () => {
    expect(platformCut(100)).toBe(15);
    expect(creatorPayout(100)).toBe(85);
  });

  it('guards zero and non-finite prices', () => {
    expect(platformCut(0)).toBe(0);
    expect(creatorPayout(0)).toBe(0);
    expect(platformCut(Infinity)).toBe(0);
    expect(creatorPayout(Infinity)).toBe(0);
    expect(creatorPayout(NaN)).toBe(0);
    expect(platformCut(-10)).toBe(0);
  });
});

describe('price clamp', () => {
  it('clamps an astronomically large price to the ceiling', () => {
    expect(normalizeWorldpack({ price: 1e21 } as unknown as Worldpack).price).toBe(1_000_000);
    expect(normalizeWorldpack({ price: 999999999999 } as unknown as Worldpack).price).toBe(1_000_000);
  });
});

describe('normalizeWorldpack — System content migration', () => {
  it('defaults a legacy reskin-only pack to overlay + empty content', () => {
    const p = normalizeWorldpack({ name: 'Legacy', reskins: { terms: { Mind: 'Wits' } } } as unknown as Worldpack);
    expect(p.baseMode).toBe('overlay');
    expect(p.content).toEqual({ nodes: [], edges: [], worldItems: {} });
    expect(p.reskins.terms.Mind).toBe('Wits'); // reskins untouched
  });

  it('round-trips a content-bearing pack and honors baseMode', () => {
    const p = normalizeWorldpack({
      name: 'Cyber',
      baseMode: 'extend',
      content: {
        nodes: [
          {
            id: 'gun-skill', label: 'Gunslinger',
            linkedItem: { id: 'g', type: 'Ability', name: 'Shoot', effects: [{ id: 'e', type: 'Apply Damage', additionalDamage: '2d6' }] },
          },
        ],
        edges: [{ id: 'ed', sourceId: 'center-0', targetId: 'gun-skill' }],
        worldItems: { weapons: [{ id: 'revolver', name: 'Revolver', itemType: 'Weapon', effects: [] }] },
      },
    } as unknown as Worldpack);
    expect(p.baseMode).toBe('extend');
    expect(p.content!.nodes[0].id).toBe('gun-skill');
    expect(p.content!.nodes[0].linkedItem!.effects[0].type).toBe('Apply Damage');
    expect(p.content!.edges[0].sourceId).toBe('center-0');
    expect(p.content!.worldItems.weapons[0].id).toBe('revolver');
  });

  it('rejects an invalid baseMode, falling back to overlay', () => {
    expect(normalizeWorldpack({ baseMode: 'chaos' } as unknown as Worldpack).baseMode).toBe('overlay');
  });
});

describe('normalizeWorldpackContent — hostile input safety', () => {
  it('never throws on garbage', () => {
    expect(() => normalizeWorldpackContent(null)).not.toThrow();
    expect(() => normalizeWorldpackContent(42)).not.toThrow();
    expect(() => normalizeWorldpackContent([1, 2, 3])).not.toThrow();
    expect(normalizeWorldpackContent(undefined)).toEqual({ nodes: [], edges: [], worldItems: {} });
  });

  it('drops nodes without a string id and de-dupes by id', () => {
    const c = normalizeWorldpackContent({
      nodes: [{ label: 'no id' }, { id: 'a' }, { id: 'a', label: 'dup' }, null, 'bad'],
    } as never);
    expect(c.nodes.map((n) => n.id)).toEqual(['a']);
  });

  it('coerces a garbage effects array to [] and nulls a malformed linkedItem', () => {
    const c = normalizeWorldpackContent({
      nodes: [
        { id: 'n1', linkedItem: { id: 'li', type: 'Ability', name: 'X', effects: 'nope' } },
        { id: 'n2', linkedItem: 42 },
      ],
    } as never);
    expect(c.nodes[0].linkedItem!.effects).toEqual([]);
    expect(c.nodes[1].linkedItem).toBeNull();
  });

  it('drops effects with no type and assigns missing ids', () => {
    const c = normalizeWorldpackContent({
      nodes: [
        { id: 'n', linkedItem: { id: 'l', type: 'Ability', name: 'A', effects: [{ type: 'Apply Damage' }, { foo: 1 }, { type: '  ' }] } },
      ],
    } as never);
    const effs = c.nodes[0].linkedItem!.effects;
    expect(effs).toHaveLength(1);
    expect(typeof effs[0].id).toBe('string');
  });

  it('ignores a hostile own __proto__ key (no prototype pollution)', () => {
    const hostile = JSON.parse('{"id":"e","type":"Apply Damage","__proto__":{"polluted":true}}');
    normalizeWorldpackContent({
      nodes: [{ id: 'n', linkedItem: { id: 'l', type: 'Ability', name: 'A', effects: [hostile] } }],
    } as never);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('caps an absurd number of effects', () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ id: `e${i}`, type: 'Apply Damage' }));
    const c = normalizeWorldpackContent({
      nodes: [{ id: 'n', linkedItem: { id: 'l', type: 'Ability', name: 'A', effects: many } }],
    } as never);
    expect(c.nodes[0].linkedItem!.effects.length).toBeLessThanOrEqual(50);
  });
});

describe('packaging — kind, counts, slices, lineage', () => {
  const withContent = (over: Record<string, unknown>) =>
    normalizeWorldpack({ name: 'P', author: 'Ada', baseMode: 'extend', ...over } as never);
  const node = (id: string) => ({ id, label: id, linkedItem: { id: `${id}-a`, type: 'Ability', name: id, effects: [] } });
  const item = (id: string) => ({ id, name: id, itemType: 'Weapon', effects: [] });

  it('classifies a pack by what it contains', () => {
    expect(packKind(normalizeWorldpack({} as never))).toBe('Empty');
    expect(packKind(normalizeWorldpack({ reskins: { terms: { Mind: 'Wits' } } } as never))).toBe('Reskin');
    expect(packKind(withContent({ content: { nodes: [node('n1')], edges: [], worldItems: {} } }))).toBe('Skill Tree');
    expect(packKind(withContent({ content: { nodes: [], edges: [], worldItems: { weapons: [item('w1')] } } }))).toBe('Item Pack');
    expect(packKind(withContent({ content: { nodes: [node('n1')], edges: [], worldItems: { weapons: [item('w1')] } } }))).toBe('World');
  });

  it('counts custom nodes and items across buckets', () => {
    const p = withContent({ content: { nodes: [node('a'), node('b')], edges: [], worldItems: { weapons: [item('w')], armor: [item('ar')] } } });
    expect(contentCounts(p)).toEqual({ nodes: 2, items: 2 });
  });

  it('slices a world into a tree-only add-on that credits the original', () => {
    const world = withContent({
      name: 'Neon',
      content: { nodes: [node('n1')], edges: [{ id: 'e', sourceId: 'center-0', targetId: 'n1' }], worldItems: { weapons: [item('w1')] } },
    });
    const tree = sliceWorldpack(world, 'tree');
    expect(tree.id).not.toBe(world.id); // fresh pack
    expect(tree.baseMode).toBe('extend'); // additive
    expect(contentCounts(tree)).toEqual({ nodes: 1, items: 0 }); // items dropped
    expect(tree.content!.edges).toHaveLength(1);
    expect(tree.derivedFrom).toEqual({ id: world.id, name: 'Neon', author: 'Ada' });
    expect(tree.published).toBe(false);
  });

  it('slices a world into an item-only add-on', () => {
    const world = withContent({ content: { nodes: [node('n1')], edges: [], worldItems: { weapons: [item('w1')] } } });
    expect(contentCounts(sliceWorldpack(world, 'items'))).toEqual({ nodes: 0, items: 1 });
  });

  it('normalizes a valid derivedFrom and drops garbage lineage', () => {
    expect(normalizeWorldpack({ derivedFrom: { id: 'x', name: 'Orig', author: 'Bo' } } as never).derivedFrom).toEqual({ id: 'x', name: 'Orig', author: 'Bo' });
    expect(normalizeWorldpack({ derivedFrom: 42 } as never).derivedFrom).toBeUndefined();
    expect(normalizeWorldpack({ derivedFrom: {} } as never).derivedFrom).toBeUndefined();
    expect(normalizeWorldpack({} as never).derivedFrom).toBeUndefined();
  });

  it('slicing deep-clones content so editing the slice cannot mutate the source', () => {
    const world = normalizeWorldpack({
      name: 'W', baseMode: 'extend',
      content: { nodes: [], edges: [], worldItems: { weapons: [{ id: 'w', name: 'Gun', itemType: 'Weapon', weaknesses: ['fire'], effects: [] }] } },
    } as never);
    const slice = sliceWorldpack(world, 'items');
    // Mutate a nested array on the slice — the source pack must be untouched.
    slice.content!.worldItems.weapons[0].weaknesses!.push('HACKED');
    expect(world.content!.worldItems.weapons[0].weaknesses).toEqual(['fire']);
  });
});

describe('normalizeWorldpack — non-finite timestamps', () => {
  it('coerces NaN/Infinity createdAt & updatedAt to a finite value', () => {
    const p = normalizeWorldpack({ createdAt: NaN, updatedAt: Infinity } as never);
    expect(Number.isFinite(p.createdAt as number)).toBe(true);
    expect(Number.isFinite(p.updatedAt as number)).toBe(true);
    expect(Number.isFinite(normalizeWorldpack({ createdAt: -Infinity } as never).createdAt as number)).toBe(true);
  });
});

describe('weapon double-damage heal', () => {
  it('drops useWeaponDamage on a weapon effect that also carries its own dice', () => {
    const c = normalizeWorldpackContent({
      worldItems: { weapons: [{ id: 'gun', name: 'Gun', itemType: 'Weapon', effects: [{ id: 'e', type: 'Apply Damage', useWeaponDamage: true, additionalDamage: '2d6' }] }] },
    } as never);
    expect(c.worldItems.weapons[0].effects[0].useWeaponDamage).toBe(false);
    expect(c.worldItems.weapons[0].effects[0].additionalDamage).toBe('2d6'); // dice preserved
  });

  it('leaves a weapon-scaling ability effect untouched (legitimate on abilities)', () => {
    const c = normalizeWorldpackContent({
      nodes: [{ id: 'n', linkedItem: { id: 'a', type: 'Ability', name: 'Power Strike', effects: [{ id: 'e', type: 'Apply Damage', useWeaponDamage: true, additionalDamage: '1d6' }] } }],
    } as never);
    expect(c.nodes[0].linkedItem!.effects[0].useWeaponDamage).toBe(true);
  });
});

describe('normalize hardening — enums / cost / duration / edges / ammo', () => {
  const node = (over: Record<string, unknown>) => ({ id: 'n', label: 'n', linkedItem: { id: 'a', type: 'Ability', name: 'A', effects: [], ...over } });

  it('coerces cost to a non-negative int + valid pool', () => {
    const c = normalizeWorldpackContent({ nodes: [node({ cost: { type: 'XP', value: -5 } })] } as never);
    expect(c.nodes[0].linkedItem!.cost).toEqual({ type: 'MP', value: 0 });
    const c2 = normalizeWorldpackContent({ nodes: [node({ cost: { type: 'SP', value: 2.9 } })] } as never);
    expect(c2.nodes[0].linkedItem!.cost).toEqual({ type: 'SP', value: 2 });
  });

  it('canonicalizes range / hitType / aoe (case + aliases + safe default)', () => {
    const l = normalizeWorldpackContent({ nodes: [node({ range: 'near', hitType: 'auto hit', aoe: 'aoe 4' })] } as never).nodes[0].linkedItem!;
    expect(l.range).toBe('Near');
    expect(l.hitType).toBe('Auto Hit');
    expect(l.aoe).toBe('AOE 4');
    expect(normalizeWorldpackContent({ nodes: [node({ range: 'adjacent' })] } as never).nodes[0].linkedItem!.range).toBe('Melee');
    expect(normalizeWorldpackContent({ nodes: [node({ range: '???' })] } as never).nodes[0].linkedItem!.range).toBe('Melee');
  });

  it('coerces effect duration (numeric string → int, clamps) + unit whitelist + stat alias', () => {
    const e = (over: Record<string, unknown>) => ({ id: 'e', type: 'Modify Stat', statToModify: 'health', modification: '+5', ...over });
    const eff = normalizeWorldpackContent({ nodes: [node({ effects: [e({ durationValue: '3', durationUnit: 'forever' })] })] } as never).nodes[0].linkedItem!.effects[0];
    expect(eff.durationValue).toBe(3);
    expect(eff.durationUnit).toBe('Rounds');
    expect(eff.statToModify).toBe('HP');
    expect(normalizeWorldpackContent({ nodes: [node({ effects: [e({ durationValue: -9 })] })] } as never).nodes[0].linkedItem!.effects[0].durationValue).toBe(0);
  });

  it('clamps ammoPerShot to clipSize (no permanently-jammed gun)', () => {
    const c = normalizeWorldpackContent({ worldItems: { weapons: [{ id: 'g', name: 'G', itemType: 'Weapon', clipSize: 3, ammoPerShot: 9, effects: [] }] } } as never);
    expect(c.worldItems.weapons[0].ammoPerShot).toBe(3);
  });

  it('drops dangling + self-loop edges and de-dups by endpoint pair', () => {
    const c = normalizeWorldpackContent({
      nodes: [{ id: 'a', label: 'a' }, { id: 'b', label: 'b' }],
      edges: [
        { id: 'e1', sourceId: 'center-0', targetId: 'a' },
        { id: 'e2', sourceId: 'center-0', targetId: 'a' }, // duplicate pair
        { id: 'e3', sourceId: 'a', targetId: 'a' }, // self-loop
        { id: 'e4', sourceId: 'a', targetId: 'ghost' }, // dangling
        { id: 'e5', sourceId: 'a', targetId: 'b' },
      ],
    } as never);
    expect(c.edges.map((e) => `${e.sourceId}->${e.targetId}`)).toEqual(['center-0->a', 'a->b']);
  });

  it('trims node names', () => {
    expect(normalizeWorldpackContent({ nodes: [{ id: 'n', label: '  Spacey  ' }] } as never).nodes[0].label).toBe('Spacey');
  });
});
