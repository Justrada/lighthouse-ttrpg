import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ScrollText } from 'lucide-react';
import type { CombatLogEntry } from '@/types';
import { cn } from '@/lib/cn';

export interface CombatLogProps {
  log: CombatLogEntry[];
  /** Constrain height; the list scrolls within. */
  className?: string;
  /** Compact paddings for sidebars. */
  dense?: boolean;
}

const toneText: Record<NonNullable<CombatLogEntry['tone']> | 'default', string> = {
  beam: 'text-beam-soft',
  arcane: 'text-arcane-soft',
  danger: 'text-hp',
  success: 'text-sp',
  muted: 'text-ink-faint',
  default: 'text-ink-muted',
};

const toneRail: Record<NonNullable<CombatLogEntry['tone']> | 'default', string> = {
  beam: 'bg-beam',
  arcane: 'bg-arcane',
  danger: 'bg-hp',
  success: 'bg-sp',
  muted: 'bg-line-strong',
  default: 'bg-line-strong',
};

/** A scrollable, tone-colored record of combat events. Auto-scrolls to newest. */
export function CombatLog({ log, className, dense = false }: CombatLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the bottom as new entries arrive.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [log.length]);

  return (
    <div
      ref={scrollRef}
      role="log"
      aria-live="polite"
      aria-label="Combat log"
      className={cn(
        'min-h-0 overflow-y-auto rounded-xl border border-line bg-void/50',
        dense ? 'p-2' : 'p-3',
        className,
      )}
    >
      {log.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center text-ink-faint">
          <ScrollText className="h-6 w-6" />
          <span className="text-xs">The tale has yet to be written.</span>
        </div>
      ) : (
        <ul className="space-y-1">
          <AnimatePresence initial={false}>
            {log.map((entry) => {
              const tone = entry.tone ?? 'default';
              return (
                <motion.li
                  key={entry.id}
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  className="flex items-stretch gap-2"
                >
                  <span className={cn('w-0.5 shrink-0 rounded-full', toneRail[tone])} />
                  <span
                    className={cn(
                      'flex-1 py-0.5 text-sm leading-snug',
                      toneText[tone],
                    )}
                  >
                    <span className="mr-1.5 font-mono text-[0.625rem] text-ink-faint">
                      R{entry.round}
                    </span>
                    {entry.text}
                  </span>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
