import { describe, it, expect } from 'vitest';
import { normalizeWorldpack, platformCut, creatorPayout } from './worldpack';
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
