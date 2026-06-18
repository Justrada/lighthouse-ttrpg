import type { LucideIcon } from 'lucide-react';
import { ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';

export type PortalAccent = 'beam' | 'arcane' | 'mystic';

export interface PortalCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  accent?: PortalAccent;
  onClick: () => void;
}

/** Per-accent styling for the icon halo + hover treatment. */
const accentStyles: Record<
  PortalAccent,
  { ring: string; iconWrap: string; icon: string; glow: string; title: string }
> = {
  beam: {
    ring: 'hover:border-beam/60 focus-visible:border-beam/60',
    iconWrap: 'border-beam/30 bg-beam/10 group-hover:border-beam/60 group-hover:bg-beam/20',
    icon: 'text-beam-soft',
    glow: 'group-hover:shadow-glow-beam',
    title: 'group-hover:text-beam-soft',
  },
  arcane: {
    ring: 'hover:border-arcane/60 focus-visible:border-arcane/60',
    iconWrap:
      'border-arcane/30 bg-arcane/10 group-hover:border-arcane/60 group-hover:bg-arcane/20',
    icon: 'text-arcane-soft',
    glow: 'group-hover:shadow-glow-arcane',
    title: 'group-hover:text-arcane-soft',
  },
  mystic: {
    ring: 'hover:border-mystic/60 focus-visible:border-mystic/60',
    iconWrap:
      'border-mystic/30 bg-mystic/10 group-hover:border-mystic/60 group-hover:bg-mystic/20',
    icon: 'text-mystic-soft',
    glow: 'group-hover:shadow-[0_0_32px_-4px_rgba(167,139,250,0.5)]',
    title: 'group-hover:text-mystic-soft',
  },
};

/**
 * A large, glowing "portal" entry on the landing page — icon halo, title,
 * blurb, and a chevron that slides on hover. Built as a button for a11y.
 */
export function PortalCard({
  icon: Icon,
  title,
  description,
  accent = 'beam',
  onClick,
}: PortalCardProps) {
  const a = accentStyles[accent];
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 26 }}
      className={cn(
        'group relative flex w-full flex-col items-center gap-4 overflow-hidden rounded-2xl',
        'border border-line bg-surface/70 p-6 text-center backdrop-blur-xl',
        'shadow-panel transition-colors duration-300 tap-highlight-none focus-visible:outline-none',
        'sm:items-start sm:text-left',
        a.ring,
        a.glow,
      )}
    >
      {/* Sheen + faint top-edge highlight */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-panel-sheen opacity-60"
      />

      <span
        className={cn(
          'relative grid h-14 w-14 shrink-0 place-items-center rounded-xl border transition-all duration-300 [&_svg]:h-7 [&_svg]:w-7',
          a.iconWrap,
        )}
      >
        <Icon className={a.icon} />
      </span>

      <div className="relative min-w-0 flex-1">
        <h3
          className={cn(
            'font-display text-xl font-semibold tracking-wide text-ink transition-colors duration-300',
            a.title,
          )}
        >
          {title}
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
          {description}
        </p>
      </div>

      <span
        className={cn(
          'relative inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-ink-faint transition-colors duration-300',
          a.title,
        )}
      >
        Enter
        <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" />
      </span>
    </motion.button>
  );
}
