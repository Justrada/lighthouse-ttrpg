import { Users } from 'lucide-react';
import type { Combatant, PartyMember } from '@/types';
import { Panel, PanelHeader, Avatar, ResourceBar, Badge, EmptyState } from '@/components/ui';
import { calculateDerivedStats } from '@/engine';
import { cn } from '@/lib/cn';

export interface PartyStatusProps {
  /** Combat combatants (players + npcs), used when combat is active. */
  combatants?: Combatant[];
  /** Party members, used out of combat. */
  party?: PartyMember[];
  /** Highlight the local player's row. */
  selfId?: string | null;
  className?: string;
}

/**
 * A live status board. In combat it lists every combatant (allies then foes)
 * with HP bars; out of combat it shows the connected party. Compact and
 * phone-friendly.
 */
export function PartyStatus({ combatants, party, selfId, className }: PartyStatusProps) {
  const inCombat = Boolean(combatants && combatants.length > 0);

  return (
    <Panel className={cn('flex flex-col', className)}>
      <PanelHeader
        title={inCombat ? 'Battlefield Status' : 'The Party'}
        leading={
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-arcane/30 bg-arcane/10 text-arcane-soft">
            <Users className="h-4 w-4" />
          </span>
        }
      />
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {inCombat
          ? renderCombatants(combatants!, selfId)
          : party && party.length > 0
            ? renderParty(party)
            : (
              <EmptyState
                size="sm"
                icon={<Users />}
                title="Gathering the party"
                hint="Fellow adventurers will appear here as they arrive."
              />
            )}
      </div>
    </Panel>
  );
}

function renderCombatants(combatants: Combatant[], selfId?: string | null) {
  const allies = combatants.filter((c) => c.team === 'player');
  const foes = combatants.filter((c) => c.team === 'npc');

  const Row = (c: Combatant) => {
    const isSelf = c.id === selfId;
    const down = c.isUnconscious || c.isDead;
    return (
      <div
        key={c.id}
        className={cn(
          'flex items-center gap-2.5 rounded-lg border p-2',
          isSelf ? 'border-beam/40 bg-beam/[0.06]' : 'border-line bg-void/40',
          down && 'opacity-60',
        )}
      >
        <Avatar
          seed={c.characterId ?? c.id}
          name={c.name}
          size={32}
          ring={isSelf ? 'beam' : c.team === 'npc' ? 'none' : 'arcane'}
          status={c.isDead ? 'offline' : c.isUnconscious ? 'away' : null}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-xs font-semibold text-ink">{c.name}</span>
            {isSelf && <Badge tone="beam" size="sm" variant="outline">You</Badge>}
          </div>
          <ResourceBar kind="hp" size="sm" current={c.currentHP} max={c.maxHP} hideValue className="mt-1" />
        </div>
        <span className="shrink-0 font-mono text-[0.625rem] text-ink-faint">
          {c.currentHP}/{c.maxHP}
        </span>
      </div>
    );
  };

  return (
    <>
      {allies.length > 0 && (
        <div className="space-y-1.5">
          <p className="px-1 text-[0.625rem] font-semibold uppercase tracking-wider text-arcane-soft">
            Allies
          </p>
          {allies.map(Row)}
        </div>
      )}
      {foes.length > 0 && (
        <div className="space-y-1.5 pt-2">
          <p className="px-1 text-[0.625rem] font-semibold uppercase tracking-wider text-hp">Foes</p>
          {foes.map(Row)}
        </div>
      )}
    </>
  );
}

function renderParty(party: PartyMember[]) {
  return party.map((m) => {
    const d = calculateDerivedStats(m.character);
    return (
      <div key={m.peerId} className="flex items-center gap-2.5 rounded-lg border border-line bg-void/40 p-2">
        <Avatar
          seed={m.character.portraitSeed ?? m.character.id}
          name={m.character.name}
          size={32}
          ring="arcane"
          status={m.status === 'connected' ? 'online' : 'offline'}
        />
        <div className="min-w-0 flex-1">
          <span className="truncate text-xs font-semibold text-ink">{m.character.name}</span>
          <ResourceBar
            kind="hp"
            size="sm"
            current={m.character.currentHP ?? d.hp}
            max={d.hp}
            hideValue
            className="mt-1"
          />
        </div>
        <Badge tone="neutral" size="sm" variant="outline">
          Lv {m.character.level}
        </Badge>
      </div>
    );
  });
}
