import { type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { BeamBackground } from '../atmosphere/BeamBackground';

export interface PageShellProps {
  children: ReactNode;
  /** Fixed bar rendered above the scrolling content (e.g. <TopBar/>). */
  topBar?: ReactNode;
  /** Constrain the content width. */
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  /** Add default horizontal + vertical padding to the content container. */
  padded?: boolean;
  /** Center content vertically (for splash / empty pages). */
  center?: boolean;
  /** Disable the atmospheric BeamBackground. */
  noBackground?: boolean;
  /** Forwarded to BeamBackground. */
  reducedMotion?: boolean;
  className?: string;
  /** Class applied to the inner content container. */
  contentClassName?: string;
}

const widths = {
  sm: 'max-w-screen-sm',
  md: 'max-w-screen-md',
  lg: 'max-w-screen-lg',
  xl: 'max-w-screen-xl',
  '2xl': 'max-w-screen-2xl',
  full: 'max-w-none',
} as const;

/**
 * Full-height page wrapper that renders the signature BeamBackground behind a
 * content container, with an optional top bar slot. The background sits at z-0;
 * content sits above it.
 */
export function PageShell({
  children,
  topBar,
  maxWidth = '2xl',
  padded = true,
  center = false,
  noBackground = false,
  reducedMotion,
  className,
  contentClassName,
}: PageShellProps) {
  return (
    <div className={cn('relative flex min-h-full flex-col', className)}>
      {!noBackground && (
        <BeamBackground reducedMotion={reducedMotion} className="fixed z-0" />
      )}

      <div className="relative z-10 flex min-h-full flex-1 flex-col">
        {topBar}
        <main
          className={cn(
            'flex flex-1 flex-col',
            center && 'items-center justify-center',
          )}
        >
          <div
            className={cn(
              'mx-auto w-full',
              widths[maxWidth],
              padded && 'px-4 py-6 sm:px-6 sm:py-8',
              contentClassName,
            )}
          >
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
