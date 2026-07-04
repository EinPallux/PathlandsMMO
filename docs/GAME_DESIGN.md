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

### 3.1 Warrior — melee bruiser/tank *(resource: Rage 0–100, builds from dealing/taking damage, decays out of combat)*

| Lvl | Skill | Type | Effect (base) |
|---|---|---|---|
| 1 | Cleaving Strike | Rage 15 | Weapon dmg ×1.3 to target +50% to one nearby enemy |
| 2 | Battle Shout | Rage 10 | +10% attack power, self, 5 min |
| 4 | Charge | free, 15 s CD | Dash to target (8–25 m), stun 1 s, +20 Rage |
| 6 | Shield Wall stance | toggle | −20% dmg taken, −15% dmg dealt, +threat ×2 |
| 8 | Rend | Rage 20 | Bleed: weapon dmg ×1.2 over 12 s |
| 10 | Taunt | free, 8 s CD | Force enemy attack 3 s (threat top +10%) |
| 12 | Thunder Slam | Rage 30, 10 s CD | AoE 6 m: weapon ×0.9 + slow 30%/6 s |
| 16 | Execute | Rage 20–60 | Target <25% HP: huge dmg scaling with Rage spent |
| 20 | Rallying Cry | Rage 25, 60 s CD | Heal self (+party) 20% max HP over 10 s |
| 24 | Whirlwind | Rage 40, 15 s CD | Weapon ×1.1 to all enemies in 7 m |
| 28 | Last Stand | free, 3 min CD | +40% max HP for 15 s |
| 30 | Avatar of the Path | Rage 50, 2 min CD | +25% dmg, immune to slows, 12 s |

**Paths (pick 1 of 2 at 10/20/30):** L10 *Bulwark* (+10% armor & Shield Wall stronger) or *Berserker* (+15% Rage generation); L20 *Juggernaut* (Charge resets on kill) or *Bloodletter* (Rend spreads via Cleaving Strike); L30 *Unbreakable* (Last Stand also clears debuffs, −60 s CD) or *Warbringer* (Whirlwind CD −5 s, +1 target Cleave).

### 3.2 Ranger — ranged physical + utility *(resource: Focus 100, regen 10/s, most shots cost Focus)*

Skills (level → skill): 1 Aimed Shot; 2 Hunter's Mark (+8% dmg taken by target); 4 Serpent Sting (nature DoT); 6 Disengage (backwards leap, off-GCD); 8 Multi-Shot (cone); 10 Wolf Companion (summoned pet, taunt-capable — the solo-friendliness cornerstone; uses simplified pet AI: attack/follow/passive); 12 Concussive Shot (slow); 16 Camouflage (out-of-combat stealth, breaks on action); 20 Kill Shot (execute <20%); 24 Volley (ground-target AoE channel); 28 Feign Death (drop combat, 2 min CD); 30 Windrunner's Focus (Focus costs −50%, 12 s, 2 min CD).

**Paths:** L10 *Beastbond* (pet +30% HP/threat — the "solo tank" pick) or *Sharpshooter* (+5% crit); L20 *Serpent's Kiss* (Sting spreads via Multi-Shot) or *Fleetfoot* (Disengage grants 3 s +40% speed); L30 *Alpha's Call* (two wolves, each weaker) or *Deadeye* (Kill Shot usable <35%).

### 3.3 Priest — healer/holy caster *(resource: Mana; combat regen from Spirit)*

Skills: 1 Smite; 2 Mend (direct heal); 4 Renew (HoT); 6 Holy Shield (absorb bubble); 8 Purify (cleanse poison/disease); 10 Radiance (self-centered AoE heal); 12 Holy Fire (dmg + DoT); 16 Chastise (interrupt + 2 s silence, off-GCD); 20 Prayer of the Path (party-wide HoT); 24 Guardian Spirit (cheat-death buff, 5 min CD); 28 Mind Sear (channel AoE dmg); 30 Sanctuary (ground circle: allies inside take −20% dmg, 10 s).

**Paths:** L10 *Cloistered* (Smite/Holy Fire +15% — the solo-leveling pick) or *Shepherd* (heals +10%); L20 *Everflame* (Holy Fire DoT spreads via Smite crits) or *Lightwell* (Renew also ticks a small absorb); L30 *Zealot* (Mind Sear channels while moving) or *Miracle-Worker* (Guardian Spirit CD −2 min).

### 3.4 Mage — ranged magic burst/control *(resource: Mana; relies on kiting + shields when solo)*

Skills: 1 Frostbolt (dmg + 20% slow); 2 Fire Blast (instant, off-GCD); 4 Arcane Barrier (absorb); 6 Blink (short teleport, off-GCD); 8 Fireball (big cast); 10 Frost Nova (root nearby 5 s); 12 Arcane Missiles (channel); 16 Counterspell (interrupt); 20 Blizzard (ground AoE + slow); 24 Ice Block (immune 8 s, drops threat); 28 Combustion (next 3 fire spells instant+crit); 30 Meteor (long CD nuke, knockdown).

**Paths:** L10 *Frostbound* (slows +15%, Nova radius +2 m) or *Emberheart* (fire +10%); L20 *Chainfrost* (Frostbolt bounces once at 50%) or *Wildfire* (Fireball splashes 30%); L30 *Winter's Grasp* (Nova roots 8 s and Blizzard cheaper) or *Sunfall* (Meteor CD −60 s).

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

### Enemy baseline (level L)
- HP: `35 + 22·L + 1.10^L·8` — normal; **Elite** ×3 HP ×1.6 dmg (Hollows, named); **Boss** ×8 HP ×2 dmg + mechanics
- Damage per 2 s swing: `6 + 4·L`
- XP on kill: `12 + 6·L` (same-level; ±20%/level delta, zero at gray −6)

### Group scaling (built Phase 3, meaningful Phase 6)
Enemies gain +60% HP and +15% damage per additional nearby player (8 m of engaged target, party or not), and grant full XP to all contributors' parties. Bosses also add one extra mechanic pulse per added player.

## 5. Leveling & XP

- Cap **30**. XP to complete level L: `XP(L) = 400 · L^1.55` (≈400 at 1, ≈76k at 29; total ≈530k, tuned for ~25–35 h with quests).
- Sources: quests (~55%), kills (~35%), discovery/Deeds (~10%). Discovery XP on first entering named subzones and activating Waystones.
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

## 7. Death & Travel

- Death → soul-release prompt → respawn at **last-activated Waystone** at full HP with **Winded** (−15% stats, 60 s). No XP loss, no item loss.
- **Waystones** are ancient obelisks at every settlement + key wilds (~18 total). First activation: discovery XP + map marker. Any two activated Waystones allow paid teleport (fee scales with distance & level, ~1–10 silver) — the main travel gold sink before mounts.
- **Mount** at level 20: Wolf (+60% ground speed, outdoor only, instant dismount on damage). Cost: 40 gold + quest. Skins via Deeds.

## 8. Quests

- Types: **Kill**, **Collect** (drop-based), **Gather** (world objects), **Deliver**, **Talk-to**, **Explore** (reach area), **Use-object**, **Boss**, and **Chains** of the above. No escorts (cut: pain, low value).
- Structure: ~110 total (see WORLD.md tables): main story "**The Waymaker's Path**" (~30, chaptered per zone, finale in the Sunken Crypt), ~65 zone side quests in small arcs, ~10 profession/system intros, daily bounty boards in 4 hubs (3 random dailies each from a pool).
- Quest log max 25; tracker shows 5 pinned. NPC `!` yellow (available), `?` gray (in progress), `?` yellow (complete). Map + minimap markers per objective area.
- Rewards: XP (dominant), gold, item choices (1 of 2–3, class-filtered), consumables; main-story chapters award signature Uncommon/Rare pieces and Waystone unlocks.
- All objective state machines in `shared/quests`; definitions in `shared/data/quests/` (typed, validated at build).

## 9. Professions

Each character learns **all five** (no pick restrictions — indie population is too small for interdependence walls; trading still matters for surplus in Phase 6). Skill 1–100 each; +1 point per action at orange/yellow difficulty, decreasing to gray (classic curve).

| Profession | Type | Loop | Zone tiers (skill) |
|---|---|---|---|
| **Mining** | gather | Pick ore veins (cast 3 s) → ore + stone; rare gem procs | Copper 1 / Iron 25 / Silver 50 / Crystalium 75 |
| **Herbalism** | gather | Pick plants (cast 2 s) | Meadowbloom 1 / Fenweed 25 / Cavemoss 50 / Duskpetal 75 |
| **Fishing** | gather | Timing minigame: cast → bobber window (~0.8 s reaction) → catch; zone fish pools + rare catches | ponds 1 / rivers 25 / mountain lakes 50 / Sunlit Coast 75 |
| **Blacksmithing** | craft | Ore → bars (smelt at forge) → weapons/mail/plate/shields + profession tools; anvils in settlements | tiers follow Mining |
| **Alchemy** | craft | Herbs (+fish oils) → potions: healing/mana, +stat elixirs (30 min), utility (water-walking, night-vision, swiftness), gathering boosts | tiers follow Herbalism |

- Nodes spawn deterministically (seeded positions per zone + respawn timers 90–180 s); visible shells built in Phase 2, activated in Phase 4. In Phase 6 nodes are shared/contested (server-arbitrated).
- ~12 recipes per crafting tier; each tier includes 2–3 genuinely best-at-that-level items ("smith's pride" pieces) and a discovery recipe (crafting X unlocks X+).
- Trainers in Waymeet + intro trainers in Brookhollow; profession intro quests in Phase 4.

## 10. Meta Progression — Deeds & Path Points

- **Deeds** = achievements across exploration (Waystones, subzones), combat (named rares, Hollow bosses, solo-boss Deeds), quests (chapters, zone completion), professions (50/100 skill, rare catches), and collection (mount skins, titles).
- Deeds award **Path Points** (1–5 by difficulty; ~120 available at launch) to the **account**, spent at any Waystone on permanent account-wide perks:
  - Wanderer's Rest (rested cap +0.5 lvl ×3 ranks) · Deep Pockets (+1 bag slot ×4) · Old Friends (alts start with heirloom Uncommon weapon) · Waywise (teleport fees −20% ×2) · Beast Tamer (mount cost −50%) · Trailblazer (+5% out-of-combat speed) · Fifth Slot (5th character slot, Phase 6)
- **Titles** from milestone Deeds render on the nameplate ("the Wayfinder", "Hollow-Delver", "Master Angler").
- Deed toasts + a journal UI ("Wayfarer's Journal") tabbed: Deeds / Titles / Path Perks / Statistics.

## 11. Endgame at Cap (30)

Solo-viable loop, weekly cadence:
1. **Daily bounties** (4 hubs × 3) — gold, materials, Deed progress.
2. **Hollow mastery** — bosses drop from curated Rare/Epic tables; "solo, no-death, speed" Deeds per Hollow.
3. **Named rare hunt** — ~15 wandering named elites with unique drops (trinkets, skins) on 2–6 h respawns.
4. **Professions** — 75–100 push, discovery recipes, Duskpetal/Crystalium farming for top crafts.
5. **The Sunken Crypt** — hardest Hollow, main-story finale, best solo loot.
6. *(Phase 6)* **World boss** — weekly "Restored Waystone" event boss tuned for 5–10 players (scales down to 3), Epic table + guild Deeds.

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

## 15. Tuning Targets (Phase 5 checklist)

- Time-to-kill, at-level solo: normal mob 8–15 s; elite 25–45 s; Hollow boss 90–180 s.
- Deaths while questing at-level: occasional (~1 per play hour) — dangerous, not punishing.
- 1→30 as quest-follower: 25–35 h. Gold at 20 without grinding: comfortably affords the mount minus ~20% (choice pressure).
- Every class solos every Hollow at-level (Warrior/Ranger comfortably; Priest/Mage tighter but fair).
