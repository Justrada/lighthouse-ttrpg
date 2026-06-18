import { Minus, Plus } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';

export interface NumberStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  /** Allow direct typing in the middle field. */
  editable?: boolean;
  className?: string;
  'aria-label'?: string;
}

const sizes = {
  sm: { btn: 'h-7 w-7 [&_svg]:h-3.5 [&_svg]:w-3.5', val: 'h-7 min-w-[2.5rem] text-sm' },
  md: { btn: 'h-9 w-9 [&_svg]:h-4 [&_svg]:w-4', val: 'h-9 min-w-[3rem] text-base' },
  lg: { btn: 'h-11 w-11 [&_svg]:h-5 [&_svg]:w-5', val: 'h-11 min-w-[3.5rem] text-lg' },
} as const;

/** A − value + stepper for bounded numeric values. */
export function NumberStepper({
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  disabled,
  size = 'md',
  editable = false,
  className,
  'aria-label': ariaLabel,
}: NumberStepperProps) {
  const s = sizes[size];
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const dec = () => onChange(clamp(value - step));
  const inc = () => onChange(clamp(value + step));
  const atMin = value <= min;
  const atMax = value >= max;

  const btn =
    'grid place-items-center text-ink-muted transition-colors hover:text-beam disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:text-beam';

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center overflow-hidden rounded-xl border border-line bg-void/60',
        disabled && 'opacity-50',
        className,
      )}
    >
      <motion.button
        type="button"
        whileTap={atMin || disabled ? undefined : { scale: 0.85 }}
        onClick={dec}
        disabled={disabled || atMin}
        aria-label="Decrease"
        className={cn(btn, s.btn, 'border-r border-line')}
      >
        <Minus />
      </motion.button>

      {editable ? (
        <input
          type="number"
          value={Number.isFinite(value) ? value : ''}
          disabled={disabled}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isNaN(n)) onChange(clamp(n));
          }}
          aria-label={ariaLabel}
          className={cn(
            'bg-transparent px-1 text-center font-mono font-semibold tabular-nums text-ink focus-visible:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
            s.val,
          )}
        />
      ) : (
        <output
          className={cn(
            'grid place-items-center px-1 font-mono font-semibold tabular-nums text-ink',
            s.val,
          )}
        >
          {value}
        </output>
      )}

      <motion.button
        type="button"
        whileTap={atMax || disabled ? undefined : { scale: 0.85 }}
        onClick={inc}
        disabled={disabled || atMax}
        aria-label="Increase"
        className={cn(btn, s.btn, 'border-l border-line')}
      >
        <Plus />
      </motion.button>
    </div>
  );
}
