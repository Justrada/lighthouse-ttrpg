import { describe, it, expect, afterEach } from 'vitest';
import { buildActionOptions } from './actionOptions';
import { autoBuildCharacter } from '@/engine';
import { setActiveCatalog, buildActiveCatalog, resetActiveCatalog } from '@/data/skillTree';
import type { WorldItem } from '@/types';

describe('buildActionOptions — consumable targeting', () => {
  it('a thrown damage consumable is a targeted, offensive option', () => {
    const c = autoBuildCharacter({ name: 'T', level: 3, archetype: 'skill' });
    c.inventory.backpack = ['inv_x_alchemists_fire'];
    const fire = buildActionOptions(c).find(
      (o) => o.actionType === 'Use Item' && o.actionId === 'inv_x_alchemists_fire',
    );
    expect(fire).toBeTruthy();
    expect(fire!.needsTarget).toBe(true);
    expect(fire!.supportive).toBe(false);
  });

  it('a healing consumable is a targeted, supportive option', () => {
    const c = autoBuildCharacter({ name: 'H', level: 3, archetype: 'magic' });
    c.inventory.backpack = ['inv_x_superior_healing'];
    const pot = buildActionOptions(c).find(
      (o) => o.actionType === 'Use Item' && o.actionId === 'inv_x_superior_healing',
    );
    expect(pot).toBeTruthy();
    expect(pot!.needsTarget).toBe(true);
    expect(pot!.supportive).toBe(true);
  });

  it('offers an Unarmed Strike for a weaponless combatant', () => {
    const c = autoBuildCharacter({ name: 'Beast', level: 1, archetype: 'balanced' });
    c.inventory.weapon = null;
    const opts = buildActionOptions(c);
    const unarmed = opts.find((o) => o.actionType === 'Weapon Attack');
    expect(unarmed).toBeTruthy();
    expect(unarmed!.label).toBe('Unarmed Strike');
    expect(unarmed!.actionId).toBe('unarmed-strike');
    expect(unarmed!.needsTarget).toBe(true);
  });

  it('a buff consumable (Antitoxin / Give Advantage) is targetable and supportive', () => {
    const c = autoBuildCharacter({ name: 'A', level: 3, archetype: 'balanced' });
    c.inventory.backpack = ['inv_x_antitoxin'];
    const anti = buildActionOptions(c).find(
      (o) => o.actionType === 'Use Item' && o.actionId === 'inv_x_antitoxin',
    );
    expect(anti).toBeTruthy();
    expect(anti!.needsTarget).toBe(true); // can be administered to an ally
    expect(anti!.supportive).toBe(true);
  });
});

describe('buildActionOptions — weapon ammo', () => {
  const gun: WorldItem = {
    id: 'gun', type: 'Inventory Item', name: 'Blaster', description: '', itemType: 'Weapon',
    range: 'Far', damage: '2d6', clipSize: 4, shots: 2,
    effects: [{ id: 'e', type: 'Apply Damage', useWeaponDamage: true, additionalDamage: '2d6' }],
  } as WorldItem;

  afterEach(() => resetActiveCatalog());

  it('offers a Reload action and shows clip/shots on an ammo weapon', () => {
    setActiveCatalog(buildActiveCatalog({ nodes: [], edges: [], worldItems: { weapons: [gun] } }, 'extend'));
    const c = autoBuildCharacter({ name: 'G', level: 3, archetype: 'balanced' });
    c.inventory.weapon = 'gun';
    const opts = buildActionOptions(c);

    const reload = opts.find((o) => o.actionType === 'Reload');
    expect(reload).toBeTruthy();
    expect(reload!.actionId).toBe('gun');
    expect(reload!.needsTarget).toBe(false);

    const attack = opts.find((o) => o.actionType === 'Weapon Attack' && o.actionId === 'gun');
    expect(attack!.description).toMatch(/4\/clip/);
    expect(attack!.description).toMatch(/2 shots/);
  });

  it('does NOT offer Reload for a no-ammo weapon', () => {
    const c = autoBuildCharacter({ name: 'M', level: 3, archetype: 'balanced' }); // base melee weapon, no clip
    expect(buildActionOptions(c).some((o) => o.actionType === 'Reload')).toBe(false);
  });
});
