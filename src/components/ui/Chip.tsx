import { type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface ChipProps {
  children: ReactNode;
  icon?: ReactNode;
  /** Renders a remove (×) button and calls back. */
  onRemove?: () => void;
  /** Makes the whole chip clickable (filter / selectable). */
  onClick?: () => void;
  /** Selected/active state for filter chips. */
  selected?: boolean;
  tone?: 'neutral' | 'beam' | 'arcane' | 'mystic';
  size?: 'sm' | 'md';
  disabled?: boolean;
  className?: string;
}

const toneSelected: Record<NonNullable<ChipProps['tone']>, string> = {
  neutral: 'border-line-strong bg-surface-overlay text-ink',
  beam: 'border-beam/50 bg-beam/15 text-beam-soft shadow-glow-beam',
  arcane: 'border-arcane/50 bg-arcane/15 text-arcane-soft shadow-glow-arcane',
  mystic: 'border-mystic/50 bg-mystic/15 text-mystic-soft',
};

/** An interactive chip — filter, selection, or removable token. */
export function Chip({
  children,
  icon,
  onRemove,
  onClick,
  selected,
  tone = 'neutral',
  size = 'md',
  disabled,
  className,
}: ChipProps) {
  const clickable = !!onClick && !disabled;
  const Comp = clickable ? motion.button : motion.span;

  return (
    <Comp
      type={clickable ? 'button' : undefined}
      onClick={clickable ? onClick : undefined}
      disabled={clickable ? disabled : undefined}
      aria-pressed={clickable ? selected : undefined}
      whileTap={clickable ? { scale: 0.95 } : undefined}
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-medium transition-colors duration-200',
        size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
        selected
          ? toneSelected[tone]
          : 'border-line bg-void/60 text-ink-muted',
        clickable &&
          !selected &&
          'cursor-pointer hover:border-line-strong hover:text-ink',
        disabled && 'cursor-not-allowed opacity-50',
        '[&_svg]:h-3.5 [&_svg]:w-3.5',
        className,
      )}
    >
      {icon}
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label="Remove"
          className="-mr-1 ml-0.5 grid h-4 w-4 place-items-center rounded-full text-current/70 transition-colors hover:bg-white/10 hover:text-current focus-visible:outline-none"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </Comp>
  );
}
