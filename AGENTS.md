# AGENTS.md

This repository is developed primarily through AI coding sessions (Claude Code / Opus). If you are an AI agent working in this repo:

1. **Read [CLAUDE.md](CLAUDE.md) first.** It is the canonical instruction file — session workflow, engineering rules, asset rules, and design guardrails all live there and apply to every agent, regardless of tooling.
2. **Check [ROADMAP.md](ROADMAP.md)** for the current phase and its acceptance criteria before making changes. Work only on the current phase.
3. **Specs live in `docs/`** — [GAME_DESIGN.md](docs/GAME_DESIGN.md) (systems), [WORLD.md](docs/WORLD.md) (content/zones), [ARCHITECTURE.md](docs/ARCHITECTURE.md) (engine/modules), [ART_GUIDE.md](docs/ART_GUIDE.md) (voxel models & style). Implement what's written; update the doc in the same commit if reality must diverge.
4. **Always update ROADMAP.md and CHANGELOG.md** at the end of a working session. Documentation updates are part of the definition of done, not optional.

## Quick Facts

- Project: **Pathlands** — 3D voxel browser MMORPG (Cube World look, WoW-Classic-style design), solo-playable through Phase 5, true MMO in Phase 6.
- Stack: TypeScript strict, pnpm workspaces (`client/` Vite+React+Three.js, `shared/` pure sim core, `server/` in Phase 6: Node.js + PostgreSQL).
- Hard rules: game logic only in `shared/`; seeded RNG and tick-based time in simulation code; deterministic worldgen from a fixed seed; voxel models authored in code (never .vox or downloaded assets); client must always build as a static Vercel deploy until Phase 6.
- Verify before done: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`, plus actually playing the affected feature in `pnpm dev`.
