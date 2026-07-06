# Pathlands — World Atlas

The content bible: lore, the continent layout, zones, settlements, dungeons ("Hollows"), enemy placement, and quest distribution. Systems live in [GAME_DESIGN.md](GAME_DESIGN.md). Worldgen implements this atlas via the authored placement layer described in [ARCHITECTURE.md](ARCHITECTURE.md).

## 1. Lore (the short version that fits in quests)

Long ago, the **Waymakers** laced the continent with stone-paved paths and standing **Waystones** — a network that let them step between anywhere and anywhere. Then they vanished. Centuries on, the paths are cracked, most Waystones sleep, and folk cluster in villages along the old roads. Now a creeping **Verdigris Blight** — a luminous green moss-rot — seeps up from somewhere deep, twisting beasts (mossfanged wolves, venom-capped spriggans, hollow-rooted treants) and waking things best left asleep. The player is a **Wayfarer**: one of the few who can still _light_ Waystones by touch. The main story, **The Waymaker's Path**, follows the blight down the oldest road on the map — to the Sunken Crypt beneath the Sunlit Coast, where the last Waymaker went, and did not leave.

Tone: warm, rural, a little melancholy, flashes of humor. Villagers have small problems; the world has one big one.

## 2. The Continent (macro layout)

One landmass, **~3072×3072 voxels** (1 voxel = 1 m), height 0–192. No zone lines on the ground — biomes blend over 30–60 m borders. Compass layout:

```
        NW                    N                    NE
   ┌──────────────┬──────────────────┬─────────────────┐
   │ GLIMMERPEAKS │  TROLLMOOR       │   (crags/       │
   │ (18–24)      │  HIGHLANDS       │    world edge)  │
   │ crystal mtns │  (24–30)         │                 │
   ├──────────────┼──────────────────┼─────────────────┤
   │ STONEJAW     │  HEARTMEAD VALE  │  MOSSFANG WEALD │
   │ FOOTHILLS    │  (1–6) center    │  (6–12) east    │
   │ (12–18) west │  + WAYMEET city  │  deep forest    │
   ├──────────────┼──────────────────┼─────────────────┤
   │  (sea cliffs)│  SUNLIT COAST    │  (river delta)  │
   │              │  (city zone +    │                 │
   │              │   fishing, 30)   │                 │
   └──────────────┴──────────────────┴─────────────────┘
        SW                    S                    SE
```

- The **Old Road** (main story spine) runs Brookhollow → Waymeet → east into Mossfang Weald → loops west through Stonejaw Foothills → up Glimmerpeaks → across Trollmoor → back down to the Sunlit Coast and the Sunken Crypt. Leveling flows along it naturally.
- World edges: sea to the south/west, impassable crag walls north/northeast (rendered, not invisible walls).
- ~18 Waystones: every settlement + wilderness waypoints listed per zone.

## 3. Zones

> **Implementation status (Phase 4 Part 14).** The main story **"The Waymaker's Path" is
> authored end to end — all six chapters, levels 1–30** (`shared/data/quests/content.ts`),
> from the Brookhollow tutorial to the Sunken Crypt finale, with Hollow boss lead-ins in
> every zone. **The per-zone side-quest budgets below are now filled: 111 quests across 24
> givers**, every level band 1→30 carrying at least six optional quests (kill / collect /
> explore / courier). Named-rare hunt targets (§4) are placed. Only the ~10 profession-intro
> quests remain as an optional follow-up.

### 3.1 Heartmead Vale — starter zone (levels 1–6)

Rolling flower meadows, brooks, orchards, wheat fields. Safe, golden, tutorializing.

- **Settlements:** **Brookhollow** (starter village: inn, worker huts, fountain plaza, intro trainers) · Millstead hamlet (windmill, farms).
- **Waystones:** Brookhollow, Millstead, Old Road Gate (border with Waymeet's fields).
- **Enemies:** Thornback Boar (2–5), young Mossfang Wolf strays (3–6), Briar Goblin scouts (4–6), meadow slimes _(new model)_ (1–3), farmland pest rats _(new model)_ (1–2).
- **Content:** ~20 quests — tutorial arc (movement→combat→loot→map), boar/harvest troubles, goblin scouts probing from the east, main story ch.1: _light your first Waystone_, first profession touches (copper nodes, meadowbloom, pond fishing).
- **Hollow:** none (first Hollow is level 8+ in the Weald).

### 3.2 Mossfang Weald — deep forest (levels 6–12)

Towering mossy trees, green gloom, blight pockets glowing verdigris at night. Where the game shows its teeth.

- **Settlements:** **Fernwick** (stilt village: inn, herbalist) · Mossgate (palisade outpost on the east Old Road).
- **Waystones:** Fernwick, Mossgate, Elder Glade (wilds).
- **Enemies:** Mossfang Wolf packs (7–11), Briar Goblins + goblin shaman variant (6–10), Venomcap Spriggan (8–12), Hollowroot Treant (9–12, mini-elite), **Dire Stag** (neutral rare elite 12, unique trinket), forest spiders _(new model)_ (6–9).
- **Content:** ~22 quests — Fernwick's blighted grove arc, goblin war-camp arc, spriggan/treant blight investigation, main story ch.2 (_the blight has a direction: down_).
- **Hollow: Briarhollow Warrens (8–12)** — goblin burrow-town under a great stump; 3 elite pack rooms; boss **Warlord Bramblegut** (Briar Goblin elite: summons adds at 66/33%, Rare 2H + trinket table).

### 3.3 Stonejaw Foothills — dry hills & caves (levels 12–18)

Ochre bluffs, scrub, gulches, cave-riddled cliffs; prospector country.

- **Settlements:** **Grubbers' Rest** (mining town: inn, forge, bounty board) · Dustwatch tower.
- **Waystones:** Grubbers' Rest, Dustwatch, Gulch Bottom (wilds).
- **Enemies:** Cave Gnoll packs + pyro variant (12–17), Stonejaw Grub (12–15, burrows), hill bandits _(new models: cutpurse/archer/boss)_ (13–17), cliff bats _(new model)_ (12–14), rock elemental _(new model)_ (16–18 elite).
- **Content:** ~20 quests — gnoll raids on the mines, bandit ringleader arc (Deadeye Moll, named), grub infestation in Shaft 3, main story ch.3 (_a Waymaker survey map, deep in gnoll paws_). Iron tier professions.
- **Hollow: Gloomroot Cavern (14–18)** — where blight tendrils meet the deep caves; gnoll cult + blighted grubs; boss **Mother Gnarlmaw** (giant blighted grub: burrow-and-erupt, poison pools).

### 3.4 Glimmerpeaks — crystal mountains (levels 18–24)

Snow-dusted peaks over glowing crystal canyons; luminous blue-purple caves. The postcard zone.

- **Settlements:** **Glimmercamp** (prospector base camp: inn, alchemist) · Frostgate shrine.
- **Waystones:** Glimmercamp, Frostgate, Crystal Overlook (wilds).
- **Enemies:** Crystalback Lizard (18–23), crystal wisps _(new model)_ (18–21), mountain harpies _(new models: 2 variants)_ (19–23), frost wolf recolor of Mossfang rig (20–24), crystal golem _(new model)_ (22–24 elite).
- **Content:** ~18 quests — crystal rush politics, harpy roost arc, "songs in the crystal" mystery, main story ch.4 (_the crystals are Waystone marrow — something is eating it_). Silver/Crystalium + Cavemoss tiers; mountain-lake fishing.
- **Hollow: the Crystal Deeps (18–22)** — resonant crystal cavern maze; boss **Prismhide** (ancient Crystalback: reflective-shield phases keyed to crystal pylons).

### 3.5 Trollmoor Highlands — bleak moor (levels 24–30)

Windswept heather, standing stones, peat bogs, drizzle; troll cairns on every ridge. The endgame outdoor zone.

- **Settlements:** **Cairnwick** (fortified last-town: inn, all trainers' advanced ranks, bounty board).
- **Waystones:** Cairnwick, the Sentinels (stone circle), Moor's End (cliff over the coast).
- **Enemies:** Ironhide Troll + shaman/moss-shaman variants (24–30, semi-elite flavor), moor wraiths _(new model)_ (25–28), bog drakes _(new model)_ (26–29), blighted stag corruption of Dire Stag rig (27–30), named troll war-chief **Gruulmarg** (30 rare elite).
- **Content:** ~18 quests — troll war-band arc, wraith/stone-circle arc, main story ch.5 (_the trolls remember the Waymakers — and what they buried_). Duskpetal/Crystalium farming.
- **Hollow: Ironvein Halls (24–28)** — ruined Waymaker forge-vault held by trolls; boss **Forgewarden Urzul** (Ironhide elite wielding a Waymaker hammer: forge-flame floor mechanics).

### 3.6 Waymeet & the Sunlit Coast — capital + endgame coast (city / levels 28–30)

The hub: **Waymeet**, a walled market city where the Old Roads cross, built from the full building kit (inn, church, bathhouse, big houses, stables, fountain plaza, market stalls, bank, all master trainers, mailbox, bounty board). South of it, golden beaches, fishing piers, shipwrecks — and the half-drowned crypt entrance.

- **Waystones:** Waymeet Grand Waystone (always the first city one lit), Pierside, Cryptwatch.
- **Enemies (coast only; city is safe):** wreck-scavenger crabs _(new model)_ (28–29), drowned dead _(new models: 2 variants)_ (28–30), crypt sentinels _(new model)_ (29–30 elite).
- **Content:** ~12 quests + dailies — city intro arc ("welcome to Waymeet" at ~level 5 via Old Road detour, then return trips), coast arc at 28+, main story ch.6 finale. Sunlit Coast is the 75+ fishing water.
- **Hollow: the Sunken Crypt (28–30, hardest)** — the last Waymaker's tomb, flooded and blight-lit; 4 wings + final gauntlet; boss **the Last Waymaker** (3-phase story finale: path-tile arena mechanic, blight adds, redemption ending; best solo loot table in 1.0). Restoring the Grand Waystone here unlocks the endgame event (world boss anchor in Phase 6).

## 4. Named Rares (endgame hunt targets, ~15)

At least two per zone, wandering, 2–6 h respawn, unique-drop tables: Old Thornhide (boar, Vale) · the Pale Stag (Weald) · Deadeye Moll (Foothills) · Shardback Alpha (Peaks) · Gruulmarg (Trollmoor) · Wreckmaw (Coast) · …one per remaining slot authored during Phase 3/4 content work, recorded here as added.

> **Implementation (Phase 4 Part 12).** Eight named rare-elites are live
> (`shared/data/enemies.ts`, `named: true`, Elite rank, reusing a family model; spawn
> points + ~15 min respawns in `shared/data/spawns.ts`): **Old Thornhide** (Vale boar) ·
> **Grislefang** (Weald wolf) · **Duskwing** (Foothills cave-bat) · **Boulderjaw** (Foothills
> grub) · **Gnash-Cowl** (Foothills gnoll) · **Shardback Alpha** (Peaks crystalback) ·
> **Gruulmarg the War-Chief** (Trollmoor troll) · **Wreckmaw** (Coast bog-drake). They drop
> Elite-tier loot and feed the **Rarebane** Deed (slay 5). The Pale Stag / Deadeye Moll from
> the list above already exist as quest targets. Remaining toward ~15: a few more slots +
> bespoke unique-drop tables (Phase-5 loot polish).

> **Implementation (Phase 4 Part 17) — world event.** The **Grand Waystone** world-boss event
> is live south of Waymeet on the crypt road (`worldEvent.ts` `GRAND_WAYSTONE_EVENT`, site
> 1712,2050): a Boss-rank **Grand Warden** (`bossGrandWarden`) guards the dormant Grand Waystone
> in a `count: 1`, ~7.5-min-respawn `WORLD_SPAWNS` region. It wards itself and calls a stone-guard
> add, drops the **Grand Waystone Shard** signature Epic, and on death advances the **Waystone-
> Restorer** Deed (new `worldEvent` metric) with the network-waking announcement. Solo-tuned at
> the cap; the Phase-6 world boss just adds player scaling on top of this same encounter.

## 5. Content Budget Reconciliation (vs. GDD)

- Quests: 20+22+20+18+18+12 = **110** ✔ (≈30 of these are main-story chapters ch.1–6)
- Hollows: Briarhollow Warrens, Gloomroot Cavern, Crystal Deeps, Ironvein Halls, Sunken Crypt = **5** ✔
- Level bands cover 1–30 with intentional overlap; Waymeet visitable from ~level 5 (road is safe, fields aren't).
- Asset enemies all placed ✔ · new enemy models required: ~14 rigs + recolors (slime, rat, spider, bandit ×3, bat, rock elemental, wisp, harpy ×2, golem, wraith, bog drake, crab, drowned ×2, crypt sentinel) — tracked in ART_GUIDE §Wishlist.

## 6. Build Status (as of Phase 2)

The atlas is **spatially realised** — every place below exists in-world at its listed
coordinates, stamped by the authored layer (`shared/worldgen/placement.ts` +
`settlements.ts`) into the one continuous continent (no instancing, walk-in interiors).
Combat population and vendors are **live as of Phase 3** (see below); quests and
gathering nodes are **Phase 4**.

- **Settlements (8 built):** Waymeet (capital), Brookhollow, Millstead, Fernwick, Mossgate,
  Grubbers' Rest, Glimmercamp, Cairnwick — flattened platforms, building kit, wells,
  signposts, market stalls, Waystones.
- **Waystones:** one per settlement + **7 wild Waystones** on the road network (activation
  network + fast travel is Phase 3).
- **Roads:** the Old Road network graded between hubs with signposted junctions.
- **Hollows (5 spaces built + populated in Phase 3):** Briarhollow Warrens, Gloomroot
  Cavern, Crystal Deeps, Ironvein Halls, Sunken Crypt — carved bowls with themed entrance
  portals, each now stocked (`shared/data/spawns.ts`) with an elite pack and its end boss
  (Warlord Bramblegut, Mother Gnarlmaw, Prismhide, Forgewarden Urzul, the Last Waymaker),
  running data-driven boss scripts (summon adds / enrage / reflective shield). Walk-in
  interior geometry beyond the bowl is future content; the bosses guard the sealed portal.
- **Combat population (Phase 3):** every zone's WORLD.md enemy list spawns from the
  data-driven world spawn table, activated by player proximity with per-region respawn
  timers.
- **Vendors (Phase 3):** the settlement merchant NPCs are functional — approach one and
  press **E** to buy tier-appropriate wares, sell from your bag (¼ value), or buy back
  what you sold.
- **Ambient life:** named wandering NPCs (villager/guard/vendor) — vendors now trade;
  villagers/guards keep placeholder dialogue — and non-hostile wildlife (deer, Dire Stag,
  rabbit, bird, fish).
- **Navigation:** live minimap + full-screen atlas draw the same POI/road data with
  fog-of-discovery.
