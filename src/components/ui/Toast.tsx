import { type ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/cn';

export type ToastTone = 'neutral' | 'success' | 'danger' | 'warn' | 'arcane';

export interface ToastData {
  id: string;
  title: ReactNode;
  body?: ReactNode;
  tone?: ToastTone;
}

export interface ToastProps {
  title: ReactNode;
  body?: ReactNode;
  tone?: ToastTone;
  onDismiss?: () => void;
  /** Optional custom leading icon (overrides the tone default). */
  icon?: ReactNode;
  className?: string;
}

const toneStyles: Record<
  ToastTone,
  { accent: string; icon: ReactNode; iconColor: string }
> = {
  neutral: {
    accent: 'before:bg-beam',
    icon: <Info />,
    iconColor: 'text-beam',
  },
  success: {
    accent: 'before:bg-success',
    icon: <CheckCircle2 />,
    iconColor: 'text-success',
  },
  danger: {
    accent: 'before:bg-danger',
    icon: <XCircle />,
    iconColor: 'text-hp',
  },
  warn: {
    accent: 'before:bg-warn',
    icon: <AlertTriangle />,
    iconColor: 'text-warn',
  },
  arcane: {
    accent: 'before:bg-arcane',
    icon: <Sparkles />,
    iconColor: 'text-arcane',
  },
};

/**
 * A single presentational toast. Stateless — render inside a ToastViewport or
 * your own AnimatePresence stack.
 */
export function Toast({
  title,
  body,
  tone = 'neutral',
  onDismiss,
  icon,
  className,
}: ToastProps) {
  const t = toneStyles[tone];
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'lh-panel-raised pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden p-3.5 pl-4',
        'before:absolute before:inset-y-0 before:left-0 before:w-1',
        t.accent,
        className,
      )}
    >
      <span className={cn('mt-0.5 shrink-0 [&_svg]:h-5 [&_svg]:w-5', t.iconColor)}>
        {icon ?? t.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{title}</p>
        {body && <p className="mt-0.5 text-sm text-ink-muted">{body}</p>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-mr-1 -mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-surface-overlay hover:text-ink focus-visible:outline-none"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
