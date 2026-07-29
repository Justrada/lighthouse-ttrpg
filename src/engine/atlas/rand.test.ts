import { describe, it, expect } from 'vitest';
import {
  mix32,
  hashPath,
  deriveSeed,
  seedForPath,
  rngFor,
  randInt,
  pick,
  shuffled,
  makeNoise3,
  fbm3,
  FBM_GAIN,
} from './rand';

describe('mix32', () => {
  it('avalanches — a one-bit input change flips about half the output bits', () => {
    // A weak mixer here would make sibling seeds correlated, which shows up as
    // visible repetition across a world rather than as an obvious bug.
    let total = 0;
    const trials = 2000;
    for (let i = 0; i < trials; i += 1) {
      const a = mix32(i);
      const b = mix32(i ^ 1);
      let diff = a ^ b;
      let bits = 0;
      while (diff) {
        bits += diff & 1;
        diff >>>= 1;
      }
      total += bits;
    }
    const mean = total / trials;
    expect(mean).toBeGreaterThan(14);
    expect(mean).toBeLessThan(18);
  });

  it('is a pure uint32 function', () => {
    expect(mix32(12345)).toBe(mix32(12345));
    expect(mix32(0)).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(mix32(-1))).toBe(true);
  });
});

describe('hashPath', () => {
  it('is prefix-free — segment boundaries cannot be ambiguous', () => {
    // Without type tags and a length prefix these collide, which would silently
    // make two different places in the world resolve to the same place.
    expect(hashPath(['ab', 'c'])).not.toBe(hashPath(['a', 'bc']));
    expect(hashPath(['a', 'b'])).not.toBe(hashPath(['ab']));
  });

  it('distinguishes a number from its string form', () => {
    expect(hashPath([12])).not.toBe(hashPath(['12']));
  });

  it('stays inside the safe-integer range', () => {
    for (const p of [['a'], ['zzz', 9], [0], ['/P7/R3/L2/S9/B0/F-1/K4']]) {
      const h = hashPath(p as (string | number)[]);
      expect(Number.isSafeInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('deriveSeed', () => {
  it('is order-independent — a child does not depend on its siblings existing', () => {
    // This is the whole laziness mechanism: resolving one room must not require
    // generating the rooms beside it.
    const root = hashPath(['world']);
    const direct = deriveSeed(root, 'K4');
    for (let i = 0; i < 100; i += 1) deriveSeed(root, `K${i}`);
    expect(deriveSeed(root, 'K4')).toBe(direct);
  });

  it('gives 20000 siblings distinct seeds', () => {
    const root = hashPath(['world']);
    const seen = new Set<number>();
    for (let i = 0; i < 20000; i += 1) seen.add(deriveSeed(root, 'S', i));
    expect(seen.size).toBe(20000);
  });

  it('decorrelates adjacent siblings', () => {
    // `parent + i` would leave neighbouring worlds visibly similar.
    const root = hashPath(['world']);
    const first: number[] = [];
    for (let i = 0; i < 3000; i += 1) first.push(rngFor(deriveSeed(root, 'S', i))());
    let cov = 0;
    for (let i = 1; i < first.length; i += 1) cov += (first[i] - 0.5) * (first[i - 1] - 0.5);
    // Uncorrelated uniforms have covariance 0; the variance of one is 1/12, so
    // a correlation coefficient near zero means |cov/n| << 1/12.
    expect(Math.abs(cov / first.length)).toBeLessThan(0.005);
  });
});

describe('seedForPath', () => {
  it('matches a hand-rolled fold, and ignores empty segments', () => {
    const root = hashPath(['w']);
    const manual = deriveSeed(deriveSeed(deriveSeed(root, 'P7'), 'R3'), 'K4');
    expect(seedForPath(root, '/P7/R3/K4')).toBe(manual);
    expect(seedForPath(root, 'P7/R3/K4')).toBe(manual);
  });

  it('gives a deep path a stable seed', () => {
    const root = hashPath(['w']);
    const p = '/P7/R3/L2/S9/B0/F-1/K4';
    expect(seedForPath(root, p)).toBe(seedForPath(root, p));
    expect(seedForPath(root, p)).not.toBe(seedForPath(root, '/P7/R3/L2/S9/B0/F-2/K4'));
  });
});

describe('rngFor', () => {
  it('is reproducible and stays in [0,1)', () => {
    const a = Array.from({ length: 200 }, rngFor(42));
    const b = Array.from({ length: 200 }, rngFor(42));
    expect(a).toEqual(b);
    for (const v of a) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is roughly uniform', () => {
    const bins = new Array(10).fill(0);
    const rng = rngFor(7);
    for (let i = 0; i < 50000; i += 1) bins[Math.floor(rng() * 10)] += 1;
    for (const b of bins) {
      expect(b).toBeGreaterThan(4200);
      expect(b).toBeLessThan(5800);
    }
  });

  it('gives different seeds different streams', () => {
    expect(Array.from({ length: 10 }, rngFor(1))).not.toEqual(
      Array.from({ length: 10 }, rngFor(2)),
    );
  });
});

describe('helpers', () => {
  it('randInt covers its inclusive bounds and never exceeds them', () => {
    const rng = rngFor(3);
    const seen = new Set<number>();
    for (let i = 0; i < 4000; i += 1) {
      const v = randInt(rng, 2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([2, 3, 4, 5]);
  });

  it('pick never falls off the end of the array', () => {
    // Guards the classic `rng() === 0.9999…` off-by-one.
    const items = ['a', 'b', 'c'];
    const rng = () => 0.999999999;
    expect(pick(rng, items)).toBe('c');
  });

  it('shuffled permutes without mutating the input', () => {
    const src = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = shuffled(rngFor(9), src);
    expect(src).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(out.slice().sort((a, b) => a - b)).toEqual(src);
  });
});

describe('noise3', () => {
  it('is reproducible for a seed and varies between seeds', () => {
    const a = makeNoise3(1);
    const b = makeNoise3(1);
    const c = makeNoise3(2);
    expect(a(0.3, 0.7, 1.1)).toBe(b(0.3, 0.7, 1.1));
    expect(a(0.3, 0.7, 1.1)).not.toBe(c(0.3, 0.7, 1.1));
  });

  it('stays within roughly [-1, 1]', () => {
    const n = makeNoise3(5);
    const rng = rngFor(6);
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < 20000; i += 1) {
      const v = n(rng() * 50, rng() * 50, rng() * 50);
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    expect(lo).toBeGreaterThan(-1.02);
    expect(hi).toBeLessThan(1.02);
    // It must actually use its range, not hug zero.
    expect(hi - lo).toBeGreaterThan(1);
  });

  it('is continuous — nearby samples give nearby values', () => {
    const n = makeNoise3(11);
    const rng = rngFor(12);
    let worst = 0;
    for (let i = 0; i < 3000; i += 1) {
      const x = rng() * 20;
      const y = rng() * 20;
      const z = rng() * 20;
      worst = Math.max(worst, Math.abs(n(x, y, z) - n(x + 1e-4, y, z)));
    }
    expect(worst).toBeLessThan(0.05);
  });
});

describe('fbm3', () => {
  it('has the PREFIX PROPERTY — adding octaves never moves existing terrain', () => {
    // This is what makes zoom feel like zoom. With a running-sum normaliser the
    // coarse result is rescaled every time an octave is added, and the whole
    // landscape visibly breathes as you descend.
    const n = makeNoise3(21);
    const rng = rngFor(22);
    let worstShift = 0;
    for (let i = 0; i < 500; i += 1) {
      const x = rng() * 10;
      const y = rng() * 10;
      const z = rng() * 10;
      const coarse = fbm3(n, x, y, z, 4);
      const fine = fbm3(n, x, y, z, 10);
      // The added octaves can contribute at most the tail of the geometric sum.
      const maxTail = Math.pow(FBM_GAIN, 4) / (1 - FBM_GAIN) * (1 - FBM_GAIN);
      worstShift = Math.max(worstShift, Math.abs(fine - coarse) - maxTail);
    }
    expect(worstShift).toBeLessThanOrEqual(0);
  });

  it('is exactly the sum of its octaves for one octave', () => {
    const n = makeNoise3(31);
    const one = fbm3(n, 0.25, 0.5, 0.75, 1);
    expect(one).toBeCloseTo(
      n(0.25 + 0.5772156649015329, 0.5 + 1.2020569031595943, 0.75 + 2.6854520010653064) * 0.5,
      12,
    );
  });

  it('stays bounded as octaves grow', () => {
    const n = makeNoise3(41);
    const rng = rngFor(42);
    for (let i = 0; i < 2000; i += 1) {
      const v = fbm3(n, rng() * 30, rng() * 30, rng() * 30, 12);
      expect(Math.abs(v)).toBeLessThan(1.5);
    }
  });
});
