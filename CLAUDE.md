# CLAUDE.md — Instructions for AI Coding Sessions

Pathlands is a 3D voxel browser MMORPG (Cube World visuals, WoW-Classic-style design), developed in six major phases. Phases 1–5 build a complete, fully playable **single-player** game deployable on **Vercel**. Phase 6 — and only Phase 6 — adds the MMO layer (server authority, accounts, sync) hosted on a **Linux VPS**. Every architectural decision before Phase 6 must keep that ending in mind.

## Read Before Coding

1. **ROADMAP.md** — find the current phase and its acceptance criteria. Work on the current phase only; do not start the next phase's deliverables early.
2. **docs/GAME_DESIGN.md** — system specs (combat math, XP curve, item stats, quest types…). Implement what is written there; if a spec is missing or contradictory, extend the GDD in the same commit as the code.
3. **docs/ARCHITECTURE.md** — engine and module design. Follow it; if you must deviate, update the doc and record why in CHANGELOG.md.
4. **docs/WORLD.md** — zone layout, towns, dungeons, spawn tables when doing world/content work.
5. **docs/ART_GUIDE.md** — before authoring any voxel model or UI art usage.

## Session Workflow (mandatory)

1. Pick the next unchecked deliverable(s) of the current phase in ROADMAP.md.
2. Implement fully — a deliverable is code + data + integration, not a stub. "Major milestone, not skeleton" is the project's explicit standard.
3. Verify: run `pnpm typecheck`, `pnpm test`, `pnpm build`, and actually launch the game (`pnpm dev`) to exercise the feature end-to-end before declaring it done.
4. **Update the docs in the same session** — this is a hard requirement:
   - ROADMAP.md: check off completed deliverables; update the phase status line.
   - CHANGELOG.md: add an entry (Keep-a-Changelog style) describing what was added/changed/fixed.
   - GDD / ARCHITECTURE / WORLD / ART_GUIDE: update whichever the work touched (new formulas, new models, changed module boundaries…).
5. Commit with clear messages; push to the designated branch.

A phase is complete only when **every** acceptance criterion in ROADMAP.md passes. Mark it complete in ROADMAP.md and CHANGELOG.md, then begin the next phase in a later session.

## Non-Negotiable Engineering Rules

### MMO-readiness (applies from the first line of code)

- **All game rules live in `shared/`** — combat math, XP, loot rolls, movement constants, quest state machines, profession logic, worldgen. `shared/` is pure TypeScript: no DOM, no Three.js, no React, no Node-specific APIs. In Phase 6 the server imports it unchanged.
- **No `Math.random()` in simulation code.** Use the seeded RNG from `shared/` (deterministic, stream-per-system). UI-only cosmetics may use unseeded randomness.
- **No wall-clock time in simulation code.** The sim advances on fixed ticks (see ARCHITECTURE.md). `Date.now()` is allowed only at the integration edge (client bootstrap, save timestamps).
- **Worldgen is deterministic** from the fixed world seed. Same seed + same code ⇒ byte-identical world on any machine. There is exactly one world; the seed is a checked-in constant.
- **Input → Intent → Simulation.** The player's input produces intents (e.g. `CastSkill{skillId, targetId}`); the simulation validates and applies them. Never mutate game state directly from UI handlers. In Phase 6, intents become network messages and validation moves server-side.
- **Data-driven content.** Items, skills, enemies, quests, NPCs, loot tables, zones are TypeScript data modules in `shared/data/` with typed schemas — not hardcoded in gameplay logic.

### Code quality

- TypeScript `strict: true`; no `any` (use `unknown` + narrowing). ESLint + Prettier, checked in CI-style via `pnpm lint`.
- pnpm workspaces monorepo: `client/`, `shared/`, and (Phase 6) `server/`.
- Keep chunk meshing and worldgen off the main thread (Web Workers) — see ARCHITECTURE.md.
- Performance budgets (mid-range laptop, integrated GPU): ≥ 60 FPS steady, ≤ ~250 draw calls in a typical scene, initial JS bundle ≤ 3 MB gzipped, time-to-playable ≤ 5 s on a warm cache.
- Unit tests (Vitest) for `shared/`: worldgen determinism, combat formulas, XP/loot math, quest state machines, save migration. UI/engine code is verified by playing, not over-tested.

### Assets

- **Never use .vox files or any external 3D model formats.** All 3D voxel models are authored **in code** as typed voxel-grid data (see docs/ART_GUIDE.md for the format) and meshed at runtime.
- The PNGs in `public/assets/` are 2D renders: use them **directly as UI art** (portraits, character select, bestiary, loading screens) and as the **style reference** when authoring the matching 3D voxel model in code.
- New assets (trees, rocks, props, NPCs, additional enemies, the Mage class, fish, ores, herbs…) are authored by Claude in code following docs/ART_GUIDE.md — palette, proportions, and naming rules live there. Keep every new model consistent with the existing art.
- Do not download assets from the internet. Do not rename the existing PNG files (yes, "Medival" is misspelled in the filenames; reference them exactly as-is or map them through a manifest module).

### Deployment

- Phases 1–5: `client/` must always build to a static site deployable on Vercel (`pnpm build` → repo-root `dist/`; the client's Vite `outDir` targets the root so Vercel finds the output unambiguously — see `vercel.json`). Never introduce a hard server dependency before Phase 6.
- Phase 6: server runs on a Linux VPS via Docker Compose (Node.js + PostgreSQL + nginx/TLS). Client stays a static deploy (Vercel or served by the VPS nginx — both must work). See ARCHITECTURE.md §Deployment.
- Saves in Phases 1–5 are local (IndexedDB) using the same versioned character/world-state schema that PostgreSQL stores in Phase 6.

## Design Guardrails

- **Solo-first tuning.** Every quest, dungeon ("Hollow"), and boss must be completable by a solo player of the appropriate level. Group play scales difficulty/rewards up; it never gates content.
- **One world.** No instanced maps, no loading screens between zones, no teleport-only areas. Interiors and caves are part of the continent mesh.
- **Old-school feel, simple systems.** When in doubt, choose the simpler mechanic executed well (see GDD "Design Pillars"). Gear is not rendered on character models — by design.
- Combat is **tab-target + hotbar** (GDD §Combat). Do not drift toward action combat.
- Scope is fixed: level cap 30, six zones, ~110 quests, five Hollows, four classes (Warrior, Ranger, Priest, Mage). Don't silently expand or shrink scope; propose changes via ROADMAP.md edits.

## Commands (once code exists — keep this section updated)

```bash
pnpm install          # install workspace deps
pnpm dev              # run client dev server (Vite)
pnpm build            # production build → repo-root dist/ (Vercel output)
pnpm typecheck        # tsc --noEmit across workspaces
pnpm lint             # eslint + prettier check
pnpm test             # vitest (shared/ simulation tests)
# Phase 6 additions: pnpm dev:server, docker compose up, etc.
```
