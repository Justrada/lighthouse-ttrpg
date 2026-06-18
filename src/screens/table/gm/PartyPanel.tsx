import { Users, Wifi, WifiOff } from 'lucide-react';
import type { ConnectionStatus, PartyMember } from '@/types';
import { Panel, PanelHeader, Avatar, Badge, ResourceBar, EmptyState } from '@/components/ui';
import { useCombatStore } from '@/store';
import { calculateDerivedStats } from '@/engine';
import { cn } from '@/lib/cn';

export interface PartyPanelProps {
  party: PartyMember[];
  className?: string;
}

const statusTone: Record<ConnectionStatus, 'success' | 'warn' | 'danger' | 'neutral'> = {
  idle: 'neutral',
  connecting: 'warn',
  connected: 'success',
  reconnecting: 'warn',
  disconnected: 'danger',
  error: 'danger',
};

/** GM-side roster of connected players with live combat resources when active. */
export function PartyPanel({ party, className }: PartyPanelProps) {
  const combatants = useCombatStore((s) => s.combat.combatants);
  const isActive = useCombatStore((s) => s.combat.isActive);

  return (
    <Panel className={cn('flex flex-col', className)}>
      <PanelHeader
        title="The Party"
        subtitle={`${party.length} ${party.length === 1 ? 'adventurer' : 'adventurers'} at the table`}
        leading={
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-arcane/30 bg-arcane/10 text-arcane-soft">
            <Users className="h-4 w-4" />
          </span>
        }
      />
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {party.length === 0 ? (
          <EmptyState
            size="sm"
            icon={<Users />}
            title="No players yet"
            hint="Share the room code. Heroes will appear here as they join."
          />
        ) : (
          party.map((m) => {
            const derived = calculateDerivedStats(m.character);
            const combatant = isActive
              ? combatants.find(
                  (c) => c.peerId === m.peerId || c.characterId === m.character.id,
                )
              : undefined;
            const hp = combatant
              ? { cur: combatant.currentHP, max: combatant.maxHP }
              : { cur: m.character.currentHP ?? derived.hp, max: derived.hp };

            return (
              <div
                key={m.peerId}
                className="rounded-xl border border-line bg-void/40 p-3"
              >
                <div className="flex items-center gap-3">
                  <Avatar
                    seed={m.character.portraitSeed ?? m.character.id}
                    name={m.character.name}
                    size={40}
                    ring="beam"
                    status={
                      combatant?.isDead
                        ? 'offline'
                        : combatant?.isUnconscious
                          ? 'away'
                          : m.status === 'connected'
                            ? 'online'
                            : 'offline'
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-sm font-semibold text-ink">
                      {m.character.name}
                    </p>
                    <p className="text-xs text-ink-faint">
                      Lv {m.character.level} · AC {combatant?.ac ?? derived.ac}
                    </p>
                  </div>
                  <Badge
                    tone={statusTone[m.status]}
                    size="sm"
                    variant="soft"
                    icon={m.status === 'connected' ? <Wifi /> : <WifiOff />}
                  >
                    {m.status}
                  </Badge>
                </div>

                <div className="mt-2.5 space-y-1.5">
                  <ResourceBar kind="hp" size="sm" current={hp.cur} max={hp.max} />
                  {combatant && (
                    <div className="grid grid-cols-2 gap-1.5">
                      <ResourceBar
                        kind="mp"
                        size="sm"
                        current={combatant.currentMP}
                        max={combatant.maxMP}
                      />
                      <ResourceBar
                        kind="sp"
                        size="sm"
                        current={combatant.currentSP}
                        max={combatant.maxSP}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </Panel>
  );
}
