# Worldforge & the Creator Marketplace

> The greater vision: let creators build their **own systems** on the LIGHTHOUSE
> engine — reskinning every stat, skill, ability, and item — and sell them on a
> marketplace that the platform facilitates for a small percentage.

## Core idea

LIGHTHOUSE has one battle-tested ruleset (the engine: effects, costs, ranges,
balance). A **Worldpack** is a *presentational overlay* on that ruleset: it
renames and re-describes things so the same game can feel like cyberpunk, norse
myth, grimdark horror — anything — **without changing a single mechanic.**

That separation is the whole point:

- **Safe to share & sell.** A reskin can't break balance or cheat, because it
  only touches display text. Buyers know exactly what they're getting.
- **Composable.** Any character/party plays identically under any pack; only the
  labels differ.
- **A real creator economy.** Authors theme the system, set a price, and list
  it; the platform facilitates the sale and takes a percentage.

## What a Worldpack contains

`src/types/worldpack.ts` — `Worldpack`:

- **Metadata**: `name`, `author`, `description`, `version`.
- **`reskins`** — the overlay (mechanics never appear here):
  - `nodes[nodeId] = { name?, description? }` — skill-tree nodes / abilities.
  - `items[itemId] = { name?, description? }` — weapons, armor, consumables, gear.
  - `terms[key] = customLabel` — global descriptors (core stats Mind/Body/Soul,
    resources HP/MP/SP, the six skills). Canonical keys live in
    `RESKINNABLE_TERMS` (`src/data/constants.ts`).
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

- **The engine is never aware of packs.** Reskins are applied only at the
  **display layer** via `useReskin()` (`src/lib/reskin.ts`). This keeps the
  engine pure/deterministic and its tests untouched, and guarantees a pack can
  never affect gameplay.
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
  core **Terms**, reskin **Skills** and **Items** (searchable, live), and a
  **Preview**. Save / Save & Activate / Export / Duplicate / Delete.
- **Marketplace** (`/marketplace`) — browse the library as listings with the
  fee split, **Activate** a pack to play under it, **List/Unlist**, **Export**,
  and **Import** from JSON.

## Where reskins currently show in-game (v1)

- Core stats, resources, and skills in the Forge (`StatsSection`).
- Skill-tree node names + descriptions (`SkillNodeShape`, `NodeInfoPanel`).

## Roadmap

1. **Propagate reskins to the rest of the UI** — item names in the equipment
   browser, combat action menu, character sheet, and combat log.
2. **Fully-custom content** — author new nodes/items with their own mechanics
   (not just reskins). The `Worldpack` type reserves room to grow into this.
3. **Hosted marketplace** — global catalog, accounts, payments, ratings;
   reuse the existing pack format, export/import, and fee model.
4. **Per-table packs** — a GM's active pack syncs to the party so everyone at
   the table sees the same system.
