# Changelog

All notable changes to Pathlands are documented here, per working session. Format follows [Keep a Changelog](https://keepachangelog.com/); the project is pre-release, so entries are grouped by phase rather than semver until 1.0.

## [Phase 4 — Quests, Professions & the Long Game] — in progress

### Part 4 — crafting professions (2026-07-05)

- **`shared/data/recipes`** — Blacksmithing (smelt copper/iron/silver ore → bars; forge
  a copper sword/chestguard + an ironforged blade) and Alchemy (lesser/greater health
  potions, a mana draught, might + warding elixirs) recipes, plus the consumable catalog
  with heal / restore / timed-buff effects. Smelted bars added to the material set.
- **`shared/professions/craft`** — a pure craft engine: `canCraft` (skill + material
  check) and `craft` (consume inputs, yield output + a skill-up, deterministic from a
  seeded Rng). Skill-up refactored to a shared `skillUpForReq` used by gather + craft.
- **Save v5** — characters gained a consumables stash (crafted potions/elixirs);
  `migrate()` walks v4 saves forward.
- **`client/game`** — the profession director gained crafting (materials → the stash /
  bag) and consumable use; the combat director gained `craftGear` (forge into the bag)
  and `applyConsumable` (heal / restore resource / apply a timed buff aura to the player).
- **`client/ui`** — a **CraftingPanel** (K) listing recipes by profession with inputs,
  outputs, and per-recipe craftable state; the Professions panel gained a **potions**
  section with Use buttons.
- **Tests** — +9 (craft-engine + recipe/consumable validity, save v4→v5 migration); 204 total.

### Part 3 — gathering professions (2026-07-05)

- **`shared/data/professions`** — the five professions, the four material tiers
  (skill 1/25/50/75), the material catalog (ore + stone/gem, herbs, fish + oil), and
  the worldgen-prop → profession/tier mapping (`NODE_INFO`).
- **`shared/professions`** — a pure skill/gather engine: the orange/yellow/green/gray
  difficulty curve, `skillUp` (+1 at orange/yellow, ~half at green, capped at 100),
  `gatherNode` (seeded ore/herb yields with a rare gem proc), and the fishing
  minigame's `fishBiteDelaySeconds` + `rollFish` (fish + oil + big-catch proc).
- **Save v4** — characters gained profession skills (1–100 each, all five start at 1)
  and a material stash (counts by id); `migrate()` walks v3 saves forward.
- **`client/game/gatherDirector`** — finds gather nodes by re-running the deterministic
  `world.scatterChunk` near the player (with a client-side depletion/respawn set),
  drives the mining/herbalism channel (cancels on movement) and the fishing minigame
  (cast → bite window → reel), banks materials + skill-ups, and publishes the gather
  prompt / channel bar / Professions panel.
- **`client/ui`** — a **GatherPrompt** ("Press E to mine/gather/fish") + channel bar,
  and a **ProfessionsPanel** (P) with five skill bars and the material stash.
- **Tests** — +8 profession-engine + a save v3→v4 migration check (195 total).

### Part 2 — the early-zone questing spine (2026-07-05)

- **`shared/data/quests`** — grew the starter arc into a real 1→14 spine: the main story
  "The Waymaker's Path" **chapters 1–3** (Brookhollow → Millstead → the Weald blight-wells
  → the Foothills gnoll caves, a level-ordered prerequisite chain) plus side arcs across
  Heartmead Vale, Mossfang Weald, and the Stonejaw Foothills — **~21 quests** from **8
  named givers** at five settlements, with multi-objective quests (kill + collect),
  cross-NPC turn-ins, and Waystone unlocks. New collect drop-tags (venomCap, goblinEar,
  gnollFetish, grubPlate).
- **Tests** — added chain-integrity + drop-tag-obtainability checks (186 total).

### Part 1 — the quest system (2026-07-05)

- **`shared/data/quests`** — a typed, data-driven quest schema (`QuestDef` with eight
  objective kinds — kill/collect/gather/deliver/talk/explore/use/boss — rewards, prereqs,
  chapters/chains) plus a starter arc: the Brookhollow tutorial (walk to the fountain,
  cull boars, gather rat tails), main-story chapter 1 "Light the Way" (attune the
  Waystone), and the Millstead chain leading to the Briarhollow boss. Named quest-giver
  NPCs (`QUEST_GIVERS`) anchored to settlement plazas.
- **`shared/quests`** — a pure, deterministic quest state machine: accept, advance
  objectives from world events (`applyQuestEvent`), turn in (granting rewards), abandon,
  pin; quest log cap 25, tracker cap 5; prereq + level + turned-in gating; cross-NPC
  turn-ins. Runs client-side now and server-side unchanged in Phase 6.
- **Save v3** — characters gained a quest log (active quests + objective progress +
  turned-in ids); `migrate()` walks v2 saves forward with an empty log.
- **`client/game/questDirector`** — owns the quest log, feeds the engine world events
  (kills via the combat director, exploration each tick, talks, Waystone use), grants
  rewards through the combat director, and publishes the quest UI slices + per-giver
  indicators.
- **`client/ui`** — quest-giver `!`/`?` nameplate indicators, a **QuestDialog** (accept /
  turn-in / class-filtered reward choice), a **QuestLogPanel** (L: objectives, pin,
  abandon), a **QuestTracker** HUD (pinned quests), and transient **QuestToasts**.
- **Tests** — +19 (13 quest-engine + content-validity, save v2→v3 migration); 184 total.

## [Phase 3 — Combat, Classes & Character Growth] — 2026-07-05

Pathlands becomes a game: create a character, fight through the world 1→30, loot
and equip gear, die and respawn, get stronger. All simulation lives in `shared/`
(MMO-authoritative); the client runs it in lockstep and renders the result.

### Added

- **`shared/combat`** — the progression + formula core: the full stat model and
  derivations, the XP curve `400·L^1.55` (total ≈878k across 1→30), per-level class
  growth, and all GDD §4 combat math (weapon damage, armor mitigation with a 75% cap,
  ±5%/level delta capped ±25%, crit ×1.5, enemy HP/damage baselines, threat, kill XP).
- **`shared/data/{classes,skills}`** — the four classes (Warrior/Ranger/Priest/Mage)
  with Rage/Focus/Mana resources and every skill (10–12 each, learned by level) plus
  the 10/20/30 Path specialization choices, as typed data.
- **`shared/data/{enemies,items,loot}`** — the enemy roster (10 asset enemies + new
  authored archetypes + 5 Hollow bosses) with rank/family/AI/loot builders; the item
  schema (11 slots, rarity, ilvl, stat budgets, weapons/armor/trinkets) and itemization
  formulas; seeded loot tables.
- **`shared/sim`** — the deterministic 20 Hz tick resolver: `CombatEntity`, cast/GCD/
  cooldown/resource validation, a complete skill-effect interpreter, auras (DoT/HoT/
  buff/debuff/shield/CC), threat, death/XP events, enemy AI (aggro/chase/leash/ability
  use), and deterministic spawners. Intents in, events out — never the reverse.
- **`shared/data/spawns`** — a data-driven **world spawn table**: overworld regions for
  every zone (all ten asset enemies + archetypes in their WORLD.md zones) plus each
  Hollow's elite packs and its end boss, keyed to the settlement/Hollow coordinates.
- **Boss encounter scripts** — `EnemyDef.boss` phases (HP-threshold beats: summon adds,
  enrage, reflective shield) interpreted by `stepBossMechanics` in the resolver, with
  nearby-ally scaling (summon count +1 per extra ally) and a `bossPhase` UI event. The
  five bosses' names/families now match WORLD.md (Warlord Bramblegut, Mother Gnarlmaw,
  Prismhide, Forgewarden Urzul, the Last Waymaker).
- **`shared/data/vendors`** — general-goods **merchant** logic: deterministic per-seed
  stock scaled to a settlement's zone tier, `buyPrice`/`sellPrice` helpers (buy = value,
  sell = ¼), and settlement tier data.
- **`shared/proto/save` v2** + **`client/platform/saveStore`** — the versioned
  character/world-state schema (level/xp/gold/inventory/equipment/waystones/position)
  persisted to IndexedDB, matching the shape PostgreSQL will store in Phase 6.
- **`client/game/combatDirector`** — runs the shared sim in lockstep with movement,
  spawns/renders enemy models, publishes the HUD, activates only spawn regions near the
  player (culling distant enemies + boss adds), rolls loot on kill, and drives death →
  respawn-at-Waystone. Now also drives vendor buy/sell/buyback.
- **`client/ui`** — Onboarding (title → character list → creation → spawn), the combat
  HUD (player/target frames, hotbar with cooldowns, damage/heal/crit floaters, enemy HP
  nameplates) with Tab/click targeting, the CharacterPanel (equipment paperdoll, stats,
  and a bag with equip/sell), the WaystonePanel (attune + paid fast-travel), and the new
  **VendorPanel** (Buy / Sell / Buyback columns with a "Press E to trade" prompt).
- **Tests** — grew to **170** Vitest tests, adding combat-formula, class/skill, sim
  (cast/aura/threat/AI/spawner), save-migration, boss-mechanic, spawn-table, vendor, and
  an **acceptance** suite proving Briarhollow's boss is soloable at-level (Warrior and
  Ranger clear Warlord Bramblegut, adds and all).

### Changed

- **Boss/elite rank tuning (Phase-3 solo pass, GDD §4)** — softened the original ×8 HP /
  ×2 dmg boss (and ×3/×1.6 elite) to **×4.5 HP / ×1.25 dmg** boss and **×2.4 HP / ×1.3
  dmg** elite. With no potions and no modelled kiting yet, the original numbers made a
  90–180 s attrition fight unsurvivable for a no-sustain class (a small HP pool only
  absorbs ~10–15 s of ×2 boss damage). The softened values keep bosses clearly tougher
  than trash while making every Hollow soloable at-level now; Phase 5's balance pass
  restores longer fights once the full kit is in. Boss summons are 1 add/phase (solo).

### Fixed

- **Phase-3 adversarial review** (three independent passes over the combat/itemization/
  client diff): deterministic aura UIDs (moved the counter onto `CombatState`); Shield
  Wall stance now actually mitigates; DoTs/HoTs no longer drop their final tick; stun/
  silence interrupts casts and blocks auto-attacks; Execute scales with rage spent;
  Cleanse removes debuffs/nature-DoTs only; ground skills enforce range; enemies retarget
  to the highest-threat attacker (Taunt); shields are gated to plate-wearers and Warriors
  may wear mail+plate; `rollItemStats` spends its budget exactly; the client carries
  cooldowns/auras/cast/threat/stance across gear/level rebuilds, sheds unwearable gear on
  class change, decrements stacks on equip, and guards nameplate/floater projections;
  rarity colors fall back safely for corrupt old saves.

## [Phase 2 — A Living World] — 2026-07-05

### Added

- **`shared/models/structures`** — a building kit (`kit.ts`: typed `Building` parts — walls, gable/hip roofs, doors, windows, floors, chimneys, interiors) and voxel reconstructions of all **12 building PNGs** (houses 1–4, big houses 1–2, inn, church, stable, bathhouse, worker hut, fountain), each stamped as real voxels so interiors are part of the one-world mesh and walk-in. Emissive window/lantern voxels light up at night.
- **`shared/models/structures/fixtures`** — Waystones, wells, signposts, bridges, market stalls, graves, ruins, fences, and themed Hollow-entrance portals (goblin/gnoll/crystal/iron/crypt) authored in code.
- **`shared/models/props`** — per-biome trees, rocks, bushes, flowers, crops, and profession-node shells (ore veins & herbs, visual only until Phase 4), built as compact voxel sets for instanced rendering.
- **`shared/models/creatures`** — a quadruped/critter rig plus deer, Dire Stag (from its PNG, a neutral rare), rabbit, bird, and fish models.
- **`shared/models/characters/npcs`** — villager/guard/vendor humanoids with palette-swapped outfits and male/female variants.
- **`shared/worldgen/placement`** — the **authored layer** (`AuthoredLayer`): stamps buildings/fixtures into chunk voxels, flattens settlement platforms, grades roads, carves Hollow bowls, and provides deterministic NPC/prop/wildlife spawn queries. This is how hand-designed places coexist with procedural terrain without instancing (the "one world" guardrail).
- **`shared/worldgen/settlements`** — data for **8 settlements** (Waymeet capital + Brookhollow, Millstead, Fernwick, Mossgate, Grubbers' Rest, Glimmercamp, Cairnwick), **7 wild Waystones**, the road network, and the **5 Hollows** (Briarhollow Warrens, Gloomroot Cavern, Crystal Deeps, Ironvein Halls, Sunken Crypt) at their WORLD.md coordinates.
- **`client/engine`** — an instanced `PropRenderer` (greedy-merged, flat-shaded for draw-call/triangle budget), an `EntityManager` (spawns/despawns NPCs + wildlife, seeded wander AI, nameplate projection, nearest-interact), a cached `continentMap` bitmap with POIs + roads for the minimap/atlas, and `Environment` **weather** (clear/overcast/rain with cloud dimming, fog closing-in, and a rain particle field).
- **`client/game`** — a `Discovery` system (fog-of-discovery grid, persisted to localStorage) and store wiring for nameplates/dialogue/live-state/weather with typed `GameCommands`.
- **`client/ui`** — a live **Minimap** (POIs, North indicator, player arrow), a full-screen **DebugMap** world atlas (continent + roads + settlement/Hollow POIs + discovery fog + player), **Nameplates**, a placeholder **Dialogue** window, and dev-overlay rows for Hollow teleports and weather.
- **Tests** — grew to **70** Vitest tests: an `authored.test.ts` suite (settlement flattening, building stamping, Waystone/road grading, prop/NPC/wildlife spawn determinism, Hollow bowl carve + portal placement) and a deterministic `wander` test.

### Changed

- Extended the `Voxel` enum with structure/foliage/emissive materials (WoodOak…LanternGlow) and an `isEmissiveVoxel` helper; the mesher now splits each chunk into opaque + emissive material groups so windows/lanterns/crystals glow at night.
- Tuned Mossfang Weald tree density down (0.06 → 0.042) and enlarged rain particles for visibility after a triangle-budget/readability pass.

### Fixed

- **Phase-1 adversarial-review follow-ups** — corrected greedy-mesher cross-chunk border culling (out-of-volume voxels no longer emit magenta-defaulted faces), added chunk-streaming robustness (discard-guard, dispose-before-rebuild, worker `onerror` recovery), and made movement snap-to-ground on load.
- Purple-roof tint (blue hemisphere ambient bleeding into red tiles) by desaturating the sky-ambient toward white.
- **Phase-2 adversarial-review follow-ups:**
  - _Determinism:_ replaced `Math.hypot` in the authored placement layer with a
    deterministic `Math.sqrt`-based distance (as already done in `sim/movement.ts`);
    `Math.hypot` is only implementation-approximated and its result feeds
    `Math.round` into stamped terrain/carve heights, so it could have produced a
    non-byte-identical world across JS engines (client worker vs. Phase-6 server).
  - _Floating buildings:_ outer-ring buildings sit on a square grid whose corners
    reached past several towns' circular flatten radius, leaving them hovering
    (or buried) over unflattened slopes (up to 36 m at Grubbers' Rest). The
    settlement plateau is now derived from the building grid itself
    (`rings·PLOT·√2 + PLOT`, flat core + graded apron), and scatter exclusion
    shares that radius. New regression test asserts every grid plot sits flush.
  - _Collision/mesh material split:_ `voxelAt` returned plain `Stone` where
    `generateChunk` meshed `CrystalRock` veins in the Peaks (~42 k voxels),
    breaking the "collision matches meshing" invariant; both now call a shared
    `deepStone` helper.
  - _Chunk streaming:_ a worker error on a kept-but-not-desired chunk could stall
    it in `'loading'` forever (permanent hole); `onWorkerError` now requeues any
    loading chunk and the queue is rebuilt from all pending entries. The worker's
    message handler is wrapped in try/catch so one bad chunk degrades to an empty
    chunk instead of spinning the pool.
  - _Prop scatter:_ props are now excluded from Hollow bowls so trees no longer
    hover over the carved entrance pits.

### Verified

- `pnpm typecheck && pnpm lint && pnpm test (70) && pnpm build` all green.
- Headless-Chromium passes: Brookhollow with wandering NPCs, the world atlas showing all 8 settlements + roads + Hollows, and Briarhollow Warrens (carved bowl with a glowing blight portal) in the rain.

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
