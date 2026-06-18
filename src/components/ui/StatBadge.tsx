import { type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface StatBadgeProps {
  label: ReactNode;
  value: ReactNode;
  icon?: ReactNode;
  tone?: 'neutral' | 'beam' | 'arcane' | 'mystic';
  /** Stack label over value (vertical) instead of inline. */
  stacked?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

const toneText: Record<NonNullable<StatBadgeProps['tone']>, string> = {
  neutral: 'text-ink',
  beam: 'text-beam-soft',
  arcane: 'text-arcane-soft',
  mystic: 'text-mystic-soft',
};

const toneIcon: Record<NonNullable<StatBadgeProps['tone']>, string> = {
  neutral: 'text-ink-muted',
  beam: 'text-beam',
  arcane: 'text-arcane',
  mystic: 'text-mystic',
};

/** A label + monospace value pill — for derived stats (AC, initiative, etc.). */
export function StatBadge({
  label,
  value,
  icon,
  tone = 'neutral',
  stacked = false,
  size = 'md',
  className,
}: StatBadgeProps) {
  if (stacked) {
    return (
      <div
        className={cn(
          'flex flex-col items-center gap-0.5 rounded-xl border border-line bg-void/50 px-3 py-2 text-center',
          className,
        )}
      >
        <span className="text-[0.625rem] font-medium uppercase tracking-wider text-ink-faint">
          {label}
        </span>
        <span
          className={cn(
            'inline-flex items-center gap-1 font-mono font-bold tabular-nums',
            size === 'sm' ? 'text-base' : 'text-xl',
            toneText[tone],
          )}
        >
          <span className={toneIcon[tone]}>{icon}</span>
          {value}
        </span>
      </div>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border border-line bg-void/60 px-2.5 py-1',
        size === 'sm' ? 'text-xs' : 'text-sm',
        '[&_svg]:h-3.5 [&_svg]:w-3.5',
        className,
      )}
    >
      {icon && <span className={toneIcon[tone]}>{icon}</span>}
      <span className="text-ink-muted">{label}</span>
      <span
        className={cn('font-mono font-semibold tabular-nums', toneText[tone])}
      >
        {value}
      </span>
    </span>
  );
}
