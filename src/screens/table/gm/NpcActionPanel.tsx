import { motion } from 'framer-motion';
import type { Combatant } from '@/types';
import { Avatar, Badge } from '@/components/ui';
import { useCombatStore } from '@/store';
import { cn } from '@/lib/cn';

export interface NpcActionPanelProps {
  combatant: Combatant;
  /** True when this NPC is the one the GM is currently ordering. */
  active: boolean;
  /** Select this NPC as the active actor to order on the board. */
  onSelect: (id: string) => void;
}

/**
 * A compact selector chip for one NPC: avatar, name, HP, and a ready/locked
 * badge. Clicking it makes the NPC the active actor the GM is ordering (the
 * declaration UI itself lives in {@link StagedActions} on the board). Rendered
 * as a list so the GM can see every foe's lock status at a glance.
 */
export function NpcActionPanel({ combatant, active, onSelect }: NpcActionPanelProps) {
  const locked = useCombatStore((s) => Boolean(s.combat.lockedActions[combatant.id]));

  if (combatant.isDead) return null;

  return (
    <motion.button
      layout
      type="button"
      onClick={() => onSelect(combatant.id)}
      aria-pressed={active}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-2xl border bg-surface/60 p-2.5 text-left transition-colors',
        active
          ? 'border-beam/60 ring-1 ring-beam/40'
          : locked
            ? 'border-success/40 hover:border-success/60'
            : 'border-line hover:border-line-strong',
      )}
    >
      <Avatar
        seed={combatant.characterId ?? combatant.id}
        name={combatant.name}
        size={36}
        ring={active ? 'beam' : 'none'}
        status={combatant.isUnconscious ? 'away' : null}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-sm font-semibold text-ink">{combatant.name}</p>
        <p className="font-mono text-[0.625rem] text-ink-faint">
          {combatant.currentHP}/{combatant.maxHP} HP
        </p>
      </div>
      {combatant.isUnconscious ? (
        <Badge tone="warn" size="sm" variant="soft">Down</Badge>
      ) : locked ? (
        <Badge tone="success" size="sm" variant="soft">Ready</Badge>
      ) : (
        <Badge tone="neutral" size="sm" variant="soft">Pending</Badge>
      )}
    </motion.button>
  );
}
