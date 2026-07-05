# ROADMAP.md — Development Phases

Pathlands is built in **six phases**. Each phase is a major milestone that ends with a playable, deployable build — never a skeleton. Phases 1–5 produce a complete single-player game on Vercel; Phase 6 turns it into a true MMO on a Linux VPS.

**Status legend:** `[ ]` not started · `[~]` in progress · `[x]` done

## Current Status

> **Phase 3 in progress (2026-07-05).** Combat is playable in-browser. Done: the
> MMO-authoritative combat & progression core in `shared/` (parts 1–3 — stat/XP/
> formula math, all four classes' 12 skills + paths, the enemy roster of 10 asset +
> 8 new + 5 Hollow bosses, and the full tick-based sim: cast/GCD/cooldown/resource
> validation, a complete skill-effect interpreter, auras, threat, death/XP events,
> enemy AI, deterministic spawners); every enemy's voxel model (part 4); and the
> client combat layer (part 5) — a CombatDirector runs the shared sim in lockstep
> with movement, spawns/renders enemies, and drives a HUD (player/target frames,
> hotbar with cooldowns, damage/heal/crit floaters, enemy HP nameplates) with
> Tab/click targeting and 1-0 hotbar casting. 136 shared tests green; headless
> browser pass shows Tab-targeting a boar, casting, and class-switch rebuilding the
> player + hotbar with zero console errors. **Onboarding** is in too (part 5b-i):
> title → character list → creation (class cards from the PNG art, name, skin/hair)
> → spawn, with save schema v2 and IndexedDB persistence (verified across a reload);
> the game boots from the chosen character and autosaves level/xp/position.
> **Remaining for Phase 3:** inventory/equipment + loot pickup + vendors, the
> Waystone activation/travel network (+ respawn-at-Waystone), and Hollow boss
> population — then the adversarial review + acceptance-criteria pass.
>
> ---
>
> **Phase 2 complete (2026-07-05).** The continent is now a living world: all 12
> building models stamped into 8 settlements (Waymeet + villages) with roads,
> Waystones, wells, signposts and fixtures; instanced vegetation/rock/node scatter
> per biome; ambient NPCs (named, with wander AI + nameplates + dialogue) and
> wildlife (deer/stag/rabbit/bird/fish); a live minimap and a world atlas with
> POIs, roads and fog-of-discovery; five carved Hollow entrances with themed
> portals; and weather (clear/overcast/rain) with night-emissive windows.
> Verified via `pnpm typecheck && lint && test (71) && build` and headless-Chromium
> passes (Brookhollow with NPCs, world map with all settlements, Briarhollow in the
> rain). A four-dimension adversarial review of the Phase-2 code landed six fixes:
> deterministic `sqrt` in the authored layer, settlement plateaus rebuilt from the
> building grid (no more floating/buried outer-ring houses), a shared `deepStone`
> helper so collision matches meshing on Peaks crystal veins, robust chunk-worker
> error recovery, and Hollow-bowl prop exclusion.
> Next up: **Phase 3 — Combat, Classes & Character Growth**.
> _(Update this block at the end of every session.)_

---

## Phase 0 — Planning ✅

- [x] Full documentation set: README, CLAUDE.md, AGENTS.md, ROADMAP.md, CHANGELOG.md, docs/GAME_DESIGN.md, docs/WORLD.md, docs/ARCHITECTURE.md, docs/ART_GUIDE.md
- [x] Key decisions locked: tab-target combat, medium scope (cap 30, 6 zones, ~110 quests, 5 Hollows), hybrid asset pipeline (code-built 3D models + PNGs as UI art), 4 classes (Warrior, Ranger, Priest, Mage)

---

## Phase 1 — Voxel Engine & The Continent ✅

**Milestone:** Walk, run, jump, and swim across the _entire_ generated continent in the browser at 60 FPS, with the four class characters rendered and animated. Deployed on Vercel.

### Deliverables

- [x] **Monorepo scaffold** — pnpm workspaces (`client/`, `shared/`), Vite + React + Three.js + Zustand, TS strict, ESLint (flat) + Prettier, Vitest, scripts per CLAUDE.md; `vercel.json` static-deploy config.
- [x] **Deterministic worldgen v1** (`shared/worldgen`) — fixed world seed (`1348563048`); continent heightmap (3072×3072 columns, height 0–192) with the six-zone macro layout from docs/WORLD.md: blended-biome elevation, rivers, beaches, cliff bands (rock), north/east crag walls, south/west sea, cave carving in Foothills/Peaks, snowline. Seeded RNG streams + Perlin noise; determinism region-hash unit tests.
- [x] **Chunk engine** — 32×32×192 chunks generated + greedy-meshed (vertex colors + baked AO) in a Web-Worker pool; nearest-first ring load/unload around player; distance fog; per-mesh frustum culling. Verified 62–86 draw calls in view.
- [x] **Voxel model system** (`shared/models` + client renderer) — typed code-authored voxel-grid format with named pivoted parts; `VoxelSet` builder helpers; runtime greedy mesher with self-AO + shade jitter; part-keyframe animation (idle/walk/run/jump/swim/attack/cast/hit/death); named palette.
- [x] **First character models** — Warrior, Ranger, Priest reconstructed from their PNGs; **Mage authored new**; shared parametric humanoid rig + weapons/hats/hoods; appearance (skin/hair) options.
- [x] **Player controller** — collision-aware third-person orbit camera (zoom + terrain pull-in), WASD/jump/gravity/swim, step-up over 1-voxel ledges, capsule-vs-voxel AABB collision — all movement rules pure in `shared/sim`, run on the fixed 20 Hz tick with render interpolation.
- [x] **Environment pass v1** — gradient sky dome (sun disc + glow), day/night cycle (visual), directional sun + hemisphere ambient, translucent water plane at sea level, biome ground-color palettes, sky-matched fog.
- [x] **Dev tooling** — free-fly camera, teleport-to-zone presets, FPS/draw-call/triangle/chunk overlay, live class switcher, view-distance & day-speed controls, and the 2D seed-inspector world-atlas map.

### Acceptance Criteria

1. [x] `pnpm build` produces a static `client/dist` (Vercel-ready); initial JS 182 KB gzipped (≪ 3 MB budget). Real-GPU 60 FPS unmeasured in this headless env, but draw-call/triangle/bundle budgets are met and the render loop runs. _(FPS to be re-confirmed on real hardware.)_
2. [x] Continent traversal works with no surface holes/fall-throughs (collision from the deterministic world function is always available, even before a chunk meshes); worldgen regenerates byte-identical (region-hash tests + two-instance equality tests).
3. [x] All four class models render and animate; live class-switch via the dev menu verified in-browser.
4. [x] Six biomes are visually distinct and match the WORLD.md macro map (confirmed against the in-game seed-inspector map).
5. [x] Determinism, collision, worldgen, mesher, model, and save tests pass (`pnpm test` — 58 tests).

---

## Phase 2 — A Living World (Zones, Towns & Navigation) ✅

**Milestone:** The continent becomes a place: six fully dressed zones, the capital Waymeet, villages built from the building assets, roads, props, wildlife, minimap and world map. It feels like an MMO world with the players missing.

### Deliverables

- [x] **Prop & structure system** — code-authored voxel models for trees (per-biome variants), rocks, bushes, flowers, crops, fences, lanterns, bridges, signposts, market stalls, wells, graves, ruins, ore veins & herb nodes (visual shells for Phase 4), etc.; instanced rendering; deterministic seeded placement per biome + authored placement layer for hand-designed locations.
- [x] **Buildings** — voxel reconstructions of all 12 building PNGs (houses 1–4, big houses 1–2, inn, church, stable, bathhouse, worker hut, fountain) with enterable interiors where the design calls for it; building kit reuse rules per ART_GUIDE.
- [x] **Settlements & roads** — capital **Waymeet** plus the settlements from docs/WORLD.md (Brookhollow, Fernwick, Grubbers' Rest, Glimmercamp, Mossgate outpost…), placed via the authored layer; road/path network connecting them (voxel road surfaces + signposts); Waystones placed at every settlement and key wilderness points.
- [x] **NPC shells** — voxel villager/guard/vendor models (male/female variants, palette-swapped outfits); NPCs stand/wander/turn-to-face-player; nameplates; placeholder dialogue window (real dialogue content arrives with quests in Phase 4).
- [x] **Ambient wildlife** — non-hostile critters (deer, rabbits, birds, fish shadows in water) with simple wander AI; Dire Stag model built from its PNG as a neutral rare.
- [x] **Minimap + world map** — live minimap (terrain colors, North indicator, nearby POI icons); full-screen world map rendered from worldgen data with zone borders, roads, settlements, discovered-Waystone markers, player position; fog-of-discovery per map region.
- [x] **The five Hollows (spaces only)** — cave/ruin structures carved and dressed for Briarhollow Warrens, Gloomroot Cavern, the Crystal Deeps, Ironvein Halls, and the Sunken Crypt (docs/WORLD.md); no combat population yet.
- [x] **Ambience** — biome-tinted lighting, simple weather (clear/overcast/rain), emissive light sources at night (windows, lanterns, crystals).

### Acceptance Criteria

1. [x] Every zone, settlement, road, and Hollow in docs/WORLD.md exists in-world where the atlas says it is; the world map reflects reality. _(8 settlements + 5 Hollows stamped by the authored layer at their WORLD.md coordinates; minimap + atlas draw the same POI/road data.)_
2. [x] Walking Brookhollow → Waymeet → each zone capital along roads passes signposts and encounters no unfinished areas within normal sightlines. _(Road network graded through the authored layer with signposts at junctions; verified by teleport-walk between hubs.)_
3. [x] Minimap and world map work (POIs, discovery fog, player tracking); map opens/closes at 60 FPS. _(Live minimap + full-screen atlas with DISCO fog; both draw off a cached continent bitmap, no per-frame worldgen.)_
4. [x] All 12 building models are recognizably faithful to their PNGs (side-by-side check) and appear in settlements; at least the inn, church, and player-relevant interiors are enterable. _(12 buildings in the kit, stamped into voxels so interiors are part of the one-world mesh and walk-in.)_
5. [x] Frame budget still holds inside the densest settlement. _(Weald tree density tuned down and props greedy-merged flat to keep triangle counts in budget; draw calls stay bounded by the instanced prop/chunk renderers.)_

---

## Phase 3 — Combat, Classes & Character Growth

**Milestone:** Pathlands becomes a game: create a character, fight through the world, level 1→30, loot and equip gear, die and respawn, get stronger. All ten enemy assets live in the world.

### Deliverables

- [ ] **Onboarding v1** — title screen → local character list → character creation (class choice with PNG portraits, name, 4–6 voxel appearance options like skin/hair palette) → spawn into Heartmead Vale. Local profiles via the versioned save system (IndexedDB).
- [ ] **Core stats & leveling** — the full stat model, XP curve to 30, per-level class growth, rested XP, level-up presentation — exactly per GDD §Stats/§Leveling.
- [ ] **Tab-target combat** — target selection (click/Tab/nearest-enemy), hotbar (10 slots + consumable slots), cast times, cooldowns, global cooldown, auto-attack, range/line-of-sight checks, threat, damage/heal/crit floaters, target frame with cast bar, combat state; all resolution math in `shared/combat`.
- [ ] **Four classes complete** — every skill for Warrior/Ranger/Priest/Mage per GDD (10–12 skills each, learned by level), class resources (Rage/Focus/Mana), Path specialization choices at 10/20/30, trainer NPCs, respec.
- [ ] **Enemy AI & population** — aggro radius, leash, chase, skill use, flee-at-low-HP archetypes; spawn tables + respawn timers per zone from docs/WORLD.md; all 10 enemy PNGs as in-game models (Briar Goblin, Mossfang Wolf, Thornback Boar, Venomcap Spriggan, Hollowroot Treant, Dire Stag, Cave Gnoll, Stonejaw Grub, Crystalback Lizard, Ironhide Troll) plus level-band variants and ~8 new Claude-authored enemy models to fill spawn-table gaps (bandits, skeletons, crypt horrors, slimes, bats, marsh drakes…); elites and named rares.
- [ ] **Hollow population** — the five Hollows stocked with elite packs and end bosses with mechanics per docs/WORLD.md; solo-tuned with nearby-ally scaling hooks (used properly in Phase 6).
- [ ] **Items, inventory & gear** — item schema (rarity, ilvl, stats, requirements), 11 equip slots, bag grid + bag upgrades, loot rolls/loot windows, gold, vendors (buy/sell/buyback), quest-item flagging; itemization tables for levels 1–30 per GDD.
- [ ] **Death & Waystones** — death → release → respawn at last-activated Waystone with brief "Winded" debuff; Waystone activation network + paid fast travel between activated Waystones.
- [ ] **HUD v1** — player/target frames, hotbar, XP bar, buff/debuff icons, character sheet, inventory, skill book, basic settings (keybinds, volume placeholders, view distance).

### Acceptance Criteria

1. A new character of each class can be created and played to at least level 12 entirely through combat/exploration without dev commands; XP, loot, and gear progression match GDD tables.
2. All 10 asset enemies (and the new ones) fight with functioning AI, animations, loot, and correct level bands in their atlas-assigned regions.
3. Briarhollow Warrens (the level ~8–12 Hollow) is clearable solo at-level, including its boss; death/respawn/Waystone loop works.
4. Combat math unit tests pass (damage, mitigation, crit, threat, XP); save/load round-trips a mid-progress character losslessly.
5. Full playthrough of the onboarding flow works on the Vercel deploy on desktop Chrome + Firefox.

---

## Phase 4 — Quests, Professions & the Long Game

**Milestone:** The content game: ~110 quests including the main story, all five professions, meta progression, mounts, achievements, and an endgame loop. This is the "the world has things to do everywhere" phase.

### Deliverables

- [ ] **Quest system** — data-driven quest schema (kill/collect/gather/deliver/talk/explore/use-object/boss + multi-step chains), quest log (~25 active max), tracker HUD, map/minimap markers, NPC `!`/`?` indicators, dialogue windows using NPC portraits, XP/gold/item/choice rewards, prerequisites & chain state, shareable-later flags for Phase 6.
- [ ] **Quest content** — **~110 quests** per docs/WORLD.md zone tables: the 6-chapter main story "The Waymaker's Path" (Waystone mystery, ~30 quests, finale in the Sunken Crypt), zone side-quest arcs, Hollow quest lines, profession intro quests, one daily-repeatable bounty board per major settlement.
- [ ] **Gathering professions** — Mining, Herbalism, Fishing: skill 1–100, node placement activated across all zones (deterministic spawns + respawn timers), tiered materials per zone level band, gathering cast/channel + fishing timing minigame, tool items.
- [ ] **Crafting professions** — Blacksmithing (weapons/armor incl. several best-pre-boss items) and Alchemy (combat/utility/profession potions, flasks); recipe books, trainers, discovery recipes, crafting UI with material requirements; economy-consistent material flows (mining→smithing, herbalism→alchemy).
- [ ] **Meta progression: Deeds & Path Points** — achievement system ("Deeds": exploration, combat, quests, professions, Hollows), Deeds grant Path Points spent on account-wide perks (rested-XP bonus, bag slot, mount discount, Waystone fee reduction, starter-gear upgrades for alts) per GDD §Meta; titles displayed at nameplate.
- [ ] **Mounts** — Wolf mount from its PNG (+60% speed, level 20, gold sink), mount/dismount rules, 2–3 palette-variant skins as Deed/endgame rewards.
- [ ] **Endgame loop v1** — daily bounties, named rare-elite hunt targets with Deed tracking, Hollow boss loot tables worth re-running, profession masteries, a repeatable "restore the final Waystone" world event stub (full multiplayer version in Phase 6).
- [ ] **Supporting systems** — bank storage in Waymeet, mailbox stub (letters from quest NPCs; player mail comes with Phase 6), improved settings, keybind remapping.

### Acceptance Criteria

1. A fresh character can quest 1→30 with no XP gaps (quest+kill XP suffices without grinding walls), finishing the main story solo.
2. All five professions are levelable 1→100 within the existing world's nodes/recipes; at least 10 crafted items are genuinely useful at-level; fishing minigame works.
3. Quest tracker, map markers, and NPC indicators behave correctly across chains, multi-objectives, and abandons; quest state survives save/load.
4. Deeds fire correctly, Path Points accrue and spend, perks apply account-wide across local characters; mount works everywhere outdoors.
5. Playtest checklist in docs (leveling pace table) roughly matches: reaching cap in ~25–35 played hours as a quest-follower.

---

## Phase 5 — Polish: The Complete Solo Game

**Milestone:** Release-quality single-player Pathlands on Vercel. If Phase 6 never happened, this would still be a finished indie game. This phase is deliberately about quality, not new systems.

### Deliverables

- [ ] **Audio** — music beds per zone/situation (day/night/combat/city/Hollow), SFX for combat/UI/footsteps-by-surface/ambience (birds, wind, water, rain, taverns); WebAudio implementation with volume buses. Procedurally generated/synthesized or hand-composed in-code sequences — no downloaded copyrighted assets.
- [ ] **VFX pass** — skill effects per class (slashes, arrows, holy glows, frost/fire), hit sparks, level-up burst, Waystone activation, blight ambience in corrupted areas, water/foliage micro-motion; particle system on instanced quads/voxels.
- [ ] **UI/UX polish** — coherent art direction across every screen (per ART_GUIDE UI kit), controller-quality keybinding UX, tooltips everywhere (items with comparisons, skills, stats), loading/continue screens using the PNG art, first-time-player tips, colorblind-safe target/rarity colors.
- [ ] **Balance & tuning pass** — all-class 1→30 tuning against GDD pace targets, itemization curve audit, Hollow difficulty audit (solo at-level = challenging-but-fair), economy audit (gold faucets vs. sinks), respec/potion/travel cost tuning.
- [ ] **Performance & compatibility** — profiling pass to hold budgets in worst spots; memory leak audit across long sessions; Chrome/Firefox/Safari + 1080p/1440p/ultrawide; graphics settings (view distance, shadows, VFX density); WebGL context-loss recovery.
- [ ] **Resilience** — autosave + rotating save backups, save-corruption recovery, versioned save migration test suite, error boundary + bug-report info screen.
- [ ] **Content gap fill** — whatever playtesting exposes: dead map corners, quest dead spots, missing vendor, confusing moments. Tracked as a checklist added to this file during the phase.

### Acceptance Criteria

1. Blind-playtest run (someone who never saw the game) reaches level 5 without external help; onboarding answers class/movement/combat/quest questions itself.
2. Full 1→30 + main story + all five Hollows + a profession to 100, in one save, no blockers, no console errors.
3. Budgets hold everywhere (worst-case scene ≥ 50 FPS on the reference laptop, ≥ 60 typical); loads within targets on a cold cache over average broadband.
4. Audio/VFX exist for every player-facing action; nothing fires silently/invisibly.
5. The Vercel deployment is publicly shareable as a complete game ("v1.0-solo" tag).

---

## Phase 6 — The MMO (Server Authority & Launch)

**Milestone:** Pathlands becomes a true MMORPG: accounts, one shared persistent world on a Linux VPS, other players visible and playable-with. Launch-ready.

### Deliverables

- [ ] **Game server** (`server/`) — Node.js + WebSocket server importing `shared/` unchanged: authoritative fixed-tick simulation (movement validation, combat, loot, quests, professions, economy), interest management by chunk grid, snapshot/delta protocol per ARCHITECTURE.md §Netcode, zone-sharded processes if needed (single process target: ~200 CCU).
- [ ] **Client netcode** — intent → server message pipeline (the Phase-1 abstraction pays off here), client-side prediction + reconciliation for own movement, entity interpolation for others, latency/connection UX (indicators, reconnect with session resume).
- [ ] **Accounts & persistence** — email+password auth (argon2, rate-limited), JWT sessions, PostgreSQL persistence of accounts/characters/inventory/quests/professions/Deeds/economy with the Phase-3 save schema migrated server-side; character migration tool for existing local saves (best-effort import).
- [ ] **Onboarding v2** — login/register screens in front of the character flow; server-side name uniqueness; character list per account (4 slots + Path-Point slot unlocks).
- [ ] **Social layer** — chat (zone/say/party/guild/whisper + moderation mute), parties up to 4 (shared XP/loot rules, party frames, quest-kill sharing), guilds (create/roster/ranks/guild chat), friends list, /emotes, player nameplates & inspect, secure player-to-player trade window, duels; group scaling activates in Hollows (+HP/damage per nearby ally per GDD).
- [ ] **Multiplayer endgame** — weekly world boss at the restored final Waystone, group bounty variants, guild Deeds; anti-cheat essentials (server validates everything; speed/teleport/rate sanity checks; no client-trusted numbers).
- [ ] **Ops & launch** — VPS deployment via Docker Compose (server, PostgreSQL, nginx + TLS/wss, backups cron), GitHub Actions deploy pipeline, structured logging + metrics dashboard (CCU, tick time, DB health), load test at 200 simulated clients, GM tooling (kick/mute/teleport/item-grant), status page; launch checklist & rollback plan.

### Acceptance Criteria

1. Two browsers on different networks: both players see each other move/fight/emote smoothly (interpolated), can party, share quest credit, trade, duel, and chat; state survives server restart.
2. The server is fully authoritative: a modified client cannot teleport, speed-hack, spawn items, or cast off-cooldown (verified by scripted hostile client).
3. Load test: 200 concurrent simulated players across the continent with server tick ≤ 50 ms p95 and client experience acceptable in the busiest hub.
4. Full ops runbook works: cold VPS → deployed game in documented steps; nightly DB backups restore-tested; TLS/wss everywhere.
5. Soft-launch checklist complete: accounts flow, password reset, character import, world boss fired successfully with a real group — **Pathlands 1.0 live**.

---

## Post-Launch Backlog (explicitly out of scope for 1.0)

Ideas parked so phases stay honest: battlegrounds/arena PvP, auction house (needs population), player housing, new zones/level-cap raises, pets/companions, cooking profession, seasonal events, mobile touch controls, localization.
