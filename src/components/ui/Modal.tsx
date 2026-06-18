import { type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Portal } from './Portal';
import { IconButton } from './IconButton';
import {
  useEscapeKey,
  useFocusTrap,
  useId,
  usePrefersReducedMotion,
  useScrollLock,
} from './hooks';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
  /** Disable closing on backdrop click. */
  disableBackdropClose?: boolean;
  /** Hide the default close (X) button. */
  hideClose?: boolean;
  className?: string;
}

const sizes: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

/**
 * A centered dialog with backdrop blur, focus trap, scroll lock, Esc-to-close
 * and click-outside. framer-motion enter/exit; respects reduced motion.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  disableBackdropClose,
  hideClose,
  className,
}: ModalProps) {
  const reduced = usePrefersReducedMotion();
  const trapRef = useFocusTrap<HTMLDivElement>(open);
  const titleId = useId('modal-title');
  const descId = useId('modal-desc');

  useScrollLock(open);
  useEscapeKey(open, onClose);

  const panelMotion = reduced
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
      }
    : {
        initial: { opacity: 0, scale: 0.96, y: 12 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.97, y: 8 },
      };

  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={disableBackdropClose ? undefined : onClose}
              className="absolute inset-0 bg-abyss/70 backdrop-blur-md"
              aria-hidden
            />
            <motion.div
              ref={trapRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={title ? titleId : undefined}
              aria-describedby={description ? descId : undefined}
              tabIndex={-1}
              {...panelMotion}
              transition={{
                type: 'spring',
                stiffness: 380,
                damping: 32,
              }}
              className={cn(
                'lh-panel-raised relative z-10 flex max-h-[calc(100vh-3rem)] w-full flex-col overflow-hidden',
                sizes[size],
                className,
              )}
            >
              {(title || !hideClose) && (
                <div className="flex items-start gap-4 border-b border-line/70 px-6 py-4">
                  <div className="min-w-0 flex-1">
                    {title && (
                      <h2
                        id={titleId}
                        className="font-display text-lg font-semibold tracking-wide text-ink"
                      >
                        {title}
                      </h2>
                    )}
                    {description && (
                      <p id={descId} className="mt-1 text-sm text-ink-muted">
                        {description}
                      </p>
                    )}
                  </div>
                  {!hideClose && (
                    <IconButton
                      aria-label="Close dialog"
                      icon={<X />}
                      size="sm"
                      variant="ghost"
                      onClick={onClose}
                      className="-mr-1.5"
                    />
                  )}
                </div>
              )}

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                {children}
              </div>

              {footer && (
                <div className="flex items-center justify-end gap-2 border-t border-line/70 px-6 py-4">
                  {footer}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </Portal>
  );
}
