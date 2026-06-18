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

export type DrawerSide = 'left' | 'right' | 'bottom';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  side?: DrawerSide;
  title?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  hideClose?: boolean;
  disableBackdropClose?: boolean;
  className?: string;
}

const sideLayout: Record<DrawerSide, string> = {
  left: 'inset-y-0 left-0 h-full w-[min(22rem,90vw)] rounded-r-2xl border-r',
  right: 'inset-y-0 right-0 h-full w-[min(22rem,90vw)] rounded-l-2xl border-l',
  bottom:
    'inset-x-0 bottom-0 max-h-[88vh] w-full rounded-t-2xl border-t pb-[env(safe-area-inset-bottom)]',
};

const offscreen: Record<DrawerSide, { x?: string; y?: string }> = {
  left: { x: '-100%' },
  right: { x: '100%' },
  bottom: { y: '100%' },
};

/** Slide-in side / bottom sheet. Ideal for mobile menus and panels. */
export function Drawer({
  open,
  onClose,
  side = 'right',
  title,
  children,
  footer,
  hideClose,
  disableBackdropClose,
  className,
}: DrawerProps) {
  const reduced = usePrefersReducedMotion();
  const trapRef = useFocusTrap<HTMLDivElement>(open);
  const titleId = useId('drawer-title');

  useScrollLock(open);
  useEscapeKey(open, onClose);

  const enter = reduced ? { opacity: 1 } : { x: 0, y: 0 };
  const exit = reduced ? { opacity: 0 } : offscreen[side];
  const from = reduced ? { opacity: 0 } : offscreen[side];

  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[100]">
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
              tabIndex={-1}
              initial={from}
              animate={enter}
              exit={exit}
              transition={{ type: 'spring', stiffness: 360, damping: 36 }}
              className={cn(
                'lh-panel-raised absolute z-10 flex flex-col overflow-hidden',
                sideLayout[side],
                className,
              )}
            >
              {side === 'bottom' && (
                <div className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-line-strong" />
              )}
              {(title || !hideClose) && (
                <div className="flex items-center gap-3 border-b border-line/70 px-5 py-4">
                  {title && (
                    <h2
                      id={titleId}
                      className="min-w-0 flex-1 truncate font-display text-base font-semibold tracking-wide text-ink"
                    >
                      {title}
                    </h2>
                  )}
                  {!hideClose && (
                    <IconButton
                      aria-label="Close"
                      icon={<X />}
                      size="sm"
                      variant="ghost"
                      onClick={onClose}
                      className="-mr-1.5 ml-auto"
                    />
                  )}
                </div>
              )}
              <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
              {footer && (
                <div className="flex items-center justify-end gap-2 border-t border-line/70 px-5 py-4">
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
