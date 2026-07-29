# CLAUDE.md — LIGHTHOUSE (`lighthouse-web`)

Working notes for AI agents. The game is **this** React app; the vanilla prototype
in the parent folder is **reference-only — do not edit it for features**.

## Commands (run from `lighthouse-web/`, the repo root)
- `npm run dev` — Vite dev server
- `npm run build` — `tsc --noEmit && vite build` (must pass before committing)
- `npm test` / `npx vitest run` — full test suite
- `npm run typecheck` — `tsc --noEmit`

## Source of truth
`docs/RULES.md` is the canonical rules reference: a rule tagged ✅ that the code
contradicts is a **bug**. Keep RULES.md in sync when engine formulas change.
Worldforge design: `docs/WORLDFORGE.md`.

## Architecture (do not violate)
One-way layered deps: `types → data → engine → net → store → components → screens`.

- **`src/engine/**` is PURE and deterministic.** No React/DOM/network/timers; it
  never imports a store; randomness is injected (`rng: () => number`). It emits
  domain log entries (`CombatLogEntry`) as **data** — it must **not** call
  `console.*`. Do not add logging here.
- **`src/data/skillTree.ts` is the resolution spine.** `findNode`/`findItem` read a
  swappable **active catalog** (base by default; a Worldforge System can
  `extend`/`replace` it). `center-0` is the hardcoded skill-tree root.
- **Reskins are display-only** (`src/lib/reskin.ts` / `useReskin()`); custom
  **content** resolves through the engine via the active catalog.
- **Trust boundary:** all imported/networked content passes through `normalize*`
  (`src/lib/worldpack.ts`, `src/lib/character.ts`, `src/lib/combat.ts`,
  `src/net/validate.ts`). Don't loosen these.
- **App-shell logging:** use `src/lib/logger.ts` (warn/error always emit;
  debug/info are dev-only). Not for the pure engine.

## Deploy
Pushes to `main` auto-deploy to GitHub Pages (`.github/workflows/deploy.yml`).
Open a PR for review; don't push straight to `main` unless asked.
