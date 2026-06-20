import { describe, it, expect } from 'vitest';
import { normalizeWorldpack, normalizeWorldpackContent, platformCut, creatorPayout } from './worldpack';
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
