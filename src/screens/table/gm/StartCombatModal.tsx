import { useMemo, useState } from 'react';
import { Swords, Check, Plus, UserPlus, Skull, Users, BookOpen, Heart, Shield } from 'lucide-react';
import type { Character, Combatant, PartyMember } from '@/types';
import { Modal, Button, Avatar, Badge, EmptyState, Divider, NumberStepper, Tabs } from '@/components/ui';
import { useRosterStore, useCombatStore, useUIStore } from '@/store';
import { createCombatant, calculateDerivedStats } from '@/engine';
import { NPC_TEMPLATES, type NpcTemplate } from '@/data/npcTemplates';
import { cn } from '@/lib/cn';

export interface StartCombatModalProps {
  open: boolean;
  onClose: () => void;
  party: PartyMember[];
}

type FoeTab = 'roster' | 'bestiary';

/** Tier ordering + presentation for grouped bestiary rows. */
const TIER_ORDER: NpcTemplate['tier'][] = ['minion', 'standard', 'elite', 'boss'];
const TIER_META: Record<NpcTemplate['tier'], { label: string; tone: 'neutral' | 'arcane' | 'mystic' | 'danger' }> = {
  minion: { label: 'Minion', tone: 'neutral' },
  standard: { label: 'Standard', tone: 'arcane' },
  elite: { label: 'Elite', tone: 'mystic' },
  boss: { label: 'Boss', tone: 'danger' },
};

/**
 * Build the synthetic per-instance Character for an NPC template/roster foe. Each
 * instance gets a distinct `id`/`name` via a `#suffix` so the engine + UI keep
 * copies apart; the combat lookups strip the suffix to recover the source.
 */
function instanceOf(template: Character, index: number, count: number): Character {
  return {
    ...template,
    id: count > 1 ? `${template.id}#${index + 1}` : `${template.id}#npc`,
    name: count > 1 ? `${template.name} ${index + 1}` : template.name,
  };
}

/**
 * GM combat setup: pick which connected players join the fray (team 'player')
 * and stage enemies/NPCs — either from the saved roster or the drop-in bestiary
 * (team 'npc', optionally several copies of the same template). Builds
 * `Combatant[]` via the engine and starts combat.
 */
export function StartCombatModal({ open, onClose, party }: StartCombatModalProps) {
  const roster = useRosterStore((s) => s.characters);
  const startCombat = useCombatStore((s) => s.startCombat);
  const pushToast = useUIStore((s) => s.pushToast);

  // Selected players (default: all connected) and enemy counts keyed by source id.
  const [players, setPlayers] = useState<Record<string, boolean>>({});
  const [enemyCounts, setEnemyCounts] = useState<Record<string, number>>({});
  const [bestiaryCounts, setBestiaryCounts] = useState<Record<string, number>>({});
  const [foeTab, setFoeTab] = useState<FoeTab>('roster');

  const selectedPlayers = useMemo(
    () => party.filter((m) => players[m.peerId] ?? true),
    [party, players],
  );
  const rosterEnemies = useMemo(
    () => Object.values(enemyCounts).reduce((a, b) => a + b, 0),
    [enemyCounts],
  );
  const bestiaryEnemies = useMemo(
    () => Object.values(bestiaryCounts).reduce((a, b) => a + b, 0),
    [bestiaryCounts],
  );
  const totalEnemies = rosterEnemies + bestiaryEnemies;

  // Bestiary grouped by tier, in display order.
  const bestiaryByTier = useMemo(
    () =>
      TIER_ORDER.map((tier) => ({
        tier,
        entries: NPC_TEMPLATES.filter((t) => t.tier === tier),
      })).filter((g) => g.entries.length > 0),
    [],
  );

  const togglePlayer = (peerId: string) =>
    setPlayers((p) => ({ ...p, [peerId]: !(p[peerId] ?? true) }));

  const setEnemyCount = (id: string, n: number) =>
    setEnemyCounts((c) => ({ ...c, [id]: Math.max(0, n) }));

  const setBestiaryCount = (id: string, n: number) =>
    setBestiaryCounts((c) => ({ ...c, [id]: Math.max(0, n) }));

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
        list.push(createCombatant(instanceOf(template, i, count), { team: 'npc' }));
      }
    }

    for (const [npcId, count] of Object.entries(bestiaryCounts)) {
      const template = NPC_TEMPLATES.find((t) => t.character.id === npcId)?.character;
      if (!template || count <= 0) continue;
      for (let i = 0; i < count; i++) {
        list.push(createCombatant(instanceOf(template, i, count), { team: 'npc' }));
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
    setBestiaryCounts({});
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

        {/* Foes — from the saved roster or the drop-in bestiary. */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-ink-faint">
              Foes & NPCs
            </h4>
            <Badge tone="danger" size="sm" variant="soft" icon={<Skull />}>
              {totalEnemies} staged
            </Badge>
          </div>

          <Tabs<FoeTab>
            value={foeTab}
            onChange={setFoeTab}
            variant="pill"
            aria-label="Choose foe source"
            items={[
              {
                value: 'roster',
                label: 'Your Roster',
                icon: <Users />,
                badge:
                  rosterEnemies > 0 ? (
                    <Badge tone="danger" size="sm" variant="solid">
                      {rosterEnemies}
                    </Badge>
                  ) : undefined,
              },
              {
                value: 'bestiary',
                label: 'Bestiary',
                icon: <BookOpen />,
                badge:
                  bestiaryEnemies > 0 ? (
                    <Badge tone="danger" size="sm" variant="solid">
                      {bestiaryEnemies}
                    </Badge>
                  ) : undefined,
              },
            ]}
          />

          {foeTab === 'roster' ? (
            roster.length === 0 ? (
              <EmptyState
                size="sm"
                icon={<UserPlus />}
                title="No saved characters"
                hint="Forge enemies and NPCs in the Roster, or stage premade foes from the Bestiary."
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
            )
          ) : (
            <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
              {bestiaryByTier.map(({ tier, entries }) => {
                const meta = TIER_META[tier];
                return (
                  <div key={tier} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-ink-faint">
                        {meta.label}
                      </span>
                      <span className="h-px flex-1 bg-line" />
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {entries.map((t) => {
                        const c = t.character;
                        const count = bestiaryCounts[c.id] ?? 0;
                        const derived = calculateDerivedStats(c);
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
                              <div className="flex items-center gap-1.5">
                                <p className="truncate text-sm font-semibold text-ink">{c.name}</p>
                                <Badge tone={meta.tone} size="sm" variant="outline">
                                  {meta.label}
                                </Badge>
                              </div>
                              <p className="truncate text-xs text-ink-faint">{t.role}</p>
                              <div className="mt-0.5 flex items-center gap-3 text-[0.65rem] text-ink-muted">
                                <span className="inline-flex items-center gap-1">
                                  <Heart className="h-3 w-3 text-hp" />
                                  {derived.hp}
                                </span>
                                <span className="inline-flex items-center gap-1">
                                  <Shield className="h-3 w-3 text-arcane-soft" />
                                  {derived.ac}
                                </span>
                              </div>
                            </div>
                            {count === 0 ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                leftIcon={<Plus className="h-3.5 w-3.5" />}
                                onClick={() => setBestiaryCount(c.id, 1)}
                              >
                                Add
                              </Button>
                            ) : (
                              <NumberStepper
                                size="sm"
                                value={count}
                                min={0}
                                max={12}
                                onChange={(n) => setBestiaryCount(c.id, n)}
                                aria-label={`${c.name} count`}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
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
