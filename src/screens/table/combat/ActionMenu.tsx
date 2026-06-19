import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Sparkles,
  Swords,
  FlaskConical,
  Footprints,
  Shield,
  ChevronRight,
  X,
  Replace,
} from 'lucide-react';
import type { ActionType } from '@/types';
import { Portal, useEscapeKey } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { ActionOption } from '../shared/actionOptions';

/** An option as offered in the menu, annotated with reach state. */
export interface ActionMenuItem {
  option: ActionOption;
  /** False → shown greyed with a hint ({@link note} or "out of range"). */
  inRange: boolean;
  /** Small badge after the label, e.g. a consumable count "×2". */
  badge?: string;
  /** Disabled hint shown in place of "out of range" (e.g. "none left"). */
  note?: string;
}

export interface ActionMenuProps {
  /** Title shown in the menu header (usually the clicked combatant's name). */
  title: string;
  /** Short subtitle, e.g. "Enemy · 2 hexes away". */
  subtitle?: string;
  items: ActionMenuItem[];
  /** Anchor point in viewport coordinates (the clicked token's center). */
  anchor: { x: number; y: number };
  onPick: (option: ActionOption) => void;
  onClose: () => void;
}

const typeIcon: Record<ActionType, JSX.Element> = {
  Move: <Footprints className="h-4 w-4" />,
  Guard: <Shield className="h-4 w-4" />,
  'Use Ability': <Sparkles className="h-4 w-4" />,
  'Weapon Attack': <Swords className="h-4 w-4" />,
  'Use Item': <FlaskConical className="h-4 w-4" />,
  'Change Equipment': <Replace className="h-4 w-4" />,
  Flee: <ChevronRight className="h-4 w-4" />,
  Pass: <X className="h-4 w-4" />,
};

const MENU_W = 248;

/**
 * A small popover anchored near a clicked token, listing the offensive /
 * supportive / self options the actor may stage against that target. Each row
 * shows an icon, label, cost, and a range/AOE badge; out-of-range options are
 * disabled with a hint. Keyboard-accessible (arrow keys move focus, Enter
 * selects) and closes on Esc, outside-click, or selection.
 */
export function ActionMenu({
  title,
  subtitle,
  items,
  anchor,
  onPick,
  onClose,
}: ActionMenuProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEscapeKey(true, onClose);

  // Close on outside pointer-down.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    // Defer so the opening click doesn't immediately close it.
    const id = window.setTimeout(() => document.addEventListener('pointerdown', onDown), 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [onClose]);

  // Focus the first enabled item on open.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const first = panelRef.current?.querySelector<HTMLButtonElement>('button[data-item]:not([disabled])');
      first?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // Roving focus with arrow keys.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const buttons = Array.from(
      panelRef.current?.querySelectorAll<HTMLButtonElement>('button[data-item]:not([disabled])') ?? [],
    );
    if (!buttons.length) return;
    const idx = buttons.findIndex((b) => b === document.activeElement);
    const next =
      e.key === 'ArrowDown'
        ? buttons[(idx + 1 + buttons.length) % buttons.length]
        : buttons[(idx - 1 + buttons.length) % buttons.length];
    next?.focus();
  };

  // Clamp the panel into the viewport.
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  const left = Math.min(Math.max(12, anchor.x - MENU_W / 2), vw - MENU_W - 12);
  const placeAbove = anchor.y > vh * 0.55;
  const top = placeAbove ? anchor.y - 12 : anchor.y + 36;

  return (
    <Portal>
      <AnimatePresence>
        <motion.div
          ref={panelRef}
          role="menu"
          aria-label={`Actions for ${title}`}
          onKeyDown={onKeyDown}
          initial={{ opacity: 0, scale: 0.94, y: placeAbove ? 6 : -6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94 }}
          transition={{ type: 'spring', stiffness: 460, damping: 32 }}
          className="fixed z-50 overflow-hidden rounded-2xl border border-line-strong bg-surface/95 shadow-panel backdrop-blur-md"
          style={{
            left,
            top,
            width: MENU_W,
            transform: placeAbove ? 'translateY(-100%)' : undefined,
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-line/70 bg-void/40 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate font-display text-xs font-semibold tracking-wide text-ink">
                {title}
              </p>
              {subtitle && (
                <p className="truncate font-mono text-[0.625rem] text-ink-faint">{subtitle}</p>
              )}
            </div>
            <button
              type="button"
              aria-label="Close menu"
              onClick={onClose}
              className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-ink-faint transition-colors hover:bg-surface-raised hover:text-ink focus-visible:outline-none"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Options */}
          {items.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-ink-faint">No actions available.</p>
          ) : (
            <ul className="max-h-[16rem] overflow-y-auto py-1">
              {items.map(({ option, inRange, badge, note }) => (
                <li key={option.key}>
                  <button
                    type="button"
                    role="menuitem"
                    data-item
                    disabled={!inRange}
                    onClick={() => inRange && onPick(option)}
                    className={cn(
                      'flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors focus-visible:outline-none',
                      inRange
                        ? 'text-ink hover:bg-surface-overlay/70 focus-visible:bg-surface-overlay/70'
                        : 'cursor-not-allowed text-ink-faint',
                    )}
                  >
                    <span
                      className={cn(
                        'grid h-7 w-7 shrink-0 place-items-center rounded-lg',
                        inRange ? 'bg-beam/10 text-beam-soft' : 'bg-void/50 text-ink-faint',
                      )}
                    >
                      {typeIcon[option.actionType] ?? <Sparkles className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium">{option.label}</span>
                        {option.cost && (
                          <span className="shrink-0 font-mono text-[0.625rem] text-mp">
                            {option.cost}
                          </span>
                        )}
                        {badge && (
                          <span className="shrink-0 font-mono text-[0.625rem] text-ink-faint">
                            {badge}
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-1.5 text-[0.625rem]">
                        {option.range && (
                          <span className="rounded bg-arcane/10 px-1 font-mono text-arcane-soft">
                            {option.range}
                            {option.aoe && option.aoe !== 'Single Target' ? ` · ${option.aoe}` : ''}
                          </span>
                        )}
                        {!inRange && <span className="text-hp">{note ?? 'out of range'}</span>}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </motion.div>
      </AnimatePresence>
    </Portal>
  );
}
