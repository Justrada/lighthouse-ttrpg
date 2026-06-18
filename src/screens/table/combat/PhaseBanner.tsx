import { motion } from 'framer-motion';
import { Hourglass, Swords, Flag } from 'lucide-react';
import type { CombatPhase } from '@/types';
import { Badge } from '@/components/ui';
import { cn } from '@/lib/cn';

export interface PhaseBannerProps {
  round: number;
  phase: CombatPhase;
  className?: string;
}

const phaseLabel: Record<CombatPhase, string> = {
  setup: 'Preparing',
  declare: 'Declare Actions',
  resolving: 'Resolving',
  between: 'Interlude',
  ended: 'Battle Over',
};

const phaseTone: Record<CombatPhase, 'beam' | 'arcane' | 'mystic' | 'neutral'> = {
  setup: 'neutral',
  declare: 'beam',
  resolving: 'arcane',
  between: 'mystic',
  ended: 'neutral',
};

/** A compact round + phase indicator with a soft pulse while resolving. */
export function PhaseBanner({ round, phase, className }: PhaseBannerProps) {
  const Icon = phase === 'resolving' ? Swords : phase === 'ended' ? Flag : Hourglass;
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <motion.span
        key={round}
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 22 }}
        className="grid h-9 min-w-9 place-items-center rounded-xl border border-beam/40 bg-beam/10 px-2 font-display text-sm font-bold text-beam-soft"
      >
        R{round}
      </motion.span>
      <Badge
        tone={phaseTone[phase]}
        variant="soft"
        icon={
          <motion.span
            animate={phase === 'resolving' ? { rotate: [0, -12, 12, 0] } : undefined}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
            className="inline-flex"
          >
            <Icon className="h-3.5 w-3.5" />
          </motion.span>
        }
      >
        {phaseLabel[phase]}
      </Badge>
    </div>
  );
}
