import { describe, it, expect } from 'vitest';
import { parseDiceNotation, roll } from './dice';

describe('dice count cap', () => {
  it('caps an absurd dice count so a roll stays bounded', () => {
    expect(parseDiceNotation('999999999d6')!.count).toBe(1000);
    expect(roll('999999999d6').rolls.length).toBe(1000);
    expect(parseDiceNotation('2d6')!.count).toBe(2); // normal notation unaffected
  });
});
