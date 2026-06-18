import { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Lock, LockOpen, Sparkles, Swords, FlaskConical, Footprints, Shield, ChevronRight, X } from 'lucide-react';
import type { Character, Combatant, DeclaredAction } from '@/types';
import { Button, Select, Badge, Tooltip } from '@/components/ui';
import { useCombatStore } from '@/store';
import { BATTLE_LINES } from '@/data/constants';
import { cn } from '@/lib/cn';
import { buildActionOptions, actionSlotCount, type ActionOption } from '../shared/actionOptions';

export interface ActionPickerProps {
  combatant: Combatant;
  /** Source character — determines slot count and available options. */
  character?: Character;
  /** All combatants, for target selection. */
  combatants: Combatant[];
  /** Disable editing (e.g. once locked or out of declare phase). */
  className?: string;
}

const typeIcon: Record<string, JSX.Element> = {
  Move: <Footprints className="h-3.5 w-3.5" />,
  Guard: <Shield className="h-3.5 w-3.5" />,
  'Use Ability': <Sparkles className="h-3.5 w-3.5" />,
  'Weapon Attack': <Swords className="h-3.5 w-3.5" />,
  'Use Item': <FlaskConical className="h-3.5 w-3.5" />,
  Flee: <ChevronRight className="h-3.5 w-3.5" />,
  Pass: <X className="h-3.5 w-3.5" />,
};

/**
 * Declare a combatant's actions for the round. One row per action slot (count
 * from the character's derived `actionsPerRound`, default 3). Each row picks an
 * option (Move / Guard / ability / weapon / item / Flee / Pass) and, where
 * relevant, a target combatant or destination line. Selections are written to
 * the combat store immediately; Lock In freezes them for resolution.
 */
export function ActionPicker({ combatant, character, combatants, className }: ActionPickerProps) {
  const declaredActions = useCombatStore((s) => s.combat.declaredActions[combatant.id] ?? []);
  const locked = useCombatStore((s) => Boolean(s.combat.lockedActions[combatant.id]));
  const declareAction = useCombatStore((s) => s.declareAction);
  const clearAction = useCombatStore((s) => s.clearAction);
  const lockActions = useCombatStore((s) => s.lockActions);

  const slotCount = useMemo(() => actionSlotCount(character), [character]);
  const options = useMemo(() => buildActionOptions(character), [character]);
  const optionByKey = useMemo(() => new Map(options.map((o) => [o.key, o])), [options]);

  // Map slot index → currently declared action.
  const bySlot = useMemo(() => {
    const m = new Map<number, DeclaredAction>();
    for (const a of declaredActions) m.set(a.actionIndex, a);
    return m;
  }, [declaredActions]);

  /** Re-derive which ActionOption a declared action represents, for the select value. */
  const optionKeyFor = (action: DeclaredAction | undefined): string | null => {
    if (!action) return null;
    if (action.actionId) {
      const prefix =
        action.actionType === 'Use Ability'
          ? 'ability'
          : action.actionType === 'Weapon Attack'
            ? 'weapon'
            : 'item';
      return `${prefix}:${action.actionId}`;
    }
    return action.actionType.toLowerCase();
  };

  const targetableFor = (opt: ActionOption): Combatant[] => {
    const alive = combatants.filter((c) => !c.isDead);
    if (opt.supportive) return alive.filter((c) => c.team === combatant.team);
    return alive.filter((c) => c.team !== combatant.team && !c.isUnconscious);
  };

  const declaredCount = bySlot.size;
  const allSlotsFilled = declaredCount >= slotCount;

  const handlePick = (slot: number, key: string) => {
    const opt = optionByKey.get(key);
    if (!opt) return;
    const action: DeclaredAction = {
      actionIndex: slot,
      actionType: opt.actionType,
      actionId: opt.actionId,
      label: opt.label,
    };
    // Pre-fill a sensible default target / line so the action is valid immediately.
    if (opt.needsLine) {
      action.targetLine = combatant.line + (combatant.team === 'player' ? 1 : -1);
    } else if (opt.needsTarget) {
      const candidates = targetableFor(opt);
      action.targetId = candidates[0]?.id ?? null;
    }
    declareAction(combatant.id, action);
  };

  const handleTarget = (slot: number, opt: ActionOption, targetId: string) => {
    const existing = bySlot.get(slot);
    if (!existing) return;
    declareAction(combatant.id, { ...existing, targetId });
  };

  const handleLine = (slot: number, line: number) => {
    const existing = bySlot.get(slot);
    if (!existing) return;
    declareAction(combatant.id, { ...existing, targetLine: line });
  };

  const lineOptions = useMemo(
    () =>
      Array.from({ length: BATTLE_LINES.count }, (_, i) => ({
        value: String(i + 1),
        label:
          i + 1 === combatant.line
            ? `Line ${i + 1} (here)`
            : `Line ${i + 1}`,
      })),
    [combatant.line],
  );

  return (
    <div className={cn('flex flex-col gap-2.5', className)}>
      <div className="flex items-center justify-between">
        <span className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-ink-faint">
          Actions
        </span>
        <Badge tone={allSlotsFilled ? 'success' : 'neutral'} size="sm" variant="soft">
          {declaredCount}/{slotCount} declared
        </Badge>
      </div>

      <div className="flex flex-col gap-2">
        {Array.from({ length: slotCount }).map((_, slot) => {
          const action = bySlot.get(slot);
          const selectedKey = optionKeyFor(action);
          const opt = selectedKey ? optionByKey.get(selectedKey) : undefined;
          const targets = opt ? targetableFor(opt) : [];

          return (
            <motion.div
              key={slot}
              layout
              className={cn(
                'rounded-xl border bg-void/40 p-2.5 transition-colors',
                locked ? 'border-line/60 opacity-80' : 'border-line',
                action && !locked && 'border-beam/30',
              )}
            >
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-surface-overlay font-mono text-xs text-ink-muted">
                  {slot + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <Select
                    aria-label={`Action ${slot + 1}`}
                    value={selectedKey}
                    onChange={(key) => handlePick(slot, key)}
                    disabled={locked}
                    size="sm"
                    placeholder="Choose an action…"
                    options={options.map((o) => ({
                      value: o.key,
                      label: o.cost ? `${o.label} · ${o.cost}` : o.label,
                      icon: typeIcon[o.actionType],
                    }))}
                  />
                </div>
                {action && !locked && (
                  <Tooltip content="Clear">
                    <button
                      type="button"
                      aria-label={`Clear action ${slot + 1}`}
                      onClick={() => clearAction(combatant.id, slot)}
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-ink-faint transition-colors hover:bg-surface-raised hover:text-hp focus-visible:outline-none"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </Tooltip>
                )}
              </div>

              {/* Secondary row: target / line / meta */}
              <AnimatePresence initial={false}>
                {opt && (opt.needsTarget || opt.needsLine || opt.range) && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.18 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-2 flex flex-wrap items-center gap-2 pl-8">
                      {opt.needsLine && (
                        <Select
                          aria-label={`Destination line for action ${slot + 1}`}
                          value={String(action?.targetLine ?? combatant.line)}
                          onChange={(v) => handleLine(slot, Number(v))}
                          disabled={locked}
                          size="sm"
                          className="min-w-[9rem]"
                          options={lineOptions}
                        />
                      )}
                      {opt.needsTarget && (
                        <Select
                          aria-label={`Target for action ${slot + 1}`}
                          value={action?.targetId ?? null}
                          onChange={(v) => handleTarget(slot, opt, v)}
                          disabled={locked || targets.length === 0}
                          size="sm"
                          className="min-w-[10rem]"
                          placeholder={targets.length ? 'Pick a target…' : 'No valid targets'}
                          options={targets.map((t) => ({
                            value: t.id,
                            label: t.name,
                          }))}
                        />
                      )}
                      {opt.range && (
                        <Badge tone="arcane" size="sm" variant="outline">
                          {opt.range}
                          {opt.aoe && opt.aoe !== 'Single Target' ? ` · ${opt.aoe}` : ''}
                        </Badge>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      {/* Lock control */}
      <Button
        variant={locked ? 'secondary' : 'primary'}
        size="sm"
        fullWidth
        leftIcon={locked ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
        onClick={() => lockActions(combatant.id, !locked)}
      >
        {locked ? 'Unlock Actions' : 'Lock In'}
      </Button>
    </div>
  );
}
