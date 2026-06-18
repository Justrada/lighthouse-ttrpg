import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ invalid, className, ...props }, ref) => (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'w-full rounded-xl border bg-void/60 px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint transition-colors duration-200 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
        'min-h-[5rem] resize-y leading-relaxed',
        invalid
          ? 'border-danger/60 focus-visible:border-danger focus-visible:shadow-glow-danger'
          : 'border-line focus-visible:border-beam/60 focus-visible:shadow-glow-beam',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';
