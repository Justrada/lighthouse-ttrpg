import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  /** Accent color when on. */
  tone?: 'beam' | 'arcane';
  /** Accessible label (required if no visible label is associated). */
  'aria-label'?: string;
  'aria-labelledby'?: string;
  id?: string;
  className?: string;
}

const dims = {
  sm: { track: 'h-5 w-9', thumb: 'h-3.5 w-3.5', travel: 16 },
  md: { track: 'h-6 w-11', thumb: 'h-[1.125rem] w-[1.125rem]', travel: 22 },
} as const;

const toneOn = {
  beam: 'bg-beam shadow-glow-beam',
  arcane: 'bg-arcane shadow-glow-arcane',
} as const;

/** An accessible toggle switch with a spring thumb. */
export function Switch({
  checked,
  onChange,
  disabled,
  size = 'md',
  tone = 'beam',
  className,
  id,
  ...aria
}: SwitchProps) {
  const d = dims[size];
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-full border border-line p-0.5 transition-colors duration-200 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
        d.track,
        checked ? toneOn[tone] : 'bg-surface-overlay',
        className,
      )}
      {...aria}
    >
      <motion.span
        layout
        initial={false}
        animate={{ x: checked ? d.travel : 0 }}
        transition={{ type: 'spring', stiffness: 600, damping: 32 }}
        className={cn(
          'block rounded-full bg-white shadow-sm',
          d.thumb,
        )}
      />
    </button>
  );
}
