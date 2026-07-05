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
  stepSpawner,
  applyIntent,
  drainEvents,
  makePlayerEntity,
  buildEnemyModel,
  enemyById,
  skillsKnownAt,
  levelProgressFromTotalXp,
  totalXpToReachLevel,
  baseStatsAtLevel,
  addStats,
  canEquip,
  rollLoot,
  buildEnemyLootTable,
  EquipSlot,
  RING_SLOTS,
  isAlive,
  type CombatState,
  type SpawnerState,
  type SpawnRegion,
  type CombatEntity,
  type CombatEvent,
  type SkillDef,
  type StatBlock,
  type ItemDef,
  type ItemStackSave,
} from '@pathlands/shared';
import { ModelObject } from '../engine/voxelModel.js';
import {
  useStore,
  type CombatUi,
  type Floater,
  type HotbarSlot,
  type InventoryUi,
  type Nameplate,
} from './store.js';

const PLAYER_ID = 'player';
const START_LEVEL = 6;
const DYING_SECONDS = 1.2;
const PICK_SCREEN_RADIUS = 0.22; // NDC distance for crosshair target picking
const BAG_SIZE = 24;

/** Progression a character carries into the world (from the save). */
export interface Progression {
  level: number;
  xp: number;
  gold: number;
  inventory: ItemStackSave[];
  equipment: Record<string, ItemDef>;
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
  private gold: number;
  private inventory: ItemStackSave[];
  private equipment: Record<string, ItemDef>;

  private readonly renders = new Map<string, RenderEnemy>();
  private dying: Dying[] = [];
  private worldFloaters: WorldFloater[] = [];
  private floaterId = 1;

  private readonly ctx: { heightAt: (x: number, z: number) => number };
  private readonly tmp = new THREE.Vector3();
  private hudTimer = 0;

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
    this.world = world;
    this.cls = cls;
    this.level = Math.max(1, progression?.level ?? START_LEVEL);
    this.totalXp = progression?.xp ?? totalXpToReachLevel(this.level);
    this.gold = progression?.gold ?? 0;
    this.inventory = progression?.inventory ? [...progression.inventory] : [];
    this.equipment = progression?.equipment ? { ...progression.equipment } : {};
    this.spawnX = spawnX;
    this.spawnZ = spawnZ;
    this.respawnAt = respawnAt;
    this.ctx = { heightAt: (x, z) => world.heightAt(Math.floor(x), Math.floor(z)) };

    this.state = createCombatState(world.seed);
    this.spawner = createSpawner(world.seed);
    this.regions = [
      {
        id: 'valeBoars',
        enemyId: 'thornbackBoar',
        level: [2, 4],
        cx: 1536,
        cz: 1586,
        radius: 26,
        count: 4,
        respawnTicks: 200,
      },
      {
        id: 'valeRats',
        enemyId: 'blightrat',
        level: [1, 3],
        cx: 1492,
        cz: 1556,
        radius: 18,
        count: 3,
        respawnTicks: 200,
      },
    ];

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
  get characterInventory(): ItemStackSave[] {
    return this.inventory;
  }
  get characterEquipment(): Record<string, ItemDef> {
    return this.equipment;
  }

  setClass(cls: CharacterClass): void {
    if (cls === this.cls) return;
    this.cls = cls;
    // A class change clears gear that the new class can't use.
    for (const [slot, item] of Object.entries(this.equipment)) {
      if (!canEquip(cls, this.level, item)) {
        delete this.equipment[slot];
        if (this.inventory.length < BAG_SIZE) this.inventory.push({ item, qty: 1 });
      }
    }
    this.state.entities.set(PLAYER_ID, this.makePlayer(this.player.x, this.player.z));
  }

  /** Rebuild the player entity after a gear change, preserving HP%/resource/target. */
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
    this.inventory.splice(index, 1);
    if (prev) this.inventory.push({ item: prev, qty: 1 });
    this.rebuildPlayer();
  }

  /** Unequip the item in `slot` back to the bag. */
  unequipItem(slot: string): void {
    const item = this.equipment[slot];
    if (!item) return;
    if (this.inventory.length >= BAG_SIZE) {
      this.pushFloater(this.player, 'Bag full', 'miss');
      return;
    }
    delete this.equipment[slot];
    this.inventory.push({ item, qty: 1 });
    this.rebuildPlayer();
  }

  /** Sell the inventory item at `index` for a quarter of its value. */
  sellItem(index: number): void {
    const stack = this.inventory[index];
    if (!stack) return;
    this.gold += Math.max(1, Math.floor((stack.item.value / 4) * stack.qty));
    this.inventory.splice(index, 1);
  }

  /** The skills mapped to hotbar slots (learn order, up to 10). */
  private hotbarSkills(): SkillDef[] {
    return skillsKnownAt(this.cls, this.level).slice(0, 10);
  }

  // --- input intents ---------------------------------------------------------

  castSlot(slot: number): void {
    const skills = this.hotbarSkills();
    const skill = skills[slot];
    if (!skill) return;
    applyIntent(this.state, PLAYER_ID, { type: 'CastSkill', skillId: skill.id });
  }

  toggleAutoAttack(): void {
    const p = this.player;
    applyIntent(this.state, PLAYER_ID, { type: 'ToggleAutoAttack', on: !p.autoAttack });
  }

  cycleTarget(): void {
    const p = this.player;
    const foes = [...this.state.entities.values()]
      .filter((e) => e.faction === 'enemy' && isAlive(e))
      .sort((a, b) => this.dist(p, a) - this.dist(p, b));
    if (foes.length === 0) return;
    const idx = foes.findIndex((e) => e.id === p.targetId);
    const next = foes[(idx + 1) % foes.length]!;
    applyIntent(this.state, PLAYER_ID, { type: 'SetTarget', targetId: next.id });
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
    if (best) applyIntent(this.state, PLAYER_ID, { type: 'SetTarget', targetId: best });
  }

  releaseSpirit(): void {
    const p = this.player;
    if (!p.dead) return;
    this.respawnAt(this.spawnX, this.spawnZ);
    const fresh = this.makePlayer(this.spawnX, this.spawnZ);
    this.state.entities.set(PLAYER_ID, fresh);
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

    stepSim(this.state, this.ctx);
    // Consume events (incl. loot on death) BEFORE the spawner reaps corpses, so a
    // freshly-killed enemy is still in the state when we roll its loot table.
    this.consumeEvents();
    for (const region of this.regions) stepSpawner(this.state, this.spawner, region, this.ctx);
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
    } else if (ev.type === 'xp') {
      // Award XP + handle level-ups (full heal + stat rebuild on ding).
      this.totalXp += ev.amount;
      this.pushFloater(this.player, `+${ev.amount} XP`, 'xp');
      const prog = levelProgressFromTotalXp(this.totalXp);
      if (prog.level > this.level) {
        this.level = prog.level;
        const cur = this.player;
        const leveled = this.makePlayer(cur.x, cur.z);
        leveled.targetId = cur.targetId;
        leveled.autoAttack = cur.autoAttack;
        this.state.entities.set(PLAYER_ID, leveled);
        this.pushFloater(leveled, `Level ${this.level}!`, 'xp');
      }
    } else if (ev.type === 'death') {
      this.lootFrom(ev.entityId, ev.killerId);
    }
  }

  /** Roll a slain enemy's loot table into the player's gold + bag (GDD §6). */
  private lootFrom(victimId: string, killerId: string | null): void {
    if (killerId !== PLAYER_ID) return;
    const victim = this.state.entities.get(victimId);
    if (!victim || victim.faction !== 'enemy' || !victim.enemyId) return;
    const def = enemyById(victim.enemyId);
    if (!def) return;
    const table = buildEnemyLootTable(def, victim.level);
    const result = rollLoot(table, this.state.rng, { forClass: this.cls });
    if (result.gold > 0) {
      this.gold += result.gold;
      this.pushFloater(this.player, `+${result.gold}c`, 'xp');
    }
    for (const stack of result.items) {
      if (this.inventory.length >= BAG_SIZE) {
        this.pushFloater(this.player, 'Bag full', 'miss');
        break;
      }
      this.inventory.push(stack);
      this.pushFloater(victim, stack.item.name, 'heal');
    }
  }

  private pushFloater(e: CombatEntity, text: string, kind: Floater['kind']): void {
    this.worldFloaters.push({
      id: this.floaterId++,
      wx: e.x,
      wy: e.y + 1.8,
      wz: e.z,
      text,
      kind,
      age: 0,
    });
    if (this.worldFloaters.length > 40) this.worldFloaters.shift();
  }

  // --- render + HUD ----------------------------------------------------------

  render(dt: number, alpha: number, camera: THREE.PerspectiveCamera, sw: number, sh: number): void {
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
        r.obj.setClip('death');
        this.dying.push({ obj: r.obj, age: 0 });
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
      r.obj.setClip(e.cast ? 'attack' : moving ? 'run' : 'idle');
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
            castFrac: 0,
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

    // Enemy HP nameplates (merged with NPC plates by the game).
    const plates: Nameplate[] = [];
    for (const e of this.state.entities.values()) {
      if (e.faction !== 'enemy' || !isAlive(e)) continue;
      this.tmp.set(e.x, e.y + 2.4, e.z).project(camera);
      if (this.tmp.z > 1 || Math.abs(this.tmp.x) > 1.1 || Math.abs(this.tmp.y) > 1.1) continue;
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

  /** Build the character-sheet payload (primary + derived stats, bag, equipment). */
  private inventoryUi(p: CombatEntity): InventoryUi {
    const primary = addStats(baseStatsAtLevel(this.cls, this.level), this.equipDerived().gear);
    return {
      gold: this.gold,
      bag: this.inventory,
      bagSize: BAG_SIZE,
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
      if (this.tmp.z > 1 || Math.abs(this.tmp.x) > 1.1) continue;
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
