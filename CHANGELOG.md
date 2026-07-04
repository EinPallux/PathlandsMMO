# Changelog

All notable changes to Pathlands are documented here, per working session. Format follows [Keep a Changelog](https://keepachangelog.com/); the project is pre-release, so entries are grouped by phase rather than semver until 1.0.

## [Phase 1 — Voxel Engine & The Continent] — 2026-07-04

### Added

- **Monorepo** — pnpm workspaces `@pathlands/shared` (pure sim core) and `@pathlands/client` (Vite + React + Three.js + Zustand); TS `strict`, ESLint flat config (with a lint rule that guards `shared/` against DOM/Three/React/Node, `Math.random`, and `Date.now`), Prettier, Vitest, and `vercel.json` for static deploys.
- **`shared/core`** — deterministic seeded RNG (`mulberry32` streams + spatial hashing), seeded Perlin/fBm/ridged noise, vector/scalar math, and world constants (seed, 20 Hz tick, 32-voxel chunks, 3072² world, sea level).
- **`shared/worldgen`** — `World` class: domain-warped nearest-centre biome Voronoi over the six WORLD.md zones with smooth inter-zone height blending; elevation with fBm hills + ridged mountains, north/east crag walls, south/west sea, meandering rivers, beaches, cliff-band rock, Peaks snowline & crystal veins, and 3D-noise cave carving in cave biomes. `generateChunk`, `voxelAt`, `isSolidAt`, `isFluidAt`, `sampleColumn`.
- **`shared/models`** — code-authored voxel model format (typed pivoted parts), `VoxelSet` builder (box/set/paint/carve/mirror/translate), named palette + terrain colours, the shared humanoid rig with 9 keyframe animation clips, and the four playable class models (Warrior/Ranger/Priest reconstructed from the PNGs, Mage authored new) with skin/hair appearance options.
- **`shared/sim`** — pure, tick-based movement & capsule-vs-voxel AABB collision (gravity, jump, swim buoyancy, step-up), intents (`MoveIntent`), and player physics types. This is the input→intent→simulation boundary that becomes server-authoritative in Phase 6.
- **`shared/proto`** — versioned save schema with forward-migration and defaulting.
- **`client/engine`** — greedy voxel mesher (vertex colours + baked ambient occlusion, correct winding, AO-aware diagonal flip); a Web-Worker chunk pipeline (`chunkWorker` + `chunkManager`) with nearest-first ring streaming, cross-chunk border culling, and per-mesh frustum culling; the voxel-model renderer with part-keyframe animation playback; a collision-aware third-person + free-fly `CameraRig`; and the `Environment` (gradient sky shader, day/night sun/moon, hemisphere ambient, water plane, fog).
- **`client/game`** — the `Game` orchestrator (fixed 20 Hz tick with interpolated rendering), input capture, the shared-rules player controller, and a Zustand UI store bridging sim → React.
- **`client/ui`** — loading screen (uses the inn render as splash art), HUD (biome/clock/position/state/controls), dev overlay (FPS/draw-calls/triangles/chunks, class switcher, zone teleports, view-distance & day-speed controls, free-fly/respawn/map), and the 2D seed-inspector world atlas map.
- **Tests** — 58 Vitest unit tests: RNG/noise determinism & golden sequences, worldgen region-hash determinism + structure (biome placement, no-holes, water, crags, caves, all-six-biomes, voxelAt/chunk agreement), movement (gravity/jump/wall/step-up/swim/determinism), greedy mesher (culling/merging/AO/determinism), character models (rig parts, clip set, budgets), and save round-trip/migration.

### Verified

- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green.
- Headless-Chromium (SwiftShader) smoke + interaction pass: boots to playable, streams 149 chunks, spawns in Heartmead Vale, teleports to Glimmerpeaks (snow-capped mountains render), live class-switch to Mage, and opens the world map showing all six zones correctly placed. 62–86 draw calls; 182 KB gzipped initial JS.

### Notes

- Real-hardware 60 FPS is unmeasured in the headless CI environment (SwiftShader is CPU-only); triangle/draw-call/bundle budgets are met. To re-confirm on a real GPU during Phase 2.

## [Phase 0 — Planning] — 2026-07-04

### Added

- Complete planning documentation set: `README.md`, `CLAUDE.md`, `AGENTS.md`, `ROADMAP.md`, `CHANGELOG.md`, `docs/GAME_DESIGN.md`, `docs/WORLD.md`, `docs/ARCHITECTURE.md`, `docs/ART_GUIDE.md`.
- Six-phase development plan with per-phase deliverables and acceptance criteria (ROADMAP.md).

### Decided

- Combat: tab-target + hotbar (WoW-Classic style), not action combat.
- Scope: level cap 30, six zones on one ~3×3 km continent, ~110 quests, five open-world dungeons ("Hollows"), four classes (Warrior, Ranger, Priest, Mage — Mage art to be authored).
- Asset pipeline: 3D voxel models authored in code (typed voxel grids, meshed at runtime, never .vox); existing `public/assets/` PNGs used directly as UI art (portraits, character select, bestiary) and as style references for the 3D reconstructions.
- Stack: TypeScript strict, pnpm workspaces (`client/` Vite+React+Three.js+Zustand, `shared/` pure deterministic sim core, `server/` in Phase 6 with Node.js+WebSockets+PostgreSQL); client on Vercel through Phase 5, MMO server on Linux VPS via Docker Compose in Phase 6.
- MMO-readiness rules from day one: all game rules in `shared/`, seeded RNG, fixed-tick simulation, deterministic worldgen, input→intent→simulation flow.

## [Pre-planning] — 2026-07-03

### Added

- First game asset renders under `public/assets/`: 3 class portraits, 10 enemies, 12 medieval buildings, 1 wolf mount (commit `2e53111`).
