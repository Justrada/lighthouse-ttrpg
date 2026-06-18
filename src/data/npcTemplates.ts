import type { Character, Inventory } from '@/types';
import { calculateDerivedStats } from '@/engine';

/**
 * A drop-in bestiary entry: a fully-formed {@link Character} a GM can stage into
 * combat without building a sheet, plus presentation metadata (tier/role/blurb)
 * used by the Start Combat picker. The wrapped `character` is a complete, valid
 * Character — HP/AC derive from its `coreStats` and equipped items via the same
 * `calculateDerivedStats` path player characters use, so these foes behave
 * identically to roster NPCs in the engine.
 */
export interface NpcTemplate {
  character: Character;
  tier: 'minion' | 'standard' | 'elite' | 'boss';
  role: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Equipment ids (verified present in src/data/skillTree.json worldItems).
// ---------------------------------------------------------------------------

const WEAPON = {
  shortSword: 'inv_1747265725686_85e86a',
  longSword: 'inv_1747317465886_544d9f',
  shortBow: 'inv_1747318455394_348e9d',
  battleAxe: 'inv_1747404359725_32824c',
  heavyClub: 'inv_1747406830757_009142',
  spear: 'inv_1747320937818_91a135',
} as const;

const ARMOR = {
  fineLeather: 'inv_1747270377888_fd21f8',
  chainmail: 'inv_1747404750760_486b93',
} as const;

/** Center node — every character has it; casters add the Magic Light node. */
const CENTER_NODE = 'center-0';
/** "Magic Light" ability node (MP cost) — gives casters something to throw. */
const MAGIC_LIGHT_NODE = 'node-1';

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

interface BuildOpts {
  id: string;
  name: string;
  level: number;
  mind: number;
  body: number;
  soul: number;
  weapon?: string | null;
  armor?: string | null;
  /** Extra ability/enhancement node ids beyond the implicit center node. */
  abilities?: string[];
}

/**
 * Construct a full, engine-ready Character for a bestiary foe, started at full
 * health. Resources are derived from stats + gear (exactly like a saved
 * character) — a stored 0 would read as "downed" when staged into combat.
 */
function npc(opts: BuildOpts): Character {
  const inventory: Inventory = {
    armor: opts.armor ?? null,
    weapon: opts.weapon ?? null,
    shield: null,
    accessories: [],
    backpack: [],
  };

  const base: Character = {
    id: opts.id,
    name: opts.name,
    level: opts.level,
    portraitSeed: opts.id,
    coreStats: { mind: opts.mind, body: opts.body, soul: opts.soul },
    learnedSkills: [CENTER_NODE, ...(opts.abilities ?? [])],
    skillChoices: {},
    inventory,
    currentHP: 0,
    currentMP: 0,
    currentSP: 0,
    statusEffects: [],
  };

  const derived = calculateDerivedStats(base);
  return { ...base, currentHP: derived.hp, currentMP: derived.mp, currentSP: derived.sp };
}

// ---------------------------------------------------------------------------
// The bestiary
// ---------------------------------------------------------------------------
//
// HP derives as max(10, 5*body) and AC as 10 + max(0, body-4) (+ armor), so
// core stats below are tuned to each tier's HP/AC budget. Brutes lean Body;
// casters lean Mind and carry the Magic Light node.

export const NPC_TEMPLATES: NpcTemplate[] = [
  // --- Minions (body ~3–4 → ~15–20 HP) -------------------------------------
  {
    tier: 'minion',
    role: 'Melee skirmisher',
    description: 'A snarling goblin that fights in packs and flees when outnumbered.',
    character: npc({
      id: 'npc-goblin-thug',
      name: 'Goblin Thug',
      level: 1,
      mind: 2,
      body: 3,
      soul: 2,
      weapon: WEAPON.shortSword,
    }),
  },
  {
    tier: 'minion',
    role: 'Ranged skirmisher',
    description: 'A goblin that hangs back and looses crude arrows from the rear line.',
    character: npc({
      id: 'npc-goblin-archer',
      name: 'Goblin Archer',
      level: 1,
      mind: 3,
      body: 3,
      soul: 2,
      weapon: WEAPON.shortBow,
    }),
  },
  {
    tier: 'minion',
    role: 'Swarm beast',
    description: 'An oversized rat that bites with filthy, disease-flecked teeth.',
    character: npc({
      id: 'npc-giant-rat',
      name: 'Giant Rat',
      level: 1,
      mind: 1,
      body: 3,
      soul: 2,
      weapon: null,
    }),
  },
  {
    tier: 'minion',
    role: 'Undead footsoldier',
    description: 'A rattling skeleton bound by dark magic to guard and to kill.',
    character: npc({
      id: 'npc-skeleton',
      name: 'Skeleton',
      level: 1,
      mind: 1,
      body: 4,
      soul: 1,
      weapon: WEAPON.shortSword,
    }),
  },

  // --- Standard (body ~5–6 → ~25–30 HP) ------------------------------------
  {
    tier: 'standard',
    role: 'Melee bruiser',
    description: 'A road-worn outlaw quick with a blade and quicker to rob the fallen.',
    character: npc({
      id: 'npc-bandit',
      name: 'Bandit',
      level: 2,
      mind: 3,
      body: 5,
      soul: 3,
      weapon: WEAPON.shortSword,
      armor: ARMOR.fineLeather,
    }),
  },
  {
    tier: 'standard',
    role: 'Pack predator',
    description: 'A lean wolf that lunges from the flank and harries the wounded.',
    character: npc({
      id: 'npc-dire-wolf',
      name: 'Dire Wolf',
      level: 2,
      mind: 2,
      body: 6,
      soul: 3,
      weapon: null,
    }),
  },
  {
    tier: 'standard',
    role: 'Melee bruiser',
    description: 'A muscle-bound orc that cleaves through the front line with its axe.',
    character: npc({
      id: 'npc-orc-brute',
      name: 'Orc Brute',
      level: 3,
      mind: 2,
      body: 6,
      soul: 3,
      weapon: WEAPON.battleAxe,
    }),
  },
  {
    tier: 'standard',
    role: 'Spellcaster',
    description: 'A hooded zealot who channels stolen light into searing bolts.',
    character: npc({
      id: 'npc-cultist',
      name: 'Cultist',
      level: 3,
      mind: 6,
      body: 5,
      soul: 4,
      weapon: WEAPON.shortSword,
      abilities: [MAGIC_LIGHT_NODE],
    }),
  },

  // --- Elite (body ~8–9 → ~40–45 HP; spider body 7 → 35) -------------------
  {
    tier: 'elite',
    role: 'Melee captain',
    description: 'A hardened leader of cutthroats, armored and lethal with a longblade.',
    character: npc({
      id: 'npc-bandit-captain',
      name: 'Bandit Captain',
      level: 5,
      mind: 4,
      body: 8,
      soul: 5,
      weapon: WEAPON.longSword,
      armor: ARMOR.fineLeather,
    }),
  },
  {
    tier: 'elite',
    role: 'Armored bruiser',
    description: 'A grim warrior clad in chainmail, swinging a heavy axe without mercy.',
    character: npc({
      id: 'npc-dark-knight',
      name: 'Dark Knight',
      level: 5,
      mind: 3,
      body: 9,
      soul: 4,
      weapon: WEAPON.battleAxe,
      armor: ARMOR.chainmail,
    }),
  },
  {
    tier: 'elite',
    role: 'Ambush beast',
    description: 'A huge spider that drops from the dark to seize prey in its fangs.',
    character: npc({
      id: 'npc-giant-spider',
      name: 'Giant Spider',
      level: 4,
      mind: 3,
      body: 7,
      soul: 4,
      weapon: null,
    }),
  },

  // --- Boss (body ~12–14 → ~60–70 HP) --------------------------------------
  {
    tier: 'boss',
    role: 'Melee bruiser',
    description: 'A towering ogre whose heavy club shatters shields and bones alike.',
    character: npc({
      id: 'npc-ogre',
      name: 'Ogre',
      level: 6,
      mind: 2,
      body: 12,
      soul: 4,
      weapon: WEAPON.heavyClub,
    }),
  },
  {
    tier: 'boss',
    role: 'Regenerating brute',
    description: 'A monstrous troll that rends with raw claws and knits its wounds shut.',
    character: npc({
      id: 'npc-troll',
      name: 'Troll',
      level: 7,
      mind: 2,
      body: 14,
      soul: 5,
      weapon: null,
    }),
  },
  {
    tier: 'boss',
    role: 'Spellcaster',
    description: 'A master of death magic who commands the fallen and blasts the living.',
    character: npc({
      id: 'npc-necromancer',
      name: 'Necromancer',
      level: 7,
      mind: 10,
      body: 7,
      soul: 8,
      weapon: WEAPON.shortSword,
      abilities: [MAGIC_LIGHT_NODE],
    }),
  },
];

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

const byId = new Map(NPC_TEMPLATES.map((t) => [t.character.id, t.character]));

/**
 * Resolve a bestiary template's source {@link Character} by its `character.id`
 * (e.g. `npc-goblin-thug`). Used by the combat lookups so a staged template's
 * abilities, weapon, and skill scores resolve during resolution. Returns
 * `undefined` for ids that aren't bestiary templates.
 */
export function findNpcTemplate(id: string): Character | undefined {
  return byId.get(id);
}
