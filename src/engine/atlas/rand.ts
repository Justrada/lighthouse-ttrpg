/**
 * Deterministic randomness for world generation.
 *
 * The rest of the engine takes an injected `rng: () => number`, which is the
 * right primitive for a die roll: a *stream*, consumed in order. A world needs
 * the opposite — **random access**. Generating the fourth building on the
 * basement floor of a settlement must not require generating the three before
 * it, or the first three, or the settlement's siblings.
 *
 * So worldgen takes an explicit `seed: number` and derives child seeds by
 * hashing. That honours the determinism rule more strictly than the letter of
 * it: every function here is total, order-independent, and replayable with no
 * ambient state and no call-order coupling. {@link rngFor} still produces an
 * ordinary `Rng` wherever the existing engine wants one.
 *
 * Everything in this module is pure. No DOM, no timers, no `Math.random`.
 */
import type { Rng } from '../dice';

/** A world seed. 53 bits — the whole safe-integer range, not 32. */
export type Seed = number;

/** A path segment. Strings are names; numbers are indices. */
export type SeedKey = string | number;

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

/**
 * 32-bit avalanche mixer.
 *
 * These constants are the best-known two-round pair from Wellons' hash
 * prospector search (bias 0.108, against 0.271 for murmur3's `fmix32`).
 * **They are baked into every seed this app ever persists** — changing them
 * regenerates every world in existence, so they are pinned, not tuned.
 *
 * `Math.imul` is a correctness requirement here, not an optimization: a double
 * has 53 bits of mantissa, so `(0xDEADBEEF * 2654435761) | 0` loses the low
 * bits to rounding *before* the truncation can happen and returns the wrong
 * answer. Only multipliers below ~2^21 are safe with plain `*`.
 */
export function mix32(x: number): number {
  let h = x | 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x21f0aaad);
  h ^= h >>> 15;
  h = Math.imul(h, 0xd35a2d97);
  h ^= h >>> 15;
  return h >>> 0;
}

const TAG_NUMBER = 0x9e3;
const TAG_STRING = 0x85e;

/**
 * Hash a path into a 53-bit seed.
 *
 * The encoding is deliberately **prefix-free** — each part carries a type tag,
 * and strings carry a length. Without that, `['ab', 'c']` and `['a', 'bc']`
 * hash identically, which would quietly make two different places in the world
 * *the same place*. The tags cost two multiplies per segment.
 *
 * 53 bits rather than 32 because birthday collisions among 32-bit seeds start
 * around 65k entities — entirely reachable for a world with named buildings.
 */
export function hashPath(parts: readonly SeedKey[]): Seed {
  let h1 = 0xdeadbeef | 0;
  let h2 = 0x41c6ce57 | 0;
  const absorb = (ch: number): void => {
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  };
  for (const part of parts) {
    if (typeof part === 'number') {
      absorb(TAG_NUMBER);
      const lo = part >>> 0;
      const hi = Math.floor(part / 4294967296) >>> 0;
      absorb(lo & 0xffff);
      absorb(lo >>> 16);
      absorb(hi & 0xffff);
      absorb(hi >>> 16);
    } else {
      absorb(TAG_STRING);
      absorb(part.length);
      for (let i = 0; i < part.length; i += 1) absorb(part.charCodeAt(i));
    }
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * Derive a child seed from a parent and a key.
 *
 * This is the whole laziness mechanism. Because it is a pure function of
 * `(parent, key)` and never of a call order, `deriveSeed(s, 'K4')` is the same
 * number whether or not `K0..K3` were ever generated — and adding a sibling
 * never perturbs an existing one. That is precisely why a hand edit keyed by
 * path survives regeneration.
 *
 * Never `parent + index`: for the generator families in common use, sibling
 * states stay correlated in their low bits.
 */
export function deriveSeed(parent: Seed, ...key: SeedKey[]): Seed {
  return hashPath([parent, ...key]);
}

/** Walk a `/A1/B2/C3` path into a seed, one `deriveSeed` per segment. */
export function seedForPath(root: Seed, path: string): Seed {
  let s = root;
  for (const seg of path.split('/')) if (seg) s = deriveSeed(s, seg);
  return s;
}

// ---------------------------------------------------------------------------
// The generator
// ---------------------------------------------------------------------------

/**
 * sfc32 — 128 bits of state, passes PractRand and BigCrush.
 *
 * The 128-bit state is the point. The popular 32-bit alternatives (mulberry32,
 * splitmix32) are Weyl generators: the state advances by a fixed constant and
 * the output is a stateless bijection of it, so **the seed is an offset into
 * one global sequence rather than a selector between independent ones**. Every
 * child of a world would then walk the same 4-billion-long loop, and siblings
 * would overlap. Seeding sfc32 from a hash puts children on genuinely
 * different cycles.
 */
function sfc32(a: number, b: number, c: number, d: number): Rng {
  let s0 = a | 0;
  let s1 = b | 0;
  let s2 = c | 0;
  let s3 = d | 0;
  return function next(): number {
    const t = ((s0 + s1) | 0) + s3 | 0;
    s3 = (s3 + 1) | 0;
    s0 = s1 ^ (s1 >>> 9);
    s1 = (s2 + (s2 << 3)) | 0;
    s2 = (s2 << 21) | (s2 >>> 11);
    s2 = (s2 + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/** Expand a seed into a warmed-up {@link Rng}. The 12 discarded outputs are
 *  sfc32's own recommended seeding procedure, not superstition. */
export function rngFor(seed: Seed): Rng {
  let x = seed >>> 0 | 0;
  const hi = Math.floor(seed / 4294967296) | 0;
  const next = (): number => {
    x = (x + 0x9e3779b9) | 0;
    return mix32(x ^ hi) | 0;
  };
  const rng = sfc32(next(), next(), next(), next());
  for (let i = 0; i < 12; i += 1) rng();
  return rng;
}

/** An integer in `[lo, hi]`, inclusive. */
export function randInt(rng: Rng, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/** One element of a non-empty array. */
export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

/** Fisher–Yates, returning a new array. */
export function shuffled<T>(rng: Rng, items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Noise
// ---------------------------------------------------------------------------

/** Gustavson's 3D simplex constants. The output scale is coupled to the
 *  gradient table and the falloff radius — they cannot be mixed between
 *  implementations. */
const F3 = 1 / 3;
const G3 = 1 / 6;
const GRAD3 = [
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
  1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
  0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
];

/**
 * A seeded 3D simplex noise sampler.
 *
 * 3D specifically, sampled on a unit direction vector, because that is what
 * makes a sphere seamless: there is no longitude to wrap and no pole to pinch,
 * since the sphere is just a level set inside a field that fills space. It is
 * also cheaper than 3D Perlin (4 corners rather than 8).
 */
export interface Noise3 {
  (x: number, y: number, z: number): number;
}

export function makeNoise3(seed: Seed): Noise3 {
  const rng = rngFor(deriveSeed(seed, 'noise'));
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) p[i] = i;
  for (let i = 255; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  const perm = new Uint8Array(512);
  const permMod12 = new Uint8Array(512);
  for (let i = 0; i < 512; i += 1) {
    perm[i] = p[i & 255];
    permMod12[i] = perm[i] % 12;
  }

  return function noise(xin: number, yin: number, zin: number): number {
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const z0 = zin - (k - t);

    let i1: number, j1: number, k1: number, i2: number, j2: number, k2: number;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }

    const x1 = x0 - i1 + G3;
    const y1 = y0 - j1 + G3;
    const z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3;
    const y2 = y0 - j2 + 2 * G3;
    const z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3;
    const y3 = y0 - 1 + 3 * G3;
    const z3 = z0 - 1 + 3 * G3;

    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;
    let n = 0;

    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 > 0) {
      const g = permMod12[ii + perm[jj + perm[kk]]] * 3;
      t0 *= t0;
      n += t0 * t0 * (GRAD3[g] * x0 + GRAD3[g + 1] * y0 + GRAD3[g + 2] * z0);
    }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 > 0) {
      const g = permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3;
      t1 *= t1;
      n += t1 * t1 * (GRAD3[g] * x1 + GRAD3[g + 1] * y1 + GRAD3[g + 2] * z1);
    }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 > 0) {
      const g = permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3;
      t2 *= t2;
      n += t2 * t2 * (GRAD3[g] * x2 + GRAD3[g + 1] * y2 + GRAD3[g + 2] * z2);
    }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 > 0) {
      const g = permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3;
      t3 *= t3;
      n += t3 * t3 * (GRAD3[g] * x3 + GRAD3[g + 1] * y3 + GRAD3[g + 2] * z3);
    }
    return 32 * n;
  };
}

/**
 * Irrational offsets applied to every noise sample.
 *
 * A sphere's natural axes align *exactly* with the noise lattice at the poles
 * and the antimeridian, where a coordinate is ±1e-17 and `Math.floor` sends the
 * two mirror points into different simplices. Measured, that shows up as a real
 * discontinuity along the date line; an irrational shift removes it. A rational
 * offset like 0.5 does not — it just moves the alignment.
 *
 * (Euler–Mascheroni, Apéry's constant, Khinchin's constant.)
 */
const DOMAIN_OFFSET = [0.5772156649015329, 1.2020569031595943, 2.6854520010653064] as const;

/** Default fBm shape. Lacunarity is deliberately **not** 2.0: at exactly 2 each
 *  octave's lattice is a sub-lattice of the last, so every octave is zero at the
 *  same points and the sum shows grid ghosting. Gain 0.5 is the Hurst exponent
 *  that matches real mountain profiles. */
export const FBM_LACUNARITY = 1.98;
export const FBM_GAIN = 0.5;

/**
 * Fractional Brownian motion — a sum of noise octaves.
 *
 * The normaliser is **fixed** at `1 / (1 - gain)` rather than the running sum of
 * amplitudes actually used. That is what gives the *prefix property*: the
 * 8-octave value is exactly the first 8 terms of the 15-octave value, so zooming
 * in **adds detail without moving terrain that is already on screen**. Dividing
 * by the running sum instead rescales the coarse result by ~0.4% every time an
 * octave is added — the same order as the detail being added, and visible as the
 * whole landscape breathing as you zoom.
 */
export function fbm3(
  noise: Noise3,
  x: number,
  y: number,
  z: number,
  octaves: number,
  gain: number = FBM_GAIN,
  lacunarity: number = FBM_LACUNARITY,
): number {
  let freq = 1;
  let amp = 1;
  let sum = 0;
  for (let i = 0; i < octaves; i += 1) {
    sum += amp * noise(
      x * freq + DOMAIN_OFFSET[0],
      y * freq + DOMAIN_OFFSET[1],
      z * freq + DOMAIN_OFFSET[2],
    );
    freq *= lacunarity;
    amp *= gain;
  }
  return sum * (1 - gain);
}
