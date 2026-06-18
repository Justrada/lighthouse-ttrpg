import { type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  icon?: ReactNode;
  tone?: 'beam' | 'arcane' | 'mystic' | 'neutral';
}

const tones: Record<NonNullable<TagProps['tone']>, string> = {
  beam: 'text-beam-soft border-beam/25',
  arcane: 'text-arcane-soft border-arcane/25',
  mystic: 'text-mystic-soft border-mystic/25',
  neutral: 'text-ink-muted border-line',
};

/**
 * A small, low-emphasis metadata tag (rectangular, uppercase) — for item
 * rarity, categories, keywords.
 */
export function Tag({
  icon,
  tone = 'neutral',
  className,
  children,
  ...props
}: TagProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border bg-void/40 px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wider',
        tones[tone],
        '[&_svg]:h-3 [&_svg]:w-3',
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </span>
  );
}
