import { cn } from '@/lib/cn';

export type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg';
export type SpinnerTone = 'beam' | 'arcane' | 'ink' | 'danger';

export interface SpinnerProps {
  size?: SpinnerSize;
  tone?: SpinnerTone;
  className?: string;
  /** Accessible label; defaults to "Loading". */
  label?: string;
}

const sizes: Record<SpinnerSize, string> = {
  xs: 'h-3 w-3 border',
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-8 w-8 border-[3px]',
};

const tones: Record<SpinnerTone, string> = {
  beam: 'border-beam/30 border-t-beam',
  arcane: 'border-arcane/30 border-t-arcane',
  ink: 'border-current/25 border-t-current',
  danger: 'border-danger/30 border-t-danger',
};

/** A minimal ring spinner. Honors reduced-motion via global CSS where set. */
export function Spinner({
  size = 'md',
  tone = 'beam',
  className,
  label = 'Loading',
}: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        'inline-block animate-spin rounded-full',
        sizes[size],
        tones[tone],
        className,
      )}
    />
  );
}
