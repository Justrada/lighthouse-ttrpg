import type { ActionType, Character, Combatant } from '@/types';
import { findItem, findNode } from '@/data/skillTree';
import { actionSlotsFor } from '@/engine';

/**
 * A single concrete choice a combatant can declare within an action slot —
 * either a bare action type (Move/Guard/Pass/Flee) or a specific ability,
 * weapon, or item. Targeting requirements are surfaced so the picker can
 * prompt for a combatant or a battle line as needed.
 */
export interface ActionOption {
  /** Stable key for selects/lists. */
  key: string;
  actionType: ActionType;
  label: string;
  /** Ability node id or world-item id, when this is a specific option. */
  actionId?: string;
  /** Resource cost summary, e.g. "3 MP". */
  cost?: string;
  /** Range band (Self / Melee / Near / Far / …). */
  range?: string;
  /** AOE descriptor, when present. */
  aoe?: string;
  /** Short description for tooltips. */
  description?: string;
  /** Whether this option needs a combatant target chosen. */
  needsTarget: boolean;
  /** Whether this option targets a battle line instead of a combatant (Move). */
  needsLine: boolean;
  /** Supportive options default to allies; offensive to enemies. */
  supportive?: boolean;
}

const ALWAYS_ACTION_TYPES: ActionType[] = ['Move', 'Chase', 'Guard', 'Pass', 'Flee'];

function abilityCost(cost?: { type: string; value: number }): string | undefined {
  if (!cost) return undefined;
  return `${cost.value} ${cost.type}`;
}

/** Heuristic: does this usable only help allies (healing / buffs / Self range)? */
function isSupportive(range?: string, effects?: { type?: string; modification?: unknown; statToModify?: string }[]): boolean {
  if (range === 'Self') return true;
  return (effects ?? []).some(
    (e) =>
      e.type === 'Apply Healing' ||
      e.type === 'Give Advantage/Disadvantage' ||
      e.type === 'Substitute Cost' ||
      (e.type === 'Modify Stat' &&
        (String(e.modification).startsWith('+') || e.statToModify === 'HP')),
  );
}

/**
 * Build the full list of action options available to a combatant for one slot,
 * derived from its source character's learned abilities, equipped weapon, and
 * backpack consumables. When no character is available (e.g. an ad-hoc NPC),
 * only the universal actions are offered.
 */
export function buildActionOptions(character: Character | null | undefined): ActionOption[] {
  const options: ActionOption[] = [];

  // Universal verbs.
  options.push({
    key: 'move',
    actionType: 'Move',
    label: 'Move',
    needsTarget: false,
    needsLine: true,
    description: 'Shift toward or away from the enemy line.',
  });
  options.push({
    key: 'chase',
    actionType: 'Chase',
    label: 'Chase',
    needsTarget: true,
    needsLine: false,
    supportive: false,
    description: 'Close in on a chosen target — move to the nearest open hex beside it.',
  });
  options.push({
    key: 'guard',
    actionType: 'Guard',
    label: 'Guard',
    needsTarget: false,
    needsLine: false,
    description: 'Brace — raise defenses until your next turn.',
  });

  if (character) {
    // Weapon attack — or a basic unarmed strike when nothing is equipped, so
    // weaponless combatants (natural-weapon beasts, the disarmed) can still
    // attack. The engine resolves actionId 'unarmed-strike' as a 1d4 melee hit.
    const weaponId = character.inventory?.weapon;
    const weapon = weaponId ? findItem(weaponId) : undefined;
    if (weapon) {
      const usesAmmo = typeof weapon.clipSize === 'number' && weapon.clipSize > 0;
      const dmgText = weapon.damage ? `${weapon.damage} ${weapon.damageType ?? ''}`.trim() : weapon.description;
      const ammoText = usesAmmo
        ? `${weapon.clipSize}/clip${(weapon.shots ?? 1) > 1 ? `, ${weapon.shots} shots` : ''}`
        : '';
      options.push({
        key: `weapon:${weapon.id}`,
        actionType: 'Weapon Attack',
        label: weapon.name,
        actionId: weapon.id,
        range: weapon.range ?? 'Melee',
        description: [dmgText, ammoText].filter(Boolean).join(' · '),
        needsTarget: true,
        needsLine: false,
        supportive: false,
      });
      // Reload is offered whenever the weapon uses ammo; the engine no-ops if the
      // clip is already full, and reports when the reserve is dry.
      if (usesAmmo) {
        options.push({
          key: `reload:${weapon.id}`,
          actionType: 'Reload',
          label: `Reload ${weapon.name}`,
          actionId: weapon.id,
          description: `Refill the clip (${weapon.clipSize} rounds).`,
          needsTarget: false,
          needsLine: false,
        });
      }
    } else {
      options.push({
        key: 'weapon:unarmed',
        actionType: 'Weapon Attack',
        label: 'Unarmed Strike',
        actionId: 'unarmed-strike',
        range: 'Melee',
        description: '1d4 melee',
        needsTarget: true,
        needsLine: false,
        supportive: false,
      });
    }

    // Combat-usable abilities from the learned skill tree.
    for (const id of character.learnedSkills ?? []) {
      const node = findNode(id);
      const linked = node?.linkedItem;
      if (!linked || !linked.combatUse) continue;
      const supportive = isSupportive(linked.range, linked.effects);
      options.push({
        key: `ability:${id}`,
        actionType: 'Use Ability',
        label: linked.name,
        actionId: id,
        cost: abilityCost(linked.cost),
        range: linked.range,
        aoe: linked.aoe,
        description: linked.description,
        needsTarget: linked.range !== 'Self',
        needsLine: false,
        supportive,
      });
    }

    // Consumable items in the backpack.
    for (const itemId of character.inventory?.backpack ?? []) {
      const item = findItem(itemId);
      if (!item || item.itemType !== 'Consumable') continue;
      const supportive = isSupportive(item.range, item.effects);
      // Any consumable that carries an effect can be aimed at a combatant (ally or
      // foe — cross-target is intended). Catalog items carry no explicit range
      // band, so derive "needs a target" from having effects, not from range. This
      // covers buffs like Antitoxin (Give Advantage) that aren't damage or heals.
      const needsTarget = item.range !== 'Self' && ((item.effects?.length ?? 0) > 0 || item.range != null);
      options.push({
        key: `item:${itemId}`,
        actionType: 'Use Item',
        label: item.name,
        actionId: itemId,
        range: item.range,
        description: item.description,
        needsTarget,
        needsLine: false,
        supportive,
      });
    }

    // Change Equipment — swap to another owned weapon not currently wielded.
    // Candidates: the equipped slot (which the UI may have already overridden to
    // the swapped weapon) plus any weapons stowed in the backpack.
    const currentWeaponId = character.inventory?.weapon ?? null;
    const weaponCandidates = new Set<string>();
    if (currentWeaponId) weaponCandidates.add(currentWeaponId);
    for (const itemId of character.inventory?.backpack ?? []) {
      const item = findItem(itemId);
      if (item?.itemType === 'Weapon') weaponCandidates.add(itemId);
    }
    for (const weaponId of weaponCandidates) {
      if (weaponId === currentWeaponId) continue; // already wielding it
      const weapon = findItem(weaponId);
      if (!weapon || weapon.itemType !== 'Weapon') continue;
      options.push({
        key: `equip:${weaponId}`,
        actionType: 'Change Equipment',
        label: `Equip: ${weapon.name}`,
        actionId: weaponId,
        description: weapon.damage
          ? `${weapon.damage} ${weapon.damageType ?? ''}`.trim()
          : weapon.description,
        needsTarget: false,
        needsLine: false,
      });
    }
  }

  // Pass / Flee at the end — quiet fallbacks.
  options.push({
    key: 'flee',
    actionType: 'Flee',
    label: 'Flee',
    needsTarget: true,
    needsLine: false,
    supportive: false,
    description: 'Bolt to the open hex furthest from a chosen foe.',
  });
  options.push({
    key: 'pass',
    actionType: 'Pass',
    label: 'Pass',
    needsTarget: false,
    needsLine: false,
    description: 'Hold your action this round.',
  });

  return options;
}

/**
 * Number of action slots a combatant gets this round: the derived base plus any
 * active timed "Actions per Round" effects (Rage, Hobble) when a combatant is
 * supplied. Defaults to 3 with no character.
 */
export function actionSlotCount(
  character: Character | null | undefined,
  combatant?: Combatant | null,
): number {
  return actionSlotsFor(character, combatant);
}

export { ALWAYS_ACTION_TYPES };
export type { Combatant };
