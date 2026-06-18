import { useId } from './hooks';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';

export interface SegmentOption<T extends string = string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentOption<T>[];
  size?: 'sm' | 'md';
  fullWidth?: boolean;
  /** Accent of the active segment. */
  tone?: 'beam' | 'arcane';
  className?: string;
  'aria-label'?: string;
}

const toneActive = {
  beam: 'text-abyss',
  arcane: 'text-abyss',
} as const;

const tonePill = {
  beam: 'bg-gradient-to-b from-beam-soft to-beam shadow-glow-beam',
  arcane: 'bg-gradient-to-b from-arcane to-arcane-deep shadow-glow-arcane',
} as const;

/** A segmented toggle with an animated sliding active pill. */
export function SegmentedControl<T extends string = string>({
  value,
  onChange,
  options,
  size = 'md',
  fullWidth,
  tone = 'beam',
  className,
  'aria-label': ariaLabel,
}: SegmentedControlProps<T>) {
  const groupId = useId('seg');
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-1 rounded-xl border border-line bg-void/70 p-1',
        fullWidth && 'flex w-full',
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={opt.disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              'relative inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors duration-200 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40',
              size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-9 px-3.5 text-sm',
              fullWidth && 'flex-1',
              active
                ? toneActive[tone]
                : 'text-ink-muted hover:text-ink',
            )}
          >
            {active && (
              <motion.span
                layoutId={`${groupId}-active`}
                transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                className={cn(
                  'absolute inset-0 -z-0 rounded-lg',
                  tonePill[tone],
                )}
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-1.5 [&_svg]:h-4 [&_svg]:w-4">
              {opt.icon}
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
