import { cn } from '@/lib/cn';

export interface RoomCodeBadgeProps {
  /** The room code to display, e.g. "AB12CD". */
  code: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizes = {
  sm: 'px-2.5 py-1 text-sm tracking-[0.18em]',
  md: 'px-3.5 py-1.5 text-base tracking-[0.22em]',
  lg: 'px-5 py-2.5 text-2xl tracking-[0.3em]',
} as const;

/**
 * A glowing pill that renders a room code in the monospace face — the beacon's
 * signature that players echo back to find the table.
 */
export function RoomCodeBadge({ code, size = 'md', className }: RoomCodeBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-xl border border-beam/40 bg-void/60 font-mono font-semibold uppercase text-beam-soft shadow-glow-beam',
        sizes[size],
        className,
      )}
    >
      {code}
    </span>
  );
}
