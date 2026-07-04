# Pathlands — Technical Architecture

Engine and infrastructure spec. The governing constraint: **Phases 1–5 ship a client-only game on Vercel; Phase 6 moves authority to a Node.js server on a Linux VPS without rewriting game logic.** Every boundary below exists to serve that migration.

## 1. Stack & Rationale

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript, `strict` everywhere | One language across client/shared/server; the shared sim core is the whole plan |
| 3D | **Three.js** (no game framework) | Mature, performant enough for chunked voxel rendering with our own meshing; full control |
| Client app | Vite + React (DOM overlay UI) + Zustand | Vite for DX/static builds (Vercel); React only for UI panels — the 3D scene is plain Three.js; Zustand bridges sim→UI cheaply |
| Sim core | `shared/` pure TS package | No DOM/Three/Node imports — enforced by ESLint import rules + a dedicated tsconfig |
| Server (P6) | Node.js 22, `ws` (upgrade to `uWebSockets.js` only if load tests demand), PostgreSQL, Drizzle ORM | Boring, debuggable, fits a single VPS; imports `shared/` unchanged |
| Persistence | IndexedDB (P1–5, via `idb-keyval`) → PostgreSQL (P6) | Same versioned schema both sides |
| Deploy | Vercel static (client) · Docker Compose on VPS (server+db+nginx) | Matches the phase plan |

Explicit **no**s: no .vox/GLTF asset files (models are code, see ART_GUIDE), no physics engine (voxel AABB collision is bespoke and simple), no ECS framework (plain typed structures + systems functions; an ECS library is complexity we don't need at this entity count), no Colyseus (we want protocol control and `shared/` reuse).

## 2. Monorepo

```
pathlands/
├─ client/                 # Vite app → Vercel
│  ├─ src/engine/          # Three.js: renderer, chunk mesher glue, cameras, VFX, workers
│  ├─ src/game/            # client game loop, input→intent, prediction (P6), interpolation
│  ├─ src/ui/              # React: HUD, panels, screens (reads Zustand stores)
│  └─ src/platform/        # saves (IndexedDB), settings, audio, (P6) net transport
├─ shared/                 # THE game. Pure TS, zero platform imports
│  ├─ src/sim/             # tick loop, entities, combat, movement rules, AI, professions, quests
│  ├─ src/worldgen/        # deterministic continent generation + authored layer application
│  ├─ src/models/          # voxel model definitions (code-authored) + rig/animation data
│  ├─ src/data/            # items, skills, enemies, quests, loot, zones, NPCs, deeds (typed)
│  └─ src/proto/           # intent & (P6) network message schemas, save schema + migrations
├─ server/                 # P6 only: Node entry, ws gateway, auth, persistence, ops
├─ public/assets/          # 2D renders (UI art + style refs) — never renamed
└─ docs/
```

Rule of thumb: if deleting `client/` would lose game *rules*, the code is in the wrong package.

## 3. Simulation Core (`shared/sim`)

- **Fixed tick: 20 Hz** (50 ms). Client renders at display rate and interpolates visual state between sim ticks. The sim never reads wall-clock time; durations are tick counts.
- **State:** plain serializable objects in typed stores (entities, players, spawners, quest states, node timers). Snapshot = `structuredClone`-safe by construction — this is also the save format and (P6) the network snapshot source.
- **Intents:** the only way anything changes. `{type: 'Move', dir…}`, `{type: 'CastSkill', skillId, targetId}`, `{type: 'LootItem'…}`, `{type: 'AcceptQuest'…}` — defined in `shared/proto`. Client input produces intents; sim validates (range, resource, cooldown, ownership) and applies. P6: intents serialize to the server verbatim; validation code is already the authority.
- **Seeded RNG:** xoshiro/PCG streams keyed by domain (`rng.loot`, `rng.ai`, `rng.crit`…) forked per encounter, so replays/tests are deterministic and server/client can't diverge on shared rolls.
- **Systems order per tick:** inputs/intents → AI → movement+collision → combat resolution → DoT/HoT/auras → spawners/respawns → quest/deed triggers → economy/professions → events out. Events (damage numbers, level-ups, loot toasts) flow to UI via a ring buffer; UI never reaches into sim state to mutate.

## 4. World Generation (`shared/worldgen`)

Deterministic function of `WORLD_SEED` (checked-in constant) + authored data. Two layers:

1. **Procedural base:** continent mask → elevation (stacked simplex octaves shaped by the zone macro-map from WORLD.md) → rivers/lakes via downhill carving → biome assignment (zone regions with 30–60 m blended borders) → surface palette + strata → cave/canyon carving fields → scatter fields (trees/rocks/nodes) sampled per-biome with blue-noise.
2. **Authored layer** (`shared/data/world/`): declarative placements evaluated after the base — settlements (building placements from the kit + terrain flattening brushes), roads (spline → surface material + gentle grading), Waystones, Hollow entrances + carved interiors (voxel stamp brushes), spawn regions, named-rare routes. This is how the world feels designed while staying a pure function.

Chunks (32×32 columns × 192 high) generate on demand in Web Workers from `(seed, chunkX, chunkZ)` — identical output anywhere, including the P6 server (which generates collision-relevant data only, no meshes). Worldgen tests assert region hashes so refactors can't silently reshape the world.

**Terrain is not player-mutable** (no digging/building — an explicit design cut; professions interact with authored node objects, not voxels). This keeps chunks regenerable, saves tiny, and MMO sync tractable.

## 5. Rendering (client)

- **Chunk meshing:** greedy meshing over visible faces, **vertex colors only** (no textures — Cube World look comes from palette + AO + lighting). Per-vertex baked AO; one shared material → one draw call per chunk section. Mesh in workers (transferable buffers), ring-buffered around the player; view distance ~8–10 chunks with distance fog hiding the edge.
- **Models/props:** voxel models mesh once per model+palette variant, then `InstancedMesh` for repeated props (trees, rocks, fences, nodes). Characters/enemies are per-part meshes on a simple bone hierarchy (see ART_GUIDE §Rig) — part-transform keyframe animation (position/rotation per part), tweened on the client from sim animation state (`idle/walk/attack…`).
- **Lighting:** one directional sun (day/night cycle) + hemisphere ambient + a small pool of point lights for emissives (lanterns, crystals, VFX). Shadows: single cascaded shadow map, quality-setting gated.
- **VFX (P5):** instanced quad/voxel particles, pooled; skill effects data-driven per skill id.
- Budgets (from CLAUDE.md): ≥60 FPS mid-range laptop, ≤~250 draw calls typical, ≤3 MB gzipped JS, ≤5 s to playable warm.

## 6. Saves (P1–5) → Persistence (P6)

- Versioned schema in `shared/proto/save.ts`: `{version, account: {pathPoints, deeds, perks}, characters: [{identity, class, level, xp, stats, inventory, equipment, gold, skills, paths, quests, professions, discoveredWaystones, position…}]}`.
- P1–5: IndexedDB, autosave every 30 s + on significant events; 3 rotating backups; explicit migration functions per version bump with round-trip tests.
- P6: same schema decomposed into PostgreSQL tables (accounts, characters, character_state JSONB for cold data + hot columns for queryable bits); a one-time importer lets local solo saves upload as a starting character (best-effort, server re-validates all values against legal bounds — no trusting client-grown stats).

## 7. Netcode (designed now, built in Phase 6)

- **Transport:** WebSocket (wss via nginx). Messages: length-prefixed binary (MessagePack initially; hand-rolled codecs only where profiling justifies).
- **Authority:** server runs the same `shared/sim` at 20 Hz and is sole truth. Clients send intents (rate-limited, sequence-numbered); server responds with acks + authoritative state.
- **Replication:** interest management = 3×3 chunk subscription around each player. Per tick-bundle (every 2nd tick, 10 Hz on the wire): entity deltas (pos quantized to 1/16 voxel, hp%, anim state, buff bits) for subscribed cells; full snapshot on subscribe. Reliable event channel for chat/loot/quests.
- **Feel:** own movement client-predicted + reconciled (movement rules already live in `shared/`, so prediction is literally running the same function); remote entities interpolated 100–150 ms behind; casts show locally at cast-start, resolve on server confirm (tab-target tolerance makes this easy — the reason we chose it).
- **Scale target:** 200 CCU on one 4-vCPU VPS process; zone-sharding by region grid is the documented escape hatch, not built until needed.
- **Cheat posture:** server validates everything (already true by construction); sanity ceilings on move speed/teleport deltas/action rates; server-side cooldown & resource books; no client-supplied numbers ever applied.

## 8. Server & Ops (Phase 6)

- `server/`: ws gateway (auth handshake → session) · sim host (imports `shared/`) · persistence writer (dirty-state flush every 30 s + on logout/events) · REST endpoints for auth (register/login/reset, argon2id, rate-limited).
- PostgreSQL via Drizzle; nightly `pg_dump` to VPS-local + offsite copy; restore drill documented in the runbook.
- **Docker Compose:** `game` (Node), `db` (Postgres + volume), `nginx` (TLS via certbot companion, serves wss reverse-proxy — and optionally the static client). Client stays deployable on Vercel pointing at `wss://play.<domain>`; both topologies must work.
- GitHub Actions: typecheck/lint/test on push; deploy job (build → rsync/registry → `docker compose up -d`) on tagged release. Structured pino logs; minimal metrics (CCU, tick p95, DB latency) exposed to a status endpoint; GM commands behind an admin token.

## 9. Testing Strategy

- **Vitest on `shared/`** (the only heavily-tested layer): worldgen region hashes & determinism, collision/movement edge cases, combat formula tables (GDD §4 as fixtures), XP/loot distributions (seeded), quest state machines, save migrations round-trip. Target: fast (<10 s) so it runs every session.
- Client: type-safety + play verification per CLAUDE.md workflow; one Playwright smoke (boot → create character → move → kill a boar) added in Phase 3 and kept green.
- P6: protocol fuzz (malformed/hostile intents), scripted hostile client (speed/teleport/cooldown attacks), 200-bot load harness.

## 10. Risk Register (watch these)

1. **Meshing/GC pressure** on chunk churn → transferable buffers, pooled geometry, profile early (Phase 1 acceptance gate).
2. **Content pipeline throughput** (110 quests, ~40 models) → data-driven schemas + authoring helpers *first*, content second (ordering inside Phases 2–4 reflects this).
3. **Prediction edge cases in P6** (swim/fall/slope) → movement rules pure & tick-based from Phase 1; record/replay harness for divergence hunting.
4. **Safari/WebGL quirks** → compatibility pass is a Phase 5 deliverable, not a launch surprise.
5. **Scope creep** → ROADMAP backlog section is the only door; GDD scope constants are load-bearing.
