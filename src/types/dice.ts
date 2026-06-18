export type AdvantageMode = 'normal' | 'advantage' | 'disadvantage';

export interface DiceRollResult {
  /** The original notation, e.g. "2d6+3" or "1d20". */
  notation: string;
  /** Every die face rolled (after advantage selection for d20). */
  rolls: number[];
  /** Flat modifier applied after the dice. */
  modifier: number;
  /** Final summed total. */
  total: number;
  /** True when this was a single d20 check. */
  d20?: boolean;
  advantage?: AdvantageMode;
  /** For advantage/disadvantage: the dice that were discarded. */
  discarded?: number[];
  /** Natural 20 / natural 1 on a d20 roll. */
  crit?: 'success' | 'fail' | null;
}
