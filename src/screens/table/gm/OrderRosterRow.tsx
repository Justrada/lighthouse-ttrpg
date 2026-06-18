import { motion } from 'framer-motion';
import { Repeat } from 'lucide-react';
import type { Combatant } from '@/types';
import { Badge, Tooltip } from '@/components/ui';
import { useCombatStore } from '@/store';
import { ChessPiece } from '../combat';
import { cn } from '@/lib/cn';

export interface OrderRosterRowProps {
  combatant: Combatant;
  /** True when this unit is the one the GM is currently ordering. */
  active: boolean;
  /** Select this unit as the active actor to order on the board. */
  onSelect: (id: string) => void;
}

/**
 * A compact selector row for one GM-controlled unit (enemy OR allied beast): the
 * unit's chess silhouette, name, team badge, HP, and a ready/locked badge.
 * Clicking the row makes it the active actor the GM is ordering (the declaration
 * UI itself lives in {@link StagedActions} on the board). A side "swap" control
 * flips the unit's allegiance via `setCombatantTeam` so the GM can recruit a
 * beast onto the party's side mid-fight (or turn an ally hostile).
 *
 * Replaces the old per-NPC ActionPicker grid — the board + this roster +
 * StagedActions now cover ordering.
 */
export function OrderRosterRow({ combatant, active, onSelect }: OrderRosterRowProps) {
  const locked = useCombatStore((s) => Boolean(s.combat.lockedActions[combatant.id]));
  const setCombatantTeam = useCombatStore((s) => s.setCombatantTeam);

  if (combatant.isDead) return null;

  const isAlly = combatant.team === 'player';
  const swapTo = isAlly ? 'npc' : 'player';
  const swapLabel = isAlly ? 'Make Enemy' : 'Make Ally';

  return (
    <div
      className={cn(
        'group/row flex w-full items-center gap-2 rounded-2xl border bg-surface/60 p-2 pr-1.5 transition-colors',
        active
          ? 'border-beam/60 ring-1 ring-beam/40'
          : locked
            ? 'border-success/40 hover:border-success/60'
            : 'border-line hover:border-line-strong',
      )}
    >
      <motion.button
        layout
        type="button"
        onClick={() => onSelect(combatant.id)}
        aria-pressed={active}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left tap-highlight-none focus-visible:outline-none"
      >
        <span
          className={cn(
            'grid h-11 w-11 shrink-0 place-items-center rounded-xl border',
            isAlly
              ? 'border-arcane/30 bg-arcane/10'
              : 'border-danger/30 bg-danger/[0.07]',
            combatant.isUnconscious && 'opacity-60',
          )}
        >
          <ChessPiece combatant={combatant} height={34} muted={combatant.isUnconscious} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-sm font-semibold text-ink">{combatant.name}</p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <Badge tone={isAlly ? 'arcane' : 'danger'} size="sm" variant="soft">
              {isAlly ? 'Ally' : 'Enemy'}
            </Badge>
            <span className="font-mono text-[0.625rem] text-ink-faint">
              {combatant.currentHP}/{combatant.maxHP} HP
            </span>
          </div>
        </div>
        {combatant.isUnconscious ? (
          <Badge tone="warn" size="sm" variant="soft">Down</Badge>
        ) : locked ? (
          <Badge tone="success" size="sm" variant="soft">Ready</Badge>
        ) : (
          <Badge tone="neutral" size="sm" variant="soft">Pending</Badge>
        )}
      </motion.button>

      <Tooltip content={swapLabel} side="left">
        <button
          type="button"
          onClick={() => setCombatantTeam(combatant.id, swapTo)}
          aria-label={swapLabel}
          className={cn(
            'grid h-8 w-8 shrink-0 place-items-center rounded-lg border text-ink-faint transition-colors tap-highlight-none focus-visible:outline-none',
            'border-line hover:border-beam/50 hover:bg-beam/10 hover:text-beam-soft',
          )}
        >
          <Repeat className="h-3.5 w-3.5" />
        </button>
      </Tooltip>
    </div>
  );
}
