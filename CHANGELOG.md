# Changelog

All notable changes to Pathlands are documented here, per working session. Format follows [Keep a Changelog](https://keepachangelog.com/); the project is pre-release, so entries are grouped by phase rather than semver until 1.0.

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
