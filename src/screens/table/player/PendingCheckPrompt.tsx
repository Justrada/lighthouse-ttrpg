import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Dices, ChevronsUp, ChevronsDown, Check, X } from 'lucide-react';
import type { AdvantageMode, Character, DiceRollResult, SkillKey } from '@/types';
import { SKILL_KEYS } from '@/types';
import { Panel, Button, Badge, SegmentedControl, DiceResult } from '@/components/ui';
import { SKILL_LABELS } from '@/data/constants';
import { useDerived, respondToCheck, type PendingCheck } from '@/store';
import { cn } from '@/lib/cn';

export interface PendingCheckPromptProps {
  check: PendingCheck;
  character: Character | null;
  className?: string;
}

/** Reverse a skill label ("Awareness") back to its DerivedStats key. */
function skillKeyFromLabel(label: string): SkillKey | null {
  const lower = label.toLowerCase();
  const match = SKILL_KEYS.find((k) => SKILL_LABELS[k].toLowerCase() === lower || k === lower);
  return match ?? null;
}

/**
 * A prominent prompt shown to a player when the GM requests a skill check. The
 * relevant modifier is read from the character's derived stats; the player can
 * roll with advantage/disadvantage and sees the animated result with pass/fail.
 */
export function PendingCheckPrompt({ check, character, className }: PendingCheckPromptProps) {
  const derived = useDerived(character);
  const [mode, setMode] = useState<AdvantageMode>('normal');
  const [result, setResult] = useState<(DiceRollResult & { success?: boolean }) | null>(null);

  const skillKey = skillKeyFromLabel(check.skill);
  const modifier = skillKey && derived ? derived[skillKey] : 0;
  const modLabel = modifier >= 0 ? `+${modifier}` : `${modifier}`;

  const roll = () => {
    const res = respondToCheck(check, modifier, mode);
    setResult(res);
  };

  return (
    <Panel
      ring
      padded
      className={cn('relative overflow-hidden border-beam/40', className)}
    >
      {/* Beam wash */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-beam/20 blur-3xl"
        animate={{ opacity: [0.5, 0.9, 0.5] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      />

      <div className="relative flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-beam/40 bg-beam/10 text-beam-soft">
            <Dices className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-[0.18em] text-ink-faint">
              The GM calls for a
            </p>
            <h3 className="font-display text-xl text-glow-beam">{check.skill} Check</h3>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge tone="beam" variant="soft">
              Mod {modLabel}
            </Badge>
            {check.dc != null && (
              <Badge tone="arcane" variant="outline" size="sm">
                DC {check.dc}
              </Badge>
            )}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {!result ? (
            <motion.div
              key="roll"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col gap-3 sm:flex-row sm:items-center"
            >
              <SegmentedControl
                size="sm"
                value={mode}
                onChange={setMode}
                aria-label="Roll mode"
                options={[
                  { value: 'disadvantage', label: 'Dis', icon: <ChevronsDown /> },
                  { value: 'normal', label: 'Normal' },
                  { value: 'advantage', label: 'Adv', icon: <ChevronsUp /> },
                ]}
              />
              <Button
                variant="primary"
                size="md"
                fullWidth
                leftIcon={<Dices className="h-4 w-4" />}
                onClick={roll}
                className="sm:ml-auto sm:w-auto"
              >
                Roll d20 {modLabel}
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center gap-3"
            >
              <DiceResult result={result} dieSize={48} />
              {result.success != null && (
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 360, damping: 20 }}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full border px-4 py-1.5 font-display text-sm font-bold uppercase tracking-widest',
                    result.success
                      ? 'border-success/50 bg-success/10 text-success'
                      : 'border-danger/50 bg-danger/10 text-hp',
                  )}
                >
                  {result.success ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                  {result.success ? 'Success' : 'Failure'}
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Panel>
  );
}
