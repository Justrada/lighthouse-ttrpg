import type { SkillEffect, LinkedItem } from '@/types';

/** Tokens the data uses to defer a stat/resource choice to the player. */
export const PC_CHOOSE_CORE_SKILL = 'PC choose core skill';
export const PC_CHOOSE_RESOURCE = 'PC choose resource';

export function isCoreSkillChoice(effect: SkillEffect): boolean {
  return effect.statToModify === PC_CHOOSE_CORE_SKILL;
}

export function isResourceChoice(effect: SkillEffect): boolean {
  return effect.statToModify === PC_CHOOSE_RESOURCE;
}

export function isChoiceEffect(effect: SkillEffect): boolean {
  return isCoreSkillChoice(effect) || isResourceChoice(effect);
}

/** Player-selectable options for the two choice tokens. */
export const CORE_SKILL_CHOICES = [
  'Physical',
  'Stealth',
  'Lore',
  'Awareness',
  'Influence',
  'Survival',
] as const;

export const RESOURCE_CHOICES = ['HP', 'MP', 'SP'] as const;

function durationText(effect: SkillEffect): string {
  if (!effect.durationType || effect.durationType === 'Instant') return '';
  if (effect.durationType === 'Permanent') return ' (permanent)';
  if (effect.durationValue) return ` for ${effect.durationValue} ${effect.durationType.toLowerCase()}`;
  return ` (${String(effect.durationType).toLowerCase()})`;
}

/**
 * Render a single effect as a concise, human-readable line. Mirrors the
 * conditional field reads documented on {@link SkillEffect}.
 */
export function describeEffect(effect: SkillEffect, chosen?: string): string {
  const type = String(effect.type);

  switch (type) {
    case 'Apply Damage': {
      const parts: string[] = [];
      if (effect.useWeaponDamage) {
        const mult = effect.weaponMultiplier ?? 1;
        parts.push(mult === 1 ? 'weapon damage' : `${mult}× weapon damage`);
      }
      if (effect.additionalDamage) parts.push(String(effect.additionalDamage));
      let line = `Deal ${parts.join(' + ') || 'damage'}`;
      if (effect.damageType) line += ` ${String(effect.damageType).toLowerCase()} damage`;
      else if (parts.length) line += ' damage';
      if (effect.savingThrowEnabled && effect.savingThrowSkill) {
        line += ` — ${effect.savingThrowSkill} save`;
        if (effect.savingThrowDC != null) line += ` (DC ${effect.savingThrowDC})`;
        if (effect.saveForHalf) line += ', half on success';
      }
      if (effect.drainResourceEnabled && effect.drainResource) {
        line += `, drains ${effect.drainResource}`;
      }
      return line;
    }

    case 'Apply Healing':
      return `Restore ${effect.modification ?? ''} ${effect.statToModify ?? 'HP'}`.trim();

    case 'Modify Stat': {
      const target =
        chosen ??
        (isCoreSkillChoice(effect)
          ? 'a chosen core skill'
          : isResourceChoice(effect)
            ? 'a chosen resource'
            : effect.statToModify ?? 'a stat');
      const amt = effect.modification != null ? String(effect.modification) : '';
      const sign = amt && !amt.startsWith('+') && !amt.startsWith('-') ? '+' : '';
      return `${sign}${amt} ${target}${durationText(effect)}`.trim();
    }

    case 'Stun':
      return `Stun the target${durationText(effect)}`;

    case 'Give Advantage/Disadvantage': {
      const mode = effect.advantageType ?? 'Advantage';
      const on = effect.appliesTo ? ` on ${effect.appliesTo}` : '';
      return `Grant ${mode}${on}${durationText(effect)}`;
    }

    case 'Move Target': {
      const dir = effect.moveDirection ?? 'Push';
      const dist = effect.moveDistance != null ? ` ${effect.moveDistance}` : '';
      return `${dir} the target${dist}`;
    }

    case 'Substitute Cost':
      return `Pay ${effect.substituteTo ?? '?'} in place of ${effect.substituteFrom ?? '?'}`;

    default:
      return type;
  }
}

/** Compact one-line summary for a linked item's cost. */
export function costText(item: LinkedItem): string | null {
  if (!item.cost) return null;
  return `${item.cost.value} ${item.cost.type}`;
}
