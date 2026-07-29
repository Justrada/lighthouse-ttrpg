import { motion } from 'framer-motion';
import { ChevronsDown, ChevronsUp } from 'lucide-react';
import type { DiceRollResult } from '@/types';
import { cn } from '@/lib/cn';
import { Die, type DieSides } from './Die';

export interface DiceResultProps {
  result: DiceRollResult;
  /** Pixel size of each die face. */
  dieSize?: number;
  /** Hide the original notation caption. */
  hideNotation?: boolean;
  className?: string;
}

/** Best-effort extraction of die sides from a notation like "2d6+3" → 6. */
function sidesFromNotation(notation: string, isD20?: boolean): DieSides {
  if (isD20) return 20;
  const m = /d(\d+)/i.exec(notation);
  const n = m ? Number(m[1]) : 6;
  const allowed: DieSides[] = [4, 6, 8, 10, 12, 20];
  return allowed.includes(n as DieSides) ? (n as DieSides) : 6;
}

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

const dieItem = {
  hidden: { opacity: 0, scale: 0.5, rotate: -25 },
  show: {
    opacity: 1,
    scale: 1,
    rotate: 0,
    transition: { type: 'spring' as const, stiffness: 320, damping: 18 },
  },
};

/**
 * Animated reveal of a dice roll. Staggers each die in, shows the modifier and
 * a large monospace total, highlights natural crit success/fail in gold/red,
 * and renders advantage/disadvantage with discarded dice struck through.
 */
export function DiceResult({
  result,
  dieSize = 44,
  hideNotation = false,
  className,
}: DiceResultProps) {
  // Defensive defaults: a malformed roll entry (e.g. an unvalidated inbound
  // `dice_roll` payload) must never crash the feed render via `rolls.map`/`reduce`.
  const { notation, rolls = [], modifier = 0, total = 0, d20, advantage, discarded, crit } =
    result;
  const sides = sidesFromNotation(notation, d20);
  const isCritSuccess = crit === 'success';
  const isCritFail = crit === 'fail';
  const dieTone = isCritSuccess ? 'crit' : isCritFail ? 'fail' : 'beam';

  const totalColor = isCritSuccess
    ? 'text-beam-soft text-glow-beam'
    : isCritFail
      ? 'text-hp'
      : 'text-ink';

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className={cn(
        'flex flex-col items-center gap-3 rounded-2xl border border-line bg-void/50 p-4',
        isCritSuccess && 'border-beam/40 shadow-glow-beam',
        isCritFail && 'border-danger/40 shadow-glow-danger',
        className,
      )}
    >
      {advantage && advantage !== 'normal' && (
        <motion.span
          variants={dieItem}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wider',
            advantage === 'advantage'
              ? 'border-success/40 bg-success/10 text-success'
              : 'border-danger/40 bg-danger/10 text-hp',
          )}
        >
          {advantage === 'advantage' ? (
            <ChevronsUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronsDown className="h-3.5 w-3.5" />
          )}
          {advantage}
        </motion.span>
      )}

      {/* Dice row: kept dice, then discarded (struck through) */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {rolls.map((r, i) => (
          <motion.div key={`r-${i}`} variants={dieItem}>
            <Die sides={sides} value={r} size={dieSize} tone={dieTone} />
          </motion.div>
        ))}
        {discarded?.map((d, i) => (
          <motion.div
            key={`d-${i}`}
            variants={dieItem}
            className="relative opacity-40 grayscale"
            aria-label={`discarded ${d}`}
          >
            <Die sides={sides} value={d} size={dieSize * 0.8} tone="neutral" />
            <span className="pointer-events-none absolute left-1/2 top-1/2 h-0.5 w-[120%] -translate-x-1/2 -translate-y-1/2 rotate-[-20deg] rounded-full bg-hp/80" />
          </motion.div>
        ))}
      </div>

      {/* Total */}
      <motion.div variants={dieItem} className="flex items-end gap-2">
        <div className="flex items-baseline gap-1.5">
          {modifier !== 0 && (
            <span className="font-mono text-sm text-ink-muted">
              {rolls.reduce((a, b) => a + b, 0)}
              <span className="text-beam">
                {' '}
                {modifier > 0 ? `+ ${modifier}` : `− ${Math.abs(modifier)}`}
              </span>
              <span className="px-1 text-ink-faint">=</span>
            </span>
          )}
          <span
            className={cn(
              'font-mono text-4xl font-bold leading-none tabular-nums',
              totalColor,
            )}
          >
            {total}
          </span>
        </div>
      </motion.div>

      {(isCritSuccess || isCritFail) && (
        <motion.span
          variants={dieItem}
          className={cn(
            'font-display text-xs font-bold uppercase tracking-[0.2em]',
            isCritSuccess ? 'text-beam-soft' : 'text-hp',
          )}
        >
          {isCritSuccess ? 'Critical Success' : 'Critical Fail'}
        </motion.span>
      )}

      {!hideNotation && (
        <span className="font-mono text-xs text-ink-faint">{notation}</span>
      )}
    </motion.div>
  );
}
