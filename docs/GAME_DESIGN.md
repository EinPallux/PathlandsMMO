# Pathlands — Game Design Document

This is the systems bible. Numbers here are the implementation spec; Phase 5 tunes them, and any tuning must be written back into this document. World content (zones, towns, dungeons, spawn tables, quest lists) lives in [WORLD.md](WORLD.md).

## 1. Vision

A cozy-but-dangerous voxel continent that plays like the memory of an old-school MMORPG: you pick a class, take the road out of your starter village, and everything you can see — forests, cave mouths, mountain passes, a distant capital — is walkable, killable, questable, and shared (from Phase 6) with everyone else on the server. Few systems, executed deeply. Charm over spectacle. Journey over throughput.

**Design pillars** (tie-breakers for every decision):

1. **The road is the game.** Travel, discovery, and terrain matter. No content teleports until the player earns the Waystone network.
2. **Readable old-school combat.** Tab-target, hotbar, cooldowns. Deliberate, positional at the margins (facing, range, line of sight), never twitchy.
3. **Solo-viable, group-enriched.** A solo player can finish everything; a group does it faster/louder. Never gate content behind other humans.
4. **One persistent world.** No instances, no phasing, no loading screens. Interiors, caves and dungeons are carved into the same continent.
5. **Simple systems, finished feel.** Prefer one polished mechanic over three half-mechanics. Cut features before cutting quality.

## 2. Player Fantasy & Camera

- Third-person over-the-shoulder/behind camera (orbit + scroll zoom, 2–12 m), auto-collision with terrain.
- WASD movement + Space jump, mouse-driven camera, click or Tab targeting; every action bindable.
- Character is a Cube-World-proportioned voxel hero (see ART_GUIDE): big head, expressive silhouette. Gear is **not** rendered on the model (weapons ARE rendered — one visible weapon per class archetype tier; armor is stat-only by design).

## 3. Classes

Four classes; each is complete at launch. Skills unlock via level and are bought from class trainers (small gold fee). Hotbar has 10 skill slots; classes end with 10–12 actives so nearly everything fits.

### Shared rules

- Auto-attack: every class has a basic attack on a weapon-speed timer (melee swing or ranged shot/zap) that costs nothing.
- Global cooldown (GCD): 1.2 s across most actives; some instants marked "off-GCD".
- Resources regenerate out of combat quickly (full in ~10 s) and in combat per class rules.

### 3.1 Warrior — melee bruiser/tank _(resource: Rage 0–100, builds from dealing/taking damage, decays out of combat)_

| Lvl | Skill              | Type              | Effect (base)                                      |
| --- | ------------------ | ----------------- | -------------------------------------------------- |
| 1   | Cleaving Strike    | Rage 15           | Weapon dmg ×1.3 to target +50% to one nearby enemy |
| 2   | Battle Shout       | Rage 10           | +10% attack power, self, 5 min                     |
| 4   | Charge             | free, 15 s CD     | Dash to target (8–25 m), stun 1 s, +20 Rage        |
| 6   | Shield Wall stance | toggle            | −20% dmg taken, −15% dmg dealt, +threat ×2         |
| 8   | Rend               | Rage 20           | Bleed: weapon dmg ×1.2 over 12 s                   |
| 10  | Taunt              | free, 8 s CD      | Force enemy attack 3 s (threat top +10%)           |
| 12  | Thunder Slam       | Rage 30, 10 s CD  | AoE 6 m: weapon ×0.9 + slow 30%/6 s                |
| 16  | Execute            | Rage 20–60        | Target <25% HP: huge dmg scaling with Rage spent   |
| 20  | Rallying Cry       | Rage 25, 60 s CD  | Heal self (+party) 20% max HP over 10 s            |
| 24  | Whirlwind          | Rage 40, 15 s CD  | Weapon ×1.1 to all enemies in 7 m                  |
| 28  | Last Stand         | free, 3 min CD    | +40% max HP for 15 s                               |
| 30  | Avatar of the Path | Rage 50, 2 min CD | +25% dmg, immune to slows, 12 s                    |

**Paths (pick 1 of 2 at 10/20/30):** L10 _Bulwark_ (+10% armor & Shield Wall stronger) or _Berserker_ (+15% Rage generation); L20 _Juggernaut_ (Charge resets on kill) or _Bloodletter_ (Rend spreads via Cleaving Strike); L30 _Unbreakable_ (Last Stand also clears debuffs, −60 s CD) or _Warbringer_ (Whirlwind CD −5 s, +1 target Cleave).

### 3.2 Ranger — ranged physical + utility _(resource: Focus 100, regen 10/s, most shots cost Focus)_

Skills (level → skill): 1 Aimed Shot; 2 Hunter's Mark (+8% dmg taken by target); 4 Serpent Sting (nature DoT); 6 Disengage (backwards leap, off-GCD); 8 Multi-Shot (cone); 10 Wolf Companion (summoned pet, taunt-capable — the solo-friendliness cornerstone; uses simplified pet AI: attack/follow/passive); 12 Concussive Shot (slow); 16 Camouflage (out-of-combat stealth, breaks on action); 20 Kill Shot (execute <20%); 24 Volley (ground-target AoE channel); 28 Feign Death (drop combat, 2 min CD); 30 Windrunner's Focus (Focus costs −50%, 12 s, 2 min CD).

**Paths:** L10 _Beastbond_ (pet +30% HP/threat — the "solo tank" pick) or _Sharpshooter_ (+5% crit); L20 _Serpent's Kiss_ (Sting spreads via Multi-Shot) or _Fleetfoot_ (Disengage grants 3 s +40% speed); L30 _Alpha's Call_ (two wolves, each weaker) or _Deadeye_ (Kill Shot usable <35%).

### 3.3 Priest — healer/holy caster _(resource: Mana; combat regen from Spirit)_

Skills: 1 Smite; 2 Mend (direct heal); 4 Renew (HoT); 6 Holy Shield (absorb bubble); 8 Purify (cleanse poison/disease); 10 Radiance (self-centered AoE heal); 12 Holy Fire (dmg + DoT); 16 Chastise (interrupt + 2 s silence, off-GCD); 20 Prayer of the Path (party-wide HoT); 24 Guardian Spirit (cheat-death buff, 5 min CD); 28 Mind Sear (channel AoE dmg); 30 Sanctuary (ground circle: allies inside take −20% dmg, 10 s).

**Paths:** L10 _Cloistered_ (Smite/Holy Fire +15% — the solo-leveling pick) or _Shepherd_ (heals +10%); L20 _Everflame_ (Holy Fire DoT spreads via Smite crits) or _Lightwell_ (Renew also ticks a small absorb); L30 _Zealot_ (Mind Sear channels while moving) or _Miracle-Worker_ (Guardian Spirit CD −2 min).

### 3.4 Mage — ranged magic burst/control _(resource: Mana; relies on kiting + shields when solo)_

Skills: 1 Frostbolt (dmg + 20% slow); 2 Fire Blast (instant, off-GCD); 4 Arcane Barrier (absorb); 6 Blink (short teleport, off-GCD); 8 Fireball (big cast); 10 Frost Nova (root nearby 5 s); 12 Arcane Missiles (channel); 16 Counterspell (interrupt); 20 Blizzard (ground AoE + slow); 24 Ice Block (immune 8 s, drops threat); 28 Combustion (next 3 fire spells instant+crit); 30 Meteor (long CD nuke, knockdown).

**Paths:** L10 _Frostbound_ (slows +15%, Nova radius +2 m) or _Emberheart_ (fire +10%); L20 _Chainfrost_ (Frostbolt bounces once at 50%) or _Wildfire_ (Fireball splashes 30%); L30 _Winter's Grasp_ (Nova roots 8 s and Blizzard cheaper) or _Sunfall_ (Meteor CD −60 s).

## 4. Stats & Combat Math

### Primary stats (on gear + per-level class growth)

- **Might** → melee/ranged attack power (1 AP per point)
- **Intellect** → spell power (1 SP per point) + max Mana (+15 per point)
- **Agility** → +crit% (1% per 20) + small AP for Ranger
- **Spirit** → HP/Mana regeneration (in and out of combat)
- **Stamina** → +10 max HP per point

### Derived

- `weaponDamage = weapon base roll + AP/14 × weaponSpeed`
- `skillDamage = baseCoefficient × (weaponDamage or SP) × classModifiers`
- **Armor** mitigates physical: `mitigation = armor / (armor + 85 × attackerLevel + 400)` (capped 75%)
- **Crit** = 5% base + Agility + gear; crits deal ×1.5 (heals too)
- Level difference: ±5% dmg per level delta (capped ±25%); mobs 4+ levels higher get a hit-chance penalty against — the classic "don't fight red mobs" signal
- **Threat**: dmg = 1 threat/pt, heals = 0.5 threat/pt split among enemies; tank-stance multiplier ×2; pull when exceeding current target's threat by 10% (melee) / 30% (ranged)

### Class base stats & growth (implementation — `shared/data/classes.ts`)

Primary stats at a level = `base + floor(growth · (level−1))`. Max HP = `baseHP + Stamina·10`.
Resource: Rage/Focus cap 100; Mana = `120 + Intellect·15`. Armor class is equip-locked.

| Class   | Resource | Armor   | baseHP | base M/A/I/Sp/St | growth/lvl M/A/I/Sp/St |
| ------- | -------- | ------- | ------ | ---------------- | ---------------------- |
| Warrior | Rage     | Plate   | 60     | 11/6/4/5/11      | 1.8/0.5/0.2/0.5/1.8    |
| Ranger  | Focus    | Leather | 45     | 8/11/4/6/8       | 1.1/1.8/0.2/0.6/1.1    |
| Priest  | Mana     | Cloth   | 35     | 4/5/11/10/7      | 0.3/0.4/1.8/1.5/0.9    |
| Mage    | Mana     | Cloth   | 30     | 4/6/12/8/6       | 0.3/0.6/2.0/1.0/0.8    |

Armor-class mitigation multipliers: cloth 1.0 · leather 1.6 · mail 2.4 · plate 3.2. Ranger gets `+0.5 AP per Agility`. Resource regen: Focus +10/s always; Mana `Spirit·0.35`/s in combat, `maxMana/10`/s out; Rage builds from damage, decays 4/s out of combat.

### Enemy baseline (level L)

- HP: `35 + 22·L + 1.10^L·8` — normal; **Elite** ×2.4 HP ×1.3 dmg (Hollows, named); **Boss** ×4.5 HP ×1.25 dmg + mechanics
- Damage per 2 s swing: `6 + 4·L`
- XP on kill: `12 + 6·L` (same-level). Delta `d = enemyLvl − playerLvl`: tougher mobs `×min(1 + 0.2·d, 1.4)`; below level fades linearly `×(1 + d/6)` to **zero at gray (d ≤ −6)**.

> **Phase-3 solo tuning note.** The elite/boss multipliers above were softened from
> the original design (elite ×3/×1.6, boss ×8/×2). With no potions and no modelled
> kiting/defensive rotation yet, the original ×2 boss damage made a 90–180 s attrition
> fight unsurvivable for a no-sustain class — a small HP pool only absorbs ~10–15 s of
> it. The current values make every Hollow soloable at-level now (Briarhollow's boss is
> cleared by a geared L13 Warrior/Ranger in the acceptance tests); the **90–180 s boss
> TTK target in §15 is deferred to Phase 5's balance pass**, once consumables (Phase 4
> alchemy), defensive cooldowns, and kiting are in and the pace is tuned holistically.

### Boss encounter scripts (Phase 3)

Each Hollow boss (`EnemyDef.boss`, `shared/data/enemies.ts`) carries an ordered list of
**phases** fired once as its HP crosses a threshold, interpreted by `stepBossMechanics`
in the resolver:

- **summon** — spawn `count` adds of an enemy id near the boss (e.g. Bramblegut calls
  Briar Goblins at 66% / 33%); **+1 add per extra nearby ally** (group scaling hook).
- **enrage** — a lasting `damageDealt` buff (forge-flame ramp, Gnarlmaw's swell).
- **shield** — a reflective absorb worth a fraction of the boss's max HP (Prismhide's
  pylon phases).

Phases are pure data, so the Phase-6 server runs the same scripts. Adds are ordinary
enemies (own AI/loot) and despawn with the encounter when the player leaves.

### Group scaling (built Phase 3, meaningful Phase 6)

Enemies gain +60% HP and +15% damage per additional nearby player (8 m of engaged target, party or not), and grant full XP to all contributors' parties. Bosses also add one extra mechanic pulse per added player.

## 5. Leveling & XP

- Cap **30**. XP to complete level L: `XP(L) = 250 · L^1.55` (≈250 at 1, ≈46k at 29; **total ≈549k** across 1→30). _Phase-5 tuned (was `400·L^1.55` ≈ 878k, which read grindy — see §15)._ XP sources (quests ~45%, kills ~50%, discovery ~5%) supply this over a target ~25–35 h.
- Sources: **quests ~45%** (authored reward XP is scaled ×2 at the grant edge — `QUEST_XP_SCALE`), **kills ~50%** (`killXp = 12 + 6·L`, unbounded), **discovery/Deeds ~5%** (Waystone activation, first entering named subzones). The exact split is a soft target; the invariant is quest-led with kills always able to close the gap.
- **Rested XP** (meta-friendly, solo-friendly): logging out in an inn or near a Waystone accrues a pool granting +100% kill XP, up to 1.5 levels. Path Points can raise the cap.
- Level-up: full heal, fanfare VFX, stat gains toast, new-skill notification pointing to the trainer.

## 6. Items & Gear

- **Slots (11):** Main Hand, Off Hand (shield/tome/quiver), Head, Chest, Legs, Feet, Hands, Amulet, Ring ×2, Trinket.
- **Rarity:** Common (white), Uncommon (green), Rare (blue), Epic (purple — Hollow bosses, world boss, top crafts only). Rarity raises stat budget: `budget = ilvl × {1.0, 1.25, 1.55, 1.9}` distributed over 1–3 stats.
- `ilvl ≈ required level + {0, 3, 6, 10}` by rarity. Weapons carry DPS: `dps = 3.2 + 1.9 × ilvl^0.95` split into speed/base-roll flavors.
- Armor classes: cloth (Priest/Mage), leather (Ranger), mail/plate (Warrior) — class-locked at equip.
- Trinkets are the "fun" slot: on-use or proc effects (small shield, speed burst, gold find…), mostly from quests/Deeds/bosses.
- Bags: start 16 slots; +3 purchasable bag tiers (vendor/craft/Path Point) to 40.
- **No durability/repair** (cut for simplicity — gold sinks live elsewhere). Items bind on equip only for Epic; everything else trades freely (matters in Phase 6).
- Loot: per-enemy loot tables (`shared/data/loot/`), seeded rolls; world drops + zone-flavored drops; bosses use small curated tables with 2–3 guaranteed picks. Party loot (Phase 6): round-robin with need-roll on Rare+.

> **Implementation (Phase 4 Part 15) — Hollow boss signature loot.** Each of the five
> Hollow bosses drops one **bespoke Epic unique** — the endgame re-run chase (`BOSS_SIGNATURES`
> in `shared/data/enemies.ts`, fed into the boss branch of `buildEnemyLootTable`): Bramblegut's
> Wardknot, The Gloomheart, Prismscale Sigil, Forgewarden's Emberseal, and the finale's
> Waymaker's Lantern. To stay **solo-first**, signatures are **class-neutral jewelry**
> (Trinket/Amulet) whose stats are generated for the killer's class — so a signature is always
> usable by whoever felled the boss — while the **name is fixed**, it **binds on equip**, it
> carries a small **live** `bonusCritChance` rider (+1.5% → +3.5% up the boss ladder, consumed
> by combat + shown in the tooltip), it sells for a 1.5× premium, and it drops **only** from its
> boss at ~20% per kill. Mechanically this rides the existing generator: `GeneratedItemSpec`
> gained an optional `signature` that `generateItem` applies, so no new item-registry or client
> code was needed — the drop flows through the same `rollLoot` → `CombatDirector.lootFrom` → bag
> path as any other drop.

## 7. Death & Travel

- Death → soul-release prompt → respawn at **last-activated Waystone** at full HP with **Winded** (−15% stats, 60 s). No XP loss, no item loss.
- **Waystones** are ancient obelisks at every settlement + key wilds (~18 total). First activation: discovery XP + map marker. Any two activated Waystones allow paid teleport (fee scales with distance & level, ~1–10 silver) — the main travel gold sink before mounts.
- **Mount** at level 20: Wolf (+60% ground speed, outdoor only, instant dismount on damage). Cost: 40 gold + quest. Skins via Deeds.

> **Implementation (Phase 4 Part 6).** The Wolf is a code-authored voxel model
> (`shared/models/creatures/mounts.ts`; there is no mount PNG — it is authored fresh per
> ART_GUIDE, not derived from the enemy wolf). Data lives in `shared/data/mounts.ts`; the
> client `MountController` enforces the rules and the speed rides through the sim as a
> clamped `MoveIntent.speedMult` (server-recomputable in Phase 6). Three skins ship: the
> base **Grey Wolf** (40 gold at level 20) and **Dire Wolf** / **Frostfang Wolf**, unlocked
> by the Slayer / Pathfinder Deeds. `G` mounts/dismounts. Provisional deviations to revisit
> as the systems fill out: **(1)** "instant dismount on damage" is implemented as dismount
> the instant the rider _enters combat_ (a superset — taking or dealing damage flags
> combat), which also covers the Phase-6 authority model cleanly; **(2)** "outdoor only" is
> enforced by an underground check (dismount when the rider drops below the local surface,
> i.e. into a cave/Hollow) rather than an explicit zone flag; **(3)** the mount is sold for
> gold at level 20 with the acquisition _quest_ deferred to the bulk quest-content part;
> **(4)** owned mounts are stored per-character (save v7), becoming account-wide with
> Phase-6 accounts.

## 8. Quests

- Types: **Kill**, **Collect** (drop-based), **Gather** (world objects), **Deliver**, **Talk-to**, **Explore** (reach area), **Use-object**, **Boss**, and **Chains** of the above. No escorts (cut: pain, low value).
- Structure: ~110 total (see WORLD.md tables): main story "**The Waymaker's Path**" (~30, chaptered per zone, finale in the Sunken Crypt), ~65 zone side quests in small arcs, ~10 profession/system intros, daily bounty boards in 4 hubs (3 random dailies each from a pool).
- Quest log max 25; tracker shows 5 pinned. NPC `!` yellow (available), `?` gray (in progress), `?` yellow (complete). Map + minimap markers per objective area.
- Rewards: XP (dominant), gold, item choices (1 of 2–3, class-filtered), consumables; main-story chapters award signature Uncommon/Rare pieces and Waystone unlocks.
- All objective state machines in `shared/quests`; definitions in `shared/data/quests/` (typed, validated at build).

> **Implementation (Phase 4 Part 1).** The engine (`shared/quests/log.ts`) is a pure
> state machine: `acceptQuest` → `applyQuestEvent` (kills/collect/talk/explore/use/boss)
> → `turnInQuest` (returns the reward for the client to grant), with prereq/level/log-cap
> gating and cross-NPC turn-ins. Definitions + quest-giver placement live in
> `shared/data/quests`. The client's `QuestDirector` feeds events from combat/movement,
> grants rewards, and drives the giver dialogue, log (L), tracker, toasts, and `!`/`?`
> nameplate indicators. Quest state persists in save v3. Bulk content, daily bounties,
> and map markers follow in later Phase-4 parts.
>
> **Implementation (Phase 4 Part 14) — the ~110-quest budget.** The zone side-quest arcs
> are filled out to **111 quests across 24 quest-givers** (`shared/data/quests/content.ts`),
> covering every level band 1→30. The 6-chapter main story "The Waymaker's Path" (~39 quests)
> is joined by ~72 zone side quests hung off hub givers and 10 new side-givers, mixing
> **kill / collect / explore / courier** objectives with level-appropriate gold + gear. To
> give collect quests variety, every remaining enemy carries a `QUEST_DROP_TAG` (19 tags in
> all); the client emits them on kill unchanged. Side quests never gate the main story. The
> content is guarded by tests (`quests.test.ts`): the budget (≥ 100), a per-band side-quest
> spread (≥ 6 optional quests in each 6-level band), giver coverage (every giver offers a
> quest), and drop-tag/enemy/waystone integrity. The ~10 profession-intro quests remain a
> small optional follow-up; the split of quest-vs-kill XP is a Phase-5 tuning item (§15).

## 9. Professions

Each character learns **all five** (no pick restrictions — indie population is too small for interdependence walls; trading still matters for surplus in Phase 6). Skill 1–100 each; +1 point per action at orange/yellow difficulty, decreasing to gray (classic curve).

| Profession        | Type   | Loop                                                                                                                                   | Zone tiers (skill)                                        |
| ----------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **Mining**        | gather | Pick ore veins (cast 3 s) → ore + stone; rare gem procs                                                                                | Copper 1 / Iron 25 / Silver 50 / Crystalium 75            |
| **Herbalism**     | gather | Pick plants (cast 2 s)                                                                                                                 | Meadowbloom 1 / Fenweed 25 / Cavemoss 50 / Duskpetal 75   |
| **Fishing**       | gather | Timing minigame: cast → bobber window (~0.8 s reaction) → catch; zone fish pools + rare catches                                        | ponds 1 / rivers 25 / mountain lakes 50 / Sunlit Coast 75 |
| **Blacksmithing** | craft  | Ore → bars (smelt at forge) → weapons/mail/plate/shields + profession tools; anvils in settlements                                     | tiers follow Mining                                       |
| **Alchemy**       | craft  | Herbs (+fish oils) → potions: healing/mana, +stat elixirs (30 min), utility (water-walking, night-vision, swiftness), gathering boosts | tiers follow Herbalism                                    |

- Nodes spawn deterministically (seeded positions per zone + respawn timers 90–180 s); visible shells built in Phase 2, activated in Phase 4. In Phase 6 nodes are shared/contested (server-arbitrated).
- ~12 recipes per crafting tier; each tier includes 2–3 genuinely best-at-that-level items ("smith's pride" pieces) and a discovery recipe (crafting X unlocks X+).
- Trainers in Waymeet + intro trainers in Brookhollow; profession intro quests in Phase 4.

> **Implementation (Phase 4 Part 3 — gathering).** Skill + gather rules are pure in
> `shared/professions/skill.ts` (difficulty curve, `skillUp`, `gatherNode`, `rollFish`);
> materials + tiers + the worldgen-prop→node mapping are data in
> `shared/data/professions.ts`. The client `GatherDirector` finds nodes by re-running the
> deterministic `world.scatterChunk` (nodes have no stored state, so depletion/respawn is
> tracked client-side), drives the mining/herbalism channel and the fishing minigame, and
> banks materials into a per-character stash (save v4). Higher-tier herb node placement,
> tool items, and trainers are follow-up work.
>
> **Implementation (Phase 4 Part 4 — crafting).** Recipes + consumables are data
> (`shared/data/recipes.ts`); the pure `craft` engine (`shared/professions/craft.ts`)
> validates against the material stash + skill, consumes inputs, and returns the output +
> a skill-up. The client crafts through a panel (K) — gear goes to the bag, bars/potions
> to the stash — and consumables are drunk from the Professions panel (`applyConsumable`
> on the combat director: heal / restore resource / a timed buff aura, save v5).

> **Implementation (Phase 4 Part 18 — recipe book + discovery).** The recipe book is filled
> out to level 100 (`shared/data/recipes.ts`): crystalium smelt; iron/silver/crystalium gear
> across weapon + armor slots; and greater/master potions + elixirs. Top-tier recipes carry
> `discovery: true` and are **hidden until learned** — `craft()` refuses an unknown discovery
> recipe, and any craft in that profession at sufficient skill has a `DISCOVERY_CHANCE` to learn
> one (classic profession discovery). The discovery roll is drawn **after** the output + skill-up,
> so pre-existing craft results are byte-identical. Learned recipes persist (**save v12**,
> `learnedRecipes[]`); the client announces a discovery and hides unlearned recipes in the craft
> panel. Rolled into Phase-5 polish: station proximity (forge/anvil/alembic props) and trainers.

> **Implementation (Phase 4 Part 16 — masteries).** Maxing a profession (skill 100) unlocks
> a permanent **Mastery** — a passive bonus and part of the endgame loop (`MASTERIES` in
> `shared/data/professions.ts`): Rich Veins (Mining: +1 ore/vein, 2× gem chance), Nature's
> Bounty (Herbalism: +1 herb), Master Angler (Fishing: better big-catch + fish-oil odds),
> Efficient Smelting (Blacksmithing) and Potent Brews (Alchemy: a 25% chance of a free extra
> stackable craft output). Masteries derive from the **already-persisted skill** — `gatherNode`
> / `rollFish` / `craft` read `skill >= SKILL_MAX` internally — so there is no new save field
> and no engine-signature change, and because sub-cap paths draw no extra RNG the results below
> 100 are byte-identical. The Professions panel (P) shows each mastery, locked until earned.

## 10. Meta Progression — Deeds & Path Points

- **Deeds** = achievements across exploration (Waystones, subzones), combat (named rares, Hollow bosses, solo-boss Deeds), quests (chapters, zone completion), professions (50/100 skill, rare catches), and collection (mount skins, titles).
- Deeds award **Path Points** (1–5 by difficulty; ~120 available at launch) to the **account**, spent at any Waystone on permanent account-wide perks:
  - Wanderer's Rest (rested cap +0.5 lvl ×3 ranks) · Deep Pockets (+1 bag slot ×4) · Old Friends (alts start with heirloom Uncommon weapon) · Waywise (teleport fees −20% ×2) · Beast Tamer (mount cost −50%) · Trailblazer (+5% out-of-combat speed) · Fifth Slot (5th character slot, Phase 6)
- **Titles** from milestone Deeds render on the nameplate ("the Wayfinder", "Hollow-Delver", "Master Angler").
- Deed toasts + a journal UI ("Wayfarer's Journal") tabbed: Deeds / Titles / Path Perks / Statistics.

> **Implementation (Phase 4 Part 5).** The Deed/perk rules are pure and data-driven
> (`shared/data/deeds.ts`, `shared/data/perks.ts`, engine in `shared/meta`). The launch
> catalog opens with **9 Deeds** (a representative slice of the ~120-at-launch target,
> filled out alongside the remaining quest/endgame content): Wayfarer/Pathfinder
> (attune 3/8 Waystones), First Blood/Slayer (slay 10/150 foes), Hollow-Delver/Hollow-Master
> (defeat 1/3 Hollow bosses), Helping Hand/The Waymaker's Path (complete 5/15 quests),
> Apprentice/Artisan (reach 25 gathering skill / craft 10 items). Tiered Deeds share one
> metric so a single event advances every tier at once. **4 Path Perks** ship: Wanderer's
> Rest (rested cap +½ lvl ×3), Deep Pockets (+2 bag slots ×4), Waywise (−15% Waystone
> travel fee ×2), Trailblazer (+5% out-of-combat speed ×1). Two provisional deviations
> from the bullets above, to revisit as the system fills out: **(1)** Path Points and
> perks are stored **per-character** (save v6), not yet account-wide — account-scoping,
> heirloom perks (Old Friends), mount-discount (Beast Tamer), and the 5th slot land with
> mounts / the endgame loop / Phase-6 accounts; **(2)** Deep Pockets grants +2 bag
> slots/rank (was +1) and Waywise −15%/rank (was −20%) for round numbers against the
> 16→40 bag range and the current travel-fee curve. Titles and the journal's
> Titles/Statistics tabs are stubbed for a later part; the Journal (J) currently shows
> Deeds + Path Perks.

## 11. Endgame at Cap (30)

Solo-viable loop, weekly cadence:

1. **Daily bounties** (4 hubs × 3) — gold, materials, Deed progress.
2. **Hollow mastery** — bosses drop from curated Rare/Epic tables; "solo, no-death, speed" Deeds per Hollow.
3. **Named rare hunt** — ~15 wandering named elites with unique drops (trinkets, skins) on 2–6 h respawns.
4. **Professions** — 75–100 push, discovery recipes, Duskpetal/Crystalium farming for top crafts.
5. **The Sunken Crypt** — hardest Hollow, main-story finale, best solo loot.
6. _(Phase 6)_ **World boss** — weekly "Restored Waystone" event boss tuned for 5–10 players (scales down to 3), Epic table + guild Deeds.

> **Implementation (Phase 4 Part 8) — Daily bounties.** Bounty #1 above is live:
> `shared/data/bounties.ts` posts a **daily board** at the four hubs (Brookhollow, Waymeet,
> Fernwick, Mossgate), each showing 3 tasks picked deterministically from that hub's pool by
> `dailyBountyIds(seed, day, hub)` — the day index is derived from the local date once at
> client bootstrap (the only wall-clock touch; the sim stays date-free, so the board is
> byte-identical for a given seed+day+hub). Tasks are **slay** (an enemy family or id) or
> **gather** (a material); rewards are **gold + XP + Deed progress** (the "Taskmaster" Deed).
> The `BountyDirector` shows the nearest hub's board (**O**), tracks progress from the same
> kill/gather events the quest system uses, and the log resets each new day (save v9).
> Provisional vs. the full design: rewards are gold/XP (materials come with the mastery
> pass), the board is key-toggled rather than gated to a physical notice-board prop, and the
> other endgame pillars (Hollow-mastery re-runs, named rare hunts, the world-event stub) are
> later parts.

> **Implementation (Phase 4 Parts 12–17) — the rest of the endgame loop.** Pillars 2–4 and
> the world boss (6) now ship as their Phase-4 forms: **Hollow-boss signature loot** (Part 15
> — five bespoke Epic uniques on the Hollow bosses, `BOSS_SIGNATURES`), **named rare hunts**
> (Part 12 — eight wandering Elite rares + the Rarebane Deed), **profession masteries** (Part 16
> — a skill-100 passive per profession), and the **world-boss event** (Part 17). The world boss
> is _Restore the Grand Waystone_: a Boss-rank **Grand Warden** (`bossGrandWarden`) at a fixed
> site south of Waymeet, in a long-respawn `WORLD_SPAWNS` region, that a solo capped player can
> re-run. Killing it feeds the `worldEvent` Deed metric (**Waystone-Restorer**), announces the
> network's waking, and can drop the **Grand Waystone Shard** signature. `worldEvent.ts` holds
> the event data (boss ↔ Deed ↔ site). The Phase-6 job is only to make the world boss _scale_
> to 5–10 players — the encounter, rewards, and data model are already here.

## 12. Social & MMO Features (Phase 6)

- **Chat:** say (30 m), zone, party, guild, whisper, system; slash commands; profanity filter + mute.
- **Party:** up to 4; shared quest kill credit in range, XP split with group bonus (+10%/member), loot round-robin + need-roll Rare+, party frames, leader marks.
- **Guilds:** create (5 g), roster, 3 ranks, guild chat, MOTD, guild Deeds. No guild banks at launch (backlog).
- **Trade:** secure two-pane trade window (items + gold, double-confirm). No auction house at launch (population reality; backlog).
- **Duels:** flag-based, no death (loser drops to 1 HP), anywhere outdoors. No open PvP at launch.
- **Presence:** nameplates with title/guild, /inspect, friends list, /emotes (~20 with animations where cheap).

## 13. Onboarding Flow

Title screen → (Phase 6: login/register) → character list → creation (class with PNG portrait + rotating 3D model, name, skin/hair/eye palette pick) → cinematic-lite spawn: you wake at the Brookhollow Waystone, first `!` visible ten steps away. First 15 minutes are a scripted-but-skippable quest chain teaching movement, camera, targeting, first skill, looting, equipping, and the map — as quests, not popups (max 1 contextual tip on screen).

## 14. UI Screen Inventory

HUD (frames, hotbar, XP, buffs, minimap, tracker, chat[P6]) · Character sheet · Inventory/bags · Skill book · Path (spec) picker · Quest log · World map · Wayfarer's Journal (Deeds/titles/perks/stats) · Professions & crafting · Vendor · Trainer · Bank · Mailbox · Settings (graphics/audio/keybinds/interface) · Title/character screens · (P6) Social panel, party/guild frames, trade, login. Style per ART_GUIDE §UI.

> **Implementation (Phase 4 Part 7) — Bank & Mailbox.** The **Waymeet Bank** is a
> single `BankPanel` (opened with **B**) with two tabs: a **Vault** (shared item storage,
> `BANK_SIZE` = 50 slots; click to move stacks between bag and vault) and **Mail** (an
> inbox of letters from world NPCs, each with an optional gold gift claimed once). Bank +
> mail persist per-character in **save v8**; mail is seeded from `STARTER_MAIL`
> (`shared/data/mail.ts`), and reaching **level 5** (the Waymeet band, WORLD.md) delivers
> the Steward's welcome letter. Provisional for now: the panel is key-toggled from anywhere
> rather than gated to the physical bank building / mailbox prop (like the crafting panel —
> station-proximity gating is a later pass); mail gifts are gold-only (item attachments and
> player-to-player mail arrive with Phase 6); the vault is per-character (account-shared
> storage is a Phase-6 consideration).
>
> **Implementation (Phase 4 Part 13) — Settings & keybind remapping.** A `SettingsPanel`
> (opened with **Escape** when no other transient dialog is open; ✕ to close) exposes three
> groups: **Display** (view distance, 3–12 chunks), **Audio** (master volume — the persisted
> setting; the audio bus itself lands in Phase 5), and **Keybinds** — a rebindable list of the
> **14** panel/action keys (world map, character sheet, quest log, professions, crafting,
> journal, bank & mail, bounty board, mount, free-fly, interact, cycle-target, auto-attack,
> release-spirit). The bindable set and its defaults are pure data in
> `shared/data/keybinds.ts`; the game reads the live map every frame, so a rebind takes effect
> immediately. Rebinding: click a row, press a key — the keypress is captured in the DOM
> **capture phase** and swallowed so it never reaches the game's input handler mid-rebind.
> **Reserved** codes (WASD / Space / Shift for movement, the hotbar digits, dev `` ` ``, and
> Escape) can never be bound and are refused with a flash; choosing a code another action
> already holds **swaps** the two so no action is left unbound or duplicated; **Reset to
> defaults** restores the map. View distance, master volume, and the keybind map persist to the
> save's `settings` block (**save v11**; the migration defaults the keybind map and merges any
> saved binds forward). Remaining polish for Phase 5: interface/graphics-quality options and an
> actual audio bus for the volume slider to drive.

## 15. Tuning Targets (Phase 5 checklist)

- Time-to-kill, at-level solo: normal mob 8–15 s; elite 25–45 s; Hollow boss 90–180 s.
- Deaths while questing at-level: occasional (~1 per play hour) — dangerous, not punishing.
- 1→30 as quest-follower: 25–35 h. Gold at 20 without grinding: comfortably affords the mount minus ~20% (choice pressure).
- Every class solos every Hollow at-level (Warrior/Ranger comfortably; Priest/Mage tighter but fair).
- **XP-source split — ✅ addressed (Phase-5 Part 1).** The Phase-4 pass flagged a kill-dominated economy: the old `400·L^1.55` curve (~878k) against ~32k of quest XP (≈4%). Two levers were applied together: the **curve was lowered to `250·L^1.55` (~549k)**, restoring a 25–35 h feel, and **authored quest XP is scaled ×2** at the grant edge (`QUEST_XP_SCALE`, `shared/combat/xp.ts`). Combined with the Part-14 side-quest budget (111 quests), quest XP now sums to ~245k — **~45% of the climb**, with kills (unbounded) supplying the rest — a quest-led economy matching §5's intent (guarded by `acceptance-p4.test.ts`). Remaining Phase-5 balance work (separate items): all-class time-to-kill, itemization curve, Hollow difficulty, and the gold economy. _Real-playtest fine-tuning may still nudge `QUEST_XP_SCALE`/the curve, but the shape is now correct._
