import { useMemo } from 'react';
import { motion } from 'framer-motion';
import type { Combatant, CombatState } from '@/types';
import { cn } from '@/lib/cn';
import { CombatantToken } from './CombatantToken';

export interface CombatBoardProps {
  combat: CombatState;
  /** Enable token selection (GM targeting / tools). */
  selectable?: boolean;
  selectedId?: string | null;
  onSelect?: (combatant: Combatant) => void;
  /** Force compact tokens (phones). */
  compact?: boolean;
  className?: string;
}

/** Group combatants by their battle line, sorted near→far. */
function byLine(combatants: Combatant[]): { line: number; members: Combatant[] }[] {
  const map = new Map<number, Combatant[]>();
  for (const c of combatants) {
    const arr = map.get(c.line) ?? [];
    arr.push(c);
    map.set(c.line, arr);
  }
  return [...map.entries()]
    .map(([line, members]) => ({ line, members }))
    .sort((a, b) => a.line - b.line);
}

/**
 * The battlefield: players on the left/near side, enemies on the right/far side,
 * each clustered by their abstract battle line. During resolution the acting
 * combatant glows. Lays out side-by-side on wide screens and stacks (players
 * above enemies) on phones.
 */
export function CombatBoard({
  combat,
  selectable = false,
  selectedId = null,
  onSelect,
  compact = false,
  className,
}: CombatBoardProps) {
  const players = useMemo(
    () => combat.combatants.filter((c) => c.team === 'player'),
    [combat.combatants],
  );
  const enemies = useMemo(
    () => combat.combatants.filter((c) => c.team === 'npc'),
    [combat.combatants],
  );

  const activeId =
    combat.phase === 'resolving' && combat.activeResolutionIndex >= 0
      ? combat.resolutionQueue[combat.activeResolutionIndex]?.sourceId
      : undefined;

  const renderSide = (members: Combatant[], side: 'player' | 'npc') => {
    const groups = byLine(members);
    return (
      <div
        className={cn(
          'flex flex-1 flex-col gap-3 rounded-2xl border p-3',
          side === 'player'
            ? 'border-arcane/20 bg-arcane/[0.03]'
            : 'border-danger/20 bg-danger/[0.03]',
        )}
      >
        <div className="flex items-center justify-between px-1">
          <span
            className={cn(
              'font-display text-xs font-semibold uppercase tracking-[0.18em]',
              side === 'player' ? 'text-arcane-soft' : 'text-hp',
            )}
          >
            {side === 'player' ? 'Your Party' : 'Foes'}
          </span>
          <span className="font-mono text-[0.625rem] text-ink-faint">
            {members.filter((m) => !m.isDead).length}/{members.length}
          </span>
        </div>

        {members.length === 0 ? (
          <div className="grid flex-1 place-items-center rounded-xl border border-dashed border-line py-8 text-xs text-ink-faint">
            None
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {groups.map((g) => (
              <div key={g.line} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2 px-1">
                  <span className="h-px flex-1 bg-line/60" />
                  <span className="font-mono text-[0.5625rem] uppercase tracking-wider text-ink-faint">
                    Line {g.line}
                  </span>
                  <span className="h-px flex-1 bg-line/60" />
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {g.members.map((c) => (
                    <CombatantToken
                      key={c.id}
                      combatant={c}
                      active={c.id === activeId}
                      selectable={selectable}
                      selected={selectedId === c.id}
                      onSelect={onSelect}
                      compact={compact}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <motion.div
      layout
      className={cn(
        'flex flex-col gap-3 lg:flex-row lg:items-stretch',
        className,
      )}
    >
      {renderSide(players, 'player')}

      {/* The clash divider */}
      <div className="relative flex items-center justify-center lg:flex-col">
        <span className="hidden h-full w-px bg-gradient-to-b from-transparent via-line-strong to-transparent lg:block" />
        <span className="absolute grid h-9 w-9 place-items-center rounded-full border border-line-strong bg-surface font-display text-sm font-bold text-beam shadow-glow-beam">
          VS
        </span>
        <span className="h-px w-full bg-gradient-to-r from-transparent via-line-strong to-transparent lg:hidden" />
      </div>

      {renderSide(enemies, 'npc')}
    </motion.div>
  );
}
