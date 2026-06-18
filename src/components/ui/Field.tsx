import { type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface FieldProps {
  label?: ReactNode;
  /** Hint text shown beneath the control. */
  hint?: ReactNode;
  /** Error message — overrides hint and tints it danger. */
  error?: ReactNode;
  /** Marks the field visually as required. */
  required?: boolean;
  /** id to associate the label with the control via htmlFor. */
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}

/**
 * Layout wrapper that pairs a label + hint/error with any control.
 * Presentational only — wire ids yourself for full a11y.
 */
export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  className,
  children,
}: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label
          htmlFor={htmlFor}
          className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-ink-muted"
        >
          {label}
          {required && <span className="text-beam">*</span>}
        </label>
      )}
      {children}
      {(error || hint) && (
        <p
          className={cn(
            'text-xs',
            error ? 'text-danger' : 'text-ink-faint',
          )}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
