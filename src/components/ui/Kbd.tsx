import { type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface KbdProps {
  children: ReactNode;
  size?: 'sm' | 'md';
  className?: string;
}

/** A keyboard-key cap for documenting shortcuts. */
export function Kbd({ children, size = 'md', className }: KbdProps) {
  return (
    <kbd
      className={cn(
        'inline-flex items-center justify-center rounded-md border border-line-strong border-b-2 bg-surface-overlay font-mono font-medium text-ink-muted shadow-inner-line',
        size === 'sm'
          ? 'min-w-[1.25rem] px-1 py-0.5 text-[0.625rem]'
          : 'min-w-[1.5rem] px-1.5 py-0.5 text-xs',
        className,
      )}
    >
      {children}
    </kbd>
  );
}
