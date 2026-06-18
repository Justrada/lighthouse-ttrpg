import type { Character, SkillPointBudget } from '@/types';
import { prerequisitesOf, skillEdges, skillNodes } from '@/data/skillTree';
import { calculateSkillBudget, getSkillCost } from './stats';

/** Whether `nodeId` is in the character's learned set. */
export function isLearned(character: Character, nodeId: string): boolean {
  return character.learnedSkills.includes(nodeId);
}

/** A node is adjacent to the center if `center-0` is one of its prerequisites. */
function isAdjacentToCenter(nodeId: string): boolean {
  return prerequisitesOf(nodeId).includes('center-0');
}

/** Whether at least one prerequisite of `nodeId` is already learned. */
function hasLearnedPrerequisite(character: Character, nodeId: string): boolean {
  return prerequisitesOf(nodeId).some((pid) => isLearned(character, pid));
}

/** Result of a learnability check: `ok`, plus a human reason when it is not. */
export interface LearnCheck {
  ok: boolean;
  reason?: string;
}

/**
 * Determine whether a character can learn `nodeId` given a precomputed budget.
 *
 * Rules (ported from the original tree gating):
 * - The node must exist and not already be learned.
 * - It must be reachable: a prerequisite is learned, OR it is adjacent to the
 *   center (the center itself is always considered reachable).
 * - The character must have at least `getSkillCost(nodeId)` available points.
 */
export function canLearnSkill(
  character: Character,
  nodeId: string,
  budget: SkillPointBudget = calculateSkillBudget(character),
): LearnCheck {
  const node = skillNodes.find((n) => n.id === nodeId);
  if (!node) return { ok: false, reason: 'Unknown skill node.' };
  if (node.isCenter) return { ok: false, reason: 'The center is already unlocked.' };
  if (isLearned(character, nodeId)) return { ok: false, reason: 'Already learned.' };

  const reachable =
    isAdjacentToCenter(nodeId) || hasLearnedPrerequisite(character, nodeId);
  if (!reachable) {
    return { ok: false, reason: 'Requires a connected, learned skill first.' };
  }

  const cost = getSkillCost(nodeId);
  if (budget.available < cost) {
    return {
      ok: false,
      reason: `Not enough skill points (needs ${cost}, has ${budget.available}).`,
    };
  }

  return { ok: true };
}

/**
 * Every node the character could learn right now (passes {@link canLearnSkill}).
 * Useful for highlighting the frontier of the tree in the UI.
 */
export function getReachableNodes(character: Character): string[] {
  const budget = calculateSkillBudget(character);
  return skillNodes
    .filter((n) => canLearnSkill(character, n.id, budget).ok)
    .map((n) => n.id);
}

/**
 * Learn a node, returning a new Character. The center (`center-0`) is implicitly
 * learned and is added to the set if missing. No-ops (returns the same learned
 * set, in a fresh object) if the node is already learned. This function does not
 * itself enforce affordability — call {@link canLearnSkill} first when gating.
 */
export function applyLearn(character: Character, nodeId: string): Character {
  if (isLearned(character, nodeId)) {
    return { ...character, learnedSkills: [...character.learnedSkills] };
  }
  const learnedSkills = [...character.learnedSkills];
  if (!learnedSkills.includes('center-0')) learnedSkills.push('center-0');
  learnedSkills.push(nodeId);
  return { ...character, learnedSkills };
}

/**
 * Set of learned nodes that remain reachable from `center-0` using only edges
 * whose source is also in the set. Anything not in this set is "orphaned".
 */
function reachableLearnedSet(learned: Set<string>): Set<string> {
  const reachable = new Set<string>();
  if (!learned.has('center-0')) return reachable;

  const queue: string[] = ['center-0'];
  reachable.add('center-0');
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of skillEdges) {
      if (edge.sourceId !== current) continue;
      const next = edge.targetId;
      if (learned.has(next) && !reachable.has(next)) {
        reachable.add(next);
        queue.push(next);
      }
    }
  }
  return reachable;
}

/**
 * Unlearn a node, returning a new Character. The center can never be unlearned.
 *
 * After removing the node, any learned descendants that are no longer reachable
 * from the center (their only path ran through the removed node) are also
 * unlearned — preventing orphaned, unreachable skills. Player skill-choices for
 * removed nodes are cleared too.
 */
export function applyUnlearn(character: Character, nodeId: string): Character {
  if (nodeId === 'center-0') {
    return { ...character, learnedSkills: [...character.learnedSkills] };
  }
  if (!isLearned(character, nodeId)) {
    return { ...character, learnedSkills: [...character.learnedSkills] };
  }

  const remaining = new Set(character.learnedSkills);
  remaining.delete(nodeId);

  // Keep only nodes still reachable from the center (plus the center itself).
  const reachable = reachableLearnedSet(remaining);
  const finalLearned = character.learnedSkills.filter(
    (id) => id !== nodeId && (id === 'center-0' || reachable.has(id)),
  );

  const removed = new Set(
    character.learnedSkills.filter((id) => !finalLearned.includes(id)),
  );

  let skillChoices = character.skillChoices;
  if (skillChoices) {
    const next: NonNullable<Character['skillChoices']> = {};
    let changed = false;
    for (const [key, value] of Object.entries(skillChoices)) {
      if (removed.has(key)) {
        changed = true;
        continue;
      }
      next[key] = value;
    }
    if (changed) skillChoices = next;
  }

  return { ...character, learnedSkills: finalLearned, skillChoices };
}
