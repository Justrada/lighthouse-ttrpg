import { useState, useEffect } from 'react';
import { Heart, Sparkles, Zap, Moon, Sun, NotebookPen, Wand2 } from 'lucide-react';
import type { Combatant } from '@/types';
import {
  Drawer,
  Button,
  Avatar,
  Badge,
  Select,
  NumberStepper,
  ConditionBadge,
  Divider,
  Textarea,
  EmptyState,
  SegmentedControl,
} from '@/components/ui';
import { useCombatStore, useUIStore } from '@/store';
import { CONDITIONS } from '@/data/constants';
import { cn } from '@/lib/cn';

export interface GMToolsDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Pre-selected combatant id (e.g. clicked on the board). */
  initialCombatantId?: string | null;
}

type ResKey = 'HP' | 'MP' | 'SP';

const resMeta: Record<ResKey, { icon: JSX.Element; color: string }> = {
  HP: { icon: <Heart className="h-4 w-4" />, color: 'text-hp' },
  MP: { icon: <Sparkles className="h-4 w-4" />, color: 'text-mp' },
  SP: { icon: <Zap className="h-4 w-4" />, color: 'text-sp' },
};

/**
 * GM master controls: nudge any combatant's HP/MP/SP (±1/±5 quick buttons or a
 * manual amount), toggle conditions, run short/long rests, and keep private
 * session notes. Operates on a single selected combatant for resources and
 * conditions; rests apply to the whole party.
 */
export function GMToolsDrawer({ open, onClose, initialCombatantId }: GMToolsDrawerProps) {
  const combatants = useCombatStore((s) => s.combat.combatants);
  const isActive = useCombatStore((s) => s.combat.isActive);
  const adjustResource = useCombatStore((s) => s.adjustResource);
  const toggleCondition = useCombatStore((s) => s.toggleCondition);
  const applyRest = useCombatStore((s) => s.applyRest);
  const pushToast = useUIStore((s) => s.pushToast);

  const [selectedId, setSelectedId] = useState<string | null>(
    initialCombatantId ?? combatants[0]?.id ?? null,
  );
  const [amount, setAmount] = useState(5);
  const [restScope, setRestScope] = useState<'party' | 'one'>('party');
  const [notes, setNotes] = useState('');

  // When opened from a token click, seed the selection — but let the user
  // re-target afterward (previously initialCombatantId always overrode selectedId).
  useEffect(() => {
    if (open && initialCombatantId) setSelectedId(initialCombatantId);
  }, [open, initialCombatantId]);

  const selected = combatants.find((c) => c.id === selectedId) ?? combatants[0];

  const nudge = (res: ResKey, delta: number) => {
    if (!selected) return;
    adjustResource(selected.id, res, delta);
  };

  const rest = (kind: 'short' | 'long') => {
    applyRest(kind, restScope === 'one' ? selected?.id : undefined);
    pushToast({
      title: `${kind === 'long' ? 'Long' : 'Short'} rest`,
      body: restScope === 'one' && selected ? selected.name : 'The party recovers.',
      tone: 'arcane',
    });
  };

  return (
    <Drawer open={open} onClose={onClose} side="right" title="GM Tools">
      {!isActive || combatants.length === 0 ? (
        <EmptyState
          size="sm"
          icon={<Wand2 />}
          title="Tools awaken in combat"
          hint="Start a battle to adjust resources, apply conditions, and call for rests."
        />
      ) : (
        <div className="space-y-5">
          {/* Target selector */}
          <section className="space-y-2">
            <h4 className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-ink-faint">
              Target
            </h4>
            <Select
              aria-label="Selected combatant"
              value={selected?.id ?? null}
              onChange={setSelectedId}
              options={combatants.map((c) => ({
                value: c.id,
                label: `${c.team === 'npc' ? '⚔ ' : '🛡 '}${c.name}`,
              }))}
            />
            {selected && (
              <div className="flex items-center gap-3 rounded-xl border border-line bg-void/40 p-3">
                <Avatar
                  seed={selected.characterId ?? selected.id}
                  name={selected.name}
                  size={40}
                  ring={selected.team === 'npc' ? 'none' : 'arcane'}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{selected.name}</p>
                  <p className="font-mono text-xs text-ink-faint">
                    <span className="text-hp">{selected.currentHP}</span>/{selected.maxHP} HP ·{' '}
                    <span className="text-mp">{selected.currentMP}</span>/{selected.maxMP} ·{' '}
                    <span className="text-sp">{selected.currentSP}</span>/{selected.maxSP}
                  </p>
                </div>
                {selected.isDead ? (
                  <Badge tone="danger" size="sm">Dead</Badge>
                ) : selected.isUnconscious ? (
                  <Badge tone="warn" size="sm">Down</Badge>
                ) : null}
              </div>
            )}
          </section>

          {/* Resource controls */}
          {selected && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-ink-faint">
                  Resources
                </h4>
                <NumberStepper
                  size="sm"
                  value={amount}
                  min={1}
                  max={99}
                  editable
                  onChange={setAmount}
                  aria-label="Manual amount"
                />
              </div>
              {(['HP', 'MP', 'SP'] as ResKey[]).map((res) => (
                <div key={res} className="flex items-center gap-2">
                  <span
                    className={cn(
                      'inline-flex w-12 items-center gap-1.5 font-display text-xs font-bold uppercase',
                      resMeta[res].color,
                    )}
                  >
                    {resMeta[res].icon}
                    {res}
                  </span>
                  <div className="flex flex-1 gap-1.5">
                    <Button size="sm" variant="danger" fullWidth onClick={() => nudge(res, -amount)}>
                      −{amount}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => nudge(res, -1)}>
                      −1
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => nudge(res, 1)}>
                      +1
                    </Button>
                    <Button
                      size="sm"
                      variant="arcane"
                      fullWidth
                      onClick={() => nudge(res, amount)}
                    >
                      +{amount}
                    </Button>
                  </div>
                </div>
              ))}
            </section>
          )}

          {/* Conditions */}
          {selected && (
            <section className="space-y-2">
              <h4 className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-ink-faint">
                Conditions
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {CONDITIONS.map((cond) => {
                  const active = selected.statusEffects.some(
                    (e) => e.data?.conditionKey === cond.key,
                  );
                  return (
                    <button
                      key={cond.key}
                      type="button"
                      onClick={() => toggleCondition(selected.id, cond.key)}
                      className="rounded-lg focus-visible:outline-none"
                      aria-pressed={active}
                    >
                      <ConditionBadge
                        size="sm"
                        label={cond.label}
                        tone={cond.tone}
                        icon={<span aria-hidden>{cond.icon}</span>}
                        className={cn(
                          'transition-opacity',
                          active ? 'opacity-100 ring-1 ring-current/40' : 'opacity-45 hover:opacity-80',
                        )}
                      />
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          <Divider />

          {/* Rest */}
          <section className="space-y-2">
            <h4 className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-ink-faint">
              Rest
            </h4>
            <SegmentedControl
              fullWidth
              size="sm"
              value={restScope}
              onChange={setRestScope}
              options={[
                { value: 'party', label: 'Whole Party' },
                { value: 'one', label: selected?.name ?? 'Selected' },
              ]}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                fullWidth
                leftIcon={<Sun className="h-4 w-4" />}
                onClick={() => rest('short')}
              >
                Short Rest
              </Button>
              <Button
                size="sm"
                variant="arcane"
                fullWidth
                leftIcon={<Moon className="h-4 w-4" />}
                onClick={() => rest('long')}
              >
                Long Rest
              </Button>
            </div>
            <p className="text-xs text-ink-faint">
              Short restores half MP/SP. Long restores all HP/MP/SP.
            </p>
          </section>

          <Divider />

          {/* Session notes (local only) */}
          <section className="space-y-2">
            <h4 className="flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-ink-faint">
              <NotebookPen className="h-3.5 w-3.5" /> Session Notes
            </h4>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Secret plots, initiative quirks, NPC voices…"
              rows={5}
            />
          </section>
        </div>
      )}
    </Drawer>
  );
}
