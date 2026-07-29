# The Atlas — Maps, Worlds & the Places You Fight In

> **The vision.** Creators build and sell **maps** the way they already build and
> sell systems. A map ranges from a single island to a whole globe, and you can
> zoom from the full world down to one room in one building — with basements,
> upper floors, and caves. When a fight starts, the battlefield **is** the place
> the party is standing in. Parties can split up and explore separately.

This doc is the canonical map design, the way [RULES.md](RULES.md) is the
canonical rules. It records **what was decided and why**, so the reasoning
survives longer than any one implementation.

Status tags, matching RULES.md: **✅ shipped** · **🔧 designed, not built** ·
**💭 deliberately deferred**.

---

## 1. The one-sentence architecture

> **The world is a seed. The battlefield is compiled data.**

Two layers, one hard one-way boundary, because the two halves of this feature
have *opposite* constraints.

| | **World layer** | **Battle layer** |
|---|---|---|
| What it is | An `Atlas`: a seed + tuning + the edits a human made | A `Battlefield`: walls, doors, solid hexes, deploy zones |
| Size | 600 bytes – 30 KB | ~30 bytes open ground, ~1.7 KB a seven-room tavern |
| Where it lives | Persisted, sold, shared | Inside the `CombatState` snapshot, like everything else |
| How it's produced | Generated lazily from `f(seed, params, path)` | `compileBattlefield(spec, place)` — a pure function |
| Status | 🔧 | ✅ shipped |

The atlas does **not** point at a battlefield. It **compiles** one. That single
choice is what lets the map ship with **zero new combat concepts**: `HexCoord`
never grows a Z axis, `CombatState` gains no geometry field it doesn't already
have, and a map-derived fight travels inside the `combat_start` message that
already exists.

### Why a seed, and not a map file

Every hard constraint in this app is a constraint on **bytes**:

- Distribution is a **clipboard paste** into a `<textarea>`. No file input, no
  download, no Blob anywhere in `src/`.
- Storage is **~5 MB of localStorage**, shared with every other project on the
  `github.io` subdomain, and its quota failure is silent by design.
- The wire is **PeerJS with no chunking and no backpressure** — a practical
  budget of tens of KB per message.
- Rendering is **SVG only**. No canvas, no WebGL, anywhere in the codebase.

A seeded atlas answers all four with the same move. A world is roughly **one
fifth the size of `skillTree.json`**. There is nowhere in this app for
materialised map geometry to live, and there is no server coming to hold it.

---

## 2. The scale ladder

A place's address is its identity. `/P7/R3/L2/S9/B0/F-1/K4` is a room, in a
basement, in a building, in a settlement, in a valley, in a region, on a plate —
**22 characters**.

| Tag | Level | Roughly |
|---|---|---|
| `W` | world | the globe itself — **the only spherical level** |
| `P` | plate | a continent or an ocean |
| `R` | region | a country, a large island, an inland sea |
| `L` | locale | a valley, a forest, a stretch of coast |
| `S` | site | a settlement, a ruin, a dungeon mouth |
| `B` | structure | one building, tower, or cave system |
| `F` | floor | one storey — **the index may be negative** (basements, depths) |
| `K` | room | one chamber — the leaf, and the natural battlefield |

**A single island, a country, a continent, and a whole planet are the same
structure with a different `radiusKm`.** That one dial (40 → 6371) is what
satisfies "range in size" without a second code path.

### Two properties that make the zoom actually work

**Every level below `world` is a locally-flat hex chart with `|q|,|r| ≤ 16.**
The sphere is used at exactly one rung. Coordinates never leave four significant
figures, so the float32 `viewBox` collapse that kills every naive deep-zoom
camera *cannot be constructed*. Deep zoom is a stack of shallow charts, not one
enormous coordinate space.

**Children totally partition their parent's chart.** Every hex belongs to
exactly one child, so zooming in *anywhere* always descends into something.
This is not a detail — a council judge computed that the obvious alternative
(children as pins scattered on a parent) leaves **93.6% of the globe with
nothing beneath it**, turning "zoom to a room" into hunting for ~40 pins in a
row. Total partition is what makes it a zoom instead of a drill.

### Verticality, without touching combat

Floors are **path segments** (`/…/B4/F-1`), each an ordinary sibling place with
its own chart sharing its parent's lat/lon. `HexCoord` never widens, and the
protocol never learns that floors exist. Stairs are terrain that links them.

---

## 3. Customisation — the part that has to survive regeneration

The only thing stored is the only thing that cannot be recomputed: **a human's
deliberate edits**, keyed by *stable path*, never by array index.

```ts
overrides: Record<PlacePath, PlaceOverride>   // sparse; 40–200 bytes each
tombstones: PlacePath[]                       // generated children deleted outright
```

Because the key is a derived path and not an ordinal, adding a sibling never
perturbs another sibling's seed. An edit either still resolves after
regeneration, or is reported as **orphaned** — it is never silently dropped.

Three rules protect authored work, and they exist because the research is
unambiguous that **losing work is the #1 failure of every map tool in this
market** (Inkarnate's six top-voted bugs are all "my maps won't load"; Dungeon
Alchemist's crashes plus a broken autosave; Dungeondraft losing maps with their
asset packs; Wonderdraft's RAM ceiling):

1. **Identity is the key; position is a property.** `PlaceOverride.at` moves a
   place within its parent's chart *without changing its seed*. "Move this town
   three hexes" must not silently become a different town with different
   children — which is exactly what hide-and-re-add would do.
2. **Generator dials lock once published or heavily edited.** Changing one
   re-derives the tree and orphans paths. Unlocking is explicit and gated behind
   a blocking diff: *"Regenerating drops 12 of your 340 edits — Pin / Discard /
   Cancel."*
3. **Orphans are reattachable, never discarded for you.** Every silent drop is a
   bug.

---

## 4. The battle handoff ✅ (the arena) / 🔧 (the compiler)

`compileBattlefield(spec, place, opts) => Battlefield` is a pure engine function
returning the exact struct combat already consumes. The arena layer is **shipped
and tested** (commit `486af64`):

- **Walls are edges, not cells.** A wall sits on the border *between* two hexes,
  so a walled interior costs **zero standable ground** — a seven-room layout is
  ~100 edge records rather than ~93 of the board's 252 hexes (37%). It also
  gives doors the right arity: an edge door joins exactly two hexes, where a
  door *hex* would open in six directions.
- Doors are a state on an edge. Solid hexes (pillars, pits, deep water) block
  movement but not sight.
- **Line of sight gates targeting** at any range, including `Battlefield`.
- Deployment zones are supplied by the map, because the default midline rows
  reserve 8 of 14 rows — most of a small board, and meaningless on a cave.

Sanity check against the market: **Foundry VTT and Roll20 both model walls as
segments with independently configurable movement/sight restriction**, and
Foundry's v12 rewrite exists specifically because its hex grid had been "a brick
wall grid" rather than real hexes — a bug Roll20 still ships. Our hex math has
always used proper axial/cube coordinates.

### Arena size is archetype-driven, not global

Measured against `MOVE_RANGE = 6` and bands Near 2 / Far 4 / Distant 6:

| Archetype | Dims | Mean pairwise distance | % of board within one Move of centre |
|---|---|---|---|
| Tavern common room | 10×8 | 4.9 | 99% |
| Ship deck | 12×6 | 5.1 | 92% |
| Cave chamber | 12×10 | 6.0 | 85% |
| Corridor / bridge | 16×5 | 6.3 | 74% |
| **Current default** | **18×14** | **8.8** | **50%** |
| Mountain pass | 20×10 | 8.5 | 53% |

> **A finding for Justin, not a change I made.** The invariant that falls out of
> the tactical-design literature is *mean pairwise distance ≤ your longest range
> band*. At 18×14 the mean is **8.8 against a Distant band of 6** — the average
> pair of combatants cannot engage without moving first, and half the board is
> dead space. Two coherent fixes: drop the default to **14×12** (mean 7.1), or
> raise Distant to 8–9. **I did not touch it** — §6.1 of RULES.md is a settled
> rule and rebalancing your game while you sleep isn't my call. Map-derived
> arenas pick their own size regardless.

Related: deployment currently leaves a **4-hex gap against a 6-hex move**, so
there is no approach phase. The tabletop convention is a no-man's-land of
1.5–2× per-turn movement.

---

## 5. Split party 🔧

`PartyGroup` records keyed on **stable `Character.id`s, never `peerId`s** —
peerIds go stale on every transport reconnect, and the codebase already has
rebinding machinery precisely because of that.

Fog is `known: PlacePath[]` (the shared discovered world) plus per-group `seen`
for asymmetric visibility.

**One active fight at a time in v1** 💭. Widening `combatStore.combat` to
`Record<groupId, CombatState>` touches 33 `useCombatStore(` call sites across 15
files in the app's most safety-critical store. The real complaint — two players
watching a banner for thirty minutes — is solved instead by **routing the
non-fighting group to the atlas** so they keep exploring. Parallel combat stays
a store change later, not a protocol change: `CombatState.groupId` is present
from day one.

---

## 6. Selling maps

An `Atlas` mirrors `Worldpack`'s marketplace fields field-for-field, so the
existing card, fee split, fork, and lineage UI work unchanged. A pack may bundle
up to four atlases; a map may also be sold standalone.

### What the market says people actually pay for

The single most useful number found: **74% of Forgotten Adventures' paying
patrons pay 3× the base price for the Foundry tier** — walls, lighting, and
ambient sound. The *art* is available at the $5 tier. The premium is entirely
for **pre-authored structure that saves an hour of manual wall-tracing.**

That is the whole thesis of this design. Our generator emits `Battlefield` —
walls, doors, deployment zones — as data, from the start. **We sell the prep,
and it's the default rather than the top tier.**

Supporting facts:
- **Platform cut is 30–35% industry-wide** (Roll20 70/30, DriveThruRPG 70/65,
  Inkarnate 30%). Our `WORLDFORGE_FEE_RATE` of **15% is half the incumbent rate**.
- Price expectations are low and clustered: median paid asset ~€4, single maps
  $1–5, themed packs $5–10, bundles $20–70. Cartography Assets enforces a **€2
  floor** as an anti-junk mechanism.
- **Structured metadata is the #1 unmet buyer need.** "I can never find anything
  in the back catalogue" is the loudest complaint across every creator Patreon.
- **"What happens to my library when I stop paying" is a question almost nobody
  answers.** Answering it plainly is a differentiator.
- **Mandatory AI disclosure is now the industry floor** — DriveThruRPG refuses
  AI map packs outright, itch.io de-indexes untagged ones, and AI share is
  inversely correlated with sales tier.

### `fingerprint` is honest about what it is

A hash over the spec plus a fixed probe set. It detects **truncation,
corruption, and generator mismatch** — not forgery, because it's computed
client-side with no key by code the recipient also runs. Import still succeeds
on mismatch; the card shows "unverified". Calling it anti-tampering would be
marketing, and the UI says so.

---

## 7. Decisions log

Every one of these was contested by at least one council judge and survived.

| # | Decision | Why |
|---|---|---|
| A | The atlas **produces** a `Battlefield`, never replaces it | All three architects proposed a non-serializable descriptor. That forks the battle model, makes engine inputs unreproducible from a bug report, and loses edge walls. |
| B | Terrain **rides every combat snapshot** | `ingest` is a wholesale replace, so a field present on `combat_start` and stripped from playback broadcasts **vanishes mid-fight and never recovers**. 1.7 KB on a message already running 11–60 KB. |
| C | **No cross-peer regeneration of authoritative geometry** | `Math.tan`/`Math.acos` are not bit-identical across V8 and JavaScriptCore; ECMA-262 doesn't require it. Transmitting the compiled arena makes float drift cosmetic instead of a desync. |
| D | Zoom is a **stack of local charts**, not one coordinate space | Keeps every coordinate within four significant figures. Deep zoom in SVG dies on float precision otherwise. |
| E | `childAt` is **total** | Otherwise 93.6% of the world has nothing beneath it. |
| F | **Binary passability** in v1; no movement cost | Converting the BFS to uniform-cost search would perturb which equidistant hex `closestReachableTo` picks — changing shipped movement for a feature nobody asked for. |
| G | `RANGE_TO_HEX_DISTANCE.Battlefield` stays `Infinity` | It's asserted by a test and used by authored content in sold worldpacks. On a bounded arena it correctly reads "anywhere on this board". |
| H | **Three protocol messages, no delta stream** | A dropped patch leaves a client stale but stamped current, with nothing to invalidate it. Full re-send of a ≤30 KB doc is cheaper than the failure mode. |
| I | GM notes are **stripped before sync** | `AtlasSpec` excludes notes and marketplace metadata, so stripping is lossless for the fingerprint — a player can still verify what they were handed. |
| J | **No Web Worker, no IndexedDB** | Neither exists in this codebase. A depth-7 descend measured ~1.7 ms cold — inside one frame. And Owlbear Rodeo's own post-mortem on shipping browser-storage-only is blunt: *Safari deletes your data if you don't visit for a week.* |
| K | Generator freeze begins at the **marketplace phase**, not day one | Phases 1–3 each necessarily change output. Declaring a freeze early guarantees the golden file gets re-blessed twice, training exactly the reflex the mechanism exists to prevent. |
| L | Coastlines **gain relief detail on zoom; the land/sea boundary never moves** | Evaluated at a fixed octave count per world, derived from `radiusKm`, never from zoom. A shore that creeps as you approach it puts a creator's port town in open ocean. |

### Deliberately rejected

- **Materialised tile pyramids.** Nowhere for the bytes to live.
- **Harmonic outline signatures** for coastlines — provably star-convex, so no
  bays, no peninsulas, no corridors, no floor plans.
- **Storing rendered SVG as the source of truth.** This is Azgaar's Fantasy Map
  Generator's central sin, and it simultaneously causes its file bloat, its
  corruption, and its version lock-in. Its `\r\n`-delimited format with embedded
  SVG has destroyed users' work for years — one lost a month *including their
  git backups* — because opening the file in an editor normalises line endings.
- **Hex cells for the globe.** Hex duals of a subdivided icosahedron do **not**
  nest (a level-*n+1* hex isn't contained in any level-*n* hex). Quads/triangles
  nest exactly. Promising hex nesting would be a lie.
- **Fibonacci-lattice cells.** Beautifully even, and there's a published O(1)
  inverse — but the index depends on *N*, so changing resolution changes every
  id. Fatal for stable, shareable, lazily-refined addresses.

---

## 8. Build order

| Phase | Delivers | Status |
|---|---|---|
| **0** | Wire the shipped `Battlefield` through store + board; fix the latent bugs it exposes | ✅ |
| **1** | One island, one chart, one fight — seed → terrain → `compileBattlefield` | 🔧 |
| **2** | The scale ladder + the descend/ascend camera | 🔧 |
| **3** | Verticality — structures, floors, caves, rooms | 🔧 |
| **4** | Authoring — overrides, paint tools, the orphan report | 🔧 |
| **5** | The table — split party, fog, sync | 🔧 |
| **6** | Marketplace, bundling, generator freeze | 🔧 |
| **7** | The globe | 🔧 |

**Phase 0 contains no map** — deliberately. It makes a hand-written arena work
end to end before a single line of generation exists.

### The generator's shape (Phase 1+)

Everything under `src/engine/atlas/**` is **pure**, enforced by a test that
reads every file in the directory and asserts no React/DOM/timer/`console`/
`Date.now`/`Math.random` and no store import.

Worldgen takes an explicit `seed: number` rather than the engine's usual
injected `rng`, because a world needs **random access** — derive child K without
generating children 0…K−1. This honours the determinism rule more strictly than
the letter: the function is total, order-independent, and replayable with no
ambient state and no call-order coupling.

```ts
seedOf(spec, path) = path.split('/').reduce(deriveSeed, hash32(seed, gen.major))
```

**The invariant the whole ladder rests on:** terrain at *every* level is sampled
from **the same 3D noise field on the unit sphere**. One global continuous
function; only the tessellation is local. Any generator that shortcuts to
per-chart 2D noise looks perfect in isolation and silently breaks every chart
border.

---

## 9. Open questions for Justin

Everything needed to build was decided (§7). These are yours:

1. **Battlefield default size.** The measurements in §4 say 18×14 is oversized
   for the current range bands. Shrink to 14×12, raise Distant to 8–9, or leave
   it? *(I left it.)*
2. **Deployment gap.** 4 hexes against a 6-hex move means no approach phase.
   Widen to 6–8?
3. **Does a map bought inside a worldpack stay playable if the pack is
   deactivated?** Nobody in this market answers the equivalent question, which
   makes answering it a differentiator.
4. **AI disclosure field on the marketplace card** — the industry floor is now
   mandatory disclosure. Add it before the catalogue exists, or after?
5. **Real-world scale.** `metresPerHex` is currently a display concern. Do you
   want travel time (watches, rations, forced marches) to be *mechanical*, or
   narration like conditions are?
