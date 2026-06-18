import type { ActionType, Character, Combatant } from '@/types';
import { findItem, findNode } from '@/data/skillTree';
import { calculateDerivedStats } from '@/engine';

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

const ALWAYS_ACTION_TYPES: ActionType[] = ['Move', 'Guard', 'Pass', 'Flee'];

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
    key: 'guard',
    actionType: 'Guard',
    label: 'Guard',
    needsTarget: false,
    needsLine: false,
    description: 'Brace — raise defenses until your next turn.',
  });

  if (character) {
    // Weapon attack.
    const weaponId = character.inventory?.weapon;
    if (weaponId) {
      const weapon = findItem(weaponId);
      if (weapon) {
        options.push({
          key: `weapon:${weapon.id}`,
          actionType: 'Weapon Attack',
          label: weapon.name,
          actionId: weapon.id,
          range: weapon.range ?? 'Melee',
          description: weapon.damage ? `${weapon.damage} ${weapon.damageType ?? ''}`.trim() : weapon.description,
          needsTarget: true,
          needsLine: false,
          supportive: false,
        });
      }
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
      options.push({
        key: `item:${itemId}`,
        actionType: 'Use Item',
        label: item.name,
        actionId: itemId,
        range: item.range,
        description: item.description,
        needsTarget: item.range != null && item.range !== 'Self',
        needsLine: false,
        supportive,
      });
    }
  }

  // Pass / Flee at the end — quiet fallbacks.
  options.push({
    key: 'flee',
    actionType: 'Flee',
    label: 'Flee',
    needsTarget: false,
    needsLine: false,
    description: 'Attempt to disengage and escape the battle.',
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

/** Number of action slots a combatant gets this round (derived; defaults to 3). */
export function actionSlotCount(character: Character | null | undefined): number {
  if (!character) return 3;
  return calculateDerivedStats(character).actionsPerRound;
}

export { ALWAYS_ACTION_TYPES };
export type { Combatant };
