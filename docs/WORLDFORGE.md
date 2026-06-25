# Worldforge & the Creator Marketplace

> The greater vision: let creators build their **own systems** on the LIGHTHOUSE
> engine — reskinning every stat, skill, ability, and item — and sell them on a
> marketplace that the platform facilitates for a small percentage.

## Core idea

LIGHTHOUSE has one battle-tested ruleset (the engine: effects, costs, ranges,
balance). A **Worldpack** (a "System") layers on that ruleset in two ways: a
*presentational reskin* that renames/re-describes everything (cyberpunk, norse
myth, grimdark horror — without touching a single mechanic) **and/or** custom
**content** — wholly new abilities, weapons, and skill-tree nodes that resolve
through the same pure engine. A pack picks how its content joins the base via
`baseMode`: `overlay` (reskin only), `extend` (base + custom), or `replace`.

That separation is the whole point:

- **Safe to share & sell.** The *reskin layer* only touches display text, so
  renaming can't break balance. Custom **content** resolves through the same
  pure, tested engine as the base catalog — so it can't cheat the rules either,
  only add to or replace content within them.
- **Composable.** Any character/party plays identically under any pack; only the
  labels differ.
- **A real creator economy.** Authors theme the system, set a price, and list
  it; the platform facilitates the sale and takes a percentage.

## What a Worldpack contains

`src/types/worldpack.ts` — `Worldpack`:

- **Metadata**: `name`, `author`, `description`, `version`.
- **`reskins`** — the display overlay (no mechanics here):
  - `nodes[nodeId] = { name?, description? }` — skill-tree nodes / abilities.
  - `items[itemId] = { name?, description? }` — weapons, armor, consumables, gear.
  - `terms[key] = customLabel` — global descriptors (core stats Mind/Body/Soul,
    resources HP/MP/SP, the six skills). Canonical keys live in
    `RESKINNABLE_TERMS` (`src/data/constants.ts`).
- **`content`** (optional) — a real custom-content catalog: new `nodes`, `edges`,
  and `worldItems` (abilities, weapons, ammo) the engine resolves like the base.
- **`baseMode`** — `overlay` | `extend` (base ∪ content; a custom id overrides the
  base) | `replace` (custom only).
- **`derivedFrom`** — fork lineage `{ id, name, author }` for attribution/remixing.
- **Marketplace**: `price`, `published`, `license`.

## Architecture (how it stays clean)

```
data/engine (pure rules, never reskinned)
        │  findNode/findItem return the BASE name/desc + all mechanics
        ▼
lib/reskin.ts  ── pure resolvers + useReskin() hook ──┐  reads the active pack
        │                                              │
store/worldpackStore.ts (CRUD, activeId, persist)     │
        ▼                                              ▼
display components call useReskin().nodeName(id, base) / term(key, base)
```

- **Two layers, one boundary.** The **reskin layer** applies only at the
  **display layer** via `useReskin()` (`src/lib/reskin.ts`) and never affects
  gameplay. The **content layer** is resolved by the engine through a swappable
  *active catalog* in `src/data/skillTree.ts` (`setActiveCatalog` /
  `buildActiveCatalog`; `findNode`/`findItem` read base, base∪custom, or custom).
  The engine still only *imports* that data module — it never imports a store — so
  the `store → data → engine` direction and determinism are preserved.
- **Active pack** is a single id in `worldpackStore` (persisted). `null` = the
  base system. Switching is instant and global.
- **Trust boundary**: imported/loaded packs run through `normalizeWorldpack`
  (`src/lib/worldpack.ts`) so malformed JSON can't crash the app.

## Marketplace & fees

- `WORLDFORGE_FEE_RATE` (`src/data/constants.ts`, currently **15%**) is the
  platform's facilitation cut. `creatorPayout(price)` / `platformCut(price)`
  (`src/lib/worldpack.ts`) compute the split shown on every listing.
- **Today (foundation):** packs live in the browser; **Export** copies a pack to
  JSON and **Import** ingests one — so creators can already share/sell packs
  out-of-band. The Marketplace screen is the catalog UI + fee model.
- **Next:** a hosted catalog + real payments behind the same data model.

## Screens

- **Worldforge** (`/worldforge`) — create/edit packs: details + price, rename
  core **Terms**, reskin **Skills** and **Items** (searchable, live), a **Create**
  tab (Creator Studio, below), and a **Preview**. Save / Save & Activate / Export
  (full or a skill-tree / item-pack slice) / Duplicate / Delete.
- **Creator Studio** (Worldforge **Create** tab, `worldforge/ContentSection.tsx`)
  — author custom **Abilities** (Deal damage / Heal / Modify a stat) and **Weapons**
  (range, damage, ammo: clip / shots / ammo-per-shot), arranged in a visual **tree
  editor** (`TreeEditor.tsx`): tap a node's **"+"** to branch a child one tier
  further from Core, drag to arrange, draw prerequisite links. Pick a `baseMode`.
- **Marketplace** (`/marketplace`) — browse the library as listings with the
  fee split, **Activate** a pack to play under it, **List/Unlist**, **Export**,
  and **Import** from JSON.

## Where reskins currently show in-game (v1)

- Core stats, resources, and skills in the Forge (`StatsSection`).
- Skill-tree node names + descriptions (`SkillNodeShape`, `NodeInfoPanel`).

## Roadmap

1. **Propagate reskins to the rest of the UI** — item names in the equipment
   browser, combat action menu, character sheet, and combat log.
2. ~~**Fully-custom content**~~ — ✅ **shipped**: author new abilities/weapons/nodes
   with real mechanics via `extend`/`replace` (see the Creator Studio above).
3. **Hosted marketplace** — global catalog, accounts, payments, ratings;
   reuse the existing pack format, export/import, and fee model.
4. **Per-table packs** — a GM's active pack syncs to the party so everyone at
   the table sees the same system.
