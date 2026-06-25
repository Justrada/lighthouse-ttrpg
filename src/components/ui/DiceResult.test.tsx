import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { DiceResult } from './DiceResult';
import type { DiceRollResult } from '@/types';

describe('DiceResult', () => {
  it('renders a malformed roll entry without crashing the feed', () => {
    // Mirrors an unvalidated inbound `dice_roll` payload reaching the roll feed:
    // missing `rolls`/`total`/`modifier` must not throw via `rolls.map`/`reduce`.
    const malformed = { notation: '1d20' } as unknown as DiceRollResult;
    expect(() => render(<DiceResult result={malformed} />)).not.toThrow();
  });

  it('renders a well-formed roll', () => {
    const ok: DiceRollResult = { notation: '2d6', rolls: [3, 4], modifier: 0, total: 7 };
    const { container } = render(<DiceResult result={ok} />);
    expect(container.textContent).toContain('7');
  });
});
