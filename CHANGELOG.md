# Changelog

All notable changes to Pathlands are documented here, per working session. Format follows [Keep a Changelog](https://keepachangelog.com/); the project is pre-release, so entries are grouped by phase rather than semver until 1.0.

## [Phase 6 — The MMO: Server Authority & Launch] — in progress

> **Scope change (2026-07-07):** cut from 1.0 — guilds, friends, duels, 200-client load test,
> password reset / email verification, character import. Refocused on: everything (player data +
> content) in **PostgreSQL** (for a future admin/map editor), **GM tooling**, server-authoritative
> **quests / professions / economy**, **player trade**, **shared quest credit**.

### Part 25 — PostgreSQL player store (2026-07-07)

The production storage layer: **all player data in Postgres**, with the schema built to grow into
the content tables an admin/map editor will edit.

#### Added

- **`server/src/db/schema.ts`**: the idempotent Postgres schema (`CREATE TABLE IF NOT EXISTS`),
  applied on connect. `accounts` (email / password hash / `is_gm` / `is_banned`) and `characters`
  (the full versioned `CharacterSave` in a `jsonb` `data` column, with `name`/`class`/`level`/`xp`/
  position promoted to real columns for querying + the server's authoritative write-back). UUIDs
  are generated in Node, so no `pgcrypto` extension is needed.
- **`server/src/db/pgStore.ts` (`PgStore`)**: implements the `Store` contract on Postgres via a
  minimal `Queryable` (satisfied by `pg.Pool` and by pg-mem alike). `createAccount` is a
  check-then-insert with the UNIQUE constraint as the race guard; `putCharacter` upserts on the
  `account_id` PK; jsonb round-trips the blob (tolerating string or parsed reads).
- **Store selection** (`index.ts` + `config.ts`): the server uses `PgStore` when `DATABASE_URL`
  is set, else the `FileStore` (local dev). The gateway + auth API are unchanged — same contract.
- **Compose**: the `db` (postgres:16) service now runs by default with a healthcheck; `game`
  waits on it and gets `DATABASE_URL`. Deploy docs updated (pg_dump backups, nightly cron).

#### Tests

- **`server/test/db.test.ts`** (+3, pg-mem): accounts (normalise + reject duplicates), the
  character jsonb round-trip + upsert, and the promoted identity/position columns — real SQL,
  headless.

### Part 24 — `/who` online roster (2026-07-07)

A small social utility for the shared world: `/who` lists everyone currently online (name, level,
class) — answered by the server, so it's global (not just who's near you). Headless-tested.

#### Added

- **`/who` protocol** (`shared/src/proto/net.ts`, `NET_PROTOCOL_VERSION` → **14**): `ClientWho`
  (empty request) + `ServerWho` (`NetWhoEntry[]` — name / level / class), with decoder validation.
- **Gateway** (`server/src/gateway.ts`): a `who` frame replies with every joined player's identity,
  capped at `WHO_MAX_ENTRIES` (100) so the frame stays bounded, and rate-gated per connection
  (`WHO_MIN_INTERVAL_MS` 2 s) so the roster reply can't be spammed.
- **Client** (`netClient.ts` `requestWho` + `onWho`; `game.ts` `who` command that prints
  `N online: Alia (L5 Ranger), …` as a system line; `store.ts` `who` command; `Chat.tsx` `/who`).
  `/help` lists it.

#### Tests

- **`shared/test/net.test.ts`**: the v14 codec round-trips the `/who` query + reply (empty roster
  ok; a malformed entry rejected); version → 14.
- **`server/test/chat.test.ts`** (+1): `/who` returns the joined roster (name/level/class) to the
  requester only — a player who didn't ask gets no frame.

### Part 23 — Whispers (directed private messages) (2026-07-07)

Adds `/w` (aliases `/tell`, `/whisper`, `/msg`): a private line to one player, routed server-side
to just the recipient + an echo to the sender — the fourth chat channel (say · emote · party ·
whisper). Server-authoritative + headless-tested.

#### Added

- **Whisper protocol** (`shared/src/proto/net.ts`, `NET_PROTOCOL_VERSION` → **13**): `ClientChat.to`
  (the target's SESSION id — the client resolves a typed name → id, since names aren't unique) and
  `ServerChat.whisper` (the directional flag), with decoder validation.
- **Gateway routing** (`server/src/gateway.ts`): a `chat` frame carrying `to` is a whisper — the
  server sends the line to the target under the sender's name (they see `From <sender>:`) and an
  echo to the sender under the TARGET's name (they see `To <target>:`); both frames carry
  `fromId = sender` so the client's self-check picks the prefix. Validates the id is a joined,
  online player and not self; failures return a system notice to the sender only. Reuses the chat
  rate-gate + sanitiser; never reaches the global broadcast. (`partyNotice` → `systemNotice`, now
  labelled `System`, since it serves both parties and whispers.)
- **Client** (`netClient.ts` `sendWhisper` + `whisper` on `ChatEvent`; `game.ts` `whisperByName`
  resolving name → id against the **party roster first, then visible players**; `store.ts`
  `whisper` command + `ChatLine.whisper`; `Chat.tsx` `/w <name> <msg>` parsing + a distinct
  purple `To/From <name>:` render). `/help` lists it.

#### Tests

- **`shared/test/net.test.ts`**: the v13 codec round-trips a whisper (`to` + `whisper` flag) and
  rejects a non-boolean flag; version → 13.
- **`server/test/chat.test.ts`** (+2): a whisper reaches only the target (as `From`) + the sender
  echo (as `To`), never a bystander; a whisper to an unknown id returns a system notice to the
  sender alone.

### Part 22 — Parties, loot round-robin + shared quest credit (2026-07-07)

Completes the "grouping rewards" story: a party kill now gives **quest kill-credit to every
in-range member** (party questing works) while the **loot rotates round-robin** to one member
per kill (so the economy stays neutral — one drop per kill, distributed fairly). Solo play is
byte-for-byte unchanged. Server-authoritative + tested.

#### Added

- **`lootTurnRecipient` rule** (`shared/src/combat/xp.ts`): a pure round-robin — given the eligible
  members (stable order) and a per-party turn counter, returns whose turn it is (negative-safe;
  null for an empty list).
- **`Party.lootTurn`** (`server/src/party.ts`): a monotonic per-party rotation cursor, advanced by
  the gateway on each credited kill.
- **`ServerCombat` credit refactor** (`server/src/combat.ts`): a shared `eligiblePartyMembers`
  helper (killer + in-range party, reused by XP + loot); `creditKill` now queues the enemy def id
  (quest credit) to **all** eligible members and the rolled loot (gold + items) to a **single**
  round-robin recipient — chosen via the injected `setLootRecipientProvider`, with the loot rolled
  for that recipient's class. `awardKillXp` now delegates to the same eligibility helper.
- **Gateway wiring** (`server/src/gateway.ts`): injects the loot picker — filters the killer's
  party to the eligible/in-range members in stable order, picks via `lootTurnRecipient`, and
  advances `party.lootTurn`. Each recipient's client applies its own credit on the existing
  `ServerKill` channel — no protocol change.

#### Tests

- **`shared/test/progression.test.ts`** (+1): `lootTurnRecipient` rotates + wraps + handles
  single/empty.
- **`server/test/combat.test.ts`** (+2): a party kill gives **both** members the quest credit while
  loot goes only to the chosen recipient (the killer gets none); a solo kill still gives the killer
  the sole credit + its loot (unchanged).

### Part 21 — Parties, shared kill XP (2026-07-07)

Grouping now **rewards**, not just shows health: a party kill grants the **full** XP to every
member close enough to be in the fight — no split, so playing together is strictly better than
apart (grouping scales rewards up, never gates — GDD §Party). Server-authoritative + tested.

#### Added

- **`partyXpRecipients` + `PARTY_XP_SHARE_RADIUS`** (`shared/src/combat/xp.ts`): a pure,
  deterministic rule — given the earner and its party's positions, returns the earner plus every
  other member within the share radius (**40 m**, matching the boss-ally "in the fight" distance).
  Each recipient gets the full amount (no division).
- **`ServerCombat.setPartyProvider` + `awardKillXp`** (`server/src/combat.ts`): the combat sim's
  `xp` event now routes through `awardKillXp`, which resolves the killer's party (via the injected
  provider), range-gates members against the earner, and awards each the full kill XP. Solo (no
  provider / empty party) reduces to crediting only the killer, exactly as before.
- **Gateway wiring** (`server/src/gateway.ts`): injects the provider
  (`id → this.party.partyOf(id)?.members ?? []`) so combat can see the session-scoped party state.
  Each member's client adopts its own XP delta on the existing `combatSelf.totalXp` channel — the
  "client is the XP aggregator" model is unchanged; only who the server credits per kill expands.

#### Tests

- **`shared/test/progression.test.ts`** (+3): `partyXpRecipients` — solo credits only the earner;
  in-range members share (earner leads the list); a member past the radius is excluded.
- **`server/test/combat.test.ts`** (+2): a nearby partied player gains the **same** XP as the
  killer on a kill; a party member 200 m away gains nothing.

### Part 20 — Parties, live ally vitals (2026-07-07)

The party panel now shows **live HP + resource bars** for every member — the server replicates
each member's combat vitals to the others at broadcast cadence, **world-wide** (not interest-
filtered), so you watch an ally's health whether you're fighting side-by-side or a zone apart.

#### Added

- **Party vitals channel** (`shared/src/proto/net.ts`, `NET_PROTOCOL_VERSION` → **12**):
  `NetPartyVital` (hp / maxHP / resource / maxResource / resourceKind / dead, keyed by session id)
  - `ServerPartyVitals` (`t:'partyVitals'`), with a decoder guard (`isNetPartyVital`).
- **`ServerCombat.vitalsOf(id)`** (`server/src/combat.ts`): a player's live vitals projected for
  the ally frames — lighter than `combatSelf` (no cast / xp / target).
- **Gateway broadcast** (`server/src/gateway.ts`): each broadcast, a player in a party is sent a
  `partyVitals` frame covering **all** its members (including itself). Not interest-filtered —
  party health is visible across the whole world. Solo players get no frame.
- **Client** (`client/src/net/netClient.ts`, `store.ts`, `game.ts`, `ui/PartyPanel.tsx`): the
  `partyVitals` frame ingests via a new `onPartyVitals` callback into a `partyVitals` store map
  (keyed by id); `PartyPanel` draws an HP bar (green → red under 30 %, grey when dead) and a
  resource bar (tinted by kind) under each member row. Going solo / disconnecting clears the map.

#### Fixed

- **Part 19 review** (`server/src/gateway.ts`): the invite guard now gives an accurate message for
  the (crafted-client-only) self-invite case and drops the unreachable `'self'` branch — the id
  guard already excludes self before `PartyManager.invite` runs, so it can only return
  `full` / `targetBusy` there.

#### Tests

- **`shared/test/net.test.ts`**: the v12 codec round-trips the party-vitals frame (incl. a dead
  member + an empty batch) and rejects a non-finite hp / a missing `dead` flag; version → 12.
- **`server/test/party.test.ts`** (+1): two grouped players each receive a `partyVitals` frame
  covering the whole party with positive hp/maxHP.

### Part 19 — Parties, client UI (2026-07-07)

The client half of grouping: you can now form, see, and manage a party in-game. Verified on
the VPS (client-visual slice; no protocol change — it rides the Part 18 party channel).

#### Added

- **Party ingestion + senders** (`client/src/net/netClient.ts`): the client now decodes the
  `partyState` (→ `onParty`) and `partyInvite` (→ `onInvite`) frames and exposes `partyInvite(id)`
  / `partyAccept()` / `partyDecline()` / `partyLeave()` / `partyKick(id)` senders. A disconnect
  clears the roster + any pending invite (parties are session-scoped — a reconnect is a fresh,
  ungrouped session).
- **Store party slice** (`client/src/game/store.ts`): `party: PartyUi | null` (leader + members +
  our own id; empty roster ⇒ solo ⇒ `null`) and `partyInvite: PartyInviteUi | null`. Forming a
  party dismisses any stale pending invite. Five new `GameCommands` (`partyInvite` by name /
  `partyAccept` / `partyDecline` / `partyLeave` / `partyKick` by id).
- **`client/src/ui/PartyPanel.tsx`**: a compact roster under the connection pill — a class-tinted
  dot, name, level, and the leader's crown per member, with a **Leave** control and a **✕ kick**
  beside each other member when you are the leader. Hidden when solo. (Live ally HP/resource
  frames are the next slice — those need the server to replicate members' vitals to each other;
  only your OWN combat state is sent today. The row is built to grow a vitals bar.)
- **`client/src/ui/PartyInvite.tsx`**: an invite toast above the hotbar (`"<name> invites you to a
party."`) with Accept / Decline; acting sends the choice and clears the prompt.
- **Chat party commands** (`client/src/ui/Chat.tsx`): `/invite <name>` (alias `/pinvite`) and
  `/pleave`, handled locally (never a raw command hits the wire). `/invite` resolves the name
  against the players currently visible to us (interest-filtered) to the unambiguous SESSION id
  the wire uses; an unmatched name gets a local notice. `/help` now lists the party commands.
- **Wiring** (`client/src/game/game.ts`, `client/src/ui/App.tsx`): the `NetClient` `onParty` /
  `onInvite` callbacks feed the store; `inviteByName` does the name→id resolution; the two panels
  mount in the HUD; a fresh session clears the party slice.

### Part 18 — Parties, server foundation (2026-07-06)

The first slice of grouping: players can form a party (up to 4). Server-authoritative + fully
headless-tested; the client UI + live ally frames are the next slice.

#### Added

- **`server/src/party.ts` (`PartyManager`)**: a pure, session-scoped party state machine over
  player session ids — `invite` / `accept` / `decline` / `leave` / `kick` / `remove`. A
  two-person party disbands on any leave; a departing leader hands off to the next member; a
  disconnect clears the player's pending invites (in + out) and drops it from its party. Max
  size `MAX_PARTY` = 4. Invites validate self / party-full / target-already-grouped, and accept
  rejects a stale invite (inviter gone, party filled, or the recipient already grouped).
- **Party channel** (`shared/src/proto/net.ts`, `NET_PROTOCOL_VERSION` → **11**): `ClientParty`
  (action + optional target **session id** — the client already holds it from the roster/snapshot,
  and an id is unambiguous where display names are not; validated server-side), `ServerPartyState`
  (roster: `NetPartyMember[]` + `leaderId`; empty ⇒ solo), `ServerPartyInvite`; decoders +
  `MAX_PARTY` export.
- **Gateway wiring** (`server/src/gateway.ts`): constructs the `PartyManager`, routes the `party`
  message (`handleParty`), validates invite/kick targets by session id (an invite must name a
  joined player who isn't the sender; `party.kick` enforces leadership + membership), rate-gates
  **invites** (the amplification vector — each pushes an unsolicited frame to another player),
  sends the invite to the target + a system-chat notice to the actor, and re-broadcasts each
  affected member's roster (`sendPartyState`) after every change; `onClose` removes the player
  from its party and re-rosters the survivors.

#### Tests

- **`server/test/party.test.ts`** (+11): the `PartyManager` state machine (formation, self/full/busy
  rejection, stale-invite, disband, leader handoff, leader-only kick, disconnect cleanup) and
  over-the-wire (two clients form a party by invite→accept and see the roster; it disbands on
  leave; a member disconnecting disbands it for the other; an invite reaches the right player even
  when two share a display name — proving id targeting; an invite to an offline/unknown id is
  rejected with a notice and forms no party).
- **`shared/test/net.test.ts`**: the v11 codec round-trips the party frames + rejects an unknown
  action / a malformed member; version assertion updated to 11.

### Part 17 — Server-timeline enemy interpolation (2026-07-06)

Server enemies now move smoothly instead of snapping at the ~10 Hz delta rate — a client-rendering
polish (no protocol / server change). Verified on the VPS combat test.

#### Changed

- **`client/src/net/netClient.ts`**: enemy MOVEMENT is interpolated on the server timeline like
  remote players. A new `enemySamples` map buffers each enemy's position samples (via
  `ingestEnemy`, filled on snapshot/delta, pruned >1 s old keeping ≥2, cleared in lockstep with
  `enemyMap` on snapshot/gone/disconnect). `enemies()` returns each enemy with x/y/z/yaw
  interpolated to `serverNow − renderDelay` (≈150 ms behind, via the existing `sampleAt`) and
  every other field — hp / cast / state / identity — taken from the latest snapshot (never
  interpolated). No extrapolation past the last sample, so an idle enemy rests at its last
  position. The mirrored combat entity reads the interpolated position, so the existing
  render/nameplate/targeting code smooths for free; the ~150 ms position lag is the same cosmetic
  trade already accepted for remote players (combat outcomes stay server-authoritative).

### Part 16 — Enemy cast-bar replication (Stage 2d) (2026-07-06)

The target frame now shows a server enemy winding up a cast — a first combat-feel polish pass on
the server-authoritative enemies. Server half is headless-proven; the cast bar is verified on the
VPS combat test.

#### Added

- **`NetEntity` cast fields** (`shared/src/proto/net.ts`, `NET_PROTOCOL_VERSION` → **10**):
  `castSkill: string | null` + `castFrac: number`, validated by `isNetEntity`. A shared
  `castProgress(e, tick)` helper (`server/src/combat.ts`) computes `{ skill, frac }` and is reused
  by the player's `combatSelf`, the enemy `toNetEntity`, and the change `digest` (which now takes
  the tick and includes a 20-step-quantised frac, so a filling cast bar replicates as UPDATE
  deltas while idle enemies still produce no traffic).
- **Client cast rendering** (`client/src/game/combatDirector.ts`, `client/src/ui/CombatHud.tsx`):
  `mirrorServerEnemies` gives a casting mirrored enemy a synthetic `cast` (endTick far in the
  future so the local `stepCombat` never resolves an enemy cast — the server owns that) that
  drives the wind-up animation + the target-frame skill name, with the progress in a
  `serverCastFrac` side map; `targetCastFrac` reads that for a networked enemy, else computes from
  a real local endTick (so single-player target cast bars now fill too); `CombatHud` fills the
  target cast bar from `castFrac` (previously a hardcoded half-fill).

#### Tests

- **`server/test/combat.test.ts`** (+1): a casting enemy's `NetEntity` reports the skill id + a
  0..1 cast fraction (null when not casting).
- **`shared/test/net.test.ts`**: the v10 codec round-trips an enemy mid-cast and rejects a
  non-string `castSkill`; the version assertion updated to 10.

### Part 15 — Server-authoritative combat, Stage 2c-4: death → Waystone respawn (2026-07-06)

Death moves server-side, closing the combat-authority migration: enemies, player combat, XP,
loot/gold, combat visuals, and now death/respawn are all server-owned. A slain player who releases
their spirit revives at the nearest Waystone, and a corpse can't walk. Server half is
headless-proven; the respawn snap + freeze are verified on the VPS combat test.

#### Added

- **Server-authoritative respawn** (`server/src/combat.ts`, `server/src/gateway.ts`,
  `server/src/sim.ts`): `reviveReleasedPlayers` now relocates the revived spirit to the nearest
  Waystone (`nearestWaystone`, else world spawn) and queues a `respawn`; the gateway drains it
  after `combat.step()` and calls the new `ServerSim.teleport(id, x, z)` (zeroes momentum, drops
  onto `surfaceSpawnY`). `ServerCombat.isDead` + `drainRespawns` expose the state the gateway
  needs. The client reconciles the position jump as a snap (existing `RECONCILE_SNAP_DIST`).
- **Dead-player movement freeze** (`server/src/sim.ts`, `server/src/gateway.ts`): `ServerPlayer`
  gains a `frozen` flag the gateway sets from `combat.isDead(id)` each tick before `sim.step()`;
  a frozen player's queued move wish is discarded (idle only, so gravity still settles the body)
  — a corpse can't walk to a better Waystone, authoritative even against a hacked client.
- **Client freeze mirror** (`client/src/game/game.ts`, `client/src/game/combatDirector.ts`): the
  movement `active` flag is gated on `!combat.isPlayerDead()`, feeding the existing `freeInput`
  so the client predicts the same freeze the server enforces (no reconciliation fight).

#### Tests

- **`server/test/combat.test.ts`** (+2): a released spirit revives relocated to the nearest
  Waystone (respawn queued for the gateway; the combat entity moved too); a dead player's steady
  "walk east" inputs move them nowhere, and the same inputs walk them once unfrozen.

### Part 14 — Server-authoritative combat, Stage 2c-3: combat-events channel (2026-07-06)

Combat the client can't predict — incoming hits on you, other players' fights, monster deaths,
boss lines — is replicated as authoritative visuals so the world's combat reads correctly, not
just your own predicted swings. Cosmetic only (hp/resource ride the combat-self channel). Server
half is headless-proven; the visuals are verified on the VPS combat test.

#### Added

- **`ServerCombatEvents` frame** (`shared/src/proto/net.ts`, `NET_PROTOCOL_VERSION` → **9**): a
  batch of `NetCombatEvent` (kind `damage`/`heal`/`death`/`boss`, world position, amount, crit,
  optional boss text) for the recipient's vicinity. Decoder validates kind + finite
  position/amount + bool crit + optional text.
- **`ServerCombat` fx buffer** (`server/src/combat.ts`): `collectFx` turns each tick's shared
  combat events into positioned `FxRecord`s (damage/heal read the live target; death reads the
  position now on the death event, so an instant-cast-reaped corpse still poofs); `drainFx`
  returns + clears the buffer (capped at `FX_CAP` = 256).
- **Interest-filtered fx replication** (`server/src/gateway.ts`): `broadcast` drains the fx buffer
  once, then per connection sends a `ServerCombatEvents` frame of the visuals within `FX_RANGE_SQ`
  of the viewer, **omitting the viewer's own outgoing damage/heal** (predicted client-side).
- **Client fx rendering** (`client/src/net/netClient.ts`, `client/src/game/combatDirector.ts`,
  `client/src/game/game.ts`): NetClient queues `fx` events (cleared on disconnect) and exposes
  `drainFx()`; the CombatDirector's `netSink` gains `drainFx`, and `renderServerFx` plays the
  floaters + hit sparks + gray death poofs + boss lines at the server positions — reusing the
  single-player visual code, now split into a position-based `pushFloaterAt`. This restores
  incoming-damage feedback on the player (mirrored enemies are passive locally, so it was
  missing) and enemy death poofs (previously the enemy vanished silently in networked mode).

#### Changed

- **`death` combat event** (`shared/src/sim/combat.ts`): now also carries the victim's `x`/`y`/`z`
  (captured at death), so the death VFX plays at the right spot even after the corpse is reaped.

#### Tests

- **`server/test/combat.test.ts`** (+2): a non-lethal hit buffers a damage visual tagged to the
  attacker (so the gateway can omit it for them, send to others); a kill buffers a death poof at
  the victim even after the corpse is reaped.
- **`shared/test/net.test.ts`** (+1): the v9 codec round-trips an `fx` batch (damage/heal/death/
  boss, incl. empty) and rejects an unknown kind + a non-finite coordinate.

### Part 13 — Server-authoritative combat, Stage 2c-2: kill loot + gold (2026-07-06)

Killing a monster is credited server-side: the server rolls the loot table and hands the killer
the gold + items. Same authority split as XP — the server owns _what drops_; the client stays the
inventory/gold aggregator (quest / craft / vendor changes + cloud-save persistence) until those
systems migrate. Server half is headless-proven; the client half (loot landing in the bag) is
verified on the VPS combat test.

#### Added

- **`ServerKill` frame** (`shared/src/proto/net.ts`, `NET_PROTOCOL_VERSION` → **8**): a per-kill
  credit — the enemy def id (for the client's quest / bounty objectives) + gold + `NetItemStack[]`
  (full item defs, since loot generates unique items). Decoder validates gold/tick finite, enemy
  id string, and each item stack structurally (object item with string id + name, finite qty).
- **`ServerCombat` loot roll** (`server/src/combat.ts`): `creditKill` rolls
  `buildEnemyLootTable` → `rollLoot` on the server's seeded RNG for the killer's class and queues
  a `KillCredit` per player; `drainKills(id)` takes + clears a player's queue (gateway drains it
  each broadcast); the feed is cleared on `removePlayer`. Only a live player killer is credited.
- **Kill-credit replication** (`server/src/gateway.ts`): `broadcast` drains each connected
  player's kill credits and sends them as `ServerKill` frames, alongside the existing self /
  combat-self frames.
- **Client loot application** (`client/src/net/netClient.ts`, `client/src/game/combatDirector.ts`,
  `client/src/game/game.ts`): NetClient queues `ServerKill` frames (cleared on disconnect) and
  exposes `drainKills()`; the CombatDirector's `netSink` gains `drainKills`, and `applyServerKills`
  (networked) fires `onEnemyKilled(enemyId)` for quest objectives, adds gold, and pushes items
  into the bag under its capacity rule. `lootFrom` was split so single-player and MMO share one
  `applyKillLoot`; single-player still rolls locally, MMO applies the server's roll.

#### Changed

- **`death` combat event** (`shared/src/sim/combat.ts`): now carries the victim's `enemyId?`
  (undefined for a player) + `level`, so a kill can be credited from the event alone — an
  instant-cast kill resolves inside `applyIntent` and its corpse is reaped by the next tick's
  spawner before the event is drained, so an entity lookup would miss it.

#### Tests

- **`server/test/combat.test.ts`** (+1): a player's kill queues a credit with the right enemy id
  - rolled gold; `drainKills` is idempotent (no double loot on the next broadcast).
- **`shared/test/net.test.ts`** (+1): the v8 codec round-trips a `ServerKill` (incl. an empty
  loot roll) and rejects a non-finite gold + an item stack whose item has no name.

### Part 12 — Server-authoritative combat, Stage 2c-1: kill XP + level-ups (2026-07-06)

**Kill XP** moves server-side: the server awards XP when a player kills a monster, derives the
level, replicates it, and persists it. Quest / Waystone XP stay client-side until those systems
migrate, so the client remains the **XP aggregator** and the server feeds it only the kill-XP
stream. The server half is headless-proven; the client half (XP bar + level-up VFX off server
truth) is verified on the VPS combat test.

#### Added

- **`ServerCombat` progression** (`server/src/combat.ts`): a per-player `progress` map of the
  server's XP total. `addPlayer` gains a `totalXp` parameter and **derives the spawn level from
  it** (`levelProgressFromTotalXp`) rather than trusting the caller's claimed level. Each
  `step()` now runs `processEvents`, which drains the shared sim's combat events and calls
  `awardXp` on every **`xp` event** (a player's killing blow). `awardXp` adds the amount and,
  when the total crosses a level threshold, **rebuilds the combat entity at the new level** via
  `makePlayerEntity` (fresh stats + full HP), preserving position / yaw / target / auto-attack.
  `progressionOf(id)` exposes `{ totalXp, level }` for persistence.
- **`ServerCombatSelf.totalXp`** (`shared/src/proto/net.ts`, `NET_PROTOCOL_VERSION` → **7**):
  the combat-self frame now carries total XP; `combatSelf()` fills it and the codec validator
  requires it to be finite.
- **Client XP adoption as a delta stream** (`client/src/game/combatDirector.ts`):
  `reconcileFromServer` adopts the server's `totalXp` as an **increment off the previous frame**
  (`adoptServerXp` + a `lastServerXp` baseline) and adds that kill XP to the client's own
  complete total — which also holds client-side quest / Waystone XP. The first frame of a
  session only sets the baseline (no level-up fountain for prior-session XP; it silently takes
  the server's stored total if it happens to lead); subsequent increments level up through the
  existing `relevelIfNeeded` VFX + Waymeet-mail path. The baseline resets on any combat-self gap
  so a reconnect can't manufacture a bogus delta. Local XP/level self-award stays suppressed in
  networked mode.

#### Fixed (adversarial review of Stage 2c-1)

- **Dropped kill XP after any quest turn-in**: the initial reconcile only adopted the server
  total when it **strictly exceeded** the client's, but the server sees only kill XP while the
  client's total also includes quest / Waystone XP — so one quest turn-in pushed the client
  ahead permanently and every subsequent kill's XP was silently dropped from the bar. Fixed by
  the delta-stream adoption above.
- **Persisted progress regression** (`server/src/gateway.ts`): `persistPosition` wrote the
  server's kill-only total into `ch.xp` / `ch.level` unconditionally, so the 30 s / disconnect
  flush clobbered the richer complete total the client cloud-saves (the client's `putCharacter`
  upload races the ws hello, so the server can seed from a stale-low total). The writeback is
  now a **monotonic high-water mark** — it advances stored XP only when the server genuinely
  leads it, never regressing it.
- **Spurious level-up VFX on login**: a server total ahead of the client's IndexedDB total (a
  crash between a server kill and the client's autosave) replayed the level-up fountain / sound
  / Waymeet mail for prior-session XP on the first frame. The first-frame baseline now adopts
  silently.

#### Tests

- **`server/test/combat.test.ts`** (+2): a kill **awards XP** that also appears on the
  combat-self channel; a player one XP short of level 2 **levels up on a kill**.
- **`server/test/accounts.test.ts`** (+1): a disconnect **never regresses** stored XP below the
  client's richer complete total (the monotonic-persistence guard).
- **`shared/test/net.test.ts`**: the v7 codec round-trips `totalXp` and rejects a non-finite
  value; the version assertion updated to 7.

### Part 11 — Server-authoritative combat, Stage 2b: the client flip (2026-07-06)

The client now renders the server's enemies and fights them server-authoritatively —
combat is truly multiplayer. This half is browser-visual (verified on the VPS combat test);
the server it talks to is headless-proven (Parts 9–10).

#### Added

- **`client/src/net/netClient.ts`**: ingests the `NetEntity` (snapshot/delta) and
  `ServerCombatSelf` frames it had been ignoring — an `enemyMap` + `lastCombatSelf`, cleared
  on disconnect — and exposes `enemies()` (latest per-enemy state) + `combatSelf()`. Combat
  intents reuse the existing `sendIntent`.
- **`CombatDirector` networked mode** (`client/src/game/combatDirector.ts`): a `netSink` the
  game wires on connect. In this mode `simTick` **mirrors the server's enemies** into the
  shared `CombatState` as passive targets (server owns position/HP/AI; local aggro/auto/
  abilities stripped and the leash home pinned so the local sim never moves them), ticks the
  shared sim only for the player's own **prediction** (cooldowns / resource / cast + auto
  feedback), then **reconciles** the player's authoritative hp / resource / alive-state from
  `ServerCombatSelf`. `onEvent` suppresses XP / death / loot when networked (server-owned).
  `castSlot` / `toggleAutoAttack` / `cycleTarget` / `pickTarget` / `releaseSpirit` forward
  their intents to the server; a networked `releaseSpirit` no longer respawns locally (the
  server owns death + respawn).
- **`client/src/game/game.ts`**: wires `combat.setNetSink({ enemies, combatSelf, send })` to
  the `NetClient` when the game connects.

#### Fixed (adversarial review of the client flip)

- **Predicted-kill flicker / lost target / model churn**: the player's predicted damage could
  drive a mirrored enemy to 0 HP → the shared `killEntity` marked it dead and nulled the
  player's target, then the next server frame resurrected it (new `ModelObject`), so every
  tab-target kill flickered dead→alive and dropped the target. Networked `simTick` now ticks
  `stepCombat` (combat resolution only — **no enemy AI**), then **re-asserts the server's enemy
  HP/alive-state** after prediction and **restores a target** a predicted kill dropped. Enemy
  HP + death are the server's truth, never the client's.
- **Leashing enemies showed full HP**: mirroring the server's `state:'leash'` onto a
  spawn-pinned enemy tripped the shared leash-arrival branch, which reset HP to full every
  tick. Using `stepCombat` (no enemy AI) removes the leash path entirely.
- **False death animations**: a server despawn (a kill OR just leaving interest — the client
  can't tell) played a death animation. In networked mode a dropped enemy is now removed
  quietly (authoritative death VFX arrive with the Stage 2c event channel).
- **Stale mismatched enemy**: `seen.add` moved after the `makeEnemyById` null-guard so an
  unknown `enemyId` can't shield a stale entity from cleanup. Mirrored enemies also clear the
  boss-phase cursor so local prediction can never fire a boss summon.

#### Notes

- Because server enemies are mirrored into the existing local `CombatState`, the entire enemy
  rendering / HP-nameplate / combat-HUD / targeting machinery works **unchanged** — a
  deliberately small, high-reuse flip. Combat feel is tab-target-tolerant (~1 broadcast of
  latency); authoritative damage floaters + enemy cast bars arrive with the Stage 2c event
  channel. Known Stage 2c follow-ups: (a) the client's local player identity must adopt the
  server's persisted character (level/class) on login (Onboarding-v2 character fetch) so
  prediction and the hotbar match the server player exactly; (b) enemies currently take raw
  ~10 Hz server positions with single-tick interpolation (a slight stutter during chases) —
  server-timeline interpolation like the remote-player path smooths it.

### Part 10 — Server-authoritative combat, Stage 2a (2026-07-06)

Players now live in the server's combat sim: enemies attack them and their skill casts
resolve server-side. Server-side + fully headless-tested; the client flip (rendering + HUD
off the server) is Stage 2b.

#### Added

- **Players as combat entities** (`server/src/combat.ts`): `ServerCombat` gained
  `addPlayer` / `removePlayer` / `syncPlayer` / `applyPlayerIntent` / `combatSelf`. On join
  the gateway mirrors the player into the combat state (`makePlayerEntity`); each tick
  `onTick` syncs every player's authoritative movement position in **before** `stepSim`, so
  enemies aggro/chase/attack real players and casts resolve against them. `reviveReleased-
Players` revives a dead player who sent `ReleaseSpirit`.
- **Combat intent routing** (`server/src/gateway.ts`): non-`Move` intents (`CastSkill`,
  `SetTarget`, `ToggleAutoAttack`, `ReleaseSpirit`) now route to `combat.applyPlayerIntent`
  — the shared `tryCast` does all authority validation (class/level/GCD/cooldown/resource/
  range). `Move` stays the movement sim's authority.
- **Combat-self channel** (`shared/src/proto/net.ts`, `NET_PROTOCOL_VERSION` → **6**): a new
  `NetCombatSelf` + `ServerCombatSelf` per-connection frame carries the player's own hp /
  maxHP / resource / resourceKind / level / targetId / cast (skill + 0..1 progress) / dead /
  inCombat — the wire form of what the combat HUD read from the local sim. Sent beside
  `ServerSelf`, interest-independent, with an `isNetCombatSelf` validator.

#### Fixed (adversarial review of the combat server)

- **Enemy deltas dropped between broadcasts**: `ServerCombat.step()` recomputed the
  replication diff (clearing dirty flags + advancing the shadow) every tick, but the gateway
  only broadcasts every Nth tick — so a change on a non-broadcast tick was silently lost. The
  diff now refreshes **once per broadcast** (`ServerCombat.refreshDiff()`, called from
  `broadcast()`), never inside `step()`.
- **Boss adds leaked forever**: boss-summoned adds aren't owned by a spawner slot, so dead
  ones were never reaped and live ones never despawned. `pruneAdds()` now removes a dead add
  immediately and a live add once its boss is gone / dead / disengaged (adds exist only for an
  active fight).
- **Instant in-place resurrection**: `ReleaseSpirit` revived a dead player the very next tick.
  A `RELEASE_DELAY_TICKS` (~2 s) gate now prevents chain-res; full death (Waystone relocation
  - penalty, coordinated with the movement authority) is Stage 2c.
- **Ally skills could target enemies** (shared `tryCast`): an `ally`-target heal/shield/buff
  validated range but not hostility, so a Priest could heal an enemy (e.g. keep a rival's boss
  topped up). `tryCast` now rejects an ally cast on a hostile target — symmetric to the
  enemy-target check. (Pre-existing shared-sim gap; also fixes single-player combat.)

#### Tests

- `server/test/combat.test.ts` (+6): a player's instant `fireBlast` applies damage + spends
  mana server-side; an enemy aggros and damages a stationary player (in combat); a released
  spirit revives only after the delay; a mid-cadence enemy change survives to the next diff;
  boss adds are reaped; over the wire the combat-self replicates (reflecting the **persisted**
  character's level, not the hello's claim) and a `SetTarget` intent round-trips.
- `shared/test/combat.test.ts`: an ally-target skill on a hostile enemy is rejected (no heal).
- `shared/test/net.test.ts`: `ServerCombatSelf` round-trip + rejection; protocol → 6.

### Part 9 — Server-authoritative enemies, Stage 1 (2026-07-06)

The first slice of the combat migration: the server owns the world's enemy population and
replicates it to clients. Server-side + fully headless-tested; the client renders these
enemies in Stage 2 (until then it still runs its local combat and ignores the new frames).

#### Added

- **`server/src/combat.ts` — `ServerCombat`**: one authoritative combat sim for the whole
  world. Each tick it steps the deterministic shared spawner over **all** `WORLD_SPAWNS`
  regions (the server owns the whole map, so it spawns globally, not proximity-gated like the
  client) then `stepSim` (enemy AI + combat resolution) — the same pure shared code the
  client ran locally. Exposes `netEntities()`, per-enemy `isDirty()` (via a quantised
  change-digest so idle enemies make no traffic), `hasChanges()`, and `removed()`.
- **Entity replication protocol** (`shared/src/proto/net.ts`, `NET_PROTOCOL_VERSION` → **5**):
  a `NetEntity { id, enemyId, name, level, x/y/z/yaw, hp, maxHP, state }` now rides
  `ServerSnapshot` (`entities`) and `ServerDelta` (`entities` + `goneEntities`), with an
  `isNetEntity` validator. Decoding is tolerant of a missing `entities` field (defaults to
  `[]`) so the change is forgiving.
- **Entity interest** (`server/src/interest.ts`): `buildEntityCellIndex` + `visibleEntities`
  — the enemy analogue of the player 3×3 chunk policy. The gateway diffs enemies per
  connection (ENTER / UPDATE / LEAVE) against a new `knownEntities` set, in the same delta
  frame as players; the join snapshot seeds the enemies in the joiner's interest.

#### Changed

- **`server/src/gateway.ts`**: constructs a `ServerCombat` from `sim.world`, steps it each
  tick (`onTick`), and merges enemy ENTER/UPDATE/LEAVE into the per-subscriber snapshot/delta.
- **`server/src/sim.ts`**: `ServerSim.world` is now public so the gateway can build the
  combat sim from the shared world.

#### Tests

- `server/test/entities.test.ts` (+3): deterministic spawn + idle (two `ServerCombat` sims
  agree byte-for-byte; enemies full-HP, `state:'idle'`, within region radius), no wire
  changes once settled, and the replication path (a joiner at the boar region sees the boars
  as `NetEntity`; a distant plaza player does not).
- `shared/test/net.test.ts`: `NetEntity` snapshot/delta round-trip, malformed-entity
  rejection, pre-v5 forward-compat, protocol version → 5.

### Part 8 — MMO-only pivot (2026-07-06)

Direction change (owner call): Pathlands is now **MMO-only** — the standalone offline
single-player build is retired. The client always connects to the authoritative server and
always requires an account login.

#### Added

- **`client/src/net/serverUrl.ts`** — `resolveServerUrl()` returns `VITE_PATHLANDS_SERVER`
  when set, else the page's own origin with a `ws(s)://` scheme. The VPS deploy (nginx serves
  the client and proxies the WebSocket on the same host) is therefore zero-config.

#### Changed

- **`App.tsx`** — the server URL is always resolved; the account **login screen always
  gates** the world (the `VITE_PATHLANDS_SERVER !== undefined` opt-in checks are gone), and
  the cloud-save upload is unconditional.
- **`game.ts`** — the `NetClient` + `RemotePlayerRenderer` are **always constructed** and the
  socket always connects (no more single-player `net = null` branch). Fields stay nullable so
  the existing `this.net?.` guards read unchanged.
- **Docs** — `CLAUDE.md` (opening direction + Deployment section), ROADMAP, ARCHITECTURE,
  SERVER_DEPLOY: the VPS is canonical; the client has a hard server dependency by design;
  local IndexedDB saves are a bootstrap cache with the server as source of truth.

### Part 7 — Presence & emotes (2026-07-06)

Make other players legible in the shared world: see who they are, and let them emote.

#### Added

- **Remote-player nameplates** (`client/src/game/game.ts`): each server-reported remote
  now gets a friendly **name + level** plate, projected from its interpolated head position
  and merged into the existing nameplate layer (no HP bar — friendlies aren't targets).
  Client-only; single-player unchanged.
- **Emotes** (`shared/src/data/emotes.ts`): a data-driven 15-command table (`/wave`,
  `/bow`, `/cheer`, `/dance`, `/roar`, …) with `findEmote` / `emoteCommands` helpers.
  Typing `/wave` broadcasts a third-person action line everyone sees — "Alia waves." —
  formatted **server-side** under the authoritative display name and rendered as an italic
  emote line. The client validates the command against the shared table first (instant
  "unknown command" / `/emotes` help without a round-trip); the server re-validates and
  drops an unknown command. Carried on the existing chat channel via a new optional
  `ServerChat.emote` flag (no new client message; still protocol v4).

#### Tests

- `shared/test/emotes.test.ts` (+3): command uniqueness/format, non-empty phrases,
  case-insensitive `findEmote` + unknown → null.
- `server/test/chat.test.ts` (+2): a known `/wave` broadcasts `emote:true` "waves." under
  the server name; an unknown `/command` produces no broadcast.
- `shared/test/net.test.ts`: `ServerChat.emote` codec round-trip + non-boolean rejection.

### Part 6 — Chat: the first social channel (2026-07-06)

Global chat so players in the same world can talk — the first slice of the Social layer,
chosen for being fully server-testable and the thing a first playtest most wants. The wire
codec is the trust boundary; the server is authoritative over identity and rate.

#### Added

- **Chat protocol** (`shared/src/proto/net.ts`, `NET_PROTOCOL_VERSION` → **4**): a
  `ClientChat {text}` and a `ServerChat {fromId, from, text, tick}`, plus `MAX_CHAT_LEN`
  (300). Decoders reject a non-string / empty / over-cap line at the boundary.
- **Server chat** (`server/src/gateway.ts`): the `chat` frame is accepted only from a
  **joined** session, **rate-limited per connection** (≥ 700 ms between lines), **sanitised**
  (`sanitizeChat` strips C0/C1 control chars incl. newlines, collapses whitespace, caps at
  200 chars, drops an empty result), and **rebroadcast to every joined session** — the
  sender included — under the **server-side display name**, never the client's copy (no
  impersonation).
- **Client** (`client/src/net/netClient.ts`): `NetClient.sendChat(text)` and an `onChat`
  callback that flags a line `self` when `fromId` is our own session id.
- **Chat store slice** (`client/src/game/store.ts`): `chat: ChatLine[]` (capped at
  `CHAT_HISTORY_MAX` = 100), `pushChat`, and a `chatTyping` flag with `setChatTyping`; a
  `GameCommands.sendChat`.
- **Chat panel** (`client/src/ui/Chat.tsx`): a bottom-left scrollback + input that opens on
  **Enter**, sends on Enter, cancels on **Esc**; own vs. others colour-coded; auto-scrolls;
  hidden entirely in single-player (`store.net === null`). Wired into `App.tsx`.

#### Changed

- **Input gating while typing**: `Input.onKeyDown` (`client/src/game/input.ts`) now ignores
  keystrokes whose target is a focused text field (and no longer `preventDefault`s Space/Tab
  there), so typing works normally; keyup is still processed unconditionally so a key held
  into a focus change is never left stuck down. `game.ts` additionally suspends all gameplay
  key actions and freezes the player (`freeInput`) while `chatTyping`, and the chat panel
  releases pointer-lock on open so mouse-look can't accumulate a snap.

#### Tests

- `server/test/chat.test.ts` (+7): two-client delivery (sender included), server-name
  authority (no spoof), control-char/newline sanitising, length cap, whitespace-only drop,
  rate-limit burst, and a pre-hello socket that can neither send nor receive chat.
- `shared/test/net.test.ts`: chat codec round-trip + rejection cases; protocol version → 4.

### Part 5 — Onboarding v2: client login (2026-07-06)

Closes the accounts loop: the Part-4 server is now driven from the browser. Client-only
and **opt-in** (`VITE_PATHLANDS_SERVER`) — single-player is unchanged and never sees a login.

#### Added

- **Auth API client** (`client/src/net/authClient.ts`): `register` / `login` (→ session
  token), `fetchCharacter` / `putCharacter`, and a `httpBase` helper that maps the `wss://`
  game URL to `https://` for the REST endpoints. Server error codes map to friendly copy.
- **`LoginScreen`** (`client/src/ui/LoginScreen.tsx`): a themed email/password form with a
  login/register toggle, inline errors, and a busy state. Rendered as a gate before the
  character flow whenever a server is configured.
- **Token wiring**: the session token is persisted in `localStorage` and threaded
  `App → Game → NetClient` into the ws hello, so the connection binds to the account and the
  server restores the character's last position. On entering the world the local character is
  **best-effort uploaded** to the account (cloud-save migration). `NetClient` gained an
  `onAuthError` callback (fired on a server `auth` error) → App clears the token and returns
  to the login screen; a rejected token no longer reconnect-loops.

### Part 4 — Accounts & persistence (server foundation) (2026-07-06)

Real accounts and durable characters, dependency-free (Node `crypto` only — no native
argon2 to break a Docker build) and fully headless-tested.

#### Added

- **Auth** (`server/src/auth.ts`): scrypt password hashing (per-password random salt,
  constant-time comparison) and compact **HS256 JWT** session tokens (`Auth.issue`/`verify`
  with expiry + signature-tamper rejection). No dependencies; argon2id is a documented
  drop-in upgrade later.
- **Persistence** (`server/src/store.ts`): a `Store` interface (accounts + character
  blobs) with a durable **`FileStore`** — JSON on disk, debounced **atomic** writes
  (temp-file + rename), loads on start, tolerates a missing/corrupt file — as the default,
  and a `MemoryStore` for tests. Characters are stored as the opaque `CharacterSave` blob
  (a cloud save). PostgreSQL stays the staged scale option (compose `--profile db`).
- **REST auth API** (`server/src/httpApi.ts`, served on the existing HTTP port): `POST
/auth/register` and `/auth/login` → a session token; `GET`/`PUT /character` (bearer-auth)
  for the character cloud save. Per-IP rate-limited, request-body size-capped, and
  structurally validated at the boundary.
- **ws session binding**: the hello now carries an optional account `token`
  (`NET_PROTOCOL_VERSION` → 3, decoder validates it). A valid token binds the session,
  loads the persisted character (its identity + last position override the guest fields),
  and the server writes the **authoritative position back** on disconnect and every 30 s —
  so a character resumes where it logged off. An invalid token is rejected outright (no
  silent guest fallback); absent ⇒ an ephemeral guest session (the prior behaviour).
- Tests (+14 → **337**): auth crypto (hash round-trip / wrong-password / salt uniqueness /
  JWT expiry+tamper), store CRUD + FileStore durability across reopen, and the full
  register → login → cloud-save → token-session → position-persists-across-reconnect flow
  (`server/test/{auth,store,accounts}.test.ts`).

#### Changed

- `docker-compose.yml`: the `game` service now takes a required `AUTH_SECRET` (from a
  `.env` file — compose refuses to start without it) and mounts a `gamedata` volume at
  `/data` for the FileStore. `sim.join` accepts an optional persisted spawn (validated
  in-bounds). The entry point warns and mints an ephemeral secret if `AUTH_SECRET` is unset.

### Part 3 — Server Ops: deployable to a VPS (2026-07-06)

The authoritative server can now run on a Linux VPS behind TLS, so the two-player movement
slice is testable with real players (ARCH §8, first slice of the Ops & launch deliverable).

#### Added

- **HTTP health/status endpoint.** The gateway now creates its own `http.Server` and lets
  `ws` ride on it, so `wss://` upgrades and plain-HTTP routes share one port: `GET /healthz`
  (returns `ok`, for nginx upstream checks and the Docker `HEALTHCHECK`) and `GET /status`
  (JSON: `status`, `protocol`, `seed`, `tickRate`, `serverTick`, `players`, `connections`,
  `uptimeMs`). Covered by `server/test/health.test.ts`.
- **`server/Dockerfile`** — Node 22 + pnpm; a **filtered install** (`--filter
"@pathlands/server..."`) pulls only the `server` + `shared` workspaces (the client's
  `three`/`react`/`vite` are never fetched), runs unprivileged as the `node` user, and
  starts via `tsx` with `shared/` imported unchanged. Includes a container `HEALTHCHECK`.
- **`docker-compose.yml`** — `game` + `nginx` (TLS/wss reverse proxy) core services; a
  `db` (PostgreSQL 16) service is declared behind a `--profile db` for the later accounts
  phase (the server doesn't use it yet).
- **`deploy/nginx/pathlands.conf`** — TLS termination, port-80→443 redirect, WebSocket
  upgrade proxy to the `game` service, `/healthz` + `/status` passthrough, and long
  read/send timeouts for persistent game sockets.
- **`docs/SERVER_DEPLOY.md`** — the VPS runbook: DNS A-record → certbot standalone → `docker
compose up -d --build` → build the client with `VITE_PATHLANDS_SERVER=wss://…` → two-browser
  test, plus operating (status/logs/update), weekly TLS renewal via cron, and the
  deferred-Postgres note. `.dockerignore` keeps the build context to the server source.

### Part 2 — Reconciliation, interest management, connection UX, server hardening (2026-07-06)

Built on top of Part 1 after an **adversarial audit** of the Part-1 netcode (which surfaced the
server-hardening gaps fixed below).

#### Added

- **Client-side prediction reconciliation.** New per-connection `self` protocol message
  (`ServerSelf` + `NetSelf`, `NET_PROTOCOL_VERSION` → 2) carries a client's own authoritative
  `PlayerPhysics` + the last input sequence the server applied (`ackedSeq`). The client keeps a
  bounded **input history**, and each frame resets its predicted physics to the authoritative state
  and **replays the unacked inputs** through the same shared `stepPlayerMovement`. Because both
  sides run identical code on identical intents, the agreeing case reproduces the prediction exactly
  (no pop); any residual is folded into a decaying **render error-offset** (teleport-scale
  corrections snap). Full physics — not just position — is sent so the replay integrates the right
  dynamics through falls/jumps/water. Shared `physToNetSelf` / `applyNetSelf` keep the projection in
  one place. (`shared/proto/net.ts`, `server/sim.ts`, `client/net/netClient.ts`,
  `client/game/game.ts` `reconcileSelf`, `client/game/playerController.ts` `applyAuthoritative`.)
- **Chunk-grid interest management** (`server/interest.ts`): replication is now per-subscriber —
  each client receives only the players within its **3×3 chunk region** (`cellOf`/`cellKey`/
  `buildCellIndex`/`visibleIds`), plus its own `self` frame regardless of interest. The gateway
  diffs a per-connection `known` set to emit enter (full state) / update (if dirty) / leave, so
  `gone` now means "despawn — left interest or disconnected." No wire-shape change.
- **Connection UX**: the `NetClient` now sends **pings** and computes an EWMA-smoothed **RTT**,
  tracks a connection **phase** (connecting / connected / reconnecting), and drives a new
  **`NetStatusHud`** (a pill under the minimap showing phase · peers · latency) via a minimal store
  `net` slice. Hidden entirely in single-player (`net === null`).
- **Server-time remote interpolation**: remote samples are now placed on the **server-tick
  timeline** (each carries a server tick) and played back ~150 ms behind an estimated server clock,
  so network jitter no longer warps a remote's apparent speed (audit finding).
- Headless tests (+12 → **319**): reconciliation byte-parity / mispredict-erase / replay-convergence
  / ws ack channel (`server/test/reconcile.test.ts`), interest enter/leave/re-enter + leave≠
  disconnect + self-bypasses-interest (`server/test/interest.test.ts`), and codec `self` round-trip
  / malformed-rejection (`shared/test/net.test.ts`). Shared test helpers in `server/test/support.ts`.

#### Changed

- **Server input handling**: the last-wins `pendingMove` became a **bounded FIFO** (`inputs[]`,
  `MAX_INPUT_QUEUE`) drained one per tick, with a separate `lastRecvSeq` (ordering gate) and
  `lastAppliedSeq` (the reconciliation ack). A client's catch-up burst now applies input-for-input
  over successive ticks instead of collapsing to the newest — matching the client's predicted path.

#### Fixed (server hardening, from the audit)

- **`maxPayload`** on the WebSocket server — oversized frames are rejected before `JSON.parse`, so a
  hostile giant frame can't block the event loop or OOM the process.
- **Hello timeout + connection cap** — an unauthenticated socket that never says hello is terminated,
  and connections past a configured limit are refused (anti-idle/DoS). `ping` now requires a
  completed hello.
- **WebSocket heartbeat** — the server pings every connection and terminates any that miss a round,
  reaping half-open sockets (client sleep / dropped wifi) so their player no longer lingers as a
  frozen ghost.

#### Fixed (from a follow-up adversarial review of the Part-2 diff)

- **Reconnect no longer freezes movement.** `NetClient.onClose` now clears the session identity
  (`you`/`seq`/`history`/`pendingSelf`), so during the reconnect window the `sendIntent` gate stays
  closed — previously stale-sequence intents from the old session leaked to the server's brand-new
  player and poisoned its sequence gate, dropping every real input after the welcome reset (a hard
  freeze after every reconnect).
- **Gameplay reads authoritative physics, not the smoothed render state.** Quest explore, gathering
  (the "moved" test), discovery, and the HUD/minimap `live` position now read `controller.physics`;
  previously the decaying reconciliation offset in `rs` could spuriously cancel an in-progress
  gather channel while the player stood still. (Combat already read physics.)
- **Per-connection message rate limit** (`maxMsgsPerSec`, default 60) — excess frames are dropped
  before the decoder and egregious floods terminate the socket, so an intent flood can't burn
  parse/validate CPU and starve the tick loop (the rate backstop `maxPayload` couldn't provide).
- **Client liveness timeout** — if no pong arrives within ~3 ping intervals the client closes the
  socket itself, driving the reconnect path, instead of freezing until the OS TCP timeout on a
  silent server death / partition.
- **Protocol-mismatch reconnect loop stopped** — the client now handles the server `error` frame and
  stops retrying on a `protocol` error (a version mismatch won't fix itself on retry).
- **Sequence/tick validation** — the codec now requires non-negative safe integers for `seq`/`tick`,
  so a fractional/negative/absurd value can't poison the server's monotonic gate.

_(Left as a documented, 2×-bounded known gap: the server still trusts the clamped client `speedMult`
— the correct fix is coupled to server-side mount/combat state and would otherwise break a mounted
client's reconciliation, so it lands with those systems.)_

### Part 1 — Server skeleton + two-player vertical slice (2026-07-06)

Phase 5 is tagged **`v1.0-solo`** (the complete single-player game). Phase 6 begins by turning the
intent → simulation boundary that has existed since Phase 1 into a network boundary: an
authoritative server, and two clients that see each other move.

#### Added

- **Network protocol** (`shared/proto/net.ts`): pure, serialisable client↔server messages —
  `hello`/`intent`/`ping` (up) and `welcome`/`snapshot`/`delta`/`pong`/`error` (down) — a
  `NetPlayer` replication shape, `NET_PROTOCOL_VERSION`, and a **single-choke-point codec**. JSON
  today; swapping to length-prefixed MessagePack (ARCH §7) touches only the four encode/decode
  functions. Decoders structurally validate untrusted frames and return `null` on anything
  malformed, so a hostile frame is dropped at the boundary before it can reach the sim.
- **Game server** (`server/` — new pnpm workspace, Node 22 + `ws`, run via `pnpm dev:server` /
  `pnpm start:server`): imports `@pathlands/shared` **unchanged**. A headless `VoxelSampler` from
  the same deterministic `World(WORLD_SEED)`; an **authoritative 20 Hz** tick advancing players
  through the identical shared `stepPlayerMovement`; a player registry; snapshot-on-join and a
  **10 Hz delta broadcast** (interest-management seam left for the next part). Wall-clock is read
  only at the tick edge — the sim stays fixed-tick and deterministic.
- **Client netcode** (`client/src/net/netClient.ts` + `client/src/engine/remotePlayers.ts`):
  **opt-in** via `VITE_PATHLANDS_SERVER` (unset ⇒ the single-player static build has **no server
  dependency**, unchanged). Streams the local player's exact applied intent to the server, renders
  other players interpolated **~120 ms** in the past for smooth motion under a 10 Hz wire, and
  auto-reconnects with capped backoff. Own movement stays locally predicted (same shared function).
- **Two-player proof** (`server/test/twoPlayer.test.ts`): boots the server, connects two real `ws`
  clients, moves one, and asserts the **other** sees the moved position **matching the server's
  authoritative sim** — plus distinct session ids and departure cleanup. (+3 tests → **307**.)
- Root scripts: `dev:server`, `start:server`; `typecheck` now covers `server/` too.

#### Changed

- **`SPAWN_X` / `SPAWN_Z`** promoted from client-local literals to **shared world constants**
  (`shared/core/constants.ts`), so the client and the Phase-6 server agree on where a character
  enters the world. The client now imports them; no behaviour change single-player.
- `PlayerController` retains `lastIntent` (the exact `MoveIntent` it applied each tick) so the
  NetClient can send the authoritative server the same input the local prediction ran.

## [Phase 5 — Polish: The Complete Solo Game] — feature-complete & launch-ready

### Part 8 — Content gap-fill, Phase-5 acceptance, VPS deploy guide (2026-07-06)

#### Added

- **Content coverage audit** (`shared/test/content-gaps.test.ts`): drives the authored world
  through `World.biomeAt` / `authored.npcSpawns()` to guard against dead content — every town has a
  merchant, all six zones have spawns + a Waystone, every settlement anchors a quest-giver, and
  every collect-quest's drop source is fightable near its level. (Complements the referential
  integrity already in `quests.test.ts`.)
- **Phase-5 acceptance test** (`shared/test/acceptance-p5.test.ts`): codifies criterion #2 — the
  full solo game is completable in one save with no blockers (complete 6-chapter story to the L30
  finale, all five Hollows bossed, every gathering profession levellable to 100, gap-free 1→30
  gates), plus a fresh-save-valid check.
- **`docs/DEPLOY.md`**: a static-hosting guide for an Ubuntu VPS + nginx (build → `dist/`, SPA
  fallback, immutable asset caching, certbot TLS, update workflow), alongside the zero-config
  Vercel path. Serves the single-player build from the user's own VPS.

#### Fixed

- **Missing-vendor gap**: Millstead, Mossgate, and Glimmercamp carried a `SETTLEMENT_TIER` but had
  no merchant NPC, because `AuthoredLayer.npcSpawns()` gated the vendor on `hasInn`. Dropped the
  inn requirement — **every town now has a merchant** (RNG-safe: vendor and villager both draw one
  name int, so downstream NPC positions/seeds are unchanged).

#### Notes

- Phase 5 is **feature-complete and launch-ready**: every deliverable landed (Performance's only
  open item is the Firefox/Safari manual pass), and the automatable acceptance criterion (#2)
  passes. The human/launch sign-offs — a blind playtest to level 5 (#1), real-hardware 60 FPS (#3),
  and cutting the public `v1.0-solo` tag (#5) — happen at the first VPS test.
- **304 tests green**; `pnpm typecheck && lint && build` clean.

### Part 7 — VFX remainder & Performance (2026-07-06)

#### Added

- **Blight ambience** (`CombatDirector.emitBlight`): a slow drizzle of upward-drifting verdigris
  spore-motes that thickens the closer the player is to a Hollow mouth (proximity to `HOLLOWS`).
  Runs through the pooled VFX system and is gated by the VFX-density setting (`off` mutes it).
- **Water micro-motion** (`environment.ts`): the water surface is now subdivided and rides a
  world-locked, two-wave sine swell injected via `onBeforeCompile` (a shared `uTime` uniform,
  advanced in `update`). No new draw calls.
- **Foliage micro-motion** (`propRenderer.ts`): instanced props sway in a light breeze — a
  height-weighted, per-instance-phased wind offset injected into the shared prop material via
  `onBeforeCompile`, advanced by `PropRenderer.tick(dt)`. Bases stay put, tops sway; short props
  (rocks) barely move.
- **Adaptive quality** (`game.ts`): once the game is running, a sustained low frame rate quietly
  drops the effective view distance one notch (down to a floor of 4) and climbs back toward the
  user's setting when it recovers. Slow cadence (3 s) + wide hysteresis (< 35 / > 55 FPS) so it
  never thrashes the chunk streamer; the user's persisted setting is the ceiling and is never
  overwritten.

#### Fixed

- **Vercel deploy** ("No Output Directory named 'dist' found"): the client now builds to the
  repo-root `dist/` (Vite `outDir` → `../dist`, `emptyOutDir: true`) and `vercel.json`
  `outputDirectory` is `dist`. Vercel's build looks for the output at the repo root and its
  Project-Settings output directory can override `vercel.json` in some project configs — building
  to the root `dist` makes the location unambiguous so the deploy always finds it. (`pnpm build`
  now produces repo-root `dist/`; docs updated.)

#### Notes

- **Memory-dispose audit**: confirmed every per-`Game` GPU resource is freed in `dispose()`
  (chunks, props, entities, combat/VFX, environment/water, mount, player model, renderer). The
  shared prop material + wind clock are intentional app-lifetime singletons.
- **Resolution matrix**: verified in-browser at 1080p, 1440p, and ultrawide (3440×1440) — the HUD
  stays corner-anchored and draw calls hold ~85–120, well under the ~250 budget. Firefox/Safari
  verification is a manual/CI step (the client is standard WebGL2 with no browser-specific APIs).

### Part 6 — UI/UX & Balance (2026-07-06)

#### Added

- **First-time-player tips** (`client/ui/FirstTimeTips.tsx`): a 6-step guided overlay (move →
  fight → quests → gear → wider world) shown once per browser (localStorage) and skippable at any
  step. Tips read the **live keybind map**, so they name the player's actual keys after any rebind.
  Serves acceptance criterion #1 (a blind playtester reaches level 5 unaided).
- **Onboarding art pass**: the title screen now sits over the code-authored village art (the Church
  render) behind a legible vignette, with a larger gold wordmark; the character-select ("continue")
  cards show **class-portrait thumbnails**.
- **Balance audit suite** (`shared/test/balance.test.ts`, deterministic): baseline auto-attack
  **TTK** for all four classes vs at-level normal/elite enemies (every class kills + survives, no
  class a wild outlier); **Hollow-boss stat-scaling** (the ×4.5 rank HP multiplier lands; a boss
  swing is not a one-shot vs an at-level tank); **itemization-curve** monotonicity (weapon dps,
  stat budget, armor all rise with item level; higher rarity is strictly more budget); and a
  **gold-economy** check (mount affordable from quest gold but a real, saved-for purchase).

#### Changed

- **Grey Wolf mount price 40 → 800 copper** (`shared/data/mounts.ts`). At 40 c it was ~2% of the
  ~1,916 c a level-20 quester has earned — trivial pocket change; 800 c (~40%) restores the GDD §15
  "choice pressure" (save for the mount vs. spend on gear/potions), now guarded by the economy audit.
- **Fixed a latent CSS bug**: `url()` background layers with spaced filenames (e.g. `Medival
Church.png`, `Medival Inn.png`) were unquoted, so the loading- and title-screen art silently
  failed to load. Quoted the URLs — the art now renders.

#### Notes

- The balance harness deliberately audits the **floor** (baseline white-damage sustain), not
  skilled rotation play — a "spam every skill" loop can't fairly drive cast/cooldown/kite/potion
  discipline. Dynamic full-rotation combat and solo boss clears are covered by `combat.test.ts` and
  `hollows.test.ts`.

### Part 5 — Performance & Resilience (2026-07-06)

#### Added

- **Save resilience** (`shared/proto/save.ts` **v13**, `client/platform/saveStore.ts`):
  `validateSave()` (structural type guard) and `tryMigrate()` (migrate-or-`null`, never throws)
  back a **rotating 3-deep backup ring** and a **load fall-through** — on boot the loader tries
  the primary record, then each backup newest-first, then a fresh save, so a single corrupt
  IndexedDB record can no longer brick a character. A recovered load surfaces a notice on the
  title screen.
- **Save export / import**: download the whole save as a JSON backup and restore it from a file
  (Settings → Save data). Import validates through the same defensive migrator and reloads.
- **Error boundary** (`client/ui/ErrorBoundary.tsx`): a top-level React boundary that replaces a
  crashed UI with a calm bug-report screen — copyable error + component stack, a one-click
  save-backup download, and reload.
- **Graphics settings** (persisted in save v13, applied live): **shadows** (off / low / high),
  **VFX density** (off / low / full), **resolution scale** (75 / 85 / 100 %), alongside the
  existing view-distance slider — a new GRAPHICS section in the Settings panel.
- **Sun shadow map** (`client/engine/environment.ts`): a directional-light shadow with an
  orthographic frustum that follows the player each frame (1024/2048 map for low/high). Characters,
  enemies, mounts, and instanced props **cast**; terrain **receives** (receive-only ground avoids
  voxel shadow acne). Gated by the shadows setting; the renderer keeps `shadowMap.enabled` on so
  toggling quality never triggers a shader recompile.
- **WebGL context-loss recovery** (`client/game/game.ts`): `webglcontextlost` is `preventDefault`ed
  and pauses the loop behind a "Rendering paused" overlay; `webglcontextrestored` resizes and
  resumes (three re-uploads geometry/materials lazily). A `contextLost` store flag drives the
  overlay.

#### Changed

- `Vfx.burst` scales its particle count by a density multiplier (`Vfx.setDensity`), wired to the
  VFX-density setting; `off` mutes cosmetic particles entirely.
- The renderer's pixel ratio is multiplied by the resolution-scale setting (a cheap way to hold
  frame budget in heavy scenes).
- `migrate()` now clamps `viewDistance`/`resolutionScale` into range and validates the graphics
  enums, defaulting unknown values.

#### Tests

- Extended `shared/test/save.test.ts` to **282 total**: v1→v13 migration, graphics-setting
  defaults + range/enum validation, `validateSave` accept/reject cases, and `tryMigrate`
  recover-or-`null` (corruption recovery).

### Part 4 — VFX: a pooled particle system (2026-07-06)

#### Added

- **VFX particle system** (`client/engine/vfx.ts`, a `Vfx` class): one pooled `THREE.Points`
  object — a **700-particle ring buffer**, a single draw call, a fixed memory budget — of
  **additive soft dots** rendered by a `RawShaderMaterial`. Each particle carries its own
  perspective-scaled point size and RGB; the fragment shader masks points to soft rounds via
  `gl_PointCoord`; colour **fades to black over life** (additive → invisible), so no per-particle
  alpha channel is needed. Particles are CPU-simulated each frame (gravity + drag + fade) and the
  changed position/colour buffers are re-uploaded.
- **Combat VFX** wired into `CombatDirector`: **hit sparks** at the struck body (gold on crit,
  green on heal, warm on normal hits), **death puffs**, **school-tinted cast flashes** at the
  caster (physical/nature/holy/fire/frost/arcane/shadow → distinct colours via `SCHOOL_COLOR`,
  chosen from the cast skill's damage school), a golden **level-up fountain**, and a
  Waystone-blue **attunement glow** on a new attune.
- `SCHOOL_COLOR` palette mapping each GDD §4 damage school to a burst colour.

#### Notes

- The system is deliberately client-only render candy (no sim state, no RNG stream) — bursts are
  cosmetic and driven by combat events the shared engine already emits.
- Remaining VFX-pass work (deferred): blight ambience in corrupted areas + water/foliage
  micro-motion.

### Part 3 — UI/UX polish: rich tooltips (2026-07-06)

#### Added

- **Tooltip system** (`client/ui/Tooltip.tsx`): a cursor-following card portalled to the body
  (escapes panel clipping), flipping to the left / clamping vertically near screen edges.
- **Item tooltips** (`ItemTooltipCard`): rarity-coloured name, a **colourblind-safe rarity
  label** (text, not just colour), slot, item level + required level, weapon dps, armor, primary
  stats, bonus crit, trinket effect, bind-on-equip, and value — plus a **vs-equipped
  comparison** block (`▲` green upgrade / `▼` red downgrade per stat, ilvl, dps, armor, crit)
  when hovering a bag or shop item. Wired into the Character sheet, Vendor, and Bank panels.
- **Skill tooltips** (`SkillTooltipCard`) on the hotbar: cost, cooldown, and the skill
  description, looked up from shared skill data.

#### Changed

- Replaced the plain native `title=` hover text across the Character/Vendor/Bank cells and the
  hotbar buttons with the rich tooltip.

### Part 2 — audio: music + basic SFX (2026-07-06)

#### Added

- **WebAudio layer** (`client/platform/audio.ts`, an `audio` singleton): a master-gain bus, a
  music bus, and an SFX bus. The master volume is wired live to the Settings slider
  (`App.tsx` syncs `store.masterVolume` → `audio.setMasterVolume`).
- **Music beds** — `loginscreen.mp3` loops on the title/character-select screens and `bgm.mp3`
  loops in-game (App switches on character entry). Tracks are user-supplied mp3s in
  `public/assets/audio/` (README added); a missing/undecodable file **plays silently** and never
  throws into the game loop. Autoplay policy is handled by unlocking the AudioContext on the
  first click/keypress and queuing the requested track; track changes cross-fade.
- **Synthesized SFX** (no asset files) for skill **cast**, enemy **defeat**, **level-up** (a
  three-note chime), and **quest complete** — short enveloped oscillator blips through the SFX
  bus. Wired at `CombatDirector.castSlot` / enemy-kill / level-up and `QuestDirector` quest
  completion.
- `assetManifest.AUDIO` holds the two track paths; the SFX have none.

#### Notes

- Scope deliberately simplified per direction: a single in-game bed (not per-zone/situation
  beds) and a compact procedural SFX set. No audio is downloaded or committed — the player
  supplies their own mp3s; SFX are generated in code.

### Part 1 — leveling-pace tuning (2026-07-06)

#### Changed

- **XP curve lowered** (`shared/combat/xp.ts`): `XP(L) = 250·L^1.55` (was `400·L^1.55`), so
  1→30 totals ~549k (was ~878k) — restoring the ~25–35 h pace flagged by Phase-4 acceptance #5 /
  GDD §15. Level derives from lifetime XP, so existing saves re-bucket cleanly.
- **Quest XP scaled ×2** at the grant + display edge (`QUEST_XP_SCALE` / `scaledQuestXp`): the
  authored reward data stays readable while the effective value is tuned in one shared place
  (used by `CombatDirector.grantReward` and the quest-reward summary). Quest XP now sums to
  ~245k — **~45% of the climb** (was ~4–14%), a quest-led economy matching GDD §5, with kills
  (`12 + 6·L`, unbounded) supplying the rest.

#### Tests

- Updated the progression curve assertions (anchor 250, ~549k to cap, level boundaries) and
  added an `acceptance-p4` quest-share assertion (quest XP is 35–55% of the 1→30 curve). **274
  total.** Docs: GDD §5 (curve + split) and §15 (the XP-split item marked addressed).

## [Phase 4 — Quests, Professions & the Long Game] — ✅ complete (2026-07-06)

Phase 4 is done: a full single-player content game — 111 quests (24 givers), all five
professions (gathering + crafting, skill 1→100, masteries, discovery), meta progression,
mounts, and the complete endgame loop (bounties, rares, boss uniques, masteries, world
boss). Acceptance #1–#4 pass; #5 (leveling pace), profession trainers/tools, and crafting
station-proximity are folded into Phase 5.

### Part 18 — crafting depth: fuller recipe book + recipe discovery (2026-07-06)

#### Added

- **A fuller recipe book (`shared/data/recipes`)** — ~13 new recipes to level 100: crystalium
  smelt; iron/silver/crystalium gear across weapon + armor slots; and greater/master health &
  mana potions plus greater might/warding elixirs and a capstone Elixir of Mastery (6 new
  consumables).
- **Recipe discovery (GDD §9)** — top-tier recipes carry `discovery: true` and are hidden until
  learned. `craft()` refuses an unknown discovery recipe, and on any craft in that profession at
  sufficient skill has a `DISCOVERY_CHANCE` to learn one (returned as `discovered`). The
  discovery roll happens **after** output/skill-up are computed, so all pre-existing craft
  results are byte-identical. `DISCOVERY_RECIPES` lists the learnable set.
- **Save v12** — `learnedRecipes: string[]` on the character; migration defaults it empty while
  preserving any saved ids. The client threads the learned set through the GatherDirector (craft
  passes it, discoveries are announced + persisted), and the craft panel hides unlearned
  discovery recipes.

#### Tests

- +7: discovery gate (unknown refused, learned crafts), the learn roll over many crafts, never
  above the crafter's skill, no sub-cap regression, reachability of every discovery recipe; plus
  a v11→v12 `learnedRecipes` migration + the round-trip fixture. **273 total.**

### Part 17 — the Grand Waystone world event (2026-07-06)

#### Added

- **Repeatable solo world-boss event, "Restore the Grand Waystone"** — closes the Endgame-loop
  deliverable. A Boss-rank **Grand Warden** (`bossGrandWarden`, `shared/data/enemies`): a warded,
  add-summoning stone construct at level 30, modelled on the crypt sentinel, with a bespoke Epic
  signature (**Grand Waystone Shard**, +4% crit).
- **`shared/data/worldEvent.ts`** — `WorldEventDef` + `GRAND_WAYSTONE_EVENT` + `worldEventForBoss`,
  tying the event's boss ↔ Deed ↔ site coords ↔ restoration text into one data source (exported
  from the data barrel).
- A **`grandWaystoneWarden` spawn region** in `WORLD_SPAWNS` (south of Waymeet on the crypt road,
  `count: 1`, ~7.5-min respawn) — the encounter reuses the ordinary spawn → loot → kill pipeline.
- A **Waystone-Restorer Deed** (`d_waystone_restorer`, new `worldEvent` metric, 4 Path Points).
- **`metaDirector.handleKill`**: on the world-event boss, feeds the `worldEvent` metric and the
  restoration announcement (mirrors the named-rare path).

#### Tests

- +6 in `worldEvent.test.ts`: the event's boss (Boss-rank), Deed (`worldEvent` metric), spawn
  region (at the event coords, count 1), and signature all resolve and stay in sync;
  `worldEventForBoss` resolves only the warden; exactly one Deed uses the metric. Updated the
  content test's boss count (5 Hollow bosses + the world boss = 6). **266 total.**

### Part 16 — profession masteries (2026-07-06)

#### Added

- **Skill-100 profession masteries** (`shared/data/professions` `MASTERIES` + `masteryFor` /
  `isMastered`): a permanent passive per profession, unlocked at the skill cap — Rich Veins
  (Mining: +1 ore per vein, 2× gem-shard chance), Nature's Bounty (Herbalism: +1 herb),
  Master Angler (Fishing: better big-catch + fish-oil odds), Efficient Smelting (Blacksmithing)
  and Potent Brews (Alchemy: 25% chance of a free extra stackable craft output).
- The bonuses are applied in the existing engine: `gatherNode` / `rollFish` (`shared/professions/skill`)
  and `craft` (`shared/professions/craft`) derive `skill >= SKILL_MAX` from their skill argument.
  No new save data and no signature change; because sub-cap paths draw no additional RNG, gather/
  fish/craft results below 100 are byte-identical to before.
- The Professions panel (**P**) shows each profession's mastery — dim "Mastery at 100: …" while
  locked, gold "★ Mastery: …" once earned — via a mastery/mastered rider on the professions slice.

#### Tests

- +6 in `masteries.test.ts`: every profession has a mastery and `isMastered` gates on the cap;
  mining/herbalism grant +1 over the same sub-cap roll; fishing lifts the fish-oil rate; crafting
  procs a bonus stackable output at the cap and never below it; equipment crafts never gain qty.
  **260 total.**

### Part 15 — Hollow boss signature loot (2026-07-06)

#### Added

- **Bespoke unique drops for all five Hollow bosses** (`shared/data/enemies` `BOSS_SIGNATURES`):
  Bramblegut's Wardknot, The Gloomheart, Prismscale Sigil, Forgewarden's Emberseal, and The
  Waymaker's Lantern. Each is a class-neutral Epic (Trinket/Amulet), binds on equip, carries a
  live flat `bonusCritChance` rider (+1.5% → +3.5% up the boss ladder), and drops ONLY from its
  boss at ~20% per kill — the endgame re-run chase.
- **`GeneratedItemSpec.signature`** (`shared/data/items`): a bespoke-unique rider handled by
  `generateItem` — the item keeps its class-flavored generated stats (always usable by the
  killer) but takes a fixed name, a `sig:` id, bind-on-equip, the crit rider, and a 1.5× vendor
  value. `buildEnemyLootTable`'s boss branch appends the signature drop.

#### Notes

- No client change: signature drops flow through the existing `rollLoot` → `CombatDirector.lootFrom`
  → bag path (which already passes the killer's class), and `bonusCritChance` is already consumed
  by combat and shown in the character tooltip.

#### Tests

- +4 in `bossLoot.test.ts`: every Hollow boss has a distinct signature (and only bosses do); the
  drop is a named, Epic, bind-on-equip unique with the crit rider and is equippable by the killer;
  it fires near its configured rate; and normal/elite tables never produce it. **254 total.**

### Part 14 — side-quest breadth: the ~110-quest budget (2026-07-06)

#### Added

- **`shared/data/quests/content` — 75 new side quests (36 → 111 total).** The zone
  side-quest arcs are filled out across all six zones and every level band 1→30, mixing
  kill / collect / explore / courier objectives with level-appropriate gold + gear rewards.
  None gate the main story.
- **10 new quest-givers (14 → 24).** Innkeep Mirabel & Houndmaster Pella (Vale), Sister
  Elowen & Ranger Ash (Weald), Miner Jossa & Quartermaster Vell (Foothills), Lampwright Ned
  & Pilgrim Asha (Peaks), Huscarl Bran (Trollmoor), Salt-Merchant Pryor (Coast). The
  client's `EntityManager` spawns them from `QUEST_GIVERS` automatically — no code change.
- **11 new `QUEST_DROP_TAGS`** (one per remaining enemy: boarHide, wolfPelt, stagAntler,
  heartwood, banditBrand, blackFletch, slimeCore, batWing, drakeScale, boneMeal, runeShard),
  so collect quests have real variety. The client emits them on kill with no change.
- **Tests** — +4 in `quests.test.ts`: the ~110 budget (≥ 100), every giver offers a quest,
  a per-band side-quest spread (≥ 6 optional quests in each 6-level band), and drop-tag
  integrity. **250 total.**

#### Verified

- `pnpm typecheck / lint / test (250) / build` clean. In-browser, a new giver (Innkeep
  Mirabel) spawns and nameplates at Brookhollow, confirming `QUEST_GIVERS` → world wiring.

### Part 13 — Settings & keybind remapping (2026-07-06)

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
