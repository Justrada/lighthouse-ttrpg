import { type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  hint?: ReactNode;
  /** Call-to-action node, e.g. a <Button>. */
  action?: ReactNode;
  size?: 'sm' | 'md';
  className?: string;
}

/** A centered empty / zero-data placeholder with optional action. */
export function EmptyState({
  icon,
  title,
  hint,
  action,
  size = 'md',
  className,
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'flex flex-col items-center justify-center text-center',
        size === 'sm' ? 'gap-2 py-8' : 'gap-3 py-14',
        className,
      )}
    >
      {icon && (
        <div
          className={cn(
            'grid place-items-center rounded-2xl border border-line bg-void/50 text-ink-faint',
            size === 'sm'
              ? 'h-12 w-12 [&_svg]:h-6 [&_svg]:w-6'
              : 'h-16 w-16 [&_svg]:h-8 [&_svg]:w-8',
          )}
        >
          {icon}
        </div>
      )}
      <div className="space-y-1">
        <h3
          className={cn(
            'font-display font-semibold tracking-wide text-ink',
            size === 'sm' ? 'text-base' : 'text-lg',
          )}
        >
          {title}
        </h3>
        {hint && (
          <p className="mx-auto max-w-sm text-sm text-ink-muted">{hint}</p>
        )}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </motion.div>
  );
}
