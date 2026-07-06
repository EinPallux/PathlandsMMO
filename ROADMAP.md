# ROADMAP.md — Development Phases

Pathlands is built in **six phases**. Each phase is a major milestone that ends with a playable, deployable build — never a skeleton. Phases 1–5 produce a complete single-player game on Vercel; Phase 6 turns it into a true MMO on a Linux VPS.

**Status legend:** `[ ]` not started · `[~]` in progress · `[x]` done

## Current Status

> **Phase 5 (2026-07-06) — Part 8: Content gap-fill, Phase-5 acceptance, VPS deploy guide.**
> **Content gap-fill is complete.** A new coverage audit (`shared/test/content-gaps.test.ts`,
> building on the referential checks already in `quests.test.ts`) drives the authored world through
> `World.biomeAt`/`authored.npcSpawns()` and caught one real gap: **three towns (Millstead,
> Mossgate, Glimmercamp) carried a vendor tier but no merchant NPC**, because `npcSpawns()` gated
> the vendor on `hasInn`. Fixed (RNG-safe) so **every town now has a merchant**; the audit also
> proves all six zones have spawns + a Waystone, every settlement anchors a quest-giver, and every
> collect-quest's drop source is fightable near its level. **Phase-5 acceptance** is codified in
> `shared/test/acceptance-p5.test.ts` (criterion #2 — the full solo game is completable in one save
> with no blockers: complete 6-chapter main story to the L30 finale, all five Hollows bossed, every
> gathering profession levellable to 100, gap-free 1→30 gates). Added **`docs/DEPLOY.md`** — a
> static-hosting guide for an Ubuntu VPS + nginx (build → `dist/`, SPA fallback, immutable asset
> caching, certbot TLS), so the single-player build runs on the user's Hostinger VPS. **304 tests
> green** (+11); `pnpm typecheck && lint && build` clean. _Phase 5 is **feature-complete and
> launch-ready**: every deliverable landed (Performance's only open item is the Firefox/Safari
> manual pass), and the automatable acceptance criteria pass. The human/launch sign-offs — a blind
> playtest to level 5 (#1), real-hardware 60 FPS (#3), and cutting the public `v1.0-solo` tag (#5)
> — happen at the first VPS test._
>
> ---
>
> **Phase 5 in progress (2026-07-06) — Part 7: VFX remainder & Performance (two pillars).**
> **VFX is now complete.** Added the two remaining atmospherics: **blight ambience** — a slow
> drizzle of upward-drifting verdigris spore-motes (`CombatDirector.emitBlight`) that thickens the
> closer you are to a Hollow mouth (proximity to `HOLLOWS`, gated by the VFX-density setting), and
> **water + foliage micro-motion** — a world-locked sine swell on the (now subdivided) water
> surface and a height-weighted, per-instance **wind sway** on the instanced foliage props, both
> via `onBeforeCompile` with a shared time uniform (no new draw calls). **Performance** adds an
> **adaptive-quality** safety net: once running, a sagging frame rate quietly drops the effective
> view distance a notch (down to a floor) and climbs back toward the user's setting when it
> recovers — slow cadence, wide hysteresis, the user's setting is never overwritten — plus a
> **memory-dispose audit** (every per-`Game` GPU resource is freed in `dispose()`; the shared prop
> material + wind clock are app-lifetime singletons) and a **resolution matrix** check (1080p /
> 1440p / ultrawide 3440×1440: the HUD stays corner-anchored and draw calls hold ~85–120, well
> under the ~250 budget). **293 tests green**; `pnpm typecheck && lint && build` clean; in-browser
> the blight motes render around a Hollow, the resolution matrix is responsive, all with **zero
> console errors**. _(Remaining for Performance: the Firefox/Safari manual/CI verification pass —
> the client is standard WebGL2 with no browser-specific APIs.)_
>
> ---
>
> **Phase 5 in progress (2026-07-06) — Part 6: UI/UX & Balance (two pillars).**
> **UI/UX** closes its remaining items: a **first-time-player tips** overlay
> (`client/ui/FirstTimeTips.tsx`) — a 6-step guided sequence (move → fight → quests → gear →
> world) that reads the **live keybind map** so it names the player's actual keys, shown once per
> browser (localStorage) and skippable — plus an **art pass** on the onboarding screens: the title
> screen now sits over the code-authored village art (the Church render) behind a legible vignette,
> and the character-select ("continue") cards carry **class-portrait thumbnails**. (Also fixed a
> latent bug: `url()` backgrounds with spaced filenames were unquoted, so the loading/title art
> silently failed to load.) **Balance** adds a deterministic **audit suite**
> (`shared/test/balance.test.ts`): baseline auto-attack **TTK** for all four classes vs at-level
> normal/elite enemies (killed + survived + no class a wild outlier), **Hollow-boss stat-scaling**
> (the ×4.5 rank multiplier lands; a boss swing isn't a one-shot), **itemization-curve**
> monotonicity (dps/stat-budget/armor rise with ilvl; rarity strictly increases power), and a
> **gold-economy** check that caught and fixed a real bug — **the Grey Wolf mount cost 40 c against
> ~1,916 c of quest gold by level 20 (2%); raised to 800 c** (~40%), restoring the GDD §15 "choice
> pressure." **293 tests green** (+11); `pnpm typecheck && lint && build` clean; in-browser the
> title art renders, the tips overlay guides a new character, and the select cards show portraits,
> all with **zero console errors**. _(Solo boss clears stay proven in hollows.test.ts; the balance
> harness audits the floor, not skilled rotation play.)_
>
> ---
>
> **Phase 5 in progress (2026-07-06) — Part 5: Performance & Resilience (two pillars).**
> **Resilience** is complete: the save layer (`save.ts` **v13**) gained never-throwing recovery —
> `validateSave()` + `tryMigrate()` (returns `null` instead of throwing), a **rotating 3-deep
> backup ring** in `saveStore.ts`, and a **load fall-through** (primary → backups newest-first →
> fresh) so a single corrupt IndexedDB record can't brick a save; a recovered load shows a title-
> screen notice. Added **save export/import** (download a JSON backup / restore from file, in
> Settings) and a top-level **React error boundary** with a bug-report screen (copyable error
> details + one-click save-backup download + reload). The **versioned migration test suite** now
> covers v1→v13, graphics defaults, corruption recovery, and validate/tryMigrate (**282 tests**).
> **Performance & compatibility**: player-facing **graphics settings** (view distance, **shadows**
> off/low/high, **VFX density** off/low/full, **resolution scale** 75/85/100%) persisted in v13 and
> applied live; a real **sun shadow map** (`environment.ts`: an orthographic frustum that follows
> the player, actors + props cast, terrain receives — receive-only ground avoids voxel acne), a
> `Vfx.setDensity` multiplier on burst counts, and renderer pixel-ratio scaling; and **WebGL
> context-loss recovery** (preventDefault + pause + "Rendering paused" overlay + auto-resume on
> restore, with three re-uploading resources lazily). `pnpm typecheck && lint && test (282) &&
build` clean; in-browser the graphics controls render + apply (shadows High shows the character's
> soft ground shadow, FPS reflects the shadow pass), a simulated context loss shows the overlay and
> recovers, all with **zero console errors**. Remaining for Performance: a formal profiling/memory-
> leak audit pass and the cross-browser/resolution matrix.
>
> ---
>
> **Phase 5 in progress (2026-07-06) — Part 4: VFX pass — a pooled particle system.** A new
> `client/engine/vfx.ts`: one pooled `THREE.Points` object (700-particle ring buffer, a single
> draw call, fixed memory) of **additive soft dots** driven by a `RawShaderMaterial` — per-particle
> size (perspective-scaled) and colour, a round `gl_PointCoord` mask, colour **fades to black over
> life** so no alpha channel is needed. Particles are CPU-simulated (gravity + drag + fade) and the
> changed buffers re-upload each frame. The **CombatDirector** fires bursts for every combat beat:
> **hit sparks** at the struck body (gold on crit, green on heal), **death puffs**, **school-tinted
> cast flashes** at the caster (physical/nature/holy/fire/frost/arcane/shadow → distinct colours via
> `SCHOOL_COLOR`), a golden **level-up fountain**, and a Waystone-blue **attunement glow**. **274
> tests green** (VFX is browser-only, verified by play); `pnpm typecheck && lint && build` clean
> (273 KB gzipped); in-browser a fired burst renders as a bright additive fountain of soft dots off
> the player with **zero console errors**, and update/dispose run every frame without throwing.
> Remaining VFX work: blight ambience in corrupted areas + water/foliage micro-motion.
>
> ---
>
> **Phase 5 in progress (2026-07-06) — Part 3: UI/UX polish — rich tooltips.** Replaced the
> plain native `title=` hovers with a portal-based **tooltip system** (`client/ui/Tooltip.tsx`):
> a cursor-following card that escapes panel clipping and flips at screen edges. **Item
> tooltips** show the rarity-coloured name, a **colourblind-safe rarity label**, slot, item
> level / required level, weapon dps, armor, stats, crit, trinket, bind-on-equip, and value —
> plus a **vs-equipped comparison** block with ▲/▼ stat deltas (green upgrade / red downgrade)
> when hovering a bag or shop item. **Skill tooltips** on the hotbar show cost, cooldown, and
> the skill's description. Wired into the Character sheet (bag compares vs equipped), the
> hotbar, and the Vendor + Bank panels. **274 tests green** (UI is verified by play);
> `pnpm typecheck && lint && build` clean; in-browser hovering a hotbar skill shows the styled
> card (name + cost + description) with zero console errors. The rest of the UI/UX deliverable
> (loading/continue screens from the PNG art, first-time tips, coherent art direction) follows.
>
> ---
>
> **Part 2 (2026-07-06): audio (music + basic SFX).** A small WebAudio
> layer (`client/platform/audio.ts`): a **master-gain bus** wired live to the Settings
> master-volume slider, two looping **music beds** — `loginscreen.mp3` on the title/character-
> select screens and `bgm.mp3` in-game (user-supplied mp3s in `public/assets/audio/`; **missing
> files play silently**, never throw), and a handful of **synthesized SFX** (skill cast, enemy
> defeat, level-up chime, quest-complete) so there are no sound-effect files to ship. Browser
> autoplay policy is handled by unlocking the context on the first click/keypress and queuing
> the requested track. _Scope intentionally simplified per direction_ — one in-game bed rather
> than per-zone/situation beds; VFX and richer SFX remain. **274 tests green** (audio is
> browser-only, verified by play); `pnpm typecheck && lint && build` clean; in-browser the game
> boots with the AudioContext initialized and **zero console errors** even with the mp3s absent.
>
> ---
>
> **Part 1 (2026-07-06): leveling-pace tuning (the balance pass begins).**
> Reconciled the long-flagged XP economy (Phase-4 acceptance #5 / GDD §15): the level curve was
> **lowered from `400·L^1.55` (~878k) to `250·L^1.55` (~549k)** for a 25–35 h feel, and authored
> quest XP is **scaled ×2** at the grant + display edge (`QUEST_XP_SCALE` / `scaledQuestXp` in
> `shared/combat/xp.ts`). With the Part-14 side-quest budget, quest XP now sums to ~245k — **~45%
> of the climb** (was ~4–14%), a quest-led economy matching GDD §5, with kills (unbounded)
> supplying the rest. The level derives from lifetime XP, so the change re-buckets cleanly; the
> UI shows the effective (scaled) reward. **274 tests green** (progression curve + a new
> quest-share acceptance assertion, band 0.35–0.55); `pnpm typecheck && lint && build` clean;
> the client boots with zero errors. This opens the **Balance & tuning** deliverable; the rest
> (all-class TTK, itemization, Hollow difficulty, economy) and the other Phase-5 pillars (audio,
> VFX, UI/UX, performance, resilience) follow.
>
> ---
>
> **✅ PHASE 4 COMPLETE (2026-07-06).** Pathlands is a full single-player content game:
> **111 quests** across 24 givers (the 6-chapter main story + zone side-quest arcs), all
> **five professions** (gathering + crafting, skill 1→100, masteries, a fuller recipe book +
> discovery), **meta progression** (account-wide Deeds/Path Points/perks), **mounts**, and a
> complete **endgame loop** (daily bounties, named rares, Hollow-boss signature loot, profession
> masteries, the Grand Waystone world boss), on top of the Phase-1–3 world/combat foundation.
> Acceptance criteria **#1–#4 pass** (`shared/test/acceptance-p4.test.ts`); **#5 (the 25–35 h
> leveling pace) is a soft playtest target folded into Phase-5 tuning**, not a Phase-4 gate.
> **273 tests green**; `pnpm typecheck && lint && build` clean; the static client deploys to
> Vercel. Rescoped to Phase 5 (polish): profession **trainers** & **tools**, crafting **station
> proximity**, and the XP-pace tuning. **Next: Phase 5 — Polish, Audio, Balance & Deployment.**
>
> ---
>
> **Part 18 (2026-07-06): crafting depth — a fuller recipe book + recipe discovery.** The
> recipe book is filled out to level 100: iron/silver/**crystalium** smelts and gear across
> weapon/armor slots, and greater/master potions + elixirs (6 new consumables, ~13 new recipes).
> Top-tier crystalium gear and the capstone elixir are **discovery** recipes — hidden until
> learned: `craft()` refuses an unknown discovery recipe and, on any craft in that profession at
> sufficient skill, has a `DISCOVERY_CHANCE` to learn one (rolled **last**, so every pre-existing
> craft result is byte-identical). Learned recipes persist (**save v12**, `learnedRecipes[]`,
> migration defaults empty). The client threads the learned set through the GatherDirector,
> announces discoveries, and hides unlearned discovery recipes in the craft panel. **273 tests
> green** (+7: discovery gate/learn/skill-bound/no-regression + a v12 migration); clean gate;
> in-browser the panel shows the new recipes with the discovery recipes hidden. This closes the
> gathering + crafting deliverables (their systems are complete; trainers/tools/stations move to
> Phase-5 polish).
>
> ---
>
> **Part 17 (2026-07-06): the Grand Waystone world event (endgame-loop
> close).** A repeatable solo **world-boss event** — _Restore the Grand Waystone_ — now stands
> south of Waymeet on the crypt road: a Boss-rank **Grand Warden** (`bossGrandWarden`, a warded,
> add-summoning stone construct) guards a dormant Grand Waystone, respawning on a long timer.
> Defeating it "restores" the Waystone — a distinct **Waystone-Restorer** Deed (new `worldEvent`
> metric, 4 Path Points), a restoration announcement, and a bespoke Epic signature (**Grand
> Waystone Shard**, +4% crit). The whole encounter reuses the proven **spawn → loot → kill**
> pipeline: the boss lives in a `count: 1` long-respawn `WORLD_SPAWNS` region, its loot rides
> `buildEnemyLootTable`, and `metaDirector.handleKill` feeds the metric + toast (mirroring the
> rare-kill path). A small `worldEvent.ts` data module ties boss ↔ Deed ↔ site together for the
> client, tests, and Phase-6 hand-off. **266 tests green** (+6: boss/Deed/spawn/signature all
> resolve and stay in sync; the metric is unique); `pnpm typecheck && lint && build` clean; the
> client boots with zero console errors. **This closes the Endgame-loop deliverable** (bounties +
> rares + boss uniques + masteries + world event all done). **Next:** the remaining gathering/
> crafting polish (trainers, tools), then formally close Phase 4 → Phase-5 pace tuning.
>
> ---
>
> **Part 16 (2026-07-06): profession masteries.** Maxing a profession
> (skill 100) now unlocks a permanent **Mastery** — the long-tail payoff and another endgame
> hook: **Rich Veins** (Mining: +1 ore per vein, 2× gem-shard chance), **Nature's Bounty**
> (Herbalism: +1 herb per gather), **Master Angler** (Fishing: better big-catch + fish-oil
> odds), **Efficient Smelting** (Blacksmithing) and **Potent Brews** (Alchemy: a 25% chance to
> craft an extra stackable output for free). Masteries derive from the **already-persisted
> skill** — no new save data and no engine-signature change: `gatherNode`/`rollFish`/`craft`
> read `skill >= SKILL_MAX` internally, and because sub-cap paths draw no new RNG the change is
> byte-identical below 100. The Professions panel (**P**) shows each mastery, locked ("Mastery
> at 100: …") until earned then gold ("★ Mastery"). **260 tests green** (+6: gate, the +1
> gather/fish/craft bonuses, and no sub-cap regression); `pnpm typecheck && lint && build`
> clean; in-browser the panel lists all five masteries with zero console errors. This advances
> the **Endgame-loop** deliverable (only the world-event stub remains). **Next:** the
> "restore the final Waystone" world-event stub, then Phase-5 pace tuning.
>
> ---
>
> **Part 15 (2026-07-06): Hollow boss signature loot.** Each of the
> five Hollow bosses now drops a **bespoke Epic unique** — the endgame re-run chase:
> Bramblegut's Wardknot, The Gloomheart, Prismscale Sigil, Forgewarden's Emberseal, and the
> finale's Waymaker's Lantern. They are class-neutral jewelry (Trinket/Amulet) so any class
> can wear them, but the stats are still flavored for the killer, so a signature is always
> usable; each binds on equip and carries a small **live** `bonusCritChance` rider (+1.5% →
> +3.5% up the ladder), and drops ONLY from its boss at ~20%. Implemented as data +
> generation: `GeneratedItemSpec` gained an optional `signature`, `generateItem` applies the
> fixed name / bind / crit / value premium, and `BOSS_SIGNATURES` feeds the boss branch of
> `buildEnemyLootTable` — no client change (the drop flows through the same `rollLoot` →
> `lootFrom` → bag path). **254 tests green** (+4: coverage, drop shape + equippability, drop
> rate, boss-exclusivity); `pnpm typecheck && lint && build` clean; the client boots with zero
> console errors after the core `items.ts` change. This advances the **Endgame-loop** deliverable
> (bounties + rares + boss uniques now done). **Next:** the remaining endgame polish (profession
> masteries, the world-event stub) and Phase-5 pace tuning.
>
> ---
>
> **Part 14 (2026-07-06): side-quest breadth (the ~110 budget).**
> The zone side-quest arcs are filled out from 36 quests to **111**, hosted by **24 givers**
> (10 new: Innkeep Mirabel, Houndmaster Pella, Sister Elowen, Ranger Ash, Miner Jossa,
> Quartermaster Vell, Lampwright Ned, Pilgrim Asha, Huscarl Bran, Salt-Merchant Pryor). Every
> level band 1→30 now carries at least six optional quests, mixing **kill / collect / explore /
> courier** work with level-appropriate gold + gear rewards, and never gating the main story.
> Eleven new `QUEST_DROP_TAGS` (one per remaining enemy) give collect quests real variety; the
> client emits them automatically and spawns every new giver from `QUEST_GIVERS` with no code
> change. **250 tests green** (+4: budget ≥ 100, every giver offers a quest, per-band side-quest
> spread, drop-tag integrity); `pnpm typecheck && lint && build` clean; in-browser a new giver
> (Innkeep Mirabel) spawns and nameplates at Brookhollow. This satisfies the Phase-4 scope of
> ~110 quests. **Next:** Phase-5 XP-pace tuning (acceptance #5) and the remaining polish.
>
> ---
>
> **Part 13 (2026-07-06): Settings & keybind remapping.** A new
> **Settings panel** (open with **Escape** when nothing else is open, or the ✕ to close)
> exposes **view distance** (3–12 chunks), **master volume**, and a full **rebindable
> keybind** list for the 14 panel/action keys (map, character, quest log, professions,
> crafting, journal, bank, bounties, mount, free-fly, interact, cycle-target, auto-attack,
> release-spirit). Click a row and press a key to rebind; the keypress is caught in the
> capture phase and **swallowed** so it never leaks to the game's input handler mid-rebind.
> Movement (WASD / Space / Shift), the hotbar digits, dev (`` ` ``) and Escape stay fixed and
> are **refused** as bindings; picking a key another action holds **swaps** the two so nothing
> is ever left unbound or duplicated; a **Reset to defaults** button restores the map. The
> map is pure data in `shared/data/keybinds.ts`; the game reads the live map each frame
> (`game.ts`), and both the panel edits and the sliders persist to the save's `settings` block
> (**save v11**, migration defaults the keybind map, merging any saved binds). **246 tests
> green**; `pnpm typecheck && lint && build` clean; in-browser the panel opens, view/volume
> sliders move, M→N rebinds without opening the map (swallow verified), and a reserved key
> flashes "reserved". Next: the remaining side-quest budget and Phase-5 tuning/polish.
>
> ---
>
> **Part 12 (2026-07-05): named rare-elite hunts.** Eight
> wandering **named rares** now roam the zones (WORLD.md §4) — Old Thornhide (Vale),
> Grislefang & the Weald pack-lord, Duskwing / Boulderjaw / Gnash-Cowl (Foothills),
> Shardback Alpha (Peaks), Gruulmarg the War-Chief (Trollmoor), and Wreckmaw (Coast). Each
> is an **Elite-rank** enemy (`named` flag in `shared/data/enemies.ts`, reusing a family
> model) with a single long-respawn spawn point (`spawns.ts`), dropping Elite-tier loot and
> feeding a new **Rarebane** Deed (slay 5). The `MetaDirector` announces each rare kill and
> advances the Deed. In-browser the Journal lists Rarebane under Combat with zero console
> errors.
>
> ---
>
> **Part 11 (2026-07-05): closing the acceptance gaps.** The two
> open criteria from the Part-10 pass are now closed. **(#4) Path Points + perks are
> account-wide** — moved off the character onto the account (**save v10**, migration folds
> any per-character meta into the shared pool: highest Points + max-rank perk union), threaded
> Onboarding → App → Game → MetaDirector and persisted with the character in one write, so a
> perk bought on one Wayfarer applies to them all. **(#3) Quest markers on the map** — the
> `QuestDirector` publishes marker positions (giver `!`/`?` from settlement + offset, and
> `○` at active explore-objective areas), drawn on both the world atlas (M) and the minimap.
> **244 tests green** (save v9→v10 account-fold + round-trip); `pnpm typecheck && lint &&
build` clean; in-browser the world map shows a gold `!` over Brookhollow's givers with the
> quest legend, zero console errors. **Acceptance criteria #1–#4 now pass** (see below); #5 is
> Phase-5 pace tuning. Phase-4 systems are complete; remaining is content breadth + polish.
>
> ---
>
> **Part 10 (2026-07-05): the acceptance pass.** A verification +
> adversarial-review sweep over the Phase-4 systems, which caught two genuine gaps and one
> **critical bug**: quest `use`/`waystoneUnlock` ids used bare names (`brookhollow`) while
> the world emits and stores the canonical `ws-<id>` — so attuning the Brookhollow Waystone
> never satisfied chapter 1's objective, **silently blocking the entire main story**, and
> quest-granted stones were never travel/respawn-usable. Fixed (all quest waystone ids
> namespaced to `ws-<id>`, with a regression test asserting every one resolves). Also placed
> the higher-tier **herb nodes** (Cavemoss in Foothills/Peaks, Duskpetal in Trollmoor) so
> **Herbalism is now levelable to 100** (criterion #2), and fixed two minor client desyncs
> (mount buy-hint staleness at level 20; the level-5 Waymeet letter for already-past-5
> saves). New `shared/test/acceptance-p4.test.ts` encodes the testable criteria. **243 tests
> green**; `pnpm typecheck && lint && build` clean; boots with zero console errors. The pass
> confirms criteria **#1 and #2 now pass**; **#3 (map markers) and #4 (account-wide perks)
> remain open** — Phase 4 is **not yet complete** (see the acceptance-criteria status below).
>
> ---
>
> **Part 9 (2026-07-05): the complete main story (chapters 4–6).**
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

1. [x] `pnpm build` produces a static `dist/` at the repo root (Vercel-ready); initial JS 182 KB gzipped (≪ 3 MB budget). Real-GPU 60 FPS unmeasured in this headless env, but draw-call/triangle/bundle budgets are met and the render loop runs. _(FPS to be re-confirmed on real hardware.)_
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
5. [x] The onboarding flow works on the static build (title → create → spawn → persist verified in headless Chromium; Vercel-deployable repo-root `dist/`).

---

## Phase 4 — Quests, Professions & the Long Game ✅ COMPLETE

**Milestone:** The content game: ~110 quests including the main story, all five professions, meta progression, mounts, achievements, and an endgame loop. This is the "the world has things to do everywhere" phase.

> **Part 1 done (2026-07-05):** the **quest system** — a pure, data-driven engine
> (`shared/quests` + `shared/data/quests`) with all eight objective kinds, chains,
> prereqs, a 25-quest log and 5-pin tracker; named quest-giver NPCs at the settlements
> with `!`/`?` indicators; a giver dialogue (accept / turn-in / reward choice); a quest
> log panel (L) and tracker HUD; XP/gold/item/Waystone rewards; and save v3 persistence.
> A starter arc (Brookhollow tutorial + main-story ch.1 "Light the Way" + the Millstead
> chain into the Briarhollow boss) exercises every objective kind. 184 tests green.
>
> **Part 12 done (2026-07-05):** **named rare-elite hunts.** Eight wandering **named rares**
> (Elite rank, `named` flag, reusing family models) roam the zones with single long-respawn
> spawn points, drop Elite-tier loot, and feed a new **Rarebane** Deed (slay 5) — the
> `MetaDirector` announces each rare kill. Content-validated (Elite rank + buildable model +
> world-spawned + Deed). 245 tests green. This advances the Endgame-loop deliverable
> (bounties + rares now done). **Next:** the remaining side-quest budget + Phase-5 polish.
>
> **Part 11 done (2026-07-05):** **closed the acceptance gaps.** Path Points + perks are now
> **account-wide** (moved off the character onto the account; **save v10** folds any
> per-character meta into the shared pool), threaded through Onboarding/App/Game and persisted
> alongside the character — so perks apply across all local characters (criterion #4). And the
> `QuestDirector` now publishes **quest markers** for the world map + minimap (`!`/`?` over
> givers, `○` at explore-objective areas) (criterion #3). 244 tests green (save v9→v10
> account-fold + round-trip). With these, **acceptance criteria #1–#4 all pass**; #5 (pace) is
> Phase-5 tuning. The phase's systems are done — remaining is content breadth + polish.
>
> **Part 10 done (2026-07-05):** **the acceptance pass** — verification + adversarial
> review of the Phase-4 systems. Caught and fixed a **critical** waystone-id bug (quests
> used bare ids vs the world's canonical `ws-<id>`) that had **blocked the whole main story
> at chapter 1** and broke quest-granted stones; closed the **Herbalism-to-100** gap by
> placing Cavemoss/Duskpetal nodes; fixed two minor client desyncs (mount buy-hint at level
> 20; the level-5 letter for high-level saves). Added `shared/test/acceptance-p4.test.ts`
> (band-coverage + system cross-checks) and a waystone-id regression guard. 243 tests green.
> **Outcome:** criteria #1 (main story 1→30) and #2 (professions/crafting) now pass; #3 (quest
> map markers) and #4 (account-wide perks) remain open, so **Phase 4 is not yet complete**.
> The quest-vs-kill XP share is routed to Phase-5 tuning (GDD §15).
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
- [x] **Quest content** — **111 quests** per docs/WORLD.md zone tables: the 6-chapter main story "The Waymaker's Path", zone side-quest arcs, Hollow quest lines, daily bounty boards. _(Parts 2 + 9: the **complete main story — all six chapters, Brookhollow tutorial → the Sunken Crypt finale (levels 1–30)** — plus early side arcs and Hollow boss lead-ins (Bramblegut, Gnarlmaw, Prismhide, Forgewarden Urzul, the Last Waymaker), ~39 quests from 14 givers. Part 8 added the daily bounty boards. **Part 14 filled the zone side-quest arcs to 111 quests across 24 givers** — every level band 1→30 carries ≥ 6 optional quests (kill / collect / explore / courier), with 11 new drop-tags for collect variety. Guarded by tests: budget ≥ 100, per-band spread, and every giver offers a quest.)_
- [x] **Gathering professions** — Mining, Herbalism, Fishing: skill 1–100 with the classic orange/yellow/green/gray skill-up curve, node activation by re-querying the deterministic worldgen scatter (with respawn timers), tiered materials per zone (Copper/Iron/Silver/Crystalium, Meadowbloom/Fenweed/**Cavemoss/Duskpetal**, ponds→coast), a mining/herbalism channel + a fishing timing minigame, a material stash + Professions panel (P), and **skill-100 masteries** (Part 16: Rich Veins / Nature's Bounty / Master Angler). All four tiers of every gathering profession exist in the world (Part 10), so each is levelable to 100. _(Rescoped to Phase-5 polish: profession **tools** and dedicated **trainer NPCs** — additive flavor; the gathering system itself is complete.)_
- [x] **Crafting professions** — Blacksmithing (smelt ore→bars→weapons/armor) and Alchemy (health/mana potions + stat/warding elixirs) with a pure craft engine, a crafting panel (K) showing material requirements + craftable state, drinkable consumables (heal/restore/timed buff), **skill-100 masteries** (Efficient Smelting / Potent Brews), a **fuller recipe book** to level 100 (iron/silver/crystalium smelts + gear, greater/master potions & elixirs), and **recipe discovery** (top-tier recipes are learned mid-craft, save v12) — closing the mining→smithing / herbalism→alchemy material flows end to end. _(Rescoped to Phase-5 polish: forge/anvil **station proximity** (needs new props) and dedicated **trainer NPCs**; the crafting system itself is complete.)_
- [x] **Meta progression: Deeds & Path Points** — achievement system ("Deeds": exploration, combat, quests, professions, Hollows), Deeds grant **account-wide** Path Points spent on perks (bag slots, Waystone fee reduction, out-of-combat move speed, rested-XP cap) per GDD §10 (Part 11 made Points/perks account-wide, save v10). _(Part 5 done: a pure Deed/perk engine (`shared/meta` + `shared/data/deeds.ts`/`perks.ts`) — 9 Deeds across 4 categories with shared tiered metrics, 4 rank-based Path Perks; a client `MetaDirector` wires kills/bosses/Waystones/quests/crafts/gather-skill milestones to Deed progress, awards Path Points, and applies perk effects (bag cap, travel-fee cut) live; a **Wayfarer's Journal (J)** shows Deeds by category + buyable perks; save v6 persists deeds/pathPoints/perks on the character. Remaining: account-wide perks + nameplate titles land with mounts / the endgame loop / Phase 6 accounts.)_
- [x] **Mounts** — the level-20 Wolf (+60% ground speed, 40-gold sink), a code-authored rideable Wolf voxel model with a saddle + idle/walk/run/jump gaits and 3 palette skins (base bought for gold; Dire & Frostfang unlocked by the Slayer / Pathfinder Deeds), `G` to mount/dismount, and the GDD §7 rules enforced client-side (outdoor-only, auto-dismount the instant combat starts or on entering water/a Hollow). Speed flows through the sim as a clamped `MoveIntent.speedMult`; the Character panel has a Mount section (buy / ride / pick skin); save v7 persists owned mounts + the active skin. _(Account-wide skins + the mount-acquisition quest land with the endgame loop / Phase-6 accounts.)_
- [x] **Endgame loop v1** — **daily bounty boards** at the four hub towns (Brookhollow / Waymeet / Fernwick / Mossgate) + **named rare-elite hunts** + **Hollow boss signature loot** + **profession masteries** + a **world-boss event**. Bounties: a data-driven pool (`shared/data/bounties.ts`), a deterministic daily rotation, a `BountyDirector` tracking kill/gather progress that pays gold + XP + the "Taskmaster" Deed, and a Bounty Board panel (**O**); save v9. Named rares (Part 12): 8 wandering Elite-rank hunt targets across the zones (`named` flag in `shared/data/enemies.ts` + spawn points in `spawns.ts`, ~15-min respawns), dropping Elite loot and feeding the **Rarebane** Deed. Boss uniques (Part 15): each of the five Hollow bosses drops a bespoke Epic signature (`BOSS_SIGNATURES` → `buildEnemyLootTable`; class-neutral jewelry, bind-on-equip, a live crit rider, ~20% per kill) — the re-run gear chase. Profession masteries (Part 16): maxing a profession unlocks a permanent passive (Rich Veins, Nature's Bounty, Master Angler, Efficient Smelting, Potent Brews) applied in `gatherNode`/`rollFish`/`craft` and surfaced on the Professions panel. World event (Part 17): the repeatable _Restore the Grand Waystone_ solo world-boss (the Grand Warden) south of Waymeet — a long-respawn `WORLD_SPAWNS` region + `worldEvent.ts` data, a `worldEvent` Deed metric, and a signature Epic; killing it announces the network's waking. _(Multiplayer scaling of the world boss is a Phase-6 job.)_
- [x] **Supporting systems** — the **Waymeet Bank** (a 50-slot shared vault + a mailbox) as a single `BankPanel` (**B**) with Vault / Mail tabs: move stacks between bag and vault; read letters from world NPCs and claim their gold gifts; the Steward's welcome letter is delivered on reaching level 5. Save v8 persists the vault + inbox. **Settings & keybinds (Part 13):** a `SettingsPanel` (Escape when nothing else is open) with view-distance and master-volume sliders and a full **rebindable keybind** list for the 14 panel/action keys — click-to-rebind with a capture-phase swallow, reserved-key refusal, conflict swap, and reset-to-defaults; the map is pure data (`shared/data/keybinds.ts`), read live each frame, persisted in `settings` (**save v11**). _(Remaining polish, deferred to Phase 5: bank-building/mailbox-prop gating and item mail attachments.)_

### Acceptance Criteria

_Status: **PHASE COMPLETE** (2026-07-06, after Part 18). Criteria **#1–#4 pass** (`shared/test/acceptance-p4.test.ts`); **#5** is a soft playtest target folded into Phase-5 tuning (it changes pace, not reachability)._

1. ✅ **A fresh character can quest 1→30, finishing the main story solo.** The main story is complete and reachable — Part 10 fixed a critical waystone-id mismatch that had silently **blocked chapter 1**; quests blanket the whole 1→30 band with no dead zone (`shared/test/acceptance-p4.test.ts`). _(The quest-vs-kill XP *share* leans grindier than GDD §5 intends — a Phase-5 tuning item in GDD §15; it changes pace, not reachability.)_
2. ✅ **All five professions levelable 1→100; ≥10 useful crafted items; fishing works.** Part 10 placed the higher-tier herb nodes so all four Herbalism tiers exist in the world (Mining already had all four); 10+ recipes/consumables; the fishing minigame works.
3. ✅ **Quest tracker, map markers, NPC indicators; save/load.** Tracker, `!`/`?` indicators, and save/load (v10, round-trip tested) work — and **Part 11 added quest markers to the world map + minimap** (`!` new / `?` turn-in over givers, `○` at objective areas).
4. ✅ **Deeds, Path Points, perks (account-wide); mount outdoors.** Deeds fire, Path Points accrue/spend, the mount works everywhere outdoors — and **Part 11 moved Path Points + perks onto the account** (save v10), so perks apply across all local characters.
5. ⏳ **~25–35 h to cap as a quest-follower.** A soft playtest target, gated on the Phase-5 XP-source tuning (criterion #1 note) — deferred to Phase 5 with the rest of the pace tuning.

> **Phase 4 is complete.** Every deliverable is `[x]` and the acceptance bar (#1–#4) is met. The content is all here — 111 quests, five deep professions, meta, mounts, the full endgame loop. Deliberately rolled into **Phase 5** (polish): the XP-pace tuning (#5), profession **trainers** + **tools**, crafting **station proximity** (needs new forge/anvil/alembic props), and item **mail attachments** — all additive polish, not missing capability.

---

## Phase 5 — Polish: The Complete Solo Game

**Milestone:** Release-quality single-player Pathlands on Vercel. If Phase 6 never happened, this would still be a finished indie game. This phase is deliberately about quality, not new systems.

### Deliverables

- [x] **Audio** — a WebAudio layer (`client/platform/audio.ts`) with a master-gain bus wired to the Settings volume slider, two looping music beds (`loginscreen.mp3` on the title/select screens, `bgm.mp3` in-game; user-supplied mp3s in `public/assets/audio/`, missing files play silently), and synthesized SFX for skill cast / enemy defeat / level-up / quest-complete; autoplay-policy handled by gesture unlock. _Scope simplified per direction: one in-game bed rather than per-zone/situation beds, and a compact procedural SFX set rather than footsteps-by-surface/ambience — those richer layers can return as later polish if wanted._
- [x] **VFX pass** — skill effects per class (slashes, arrows, holy glows, frost/fire), hit sparks, level-up burst, Waystone activation, blight ambience in corrupted areas, water/foliage micro-motion; particle system on instanced quads/voxels. _(Part 4: a pooled `THREE.Points` particle system (`client/engine/vfx.ts`, one additive-soft-dot draw call, 700-particle ring buffer, CPU gravity/drag/fade, colour fades to black over life) wired into the CombatDirector — hit sparks (crit-gold / heal-green), death puffs, **school-tinted cast flashes** (`SCHOOL_COLOR`), a golden level-up fountain, and a Waystone-blue attunement glow. **Part 7** added the atmospherics: **blight ambience** (upward-drifting verdigris spore-motes near the Hollows, `CombatDirector.emitBlight`, density-setting-gated) and **water + foliage micro-motion** (a world-locked sine swell on the subdivided water surface, plus a height-weighted per-instance wind sway on the foliage props via `onBeforeCompile` — no new draw calls).)_
- [x] **UI/UX polish** — coherent art direction across every screen (per ART_GUIDE UI kit), controller-quality keybinding UX, tooltips everywhere (items with comparisons, skills, stats), loading/continue screens using the PNG art, first-time-player tips, colorblind-safe target/rarity colors. _(Part 3: a portal-based tooltip system — item cards with vs-equipped stat-delta comparison + colourblind-safe rarity labels, skill cards on the hotbar. Part 13 (Phase 4) did the rebindable keybind UX. **Part 6** added the **loading/title/continue screens from the PNG art** (title over the Church render, class-portrait thumbnails on the character-select cards) and a **first-time-player tips** overlay (`FirstTimeTips.tsx`, keybind-aware, once-per-browser). A deeper bespoke parchment/wood art-kit remains an optional future polish; every enumerated feature ships.)_
- [x] **Balance & tuning pass** — all-class 1→30 tuning against GDD pace targets, itemization curve audit, Hollow difficulty audit (solo at-level = challenging-but-fair), economy audit (gold faucets vs. sinks), respec/potion/travel cost tuning. _(Part 1: the leveling pace — curve lowered to `250·L^1.55` (~549k) + quest XP ×2, quests ~45% of the climb, 1→30 ~25–35 h; guarded by `acceptance-p4.test.ts`. **Part 6** added a deterministic **audit suite** (`shared/test/balance.test.ts`): baseline all-class TTK vs at-level normal/elite (kill + survive + no outlier), Hollow-boss stat-scaling (×4.5 rank HP, non-one-shot swings), itemization-curve monotonicity + rarity power, and a gold-economy check that **fixed the mount price (40 → 800 c, ~40% of L20 quest gold)** for real choice pressure. Solo boss clears stay proven in `hollows.test.ts`. Live-playtest fine-tuning (and a respec sink, once paths become respeccable) is the only remaining, expected nudge.)_
- [~] **Performance & compatibility** — profiling pass to hold budgets in worst spots; memory leak audit across long sessions; Chrome/Firefox/Safari + 1080p/1440p/ultrawide; graphics settings (view distance, shadows, VFX density); WebGL context-loss recovery. _(Part 5: player-facing **graphics settings** — view distance, **shadows** (off/low/high), **VFX density** (off/low/full), **resolution scale** (75/85/100%) — persisted in **save v13** and applied live; a real **sun shadow map** (`environment.ts`, a player-following orthographic frustum; actors + props cast, terrain receives — receive-only to avoid voxel acne) gated by the quality setting; a `Vfx.setDensity` burst-count multiplier; renderer pixel-ratio scaling; and **WebGL context-loss recovery** (preventDefault → pause → overlay → auto-resume). **Part 7** added **adaptive quality** (a sagging frame rate auto-drops the effective view distance a notch and climbs back on recovery — slow cadence, wide hysteresis, never overwrites the user's setting), a **memory-dispose audit** (every per-`Game` GPU resource freed in `dispose()`), and a **resolution matrix** check (1080p/1440p/ultrawide 3440×1440: HUD stays corner-anchored, draw calls hold ~85–120 vs the ~250 budget). Remaining: the **Firefox/Safari manual/CI pass** — standard WebGL2, no browser-specific APIs.)_
- [x] **Resilience** — autosave + rotating save backups, save-corruption recovery, versioned save migration test suite, error boundary + bug-report info screen. _(Part 5: `save.ts` **v13** with `validateSave()` + never-throwing `tryMigrate()`; a rotating **3-deep backup ring** + **load fall-through** (primary → backups → fresh) in `saveStore.ts`, with a recovery notice on the title screen; **save export/import** (download/restore JSON) in Settings; a top-level React **error boundary** with a bug-report screen (copyable details + save-backup download + reload); and a **versioned migration test suite** (v1→v13, graphics defaults, corruption recovery, validate/tryMigrate). Autosave already ran every 30 s + on unload since Phase 4.)_
- [x] **Content gap fill** — whatever playtesting exposes: dead map corners, quest dead spots, missing vendor, confusing moments. _(Part 8: a coverage audit (`shared/test/content-gaps.test.ts`) that walks the authored world via `World.biomeAt`/`authored.npcSpawns()` — it caught and fixed a **missing-vendor** gap (Millstead/Mossgate/Glimmercamp had a shop tier but no merchant NPC; `npcSpawns()` no longer requires an inn, so **every town sells**) and now guards: all six zones have spawns + a Waystone, every settlement anchors a quest-giver, every collect-quest's drop source is fightable near its level. Live-playtest may surface more; those are folded in as they're found.)_

### Acceptance Criteria

_Status (2026-07-06): **feature-complete & launch-ready.** The automatable criterion (#2) passes in code; #1/#3/#5 are the human/launch sign-offs, taken at the first VPS playtest._

1. ⏳ Blind-playtest run (someone who never saw the game) reaches level 5 without external help; onboarding answers class/movement/combat/quest questions itself. _(Supported by the onboarding flow + keybind-aware first-time tips (`FirstTimeTips.tsx`); the blind-playtest itself is human sign-off.)_
2. ✅ Full 1→30 + main story + all five Hollows + a profession to 100, in one save, no blockers, no console errors. _(`acceptance-p5.test.ts` + `content-gaps.test.ts`: complete 6-chapter story to the L30 finale, all five Hollows bossed, every gathering profession levellable to 100, gap-free 1→30, no dead corners; in-browser smokes boot with zero console errors.)_
3. ⏳ Budgets hold everywhere (worst-case scene ≥ 50 FPS on the reference laptop, ≥ 60 typical); loads within targets on a cold cache over average broadband. _(Draw calls hold ~85–120 (≪ 250) and the bundle is ~280 KB gzipped (≪ 3 MB) — verified headless; real-hardware FPS is confirmed on the reference laptop at first test. Adaptive quality protects the frame budget in heavy spots.)_
4. ✅ Audio/VFX exist for every player-facing action; nothing fires silently/invisibly. _(WebAudio SFX for cast/defeat/level-up/quest; pooled VFX for hit/death/school-tinted casts/level-up/Waystone/blight — verified in the in-browser smokes.)_
5. ⏳ The deployment is publicly shareable as a complete game ("v1.0-solo" tag). _(`vercel.json` + repo-root `dist/` build deploy on Vercel; `docs/DEPLOY.md` covers the VPS+nginx path; the `v1.0-solo` tag is cut at launch.)_

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
