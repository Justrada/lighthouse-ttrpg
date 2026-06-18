import { describe, it, expect } from 'vitest';
import {
  parseDiceNotation,
  roll,
  rollD20,
  rollDamage,
  combineAdvantage,
  type Rng,
} from './dice';

/**
 * A deterministic rng that yields each value in `seq` in turn (looping). Values
 * are in [0, 1); for a dN, the face rolled is floor(v * N) + 1.
 */
function seqRng(seq: number[]): Rng {
  let i = 0;
  return () => seq[i++ % seq.length];
}

/** rng that always rolls the maximum face for any die. */
const maxRng: Rng = () => 0.999999;
/** rng that always rolls a 1 for any die. */
const minRng: Rng = () => 0;

describe('parseDiceNotation', () => {
  it('parses standard notation', () => {
    expect(parseDiceNotation('2d6')).toEqual({ count: 2, sides: 6, modifier: 0, negative: false });
    expect(parseDiceNotation('1d20+3')).toEqual({ count: 1, sides: 20, modifier: 3, negative: false });
    expect(parseDiceNotation('2d10-1')).toEqual({ count: 2, sides: 10, modifier: -1, negative: false });
  });

  it('defaults the count to 1 when omitted', () => {
    expect(parseDiceNotation('d8')).toEqual({ count: 1, sides: 8, modifier: 0, negative: false });
  });

  it('tolerates whitespace around the modifier', () => {
    expect(parseDiceNotation('2d6 + 3')).toEqual({ count: 2, sides: 6, modifier: 3, negative: false });
  });

  it('flags negative dice notation', () => {
    expect(parseDiceNotation('-1d6')).toEqual({ count: 1, sides: 6, modifier: 0, negative: true });
  });

  it('returns null for constants and junk', () => {
    expect(parseDiceNotation('5')).toBeNull();
    expect(parseDiceNotation('')).toBeNull();
    expect(parseDiceNotation('hello')).toBeNull();
  });

  it('rejects zero-sided dice (would have silently rolled 1)', () => {
    expect(parseDiceNotation('1d0')).toBeNull();
    expect(parseDiceNotation('d0')).toBeNull();
    expect(parseDiceNotation('-1d0')).toBeNull();
  });
});

describe('roll', () => {
  it('sums dice plus modifier deterministically', () => {
    // 2d6: faces 3 and 5 -> 8, +2 modifier -> 10
    const r = roll('2d6+2', seqRng([2 / 6, 4 / 6]));
    expect(r.rolls).toEqual([3, 5]);
    expect(r.modifier).toBe(2);
    expect(r.total).toBe(10);
  });

  it('treats a bare constant as a flat total with no dice', () => {
    const r = roll('7');
    expect(r.rolls).toEqual([]);
    expect(r.total).toBe(7);
  });

  it('negates negative dice notation (the original bug, handled)', () => {
    // -1d6 with a max roll of 6 -> total -6
    const r = roll('-1d6', maxRng);
    expect(r.rolls).toEqual([6]);
    expect(r.total).toBe(-6);
  });

  it('rolls within bounds for many samples', () => {
    for (let i = 0; i < 200; i++) {
      const r = roll('3d8');
      expect(r.total).toBeGreaterThanOrEqual(3);
      expect(r.total).toBeLessThanOrEqual(24);
      expect(r.rolls).toHaveLength(3);
    }
  });

  it('treats a zero-sided die as invalid input (no phantom roll)', () => {
    const r = roll('1d0', maxRng);
    expect(r.rolls).toEqual([]);
    expect(r.total).toBe(0);
  });
});

describe('rollDamage', () => {
  it('floors negative results at 0', () => {
    expect(rollDamage('-1d6', maxRng)).toBe(0);
  });
  it('returns the rolled total for positive dice', () => {
    expect(rollDamage('2d6', maxRng)).toBe(12);
  });
});

describe('rollD20', () => {
  it('adds the modifier and detects nat 20', () => {
    const r = rollD20('normal', 5, maxRng);
    expect(r.rolls).toEqual([20]);
    expect(r.total).toBe(25);
    expect(r.crit).toBe('success');
    expect(r.d20).toBe(true);
  });

  it('detects nat 1', () => {
    const r = rollD20('normal', 3, minRng);
    expect(r.rolls).toEqual([1]);
    expect(r.total).toBe(4);
    expect(r.crit).toBe('fail');
  });

  it('keeps the higher die with advantage and records the discard', () => {
    // first d20 -> 5, second d20 -> 15; advantage keeps 15
    const r = rollD20('advantage', 0, seqRng([4 / 20, 14 / 20]));
    expect(r.total).toBe(15);
    expect(r.discarded).toEqual([5]);
  });

  it('keeps the lower die with disadvantage', () => {
    const r = rollD20('disadvantage', 0, seqRng([4 / 20, 14 / 20]));
    expect(r.total).toBe(5);
    expect(r.discarded).toEqual([15]);
  });
});

describe('combineAdvantage', () => {
  it('cancels matching advantage and disadvantage', () => {
    expect(combineAdvantage('advantage', 'disadvantage')).toBe('normal');
  });
  it('keeps the single present mode', () => {
    expect(combineAdvantage('advantage', 'normal')).toBe('advantage');
    expect(combineAdvantage('normal', 'disadvantage')).toBe('disadvantage');
  });
});
