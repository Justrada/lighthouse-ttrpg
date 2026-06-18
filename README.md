# LIGHTHOUSE

A luminous, browser-based tabletop RPG you can create characters for and play with your party — no installs, no accounts, no server bills. One person hosts a table, shares a room code, and the party plays together in real time over a peer-to-peer connection.

This is a ground-up rebuild of an earlier vanilla-JS prototype into a modern, type-safe, professionally polished web application.

## Highlights

- **Character Forge** — build heroes with a point-buy stat system, a 124-skill interactive skill tree, and equipment.
- **Real-time multiplayer** — GM hosts, players join by room code over WebRTC (PeerJS). Resilient heartbeat + auto-reconnect.
- **Full combat engine** — simultaneous action declaration, per-action initiative, abilities, weapons, saving throws, status effects, AOE, death saves — all faithfully ported and unit-tested.
- **Arcane Lighthouse** design language — a dark, atmospheric UI with a warm lighthouse beam cutting through the night.
- **$0 hosting** — deploys as a static site to Vercel, Netlify, or GitHub Pages.

## Tech stack

React 18 · TypeScript · Vite · Tailwind CSS · Zustand · Framer Motion · PeerJS · Vitest

## Architecture

The codebase is built in clean layers, each independently testable:

```
src/
  types/        Shared domain model — the single source of truth for data shapes
  data/         Game content (skill tree, items) converted to typed JSON + loaders
  engine/       Pure, deterministic game rules (no React/DOM/network). Unit-tested.
  net/          Backend-swappable Transport abstraction; PeerJS + in-memory mock impls
  store/        Zustand stores wiring engine + net together (roster, draft, session, combat, ui)
  components/   Presentational design-system library (ui / atmosphere / brand)
  screens/      Routed feature screens composed from the above
```

The **network layer is deliberately abstracted** behind a `Transport` interface (`src/net/transport.ts`). PeerJS is one implementation; a real authoritative server (WebSockets/Colyseus) can be added later by implementing the same interface — no changes to stores or screens.

The **engine is pure and deterministic** (randomness is injectable), so combat math is fully unit-tested and could power replays or a server-authoritative mode unchanged.

## Getting started

```bash
npm install
npm run dev        # start the dev server
npm run build      # type-check + production build
npm run preview    # preview the production build
npm test           # run the engine/network unit tests
```

Game content is generated from the legacy data file by `scripts/convert-data.mjs` (already run; re-run if the source data changes):

```bash
node scripts/convert-data.mjs
```

## How to play

1. **Forge a character** from the home screen (or the GM can spin up NPCs).
2. **Host a table** — you get a short room code. Share it with your party.
3. **Players join** by entering the room code and choosing a character.
4. The GM runs the scene, starts combat, and the party declares actions each round. The lighthouse does the bookkeeping; you do the storytelling.

## Deployment

It's a static SPA. Any static host works; SPA routing fallback is configured for Vercel (`vercel.json`) and Netlify (`public/_redirects`).

```bash
npm run build      # outputs to dist/
```

## License

ISC — built for Justin Estrada's TTRPG.
