import { type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface TopBarProps {
  /** Left slot — typically a brand mark / wordmark. */
  brand?: ReactNode;
  /** Center slot — e.g. nav tabs or a title. */
  center?: ReactNode;
  /** Right slot — actions, avatar, menu. */
  actions?: ReactNode;
  /** Stick to the top of the viewport. */
  sticky?: boolean;
  className?: string;
}

/**
 * Presentational app nav bar — a glassy panel with brand / center / actions
 * slots. Stateless; wire navigation in the consumer.
 */
export function TopBar({
  brand,
  center,
  actions,
  sticky = true,
  className,
}: TopBarProps) {
  return (
    <header
      className={cn(
        'z-40 w-full border-b border-line/70 bg-surface/70 backdrop-blur-xl',
        'shadow-[0_4px_24px_-12px_rgba(0,0,0,0.6)]',
        sticky && 'sticky top-0',
        className,
      )}
    >
      <div className="mx-auto flex h-14 w-full max-w-screen-2xl items-center gap-4 px-4 sm:px-6">
        <div className="flex shrink-0 items-center">{brand}</div>
        {center && (
          <div className="flex min-w-0 flex-1 items-center justify-center">
            {center}
          </div>
        )}
        <div className={cn('flex items-center gap-2', !center && 'ml-auto')}>
          {actions}
        </div>
      </div>
    </header>
  );
}
