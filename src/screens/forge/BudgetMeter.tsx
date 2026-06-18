import { Gem, Swords, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import type { SkillPointBudget } from '@/types';
import { ProgressRing } from '@/components/ui';
import { cn } from '@/lib/cn';

export interface BudgetMeterProps {
  budget: SkillPointBudget;
  className?: string;
}

/**
 * The skill-point budget showpiece — a glowing ring of remaining points plus a
 * breakdown of what's been spent on stats vs. skills. Turns red when overspent.
 */
export function BudgetMeter({ budget, className }: BudgetMeterProps) {
  const { total, spentOnStats, spentOnSkills, available } = budget;
  const spent = spentOnStats + spentOnSkills;
  const overspent = available < 0;
  const fraction = total > 0 ? Math.max(0, available) / total : 0;

  return (
    <div
      className={cn(
        'lh-panel-raised flex items-center gap-4 p-4',
        overspent && 'border-danger/50',
        className,
      )}
    >
      <ProgressRing
        value={fraction}
        size={76}
        thickness={7}
        tone={overspent ? 'hp' : available === 0 ? 'arcane' : 'beam'}
        aria-label={`${available} of ${total} skill points available`}
      >
        <motion.span
          key={available}
          initial={{ scale: 1.25, opacity: 0.4 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 22 }}
          className={cn(
            'font-mono text-2xl font-bold leading-none tabular-nums',
            overspent ? 'text-hp' : 'text-beam-soft',
          )}
        >
          {available}
        </motion.span>
      </ProgressRing>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <h3 className="font-display text-sm uppercase tracking-wider text-ink">
            Skill Points
          </h3>
          <span className="font-mono text-xs text-ink-faint">
            {Math.max(0, available)} / {total}
          </span>
        </div>

        <div className="mt-2 space-y-1.5">
          <BreakdownRow
            icon={<Gem className="h-3.5 w-3.5" />}
            label="On stats"
            value={spentOnStats}
            tone="text-arcane-soft"
          />
          <BreakdownRow
            icon={<Swords className="h-3.5 w-3.5" />}
            label="On skills"
            value={spentOnSkills}
            tone="text-mystic-soft"
          />
        </div>

        {/* Spent / total bar */}
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-void">
          <div className="flex h-full w-full">
            <motion.div
              className="h-full bg-arcane"
              initial={false}
              animate={{ width: total > 0 ? `${(spentOnStats / total) * 100}%` : '0%' }}
              transition={{ type: 'spring', stiffness: 200, damping: 28 }}
            />
            <motion.div
              className="h-full bg-mystic"
              initial={false}
              animate={{ width: total > 0 ? `${(spentOnSkills / total) * 100}%` : '0%' }}
              transition={{ type: 'spring', stiffness: 200, damping: 28 }}
            />
          </div>
        </div>

        {overspent ? (
          <p className="mt-2 flex items-center gap-1 text-xs text-hp">
            Overspent by {Math.abs(available)} — remove a skill or lower a stat.
          </p>
        ) : (
          <p className="mt-2 flex items-center gap-1 text-xs text-ink-faint">
            <Sparkles className="h-3 w-3" />
            {spent} spent of {total} earned
          </p>
        )}
      </div>
    </div>
  );
}

function BreakdownRow({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="flex items-center gap-1.5 text-ink-muted">
        <span className={tone}>{icon}</span>
        {label}
      </span>
      <span className={cn('font-mono font-semibold tabular-nums', tone)}>{value}</span>
    </div>
  );
}
