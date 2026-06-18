import { type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone =
  | 'neutral'
  | 'beam'
  | 'arcane'
  | 'mystic'
  | 'success'
  | 'danger'
  | 'warn';

export type BadgeVariant = 'soft' | 'solid' | 'outline';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  icon?: ReactNode;
  /** Render a small leading status dot in the tone color. */
  dot?: boolean;
}

const soft: Record<BadgeTone, string> = {
  neutral: 'bg-surface-overlay/70 text-ink-muted border-line',
  beam: 'bg-beam/15 text-beam-soft border-beam/30',
  arcane: 'bg-arcane/15 text-arcane-soft border-arcane/30',
  mystic: 'bg-mystic/15 text-mystic-soft border-mystic/30',
  success: 'bg-success/15 text-success border-success/30',
  danger: 'bg-danger/15 text-hp border-danger/30',
  warn: 'bg-warn/15 text-warn border-warn/30',
};

const solid: Record<BadgeTone, string> = {
  neutral: 'bg-surface-overlay text-ink border-transparent',
  beam: 'bg-beam text-abyss border-transparent',
  arcane: 'bg-arcane text-abyss border-transparent',
  mystic: 'bg-mystic text-abyss border-transparent',
  success: 'bg-success text-abyss border-transparent',
  danger: 'bg-danger text-white border-transparent',
  warn: 'bg-warn text-abyss border-transparent',
};

const outline: Record<BadgeTone, string> = {
  neutral: 'bg-transparent text-ink-muted border-line-strong',
  beam: 'bg-transparent text-beam-soft border-beam/50',
  arcane: 'bg-transparent text-arcane-soft border-arcane/50',
  mystic: 'bg-transparent text-mystic-soft border-mystic/50',
  success: 'bg-transparent text-success border-success/50',
  danger: 'bg-transparent text-hp border-danger/50',
  warn: 'bg-transparent text-warn border-warn/50',
};

const dotColor: Record<BadgeTone, string> = {
  neutral: 'bg-ink-faint',
  beam: 'bg-beam',
  arcane: 'bg-arcane',
  mystic: 'bg-mystic',
  success: 'bg-success',
  danger: 'bg-hp',
  warn: 'bg-warn',
};

const variantMap = { soft, solid, outline };

/** A compact status label. */
export function Badge({
  tone = 'neutral',
  variant = 'soft',
  size = 'md',
  icon,
  dot,
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-[0.6875rem]' : 'px-2.5 py-1 text-xs',
        variantMap[variant][tone],
        '[&_svg]:h-3.5 [&_svg]:w-3.5',
        className,
      )}
      {...props}
    >
      {dot && (
        <span className={cn('h-1.5 w-1.5 rounded-full', dotColor[tone])} />
      )}
      {icon}
      {children}
    </span>
  );
}
