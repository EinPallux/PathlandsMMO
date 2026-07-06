# Pathlands — Technical Architecture

Engine and infrastructure spec. The governing constraint: **Phases 1–5 ship a client-only game on Vercel; Phase 6 moves authority to a Node.js server on a Linux VPS without rewriting game logic.** Every boundary below exists to serve that migration.

## 1. Stack & Rationale

| Layer       | Choice                                                                                            | Why                                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Language    | TypeScript, `strict` everywhere                                                                   | One language across client/shared/server; the shared sim core is the whole plan                                               |
| 3D          | **Three.js** (no game framework)                                                                  | Mature, performant enough for chunked voxel rendering with our own meshing; full control                                      |
| Client app  | Vite + React (DOM overlay UI) + Zustand                                                           | Vite for DX/static builds (Vercel); React only for UI panels — the 3D scene is plain Three.js; Zustand bridges sim→UI cheaply |
| Sim core    | `shared/` pure TS package                                                                         | No DOM/Three/Node imports — enforced by ESLint import rules + a dedicated tsconfig                                            |
| Server (P6) | Node.js 22, `ws` (upgrade to `uWebSockets.js` only if load tests demand), PostgreSQL, Drizzle ORM | Boring, debuggable, fits a single VPS; imports `shared/` unchanged                                                            |
| Persistence | IndexedDB (P1–5, hand-rolled wrapper, rotating backups) → PostgreSQL (P6)                         | Same versioned schema both sides                                                                                              |
| Deploy      | Vercel static (client) · Docker Compose on VPS (server+db+nginx)                                  | Matches the phase plan                                                                                                        |

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

Rule of thumb: if deleting `client/` would lose game _rules_, the code is in the wrong package.

## 3. Simulation Core (`shared/sim`)

- **Fixed tick: 20 Hz** (50 ms). Client renders at display rate and interpolates visual state between sim ticks. The sim never reads wall-clock time; durations are tick counts.
- **State:** plain serializable objects in typed stores (entities, players, spawners, quest states, node timers). Snapshot = `structuredClone`-safe by construction — this is also the save format and (P6) the network snapshot source.
- **Intents:** the only way anything changes. `{type: 'Move', dir…}`, `{type: 'CastSkill', skillId, targetId}`, `{type: 'LootItem'…}`, `{type: 'AcceptQuest'…}` — defined in `shared/proto`. Client input produces intents; sim validates (range, resource, cooldown, ownership) and applies. P6: intents serialize to the server verbatim; validation code is already the authority.
- **Seeded RNG:** xoshiro/PCG streams keyed by domain (`rng.loot`, `rng.ai`, `rng.crit`…) forked per encounter, so replays/tests are deterministic and server/client can't diverge on shared rolls.
- **Systems order per tick:** inputs/intents → AI → boss-encounter scripts → combat resolution → DoT/HoT/auras → spawners/respawns → quest/deed triggers → economy/professions → events out. Events (damage numbers, level-ups, loot toasts, `bossPhase` barks) flow to UI via a ring buffer; UI never reaches into sim state to mutate.
- **Content is data (`shared/data`):** enemies/skills/items/loot, the **world spawn table** (`spawns.ts` — one region list for zones + Hollow packs + bosses, referencing the settlement/Hollow coords), **boss encounter scripts** (`EnemyDef.boss` — HP-threshold beats interpreted by `stepBossMechanics`), **vendor** stock/pricing (`vendors.ts`), and **quests** (`data/quests` — typed `QuestDef`s + quest-giver placement). The client driver activates spawn regions by player proximity (culling distant enemies); in P6 the server owns spawning and boss scripts unchanged.
- **Quests (`shared/quests`):** a pure state machine over the quest definitions — `acceptQuest` → `applyQuestEvent` (advances objectives from kills/exploration/talks/world-object use) → `turnInQuest` (returns the reward to grant). The client's `QuestDirector` feeds it events and grants rewards; P6 moves the log server-side unchanged.
- **Professions (`shared/professions`):** a pure skill/gather engine (difficulty curve, `gatherNode`, `rollFish`) over material/tier data. Gather nodes are **not** stored state — they are re-derived from the deterministic `world.scatterChunk`, so the client's `GatherDirector` tracks depletion/respawn locally and banks materials + skills into the save.
- **Meta (`shared/meta`):** a pure Deed/perk engine over `shared/data/deeds.ts` + `perks.ts`. `applyDeedProgress(state, metric, amount?)` advances every Deed keyed on that metric (tiered Deeds share one counter), clamps to threshold, and returns award notices once complete; `buyPerk`/`perkMagnitude` handle the Path-Point economy. The client's `MetaDirector` subscribes to the same kill/boss/Waystone/quest/craft/gather events the other directors emit, awards Path Points, and pushes perk magnitudes (bag cap, travel-fee cut) into the `CombatDirector`. Kept account-scoping out for now: meta rides on the character save until Phase-6 accounts.
- **Mounts:** speed is a simulation input, not a client hack — `MoveIntent.speedMult` carries a **clamped** ground-speed multiplier into `stepPlayerMovement` (mount + Trailblazer's out-of-combat perk), so the same intent→sim path a Phase-6 server validates governs mount speed. Mount data/models are `shared/data/mounts.ts` + `shared/models/creatures/mounts.ts`. The client `MountController` owns owned-mount state and the rules (level 20, outdoor-only, dismount-on-combat), renders the ridden Wolf, and each tick computes the multiplier the game feeds the movement intent. Deed completion can unlock a skin (`MetaDirector.onDeedComplete` → `MountController.grantSkinForDeed`).
- **Bank & mail:** the Waymeet vault and the mail inbox are per-character storage on the `CombatDirector` (they move item stacks + gold, so they live alongside the bag). Mail content is data (`shared/data/mail.ts`); the inbox is seeded from `STARTER_MAIL` and the level-5 letter is delivered from the level-up path. Both are key-toggled UI now (the `BankPanel`), with physical bank-building / mailbox-prop gating deferred like crafting stations.
- **Daily bounties:** the bounty pool + daily rotation are pure data (`shared/data/bounties.ts`); `dailyBountyIds(seed, day, hub)` is deterministic. The **day index is the one sanctioned wall-clock read**, taken once in the `Game` constructor (the client-bootstrap edge) and passed to the `BountyDirector` — the sim and shared data never touch the date. The director posts the nearest hub's board, tracks the same kill/gather events the quest/Deed systems consume, pays rewards through `CombatDirector.grantReward`, and resets its log when the stored day is stale.
- **Save versioning:** `SAVE_VERSION` 13 — v2→v3 quest log; v3→v4 profession skills + material stash; v4→v5 crafted-consumables stash; v5→v6 meta (`deeds`, `pathPoints`, `perks`); v6→v7 mounts; v7→v8 bank vault + mail inbox; v8→v9 daily-bounty log; v9→v10 moved Path Points/perks to the account; v10→v11 rebindable keybinds; v11→v12 learned discovery recipes; v12→v13 graphics settings (`shadows`, `vfxDensity`, `resolutionScale`). `migrate()` walks any prior shape forward, filling defaults; **`tryMigrate()`** wraps it to never throw (returns `null` on unrecoverable input) and **`validateSave()`** is the post-migration structural type-guard — together they back the save store's corruption recovery.

## 4. World Generation (`shared/worldgen`)

Deterministic function of `WORLD_SEED` (checked-in constant) + authored data. Two layers:

1. **Procedural base:** continent mask → elevation (stacked simplex octaves shaped by the zone macro-map from WORLD.md) → rivers/lakes via downhill carving → biome assignment (zone regions with 30–60 m blended borders) → surface palette + strata → cave/canyon carving fields → scatter fields (trees/rocks/nodes) sampled per-biome with blue-noise.
2. **Authored layer** (`shared/data/world/`): declarative placements evaluated after the base — settlements (building placements from the kit + terrain flattening brushes), roads (spline → surface material + gentle grading), Waystones, Hollow entrances + carved interiors (voxel stamp brushes), spawn regions, named-rare routes. This is how the world feels designed while staying a pure function.

Chunks (32×32 columns × 192 high) generate on demand in Web Workers from `(seed, chunkX, chunkZ)` — identical output anywhere, including the P6 server (which generates collision-relevant data only, no meshes). Worldgen tests assert region hashes so refactors can't silently reshape the world.

**Terrain is not player-mutable** (no digging/building — an explicit design cut; professions interact with authored node objects, not voxels). This keeps chunks regenerable, saves tiny, and MMO sync tractable.

## 5. Rendering (client)

- **Chunk meshing:** greedy meshing over visible faces, **vertex colors only** (no textures — Cube World look comes from palette + AO + lighting). Per-vertex baked AO; one shared material → one draw call per chunk section. Mesh in workers (transferable buffers), ring-buffered around the player; view distance ~8–10 chunks with distance fog hiding the edge.
- **Models/props:** voxel models mesh once per model+palette variant, then `InstancedMesh` for repeated props (trees, rocks, fences, nodes). Characters/enemies are per-part meshes on a simple bone hierarchy (see ART_GUIDE §Rig) — part-transform keyframe animation (position/rotation per part), tweened on the client from sim animation state (`idle/walk/attack…`).
- **Lighting:** one directional sun (day/night cycle) + hemisphere ambient + a small pool of point lights for emissives (lanterns, crystals, VFX). **Shadows (P5, `environment.ts`):** the sun casts a single orthographic shadow map whose frustum re-centres on the player each frame (so a fixed 1024/2048 map — low/high — stays tight around the view). Characters, enemies, mounts, and instanced props **cast**; terrain **receives** but does not self-cast (receive-only ground sidesteps voxel shadow acne). Quality is the `shadows` graphics setting (`off` clears `sun.castShadow`); `renderer.shadowMap.enabled` stays on so changing quality never recompiles shaders. **Graphics settings** (view distance, shadows, VFX density, resolution scale) live in the save (`SettingsV2`, v13), mirror into the store, and apply live via the `CombatDirector`/`Environment`/renderer.
- **VFX (P5, `client/engine/vfx.ts`):** one pooled `THREE.Points` object — a 700-particle ring buffer, a single draw call, a fixed memory budget — of additive soft dots (`RawShaderMaterial`: per-particle perspective-scaled size + RGB, a round `gl_PointCoord` mask, colour fades to black over life so no alpha channel is needed). Particles are CPU-simulated (gravity + drag + fade) and the changed buffers re-upload each frame. The `CombatDirector` fires `Vfx.burst(...)` on combat events — hit sparks (crit-gold / heal-green), death puffs, school-tinted cast flashes (`SCHOOL_COLOR` by the cast skill's damage school), the level-up fountain, and the Waystone attune glow, plus **blight ambience** (upward-drifting spore-motes near the Hollows, `emitBlight`). Pure render candy: no sim state, no RNG. **Micro-motion (P7):** the water surface (subdivided plane) and the instanced foliage props sway via `onBeforeCompile` vertex offsets driven by a shared `uTime` uniform — a world-locked sine swell on water, a height-weighted per-instance wind on props — so both animate without extra draw calls or CPU work.
- **Adaptive quality (P7, `game.ts`):** a runtime safety net for the frame budget — a sustained low FPS auto-drops the effective chunk view distance a notch (floor 4) and climbs back toward the user's setting on recovery; slow cadence + wide hysteresis avoid streamer thrash, and the user's persisted setting is the ceiling (never overwritten).
- **Audio (P5, `client/platform/audio.ts`):** a WebAudio `audio` singleton with a master-gain bus (wired to the Settings volume) and music/SFX sub-buses. Two looping music beds — `loginscreen.mp3` (title/select) and `bgm.mp3` (in-game) — are user-supplied mp3s under `public/assets/audio/`, loaded via `fetch`+`decodeAudioData`, cross-faded on change; a missing/undecodable file degrades to silence and never throws. Autoplay policy is handled by resuming the context on the first gesture and queuing the requested track. SFX (skill cast, enemy defeat, level-up, quest complete) are **synthesized in code** (enveloped oscillator blips) — no sound files. All audio is client-only (never in `shared/`).
- Budgets (from CLAUDE.md): ≥60 FPS mid-range laptop, ≤~250 draw calls typical, ≤3 MB gzipped JS, ≤5 s to playable warm.

## 6. Saves (P1–5) → Persistence (P6)

- Versioned schema in `shared/proto/save.ts`: `{version, account: {pathPoints, deeds, perks}, characters: [{identity, class, level, xp, stats, inventory, equipment, gold, skills, paths, quests, professions, discoveredWaystones, position…}]}`.
- P1–5: IndexedDB (a hand-rolled dependency-free wrapper, not `idb-keyval`), autosave every 30 s + on unload; a **rotating 3-deep backup ring** with **corruption recovery** — `loadSave()` falls through primary → backups (newest first) → fresh using the never-throwing `tryMigrate()`, so one bad record can't brick a save (a recovered load shows a title-screen notice). Explicit migration functions per version bump with round-trip tests; **save export/import** (JSON download/restore) and a **React error boundary + bug-report screen** guard against browser-storage loss and UI crashes. WebGL context loss is caught and recovered (pause + overlay + auto-resume).
- P6: same schema decomposed into PostgreSQL tables (accounts, characters, character_state JSONB for cold data + hot columns for queryable bits); a one-time importer lets local solo saves upload as a starting character (best-effort, server re-validates all values against legal bounds — no trusting client-grown stats).

## 7. Netcode (Phase 6 — build in progress)

> **Status (Phase 6 Parts 1–2):** the **movement netcode is complete**. `shared/proto/net.ts`
> defines the message schema + codec; `server/` runs the authoritative 20 Hz sim on the shared
> movement rules with a **per-player input FIFO** and broadcasts per-subscriber at 10 Hz;
> `client/src/net/netClient.ts` (opt-in) sends intents, **predicts + reconciles** own movement, and
> interpolates remotes on the server-tick timeline. Built in Part 2: **client-side prediction
> reconciliation** (the `self` message carries own authoritative physics + `ackedSeq`; the client
> replays unacked inputs and smooths the residual), **3×3 chunk interest management** (per-subscriber
> deltas via a `known` set, `server/interest.ts`), **connection UX** (ping/RTT, phase, `NetStatusHud`),
> and **server hardening** (maxPayload, hello-timeout, connection cap, WebSocket heartbeat). Not yet
> built: authoritative combat/loot/quests on the tick pipeline, quantised binary framing, session
> resume on reconnect. The bullets below are the full target.
>
> - **Wire format now vs later:** the codec (`encodeClient`/`decodeClient`/`encodeServer`/
>   `decodeServer`) is a single choke point. It ships **JSON** for legibility while the protocol
>   is in flux; switching to length-prefixed MessagePack (below) is a change to those four functions
>   only, no call-site churn.
> - **Reconciliation invariant:** the client and server must apply the _same_ intent to stay
>   convergent. The server therefore currently trusts the **clamped** client `speedMult` (so a
>   mounted client reconciles without rubber-banding); authoritative `speedMult` (recomputed from
>   server-side mount/combat state) lands with those systems. The clamp bounds the exploit to 2×.

- **Transport:** WebSocket (wss via nginx). Messages: length-prefixed binary (MessagePack initially; hand-rolled codecs only where profiling justifies). _(Part 1: JSON text frames behind the codec choke point; binary is the documented upgrade.)_
- **Authority:** server runs the same `shared/sim` at 20 Hz and is sole truth. Clients send intents (sequence-numbered, non-negative safe integers, **rate-limited** per connection); the server buffers them in a **bounded per-player FIFO** drained one per tick (jitter/catch-up buffer) and replies on the `self` channel with the last-applied seq (`ackedSeq`) + authoritative physics. _(Built Parts 1–2.)_
- **Replication:** interest management = 3×3 chunk subscription around each player. Per tick-bundle (every 2nd tick, 10 Hz on the wire): per-subscriber entity deltas (enter=full / update=if-dirty / leave) for players in the 3×3 cells, diffed against a per-connection `known` set; interest-filtered snapshot on subscribe; the `self` channel bypasses interest. _(Built Part 2 in `server/interest.ts`. Field-level quantisation — pos to 1/16 voxel, hp%, anim/buff bits — and the reliable chat/loot/quest event channel are later.)_
- **Feel:** own movement client-predicted + reconciled (movement rules already live in `shared/`, so prediction and the reconcile **replay** are literally the same function; the residual is smoothed at the render edge, not the sim); remote entities interpolated ~150 ms behind on the server-tick timeline; casts show locally at cast-start, resolve on server confirm (tab-target tolerance makes this easy — the reason we chose it). _(Movement built Part 2; casts with combat authority.)_
- **Scale target:** 200 CCU on one 4-vCPU VPS process; zone-sharding by region grid is the documented escape hatch, not built until needed.
- **Cheat posture:** server validates everything (already true by construction); sanity ceilings on move speed/teleport deltas/action rates; server-side cooldown & resource books; no client-supplied numbers ever applied.

## 8. Server & Ops (Phase 6)

- `server/`: ws gateway (auth handshake → session) · sim host (imports `shared/`) · persistence writer (dirty-state flush every 30 s + on logout/events) · REST endpoints for auth (register/login/reset, argon2id, rate-limited). _(Parts 1–3 modules: `config.ts` (env + safety limits at the edge), `world.ts` (headless `VoxelSampler`), `sim.ts` (`ServerSim` — registry + authoritative tick on `stepPlayerMovement`, input FIFO, `selfOf`), `interest.ts` (3×3 chunk visibility), `gateway.ts` (`GameServer` — one `http.Server` shared by `ws` + the `GET /healthz` / `GET /status` routes, tick clock, per-subscriber broadcast + `self` channel, and hardening: maxPayload / hello-timeout / connection cap / heartbeat / per-connection frame-rate limit), `index.ts` (entry). Run via `pnpm dev:server` / `pnpm start:server` (tsx), or containerised (`server/Dockerfile`). Auth + persistence land in later parts.)_
- PostgreSQL via Drizzle; nightly `pg_dump` to VPS-local + offsite copy; restore drill documented in the runbook.
- **Static client (P1–5):** the build is a self-contained `dist/` (repo root). Deploy on Vercel (zero-config via `vercel.json`) or serve from the VPS's nginx — see **docs/DEPLOY.md** for the Ubuntu VPS + nginx guide (SPA fallback, immutable asset caching, certbot TLS). Both must keep working.
- **Docker Compose (P6):** `game` (Node), `db` (Postgres + volume, behind a `--profile db` until the accounts phase), `nginx` (TLS via host certbot, wss reverse-proxy). Client stays deployable on Vercel pointing at `wss://play.<domain>`; both topologies work. _(Built Part 3: `server/Dockerfile` (filtered pnpm install → server + shared only), root `docker-compose.yml`, `deploy/nginx/pathlands.conf`, and the **docs/SERVER_DEPLOY.md** runbook. The image build runs on the VPS.)_
- GitHub Actions: typecheck/lint/test on push; deploy job (build → rsync/registry → `docker compose up -d`) on tagged release. Structured pino logs; minimal metrics (CCU, tick p95, DB latency) exposed to a status endpoint; GM commands behind an admin token.

## 9. Testing Strategy

- **Vitest on `shared/`** (the only heavily-tested layer): worldgen region hashes & determinism, collision/movement edge cases, combat formula tables (GDD §4 as fixtures), XP/loot distributions (seeded), quest state machines, save migrations round-trip. Target: fast (<10 s) so it runs every session.
- Client: type-safety + play verification per CLAUDE.md workflow; one Playwright smoke (boot → create character → move → kill a boar) added in Phase 3 and kept green.
- P6: protocol fuzz (malformed/hostile intents), scripted hostile client (speed/teleport/cooldown attacks), 200-bot load harness.

## 10. Risk Register (watch these)

1. **Meshing/GC pressure** on chunk churn → transferable buffers, pooled geometry, profile early (Phase 1 acceptance gate).
2. **Content pipeline throughput** (110 quests, ~40 models) → data-driven schemas + authoring helpers _first_, content second (ordering inside Phases 2–4 reflects this).
3. **Prediction edge cases in P6** (swim/fall/slope) → movement rules pure & tick-based from Phase 1; record/replay harness for divergence hunting.
4. **Safari/WebGL quirks** → compatibility pass is a Phase 5 deliverable, not a launch surprise.
5. **Scope creep** → ROADMAP backlog section is the only door; GDD scope constants are load-bearing.
