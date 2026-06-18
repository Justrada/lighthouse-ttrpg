/**
 * LIGHTHOUSE rules engine — pure, deterministic game logic.
 *
 * Every function here takes plain state and returns new state and/or descriptive
 * results; there is no React, DOM, network, or timer code. Randomness is always
 * injectable via an optional `rng: () => number` (default `Math.random`) so the
 * engine can be driven deterministically in tests and replays.
 */

// Dice
export {
  parseDiceNotation,
  roll,
  rollD20,
  rollDamage,
  combineAdvantage,
  type Rng,
  type ParsedDice,
} from './dice';

// Stats & skill budget
export {
  calculateDerivedStats,
  resourceMaxes,
  getStatCost,
  getSkillTiers,
  getSkillCost,
  calculateSkillBudget,
} from './stats';

// Skill tree
export {
  isLearned,
  canLearnSkill,
  getReachableNodes,
  applyLearn,
  applyUnlearn,
  type LearnCheck,
} from './skills';

// Quick Build — auto-allocator
export {
  autoBuildCharacter,
  type Archetype,
  type AutoBuildOptions,
} from './autobuild';

// Status effects & durations
export {
  createStatusEffect,
  tickDurations,
  applyStatModString,
  rollAmount,
  nextEffectId,
  type RuntimeEffect,
} from './effects';

// Combat
export {
  createCombatant,
  isTargetInRange,
  getAOETargets,
  rollInitiativeForRound,
  resolveAction,
  processEndOfRound,
  resolveRound,
  type CreateCombatantOptions,
  type ResolveResult,
  type ResolveOptions,
  type RoundStep,
} from './combat';
