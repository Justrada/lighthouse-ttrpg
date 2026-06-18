import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useId } from './hooks';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
  /** Optional leading element (icon, swatch). */
  icon?: React.ReactNode;
}

export interface SelectProps<T extends string = string> {
  value: T | null;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  /** Trigger size. */
  size?: 'sm' | 'md';
  className?: string;
  /** aria-label when there is no visible <Field> label. */
  'aria-label'?: string;
}

/**
 * Custom accessible listbox select. Keyboard: Up/Down to move, Enter/Space to
 * select, Escape to close, Home/End to jump. Themed to the Arcane aesthetic.
 */
export function Select<T extends string = string>({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  disabled,
  invalid,
  size = 'md',
  className,
  'aria-label': ariaLabel,
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listboxId = useId('listbox');

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // When opening, focus the selected option.
  useEffect(() => {
    if (open) setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [open, selectedIndex]);

  const moveActive = (dir: 1 | -1) => {
    setActiveIndex((idx) => {
      let next = idx;
      for (let i = 0; i < options.length; i += 1) {
        next = (next + dir + options.length) % options.length;
        if (!options[next]?.disabled) break;
      }
      return next;
    });
  };

  const commit = (idx: number) => {
    const opt = options[idx];
    if (!opt || opt.disabled) return;
    onChange(opt.value);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (open) commit(activeIndex);
        else setOpen(true);
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (!open) setOpen(true);
        else moveActive(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!open) setOpen(true);
        else moveActive(-1);
        break;
      case 'Home':
        if (open) {
          e.preventDefault();
          setActiveIndex(0);
        }
        break;
      case 'End':
        if (open) {
          e.preventDefault();
          setActiveIndex(options.length - 1);
        }
        break;
      case 'Escape':
        setOpen(false);
        break;
      case 'Tab':
        setOpen(false);
        break;
    }
  };

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-xl border bg-void/60 text-left text-ink transition-colors duration-200 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
          size === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-3.5 text-sm',
          invalid
            ? 'border-danger/60 focus-visible:border-danger'
            : 'border-line focus-visible:border-beam/60 focus-visible:shadow-glow-beam',
          open && !invalid && 'border-beam/60 shadow-glow-beam',
        )}
      >
        <span
          className={cn(
            'flex min-w-0 items-center gap-2 truncate',
            !selected && 'text-ink-faint',
          )}
        >
          {selected?.icon}
          <span className="truncate">{selected?.label ?? placeholder}</span>
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-ink-muted transition-transform duration-200',
            open && 'rotate-180 text-beam',
          )}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            ref={listRef}
            role="listbox"
            id={listboxId}
            aria-activedescendant={
              activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined
            }
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="absolute z-50 mt-2 max-h-64 w-full overflow-auto rounded-xl border border-line-strong bg-surface-overlay/95 p-1.5 shadow-panel backdrop-blur-xl"
          >
            {options.map((opt, i) => {
              const isSelected = opt.value === value;
              const isActive = i === activeIndex;
              return (
                <li
                  key={opt.value}
                  id={`${listboxId}-${i}`}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={opt.disabled || undefined}
                  onMouseEnter={() => !opt.disabled && setActiveIndex(i)}
                  onClick={() => commit(i)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                    opt.disabled && 'cursor-not-allowed opacity-40',
                    isActive && !opt.disabled && 'bg-beam/15 text-beam-soft',
                    !isActive && 'text-ink',
                  )}
                >
                  {opt.icon}
                  <span className="flex-1 truncate">{opt.label}</span>
                  {isSelected && <Check className="h-4 w-4 text-beam" />}
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
