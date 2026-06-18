import { type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface DividerProps {
  orientation?: 'horizontal' | 'vertical';
  /** Optional centered label (horizontal only). */
  label?: ReactNode;
  className?: string;
}

/** A hairline rule, optionally with a centered label. Uses the gradient hairline. */
export function Divider({
  orientation = 'horizontal',
  label,
  className,
}: DividerProps) {
  if (orientation === 'vertical') {
    return (
      <span
        role="separator"
        aria-orientation="vertical"
        className={cn(
          'mx-1 inline-block h-full w-px self-stretch bg-gradient-to-b from-transparent via-line-strong to-transparent',
          className,
        )}
      />
    );
  }

  if (label) {
    return (
      <div
        role="separator"
        className={cn('flex items-center gap-3', className)}
      >
        <span className="hairline flex-1" />
        <span className="shrink-0 font-display text-xs uppercase tracking-widest text-ink-faint">
          {label}
        </span>
        <span className="hairline flex-1" />
      </div>
    );
  }

  return <div role="separator" className={cn('hairline', className)} />;
}
