import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

export type IconButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'arcane';

export type IconButtonSize = 'sm' | 'md' | 'lg';

/** Event props whose types conflict between React DOM and framer-motion. */
type ConflictingMotionProps =
  | 'onDrag'
  | 'onDragStart'
  | 'onDragEnd'
  | 'onAnimationStart'
  | 'onAnimationEnd'
  | 'onAnimationIteration';

export interface IconButtonProps
  extends Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    ConflictingMotionProps
  > {
  /** Required for accessibility — describes the action. */
  'aria-label': string;
  icon: ReactNode;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  loading?: boolean;
  /** Renders as a perfect circle instead of a rounded square. */
  round?: boolean;
}

const sizes: Record<IconButtonSize, string> = {
  sm: 'h-8 w-8 [&_svg]:h-4 [&_svg]:w-4',
  md: 'h-10 w-10 [&_svg]:h-5 [&_svg]:w-5',
  lg: 'h-12 w-12 [&_svg]:h-6 [&_svg]:w-6',
};

const variants: Record<IconButtonVariant, string> = {
  primary:
    'bg-gradient-to-b from-beam-soft to-beam text-abyss shadow-glow-beam hover:shadow-glow-beam-lg border border-beam-deep/40',
  secondary:
    'bg-surface-overlay/80 text-ink border border-line-strong hover:border-beam/40 hover:text-beam-soft',
  ghost:
    'bg-transparent text-ink-muted hover:bg-surface-raised/70 hover:text-ink',
  danger:
    'bg-surface-overlay/60 text-danger border border-danger/30 hover:bg-danger/15 hover:border-danger/60',
  arcane:
    'bg-surface-overlay/80 text-arcane border border-arcane/30 hover:bg-arcane/15 hover:border-arcane/60',
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      icon,
      variant = 'ghost',
      size = 'md',
      loading = false,
      round = false,
      disabled,
      className,
      type = 'button',
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;
    return (
      <motion.button
        ref={ref}
        type={type}
        disabled={isDisabled}
        whileTap={isDisabled ? undefined : { scale: 0.9 }}
        whileHover={isDisabled ? undefined : { scale: 1.05 }}
        transition={{ type: 'spring', stiffness: 500, damping: 28 }}
        className={cn(
          'relative inline-grid place-items-center transition-colors duration-200 tap-highlight-none focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
          round ? 'rounded-full' : 'rounded-xl',
          sizes[size],
          variants[variant],
          className,
        )}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? <Spinner size="sm" tone="ink" /> : icon}
      </motion.button>
    );
  },
);

IconButton.displayName = 'IconButton';
