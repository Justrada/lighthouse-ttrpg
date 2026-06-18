import { forwardRef, type ReactNode } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/cn';

export interface CardProps
  extends Omit<HTMLMotionProps<'div'>, 'children' | 'title'> {
  /** Adds hover lift + glow and a pointer cursor. */
  interactive?: boolean;
  /** Accent tone for the hover glow / left edge. */
  accent?: 'beam' | 'arcane' | 'mystic' | 'none';
  /** Renders a thin accent bar down the left edge. */
  edge?: boolean;
  children?: ReactNode;
}

const accentGlow: Record<NonNullable<CardProps['accent']>, string> = {
  beam: 'hover:border-beam/50 hover:shadow-glow-beam',
  arcane: 'hover:border-arcane/50 hover:shadow-glow-arcane',
  mystic: 'hover:border-mystic/50 hover:shadow-[0_0_24px_-2px_rgba(167,139,250,0.4)]',
  none: 'hover:border-line-strong',
};

const edgeColor: Record<NonNullable<CardProps['accent']>, string> = {
  beam: 'before:bg-beam',
  arcane: 'before:bg-arcane',
  mystic: 'before:bg-mystic',
  none: 'before:bg-line-strong',
};

/** A lighter content card. Use `interactive` for clickable list items. */
export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      interactive = false,
      accent = 'beam',
      edge = false,
      className,
      children,
      ...props
    },
    ref,
  ) => (
    <motion.div
      ref={ref}
      whileHover={interactive ? { y: -2 } : undefined}
      whileTap={interactive ? { scale: 0.99 } : undefined}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={cn(
        'relative overflow-hidden rounded-xl border border-line bg-surface/60 p-4 transition-colors duration-200',
        edge &&
          'before:absolute before:inset-y-0 before:left-0 before:w-1 before:rounded-l-xl ' +
            edgeColor[accent],
        interactive &&
          cn('cursor-pointer tap-highlight-none', accentGlow[accent]),
        className,
      )}
      {...props}
    >
      {children}
    </motion.div>
  ),
);
Card.displayName = 'Card';
