import { describe, it, expect } from 'vitest';
import { buildActionOptions } from './actionOptions';
import { autoBuildCharacter } from '@/engine';

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
