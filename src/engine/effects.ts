import type { ActiveStatusEffect, Combatant, SkillEffect, Team } from '@/types';

/**
 * The runtime shape of an effect living on a combatant during combat.
 *
 * The persisted {@link ActiveStatusEffect} contract is a subset of this; the
 * original engine stored a number of extra working fields directly on the
 * effect object (duration counters, the rolled value/damage, save params,
 * source team). We model them explicitly here rather than leaning on `any`.
 */
export interface RuntimeEffect extends ActiveStatusEffect {
  /** Working duration counter. Counts down in {@link tickDurations}. */
  durationValue?: number;
  /** Unit the duration is measured in. Defaults to 'Rounds'. */
  durationUnit?: 'Rounds' | 'Actions' | 'Permanent';
  /** Team of the source combatant — used to decide which effects survive KO. */
  sourceTeam?: Team | null;
  /** Cached rolled damage for a damage-over-time effect (consistent per tick). */
  rolledDamage?: number;
  /** Cached rolled value for a stat-modifying effect. */
  rolledValue?: number;
  /** Whether a successful "Halve" save reduced this effect. */
  isHalved?: boolean;

  // --- raw fields carried from the source SkillEffect (real JSON names) ---
  savingThrowEnabled?: boolean;
  saveSkill?: string;
  saveDC?: number;
  saveOutcome?: string;
  additionalDamage?: string;
  modification?: string;
  statToModify?: string;
  advDis?: 'Advantage' | 'Disadvantage';
  targetSkill?: string;
  direction?: string;
  rows?: number;
  resourceGained?: string;
  resourceDrained?: string;
}

let _effectSeq = 0;

/** Generate a stable, collision-resistant effect id without touching the clock. */
export function nextEffectId(prefix = 'effect'): string {
  _effectSeq += 1;
  return `${prefix}_${_effectSeq}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Visual tone for a status badge, inferred from its type. */
function toneFor(type: string): ActiveStatusEffect['tone'] {
  switch (type) {
    case 'Stunned':
    case 'Apply Damage':
      return 'debuff';
    case 'Guarding':
      return 'buff';
    default:
      return 'neutral';
  }
}

/**
 * Build a {@link RuntimeEffect} from a source {@link SkillEffect}, carrying its
 * duration, saving-throw parameters, and source identity. This is the pure-style
 * analogue of the original `createDurationEffect`.
 */
export function createStatusEffect(
  effect: SkillEffect,
  opts: {
    sourceId?: string;
    sourceName?: string;
    sourceTeam?: Team | null;
    /** Override the effect type label (e.g. normalize 'Stun' → 'Stunned'). */
    typeOverride?: string;
    label?: string;
  } = {},
): RuntimeEffect {
  const type = opts.typeOverride ?? String(effect.type);
  const durationUnit =
    (effect.durationUnit as RuntimeEffect['durationUnit']) ??
    (effect.durationType as RuntimeEffect['durationUnit']) ??
    'Rounds';

  return {
    id: nextEffectId(),
    type,
    label: opts.label ?? type,
    sourceId: opts.sourceId,
    sourceName: opts.sourceName,
    sourceTeam: opts.sourceTeam ?? null,
    durationType: durationUnit,
    durationValue:
      typeof effect.durationValue === 'number' ? effect.durationValue : undefined,
    durationUnit,
    tone: toneFor(type),
    savingThrowEnabled: Boolean(effect.savingThrowEnabled),
    saveSkill: typeof effect.saveSkill === 'string' ? effect.saveSkill : undefined,
    saveDC: typeof effect.saveDC === 'number' ? effect.saveDC : undefined,
    saveOutcome: typeof effect.saveOutcome === 'string' ? effect.saveOutcome : undefined,
    isHalved: Boolean(effect.isHalved),
    additionalDamage:
      typeof effect.additionalDamage === 'string' ? effect.additionalDamage : undefined,
    modification:
      typeof effect.modification === 'string' ? effect.modification : undefined,
    statToModify:
      typeof effect.statToModify === 'string' ? effect.statToModify : undefined,
    advDis: effect.advDis as RuntimeEffect['advDis'],
    targetSkill: typeof effect.targetSkill === 'string' ? effect.targetSkill : undefined,
    direction: typeof effect.direction === 'string' ? effect.direction : undefined,
    rows: typeof effect.rows === 'number' ? effect.rows : undefined,
    resourceGained:
      typeof effect.resourceGained === 'string' ? effect.resourceGained : undefined,
    resourceDrained:
      typeof effect.resourceDrained === 'string' ? effect.resourceDrained : undefined,
  };
}

/**
 * Decrement timed durations on a combatant's effects and drop expired ones,
 * returning a *new* effects array (does not mutate). Effects with `Permanent`
 * duration or no numeric `durationValue` are left untouched.
 *
 * This mirrors the simple end-of-turn/round ticking in the original
 * `processDurationEffects`, minus the per-effect re-saving (which the engine's
 * combat resolution handles where it applies).
 *
 * Counts down at end of round for BOTH `Rounds` and `Actions` units (and the
 * unspecified default). The single exception is `Stunned`, which is ticked on
 * the per-action path during resolution and is left untouched here so it doesn't
 * decrement twice. `Permanent` effects never expire. (Previously only `Rounds`
 * counted down, so every non-Stun `Actions`-unit effect — most DoTs and combat
 * buffs/debuffs — never expired and ticked forever.)
 */
export function tickDurations(combatant: Combatant): ActiveStatusEffect[] {
  const effects = (combatant.statusEffects ?? []) as RuntimeEffect[];
  const next: RuntimeEffect[] = [];

  for (const effect of effects) {
    const unit = effect.durationUnit ?? effect.durationType;
    // 'Permanent' never expires; 'Stunned' is ticked per-action during
    // resolution; effects with no numeric duration are left as-is.
    if (unit === 'Permanent' || effect.type === 'Stunned' || typeof effect.durationValue !== 'number') {
      next.push(effect);
      continue;
    }
    const remaining = effect.durationValue - 1;
    if (remaining > 0) {
      next.push({ ...effect, durationValue: remaining });
    }
    // else: expired — drop it.
  }

  return next;
}
