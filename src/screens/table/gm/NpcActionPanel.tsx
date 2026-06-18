import { motion } from 'framer-motion';
import type { Combatant } from '@/types';
import { Avatar, Badge } from '@/components/ui';
import { useCombatStore } from '@/store';
import { cn } from '@/lib/cn';
import { ActionPicker } from '../combat';
import { useCombatantCharacter } from '../shared/useCombatantCharacter';

export interface NpcActionPanelProps {
  combatant: Combatant;
  combatants: Combatant[];
}

/** A single NPC's declaration card for the GM, with the resolved character. */
export function NpcActionPanel({ combatant, combatants }: NpcActionPanelProps) {
  const character = useCombatantCharacter(combatant);
  const locked = useCombatStore((s) => Boolean(s.combat.lockedActions[combatant.id]));

  if (combatant.isDead) return null;

  return (
    <motion.div
      layout
      className={cn(
        'rounded-2xl border bg-surface/60 p-3 transition-colors',
        locked ? 'border-success/40' : 'border-line',
      )}
    >
      <div className="mb-2.5 flex items-center gap-2.5">
        <Avatar
          seed={combatant.characterId ?? combatant.id}
          name={combatant.name}
          size={36}
          ring="none"
          status={combatant.isUnconscious ? 'away' : null}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-sm font-semibold text-ink">{combatant.name}</p>
          <p className="font-mono text-[0.625rem] text-ink-faint">
            Line {combatant.line} · {combatant.currentHP}/{combatant.maxHP} HP
          </p>
        </div>
        {locked && <Badge tone="success" size="sm" variant="soft">Ready</Badge>}
      </div>
      <ActionPicker combatant={combatant} character={character} combatants={combatants} />
    </motion.div>
  );
}
