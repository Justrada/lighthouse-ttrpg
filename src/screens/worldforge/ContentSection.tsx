import { useState } from 'react';
import { nanoid } from 'nanoid';
import { Plus, Trash2, Swords, Wand2, Sparkles, RotateCw } from 'lucide-react';
import { Input, Textarea, Select, NumberStepper, SegmentedControl, Button, Badge, Divider } from '@/components/ui';
import type { Worldpack, WorldpackContent, SkillNode, SkillEffect, WorldItem, SystemBaseMode } from '@/types';
import { cn } from '@/lib/cn';
import { TreeEditor } from './TreeEditor';

/**
 * Creator Studio — author custom Abilities (skills/spells) and Weapons that the
 * engine resolves like base content. The pack's `baseMode` decides whether this
 * content extends or replaces the base ruleset. Effects compose the same engine
 * primitives, so a custom "Plasma Bolt" resolves through the exact code a base
 * Fireball does.
 */

const EMPTY: WorldpackContent = { nodes: [], edges: [], worldItems: {} };

const BASE_MODES: { value: SystemBaseMode; label: string }[] = [
  { value: 'overlay', label: 'Reskin only' },
  { value: 'extend', label: 'Add to base' },
  { value: 'replace', label: 'Replace base' },
];

const RANGES = ['Self', 'Melee', 'Near', 'Far', 'Distant', 'Battlefield'].map((r) => ({ value: r, label: r }));
const RESOURCES = ['MP', 'SP', 'HP'].map((r) => ({ value: r, label: r }));
const SKILLS = ['Physical', 'Stealth', 'Lore', 'Awareness', 'Influence', 'Survival'].map((s) => ({ value: s, label: s }));
const HIT_TYPES = [
  { value: 'Roll to Hit', label: 'Roll to Hit' },
  { value: 'Auto Hit', label: 'Auto Hit' },
];
const EFFECT_TYPES = [
  { value: 'Apply Damage', label: 'Deal damage' },
  { value: 'Apply Healing', label: 'Heal' },
  { value: 'Modify Stat', label: 'Modify a stat' },
];
const STAT_TARGETS = [
  'HP', 'MP', 'SP', 'Max HP', 'Max MP', 'Max SP', 'AC', 'Initiative',
  'Physical', 'Stealth', 'Lore', 'Awareness', 'Influence', 'Survival',
].map((s) => ({ value: s, label: s }));
const DURATION_UNITS = [
  { value: 'Rounds', label: 'Rounds' },
  { value: 'Actions', label: 'Actions' },
  { value: 'Permanent', label: 'Permanent' },
];

function newAbilityNode(): SkillNode {
  const id = `cn_${nanoid(6)}`;
  return {
    id, x: 0, y: 0, label: 'New Ability', description: '', isCenter: false,
    linkedItem: {
      id: `ab_${nanoid(6)}`, type: 'Ability', name: 'New Ability', description: '',
      cost: { type: 'MP', value: 2 }, range: 'Near', aoe: 'Single Target', hitType: 'Roll to Hit',
      rollModifier: 'Lore', combatUse: true,
      effects: [{ id: `e_${nanoid(6)}`, type: 'Apply Damage', useWeaponDamage: false, additionalDamage: '1d6' }],
    },
  };
}

function newWeapon(): WorldItem {
  return {
    id: `ci_${nanoid(6)}`, type: 'Inventory Item', name: 'New Weapon', description: '',
    itemType: 'Weapon', range: 'Melee', damage: '1d6', combatUse: true, aoe: 'Single Target',
    hitType: 'Roll to Hit', rollModifier: 'Physical',
    effects: [{ id: `e_${nanoid(6)}`, type: 'Apply Damage', useWeaponDamage: false, additionalDamage: '1d6' }],
  } as WorldItem;
}

interface Props {
  draft: Worldpack;
  /** Functional updater (React setState form) — mutations compute from the latest
   *  draft so several edits in one tick don't clobber each other. */
  setDraft: (updater: (d: Worldpack) => Worldpack) => void;
}

export function ContentSection({ draft, setDraft }: Props) {
  const content = draft.content ?? EMPTY;
  const baseMode = draft.baseMode ?? 'overlay';
  const abilities = content.nodes;
  const weapons = content.worldItems.weapons ?? [];

  const [view, setView] = useState<'list' | 'map'>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = content.nodes.find((n) => n.id === selectedId) ?? null;

  // All content edits go through the latest draft inside the updater.
  const mutate = (fn: (c: WorldpackContent) => WorldpackContent) =>
    setDraft((d) => ({ ...d, content: fn(d.content ?? EMPTY) }));
  const setBaseMode = (m: SystemBaseMode) => setDraft((d) => ({ ...d, baseMode: m }));

  // --- abilities ---
  const addAbility = () =>
    mutate((c) => {
      const i = c.nodes.length;
      // Spread new nodes across the editor canvas instead of stacking at 0,0.
      const node = { ...newAbilityNode(), x: 180 + (i % 4) * 130, y: 70 + Math.floor(i / 4) * 90 };
      return {
        ...c,
        nodes: [...c.nodes, node],
        edges: [...c.edges, { id: `ed_${nanoid(6)}`, sourceId: 'center-0', targetId: node.id }],
      };
    });
  const updateAbility = (id: string, node: SkillNode) =>
    mutate((c) => ({ ...c, nodes: c.nodes.map((n) => (n.id === id ? node : n)) }));
  const removeAbility = (id: string) =>
    mutate((c) => ({
      ...c,
      nodes: c.nodes.filter((n) => n.id !== id),
      edges: c.edges.filter((e) => e.sourceId !== id && e.targetId !== id),
    }));

  // --- weapons ---
  const setWeapons = (fn: (w: WorldItem[]) => WorldItem[]) =>
    mutate((c) => ({ ...c, worldItems: { ...c.worldItems, weapons: fn(c.worldItems.weapons ?? []) } }));
  const addWeapon = () => setWeapons((w) => [...w, newWeapon()]);
  const updateWeapon = (id: string, item: WorldItem) => setWeapons((w) => w.map((x) => (x.id === id ? item : x)));
  const removeWeapon = (id: string) => setWeapons((w) => w.filter((x) => x.id !== id));

  return (
    <div className="space-y-5">
      {/* base mode */}
      <div className="rounded-xl border border-line bg-surface/40 p-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">How this system relates to the base</p>
        <SegmentedControl value={baseMode} onChange={(v) => setBaseMode(v as SystemBaseMode)} options={BASE_MODES} />
        <p className="mt-2 text-xs text-ink-muted">
          {baseMode === 'overlay' && 'Reskin only — custom content below is saved but NOT used in play. Switch to “Add to base” or “Replace base” to use it.'}
          {baseMode === 'extend' && 'Your custom content is added on top of the base ruleset (a custom id with the same name overrides the base one).'}
          {baseMode === 'replace' && 'Only your custom content is used; the base catalog is hidden (the core skill is kept so characters can start).'}
        </p>
      </div>

      {baseMode === 'overlay' && (abilities.length > 0 || weapons.length > 0) && (
        <div className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
          You have custom content but the mode is “Reskin only”, so it won't appear in play. Choose “Add to base” or “Replace base”.
        </div>
      )}

      {/* abilities */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 font-display text-xs font-semibold uppercase tracking-[0.18em] text-ink-faint">
            <Wand2 className="h-3.5 w-3.5" /> Custom abilities ({abilities.length})
          </h3>
          <SegmentedControl
            value={view}
            onChange={(v) => setView(v as 'list' | 'map')}
            options={[
              { value: 'list', label: 'List' },
              { value: 'map', label: 'Map' },
            ]}
          />
        </div>

        {view === 'map' ? (
          <>
            <TreeEditor content={content} mutate={mutate} selectedId={selectedId} onSelect={setSelectedId} onAdd={addAbility} />
            {selected ? (
              <AbilityEditor
                key={selected.id}
                node={selected}
                onChange={(n) => updateAbility(selected.id, n)}
                onRemove={() => {
                  removeAbility(selected.id);
                  setSelectedId(null);
                }}
              />
            ) : (
              <p className="rounded-lg border border-dashed border-line bg-void/30 px-3 py-2 text-xs text-ink-faint">
                Tap a node on the map to edit it.
              </p>
            )}
          </>
        ) : (
          <>
            <div className="flex justify-end">
              <Button variant="secondary" size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={addAbility}>
                New ability
              </Button>
            </div>
            {abilities.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line bg-void/30 px-3 py-2 text-xs text-ink-faint">
                No custom abilities yet. Add one to create a skill or spell learnable from the core node.
              </p>
            ) : (
              abilities.map((node) => (
                <AbilityEditor key={node.id} node={node} onChange={(n) => updateAbility(node.id, n)} onRemove={() => removeAbility(node.id)} />
              ))
            )}
          </>
        )}
      </section>

      <Divider />

      {/* weapons */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 font-display text-xs font-semibold uppercase tracking-[0.18em] text-ink-faint">
            <Swords className="h-3.5 w-3.5" /> Custom weapons ({weapons.length})
          </h3>
          <Button variant="secondary" size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={addWeapon}>
            New weapon
          </Button>
        </div>
        {weapons.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line bg-void/30 px-3 py-2 text-xs text-ink-faint">
            No custom weapons yet. Add a blade, bow, or gun — set its damage dice and range.
          </p>
        ) : (
          weapons.map((item) => (
            <WeaponEditor key={item.id} item={item} onChange={(it) => updateWeapon(item.id, it)} onRemove={() => removeWeapon(item.id)} />
          ))
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Labeled({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1 block text-[0.7rem] font-medium uppercase tracking-wide text-ink-faint">{label}</span>
      {children}
    </label>
  );
}

function AbilityEditor({ node, onChange, onRemove }: { node: SkillNode; onChange: (n: SkillNode) => void; onRemove: () => void }) {
  const li = node.linkedItem!;
  const effect = li.effects[0] ?? { id: `e_${nanoid(6)}`, type: 'Apply Damage' };

  const setLi = (p: Partial<typeof li>) => onChange({ ...node, linkedItem: { ...li, ...p } });
  const setName = (name: string) => onChange({ ...node, label: name, linkedItem: { ...li, name } });
  const setEffect = (e: SkillEffect) => setLi({ effects: [e] });

  return (
    <div className="rounded-xl border border-arcane/30 bg-surface/40 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-arcane-soft" />
        <Input value={li.name} placeholder="Ability name" maxLength={120} onChange={(e) => setName(e.target.value)} />
        <Button variant="ghost" size="sm" aria-label="Remove ability" onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <Textarea
        value={li.description ?? ''}
        placeholder="What does it do, flavor-wise?"
        rows={2}
        maxLength={400}
        onChange={(e) => onChange({ ...node, description: e.target.value, linkedItem: { ...li, description: e.target.value } })}
      />
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Labeled label="Cost">
          <NumberStepper
            value={li.cost?.value ?? 0}
            min={0}
            max={99}
            onChange={(v) => setLi({ cost: { type: li.cost?.type ?? 'MP', value: v } })}
          />
        </Labeled>
        <Labeled label="Pool">
          <Select
            value={li.cost?.type ?? 'MP'}
            options={RESOURCES}
            onChange={(v) => setLi({ cost: { type: v as 'MP' | 'SP' | 'HP', value: li.cost?.value ?? 0 } })}
            aria-label="Cost pool"
          />
        </Labeled>
        <Labeled label="Range">
          <Select value={li.range ?? 'Near'} options={RANGES} onChange={(v) => setLi({ range: v })} aria-label="Range" />
        </Labeled>
        <Labeled label="To hit">
          <Select value={li.hitType ?? 'Roll to Hit'} options={HIT_TYPES} onChange={(v) => setLi({ hitType: v })} aria-label="Hit type" />
        </Labeled>
      </div>
      {li.hitType !== 'Auto Hit' && (
        <div className="mt-2">
          <Labeled label="Attack skill">
            <Select value={li.rollModifier ?? 'Lore'} options={SKILLS} onChange={(v) => setLi({ rollModifier: v })} aria-label="Attack skill" />
          </Labeled>
        </div>
      )}
      <div className="mt-2 rounded-lg border border-line bg-void/30 p-2">
        <EffectEditor effect={effect} onChange={setEffect} />
      </div>
    </div>
  );
}

function WeaponEditor({ item, onChange, onRemove }: { item: WorldItem; onChange: (it: WorldItem) => void; onRemove: () => void }) {
  // Keep the weapon's damage dice mirrored onto its Apply Damage effect so the
  // engine's computeDamage (which reads the equipped weapon's effect) matches.
  const setDamage = (damage: string) => {
    const effects: SkillEffect[] = [
      { id: item.effects[0]?.id ?? `e_${nanoid(6)}`, type: 'Apply Damage', useWeaponDamage: false, additionalDamage: damage },
    ];
    onChange({ ...item, damage, effects });
  };
  return (
    <div className="rounded-xl border border-beam/30 bg-surface/40 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Swords className="h-3.5 w-3.5 shrink-0 text-beam" />
        <Input value={item.name} placeholder="Weapon name" maxLength={120} onChange={(e) => onChange({ ...item, name: e.target.value })} />
        <Button variant="ghost" size="sm" aria-label="Remove weapon" onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <Textarea
        value={item.description ?? ''}
        placeholder="Flavor / lore for this weapon"
        rows={2}
        maxLength={400}
        onChange={(e) => onChange({ ...item, description: e.target.value })}
      />
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Labeled label="Damage (dice)">
          <Input value={item.damage ?? ''} placeholder="2d6+1" mono onChange={(e) => setDamage(e.target.value)} />
        </Labeled>
        <Labeled label="Range">
          <Select value={item.range ?? 'Melee'} options={RANGES} onChange={(v) => onChange({ ...item, range: v })} aria-label="Weapon range" />
        </Labeled>
        <Labeled label="Attack skill">
          <Select
            value={(item as { rollModifier?: string }).rollModifier ?? 'Physical'}
            options={SKILLS}
            onChange={(v) => onChange({ ...item, rollModifier: v } as WorldItem)}
            aria-label="Weapon attack skill"
          />
        </Labeled>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Labeled label="Shots / attack">
          <NumberStepper value={item.shots ?? 1} min={1} max={20} onChange={(v) => onChange({ ...item, shots: v })} />
        </Labeled>
        <Labeled label="Clip (0 = no ammo)">
          <NumberStepper
            value={item.clipSize ?? 0}
            min={0}
            max={999}
            onChange={(v) =>
              onChange({
                ...item,
                clipSize: v > 0 ? v : undefined,
                ammoPerShot: v > 0 ? item.ammoPerShot ?? 1 : undefined,
                reserveAmmo: v > 0 ? item.reserveAmmo : undefined,
              })
            }
          />
        </Labeled>
        {(item.clipSize ?? 0) > 0 && (
          <>
            <Labeled label="Ammo / shot">
              <NumberStepper value={item.ammoPerShot ?? 1} min={1} max={99} onChange={(v) => onChange({ ...item, ammoPerShot: v })} />
            </Labeled>
            <Labeled label="Reserve (0 = ∞)">
              <NumberStepper
                value={item.reserveAmmo ?? 0}
                min={0}
                max={9999}
                onChange={(v) => onChange({ ...item, reserveAmmo: v > 0 ? v : undefined })}
              />
            </Labeled>
          </>
        )}
      </div>
      {(item.clipSize ?? 0) > 0 && (
        <p className="mt-1 flex items-center gap-1 text-[0.7rem] text-beam-soft">
          <RotateCw className="h-3 w-3" />
          Reloadable — {item.clipSize}/clip{(item.shots ?? 1) > 1 ? `, ${item.shots} shots/attack` : ''},{' '}
          {(item.reserveAmmo ?? 0) > 0 ? `${item.reserveAmmo} in reserve` : 'unlimited reserve'}.
        </p>
      )}
    </div>
  );
}

function EffectEditor({ effect, onChange }: { effect: SkillEffect; onChange: (e: SkillEffect) => void }) {
  const type = String(effect.type);
  const set = (p: Partial<SkillEffect>) => onChange({ ...effect, ...p });
  return (
    <div className="space-y-2">
      <Labeled label="Effect">
        <Select value={type} options={EFFECT_TYPES} onChange={(v) => onChange({ id: effect.id, type: v })} aria-label="Effect type" />
      </Labeled>
      {type === 'Apply Damage' && (
        <Labeled label="Damage (dice)">
          <Input
            value={String(effect.additionalDamage ?? '')}
            placeholder="2d6+2"
            mono
            onChange={(e) => set({ additionalDamage: e.target.value, useWeaponDamage: false })}
          />
        </Labeled>
      )}
      {type === 'Apply Healing' && (
        <div className="grid grid-cols-2 gap-2">
          <Labeled label="Pool">
            <Select
              value={String(effect.statToModify ?? 'HP')}
              options={RESOURCES.map((r) => ({ value: r.value, label: r.label }))}
              onChange={(v) => set({ statToModify: v })}
              aria-label="Heal pool"
            />
          </Labeled>
          <Labeled label="Amount (dice)">
            <Input value={String(effect.modification ?? '')} placeholder="2d6" mono onChange={(e) => set({ modification: e.target.value })} />
          </Labeled>
        </div>
      )}
      {type === 'Modify Stat' && (
        <div className="grid grid-cols-2 gap-2">
          <Labeled label="Stat">
            <Select value={String(effect.statToModify ?? 'AC')} options={STAT_TARGETS} onChange={(v) => set({ statToModify: v })} aria-label="Stat to modify" />
          </Labeled>
          <Labeled label="Amount">
            <Input value={String(effect.modification ?? '')} placeholder="+2 or 1d4" mono onChange={(e) => set({ modification: e.target.value })} />
          </Labeled>
          <Labeled label="Duration">
            <NumberStepper value={Number(effect.durationValue ?? 0)} min={0} max={99} onChange={(v) => set({ durationValue: v })} />
          </Labeled>
          <Labeled label="Unit">
            <Select
              value={String(effect.durationUnit ?? 'Rounds')}
              options={DURATION_UNITS}
              onChange={(v) => set({ durationUnit: v as never })}
              aria-label="Duration unit"
            />
          </Labeled>
        </div>
      )}
      <p className="text-[0.7rem] text-ink-faint">
        <Badge tone="neutral" size="sm">{type}</Badge> resolves through the same engine as base content.
      </p>
    </div>
  );
}
