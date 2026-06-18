import { useId } from './hooks';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';

export interface TabItem<T extends string = string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  /** Optional trailing count/badge. */
  badge?: React.ReactNode;
  disabled?: boolean;
}

export interface TabsProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  items: TabItem<T>[];
  /** Visual treatment of the bar. */
  variant?: 'underline' | 'pill';
  fullWidth?: boolean;
  className?: string;
  'aria-label'?: string;
}

/**
 * Animated tab bar. `underline` slides a gold indicator under the active tab;
 * `pill` slides a filled pill behind it. Roving via Left/Right arrow keys.
 */
export function Tabs<T extends string = string>({
  value,
  onChange,
  items,
  variant = 'underline',
  fullWidth,
  className,
  'aria-label': ariaLabel,
}: TabsProps<T>) {
  const groupId = useId('tabs');

  const onKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    let next = idx;
    for (let i = 0; i < items.length; i += 1) {
      next = (next + dir + items.length) % items.length;
      if (!items[next].disabled) break;
    }
    onChange(items[next].value);
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'flex items-stretch',
        variant === 'underline'
          ? 'gap-1 border-b border-line'
          : 'gap-1 rounded-xl border border-line bg-void/60 p-1',
        fullWidth && 'w-full',
        className,
      )}
    >
      {items.map((item, idx) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
            onKeyDown={(e) => onKeyDown(e, idx)}
            className={cn(
              'relative inline-flex items-center justify-center gap-2 font-medium transition-colors duration-200 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40',
              fullWidth && 'flex-1',
              variant === 'underline'
                ? cn(
                    'px-4 py-2.5 text-sm',
                    active ? 'text-beam-soft' : 'text-ink-muted hover:text-ink',
                  )
                : cn(
                    'rounded-lg px-3.5 py-1.5 text-sm',
                    active ? 'text-abyss' : 'text-ink-muted hover:text-ink',
                  ),
            )}
          >
            {variant === 'pill' && active && (
              <motion.span
                layoutId={`${groupId}-pill`}
                transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                className="absolute inset-0 -z-0 rounded-lg bg-gradient-to-b from-beam-soft to-beam shadow-glow-beam"
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-2 [&_svg]:h-4 [&_svg]:w-4">
              {item.icon}
              {item.label}
              {item.badge != null && (
                <span className="relative z-10">{item.badge}</span>
              )}
            </span>
            {variant === 'underline' && active && (
              <motion.span
                layoutId={`${groupId}-underline`}
                transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                className="absolute -bottom-px left-2 right-2 h-0.5 rounded-full bg-beam shadow-glow-beam"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
