import { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Lock,
  LockOpen,
  Sparkles,
  Swords,
  FlaskConical,
  Footprints,
  Shield,
  ChevronRight,
  Replace,
  RotateCw,
  X,
} from 'lucide-react';
import type { ActionType, Combatant, DeclaredAction } from '@/types';
import { Badge, Button } from '@/components/ui';
import { useCombatStore } from '@/store';
import { cn } from '@/lib/cn';
import { useCombatantCharacter } from '../shared/useCombatantCharacter';
import { actionSlotCount } from '../shared/actionOptions';

export interface StagedActionsProps {
  /** Combatant whose staged orders these are. */
  actorId: string;
  className?: string;
}

const typeIcon: Record<ActionType, JSX.Element> = {
  Move: <Footprints className="h-3.5 w-3.5" />,
  Guard: <Shield className="h-3.5 w-3.5" />,
  'Use Ability': <Sparkles className="h-3.5 w-3.5" />,
  'Weapon Attack': <Swords className="h-3.5 w-3.5" />,
  Reload: <RotateCw className="h-3.5 w-3.5" />,
  'Use Item': <FlaskConical className="h-3.5 w-3.5" />,
  'Change Equipment': <Replace className="h-3.5 w-3.5" />,
  Flee: <ChevronRight className="h-3.5 w-3.5" />,
  Pass: <X className="h-3.5 w-3.5" />,
};

/** Human-readable target/destination for a staged action. */
function actionDetail(
  action: DeclaredAction,
  combatantsById: Map<string, Combatant>,
): string | null {
  if (action.targetHex) return `→ ${action.targetHex.q}, ${action.targetHex.r}`;
  if (action.targetId) {
    const t = combatantsById.get(action.targetId);
    return t ? `→ ${t.name}` : null;
  }
  return null;
}

/**
 * Read-only-ish summary of a combatant's staged orders for the round, built to
 * sit beside the {@link HexBoard} (where the actions are actually *picked* by
 * clicking the board). Shows one row per action slot — filled rows carry the
 * action's icon, label, and target; each is removable. A Lock In / Unlock
 * toggle freezes the orders for resolution. The console owns Resolve / End.
 */
export function StagedActions({ actorId, className }: StagedActionsProps) {
  const combatants = useCombatStore((s) => s.combat.combatants);
  const declared = useCombatStore((s) => s.combat.declaredActions[actorId] ?? EMPTY);
  const locked = useCombatStore((s) => Boolean(s.combat.lockedActions[actorId]));
  const clearAction = useCombatStore((s) => s.clearAction);
  const lockActions = useCombatStore((s) => s.lockActions);

  const actor = useMemo(
    () => combatants.find((c) => c.id === actorId),
    [combatants, actorId],
  );
  const character = useCombatantCharacter(actor);
  const slotCount = useMemo(() => actionSlotCount(character, actor), [character, actor]);

  const combatantsById = useMemo(
    () => new Map(combatants.map((c) => [c.id, c])),
    [combatants],
  );

  // Map slot index → declared action.
  const bySlot = useMemo(() => {
    const m = new Map<number, DeclaredAction>();
    for (const a of declared) m.set(a.actionIndex, a);
    return m;
  }, [declared]);

  const declaredCount = bySlot.size;
  const allFilled = declaredCount >= slotCount;

  return (
    <div className={cn('flex flex-col gap-2.5', className)}>
      <div className="flex items-center justify-between">
        <span className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-ink-faint">
          Staged Orders
        </span>
        <Badge tone={allFilled ? 'success' : 'neutral'} size="sm" variant="soft">
          {declaredCount}/{slotCount} staged
        </Badge>
      </div>

      <div className="flex flex-col gap-2">
        {Array.from({ length: slotCount }).map((_, slot) => {
          const action = bySlot.get(slot);
          const detail = action ? actionDetail(action, combatantsById) : null;

          return (
            <motion.div
              key={slot}
              layout
              className={cn(
                'flex items-center gap-2 rounded-xl border p-2.5 transition-colors',
                action
                  ? locked
                    ? 'border-line/60 bg-void/30 opacity-90'
                    : 'border-beam/30 bg-void/40'
                  : 'border-dashed border-line bg-void/20',
              )}
            >
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-surface-overlay font-mono text-xs text-ink-muted">
                {slot + 1}
              </span>

              {action ? (
                <>
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-beam/10 text-beam-soft">
                    {typeIcon[action.actionType] ?? <Sparkles className="h-3.5 w-3.5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">
                      {action.label ?? action.actionType}
                    </span>
                    {detail && (
                      <span className="block truncate font-mono text-[0.625rem] text-ink-faint">
                        {detail}
                      </span>
                    )}
                  </span>
                  {!locked && (
                    <button
                      type="button"
                      aria-label={`Remove action ${slot + 1}`}
                      onClick={() => clearAction(actorId, slot)}
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-ink-faint transition-colors hover:bg-surface-raised hover:text-hp focus-visible:outline-none"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </>
              ) : (
                <span className="flex-1 text-sm text-ink-faint">Empty — pick on the board</span>
              )}
            </motion.div>
          );
        })}
      </div>

      <AnimatePresence initial={false}>
        {locked && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden text-center text-[0.625rem] text-beam-soft"
          >
            Orders locked — waiting on the rest of the field.
          </motion.p>
        )}
      </AnimatePresence>

      <Button
        variant={locked ? 'secondary' : 'primary'}
        size="sm"
        fullWidth
        disabled={!actor}
        leftIcon={locked ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
        onClick={() => lockActions(actorId, !locked)}
      >
        {locked ? 'Unlock Actions' : 'Lock In'}
      </Button>
    </div>
  );
}

const EMPTY: DeclaredAction[] = [];
