// Client combat orchestrator: runs the shared, authoritative combat simulation
// (shared/sim) in lockstep with the movement tick, renders enemy models, and
// publishes the combat HUD (player/target frames, hotbar, floaters, enemy HP
// nameplates) to the Zustand store. Input → intent → sim; nothing here decides
// combat outcomes — that all lives in shared/ and moves server-side in Phase 6.

import * as THREE from 'three';
import {
  type World,
  type CharacterClass,
  CLASS_INFO,
  createCombatState,
  createSpawner,
  stepSim,
  stepCombat,
  stepSpawner,
  applyIntent,
  drainEvents,
  makePlayerEntity,
  makeEnemyById,
  buildEnemyModel,
  enemyById,
  skillById,
  skillsKnownAt,
  levelProgressFromTotalXp,
  totalXpToReachLevel,
  xpToCompleteLevel,
  scaledQuestXp,
  baseStatsAtLevel,
  addStats,
  canEquip,
  rollLoot,
  buildEnemyLootTable,
  generateItem,
  applyHeal,
  WORLD_SPAWNS,
  EquipSlot,
  RING_SLOTS,
  nearestWaystone,
  nearestActivated,
  waystoneById,
  travelFee,
  vendorStock,
  sellPrice,
  SETTLEMENT_TIER,
  DEFAULT_VENDOR_TIER,
  SETTLEMENTS,
  isAlive,
  inCombat,
  type CombatState,
  type SpawnerState,
  type SpawnRegion,
  type CombatEntity,
  type CombatEvent,
  type SkillDef,
  type StatBlock,
  type ItemDef,
  type ItemStackSave,
  type VendorStockItem,
  type GeneratedItemSpec,
  type QuestReward,
  type ConsumableEffect,
  type Intent,
  type NetCombatEvent,
  type NetEntity,
  type NetCombatSelf,
  type ServerKill,
} from '@pathlands/shared';
import { ModelObject } from '../engine/voxelModel.js';
import { audio } from '../platform/audio.js';
import { Vfx, SCHOOL_COLOR } from '../engine/vfx.js';
import { HOLLOWS } from '@pathlands/shared';
import {
  useStore,
  type CombatUi,
  type Floater,
  type HotbarSlot,
  type InventoryUi,
  type Nameplate,
  type WaystoneUi,
} from './store.js';

const PLAYER_ID = 'player';
const START_LEVEL = 6;
const DYING_SECONDS = 1.2;
const PICK_SCREEN_RADIUS = 0.22; // NDC distance for crosshair target picking
const BAG_SIZE = 24;

const WAYSTONE_RANGE = 7; // metres to attune / use a Waystone
// A spawn region is live only while the player is within (radius + margin); enemies
// whose spawn point drifts past DESPAWN_RADIUS are culled. DESPAWN must exceed
// 2·maxRegionRadius + margin so an active region's mobs are never wrongly culled.
const ACTIVATE_MARGIN = 80;
const DESPAWN_RADIUS = 170;
const BUYBACK_MAX = 12;

/** Progression a character carries into the world (from the save). */
export interface Progression {
  level: number;
  xp: number;
  gold: number;
  inventory: ItemStackSave[];
  equipment: Record<string, ItemDef>;
  discoveredWaystones: string[];
}

interface RenderEnemy {
  obj: ModelObject;
  prevX: number;
  prevZ: number;
  prevYaw: number;
  curX: number;
  curZ: number;
  curYaw: number;
}

interface Dying {
  obj: ModelObject;
  age: number;
}

interface WorldFloater {
  id: number;
  wx: number;
  wy: number;
  wz: number;
  text: string;
  kind: Floater['kind'];
  age: number;
}

export class CombatDirector {
  private readonly scene: THREE.Scene;
  private readonly vfx: Vfx;
  private readonly world: World;
  private readonly respawnAt: (x: number, z: number) => void;
  private readonly spawnX: number;
  private readonly spawnZ: number;

  private state: CombatState;
  private spawner: SpawnerState;
  private readonly regions: SpawnRegion[];
  private cls: CharacterClass;
  private level: number;
  private totalXp: number;
  /**
   * Last server-reported total XP (networked mode). We adopt the server's XP as *deltas* off
   * this baseline, not by absolute comparison — the server only knows kill XP, while our
   * `totalXp` also carries client-side quest / Waystone XP, so a max-gate would drop kills once
   * our total ran ahead. `null` until the first combat-self frame of a session (re-baselined on
   * any disconnect so a reconnect can't manufacture a bogus delta).
   */
  private lastServerXp: number | null = null;
  private gold: number;
  private inventory: ItemStackSave[];
  private equipment: Record<string, ItemDef>;
  private discovered: Set<string>;
  /** The merchant the player is currently trading with (null = no vendor open). */
  private activeVendor: { name: string; stock: VendorStockItem[] } | null = null;
  /** Recently sold stacks, buyable back at the sold price (most-recent first). */
  private buyback: Array<{ item: ItemDef; qty: number; price: number }> = [];

  /** Quest hooks (set by the game): fired when the player kills an enemy / uses a Waystone. */
  onEnemyKilled?: (enemyId: string) => void;
  onWaystoneUsed?: (waystoneId: string) => void;
  /** Meta hook: fired only when a Waystone is newly attuned (Deed progress). */
  onWaystoneAttuned?: (waystoneId: string) => void;

  /** Path-perk effects (set by the meta director): extra bag slots + travel-fee cut. */
  private bagBonus = 0;
  private travelFeeMult = 1;

  private readonly renders = new Map<string, RenderEnemy>();
  private dying: Dying[] = [];
  private worldFloaters: WorldFloater[] = [];
  private floaterId = 1;
  /** Server-reported cast progress of each mirrored enemy (Stage 2d) — the target-frame cast
   * bar reads this, since the mirrored enemy's synthetic `cast` has no meaningful endTick. */
  private readonly serverCastFrac = new Map<string, number>();

  private readonly ctx: { heightAt: (x: number, z: number) => number };
  private readonly tmp = new THREE.Vector3();
  private hudTimer = 0;
  private blightTimer = 0;

  /**
   * MMO mode (Stage 2b). When set, enemies come from the SERVER (mirrored into the local
   * state as passive targets) and the player's own combat state is reconciled from the
   * server; combat intents are forwarded to it. The local combat sim still ticks the
   * player's cooldowns/resource for a responsive hotbar (prediction), but the server is
   * authoritative — it owns enemy AI/HP, damage, death, XP, and loot.
   */
  private netSink: {
    enemies: () => NetEntity[];
    combatSelf: () => NetCombatSelf | null;
    drainKills: () => ServerKill[];
    drainFx: () => NetCombatEvent[];
    /** Item stacks granted to us by the server (a ground-item pickup) to add to the bag. */
    drainGrants: () => ItemStackSave[];
    send: (intent: Intent) => void;
  } | null = null;

  /** Wire the director to the network (called once when the game connects). */
  setNetSink(sink: CombatDirector['netSink']): void {
    this.netSink = sink;
  }

  private get networked(): boolean {
    return this.netSink !== null;
  }

  constructor(
    scene: THREE.Scene,
    world: World,
    cls: CharacterClass,
    spawnX: number,
    spawnZ: number,
    respawnAt: (x: number, z: number) => void,
    progression?: Progression,
  ) {
    this.scene = scene;
    this.vfx = new Vfx(scene);
    this.world = world;
    this.cls = cls;
    this.level = Math.max(1, progression?.level ?? START_LEVEL);
    this.totalXp = progression?.xp ?? totalXpToReachLevel(this.level);
    this.gold = progression?.gold ?? 0;
    this.inventory = progression?.inventory ? [...progression.inventory] : [];
    this.equipment = progression?.equipment ? { ...progression.equipment } : {};
    this.discovered = new Set(progression?.discoveredWaystones ?? []);
    this.spawnX = spawnX;
    this.spawnZ = spawnZ;
    this.respawnAt = respawnAt;
    this.ctx = { heightAt: (x, z) => world.heightAt(Math.floor(x), Math.floor(z)) };

    this.state = createCombatState(world.seed);
    this.spawner = createSpawner(world.seed);
    // The full world spawn table (zones + Hollow packs + bosses); only regions near
    // the player are stepped each tick (see simTick).
    this.regions = [...WORLD_SPAWNS];

    this.state.entities.set(PLAYER_ID, this.makePlayer(spawnX, spawnZ));
  }

  /** Sum equipped items into a stat block + armor/crit (fed to deriveCombatStats). */
  private equipDerived(): { gear: StatBlock; armor: number; crit: number } {
    const items = Object.values(this.equipment);
    const gear = addStats(...items.map((i) => i.stats));
    let armor = 0;
    let crit = 0;
    for (const i of items) {
      armor += i.armor ?? 0;
      crit += i.bonusCritChance ?? 0;
    }
    return { gear, armor, crit };
  }

  private makePlayer(x: number, z: number): CombatEntity {
    const y = this.world.heightAt(Math.floor(x), Math.floor(z));
    const { gear, armor, crit } = this.equipDerived();
    const weaponIlvl = this.equipment[EquipSlot.MainHand]?.ilvl ?? this.level;
    const e = makePlayerEntity(
      PLAYER_ID,
      CLASS_INFO[this.cls].name,
      this.cls,
      this.level,
      x,
      y,
      z,
      gear,
      { armor, bonusCritChance: crit },
      weaponIlvl,
    );
    return e;
  }

  private get player(): CombatEntity {
    return this.state.entities.get(PLAYER_ID)!;
  }

  /** Live progression for autosave (level derives from totalXp). */
  get characterLevel(): number {
    return this.level;
  }
  get characterXp(): number {
    return this.totalXp;
  }
  get characterGold(): number {
    return this.gold;
  }
  get playerClass(): CharacterClass {
    return this.cls;
  }
  get characterInventory(): ItemStackSave[] {
    // Return a copy so the save never embeds a live, still-mutating reference.
    return this.inventory.map((s) => ({ item: s.item, qty: s.qty }));
  }
  get characterEquipment(): Record<string, ItemDef> {
    return { ...this.equipment };
  }
  get characterWaystones(): string[] {
    return [...this.discovered];
  }

  /** True while the player is flagged in combat (drives mount dismount rules). */
  isInCombat(): boolean {
    return inCombat(this.player, this.state.tick);
  }

  /** Whether the player is dead (awaiting respawn). Used to freeze own movement so a corpse
   * can't walk — matching the server's authoritative freeze, so prediction never fights it. */
  isPlayerDead(): boolean {
    return this.player.dead;
  }

  /** Progress 0..1 of the target's cast bar. A mirrored server enemy carries the server's frac
   * (its synthetic `cast` has no real endTick); a local single-player cast is computed from its
   * own endTick. */
  private targetCastFrac(targetEnt: CombatEntity): number {
    if (targetEnt.cast === null) return 0;
    const server = this.serverCastFrac.get(targetEnt.id);
    if (server !== undefined) return Math.max(0, Math.min(1, server));
    const skill = skillById(targetEnt.cast.skillId);
    if (skill === undefined || skill.castTicks <= 0) return 0;
    const remaining = targetEnt.cast.endTick - this.state.tick;
    return Math.max(0, Math.min(1, 1 - remaining / skill.castTicks));
  }

  /** Debit gold if affordable (mount purchase). Returns whether it was paid. */
  spendGold(amount: number): boolean {
    if (amount < 0 || this.gold < amount) return false;
    this.gold -= amount;
    return true;
  }

  /** Current bag capacity (base + Deep Pockets perk bonus). */
  private bagCap(): number {
    return BAG_SIZE + this.bagBonus;
  }

  /** Apply Path perks: `bagBonus` extra slots, `travelCut` fraction off travel fees. */
  setPerks(bagBonus: number, travelCut: number): void {
    this.bagBonus = Math.max(0, Math.round(bagBonus));
    this.travelFeeMult = Math.max(0, 1 - travelCut);
  }

  setClass(cls: CharacterClass): void {
    if (cls === this.cls) return;
    this.cls = cls;
    // A class change sheds gear the new class can't use — but only when the bag
    // has room, so items are never silently destroyed.
    for (const [slot, item] of Object.entries(this.equipment)) {
      if (!canEquip(cls, this.level, item) && this.inventory.length < this.bagCap()) {
        delete this.equipment[slot];
        this.inventory.push({ item, qty: 1 });
      }
    }
    this.state.entities.set(PLAYER_ID, this.makePlayer(this.player.x, this.player.z));
  }

  /**
   * Rebuild the player entity after a gear change, preserving HP%/resource and all
   * live combat state (cooldowns, GCD, auras, in-progress cast, threat, combat
   * timers). Without this, equip-swapping would reset cooldowns and strip DoTs.
   */
  private rebuildPlayer(): void {
    const cur = this.player;
    const hpFrac = cur.hp / cur.maxHP;
    const resFrac = cur.maxResource > 0 ? cur.resource / cur.maxResource : 0;
    const next = this.makePlayer(cur.x, cur.z);
    next.y = cur.y;
    next.yaw = cur.yaw;
    next.hp = Math.max(1, Math.round(next.maxHP * hpFrac));
    next.resource = Math.round(next.maxResource * resFrac);
    next.targetId = cur.targetId;
    next.autoAttack = cur.autoAttack;
    next.dead = cur.dead;
    next.cooldowns = cur.cooldowns;
    next.gcdReadyTick = cur.gcdReadyTick;
    next.autoReadyTick = cur.autoReadyTick;
    next.auras = cur.auras;
    next.cast = cur.cast;
    next.threat = cur.threat;
    next.inCombatUntil = cur.inCombatUntil;
    next.stance = cur.stance;
    this.state.entities.set(PLAYER_ID, next);
  }

  /** Equip the inventory item at `index` (rings auto-pick a free finger). */
  equipItem(index: number): void {
    const stack = this.inventory[index];
    if (!stack) return;
    const item = stack.item;
    if (!canEquip(this.cls, this.level, item)) {
      this.pushFloater(this.player, 'Cannot equip', 'miss');
      return;
    }
    let slot: string = item.slot;
    if (slot === EquipSlot.Ring1 || slot === EquipSlot.Ring2) {
      slot = RING_SLOTS.find((s) => !this.equipment[s]) ?? EquipSlot.Ring1;
    }
    const prev = this.equipment[slot];
    this.equipment[slot] = item;
    // Consume one from the stack (equipment is single items).
    if (stack.qty > 1) stack.qty -= 1;
    else this.inventory.splice(index, 1);
    if (prev) this.inventory.push({ item: prev, qty: 1 });
    this.rebuildPlayer();
  }

  /** Unequip the item in `slot` back to the bag. */
  unequipItem(slot: string): void {
    const item = this.equipment[slot];
    if (!item) return;
    if (this.inventory.length >= this.bagCap()) {
      this.pushFloater(this.player, 'Bag full', 'miss');
      return;
    }
    delete this.equipment[slot];
    this.inventory.push({ item, qty: 1 });
    this.rebuildPlayer();
  }

  /** Sell the inventory item at `index` for a quarter of its value (GDD §6). */
  sellItem(index: number): void {
    const stack = this.inventory[index];
    if (!stack) return;
    const price = sellPrice(stack.item, stack.qty);
    this.gold += price;
    this.inventory.splice(index, 1);
    // Remember the sale so the player can buy it back at the same price.
    this.buyback.unshift({ item: stack.item, qty: stack.qty, price });
    if (this.buyback.length > BUYBACK_MAX) this.buyback.pop();
  }

  /** Open the merchant's shop: build its stock from settlement tier + its seed. */
  openVendor(name: string, seed: number, x: number, z: number): void {
    // Wares scale with the nearest settlement's zone tier (WORLD.md bands).
    let best = DEFAULT_VENDOR_TIER;
    let bestD = Infinity;
    for (const s of SETTLEMENTS) {
      const d = (s.cx - x) * (s.cx - x) + (s.cz - z) * (s.cz - z);
      if (d < bestD) {
        bestD = d;
        best = SETTLEMENT_TIER[s.id] ?? DEFAULT_VENDOR_TIER;
      }
    }
    this.activeVendor = { name, stock: vendorStock(seed, best) };
    this.publishVendor();
  }

  /** Buy the vendor stock item at `index` (stock is unlimited, like a town vendor). */
  buyItem(index: number): void {
    if (!this.activeVendor) return;
    const entry = this.activeVendor.stock[index];
    if (!entry) return;
    if (this.inventory.length >= this.bagCap()) {
      this.pushFloater(this.player, 'Bag full', 'miss');
      return;
    }
    if (this.gold < entry.price) {
      this.pushFloater(this.player, 'Not enough gold', 'miss');
      return;
    }
    this.gold -= entry.price;
    this.inventory.push({ item: entry.item, qty: 1 });
    this.publishVendor();
  }

  /** Buy back a previously-sold stack at `index` for the price it was sold for. */
  buybackItem(index: number): void {
    const entry = this.buyback[index];
    if (!entry) return;
    if (this.inventory.length >= this.bagCap()) {
      this.pushFloater(this.player, 'Bag full', 'miss');
      return;
    }
    if (this.gold < entry.price) {
      this.pushFloater(this.player, 'Not enough gold', 'miss');
      return;
    }
    this.gold -= entry.price;
    this.inventory.push({ item: entry.item, qty: entry.qty });
    this.buyback.splice(index, 1);
    this.publishVendor();
  }

  /** Close the shop (clears the vendor UI slice). */
  closeVendor(): void {
    this.activeVendor = null;
    useStore.getState().setVendor(null);
  }

  /** Push the current vendor stock + buyback list to the store. */
  private publishVendor(): void {
    if (!this.activeVendor) {
      useStore.getState().setVendor(null);
      return;
    }
    useStore.getState().setVendor({
      name: this.activeVendor.name,
      stock: this.activeVendor.stock.map((s) => ({ item: s.item, price: s.price })),
      buyback: this.buyback.map((b) => ({ item: b.item, price: b.price })),
    });
  }

  /** The skills mapped to hotbar slots (learn order, up to 10). */
  private hotbarSkills(): SkillDef[] {
    return skillsKnownAt(this.cls, this.level).slice(0, 10);
  }

  /** Set the VFX particle-density multiplier (graphics setting). */
  setVfxDensity(mult: number): void {
    this.vfx.setDensity(mult);
  }

  // --- input intents ---------------------------------------------------------

  castSlot(slot: number): void {
    const skills = this.hotbarSkills();
    const skill = skills[slot];
    if (!skill) return;
    const p0 = this.player;
    const intent: Intent = {
      type: 'CastSkill',
      skillId: skill.id,
      ...(p0.targetId !== null ? { targetId: p0.targetId } : {}),
    };
    applyIntent(this.state, PLAYER_ID, intent); // local prediction (cooldown/resource/feedback)
    this.netSink?.send(intent); // server is authoritative
    audio.sfx('cast');
    // Cast flash at the caster, tinted by the skill's damage school.
    const school = skill.effects.find((e) => 'school' in e)?.school ?? 'physical';
    const p = this.player;
    this.vfx.burst(p.x, p.y + 1.1, p.z, {
      count: 12,
      color: SCHOOL_COLOR[school] ?? SCHOOL_COLOR.physical!,
      speed: 2,
      up: 1.4,
      life: 0.45,
      size: 0.2,
      gravity: -1.5,
      spread: 0.3,
    });
  }

  toggleAutoAttack(): void {
    const p = this.player;
    const intent: Intent = { type: 'ToggleAutoAttack', on: !p.autoAttack };
    applyIntent(this.state, PLAYER_ID, intent);
    this.netSink?.send(intent);
  }

  /** Set the player's target (locally + on the server). */
  private setTarget(targetId: string): void {
    const intent: Intent = { type: 'SetTarget', targetId };
    applyIntent(this.state, PLAYER_ID, intent);
    this.netSink?.send(intent);
  }

  cycleTarget(): void {
    const p = this.player;
    const foes = [...this.state.entities.values()]
      .filter((e) => e.faction === 'enemy' && isAlive(e))
      .sort((a, b) => this.dist(p, a) - this.dist(p, b));
    if (foes.length === 0) return;
    const idx = foes.findIndex((e) => e.id === p.targetId);
    this.setTarget(foes[(idx + 1) % foes.length]!.id);
  }

  /** Pick the enemy nearest the screen crosshair (camera centre). */
  pickTarget(camera: THREE.PerspectiveCamera): void {
    let best: string | null = null;
    let bestD = PICK_SCREEN_RADIUS;
    for (const e of this.state.entities.values()) {
      if (e.faction !== 'enemy' || !isAlive(e)) continue;
      this.tmp.set(e.x, e.y + 1, e.z).project(camera);
      if (this.tmp.z > 1) continue;
      const d = Math.hypot(this.tmp.x, this.tmp.y);
      if (d < bestD) {
        bestD = d;
        best = e.id;
      }
    }
    if (best !== null) this.setTarget(best);
  }

  releaseSpirit(): void {
    const p = this.player;
    if (!p.dead) return;
    if (this.networked) {
      // The server owns death + respawn: after the release delay it revives us at the nearest
      // Waystone and teleports our physics there (Stage 2c-4); our position reconciles as a snap
      // and combatSelf flips us back to alive. Just forward the release.
      this.netSink?.send({ type: 'ReleaseSpirit' });
      return;
    }
    // Respawn at the nearest activated Waystone, else the starting plaza (GDD §7).
    const ws = nearestActivated(p.x, p.z, this.discovered);
    const rx = ws ? ws.x : this.spawnX;
    const rz = ws ? ws.z : this.spawnZ;
    this.respawnAt(rx, rz);
    const fresh = this.makePlayer(rx, rz);
    this.state.entities.set(PLAYER_ID, fresh);
  }

  /** The Waystone within reach of the player, or null (for the interact prompt). */
  private nearbyWaystone(): ReturnType<typeof nearestWaystone> {
    const p = this.player;
    return nearestWaystone(p.x, p.z, WAYSTONE_RANGE);
  }

  /**
   * Attune to a nearby Waystone if new (discovery XP), then open the travel list.
   * Returns true if a Waystone was in reach.
   */
  interactWaystone(): boolean {
    const ws = this.nearbyWaystone();
    if (!ws) return false;
    if (!this.discovered.has(ws.id)) {
      this.discovered.add(ws.id);
      const bonus = Math.round(xpToCompleteLevel(this.level) * 0.05);
      this.totalXp += bonus;
      this.pushFloater(this.player, `Waystone attuned! +${bonus} XP`, 'xp');
      this.relevelIfNeeded();
      this.onWaystoneAttuned?.(ws.id); // Deed progress (new attunes only)
      // Attunement: a column of Waystone-blue light rises from the stone.
      this.vfx.burst(this.player.x, this.player.y + 0.5, this.player.z, {
        count: 40,
        color: [0.45, 0.75, 1.0],
        speed: 1.4,
        up: 4.5,
        life: 1.3,
        size: 0.3,
        gravity: -3,
        spread: 0.5,
      });
    }
    this.onWaystoneUsed?.(ws.id); // quest `use` objectives fire even if re-visited
    useStore.getState().openTravel();
    return true;
  }

  /** Pay the fee and teleport to a discovered Waystone (must stand at one). */
  travelTo(id: string): void {
    const from = this.nearbyWaystone();
    const to = waystoneById(id);
    if (!from || !to || from.id === to.id) return;
    if (!this.discovered.has(id)) return;
    const fee = Math.round(travelFee(from, to, this.level) * this.travelFeeMult);
    if (this.gold < fee) {
      this.pushFloater(this.player, 'Not enough gold', 'miss');
      return;
    }
    this.gold -= fee;
    this.respawnAt(to.x, to.z);
    const p = this.player;
    p.x = to.x;
    p.z = to.z;
  }

  /** Add XP (floater optional) and level up if a threshold was crossed. */
  private gainXp(amount: number, floater = true): void {
    if (amount <= 0) return;
    this.totalXp += amount;
    if (floater) this.pushFloater(this.player, `+${amount} XP`, 'xp');
    this.relevelIfNeeded();
  }

  /** Grant a completed quest's reward: XP, gold, fixed + chosen items, Waystone. */
  grantReward(reward: QuestReward, choiceIndex: number): void {
    // Quest XP is scaled by the §5 pace tuning (QUEST_XP_SCALE) so quests lead the climb.
    this.gainXp(scaledQuestXp(reward.xp));
    if (reward.gold) {
      this.gold += reward.gold;
      this.pushFloater(this.player, `+${reward.gold}c`, 'xp');
    }
    for (const s of reward.items ?? []) this.awardItem(s);
    if (reward.choices && reward.choices.length > 0) {
      const pick = reward.choices[Math.max(0, Math.min(choiceIndex, reward.choices.length - 1))];
      if (pick) this.awardItem(pick);
    }
    if (reward.waystoneUnlock) this.discovered.add(reward.waystoneUnlock);
  }

  /** Forge a crafted item for the player's class into the bag. Returns success. */
  craftGear(s: GeneratedItemSpec): boolean {
    if (this.inventory.length >= this.bagCap()) {
      this.pushFloater(this.player, 'Bag full', 'miss');
      return false;
    }
    const item = generateItem(this.state.rng, { ...s, forClass: this.cls });
    this.inventory.push({ item, qty: 1 });
    this.pushFloater(this.player, `Crafted ${item.name}`, 'heal');
    return true;
  }

  /** Drink a consumable: restore HP/resource or apply a timed buff to the player. */
  applyConsumable(effect: ConsumableEffect): void {
    const p = this.player;
    if (p.dead) return;
    if (effect.kind === 'heal') {
      applyHeal(this.state, p, p, effect.amount, 'potion');
    } else if (effect.kind === 'resource') {
      p.resource = Math.min(p.maxResource, p.resource + effect.amount);
      this.pushFloater(p, `+${effect.amount}`, 'heal');
    } else {
      // Timed stat/combat buff via the aura system (refreshes a same-effect buff).
      const existing = p.auras.find(
        (a) => a.skillId === 'elixir' && a.modifier === effect.modifier,
      );
      const aura = {
        uid: `elixir_${effect.modifier}`,
        sourceId: p.id,
        skillId: 'elixir',
        kind: 'buff' as const,
        modifier: effect.modifier,
        magnitude: effect.magnitude,
        expiresTick: this.state.tick + effect.durationTicks,
      };
      if (existing) Object.assign(existing, aura);
      else p.auras.push(aura);
      this.pushFloater(p, effect.label, 'xp');
    }
  }

  /** Generate a reward item for the player's class and drop it in the bag. */
  private awardItem(s: GeneratedItemSpec): void {
    if (this.inventory.length >= this.bagCap()) {
      this.pushFloater(this.player, 'Bag full', 'miss');
      return;
    }
    const item = generateItem(this.state.rng, { ...s, forClass: this.cls });
    this.inventory.push({ item, qty: 1 });
    this.pushFloater(this.player, item.name, 'heal');
  }

  /** Level up the player if accumulated XP crossed a threshold (shared with kills). */
  private relevelIfNeeded(): void {
    const prog = levelProgressFromTotalXp(this.totalXp);
    if (prog.level <= this.level) return;
    this.level = prog.level;
    audio.sfx('levelup');
    // Level-up: a golden fountain rising off the player.
    const lp = this.player;
    this.vfx.burst(lp.x, lp.y + 0.4, lp.z, {
      count: 46,
      color: [1.0, 0.85, 0.35],
      speed: 2.5,
      up: 5,
      life: 1.1,
      size: 0.26,
      gravity: -5,
      spread: 0.3,
    });
    const cur = this.player;
    const leveled = this.makePlayer(cur.x, cur.z);
    leveled.targetId = cur.targetId;
    leveled.autoAttack = cur.autoAttack;
    this.state.entities.set(PLAYER_ID, leveled);
    this.pushFloater(leveled, `Level ${this.level}!`, 'xp');
  }

  private dist(a: CombatEntity, b: CombatEntity): number {
    return Math.hypot(a.x - b.x, a.z - b.z);
  }

  // --- simulation tick -------------------------------------------------------

  /** One fixed sim tick, in lockstep with the movement tick. */
  simTick(px: number, py: number, pz: number, yaw: number): void {
    const p = this.player;
    if (!p.dead) {
      p.x = px;
      p.y = py;
      p.z = pz;
      p.yaw = yaw;
    }

    // Shift interpolation history before the sim moves entities.
    for (const [id, r] of this.renders) {
      const e = this.state.entities.get(id);
      if (e) {
        r.prevX = e.x;
        r.prevZ = e.z;
        r.prevYaw = e.yaw;
      }
    }

    if (this.networked) {
      // MMO mode: the server owns enemies + combat outcomes. Mirror the server's enemies in
      // (as passive targets), then tick ONLY combat resolution (stepCombat — no enemy AI, so
      // the leash/aggro paths can't corrupt a mirrored enemy) for the player's own prediction
      // (cooldowns, resource, cast/auto feedback). The player's predicted damage CAN drive a
      // mirrored enemy's HP to 0 and null the target, so we re-assert the server's truth right
      // after and restore a target the prediction dropped — enemy HP + death are the server's,
      // never the client's. Finally reconcile our own authoritative health/resource.
      this.mirrorServerEnemies();
      const prevTarget = this.player.targetId;
      stepCombat(this.state, this.ctx);
      this.consumeEvents();
      this.mirrorServerEnemies(); // undo any predicted damage/kill — server HP is the truth
      const p2 = this.player;
      if (
        p2.targetId === null &&
        prevTarget !== null &&
        this.state.entities.get(prevTarget) !== undefined
      ) {
        p2.targetId = prevTarget; // a predicted kill nulled the target; the server still has it
      }
      this.reconcileFromServer();
      this.applyServerKills();
      this.applyServerGrants();
      if (this.netSink !== null) this.renderServerFx(this.netSink.drainFx());
      return;
    }

    stepSim(this.state, this.ctx);
    // Consume events (incl. loot on death) BEFORE the spawner reaps corpses, so a
    // freshly-killed enemy is still in the state when we roll its loot table.
    this.consumeEvents();
    // Only populate regions near the player; cull enemies (incl. boss adds) whose
    // spawn point has drifted out of range so the world stays local and cheap.
    const px2 = p.x;
    const pz2 = p.z;
    for (const region of this.regions) {
      const dc = Math.hypot(px2 - region.cx, pz2 - region.cz);
      if (dc <= region.radius + ACTIVATE_MARGIN) {
        stepSpawner(this.state, this.spawner, region, this.ctx);
      }
    }
    this.despawnDistant(px2, pz2);
  }

  /**
   * Upsert the server's enemies into the local state as PASSIVE targets (server owns their
   * AI/HP), and drop any the server no longer reports. Their position/facing/hp/anim-state
   * are the server's truth; local auto-attack/aggro/abilities are stripped so the client
   * never simulates them attacking.
   */
  private mirrorServerEnemies(): void {
    const sink = this.netSink;
    if (sink === null) return;
    const seen = new Set<string>();
    for (const ne of sink.enemies()) {
      let e = this.state.entities.get(ne.id);
      if (e === undefined || e.faction !== 'enemy' || e.enemyId !== ne.enemyId) {
        const made = makeEnemyById(ne.id, ne.enemyId, ne.level, ne.x, ne.y, ne.z);
        if (made === null) continue; // unknown enemyId — leave any stale one for the cleanup
        e = made;
        this.state.entities.set(ne.id, e);
      }
      seen.add(ne.id); // only keep ids we actually hold (so cleanup can drop stale mismatches)
      e.x = ne.x;
      e.y = ne.y;
      e.z = ne.z;
      e.yaw = ne.yaw;
      e.hp = ne.hp;
      e.maxHP = ne.maxHP;
      e.dead = false;
      e.aiState = (ne.state as CombatEntity['aiState']) ?? 'idle';
      // Passive locally — the server drives all enemy behaviour. We use stepCombat (no enemy
      // AI) so nothing here moves them; zeroing aggro/auto/abilities and clearing the boss
      // cursor keeps the resolver from making them act, and pinning the leash home makes any
      // stray AI a no-op. Their rendered position/HP is purely the server's truth.
      e.autoAttack = false;
      e.aggroRadius = 0;
      e.abilities = [];
      e.threat = {};
      e.spawnX = ne.x;
      e.spawnZ = ne.z;
      e.bossPhaseIdx = undefined;
      // Mirror the server's cast (Stage 2d): a synthetic `cast` (endTick far in the future so
      // the local stepCombat never RESOLVES it — the server owns that) drives the wind-up
      // animation + the target-frame cast bar's skill name; the progress rides serverCastFrac.
      if (ne.castSkill !== null) {
        e.cast = { skillId: ne.castSkill, targetId: null, endTick: this.state.tick + 1_000_000 };
        this.serverCastFrac.set(ne.id, ne.castFrac);
      } else {
        e.cast = null;
        this.serverCastFrac.delete(ne.id);
      }
    }
    for (const [id, e] of this.state.entities) {
      if (e.faction === 'enemy' && !seen.has(id)) {
        this.state.entities.delete(id);
        this.serverCastFrac.delete(id);
      }
    }
  }

  /** Overwrite our own health/resource/alive-state + XP with the server's authoritative combat-self. */
  private reconcileFromServer(): void {
    const cs = this.netSink?.combatSelf();
    if (cs === undefined || cs === null) {
      // No live combat-self (not yet connected, or dropped): re-baseline so the next session's
      // first frame is treated as a fresh baseline, never a delta off a stale total.
      this.lastServerXp = null;
      return;
    }
    const p = this.player;
    p.hp = cs.hp;
    p.maxHP = cs.maxHP;
    p.resource = cs.resource;
    p.maxResource = cs.maxResource;
    p.dead = cs.dead;
    this.adoptServerXp(cs.totalXp);
    // A target the server dropped, or one that has despawned, clears the target frame.
    if (p.targetId !== null && this.state.entities.get(p.targetId) === undefined) {
      p.targetId = null;
    }
  }

  /**
   * Adopt server-authoritative kill XP without dropping our client-side quest / Waystone XP.
   *
   * The server only awards + replicates *kill* XP; our `totalXp` is the full total (kills +
   * quests + Waystone attunements). So we adopt the server's value as a **delta** off the last
   * frame — the increment since the previous frame is exactly the kill XP the server just
   * granted — and add that to our (larger) total. The first frame of a session only sets the
   * baseline (silently taking the server's stored total if it happens to lead ours — kills a
   * crash lost before our last autosave — but without replaying a level-up presentation for
   * prior-session XP).
   */
  private adoptServerXp(serverXp: number): void {
    if (this.lastServerXp === null) {
      if (serverXp > this.totalXp) {
        this.totalXp = serverXp;
        this.level = levelProgressFromTotalXp(this.totalXp).level; // silent — no login fountain
      }
    } else if (serverXp > this.lastServerXp) {
      this.totalXp += serverXp - this.lastServerXp;
      this.relevelIfNeeded();
    }
    this.lastServerXp = serverXp;
  }

  /** Remove enemies whose home (spawn) point is beyond DESPAWN_RADIUS of the player. */
  private despawnDistant(px: number, pz: number): void {
    for (const [id, e] of this.state.entities) {
      if (e.faction !== 'enemy') continue;
      const hx = e.spawnX ?? e.x;
      const hz = e.spawnZ ?? e.z;
      if (Math.hypot(px - hx, pz - hz) > DESPAWN_RADIUS) this.state.entities.delete(id);
    }
  }

  private consumeEvents(): void {
    for (const ev of drainEvents(this.state)) {
      this.onEvent(ev);
    }
  }

  private onEvent(ev: CombatEvent): void {
    if (ev.type === 'damage' || ev.type === 'heal') {
      const target = this.state.entities.get(ev.targetId);
      if (!target) return;
      const kind = ev.type === 'heal' ? 'heal' : ev.crit ? 'crit' : 'damage';
      const text = ev.amount <= 0 && ev.type === 'damage' ? 'absorb' : String(ev.amount);
      this.pushFloater(target, text, kind);
      // Hit sparks: a small burst at the struck body (green for heals, gold on crit).
      if (ev.type === 'heal') {
        this.vfx.burst(target.x, target.y + 1.0, target.z, {
          count: 8,
          color: [0.4, 1.0, 0.5],
          speed: 1.6,
          up: 1.2,
          life: 0.5,
          size: 0.16,
          gravity: -1,
        });
      } else if (ev.amount > 0) {
        this.vfx.burst(target.x, target.y + 1.0, target.z, {
          count: ev.crit ? 14 : 8,
          color: ev.crit ? [1.0, 0.85, 0.3] : [1.0, 0.5, 0.35],
          speed: ev.crit ? 4 : 3,
          life: 0.4,
          size: ev.crit ? 0.2 : 0.14,
        });
      }
    } else if (ev.type === 'xp') {
      // MMO: XP / loot / death are the SERVER's authority (Stage 2c). Locally we only show
      // the predicted damage/heal floaters above; the enemy despawns when the server drops it.
      if (!this.networked) this.gainXp(ev.amount);
    } else if (ev.type === 'death') {
      if (this.networked) return;
      const victim = this.state.entities.get(ev.entityId);
      if (victim) {
        this.vfx.burst(victim.x, victim.y + 0.9, victim.z, {
          count: 20,
          color: [0.55, 0.55, 0.6],
          speed: 2.6,
          up: 1,
          life: 0.7,
          size: 0.22,
          gravity: -3,
        });
      }
      this.lootFrom(ev.entityId, ev.killerId);
    } else if (ev.type === 'bossPhase') {
      const boss = this.state.entities.get(ev.entityId);
      if (boss) this.pushFloater(boss, ev.say, 'crit');
    }
  }

  /** Roll a slain enemy's loot table into the player's gold + bag (GDD §6). Single-player: the
   * client both rolls AND applies. In MMO mode the death handler is suppressed and the server's
   * rolled loot arrives via `applyServerKills` instead — but the apply step is shared. */
  private lootFrom(victimId: string, killerId: string | null): void {
    if (killerId !== PLAYER_ID) return;
    const victim = this.state.entities.get(victimId);
    if (!victim || victim.faction !== 'enemy' || !victim.enemyId) return;
    const def = enemyById(victim.enemyId);
    if (!def) return;
    const table = buildEnemyLootTable(def, victim.level);
    const result = rollLoot(table, this.state.rng, { forClass: this.cls });
    this.applyKillLoot(victim.enemyId, result.gold, result.items, victim);
  }

  /** Apply the server's authoritative kill credits (Stage 2c-2): the loot rolled server-side +
   * the enemy def id for our (still client-side) quest / bounty objectives. The client is the
   * inventory aggregator, so bag placement + capacity are enforced here. */
  private applyServerKills(): void {
    const kills = this.netSink?.drainKills();
    if (kills === undefined) return;
    for (const kill of kills) {
      this.applyKillLoot(kill.enemyId, kill.gold, kill.items, this.player);
    }
  }

  /**
   * Apply the server's item grants — the authoritative result of picking a ground item up (Part
   * 29). Unlike a kill this plays a loot cue (not a death cue) and never advances quest objectives:
   * it's purely "these stacks entered your bag." Bag capacity is enforced here (the client is the
   * aggregator); an overflow drops on the floor conceptually — surfaced as a "Bag full" floater.
   */
  private applyServerGrants(): void {
    const grants = this.netSink?.drainGrants();
    if (grants === undefined || grants.length === 0) return;
    let added = false;
    for (const stack of grants) {
      if (this.inventory.length >= this.bagCap()) {
        this.pushFloater(this.player, 'Bag full', 'miss');
        break;
      }
      this.inventory.push({ item: stack.item, qty: stack.qty });
      this.pushFloater(this.player, stack.item.name, 'heal');
      added = true;
    }
    if (added) audio.sfx('loot');
  }

  /**
   * Drop a whole bag stack onto the world (the player-to-player trade action). Removes it from the
   * bag and returns the removed stack so the caller can send it to the server, which spawns the
   * authoritative ground item at our position. Returns null for an out-of-range / empty slot.
   */
  dropInventory(index: number): ItemStackSave | null {
    if (index < 0 || index >= this.inventory.length) return null;
    const removed = this.inventory.splice(index, 1)[0];
    if (removed === undefined) return null;
    this.pushFloater(this.player, `Dropped ${removed.item.name}`, 'miss');
    return { item: removed.item, qty: removed.qty };
  }

  /**
   * Credit one kill: advance quest objectives, play the death cue, add the rolled gold, and push
   * the rolled items into the bag (respecting capacity). `anchor` is where item-name floaters
   * appear — the corpse in single-player, the player in MMO mode (the corpse may already be gone).
   */
  private applyKillLoot(
    enemyId: string,
    gold: number,
    items: readonly ItemStackSave[],
    anchor: CombatEntity,
  ): void {
    this.onEnemyKilled?.(enemyId); // quest kill/collect/boss objectives
    audio.sfx('death');
    if (gold > 0) {
      this.gold += gold;
      this.pushFloater(this.player, `+${gold}c`, 'xp');
    }
    for (const stack of items) {
      if (this.inventory.length >= this.bagCap()) {
        this.pushFloater(this.player, 'Bag full', 'miss');
        break;
      }
      this.inventory.push({ item: stack.item, qty: stack.qty });
      this.pushFloater(anchor, stack.item.name, 'heal');
    }
  }

  private pushFloater(e: CombatEntity, text: string, kind: Floater['kind']): void {
    this.pushFloaterAt(e.x, e.y, e.z, text, kind);
  }

  private pushFloaterAt(
    x: number,
    y: number,
    z: number,
    text: string,
    kind: Floater['kind'],
  ): void {
    this.worldFloaters.push({
      id: this.floaterId++,
      wx: x,
      wy: y + 1.8,
      wz: z,
      text,
      kind,
      age: 0,
    });
    if (this.worldFloaters.length > 40) this.worldFloaters.shift();
  }

  /**
   * Render the server's authoritative combat visuals (Stage 2c-3): floaters + hit sparks for
   * incoming hits / other players' fights, enemy death poofs, and boss-phase lines — the things
   * the client can't predict. Own outgoing hits are omitted server-side (predicted locally), so
   * these never double a predicted floater. Position is server-resolved, so a poof still plays
   * for a corpse the client already dropped.
   */
  private renderServerFx(events: readonly NetCombatEvent[]): void {
    for (const ev of events) {
      if (ev.kind === 'damage' || ev.kind === 'heal') {
        const kind = ev.kind === 'heal' ? 'heal' : ev.crit ? 'crit' : 'damage';
        const text = ev.amount <= 0 && ev.kind === 'damage' ? 'absorb' : String(ev.amount);
        this.pushFloaterAt(ev.x, ev.y, ev.z, text, kind);
        if (ev.kind === 'heal') {
          this.vfx.burst(ev.x, ev.y + 1.0, ev.z, {
            count: 8,
            color: [0.4, 1.0, 0.5],
            speed: 1.6,
            up: 1.2,
            life: 0.5,
            size: 0.16,
            gravity: -1,
          });
        } else if (ev.amount > 0) {
          this.vfx.burst(ev.x, ev.y + 1.0, ev.z, {
            count: ev.crit ? 14 : 8,
            color: ev.crit ? [1.0, 0.85, 0.3] : [1.0, 0.5, 0.35],
            speed: ev.crit ? 4 : 3,
            life: 0.4,
            size: ev.crit ? 0.2 : 0.14,
          });
        }
      } else if (ev.kind === 'death') {
        this.vfx.burst(ev.x, ev.y + 0.9, ev.z, {
          count: 20,
          color: [0.55, 0.55, 0.6],
          speed: 2.6,
          up: 1,
          life: 0.7,
          size: 0.22,
          gravity: -3,
        });
      } else if (ev.kind === 'boss' && ev.text !== undefined) {
        this.pushFloaterAt(ev.x, ev.y, ev.z, ev.text, 'crit');
      }
    }
  }

  // The Verdigris Blight seeps up around the Hollows: a slow drizzle of green
  // spore-motes drifting upward, denser the closer you are to a Hollow mouth.
  // Density scales with the VFX-density setting (Vfx.burst gates on it).
  private emitBlight(dt: number): void {
    const BLIGHT_RADIUS = 55;
    const p = this.player;
    let nearest = Infinity;
    for (const h of HOLLOWS) {
      const d = Math.hypot(p.x - h.x, p.z - h.z);
      if (d < nearest) nearest = d;
    }
    if (nearest > BLIGHT_RADIUS) return;
    this.blightTimer += dt;
    if (this.blightTimer < 0.09) return;
    this.blightTimer = 0;
    const intensity = 1 - nearest / BLIGHT_RADIUS; // 0 at the edge → 1 at the mouth
    this.vfx.burst(p.x, p.y + 0.5, p.z, {
      count: 2 + Math.round(intensity * 3),
      color: [0.45, 0.82, 0.3], // sickly verdigris green
      speed: 0.4,
      up: 1.0,
      life: 2.8,
      size: 0.22,
      gravity: 0.5, // positive → spores drift upward
      spread: 7,
    });
  }

  // --- render + HUD ----------------------------------------------------------

  render(dt: number, alpha: number, camera: THREE.PerspectiveCamera, sw: number, sh: number): void {
    this.vfx.update(dt);
    this.emitBlight(dt);
    this.syncRenderEnemies(dt, alpha);
    this.stepDying(dt);
    this.hudTimer += dt;
    if (this.hudTimer >= 0.066) {
      this.hudTimer = 0;
      this.publishHud(camera, sw, sh);
    }
    this.publishFloaters(dt, camera, sw, sh);
  }

  private syncRenderEnemies(dt: number, alpha: number): void {
    // Retire render objs whose entity is gone or dead (play a death animation).
    for (const [id, r] of [...this.renders]) {
      const e = this.state.entities.get(id);
      if (!e || e.dead) {
        if (this.networked && !e) {
          // MMO: the server dropped this enemy — it may have died OR just left our interest,
          // and we can't tell, so remove it quietly rather than play a false death animation.
          // (Real death VFX arrives with the Stage 2c combat-events channel.)
          this.scene.remove(r.obj.group);
          r.obj.dispose();
        } else {
          r.obj.setClip('death');
          this.dying.push({ obj: r.obj, age: 0 });
        }
        this.renders.delete(id);
      }
    }
    // Create/refresh render objs for live enemies.
    for (const e of this.state.entities.values()) {
      if (e.faction !== 'enemy' || !isAlive(e)) continue;
      let r = this.renders.get(e.id);
      if (!r) {
        const def = e.enemyId ? enemyById(e.enemyId) : undefined;
        const model = def ? buildEnemyModel(def.modelId) : null;
        if (!model) continue;
        const obj = new ModelObject(model, hashSeed(e.id));
        this.scene.add(obj.group);
        r = { obj, prevX: e.x, prevZ: e.z, prevYaw: e.yaw, curX: e.x, curZ: e.z, curYaw: e.yaw };
        this.renders.set(e.id, r);
      }
      r.curX = e.x;
      r.curZ = e.z;
      r.curYaw = e.yaw;
      const ix = r.prevX + (r.curX - r.prevX) * alpha;
      const iz = r.prevZ + (r.curZ - r.prevZ) * alpha;
      const y = this.ctx.heightAt(ix, iz);
      r.obj.setTransform(ix, y, iz, lerpAngleLocal(r.prevYaw, r.curYaw, alpha));
      const moving = Math.hypot(r.curX - r.prevX, r.curZ - r.prevZ) > 0.02;
      // A cast plays the wind-up clip ('cast' reads as a telegraph); quadrupeds lack it, so fall
      // back to 'attack'. Movement → run, else idle.
      const clip = e.cast ? (r.obj.hasClip('cast') ? 'cast' : 'attack') : moving ? 'run' : 'idle';
      r.obj.setClip(clip);
      r.obj.update(dt);
    }
  }

  private stepDying(dt: number): void {
    if (this.dying.length === 0) return;
    const keep: Dying[] = [];
    for (const d of this.dying) {
      d.age += dt;
      d.obj.update(dt);
      if (d.age >= DYING_SECONDS) {
        this.scene.remove(d.obj.group);
        d.obj.dispose();
      } else {
        keep.push(d);
      }
    }
    this.dying = keep;
  }

  private publishHud(camera: THREE.PerspectiveCamera, sw: number, sh: number): void {
    const p = this.player;
    const prog = levelProgressFromTotalXp(this.totalXp);

    const hotbar: HotbarSlot[] = this.hotbarSkills().map((s) => {
      const cdEnd = p.cooldowns[s.id] ?? 0;
      const remaining = Math.max(0, cdEnd - this.state.tick);
      const cdFrac = s.cooldownTicks > 0 ? Math.min(1, remaining / s.cooldownTicks) : 0;
      return {
        skillId: s.id,
        name: s.name,
        cost: s.resource,
        ready: remaining === 0 && p.resource >= s.resource && !p.dead,
        cooldownFrac: cdFrac,
      };
    });

    const targetEnt = p.targetId ? this.state.entities.get(p.targetId) : undefined;
    const target =
      targetEnt && isAlive(targetEnt)
        ? {
            id: targetEnt.id,
            name: targetEnt.name,
            level: targetEnt.level,
            hp: Math.max(0, Math.round(targetEnt.hp)),
            maxHP: targetEnt.maxHP,
            hostile: targetEnt.faction === 'enemy',
            castSkill: targetEnt.cast ? targetEnt.cast.skillId : null,
            castFrac: this.targetCastFrac(targetEnt),
          }
        : null;

    const combat: CombatUi = {
      player: {
        className: CLASS_INFO[this.cls].name,
        level: this.level,
        xp: prog.xpIntoLevel,
        xpForLevel: Number.isFinite(prog.xpForLevel) ? prog.xpForLevel : prog.xpIntoLevel,
        hp: Math.max(0, Math.round(p.hp)),
        maxHP: p.maxHP,
        resource: Math.round(p.resource),
        maxResource: p.maxResource,
        resourceKind: p.resourceKind,
        alive: !p.dead,
      },
      target,
      hotbar,
      autoAttack: p.autoAttack,
    };
    useStore.getState().setCombat(combat);
    useStore.getState().setInventory(this.inventoryUi(p));
    useStore.getState().setWaystone(this.waystoneUi());

    // Enemy HP nameplates (merged with NPC plates by the game).
    const plates: Nameplate[] = [];
    for (const e of this.state.entities.values()) {
      if (e.faction !== 'enemy' || !isAlive(e)) continue;
      this.tmp.set(e.x, e.y + 2.4, e.z).project(camera);
      if (
        !Number.isFinite(this.tmp.x) ||
        this.tmp.z > 1 ||
        Math.abs(this.tmp.x) > 1.1 ||
        Math.abs(this.tmp.y) > 1.1
      )
        continue;
      plates.push({
        id: `c:${e.id}`,
        name: e.name,
        level: e.level,
        hpFrac: Math.max(0, e.hp / e.maxHP),
        hostile: true,
        targeted: e.id === p.targetId,
        sx: (this.tmp.x * 0.5 + 0.5) * sw,
        sy: (-this.tmp.y * 0.5 + 0.5) * sh,
      });
    }
    this.enemyPlates = plates;
  }

  /** Latest projected enemy nameplates (the game merges these with NPC plates). */
  enemyPlates: Nameplate[] = [];

  /** Waystone prompt + travel list (activated stones, with the fee from here). */
  private waystoneUi(): WaystoneUi {
    const here = this.nearbyWaystone();
    const discovered = [...this.discovered]
      .map((id) => waystoneById(id))
      .filter((w): w is NonNullable<typeof w> => !!w)
      .map((w) => ({
        id: w.id,
        name: w.name,
        fee:
          here && here.id !== w.id
            ? Math.round(travelFee(here, w, this.level) * this.travelFeeMult)
            : 0,
      }));
    return {
      nearbyName: here ? here.name : null,
      nearbyNew: here ? !this.discovered.has(here.id) : false,
      atWaystone: !!here,
      discovered,
    };
  }

  /** Build the character-sheet payload (primary + derived stats, bag, equipment). */
  private inventoryUi(p: CombatEntity): InventoryUi {
    const primary = addStats(baseStatsAtLevel(this.cls, this.level), this.equipDerived().gear);
    return {
      gold: this.gold,
      bag: this.inventory,
      bagSize: this.bagCap(),
      equipment: this.equipment,
      stats: {
        might: primary.might,
        agility: primary.agility,
        intellect: primary.intellect,
        spirit: primary.spirit,
        stamina: primary.stamina,
        maxHP: p.maxHP,
        attackPower: p.stats.attackPower,
        spellPower: p.stats.spellPower,
        critChance: p.stats.critChance,
        armor: p.stats.armor,
      },
    };
  }

  private publishFloaters(
    dt: number,
    camera: THREE.PerspectiveCamera,
    sw: number,
    sh: number,
  ): void {
    const out: Floater[] = [];
    const keep: WorldFloater[] = [];
    for (const f of this.worldFloaters) {
      f.age += dt;
      if (f.age > 1.1) continue;
      keep.push(f);
      this.tmp.set(f.wx, f.wy + f.age * 1.2, f.wz).project(camera);
      if (!Number.isFinite(this.tmp.x) || this.tmp.z > 1 || Math.abs(this.tmp.x) > 1.1) continue;
      out.push({
        id: f.id,
        text: f.text,
        kind: f.kind,
        sx: (this.tmp.x * 0.5 + 0.5) * sw,
        sy: (-this.tmp.y * 0.5 + 0.5) * sh,
      });
    }
    this.worldFloaters = keep;
    useStore.getState().setFloaters(out);
  }

  dispose(): void {
    for (const r of this.renders.values()) {
      this.scene.remove(r.obj.group);
      r.obj.dispose();
    }
    for (const d of this.dying) {
      this.scene.remove(d.obj.group);
      d.obj.dispose();
    }
    this.renders.clear();
    this.dying = [];
    this.vfx.dispose();
  }
}

function lerpAngleLocal(a: number, b: number, t: number): number {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function hashSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}
