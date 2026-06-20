import type {
  Character,
  CoreStats,
  DerivedStats,
  SkillEffect,
  SkillPointBudget,
} from '@/types';
import { findItem, findNode, getActiveEdges, getCatalogVersion } from '@/data/skillTree';

/** Zeroed bonus accumulator covering every derived stat plus the shield bucket. */
interface StatBonuses {
  hp: number;
  mp: number;
  sp: number;
  ac: number;
  shield: number;
  initiative: number;
  physical: number;
  stealth: number;
  lore: number;
  awareness: number;
  influence: number;
  survival: number;
  actionsPerRound: number;
}

function emptyBonuses(): StatBonuses {
  return {
    hp: 0,
    mp: 0,
    sp: 0,
    ac: 0,
    shield: 0,
    initiative: 0,
    physical: 0,
    stealth: 0,
    lore: 0,
    awareness: 0,
    influence: 0,
    survival: 0,
    actionsPerRound: 0,
  };
}

/**
 * Map a `statToModify` label (case-insensitive) onto a bonus bucket key, or
 * `null` if it isn't a recognised stat. Mirrors the original switch, including
 * "Max HP"→hp aliases and "Actions Per Round"→actionsPerRound.
 */
function statBucket(statToModify: string): keyof StatBonuses | null {
  switch (statToModify.toUpperCase()) {
    case 'HP':
    case 'MAX HP':
      return 'hp';
    case 'MP':
    case 'MAX MP':
      return 'mp';
    case 'SP':
    case 'MAX SP':
      return 'sp';
    case 'AC':
      return 'ac';
    case 'INITIATIVE':
      return 'initiative';
    case 'PHYSICAL':
      return 'physical';
    case 'STEALTH':
      return 'stealth';
    case 'LORE':
      return 'lore';
    case 'AWARENESS':
      return 'awareness';
    case 'INFLUENCE':
      return 'influence';
    case 'SURVIVAL':
      return 'survival';
    case 'ACTIONS PER ROUND':
      return 'actionsPerRound';
    default:
      return null;
  }
}

/**
 * Resolve the effective `statToModify` for an effect, expanding the two
 * player-choice tokens ("PC choose core skill" / "PC choose resource") by
 * reading `character.skillChoices[nodeId]` for the matching `effectId`.
 * Returns `null` when a choice token has no recorded choice yet.
 */
function resolveStatTarget(
  character: Character,
  nodeId: string,
  effect: SkillEffect,
): string | null {
  const stat = effect.statToModify;
  if (!stat) return null;
  if (stat === 'PC choose core skill' || stat === 'PC choose resource') {
    const choices = character.skillChoices?.[nodeId];
    const choice = Array.isArray(choices)
      ? choices.find((c) => c.effectId === effect.id)?.choice
      : undefined;
    return choice ?? null;
  }
  return stat;
}

/**
 * Apply every "Modify Stat" effect carried by a learned Enhancement node onto
 * the bonus accumulator. Player-choice effects are resolved per character.
 */
function applyEnhancementBonuses(character: Character, bonuses: StatBonuses): void {
  for (const skillId of character.learnedSkills ?? []) {
    const node = findNode(skillId);
    const linked = node?.linkedItem;
    if (!linked || linked.type !== 'Enhancement') continue;

    for (const effect of linked.effects) {
      if (effect.type !== 'Modify Stat') continue;
      const value = parseInt(String(effect.modification), 10);
      if (Number.isNaN(value)) continue;

      const target = resolveStatTarget(character, skillId, effect);
      if (!target) continue;

      const bucket = statBucket(target);
      if (bucket) bonuses[bucket] += value;
    }
  }
}

/**
 * Apply "Modify Stat" effects from equipped items (armor, weapon, shield,
 * accessories). A shield's AC modifier is routed to the separate `shield`
 * bucket so it can be displayed apart from base AC, exactly as in the original.
 */
function applyItemBonuses(character: Character, bonuses: StatBonuses): void {
  const inv = character.inventory;
  if (!inv) return;

  const equippedIds = [inv.armor, inv.weapon, inv.shield, ...(inv.accessories ?? [])].filter(
    (id): id is string => id !== null && id !== undefined,
  );

  for (const itemId of equippedIds) {
    const item = findItem(itemId);
    if (!item?.effects) continue;

    for (const effect of item.effects) {
      if (effect.type !== 'Modify Stat') continue;
      const value = parseInt(String(effect.modification), 10);
      if (Number.isNaN(value)) continue;
      if (!effect.statToModify) continue;

      if (item.itemType === 'Shield' && effect.statToModify.toUpperCase() === 'AC') {
        bonuses.shield += value;
        continue;
      }

      const bucket = statBucket(effect.statToModify);
      if (bucket) bonuses[bucket] += value;
    }
  }
}

const DEFAULT_DERIVED: DerivedStats = {
  hp: 0,
  mp: 0,
  sp: 0,
  ac: 0,
  shield: 0,
  initiative: 0,
  physical: 0,
  stealth: 0,
  lore: 0,
  awareness: 0,
  influence: 0,
  survival: 0,
  actionsPerRound: 3,
};

/**
 * Compute a character's derived stats from core stats plus all learned
 * Enhancement and equipped-item bonuses. Formulas are ported verbatim from the
 * original `calculateDerivedStats`:
 *
 * - hp = max(10, 5*body) + bonus
 * - mp = 5 + bonus, sp = 5 + bonus
 * - ac = 10 + max(0, body-4) + bonusAc + bonusShield
 * - initiative = bonus
 * - skills derive from core-stat sums (see body), each plus its bonus
 * - actionsPerRound = max(1, 3 + bonus)
 */
export function calculateDerivedStats(character: Character): DerivedStats {
  if (!character || !character.coreStats) {
    return { ...DEFAULT_DERIVED };
  }

  const { mind, body, soul } = character.coreStats;
  const b = emptyBonuses();
  applyEnhancementBonuses(character, b);
  applyItemBonuses(character, b);

  return {
    hp: Math.max(10, 5 * body) + b.hp,
    mp: 5 + b.mp,
    sp: 5 + b.sp,
    ac: 10 + Math.max(0, body - 4) + b.ac + b.shield,
    shield: b.shield,
    initiative: 0 + b.initiative,
    physical: body - 4 + b.physical,
    stealth: body + mind - 8 + b.stealth,
    lore: mind - 4 + b.lore,
    awareness: soul + body - 8 + b.awareness,
    influence: soul - 4 + b.influence,
    survival: soul + mind - 8 + b.survival,
    actionsPerRound: Math.max(1, 3 + b.actionsPerRound),
  };
}

/** Convenience: the maximum HP/MP/SP a character can have, from derived stats. */
export function resourceMaxes(character: Character): {
  hp: number;
  mp: number;
  sp: number;
} {
  const d = calculateDerivedStats(character);
  return { hp: d.hp, mp: d.mp, sp: d.sp };
}

/**
 * Cost (in skill points) to raise a core stat *to* `currentValue + 1`, given the
 * value you currently have. Ported from `getStatCost`.
 */
export function getStatCost(currentValue: number): number {
  if (currentValue < 6) return 1;
  if (currentValue < 8) return 2;
  if (currentValue < 10) return 3;
  return Math.floor(currentValue / 2) + 1;
}

let _tierCache: Record<string, number> | null = null;
let _tierCacheVersion = -1;

/**
 * BFS tier of every node from `center-0` over the directed edge graph
 * (sourceId → targetId). The center is tier 0; each hop increments the tier.
 * Memoized — the skill graph is static data.
 */
export function getSkillTiers(): Record<string, number> {
  // Keyed by catalog version so activating a custom System (different edges)
  // rebuilds the tiers instead of serving stale base-tree costs.
  const version = getCatalogVersion();
  if (_tierCache && _tierCacheVersion === version) return _tierCache;

  const tiers: Record<string, number> = {};
  const processed = new Set<string>();
  const queue: Array<{ nodeId: string; tier: number }> = [
    { nodeId: 'center-0', tier: 0 },
  ];

  while (queue.length > 0) {
    const { nodeId, tier } = queue.shift()!;
    if (processed.has(nodeId)) continue;
    processed.add(nodeId);
    tiers[nodeId] = tier;

    for (const edge of getActiveEdges()) {
      if (edge.sourceId === nodeId) {
        queue.push({ nodeId: edge.targetId, tier: tier + 1 });
      }
    }
  }

  _tierCache = tiers;
  _tierCacheVersion = version;
  return tiers;
}

/** Skill-point cost of learning a node, scaling by its tier. Ported from `getSkillCost`. */
export function getSkillCost(nodeId: string): number {
  const tier = getSkillTiers()[nodeId] ?? 0;
  if (tier <= 2) return 1;
  if (tier <= 4) return 2;
  if (tier <= 6) return 3;
  return 4;
}

/** Sum of incremental stat costs for raising a core stat from 0 to `value`. */
function pointsSpentOnStat(value: number): number {
  let total = 0;
  for (let i = 1; i <= value; i++) {
    total += getStatCost(i - 1);
  }
  return total;
}

/**
 * Compute the full skill-point budget for a character. Ported from
 * `calculateAvailableSkillPoints`:
 *
 * - total = 15 + (level - 1) * 10
 * - spentOnStats = Σ incremental stat costs across mind/body/soul
 * - spentOnSkills = Σ getSkillCost for learned nodes (excluding `center-0`)
 * - available = total - spentOnStats - spentOnSkills
 */
export function calculateSkillBudget(character: Character): SkillPointBudget {
  const level = typeof character?.level === 'number' ? character.level : 1;
  const total = 15 + (level - 1) * 10;

  const core = character.coreStats ?? ({ mind: 0, body: 0, soul: 0 } as CoreStats);
  const spentOnStats =
    pointsSpentOnStat(core.mind) +
    pointsSpentOnStat(core.body) +
    pointsSpentOnStat(core.soul);

  const spentOnSkills = (character.learnedSkills ?? [])
    .filter((id) => id !== 'center-0')
    .reduce((sum, id) => sum + getSkillCost(id), 0);

  return {
    total,
    spentOnStats,
    spentOnSkills,
    available: total - spentOnStats - spentOnSkills,
  };
}
