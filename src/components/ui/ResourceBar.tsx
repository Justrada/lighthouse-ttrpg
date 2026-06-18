import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';

export type ResourceKind = 'hp' | 'mp' | 'sp';

export interface ResourceBarProps {
  kind: ResourceKind;
  current: number;
  max: number;
  /** Optional leading label, e.g. "HP". Defaults to the kind uppercased. */
  label?: string;
  /** Hide the numeric "current / max" readout. */
  hideValue?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const palette: Record<
  ResourceKind,
  { from: string; to: string; glow: string; text: string; track: string }
> = {
  hp: {
    from: 'from-[#ff7088]',
    to: 'to-hp',
    glow: 'shadow-[0_0_12px_-1px_rgba(240,80,110,0.6)]',
    text: 'text-hp',
    track: 'bg-hp/10',
  },
  mp: {
    from: 'from-[#7cc5ff]',
    to: 'to-mp',
    glow: 'shadow-[0_0_12px_-1px_rgba(74,168,255,0.6)]',
    text: 'text-mp',
    track: 'bg-mp/10',
  },
  sp: {
    from: 'from-[#8be4a8]',
    to: 'to-sp',
    glow: 'shadow-[0_0_12px_-1px_rgba(90,209,127,0.55)]',
    text: 'text-sp',
    track: 'bg-sp/10',
  },
};

const sizes = {
  sm: { bar: 'h-2', text: 'text-[0.6875rem]', label: 'text-[0.625rem]' },
  md: { bar: 'h-3', text: 'text-xs', label: 'text-xs' },
  lg: { bar: 'h-4', text: 'text-sm', label: 'text-xs' },
} as const;

/**
 * Animated resource meter (HP / MP / SP). Width springs on value change via
 * framer-motion; presentational only — pass `current`/`max`, it computes the
 * percentage purely for display.
 */
export function ResourceBar({
  kind,
  current,
  max,
  label,
  hideValue = false,
  size = 'md',
  className,
}: ResourceBarProps) {
  const c = palette[kind];
  const s = sizes[size];
  const safeMax = Math.max(0, max);
  const safeCurrent = Math.min(Math.max(0, current), safeMax || current);
  const pct = safeMax > 0 ? Math.min(100, (safeCurrent / safeMax) * 100) : 0;
  const displayLabel = label ?? kind.toUpperCase();

  return (
    <div className={cn('w-full', className)}>
      {(!hideValue || label) && (
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <span
            className={cn(
              'font-display font-semibold uppercase tracking-wider',
              s.label,
              c.text,
            )}
          >
            {displayLabel}
          </span>
          {!hideValue && (
            <span className={cn('font-mono tabular-nums text-ink-muted', s.text)}>
              <span className="text-ink">{safeCurrent}</span>
              <span className="text-ink-faint"> / {safeMax}</span>
            </span>
          )}
        </div>
      )}
      <div
        role="meter"
        aria-valuenow={safeCurrent}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-label={displayLabel}
        className={cn(
          'relative w-full overflow-hidden rounded-full ring-1 ring-inset ring-line',
          c.track,
          s.bar,
        )}
      >
        <motion.div
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 180, damping: 26 }}
          className={cn(
            'relative h-full rounded-full bg-gradient-to-r',
            c.from,
            c.to,
            c.glow,
          )}
        >
          {/* Inner top sheen for a glassy fill */}
          <span className="absolute inset-x-0 top-0 h-1/2 rounded-full bg-gradient-to-b from-white/30 to-transparent" />
        </motion.div>
      </div>
    </div>
  );
}
