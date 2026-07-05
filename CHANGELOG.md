# Changelog

All notable changes to Pathlands are documented here, per working session. Format follows [Keep a Changelog](https://keepachangelog.com/); the project is pre-release, so entries are grouped by phase rather than semver until 1.0.

## [Phase 4 — Quests, Professions & the Long Game] — in progress

### Part 13 — Settings & keybind remapping (2026-07-05)

#### Added

- **`shared/data/keybinds`** — the rebindable keybind schema: `KEYBIND_ACTIONS` (the 14
  remappable panel/action keys), `DEFAULT_KEYBINDS`, human `KEYBIND_LABEL`s, `defaultKeybinds()`,
  a `RESERVED_CODES` list (movement / hotbar / menu keys that may never be bound), and a
  `keyLabel()` display helper. Pure data — the client reads and edits the persisted map.
- **`client/ui/SettingsPanel`** — a new panel (open with **Escape** when nothing else is open,
  ✕ to close): view-distance slider (3–12 chunks), master-volume slider, and a full keybind
  list. Click a row and press a key to rebind; the keypress is caught in the **capture phase**
  and swallowed so it never reaches the game's input handler. Reserved keys are refused with a
  flash; picking a key another action holds **swaps** the two; a **Reset to defaults** button
  restores the map. Sliders and binds persist to the save's `settings` block.
- **Save v11** — `settings.keybinds` added to the schema; `createNewSave` seeds the defaults;
  `migrate()` defaults the keybind map for pre-v11 saves, merging any saved binds forward.

#### Changed

- **`client/game/game.ts`** — panel/action toggles now read the **live keybind map** each
  frame (`store.keybinds`) instead of hardcoded key codes. **Escape** closes any open transient
  dialog (dialogue / travel / vendor / quest dialog) or, when none is open, toggles the Settings
  panel.
- **Onboarding → App → store** — the saved `settings` (view distance, volume, keybinds) are
  threaded through character entry and seeded into the store before the game boots.

#### Tests

- +1 (save v10→v11 keybind-default migration + `settings.keybinds` round-trip); **246 total**.

### Part 12 — named rare-elite hunts (2026-07-05)

- **`shared/data/enemies`** — a `named` flag on `EnemyDef` and **8 named rare-elites** (Old
  Thornhide, Grislefang, Duskwing, Boulderjaw, Gnash-Cowl, Shardback Alpha, Gruulmarg the
  War-Chief, Wreckmaw): Elite rank, reusing a family model, spanning the zones from the Vale
  to the Coast. Elite rank already grants tougher stats + better loot.
- **`shared/data/spawns`** — one single-spawn, ~15-minute-respawn region per rare at a wander
  point in its zone.
- **`shared/data/deeds`** — a **Rarebane** Deed (`rare` metric, slay 5) in the Combat category.
- **`client/game/metaDirector`** — `handleKill` feeds the `rare` metric and announces the kill
  ("Rare slain: …!") when the fallen enemy is `named`.
- **Tests** — +1 (named rares are Elite, buildable, world-spawned, and tracked by a Deed);
  245 total.

### Part 11 — closing the acceptance gaps (2026-07-05)

- **Account-wide Path Points + perks (save v10).** Moved `pathPoints`/`perks` off the
  character and onto the account (`AccountSaveV3`), so perks bought on one character apply to
  all local characters (GDD §10, criterion #4). `migrate()` folds any pre-v10 per-character
  meta into the account — the highest Path-Point pool and the max-rank union of perks — so no
  progress is lost. Threaded the account through Onboarding → App → Game → MetaDirector;
  character + account persist together in one read-modify-write (`upsertCharacterAndAccount`).
  Deeds stay per-character. Added save v9→v10 fold + round-trip tests.
- **Quest markers on the world map + minimap (criterion #3).** The `QuestDirector` publishes a
  marker slice: giver positions (settlement centre + offset) tagged `!` (new) / `?` (turn-in) /
  in-progress, and `○` rings at active explore-objective areas. `DebugMap` (world atlas, M) and
  `Minimap` draw them, with a quest entry in the map legend.
- **Tests** — +1 (save v9→v10 account fold); 244 total.

### Part 10 — acceptance pass: review + fixes (2026-07-05)

#### Fixed

- **Critical — main story was blocked at chapter 1.** Quest `use` objectives and
  `waystoneUnlock` rewards used **bare** Waystone ids (`brookhollow`, `elderGlade`, …) while
  the client emits and stores the canonical `ws-<id>` on attune. Attuning the Brookhollow
  Waystone therefore never satisfied _Light the Way_, blocking the whole `waymakers-path`
  chain; quest-granted stones were also never usable for travel/respawn. All eight quest
  Waystone ids are now `ws-`-namespaced, with a regression test asserting every quest
  Waystone id resolves to a real `WAYSTONES` entry.
- **Herbalism could not reach 100.** The worldgen scatter only placed tier-0/1 herbs
  (Meadowbloom/Fenweed). Added the tier-2/3 herb nodes — **Cavemoss** (Foothills/Peaks) and
  **Duskpetal** (Trollmoor) — with prop models + `NODE_INFO` entries, so all four Herbalism
  tiers exist in the world (criterion #2).
- **Mount buy-hint went stale at level 20.** The `MountController` republish key ignored the
  hint's blocking-reason, so crossing level 20 while still short on gold kept showing
  "Requires level 20" instead of "Costs 40 gold". The key now includes the hint.
- **Level-5 Waymeet letter was unreachable for high-level saves.** It only fired on the
  in-session 4→5 crossing; the `CombatDirector` now back-fills it at construction for any
  character already past level 5 (deduped by id).

#### Added

- **`shared/test/acceptance-p4.test.ts`** — encodes the pure-`shared` acceptance checks:
  quests blanket the whole 1→30 band with no dead zone (no grinding wall), rewards scale with
  level, the main story is a complete chain to a level-30 boss finale, and the meta / mount /
  crafting systems satisfy their criteria. 243 tests total.
- **GDD §15** — recorded the quest-vs-kill **XP-source split** discrepancy (the curve makes
  kills dominant vs §5's ~55% quest target) as a Phase-5 tuning item.

### Part 9 — the complete main story (chapters 4–6) (2026-07-05)

- **`shared/data/quests/content`** — extended "The Waymaker's Path" from chapter 3 to the
  finale: **chapter 4** (Glimmerpeaks — _Crystal Marrow_ → _Songs in the Crystal_),
  **chapter 5** (Trollmoor — _The Trolls Remember_ → _The Buried Forge_), and **chapter 6**
  (Sunlit Coast → _The Drowned Road_ → _The Last Waymaker_ finale, levels 28–30). Added
  higher-zone side arcs (shardback cull, Frostgate vigil, bog drakes, the standing stones,
  wreck scavengers, crypt sentinels) and Hollow boss lead-ins (Mother Gnarlmaw, Prismhide,
  Forgewarden Urzul, and the Last Waymaker) — ~15 new quests, bringing the world to ~39
  quests and giving a gap-free 1→30 main-story path.
- **Quest-givers** — 6 new named givers at Glimmercamp (Prospector Vayle, Shrinekeeper
  Isold), Cairnwick (Castellan Brenna, Loremaster Keld), and Waymeet (Harbormaster Cole,
  Archivist Selwyn-Mar), taking the roster to 14.
- **Drop tags** — new collect tags for the higher enemies (crystal scales ← Crystalback
  Lizard, troll tusks ← Ironhide Troll, brine-pearls ← Drowned Dead), emitted by the
  existing data-driven kill→collect path.
- **Tests** — +1 (chapters 1–6 present, level-30 boss finale, non-decreasing minLevel along
  the chain); the existing chain-integrity / reachability / obtainability checks now cover
  the full story. 236 total.

### Part 8 — endgame loop v1: daily bounties (2026-07-05)

- **`shared/data/bounties`** — a data-driven bounty pool (16 across four hub towns:
  Brookhollow / Waymeet / Fernwick / Mossgate), each a kill (an enemy family or id) or
  gather (a material) task with gold + XP. `dailyBountyIds(seed, day, hub)` posts a
  deterministic daily slice, and `bountyById` / `hubPool` helpers. A **Taskmaster** Deed
  ("complete 10 bounties", `bounty` metric) added to `shared/data/deeds`.
- **Save v9** — characters gained a bounty log (`day` + accepted `active` + today's
  `completed`); `migrate()` walks v8 forward with an empty log, and the client resets it
  when the stored day is stale.
- **`client/game/bountyDirector`** — posts the board for the hub nearest the player,
  tracks kill events (`onKill`, matching by enemy family or id) and gather events
  (`onGather`, wired from a new `GatherDirector.onMaterialGained` hook), and on turn-in pays
  the reward through `CombatDirector.grantReward` (gold + XP) and advances the Taskmaster
  Deed via `MetaDirector.handleBounty`. The day index is taken once at bootstrap.
- **`client/ui`** — a **BountyBoard** panel (`O`) listing the hub's postings with slay/gather
  targets, live progress, rewards, and an Accept / Turn in / Done button per bounty.
- **Tests** — +7 (bounty content validity + daily-rotation determinism, save v8→v9
  migration); 235 total.

### Part 7 — supporting systems: Bank & Mailbox (2026-07-05)

- **`shared/data/mail`** — the mailbox stub: a `MailLetter` schema, the `STARTER_MAIL`
  inbox (a Brookhollow welcome + a Waymeet-Steward intro), the level-5 `WAYMEET_WELCOME`
  stipend letter, and `starterInbox()` / `mailById` helpers. `BANK_SIZE` (50) added to
  `shared/data/items`.
- **Save v8** — characters gained a `bank` (vault item stacks) and a `mail` inbox;
  `migrate()` walks v7 forward, seeding the starter inbox for pre-mail saves.
- **`client/game/combatDirector`** — bank `depositItem` / `withdrawItem` (moving stacks
  between bag and vault with capacity checks) and mail `claimMail` (grants the gold gift
  once) / `deliverMail` (append a letter, deduped). Reaching level 5 delivers the Waymeet
  welcome letter. Publishes bank + mail store slices.
- **`client/ui`** — a **BankPanel** (`B`) with **Vault** and **Mail** tabs: the vault shows
  the stored stacks + the bag side-by-side (click to move), and the mail tab lists letters
  with sender/subject/body and a claim button; the tab shows an unread-gift badge.
- **Tests** — +5 (mail content/inbox validity + a save v7→v8 migration check); 228 total.

### Part 6 — mounts (2026-07-05)

- **`shared/data/mounts`** — the mount catalog: the level-20, 40-gold **Grey Wolf**
  (+60% ground speed) plus two Deed-unlocked skins (Dire Wolf ← Slayer, Frostfang Wolf
  ← Pathfinder). `MOUNT_MIN_LEVEL`, `mountById`, `mountForDeed`, `BASE_MOUNT` helpers.
- **`shared/models/creatures/mounts`** — a rideable, saddled Wolf voxel model authored
  in code (ART_GUIDE §2), stockier than the enemy wolf, with idle/walk/run/jump gaits
  and three palette skins; `buildMountModel` registry + cache.
- **Movement** — `MoveIntent.speedMult` (optional, default 1) applies a **clamped**
  ground-speed multiplier in `stepPlayerMovement` (`MIN/MAX_SPEED_MULT`); swimming is
  unaffected. Deterministic and server-recomputable, so no client value can grant
  absurd speed.
- **Save v7** — characters gained `mounts` (owned ids) + `activeMount` (the ridden
  skin); `migrate()` walks v6 saves forward with no mounts.
- **`client/game/mountController`** — owns owned-mount state, mount/dismount and its
  rules (level 20, outdoor-only via an underground check, **instant dismount on entering
  combat**/water/a Hollow), renders the Wolf under the interpolated rider, and hands the
  movement tick a speed multiplier. Buys the Wolf (debiting gold via a new
  `CombatDirector.spendGold`), and grants a skin when its Deed completes
  (`MetaDirector.onDeedComplete`). Trailblazer's out-of-combat move-speed perk is now
  wired through the same multiplier.
- **`client/ui`** — the Character panel gained a **Mount** section (buy / ride / pick
  skin); `G` toggles the mount; the controls hint lists "G mount".
- **Tests** — +9 (6 mount data/model + 2 movement-multiplier, save v6→v7 migration);
  223 total.

### Part 5 — meta progression: Deeds & Path Points (2026-07-05)

- **`shared/data/deeds` / `shared/data/perks`** — **9 Deeds** across four categories
  (exploration: Wayfarer/Pathfinder; combat: First Blood/Slayer/Hollow-Delver/Hollow-Master;
  quests: Helping Hand/The Waymaker's Path; professions: Apprentice/Artisan), each with a
  category, metric, threshold, and Path-Point award; tiered Deeds share one metric (a single
  `waystone`/`kill`/`boss`/`quest`/`craft`/`gatherSkill25` counter feeds every tier). **4
  Path Perks** with per-rank magnitudes: Deep Pockets (+2 bag slots/rank, 4 ranks), Waywise
  (−15% Waystone travel fee/rank, 2 ranks), Trailblazer (+5% out-of-combat move speed, 1
  rank), Wanderer's Rest (+½ rested-XP cap level/rank, 3 ranks).
- **`shared/meta`** — a pure engine: `createDeedState`, `applyDeedProgress(state, metric,
amount?)` (advances every Deed on that metric, clamps to threshold, returns award notices
  once complete without re-awarding), `earnedPathPoints`, and `buyPerk(perks, points, id)`
  (affordability + max-rank checked, debits points) / `perkMagnitude` (sums a rank-scaled
  effect).
- **Save v6** — characters gained `deeds` (progress + completed), `pathPoints`, and `perks`
  (rank by id); `migrate()` walks v5 saves forward with empty meta.
- **`client/game/metaDirector`** — subscribes to the world events the combat/quest/gather
  directors already emit (kills, Hollow-boss kills, Waystone attunes, quest turn-ins,
  crafts, gather-skill 25), advances Deeds, awards Path Points with a toast, and applies
  perk effects live — bag-slot and travel-fee magnitudes flow into the CombatDirector via
  `setPerks`. `game.ts` fans the events out to it alongside the quest director.
- **`client/ui`** — a **Wayfarer's Journal (J)** listing Deeds grouped by category (progress
  / completion) and the four Path Perks with rank, cost, and a buy button gated on Path
  Points.
- **Tests** — +10 (Deed progress/award/clamp/no-re-award, Path-Point sums, perk buy/afford/max,
  content validity) + a save v5→v6 migration check; 214 total.

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
