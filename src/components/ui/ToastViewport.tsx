import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { Portal } from './Portal';
import { Toast, type ToastData } from './Toast';

export type ToastPosition =
  | 'top-right'
  | 'top-left'
  | 'top-center'
  | 'bottom-right'
  | 'bottom-left'
  | 'bottom-center';

export interface ToastViewportProps {
  toasts: ToastData[];
  onDismiss: (id: string) => void;
  position?: ToastPosition;
  className?: string;
}

const positions: Record<ToastPosition, string> = {
  'top-right': 'top-0 right-0 items-end',
  'top-left': 'top-0 left-0 items-start',
  'top-center': 'top-0 left-1/2 -translate-x-1/2 items-center',
  'bottom-right': 'bottom-0 right-0 items-end',
  'bottom-left': 'bottom-0 left-0 items-start',
  'bottom-center': 'bottom-0 left-1/2 -translate-x-1/2 items-center',
};

/**
 * Fixed-position auto-stacking toast container. Stateless — supply the `toasts`
 * array and an `onDismiss(id)` handler; animate in/out via AnimatePresence.
 */
export function ToastViewport({
  toasts,
  onDismiss,
  position = 'top-right',
  className,
}: ToastViewportProps) {
  const fromTop = position.startsWith('top');
  const fromRight = position.includes('right');

  return (
    <Portal>
      <div
        aria-live="polite"
        className={cn(
          'pointer-events-none fixed z-[120] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2.5 p-4',
          positions[position],
          className,
        )}
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{
                opacity: 0,
                y: fromTop ? -16 : 16,
                x: fromRight ? 24 : -24,
                scale: 0.96,
              }}
              animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
              exit={{
                opacity: 0,
                x: fromRight ? 32 : -32,
                scale: 0.95,
                transition: { duration: 0.18 },
              }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              className="w-full"
            >
              <Toast
                title={t.title}
                body={t.body}
                tone={t.tone}
                onDismiss={() => onDismiss(t.id)}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Portal>
  );
}
