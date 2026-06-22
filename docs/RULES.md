# LIGHTHOUSE — Rules & Mechanics (Source of Truth)

> **What this is.** The canonical description of how LIGHTHOUSE works — the **home base of truth** that informs the code. Each rule is tagged with its build status:
> - **✅ As-built** — the engine already does this (verified against `src/engine`/`src/data`).
> - **🔧 To-build** — this is the *settled* rule, but the code doesn't match yet; the current behavior is noted so we know the gap.
>
> When code and this doc disagree on an ✅ rule, that's a bug. When they disagree on a 🔧 rule, that's planned work (see §11). Rules last settled **2026-06-22** (decisions log in §9).
>
> Everything here is **genre-neutral** — the fixed "bones" (shared DNA). Worldforge systems reskin and add content on top without changing the math (see [WORLDFORGE.md](WORLDFORGE.md)). Code refs look like `combat.ts:885` → `src/engine/…` (or `src/data/…`, `src/types/…`). Numbers marked **(tunable)** live in `src/data/constants.ts`.

---

## 1. The shared DNA (what never changes)

Every LIGHTHOUSE system — fantasy, cyberpunk, wild-west — resolves through the same core, so a fireball and a plasma rifle run through identical code:

- **3 core stats** → **Mind, Body, Soul**. Each powers one resource pool (§2.3).
- **13 derived values**, including the **6 skills** (Physical, Stealth, Lore, Awareness, Influence, Survival), from fixed formulas.
- **7 effect "verbs"** every ability/item is built from: *Apply Damage, Apply Healing, Modify Stat, Stun, Give Advantage/Disadvantage, Substitute Cost, Move Target* (+ a drain sub-mode on damage).
- **A d20 core**: checks, attacks, and saves are `1d20 + a skill score`, with advantage/disadvantage and natural-20/1 crits.
- **Damage types** with resist/immunity (§6.7).
- **A hex battlefield** with range bands and movement.
- **Simultaneous, per-action initiative** — the signature hook (§6.4).

Creators rename these (Mind→Tech, MP→Charge) but keep the formulas (`constants.ts:96`).

---

## 2. Characters

### 2.1 Core stats

| Stat | Theme | Powers |
|------|-------|--------|
| **Mind** | intellect, knowledge, perception of detail | **SP** |
| **Body** | strength, toughness, agility | **HP** |
| **Soul** | presence, willpower, intuition | **MP** |

Core stats are non-negative integers bought at creation with skill points (§3).

### 2.2 Derived stats — formulas

From `calculateDerivedStats` (`stats.ts:193`). `bonus` = the sum of matching **Modify Stat** effects from learned Enhancements and equipped gear.

| Derived value | Formula | Status |
|---|---|---|
| **HP** (max) | `max(10, 5 × Body) + bonus` | ✅ |
| **MP** (max) | `5 + Soul + bonus` | ✅ |
| **SP** (max) | `5 + Mind + bonus` | ✅ |
| **AC** | `10 + max(0, Body − 4) + bonusAC + shield` | ✅ |
| **Initiative** | `0 + bonus` | ✅ |
| **Actions / round** | `max(1, 3 + bonus)` | ✅ |
| **Physical** | `Body − 4 + bonus` | ✅ |
| **Stealth** | `Body + Mind − 8 + bonus` | ✅ |
| **Lore** | `Mind − 4 + bonus` | ✅ |
| **Awareness** | `Soul + Body − 8 + bonus` | ✅ |
| **Influence** | `Soul − 4 + bonus` | ✅ |
| **Survival** | `Soul + Mind − 8 + bonus` | ✅ |

Each resource now maps to one core stat: **HP←Body, MP←Soul, SP←Mind**. **Skill scores may be negative** (Body 0 → Physical −4) — a deliberate, allowed tradeoff. The skill score is the `1d20` modifier on its checks.

### 2.3 Resources

- **HP** (Body) — life. At 0 you fall unconscious and roll death saves (§6.12).
- **MP** (Soul) — the pool most abilities cost.
- **SP** (Mind) — the pool stamina/physical abilities cost.

`current` values track per combatant; `max` values freeze onto the combatant at combat start and change only via Max-pool effects (§6.10).

---

## 3. Character creation & advancement

### 3.1 Skill-point budget — `calculateSkillBudget` (`stats.ts:306`) ✅

```
total points     = 15 + (level − 1) × 10
spent on stats   = Σ incremental core-stat costs (Mind + Body + Soul)
spent on skills  = Σ skill-node costs of every learned node (excluding Core)
available        = total − spent on stats − spent on skills
```

A level-1 character has **15 points**.

### 3.2 Core-stat costs — `getStatCost` (`stats.ts:234`) ✅

| Current value | Cost of next point |
|---|---|
| 0–5 | 1 |
| 6–7 | 2 |
| 8–9 | 3 |
| 10+ | `floor(current / 2) + 1` |

### 3.3 Skill-node costs by tier — `getSkillCost` (`stats.ts:280`) ✅

Tier = prerequisite hops from Core (`getSkillTiers`). The visual editor places each node one column further per tier, so **column = tier = cost.**

| Tier | Cost |
|---|---|
| 1–2 | 1 |
| 3–4 | 2 |
| 5–6 | 3 |
| 7+ | 4 |

### 3.4 Recommended level-1 array ✅ *(guidance, shown in the Forge)*

A suggested starting spread, not enforced: **one core stat at 6, two at 4** (costs 6+4+4 = 14 of 15 points), leaving 1 for a tier-1 skill. Players may distribute freely and **may leave skills negative**. This is guidance for the Forge / Quick Build, not a hard rule.

### 3.5 Learning & unlearning — `skills.ts` ✅

- Learnable if affordable **and** reachable (a learned prerequisite, or adjacent to Core). Core (`center-0`) is always learned.
- Unlearning a node also unlearns descendants that lose their only path to Core (no orphans). Core can't be unlearned.

### 3.6 Advancement — milestone leveling ✅ *(process, no engine change)*

`level` sets the point budget; the GM raises it at **story milestones** (no XP system). **There is no hard level or stat cap** — the escalating stat/skill cost curve (§3.2–3.3) is the intended **soft cap**, and we keep it that way.

---

## 4. Dice

All randomness flows through an injected RNG (`dice.ts:7`) — combat is **deterministic given a seed** (only cosmetic IDs use `Math.random`).

### 4.1 Notation ✅
`2d6`, `1d20+3`, `d8` (count 1), `-1d6` (whole roll negated, for penalties), and bare integers (`5`). Guards: count capped at 1000, a die needs ≥1 face, damage floors at 0.

### 4.2 d20 checks, advantage, crits ✅
- **Advantage** = 2d20 keep highest; **disadvantage** = keep lowest.
- Crit read off the **kept** die: nat 20 = success, nat 1 = fail. (Crit threshold is configurable — §6.7.)
- Sources combine via `combineAdvantage`: one of each cancels; otherwise the present side wins (advantage is binary, doesn't stack).

---

## 5. The skill tree (engine model) ✅

Nodes + directed edges (prerequisite → unlocked) + linked world items. Exactly one **Core** node, id `center-0` (the engine hardcodes it for tier/reachability; custom roots are remapped to it). A node may link an **Ability** (active skill/spell) or an **Enhancement** (passive that feeds Modify-Stat bonuses into derived stats). Tier drives cost.

---

## 6. Combat

### 6.1 Battlefield ✅
Pointy-top hex grid **18 × 14** (tunable). One combatant per hex. Teams deploy near the midline with a gap; the GM repositions during setup.

### 6.2 Range bands — `RANGE_TO_HEX_DISTANCE` (tunable) ✅

| Band | Max hex distance |
|---|---|
| Self | (team check) |
| Melee | 1 (adjacent) |
| Near | 2 |
| Far | 4 |
| Distant | 6 |
| Battlefield | ∞ |

"Self" currently means *any same-team target* (`combat.ts:407`) — see §10 (naming still open).

### 6.3 Movement ✅
A move travels up to **6 hexes** (`MOVE_RANGE`, tunable), pathing around occupied hexes and bounds. See §6.5 for **Flee** / **Chase** (directional moves).

### 6.4 Round structure & initiative — the signature hook

**Combat is simultaneous.** The atomic unit is a **declared action**, not a whole-combatant turn. Each round runs **Declare → Resolve → End-of-round**.

**Per-action initiative** ✅:
1. A combatant with *N* actions rolls **N initiative dice** (`1d20 + Initiative` each).
2. Their own N rolls are sorted **descending and assigned to their actions in declared order** — so their **1st chosen action gets their highest roll** and reliably resolves before their own later actions.
3. **All actions from all combatants** are slotted into one timeline by **descending initiative**.
4. **Ties between different combatants** are broken by a **reroll-off; the higher reroll goes first.** (A combatant's own internal ties don't matter — their actions already have a fixed chosen order.)

> This interleaving is the selling point: your moves get slotted in amongst everyone else's and the round plays out together.
>
> ✅ Implemented in `rollInitiativeForRound` (`combat.ts`): per-combatant rolls assigned to actions in declared order, a global descending interleave, and a per-combatant reroll to break cross-combatant ties.

**End of round** (`combat.ts:1812`) ✅: apply DoT, tick durations, drop Guard, revert expired Max-pool buffs, increment the round.

### 6.5 Action economy ✅

Base **3 actions per round** (modifiable by effects). Each declared action is one slot.

| Action | Cost | Effect | Status |
|---|---|---|---|
| **Move** | 1 | up to 6 hexes | ✅ |
| **Chase** | 1 | move to the reachable open hex **closest to** a chosen target | ✅ |
| **Flee** | 1 | move to the reachable open hex **furthest from** a chosen target | ✅ |
| **Weapon Attack** | 1 | attack with equipped weapon; **no resource cost**; may use ammo; can burst (§6.15) | ✅ |
| **Use Ability** | 1 | use a learned ability; **pays its MP/SP/HP cost** | ✅ |
| **Use Item** | 1 | consume one charge of a backpack consumable | ✅ |
| **Reload** | 1 | refill a clip from reserve (§6.15) | ✅ |
| **Guard** | 1 | impose disadvantage on the next attacker (§6.9) | ✅ |
| **Change Equipment** | 1 | swap equipped weapon | ✅ |
| **Pass** | 1 | do nothing | ✅ |

**Forced movement (fear / provoke):** effects can compel a target to take a **Flee** (away from the source) or **Chase** (toward the source) move on the target's action — i.e. a fear spell forces the enemy to flee you; a provoke forces them to chase you. Built on the same step-toward / step-away pathing as Move Target (§6.10). ✅ The **Flee/Chase actions exist**; a GM enacts fear/provoke by ordering the affected unit to Flee or Chase. (An automatic "compelled" status that forces this on the unit's own turn is a future add.)

> Action-cap note: `actionsPerRound` is enforced when *declaring* (UI/network); the resolver runs whatever's queued (GM-authoritative table — fine). §10.

### 6.6 Attack resolution — `resolveUsable` (`combat.ts:1448`) ✅
1. **Auto-hit** if `hitType === 'Auto Hit'` or range is Self — skip the roll.
2. Else **roll to hit**: `1d20 + the ability/weapon's skill (rollModifier)`, with advantage/disadvantage from effects and any Guard.
3. **One attack roll** vs **each target's live AC**:
   - **Below crit-fail (nat 1)** → automatic miss on everyone.
   - **At/above crit threshold (default nat 20)** → automatic hit + critical (§6.7).
   - Else **hit if total ≥ AC** (ties hit).

### 6.7 Damage — `computeDamage` (`combat.ts:862`)

```
weapon damage = (weapon's Apply-Damage dice) × weaponMultiplier   — only if useWeaponDamage
                 (falls back to 1d4 if the weapon has no damage dice)
additional    = the effect's own additionalDamage dice
subtotal      = weapon damage + additional
on a crit:      double the DICE (see crit rules)
final         = apply target's resistance/immunity by damage type
```

- **No stat scaling on damage** ✅ — the attacker's skill modifies the to-hit roll only, *never* damage. (Confirmed intended.)
- **Damage straight to HP**, clamped so HP never drops below 0. HP-protecting *Substitute Cost* can divert overflow to another pool down to 1 HP.
- **Unarmed / fallback damage = 1d4** (tunable).

**Damage types & mitigation** ✅ *(reads `effect.damageType`; resist/immune gathered from the character + equipped items):*
- Every damage instance carries a **damage type** (e.g. bludgeoning / slashing / piercing + system-defined elemental types).
- A target can **resist** a type → takes **half** (×0.5, rounded down), or be **immune** → takes **none** (×0). (Optional future extension: **vulnerable** → ×2 via the existing `weaknesses` hook — not required by the current ruling.)
- Resistances/immunities come from gear, enhancements, or creature templates.

**Crits** ✅:
- **Threshold:** crit on a **natural 20** by default. Enhancements can **lower the threshold** (crit on 19, or 18, etc.) via a per-combatant `critThreshold`.
- **Base crit = double the DICE** — roll/realize the damage dice twice; **flat modifiers are added once** (e.g. `2d6+3` crit = `2d6 doubled + 3`, *not* `(2d6+3)×2`).
- **Enhancement variant — Maximum-dice crit:** instead of doubling, a crit deals the **maximum** possible on every die rolled (+ the flat modifier once). This is an opt-in enhancement, not the base rule.
- A roll at/above the threshold also **always hits** regardless of AC; a **nat 1 always misses.**

### 6.8 Saving throws — `processSavingThrows` (`combat.ts:1162`)
Target rolls `1d20 + named skill` vs the effect's **DC**; one roll per skill group; nat 20 always saves, nat 1 always fails. On success: `saveOutcome: 'Halve'` halves the effect; otherwise it's negated. Advantage on saves comes from effects.

- **DC = 8 + the caster's relevant skill score** (so stronger casters are harder to resist), with an optional **author-set flat DC** override. ✅

### 6.9 Guard ✅
A **Guard** marks the combatant for one round; the next attacker targeting them as primary takes disadvantage, and the Guard is consumed. Clears at end of round.

### 6.10 The seven effect verbs — `applyEffect` (`combat.ts:903`) ✅

| Verb | What it does |
|---|---|
| **Apply Damage** | Rolls damage (§6.7). Instant, or with a duration a **damage-over-time** ticking at end of round. Optional **drain** sub-mode steals HP/MP/SP to the attacker. |
| **Apply Healing** | Restores a pool, clamped to max (**no overheal**). A positive HP heal **revives** the downed (§6.12). No team gate — allies *or* enemies. |
| **Modify Stat** | Pools (HP/MP/SP) adjust current; Max pools change the cap; other stats (AC/Initiative/skills) apply as a timed or **permanent** buff (permanent non-pool buffs stored as no-expire status so they persist). |
| **Stun** | Target loses an action; ticks down per skipped action. |
| **Give Advantage/Disadvantage** | Grants adv/dis on a named roll type for a duration; not consumed on use. |
| **Substitute Cost** | One resource pays in another's place for a duration; also diverts HP damage to the substitute down to 1 HP. |
| **Move Target** | Forced push/pull up to N hexes, stopping at occupied hexes or edges. Basis for fear/provoke forced moves (§6.5). |

AOE rolls each effect once and applies the same number to everyone in the zone.

### 6.11 Status effects & durations — `effects.ts:135` ✅
Duration unit is `Rounds`, `Actions`, or `Permanent` (default Rounds). End of round, `Rounds`/`Actions` tick down and drop at 0; `Permanent` never expires; `Stunned` ticks per-action instead. Active Modify-Stat effects layer onto AC/Init/skills live. Falling unconscious strips enemy-applied effects.

### 6.12 Death & unconsciousness — `combat.ts:781` ✅
- **0 HP** → unconscious (not dead), rolls death saves; HP never goes below 0.
- **Death saves** (`1d20`): nat 20 → +2 successes; nat 1 → +2 failures; ≥10 → +1 success; <10 → +1 failure. **5 successes stabilize at 1 HP; 5 failures = death** (removed from fight).
- **Any positive HP heal revives** a downed combatant (HP set to the heal amount, capped at max).
- Single-target attacks on the downed do nothing; AOE and healing still reach them.

### 6.13 Conditions — narration, not engine ✅ *(decision: keep)*
The 8 named conditions (Exhausted, Poisoned, Frightened, Blinded, Deafened, Cursed, Blessed, Hidden — `constants.ts:38`) are **GM narration toggles; the engine reads none of them.** Mechanics are delivered through the **verbs** instead — poison = an Apply-Damage DoT, a skip = Stun, a penalty = Give Disadvantage. Keeping conditions non-mechanical keeps them easy to rename/reskin in Worldforge.

### 6.14 Area of effect & friendly fire ✅
**Single Target** hits the primary; **`AOE N`** hits everyone within radius `floor(N/2)`; **`Target Line (N)`** hits everyone on the line. **AOE is team-agnostic by design** — it catches allies and enemies alike (damaging AOE spares the already-unconscious and still detonates if its primary is down). *(This is an explicit, intentional rule — do not "fix" it to enemy-only.)*

### 6.15 Guns, ammo & reload ✅
A weapon with `clipSize > 0` loads a full clip at start; `shots` (≤20) fire per attack, each consuming `ammoPerShot`. A single-target burst stops early if the target drops; an AOE burst keeps firing. Empty clip blocks the attack. **Reload** refills from `reserveAmmo`; no reserve set = unlimited.

### 6.16 Resource costs — `spendResource` (`combat.ts:600`) ✅
Abilities pay `cost` (MP/SP/HP); weapon attacks and item use pay none. Cost clamped to a non-negative integer. Unaffordable actions are wasted unless a Substitute Cost covers the shortfall.

### 6.17 Rest ✅
Short rest: +50% MP, +50% SP (no HP). Long rest: full.

---

## 7. Worldforge (how custom content plugs in) ✅
A "System" can reskin terms and **add abilities/weapons/skill-tree nodes** that resolve through these exact rules. Modes: `overlay` (reskin only), `extend` (base + custom), `replace` (custom only). The Creator Studio currently authors Apply Damage / Apply Healing / Modify Stat + weapon stats + ammo; the other verbs and saving throws exist in the engine but aren't yet exposed in the Studio UI (§10-K). Full detail in [WORLDFORGE.md](WORLDFORGE.md).

---

## 8. Constants quick-reference (tunable dials)

| Dial | Value | Where |
|---|---|---|
| HP floor / per-Body | 10 / ×5 | `stats.ts:204` |
| MP / SP | 5 + Soul / 5 + Mind | `stats.ts` |
| Base AC / Body threshold | 10 / 4 | `stats.ts:207` |
| Base actions/round | 3 | `stats.ts:216` |
| Level-1 points / per level | 15 / +10 | `stats.ts:307` |
| Grid / move range | 18×14 / 6 | `constants.ts` |
| Range bands | Melee 1 / Near 2 / Far 4 / Distant 6 | `RANGE_TO_HEX_DISTANCE` |
| Rest | short +50% MP/SP · long full | `REST_RULES` |
| Unarmed / fallback damage | 1d4 | `combat.ts:880` |
| Crit threshold (default) | nat 20 (lowerable by enhancement) | `combat.ts` |
| Max shots per burst / dice per roll | 20 / 1000 | `combat.ts`, `dice.ts` |
| Death-save threshold | 5 / 5 | `combat.ts:800` |
| Marketplace fee | 15% | `WORLDFORGE_FEE_RATE` |

---

## 9. Decisions log (settled 2026-06-22)

- **A — Resource scaling:** ✅ decided. MP = 5 + Soul, SP = 5 + Mind (+ gear/enhancement bonuses). HP unchanged.
- **B — Damage types & mitigation:** ✅ decided. Typed damage (bludgeoning/slashing/piercing + system types); targets can **resist** (½) or be **immune** (0) to specific types.
- **C — Damage & crit scaling:** ✅ decided. No skill-to-damage (hit-only). Crit on nat 20, **lowerable to 19/18 by enhancements**. Base crit **doubles the dice** (flat mods once). Enhancement option: **max-dice crit**.
- **D — Starting baseline:** ✅ decided. Recommended level-1 array (6/4/4); **negative skills allowed**.
- **E — Advancement:** ✅ decided. **Milestone** leveling, **no hard cap** — the cost curve is the soft cap.
- **F — Save DCs:** ✅ decided. **DC = 8 + caster's skill**, with author override.
- **G — Conditions:** ✅ decided. Keep as **narration**; deliver mechanics via verbs (DoT / Stun / disadvantage).
- **H — Initiative:** ✅ decided. **Keep per-action simultaneous initiative** — roll one die per action, assign a combatant's rolls to their actions in declared order (1st action = highest), global descending interleave, **ties between combatants rerolled** (winner first).
- **Flee/Chase:** ✅ decided. **Flee** = move furthest from a chosen target; **Chase** = move closest to one; fear/provoke can force a target to flee/chase.

## 10. Still open (low priority)

- **I — "Self" range** currently means "any ally." Keep behavior but rename for clarity (e.g. add a distinct true-Self vs. Ally/Team), TBD.
- **J — Action-cap enforcement:** keep advisory (UI-only) on a GM-authoritative table? (Leaning yes.)
- **K — Studio coverage:** which advanced verbs to expose next (Stun, saving throws, passive Enhancements are highest value)?

## 11. Implementation status — ✅ shipped 2026-06-22

All settled rules are implemented (306 tests; an adversarial 4-agent sweep found and fixed one latent initiative bug — see below):

1. **MP/SP formulas** — `5 + Soul` / `5 + Mind` (`stats.ts`). ✅
2. **Damage types + resist/immune** — `applyResistance` by `effect.damageType`; `deriveResistances` gathers from character + items (`combat.ts`). ✅
3. **Crit overhaul** — `rollDamageNotation` doubles the dice (or maximizes them); per-combatant `critThreshold` via `rollD20`; `deriveCritProfile` reads `Crit Threshold` / `Crit Mode` enhancements (`combat.ts`, `dice.ts`). ✅
4. **Save DC = 8 + caster skill** (authored `saveDC` overrides) — `processSavingThrows` `dcOf` (`combat.ts`). ✅
5. **Initiative** — per-combatant ordered assignment + reroll tie-break in `rollInitiativeForRound` (`combat.ts`). ✅
6. **Flee (away) + Chase (toward)** — `resolveFlee` / `resolveChase` + the `Chase` action type + menu options (`combat.ts`, `actionOptions.ts`). ✅
7. **Recommended array** — guidance hint in the Forge `StatsSection`; negative skills already supported. ✅

**Bug-check fix:** `rollInitiativeForRound` previously read `declaredActions` by `peerId` first (the app keys it by `id`), so a `peerId`↔`id` collision could hijack or fabricate a combatant's actions — now id-only, locked by a regression test.

### Resolved cleanup
✅ **Effect field names unified (2026-06-22).** The `SkillEffect` type and the effect-text renderer (`effectText.ts`) now read the exact names the engine acts on — `saveSkill`/`saveDC`/`saveOutcome`, `advDis`/`targetSkill`, `direction`/`rows`, `resourceGained`/`resourceDrained`, `resourceDrainedFromTarget`. The dead aliases (`savingThrowSkill`, `advantageType`, `moveDirection`, `substituteFrom/To`, …) are gone, so what a player reads can no longer diverge from what the engine does (locked by `effectText.test.ts`).
