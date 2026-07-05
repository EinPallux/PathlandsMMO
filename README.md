# Pathlands

**Pathlands** is a 3D voxel browser MMORPG in the visual spirit of _Cube World_ and the design spirit of old-school MMORPGs (think World of Warcraft Classic — fewer systems, deeper world). It runs entirely in the browser, built on **Three.js + TypeScript**, and is developed **solo-first**: every phase up to the last produces a fully playable single-player game deployable on **Vercel**. The final phase turns it into a true MMO with a server-authoritative Node.js backend hosted on a **Linux VPS**.

> One continent. One shared world. No instances. Follow the Old Paths.

## Current Status

**Phase 0 — Planning: complete.** No gameplay code exists yet. See [ROADMAP.md](ROADMAP.md) for the phase plan and current progress.

## Core Pillars

1. **A world worth walking through** — one handcrafted-feeling continent (~3×3 km, six zones), generated deterministically from a fixed seed with authored towns, roads, and dungeons. Not endless, not instanced.
2. **Old-school MMORPG bones** — tab-target hotbar combat, levels 1–30, quests, gear, professions, open-world dungeons, mounts, meta progression.
3. **Solo-friendly by design** — an indie MMO won't have thousands of concurrent players. All content is tuned to be completable alone; groups make it faster and richer, never mandatory.
4. **Browser-native and performant** — 60 FPS on a mid-range laptop, fast load, no plugins, no downloads.
5. **MMO-ready from day one** — game rules live in a pure, deterministic simulation core so authority can move from client to server in the final phase without a rewrite.

## Documentation Map

| Document                                     | Purpose                                                                           |
| -------------------------------------------- | --------------------------------------------------------------------------------- |
| [CLAUDE.md](CLAUDE.md)                       | Instructions & conventions for AI coding sessions (read first)                    |
| [AGENTS.md](AGENTS.md)                       | Entry point for generic AI agent tooling                                          |
| [ROADMAP.md](ROADMAP.md)                     | The 6 development phases, deliverables, acceptance criteria, live status          |
| [CHANGELOG.md](CHANGELOG.md)                 | What changed, per session/phase                                                   |
| [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md)   | Full game design document: systems, classes, combat, quests, professions, economy |
| [docs/WORLD.md](docs/WORLD.md)               | World atlas: lore, zones, towns, dungeons, enemy placement                        |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Technical architecture: engine, worldgen, save system, netcode, deployment        |
| [docs/ART_GUIDE.md](docs/ART_GUIDE.md)       | Voxel style guide, asset pipeline, asset inventory & wishlist                     |

## Tech Stack (summary)

- **Client:** TypeScript (strict), Vite, Three.js, React (DOM overlay UI), Zustand
- **Shared simulation core:** pure TypeScript — worldgen, combat math, quest logic; no DOM, no Three.js
- **Server (Phase 6):** Node.js, WebSockets, PostgreSQL, Docker Compose on a Linux VPS
- **Hosting:** client on Vercel (all phases); game server on VPS (Phase 6)

Details and rationale in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Repository Layout (planned)

```
client/          Vite + React + Three.js app (deployed to Vercel)
server/          Node.js game server (created in Phase 6, deployed to VPS)
shared/          Deterministic simulation core + game data (used by both)
public/assets/   2D voxel-art renders (UI portraits & style references)
docs/            Design & architecture documentation
```
