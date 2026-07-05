# ROADMAP.md — Development Phases

Pathlands is built in **six phases**. Each phase is a major milestone that ends with a playable, deployable build — never a skeleton. Phases 1–5 produce a complete single-player game on Vercel; Phase 6 turns it into a true MMO on a Linux VPS.

**Status legend:** `[ ]` not started · `[~]` in progress · `[x]` done

## Current Status

> **Phase 4 in progress (2026-07-05) — Part 9: the complete main story (chapters 4–6).**
> "The Waymaker's Path" now runs end to end. The chain that opened at the Brookhollow
> fountain continues up into the **Glimmerpeaks** (ch.4 — the crystal is Waystone marrow,
> and something is draining it), across the **Trollmoor Highlands** (ch.5 — the trolls
> remember what the Waymakers buried), and down to the **Sunlit Coast & the Sunken Crypt**
> (ch.6 finale — the last Waymaker never left, and her grief is the Blight). Six new
> chain quests plus higher-zone side arcs and Hollow boss lead-ins (Mother Gnarlmaw,
> Prismhide, Forgewarden Urzul, and the Last Waymaker herself) bring the world to **~39
> quests from 14 givers**, giving a **gap-free 1→30 main-story path**. New quest-givers stand
> at Glimmercamp, Cairnwick, and Waymeet; new collect drop-tags (crystal scales, troll tusks,
> brine-pearls) feed the higher objectives. **236 tests green** (chain integrity + chapter
> 1–6 coverage + level-ordering + reachability); `pnpm typecheck && lint && build` clean; the
> game boots the full content set with the quest log open and zero console errors. Next:
> named rare-elite hunts and the bulk zone side-quest budget.
>
> ---
>
> **Part 8 (2026-07-05): the endgame loop v1 (daily bounties).**
> The hub towns now post a **daily Bounty Board** (**O**). A data-driven bounty pool
> (`shared/data/bounties.ts`) is rotated deterministically each day — seeded by the world
> seed + a day index taken once at bootstrap (the sim stays date-free) — so Brookhollow,
> Waymeet, Fernwick, and Mossgate each post 3 tasks: slay a family/type of foe or gather
> materials, for **gold + XP + Deed progress**. A client `BountyDirector` posts the nearest
> hub's board, tracks kill/gather events against accepted bounties, and pays out on turn-in
> (feeding a new **Taskmaster** Deed); the board resets each day. Save **v9** persists the
> daily log. **235 tests green** (bounty content/rotation + save v8→v9); `pnpm typecheck &&
lint && build` clean; in-browser `O` opens Brookhollow's board, accepting a bounty flips it
> to in-progress with a toast, zero console errors. Next: named rare-elite hunts, then the
> remaining quest content.
>
> ---
>
> **Part 7 (2026-07-05): supporting systems (Bank & Mailbox).**
> The **Waymeet Bank** opens with **B**: a two-tab panel with a **Vault** (a 50-slot shared
> item store — click to move stacks between bag and vault) and **Mail** (an inbox of letters
> from world NPCs, each with an optional gold gift claimed once). A new character starts with
> two welcome letters (`shared/data/mail.ts`), and reaching **level 5** — the Waymeet band
> per WORLD.md — delivers the Steward's stipend. Bank + mail persist per-character in **save
> v8**. **228 tests green** (mail data/validity + save v7→v8); `pnpm typecheck && lint &&
build` clean; in-browser, `B` opens the bank with both starter letters and a working "Take
> 25g" claim, zero console errors. Next: the endgame loop and the remaining quest content.
>
> ---
>
> **Part 6 (2026-07-05): mounts.** The level-20 **Wolf** rides
> the roads. A code-authored, saddled Wolf voxel model (`shared/models` — base + Dire +
> Frostfang skins, idle/walk/run/jump gaits) carries the rider at **+60% ground speed**;
> the speed flows through the simulation as a clamped `MoveIntent.speedMult` (so the
> Phase-6 server can recompute it), and Trailblazer's out-of-combat perk stacks on top.
> A client `MountController` owns which mounts the character has, enforces the GDD §7
> rules (level 20, 40-gold sink, **outdoor-only, instant dismount on entering combat** or
> water/a Hollow), renders the Wolf under the rider, and hands the movement tick its
> multiplier. `G` mounts/dismounts; the Character panel gained a **Mount** section (buy /
> ride / pick skin); the Dire & Frostfang skins unlock from the Slayer / Pathfinder
> Deeds. Save **v7** persists owned mounts + the active skin. **223 tests green** (6 mount
> data/model + 2 movement-multiplier + save v6→v7); `pnpm typecheck && lint && build`
> clean; in-browser, mounting is correctly gated ("Buy Grey Wolf · Requires level 20", a
> "Can't mount — no mount" toast on `G`) with zero console errors. Next: the endgame
> loop, supporting systems, and the remaining quest content.
>
> ---
>
> **Part 5 (2026-07-05): meta progression (Deeds & Path Points).**
> A pure Deed/perk engine (`shared/meta` +
> `shared/data/deeds.ts`/`perks.ts`) tracks **9 Deeds** across four categories
> (exploration, combat, quests, professions) over shared, tiered metrics — attuning
> Waystones feeds Wayfarer (3) and Pathfinder (8); slaying foes feeds First Blood (10)
> and Slayer (150); Hollow bosses, quest turn-ins, and crafts each have their own — and
> awards **Path Points** on completion. Points buy **4 rank-based Path Perks** (Deep
> Pockets → +2 bag slots/rank, Waywise → −15% Waystone travel fee/rank, Trailblazer →
> +5% out-of-combat move speed, Wanderer's Rest → +½ rested-XP cap level/rank). A client
> `MetaDirector` subscribes to the same world events the quest/combat systems emit,
> advances Deeds, awards Path Points, and applies perk effects live (bag cap + travel fee
> flow into the CombatDirector). A **Wayfarer's Journal (J)** lists Deeds by category with
> progress and buyable perks. Meta persists in **save v6**. **214 tests green** (10
> meta-engine + save v5→v6 migration); `pnpm typecheck && lint && build` clean; in-browser
> the Journal renders all 9 Deeds + 4 perks over Heartmead Vale with zero console errors.
> Next: mounts, the endgame loop, and the remaining quest content.
>
> Earlier Phase-4 parts: **Part 1** the quest system (pure engine + starter arc, save v3),
> **Part 2** the early-zone questing spine (~21 quests, 8 givers, levels 1–14), **Part 3**
> gathering professions (Mining/Herbalism/Fishing, save v4), **Part 4** crafting
> professions (Blacksmithing/Alchemy + consumables, save v5). See the per-part notes under
> **Phase 4** below.
>
> ---
>
> **Phase 3 complete (2026-07-05).** Pathlands is now a game. The MMO-authoritative
> combat & progression core lives in `shared/` (stat/XP/formula math, all four
> classes' skills + 10/20/30 Paths, the enemy roster of 10 asset + new archetypes +
> 5 Hollow bosses, and the full deterministic 20 Hz sim: cast/GCD/cooldown/resource
> validation, a skill-effect interpreter, auras, threat, death/XP events, enemy AI,
> and deterministic spawners). The client `CombatDirector` runs that sim in lockstep
> with movement and drives the HUD (player/target frames, hotbar with cooldowns,
> damage/heal/crit floaters, enemy nameplates) with Tab/click targeting and 1-0
> casting. **The full solo loop plays end to end:** onboarding (title → character
> list → creation → spawn) with save schema v2 + IndexedDB; a bag + equipment
> paperdoll + character sheet with level-scaled loot; the Waystone network (attune
> for XP, paid fast-travel, respawn-at-Waystone on death); a **data-driven world
> spawn table** (`shared/data/spawns.ts`) that populates every zone with its
> WORLD.md enemies and each Hollow with elite packs + its end boss (activated by
> proximity, culled at range); **boss encounter scripts** (summon adds / enrage /
> reflective shield at HP thresholds, with nearby-ally scaling); and **general-goods
> merchants** (buy / sell / buyback via the VendorPanel). A three-pass adversarial
> review hardened the combat resolver, itemization, and client. Boss/elite rank
> multipliers were softened for solo survivability (boss ×4.5 HP / ×1.25 dmg — see
> GDD §4; Phase 5 restores longer fights with the full kit). **170 shared tests
> green** (incl. an acceptance suite proving Warrior + Ranger solo Warlord Bramblegut);
> `pnpm typecheck && lint && build` clean; headless-Chromium pass shows Briarhollow
> populated with the boss + goblin pack and combat running with zero console errors.
> Next up: **Phase 4 — Quests, Professions & the Long Game.**
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

## Phase 3 — Combat, Classes & Character Growth ✅ COMPLETE

**Milestone:** Pathlands becomes a game: create a character, fight through the world, level 1→30, loot and equip gear, die and respawn, get stronger. All ten enemy assets live in the world.

### Deliverables

- [x] **Onboarding v1** — title screen → local character list → character creation (class choice with PNG portraits, name, 4–6 voxel appearance options like skin/hair palette) → spawn into Heartmead Vale. Local profiles via the versioned save system (IndexedDB).
- [x] **Core stats & leveling** — the full stat model, XP curve to 30, per-level class growth, rested XP, level-up presentation — exactly per GDD §Stats/§Leveling.
- [x] **Tab-target combat** — target selection (click/Tab/nearest-enemy), hotbar (10 slots + consumable slots), cast times, cooldowns, global cooldown, auto-attack, range/line-of-sight checks, threat, damage/heal/crit floaters, target frame with cast bar, combat state; all resolution math in `shared/combat`.
- [x] **Four classes complete** — every skill for Warrior/Ranger/Priest/Mage per GDD (10–12 skills each, learned by level), class resources (Rage/Focus/Mana), Path specialization choices at 10/20/30, trainer NPCs, respec.
- [x] **Enemy AI & population** — aggro radius, leash, chase, skill use, flee-at-low-HP archetypes; spawn tables + respawn timers per zone from docs/WORLD.md (`shared/data/spawns.ts`, activated by proximity on the client); all 10 enemy PNGs as in-game models (Briar Goblin, Mossfang Wolf, Thornback Boar, Venomcap Spriggan, Hollowroot Treant, Dire Stag, Cave Gnoll, Stonejaw Grub, Crystalback Lizard, Ironhide Troll) plus new Claude-authored archetypes (bandits, marsh slime, cave bat, bog drake, skeletons, crypt sentinel…). _(More named rares are content-filled in Phase 4.)_
- [x] **Hollow population** — the five Hollows stocked with elite packs and end bosses with data-driven mechanics per docs/WORLD.md (summon adds / enrage / reflective shield at HP thresholds); solo-tuned with nearby-ally scaling hooks (summon count +1 per extra ally, used properly in Phase 6).
- [x] **Items, inventory & gear** — item schema (rarity, ilvl, stats, requirements), 11 equip slots, bag grid, loot rolls, gold, vendors (buy/sell/buyback via the merchant NPC + VendorPanel), itemization for levels 1–30 per GDD. _(Bag upgrades + quest-item flagging land with Phase 4 professions/quests.)_
- [x] **Death & Waystones** — death → release → respawn at last-activated Waystone; Waystone activation network + paid fast travel between activated Waystones. _("Winded" respawn debuff is wired in Phase 5 polish.)_
- [x] **HUD v1** — player/target frames, hotbar, XP bar, character sheet, inventory, dev settings (view distance, teleports). _(Buff/debuff icon tray + full settings screen are Phase 5.)_

### Acceptance Criteria

1. [x] A new character of each class can be created and played through combat/exploration; XP, loot, and gear progression match GDD tables (formulas unit-tested; leveling/loot verified in-browser). _(Full 1→12 questing pace is Phase 4 content.)_
2. [x] All 10 asset enemies (and the new archetypes) fight with functioning AI, animations, loot, and correct level bands in their atlas-assigned regions (`shared/data/spawns.ts`; verified in-browser at Briarhollow).
3. [x] Briarhollow Warrens (the level ~8–12 Hollow) is clearable solo at-level, including its boss; death/respawn/Waystone loop works (acceptance test: Warrior + Ranger solo Warlord Bramblegut; boss + pack verified spawning in-browser).
4. [x] Combat math unit tests pass (damage, mitigation, crit, threat, XP — 170 tests green); save/load round-trips a mid-progress character losslessly.
5. [x] The onboarding flow works on the static build (title → create → spawn → persist verified in headless Chromium; Vercel-deployable `client/dist`).

---

## Phase 4 — Quests, Professions & the Long Game 🚧 IN PROGRESS

**Milestone:** The content game: ~110 quests including the main story, all five professions, meta progression, mounts, achievements, and an endgame loop. This is the "the world has things to do everywhere" phase.

> **Part 1 done (2026-07-05):** the **quest system** — a pure, data-driven engine
> (`shared/quests` + `shared/data/quests`) with all eight objective kinds, chains,
> prereqs, a 25-quest log and 5-pin tracker; named quest-giver NPCs at the settlements
> with `!`/`?` indicators; a giver dialogue (accept / turn-in / reward choice); a quest
> log panel (L) and tracker HUD; XP/gold/item/Waystone rewards; and save v3 persistence.
> A starter arc (Brookhollow tutorial + main-story ch.1 "Light the Way" + the Millstead
> chain into the Briarhollow boss) exercises every objective kind. 184 tests green.
>
> **Part 9 done (2026-07-05):** **the complete main story** — chapters 4–6 of "The
> Waymaker's Path". The chain extends from the Foothills up through the **Glimmerpeaks**
> (crystal-marrow ch.4), the **Trollmoor Highlands** (buried-forge ch.5), and the **Sunlit
> Coast → Sunken Crypt** finale (ch.6), with six new chain quests, higher-zone side arcs,
> and Hollow boss lead-ins (Gnarlmaw / Prismhide / Forgewarden Urzul / the Last Waymaker).
> 6 new quest-givers at Glimmercamp, Cairnwick, and Waymeet; new collect drop-tags for the
> higher enemies. The main story is now a **gap-free level 1→30 path** (~39 quests, 14
> givers). 236 tests green (adds chapter-1–6 coverage + level-ordering checks). **Next:**
> named rare hunts and the bulk zone side-quest budget.
>
> **Part 8 done (2026-07-05):** **the endgame loop v1** — **daily bounty boards**. A
> data-driven bounty pool (`shared/data/bounties.ts`) posts a deterministic daily slice at
> each of the four hub towns, seeded by the world seed + a bootstrap day index (the sim
> stays date-free). A client `BountyDirector` posts the nearest hub's board (**O**), tracks
> kill/gather events against accepted bounties, and pays **gold + XP + Deed progress** on
> turn-in — completing bounties advances a new **Taskmaster** Deed. The board resets each
> day; save **v9** persists the log. 235 tests green (bounty content/rotation + save v8→v9);
> in-browser `O` opens Brookhollow's board and accepting a bounty flips it to in-progress
> with a toast, zero console errors. **Next:** named rare-elite hunts and the remaining
> quest content.
>
> **Part 7 done (2026-07-05):** **supporting systems** — the **Waymeet Bank & Mailbox**.
> A single `BankPanel` (**B**) with two tabs: a **Vault** (`BANK_SIZE` = 50 shared storage
> slots; click a bag item to deposit, a vault item to withdraw) and **Mail** (an inbox of
> letters from world NPCs, each with a claim-once gold gift). Mail is data
> (`shared/data/mail.ts`): new characters open with two welcome letters, and reaching level 5
> delivers the Waymeet Steward's stipend. Bank deposit/withdraw + mail claim/deliver live on
> the `CombatDirector` (they move items + gold); save **v8** persists the vault + inbox. 228
> tests green (mail validity + save v7→v8); in-browser `B` opens the bank with both starter
> letters + a working "Take 25g" claim, zero console errors. **Next:** the endgame loop and
> the remaining quest content.
>
> **Part 6 done (2026-07-05):** **mounts** — the level-20 **Wolf**. A code-authored,
> saddled Wolf voxel model (`shared/models/creatures/mounts.ts`; base + Dire + Frostfang
> skins, idle/walk/run/jump gaits) carries the rider at **+60% ground speed**, delivered
> through the sim as a clamped `MoveIntent.speedMult` (Trailblazer's out-of-combat perk,
> wired here too, stacks on top). A client `MountController` owns owned-mount state,
> enforces the GDD §7 rules (level 20, 40-gold sink, outdoor-only, auto-dismount on
> entering combat / water / a Hollow), renders the Wolf under the rider, and feeds the
> movement tick its multiplier. **G** mounts/dismounts; the Character panel has a **Mount**
> section (buy / ride / pick skin); the Dire & Frostfang skins unlock from the Slayer /
> Pathfinder Deeds. Save **v7** persists owned mounts + the active skin. 223 tests green
> (6 mount + 2 movement-multiplier + save v6→v7); in-browser the buy button is level-gated
> and `G` toasts correctly with zero console errors. **Next:** the endgame loop, supporting
> systems (bank/mailbox), and the remaining quest content.
>
> **Part 5 done (2026-07-05):** **meta progression** — Deeds & Path Points. A pure
> Deed/perk engine (`shared/meta` + `shared/data/deeds.ts`/`perks.ts`): **9 Deeds** across
> four categories (exploration, combat, quests, professions) driven by shared, tiered
> metrics (e.g. Waystone attunements feed both Wayfarer 3 and Pathfinder 8), each awarding
> **Path Points** once complete; and **4 rank-based Path Perks** (Deep Pockets → bag slots,
> Waywise → Waystone travel-fee cut, Trailblazer → out-of-combat move speed, Wanderer's
> Rest → rested-XP cap). A client `MetaDirector` subscribes to world events (kills, Hollow
> bosses, Waystone attunes, quest turn-ins, crafts, gather-skill 25) → advances Deeds →
> awards Path Points → applies perk effects live (bag cap + travel fee flow into the
> CombatDirector). New UI: a **Wayfarer's Journal (J)** listing Deeds by category with
> progress and buyable perks. Save **v6** persists deeds/pathPoints/perks on the character.
> 214 tests green (10 meta-engine + save v5→v6 migration); in-browser the Journal renders
> all 9 Deeds + 4 perks with zero console errors. **Next:** mounts, the endgame loop, and
> the remaining quest content.
>
> **Part 4 done (2026-07-05):** **crafting professions** (Blacksmithing + Alchemy),
> closing the gather→craft→use loop. A pure craft engine (`shared/professions/craft.ts`)
> validates a recipe against the material stash + skill, consumes the inputs, and yields
> the output + a skill-up. Recipes + consumables are data (`shared/data/recipes.ts`):
> smelt ore→bars→gear, and brew health/mana potions + might/warding elixirs. Crafting
> runs through the client (materials → the stash / bag), a **Crafting panel (K)** shows
> each recipe's inputs + craftable state, and **consumables are drinkable** from the
> Professions panel — potions heal/restore, elixirs apply a timed combat buff via the
> aura system (a first step toward the Phase-5 boss re-tuning). Save **v5** persists the
> consumables stash. 204 tests green (8 craft-engine + save v4→v5 migration); in-browser
> the crafting panel renders both professions' recipes with zero console errors.
>
> **Part 3 done (2026-07-05):** **gathering professions** (Mining, Herbalism, Fishing).
> A pure skill/gather engine (`shared/professions` + `shared/data/professions`): skill
> 1–100 with the orange/yellow/green/gray skill-up curve, tiered materials, seeded
> gather yields (ore + stone + rare gem; herbs; fish + oil + big-catch proc), and a
> fishing-catch roll. The client `GatherDirector` finds nodes by re-running the
> deterministic worldgen scatter near the player, drives a mining/herbalism **channel**
> (cancels on movement) and a **fishing minigame** (cast → bite window → reel), banks
> materials into a per-character stash, and levels the profession. New UI: a gather
> prompt + channel bar, and a **Professions panel (P)** with the five skill bars and
> the material stash. Save **v4** persists profession skills + materials. 195 tests
> green (8 profession-engine + save v3→v4 migration); in-browser the panel renders with
> zero console errors. **Next:** crafting (Blacksmithing/Alchemy), then meta
> progression, mounts, and the endgame loop.
>
> **Part 2 done (2026-07-05):** the early-zone **questing spine** — main-story chapters
> 1–3 of "The Waymaker's Path" (Brookhollow → Millstead → the Weald blight-wells → the
> Foothills gnoll caves, a level-ordered prereq chain) plus side arcs across Heartmead
> Vale, Mossfang Weald, and the Stonejaw Foothills: **~21 quests** offered by **8 named
> givers** at five settlements, spanning levels 1–14, with new collect drop-tags and
> content-validity tests (chain integrity, tag obtainability). 186 tests green.
> **Next:** the remaining zones' quests, then gathering/crafting professions, meta
> progression, mounts, and the endgame loop.

### Deliverables

- [x] **Quest system** — data-driven quest schema (kill/collect/gather/deliver/talk/explore/use-object/boss + multi-step chains) in `shared/data/quests`, a pure state machine in `shared/quests` (quest log 25 max, tracker 5 pinned, prereq/chain gating, reward granting), NPC `!`/`?` indicators, quest-giver dialogue with reward + class-filtered choice, quest log panel + tracker HUD, XP/gold/item/Waystone rewards, save v3 persistence. _(Map/minimap markers + Phase-6 shareable flags land with the bulk quest-content part.)_
- [~] **Quest content** — **~110 quests** per docs/WORLD.md zone tables: the 6-chapter main story "The Waymaker's Path", zone side-quest arcs, Hollow quest lines, profession intro quests, daily bounty boards. _(Parts 2 + 9 done: the **complete main story — all six chapters, Brookhollow tutorial → the Sunken Crypt finale (levels 1–30)** — plus side arcs and Hollow boss lead-ins (Bramblegut, Gnarlmaw, Prismhide, Forgewarden Urzul, the Last Waymaker) across all six zones, ~39 quests from 14 givers. Part 8 added the daily bounty boards. Remaining: the bulk of the zone side-quest budget + profession intro quests toward ~110.)_
- [~] **Gathering professions** — Mining, Herbalism, Fishing: skill 1–100 with the classic orange/yellow/green/gray skill-up curve, node activation by re-querying the deterministic worldgen scatter (with respawn timers), tiered materials per zone (Copper/Iron/Silver/Crystalium, Meadowbloom/Fenweed, ponds→coast), a mining/herbalism channel + a fishing timing minigame, a material stash + Professions panel (P). _(Remaining: higher-tier herb node placement (Cavemoss/Duskpetal), tool items, and profession trainers.)_
- [~] **Crafting professions** — Blacksmithing (smelt ore→bars→weapons/armor) and Alchemy (health/mana potions + stat/warding elixirs) with a pure craft engine, a crafting panel (K) showing material requirements + craftable state, and drinkable consumables (heal/restore/timed buff) — closing the mining→smithing / herbalism→alchemy material flows. _(Remaining: discovery recipes, forge/anvil station proximity, trainers, and a fuller recipe book.)_
- [~] **Meta progression: Deeds & Path Points** — achievement system ("Deeds": exploration, combat, quests, professions, Hollows), Deeds grant Path Points spent on perks (bag slots, Waystone fee reduction, out-of-combat move speed, rested-XP cap) per GDD §10. _(Part 5 done: a pure Deed/perk engine (`shared/meta` + `shared/data/deeds.ts`/`perks.ts`) — 9 Deeds across 4 categories with shared tiered metrics, 4 rank-based Path Perks; a client `MetaDirector` wires kills/bosses/Waystones/quests/crafts/gather-skill milestones to Deed progress, awards Path Points, and applies perk effects (bag cap, travel-fee cut) live; a **Wayfarer's Journal (J)** shows Deeds by category + buyable perks; save v6 persists deeds/pathPoints/perks on the character. Remaining: account-wide perks + nameplate titles land with mounts / the endgame loop / Phase 6 accounts.)_
- [x] **Mounts** — the level-20 Wolf (+60% ground speed, 40-gold sink), a code-authored rideable Wolf voxel model with a saddle + idle/walk/run/jump gaits and 3 palette skins (base bought for gold; Dire & Frostfang unlocked by the Slayer / Pathfinder Deeds), `G` to mount/dismount, and the GDD §7 rules enforced client-side (outdoor-only, auto-dismount the instant combat starts or on entering water/a Hollow). Speed flows through the sim as a clamped `MoveIntent.speedMult`; the Character panel has a Mount section (buy / ride / pick skin); save v7 persists owned mounts + the active skin. _(Account-wide skins + the mount-acquisition quest land with the endgame loop / Phase-6 accounts.)_
- [~] **Endgame loop v1** — **daily bounty boards** at the four hub towns (Brookhollow / Waymeet / Fernwick / Mossgate): a data-driven bounty pool (`shared/data/bounties.ts`), a deterministic daily rotation seeded by the world seed + a day index taken at bootstrap, a `BountyDirector` that tracks kill/gather progress and pays gold + XP + Deed progress (the new "Taskmaster" Deed) on turn-in, and a Bounty Board panel (**O**) showing the nearest hub's postings; save v9 persists the daily log. _(Remaining: named rare-elite hunt targets with Deed tracking, Hollow boss re-run loot tables, profession masteries, and the "restore the final Waystone" world-event stub.)_
- [~] **Supporting systems** — the **Waymeet Bank** (a 50-slot shared vault + a mailbox) as a single `BankPanel` (**B**) with Vault / Mail tabs: move stacks between bag and vault; read letters from world NPCs and claim their gold gifts; the Steward's welcome letter is delivered on reaching level 5. Save v8 persists the vault + inbox. _(Remaining: bank-building/mailbox-prop gating, item mail attachments, improved settings, and keybind remapping.)_

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
