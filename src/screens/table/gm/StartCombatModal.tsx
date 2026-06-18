import { useMemo, useState } from 'react';
import { Swords, Check, Plus, UserPlus, Skull } from 'lucide-react';
import type { Character, Combatant, PartyMember } from '@/types';
import { Modal, Button, Avatar, Badge, EmptyState, Divider, NumberStepper } from '@/components/ui';
import { useRosterStore, useCombatStore, useUIStore } from '@/store';
import { createCombatant } from '@/engine';
import { cn } from '@/lib/cn';

export interface StartCombatModalProps {
  open: boolean;
  onClose: () => void;
  party: PartyMember[];
}

/**
 * GM combat setup: pick which connected players join the fray (team 'player')
 * and stage enemies/NPCs from the saved roster (team 'npc', optionally several
 * copies of the same template). Builds `Combatant[]` via the engine and starts
 * combat.
 */
export function StartCombatModal({ open, onClose, party }: StartCombatModalProps) {
  const roster = useRosterStore((s) => s.characters);
  const startCombat = useCombatStore((s) => s.startCombat);
  const pushToast = useUIStore((s) => s.pushToast);

  // Selected players (default: all connected) and enemy counts by roster id.
  const [players, setPlayers] = useState<Record<string, boolean>>({});
  const [enemyCounts, setEnemyCounts] = useState<Record<string, number>>({});

  const selectedPlayers = useMemo(
    () => party.filter((m) => players[m.peerId] ?? true),
    [party, players],
  );
  const totalEnemies = useMemo(
    () => Object.values(enemyCounts).reduce((a, b) => a + b, 0),
    [enemyCounts],
  );

  const togglePlayer = (peerId: string) =>
    setPlayers((p) => ({ ...p, [peerId]: !(p[peerId] ?? true) }));

  const setEnemyCount = (id: string, n: number) =>
    setEnemyCounts((c) => ({ ...c, [id]: Math.max(0, n) }));

  const canStart = selectedPlayers.length + totalEnemies > 0;

  const begin = () => {
    const list: Combatant[] = [];

    for (const m of selectedPlayers) {
      list.push(createCombatant(m.character, { team: 'player', peerId: m.peerId }));
    }

    for (const [rosterId, count] of Object.entries(enemyCounts)) {
      const template = roster.find((c) => c.id === rosterId);
      if (!template || count <= 0) continue;
      for (let i = 0; i < count; i++) {
        // Give each instance a distinct id/name so the engine + UI keep them apart.
        const instance: Character = {
          ...template,
          id: count > 1 ? `${template.id}#${i + 1}` : `${template.id}#npc`,
          name: count > 1 ? `${template.name} ${i + 1}` : template.name,
        };
        list.push(createCombatant(instance, { team: 'npc' }));
      }
    }

    if (list.length === 0) return;
    startCombat(list);
    pushToast({
      title: 'Combat begins',
      body: `${selectedPlayers.length} heroes vs ${totalEnemies} foes.`,
      tone: 'arcane',
    });
    setEnemyCounts({});
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Begin Combat"
      description="Choose who enters the fray, then bring the foes."
      footer={
        <>
          <span className="mr-auto text-xs text-ink-muted">
            {selectedPlayers.length} {selectedPlayers.length === 1 ? 'hero' : 'heroes'} ·{' '}
            {totalEnemies} {totalEnemies === 1 ? 'foe' : 'foes'}
          </span>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!canStart}
            leftIcon={<Swords className="h-4 w-4" />}
            onClick={begin}
          >
            Start Combat
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Players */}
        <section className="space-y-2">
          <h4 className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-ink-faint">
            Heroes
          </h4>
          {party.length === 0 ? (
            <p className="rounded-xl border border-line bg-void/40 p-4 text-sm text-ink-muted">
              No players are connected yet. You can still stage a fight with NPCs only.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {party.map((m) => {
                const on = players[m.peerId] ?? true;
                return (
                  <button
                    key={m.peerId}
                    type="button"
                    onClick={() => togglePlayer(m.peerId)}
                    className={cn(
                      'flex items-center gap-3 rounded-xl border p-2.5 text-left transition-colors tap-highlight-none focus-visible:outline-none',
                      on
                        ? 'border-arcane/50 bg-arcane/10'
                        : 'border-line bg-void/40 opacity-60 hover:opacity-100',
                    )}
                  >
                    <Avatar
                      seed={m.character.portraitSeed ?? m.character.id}
                      name={m.character.name}
                      size={36}
                      ring={on ? 'arcane' : 'none'}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{m.character.name}</p>
                      <p className="text-xs text-ink-faint">Lv {m.character.level}</p>
                    </div>
                    <span
                      className={cn(
                        'grid h-6 w-6 place-items-center rounded-md border',
                        on ? 'border-arcane/50 bg-arcane/20 text-arcane-soft' : 'border-line text-ink-faint',
                      )}
                    >
                      {on && <Check className="h-3.5 w-3.5" />}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <Divider label="Versus" />

        {/* Enemies from roster */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-ink-faint">
              Foes & NPCs
            </h4>
            <Badge tone="danger" size="sm" variant="soft" icon={<Skull />}>
              {totalEnemies} staged
            </Badge>
          </div>
          {roster.length === 0 ? (
            <EmptyState
              size="sm"
              icon={<UserPlus />}
              title="No saved characters"
              hint="Forge enemies and NPCs in the Roster, then bring them to battle here."
            />
          ) : (
            <div className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {roster.map((c) => {
                const count = enemyCounts[c.id] ?? 0;
                return (
                  <div
                    key={c.id}
                    className={cn(
                      'flex items-center gap-3 rounded-xl border p-2.5',
                      count > 0 ? 'border-danger/40 bg-danger/[0.06]' : 'border-line bg-void/40',
                    )}
                  >
                    <Avatar
                      seed={c.portraitSeed ?? c.id}
                      name={c.name}
                      size={36}
                      ring={count > 0 ? 'beam' : 'none'}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{c.name}</p>
                      <p className="text-xs text-ink-faint">Lv {c.level}</p>
                    </div>
                    {count === 0 ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        leftIcon={<Plus className="h-3.5 w-3.5" />}
                        onClick={() => setEnemyCount(c.id, 1)}
                      >
                        Add
                      </Button>
                    ) : (
                      <NumberStepper
                        size="sm"
                        value={count}
                        min={0}
                        max={12}
                        onChange={(n) => setEnemyCount(c.id, n)}
                        aria-label={`${c.name} count`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}
