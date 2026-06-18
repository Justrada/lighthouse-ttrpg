import { Minus, Plus, Brain, Dumbbell, Flame } from 'lucide-react';
import { motion } from 'framer-motion';
import type { CoreStatKey, SkillKey } from '@/types';
import { SKILL_KEYS } from '@/types';
import { useDraftStore } from '@/store';
import { getStatCost } from '@/engine';
import { CORE_STAT_LABELS, SKILL_LABELS, SKILL_SOURCES } from '@/data/constants';
import { StatBadge, Divider } from '@/components/ui';
import { cn } from '@/lib/cn';

const STAT_MAX = 12;
const STAT_MIN = 1;

const STAT_META: Record<
  CoreStatKey,
  { icon: React.ReactNode; tone: 'arcane' | 'beam' | 'mystic'; blurb: string }
> = {
  mind: { icon: <Brain />, tone: 'arcane', blurb: 'Knowledge, focus, and arcane insight.' },
  body: { icon: <Dumbbell />, tone: 'beam', blurb: 'Might, vitality, and physical defense.' },
  soul: { icon: <Flame />, tone: 'mystic', blurb: 'Willpower, presence, and inner spirit.' },
};

const toneRing: Record<'arcane' | 'beam' | 'mystic', string> = {
  arcane: 'border-arcane/40 bg-arcane/5',
  beam: 'border-beam/40 bg-beam/5',
  mystic: 'border-mystic/40 bg-mystic/5',
};

const toneText: Record<'arcane' | 'beam' | 'mystic', string> = {
  arcane: 'text-arcane-soft',
  beam: 'text-beam-soft',
  mystic: 'text-mystic-soft',
};

/** Which skills a core stat feeds (parsed from SKILL_SOURCES). */
function skillsFedBy(stat: CoreStatKey): SkillKey[] {
  const label = CORE_STAT_LABELS[stat];
  return SKILL_KEYS.filter((k) => SKILL_SOURCES[k].includes(label));
}

export function StatsSection() {
  const draft = useDraftStore((s) => s.draft);
  const derived = useDraftStore((s) => s.derived);
  const budget = useDraftStore((s) => s.budget);
  const changeStat = useDraftStore((s) => s.changeStat);

  if (!draft || !derived) return null;

  return (
    <div className="space-y-6">
      <div className="grid gap-3">
        {(Object.keys(STAT_META) as CoreStatKey[]).map((stat) => {
          const value = draft.coreStats[stat];
          const nextCost = getStatCost(value);
          const canAfford = budget.available >= nextCost;
          const atMax = value >= STAT_MAX;
          const atMin = value <= STAT_MIN;
          const meta = STAT_META[stat];

          return (
            <div
              key={stat}
              className={cn(
                'rounded-2xl border bg-void/40 p-4',
                toneRing[meta.tone],
              )}
            >
              <div className="flex items-center gap-4">
                {/* Icon + name */}
                <span
                  className={cn(
                    'grid h-11 w-11 shrink-0 place-items-center rounded-xl border [&_svg]:h-5 [&_svg]:w-5',
                    toneRing[meta.tone],
                    toneText[meta.tone],
                  )}
                >
                  {meta.icon}
                </span>

                <div className="min-w-0 flex-1">
                  <h4 className="font-display text-base text-ink">
                    {CORE_STAT_LABELS[stat]}
                  </h4>
                  <p className="truncate text-xs text-ink-muted">{meta.blurb}</p>
                </div>

                {/* Value + stepper */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={`Decrease ${CORE_STAT_LABELS[stat]}`}
                    disabled={atMin}
                    onClick={() => changeStat(stat, -1)}
                    className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-void/60 text-ink-muted transition-colors hover:text-beam disabled:cursor-not-allowed disabled:opacity-30 [&_svg]:h-4 [&_svg]:w-4"
                  >
                    <Minus />
                  </button>

                  <motion.span
                    key={value}
                    initial={{ scale: 1.3, opacity: 0.5 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 22 }}
                    className={cn(
                      'w-9 text-center font-mono text-2xl font-bold tabular-nums',
                      toneText[meta.tone],
                    )}
                  >
                    {value}
                  </motion.span>

                  <button
                    type="button"
                    aria-label={`Increase ${CORE_STAT_LABELS[stat]}`}
                    disabled={atMax || !canAfford}
                    onClick={() => changeStat(stat, +1)}
                    className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-void/60 text-ink-muted transition-colors hover:text-beam disabled:cursor-not-allowed disabled:opacity-30 [&_svg]:h-4 [&_svg]:w-4"
                  >
                    <Plus />
                  </button>
                </div>
              </div>

              {/* Cost + feeds */}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
                <span className="text-ink-muted">
                  Next point:{' '}
                  <span
                    className={cn(
                      'font-mono font-semibold',
                      atMax
                        ? 'text-ink-faint'
                        : canAfford
                          ? 'text-beam-soft'
                          : 'text-hp',
                    )}
                  >
                    {atMax ? 'maxed' : `${nextCost} pt${nextCost === 1 ? '' : 's'}`}
                  </span>
                </span>
                <span className="text-ink-faint">
                  {budget.available} available
                </span>
                <span className="text-ink-muted">
                  Feeds:{' '}
                  <span className={toneText[meta.tone]}>
                    {skillsFedBy(stat).map((k) => SKILL_LABELS[k]).join(', ')}
                  </span>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <Divider label="Resulting Stats" />

      {/* Live derived stats */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        <StatBadge stacked label="HP" value={derived.hp} tone="beam" />
        <StatBadge stacked label="MP" value={derived.mp} tone="arcane" />
        <StatBadge stacked label="SP" value={derived.sp} tone="mystic" />
        <StatBadge stacked label="Armor" value={derived.ac} />
        <StatBadge stacked label="Actions" value={derived.actionsPerRound} />
        {SKILL_KEYS.map((k) => (
          <StatBadge
            key={k}
            stacked
            size="sm"
            label={SKILL_LABELS[k]}
            value={derived[k] >= 0 ? `+${derived[k]}` : `${derived[k]}`}
          />
        ))}
      </div>
    </div>
  );
}
