import { useMemo, useState } from 'react';
import {
  Sword,
  Shield as ShieldIcon,
  Shirt,
  Gem,
  FlaskConical,
  Check,
  Plus,
  X,
  Backpack as BackpackIcon,
} from 'lucide-react';
import { motion } from 'framer-motion';
import type { ItemCategory, WorldItem } from '@/types';
import { useDraftStore } from '@/store';
import { getActiveWorldItems, findItem } from '@/data/skillTree';
import { Badge, Button, SegmentedControl, EmptyState, Divider } from '@/components/ui';
import { describeEffect } from '@/components/skilltree';
import { cn } from '@/lib/cn';

/** Map an item's bucket/category to its equip slot, or null for backpack. */
type EquipSlot = 'armor' | 'weapon' | 'shield' | 'accessory';
function slotFor(itemType: ItemCategory): EquipSlot | null {
  switch (itemType) {
    case 'Armor':
      return 'armor';
    case 'Weapon':
      return 'weapon';
    case 'Shield':
      return 'shield';
    case 'Accessory':
      return 'accessory';
    default:
      return null;
  }
}

const CATEGORY_ICON: Record<string, React.ReactNode> = {
  weapons: <Sword />,
  armor: <Shirt />,
  accessories: <Gem />,
  consumables: <FlaskConical />,
};

const ITEM_TYPE_ICON: Record<ItemCategory, React.ReactNode> = {
  Weapon: <Sword className="h-4 w-4" />,
  Armor: <Shirt className="h-4 w-4" />,
  Shield: <ShieldIcon className="h-4 w-4" />,
  Accessory: <Gem className="h-4 w-4" />,
  Consumable: <FlaskConical className="h-4 w-4" />,
};

const CATEGORY_LABEL: Record<string, string> = {
  weapons: 'Weapons',
  armor: 'Armor',
  accessories: 'Accessories',
  consumables: 'Consumables',
};

export function EquipmentSection() {
  const draft = useDraftStore((s) => s.draft);
  const equip = useDraftStore((s) => s.equip);
  const unequip = useDraftStore((s) => s.unequip);
  const addToBackpack = useDraftStore((s) => s.addToBackpack);
  const removeFromBackpack = useDraftStore((s) => s.removeFromBackpack);

  const worldItems = getActiveWorldItems();
  const categories = useMemo(() => Object.keys(worldItems), [worldItems]);
  const [category, setCategory] = useState<string>(categories[0] ?? 'weapons');

  if (!draft) return null;

  const inv = draft.inventory;
  const equippedSet = new Set(
    [inv.armor, inv.weapon, inv.shield, ...inv.accessories].filter(
      (id): id is string => Boolean(id),
    ),
  );

  const items = worldItems[category] ?? [];

  const handleToggle = (item: WorldItem) => {
    const slot = slotFor(item.itemType);
    if (!slot) {
      addToBackpack(item.id);
      return;
    }
    if (slot === 'accessory') {
      if (inv.accessories.includes(item.id)) unequip('accessory', item.id);
      else equip(item.id);
      return;
    }
    // single-slot: toggle off if this exact item is equipped, else equip.
    const current = slot === 'armor' ? inv.armor : slot === 'weapon' ? inv.weapon : inv.shield;
    if (current === item.id) unequip(slot);
    else equip(item.id);
  };

  const equippedList: Array<{ slot: string; item: WorldItem }> = [];
  if (inv.armor) {
    const it = findItem(inv.armor);
    if (it) equippedList.push({ slot: 'Armor', item: it });
  }
  if (inv.weapon) {
    const it = findItem(inv.weapon);
    if (it) equippedList.push({ slot: 'Weapon', item: it });
  }
  if (inv.shield) {
    const it = findItem(inv.shield);
    if (it) equippedList.push({ slot: 'Shield', item: it });
  }
  for (const accId of inv.accessories) {
    const it = findItem(accId);
    if (it) equippedList.push({ slot: 'Accessory', item: it });
  }

  return (
    <div className="space-y-6">
      {/* Loadout summary */}
      <section className="space-y-2">
        <h4 className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-ink-faint">
          Equipped
        </h4>
        {equippedList.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-void/30 px-4 py-3 text-sm text-ink-faint">
            Nothing equipped yet — browse below to arm your hero.
          </div>
        ) : (
          <div className="grid gap-1.5 sm:grid-cols-2">
            {equippedList.map(({ slot, item }) => (
              <div
                key={`${slot}-${item.id}`}
                className="flex items-center gap-2 rounded-xl border border-beam/30 bg-beam/5 px-3 py-2"
              >
                <span className="text-beam">{ITEM_TYPE_ICON[item.itemType]}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm text-ink">{item.name}</span>
                    <Badge tone="neutral" size="sm">
                      {slot}
                    </Badge>
                  </div>
                  <EffectLine item={item} />
                </div>
                <button
                  type="button"
                  aria-label={`Unequip ${item.name}`}
                  onClick={() =>
                    handleToggleEquipped(item, unequip)
                  }
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-line text-ink-faint transition-colors hover:border-danger/50 hover:text-danger [&_svg]:h-3.5 [&_svg]:w-3.5"
                >
                  <X />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Backpack */}
      {inv.backpack.length > 0 && (
        <section className="space-y-2">
          <h4 className="flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-ink-faint">
            <BackpackIcon className="h-3.5 w-3.5" /> Backpack
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {inv.backpack.map((id, i) => {
              const it = findItem(id);
              if (!it) return null;
              return (
                <span
                  key={`${id}-${i}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-void/50 py-1 pl-2.5 pr-1 text-xs text-ink-muted"
                >
                  {it.name}
                  <button
                    type="button"
                    aria-label={`Remove ${it.name} from backpack`}
                    onClick={() => removeFromBackpack(id)}
                    className="grid h-5 w-5 place-items-center rounded-full text-ink-faint transition-colors hover:bg-danger/15 hover:text-danger [&_svg]:h-3 [&_svg]:w-3"
                  >
                    <X />
                  </button>
                </span>
              );
            })}
          </div>
        </section>
      )}

      <Divider label="Armory" />

      {/* Category browser */}
      <SegmentedControl
        value={category}
        onChange={setCategory}
        fullWidth
        aria-label="Item category"
        options={categories.map((c) => ({
          value: c,
          label: CATEGORY_LABEL[c] ?? c,
          icon: CATEGORY_ICON[c],
        }))}
      />

      {items.length === 0 ? (
        <EmptyState size="sm" title="No items in this category" />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {items.map((item) => {
            const slot = slotFor(item.itemType);
            const isEquipped = equippedSet.has(item.id);
            const isConsumable = slot === null;
            return (
              <ItemCard
                key={item.id}
                item={item}
                equipped={isEquipped}
                consumable={isConsumable}
                onToggle={() => handleToggle(item)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Unequip helper for the equipped-list X button. */
function handleToggleEquipped(
  item: WorldItem,
  unequip: ReturnType<typeof useDraftStore.getState>['unequip'],
) {
  const slot = slotFor(item.itemType);
  if (!slot) return;
  if (slot === 'accessory') unequip('accessory', item.id);
  else unequip(slot);
}

function EffectLine({ item }: { item: WorldItem }) {
  const mods = item.effects
    .filter((e) => e.type === 'Modify Stat')
    .map((e) => describeEffect(e));
  const dmg = item.damage ? `${item.damage}${item.damageType ? ` ${item.damageType}` : ''}` : null;
  const parts = [dmg, ...mods].filter(Boolean);
  if (parts.length === 0) return null;
  return (
    <p className="truncate text-xs text-ink-faint">{parts.join(' · ')}</p>
  );
}

function ItemCard({
  item,
  equipped,
  consumable,
  onToggle,
}: {
  item: WorldItem;
  equipped: boolean;
  consumable: boolean;
  onToggle: () => void;
}) {
  const statMods = item.effects.filter((e) => e.type === 'Modify Stat');

  return (
    <motion.div
      layout
      className={cn(
        'flex flex-col rounded-xl border bg-void/40 p-3 transition-colors',
        equipped ? 'border-beam/50 bg-beam/5' : 'border-line hover:border-line-strong',
      )}
    >
      <div className="flex items-start gap-2">
        <span
          className={cn(
            'mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border',
            equipped
              ? 'border-beam/40 bg-beam/10 text-beam'
              : 'border-line bg-void/60 text-ink-muted',
          )}
        >
          {ITEM_TYPE_ICON[item.itemType]}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h5 className="truncate text-sm font-medium text-ink">{item.name}</h5>
            {item.charges != null && (
              <Badge tone="arcane" size="sm">
                {item.charges}×
              </Badge>
            )}
          </div>
          {item.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">
              {item.description}
            </p>
          )}
        </div>
      </div>

      {/* Stats / effects */}
      <div className="mt-2 flex flex-wrap gap-1">
        {item.damage && (
          <Badge tone="danger" size="sm">
            {item.damage}
            {item.damageType ? ` ${item.damageType}` : ''}
          </Badge>
        )}
        {item.range && (
          <Badge tone="neutral" size="sm">
            {item.range}
          </Badge>
        )}
        {statMods.map((e) => (
          <Badge key={e.id} tone="mystic" size="sm">
            {describeEffect(e)}
          </Badge>
        ))}
      </div>

      <div className="mt-3">
        {consumable ? (
          <Button
            size="sm"
            variant="secondary"
            fullWidth
            leftIcon={<Plus />}
            onClick={onToggle}
          >
            Add to backpack
          </Button>
        ) : equipped ? (
          <Button
            size="sm"
            variant="ghost"
            fullWidth
            leftIcon={<X />}
            onClick={onToggle}
          >
            Unequip
          </Button>
        ) : (
          <Button
            size="sm"
            variant="primary"
            fullWidth
            leftIcon={<Check />}
            onClick={onToggle}
          >
            Equip
          </Button>
        )}
      </div>
    </motion.div>
  );
}
