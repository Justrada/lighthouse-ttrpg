import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Slot rendered inside the field, before the text. */
  leftIcon?: ReactNode;
  /** Slot rendered inside the field, after the text. */
  rightIcon?: ReactNode;
  /** Renders error styling and wires aria-invalid. */
  invalid?: boolean;
  /** Use the monospace font (for numeric / code entry). */
  mono?: boolean;
}

const fieldBase =
  'w-full rounded-xl border bg-void/60 text-ink placeholder:text-ink-faint transition-colors duration-200 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50';

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    { leftIcon, rightIcon, invalid, mono, className, disabled, ...props },
    ref,
  ) => {
    const field = (
      <input
        ref={ref}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        className={cn(
          fieldBase,
          'h-10 px-3.5 text-sm',
          mono && 'font-mono tracking-tight',
          leftIcon && 'pl-10',
          rightIcon && 'pr-10',
          invalid
            ? 'border-danger/60 focus-visible:border-danger focus-visible:shadow-glow-danger'
            : 'border-line focus-visible:border-beam/60 focus-visible:shadow-glow-beam',
          className,
        )}
        {...props}
      />
    );

    if (!leftIcon && !rightIcon) return field;

    return (
      <div className="relative">
        {leftIcon && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint [&_svg]:h-4 [&_svg]:w-4">
            {leftIcon}
          </span>
        )}
        {field}
        {rightIcon && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint [&_svg]:h-4 [&_svg]:w-4">
            {rightIcon}
          </span>
        )}
      </div>
    );
  },
);
Input.displayName = 'Input';
