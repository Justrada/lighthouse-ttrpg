import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'arcane';

export type ButtonSize = 'sm' | 'md' | 'lg';

/** Event props whose types conflict between React DOM and framer-motion. */
type ConflictingMotionProps =
  | 'onDrag'
  | 'onDragStart'
  | 'onDragEnd'
  | 'onAnimationStart'
  | 'onAnimationEnd'
  | 'onAnimationIteration';

export interface ButtonProps
  extends Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    ConflictingMotionProps
  > {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and disables interaction. */
  loading?: boolean;
  /** Stretches the button to fill its container. */
  fullWidth?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  children?: ReactNode;
}

const base =
  'relative inline-flex select-none items-center justify-center gap-2 rounded-xl font-sans font-semibold tracking-wide transition-colors duration-200 tap-highlight-none disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none focus-visible:outline-none';

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-b from-beam-soft to-beam text-abyss shadow-glow-beam hover:from-beam hover:to-beam-deep hover:shadow-glow-beam-lg border border-beam-deep/40',
  secondary:
    'bg-surface-overlay/80 text-ink border border-line-strong hover:bg-surface-overlay hover:border-beam/40 hover:text-beam-soft',
  ghost:
    'bg-transparent text-ink-muted hover:bg-surface-raised/70 hover:text-ink border border-transparent',
  danger:
    'bg-gradient-to-b from-danger to-hp text-white shadow-glow-danger hover:brightness-110 border border-danger/50',
  arcane:
    'bg-gradient-to-b from-arcane to-arcane-deep text-abyss shadow-glow-arcane hover:brightness-110 border border-arcane-deep/50',
};

/** Spinner tint per variant so it reads on the button surface. */
const spinnerTone: Record<ButtonVariant, 'beam' | 'arcane' | 'ink' | 'danger'> =
  {
    primary: 'ink',
    secondary: 'beam',
    ghost: 'ink',
    danger: 'ink',
    arcane: 'ink',
  };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      fullWidth = false,
      leftIcon,
      rightIcon,
      disabled,
      className,
      children,
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
        whileTap={isDisabled ? undefined : { scale: 0.96 }}
        whileHover={isDisabled ? undefined : { y: -1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className={cn(
          base,
          sizes[size],
          variants[variant],
          fullWidth && 'w-full',
          className,
        )}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && (
          <span className="absolute inset-0 grid place-items-center">
            <Spinner
              size={size === 'lg' ? 'md' : 'sm'}
              tone={spinnerTone[variant]}
            />
          </span>
        )}
        <span
          className={cn(
            'inline-flex items-center gap-2',
            loading && 'invisible',
          )}
        >
          {leftIcon && <span className="shrink-0">{leftIcon}</span>}
          {children}
          {rightIcon && <span className="shrink-0">{rightIcon}</span>}
        </span>
      </motion.button>
    );
  },
);

Button.displayName = 'Button';
