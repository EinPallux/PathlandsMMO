// The client game: owns the renderer, world, chunk streaming, environment, player,
// camera, and the fixed-tick + interpolated-render loop (ARCH §3/§7). Phases 1–5
// run the simulation here; Phase 6 moves authority to the server behind the same
// intent → sim boundary.

import * as THREE from 'three';
import {
  World,
  WORLD_SEED,
  TICK_DT,
  buildCharacterModel,
  BIOMES,
  CHARACTER_CLASSES,
  CharacterClass,
  type CharacterSave,
  type AccountSave,
  type VoxelSampler,
  type ShadowQuality,
  type VfxDensity,
} from '@pathlands/shared';
import { ChunkManager } from '../engine/chunkManager.js';
import { PropRenderer } from '../engine/propRenderer.js';
import { EntityManager } from '../engine/entityManager.js';
import { Environment } from '../engine/environment.js';
import { CameraRig } from '../engine/camera.js';
import { ModelObject } from '../engine/voxelModel.js';
import { Input } from './input.js';
import { PlayerController } from './playerController.js';
import { Discovery } from './discovery.js';
import { CombatDirector } from './combatDirector.js';
import { QuestDirector } from './questDirector.js';
import { GatherDirector } from './gatherDirector.js';
import { MetaDirector } from './metaDirector.js';
import { MountController } from './mountController.js';
import { BountyDirector } from './bountyDirector.js';
import { questGiverById } from '@pathlands/shared';
import { useStore, type GameCommands } from './store.js';

// Brookhollow plaza, just north of the fountain (which sits at 1536,1536).
const SPAWN_X = 1536.5;
const SPAWN_Z = 1524.5;
const FREE_FLY_SPEED = 28;
const MAX_FRAME_DT = 0.1;
// How far below the local surface counts as "indoors/underground" for mount rules.
const UNDERGROUND_MARGIN = 3;

// VFX-density graphics setting → burst-count multiplier (Phase 5).
const VFX_DENSITY_MULT: Record<VfxDensity, number> = { off: 0, low: 0.5, full: 1 };

export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly world = new World(WORLD_SEED);
  private readonly sampler: VoxelSampler;
  private readonly chunks: ChunkManager;
  private readonly propRenderer: PropRenderer;
  private readonly entities: EntityManager;
  private readonly env: Environment;
  private readonly camera: CameraRig;
  private readonly input: Input;
  private controller: PlayerController;
  private playerModel: ModelObject;
  private currentClass: CharacterClass;
  private readonly discovery: Discovery;
  private readonly combat: CombatDirector;
  private readonly quests: QuestDirector;
  private readonly gather: GatherDirector;
  private readonly meta: MetaDirector;
  private readonly mount: MountController;
  private readonly bounties: BountyDirector;
  private readonly character: CharacterSave | null;
  private readonly account: AccountSave;
  private lastGx = 0;
  private lastGz = 0;

  private accumulator = 0;
  private lastTime = 0;
  private rafId = 0;
  private fps = 60;
  private statsTimer = 0;
  private running = true;
  private started = false;
  private contextLost = false;
  /** Render-resolution multiplier on top of the device pixel ratio (Phase 5). */
  private resolutionScale = 1;
  /** Effective (possibly auto-reduced) chunk view distance; ≤ the user's setting. */
  private effectiveVD = 0;
  private adaptTimer = 0;
  /** Reused per frame to feed the player focus to the shadow follow (no alloc). */
  private readonly shadowFocus = new THREE.Vector3();

  constructor(
    canvas: HTMLCanvasElement,
    character: CharacterSave | null = null,
    account: AccountSave = { pathPoints: 0, perks: {} },
  ) {
    this.account = { pathPoints: account.pathPoints, perks: { ...account.perks } };
    this.canvas = canvas;
    this.character = character;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Shadow support stays enabled so materials compile with it once; the sun's
    // castShadow flag (set by the graphics setting) is what turns shadows on/off,
    // avoiding a runtime shader recompile when the player changes the setting.
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.sampler = {
      isSolid: (x, y, z) => this.world.isSolidAt(x, y, z),
      isFluid: (x, y, z) => this.world.isFluidAt(x, y, z),
    };

    const viewDist = useStore.getState().viewDistance;
    this.camera = new CameraRig(canvas.clientWidth / canvas.clientHeight);
    this.propRenderer = new PropRenderer(this.scene);
    this.chunks = new ChunkManager(this.scene, WORLD_SEED, viewDist, this.propRenderer);
    this.entities = new EntityManager(this.scene, this.world);
    this.env = new Environment(this.scene, viewDist);

    this.discovery = new Discovery(WORLD_SEED);
    useStore
      .getState()
      .setSnapshot({ discovery: this.discovery.grid, discoveryN: this.discovery.n });

    this.input = new Input(canvas);

    // Spawn from the character (falls back to the Brookhollow plaza for dev boots).
    const spawnX = character?.x ?? SPAWN_X;
    const spawnZ = character?.z ?? SPAWN_Z;
    const spawnY = this.world.heightAt(Math.floor(spawnX), Math.floor(spawnZ)) + 2;
    this.controller = new PlayerController(spawnX, spawnY, spawnZ);

    this.currentClass = character
      ? (CHARACTER_CLASSES.find((c) => c === character.class) ?? CharacterClass.Warrior)
      : useStore.getState().selectedClass;
    useStore.getState().setSelectedClass(this.currentClass);
    this.playerModel = new ModelObject(buildCharacterModel(this.currentClass));
    this.scene.add(this.playerModel.group);

    this.combat = new CombatDirector(
      this.scene,
      this.world,
      this.currentClass,
      SPAWN_X,
      SPAWN_Z,
      (x, z) => this.teleportPlayer(x, z),
      character
        ? {
            level: character.level,
            xp: character.xp,
            gold: character.gold,
            inventory: character.inventory,
            equipment: character.equipment,
            discoveredWaystones: character.discoveredWaystones,
            bank: character.bank,
            mail: character.mail,
          }
        : undefined,
    );

    this.quests = new QuestDirector(this.combat, character?.quests);
    // Share the live indicator map so giver nameplates show "!/?" markers.
    this.entities.giverIndicators = this.quests.indicators;
    this.gather = new GatherDirector(
      this.world,
      this.combat,
      character?.professions,
      character?.materials,
      character?.consumables,
      character?.learnedRecipes,
    );
    // Deeds are per-character; the Path Points they award and the perks bought are
    // account-wide (GDD §10), so they come from the shared account block.
    this.meta = new MetaDirector(
      this.combat,
      character?.deeds,
      this.account.pathPoints,
      this.account.perks,
    );
    this.mount = new MountController(
      this.scene,
      this.combat,
      character?.mounts,
      character?.activeMount,
    );
    // Day index for the daily bounty rotation — the one allowed wall-clock touch,
    // taken here at the client bootstrap edge (ARCH §3; sim stays date-free).
    const dayIndex = Math.floor(Date.now() / 86_400_000);
    this.bounties = new BountyDirector(
      this.combat,
      this.meta,
      WORLD_SEED,
      dayIndex,
      character?.bounties,
    );

    // Fan world events out to the quest + meta + bounty systems (they share events).
    this.combat.onEnemyKilled = (id) => {
      this.quests.onKill(id);
      this.meta.handleKill(id);
      this.bounties.onKill(id);
    };
    this.combat.onWaystoneUsed = (id) => this.quests.handleWaystoneUse(id);
    this.combat.onWaystoneAttuned = () => this.meta.handleWaystone();
    this.quests.onQuestTurnedIn = () => this.meta.handleQuest();
    this.gather.onCraft = () => this.meta.handleCraft();
    this.gather.onGatherSkill = (s) => this.meta.handleGatherSkill(s);
    this.gather.onMaterialGained = (id, qty) => this.bounties.onGather(id, qty);
    // A completed Deed may unlock a mount skin (GDD §7).
    this.meta.onDeedComplete = (deedId) => this.mount.grantSkinForDeed(deedId);

    this.effectiveVD = viewDist;
    this.registerCommands();
    this.applyGraphics(); // shadows / VFX density / resolution scale from saved settings
    window.addEventListener('resize', this.onResize);
    this.canvas.addEventListener('mousedown', this.onCanvasClick);
    this.canvas.addEventListener('webglcontextlost', this.onContextLost as EventListener);
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored as EventListener);

    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  private teleportPlayer(x: number, z: number): void {
    const y = this.world.heightAt(Math.floor(x), Math.floor(z)) + 2;
    this.controller.teleport(x, y, z);
    this.camera.syncFreeToPlayer(x, y, z);
    this.accumulator = 0;
  }

  private onCanvasClick = (e: MouseEvent): void => {
    // A click while already pointer-locked selects the enemy under the crosshair.
    if (e.button === 0 && this.input.locked) this.combat.pickTarget(this.camera.camera);
  };

  private registerCommands(): void {
    const commands: GameCommands = {
      teleport: (x, z) => this.teleportPlayer(x, z),
      setClass: (cls) => this.swapClass(cls),
      setViewDistance: (chunks) => {
        this.effectiveVD = chunks; // user override resets the adaptive floor
        this.chunks.setRadius(chunks);
        this.env.setViewDistance(chunks);
        useStore.getState().setSnapshot({ viewDistance: chunks });
      },
      setShadows: (q) => this.applyShadows(q),
      setVfxDensity: (d) => this.applyVfxDensity(d),
      setResolutionScale: (scale) => this.applyResolutionScale(scale),
      toggleFreeFly: () => this.toggleFreeFly(),
      setDayNightSpeed: (speed) => {
        this.env.speed = speed;
      },
      setWeather: (w) => {
        this.env.setWeather(w);
        useStore.getState().setSnapshot({ weather: w });
      },
      respawn: () => this.teleportPlayer(SPAWN_X, SPAWN_Z),
      castSlot: (slot) => this.combat.castSlot(slot),
      cycleTarget: () => this.combat.cycleTarget(),
      toggleAutoAttack: () => this.combat.toggleAutoAttack(),
      releaseSpirit: () => this.combat.releaseSpirit(),
      equipItem: (index) => this.combat.equipItem(index),
      unequipItem: (slot) => this.combat.unequipItem(slot),
      sellItem: (index) => this.combat.sellItem(index),
      buyItem: (index) => this.combat.buyItem(index),
      buybackItem: (index) => this.combat.buybackItem(index),
      closeVendor: () => this.combat.closeVendor(),
      acceptQuest: (id) => this.quests.accept(id),
      turnInQuest: (id, choice) => this.quests.turnIn(id, choice),
      abandonQuest: (id) => this.quests.abandon(id),
      pinQuest: (id, pinned) => this.quests.pin(id, pinned),
      closeQuestDialog: () => this.quests.closeDialog(),
      craftRecipe: (id) => this.gather.craftRecipe(id),
      useConsumable: (id) => this.gather.useConsumable(id),
      buyPerk: (id) => this.meta.buyPerk(id),
      buyMount: () => this.mount.buyMount(),
      toggleMount: () => this.mount.toggle(),
      selectMount: (id) => this.mount.selectMount(id),
      depositItem: (index) => this.combat.depositItem(index),
      withdrawItem: (index) => this.combat.withdrawItem(index),
      claimMail: (id) => this.combat.claimMail(id),
      acceptBounty: (id) => this.bounties.accept(id),
      turnInBounty: (id) => this.bounties.turnIn(id),
      interactWaystone: () => void this.combat.interactWaystone(),
      travelTo: (id) => this.combat.travelTo(id),
    };
    useStore.getState().setCommands(commands);
  }

  private swapClass(cls: CharacterClass): void {
    if (cls === this.currentClass) return;
    this.scene.remove(this.playerModel.group);
    this.playerModel.dispose();
    this.currentClass = cls;
    this.playerModel = new ModelObject(buildCharacterModel(cls));
    this.scene.add(this.playerModel.group);
    this.combat.setClass(cls);
    useStore.getState().setSelectedClass(cls);
  }

  // --- graphics settings (Phase 5) -------------------------------------------

  private applyShadows(q: ShadowQuality): void {
    this.env.setShadowQuality(q);
    useStore.getState().setGraphics({ shadows: q });
  }

  private applyVfxDensity(d: VfxDensity): void {
    this.combat.setVfxDensity(VFX_DENSITY_MULT[d]);
    useStore.getState().setGraphics({ vfxDensity: d });
  }

  private applyResolutionScale(scale: number): void {
    this.resolutionScale = Math.min(1, Math.max(0.5, scale));
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * this.resolutionScale);
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight, false);
    useStore.getState().setGraphics({ resolutionScale: this.resolutionScale });
  }

  /** Apply the current store graphics settings to the renderer/engine (boot). */
  private applyGraphics(): void {
    const st = useStore.getState();
    this.applyShadows(st.shadows);
    this.applyVfxDensity(st.vfxDensity);
    this.applyResolutionScale(st.resolutionScale);
  }

  private toggleFreeFly(): void {
    if (this.camera.mode === 'thirdPerson') {
      this.camera.mode = 'freeFly';
      this.camera.syncFreeToPlayer(
        this.controller.physics.x,
        this.controller.physics.y,
        this.controller.physics.z,
      );
    } else {
      this.camera.mode = 'thirdPerson';
    }
    useStore.getState().setSnapshot({ freeFly: this.camera.mode === 'freeFly' });
  }

  private handleFrameInput(dt: number): void {
    if (this.input.locked) {
      const m = this.input.consumeMouse();
      this.camera.addLook(m.dx, m.dy);
    }
    const wheel = this.input.consumeWheel();
    if (wheel !== 0 && this.camera.mode === 'thirdPerson') this.camera.zoom(wheel);

    // Panel/action keys are rebindable (Settings, save v11); read the live map.
    const store = useStore.getState();
    const kb = store.keybinds;
    const tapped = (action: string): boolean => this.input.wasTapped(kb[action] ?? '');
    if (tapped('toggleFreeFly')) this.toggleFreeFly();
    if (tapped('toggleMap')) store.toggleMap();
    if (this.input.wasTapped('Backquote')) store.toggleDev();
    if (tapped('toggleChar') || this.input.wasTapped('KeyI')) store.toggleChar();
    if (tapped('toggleQuestLog')) store.toggleQuestLog();
    if (tapped('toggleProfessions')) store.toggleProfessions();
    if (tapped('toggleCrafting')) store.toggleCrafting();
    if (tapped('toggleJournal')) store.toggleJournal();
    if (tapped('toggleBank')) store.toggleBank();
    if (tapped('toggleBounties')) {
      const p = this.controller.physics;
      this.bounties.toggle(p.x, p.z);
    }
    if (tapped('toggleMount')) this.mount.toggle();

    // Combat: cycle target, cast the hotbar digits, toggle auto-attack, release spirit.
    if (tapped('cycleTarget')) this.combat.cycleTarget();
    if (tapped('toggleAutoAttack')) this.combat.toggleAutoAttack();
    if (tapped('releaseSpirit')) this.combat.releaseSpirit();
    for (let i = 0; i < 10; i++) {
      const code = i === 9 ? 'Digit0' : `Digit${i + 1}`;
      if (this.input.wasTapped(code)) this.combat.castSlot(i);
    }

    // Interact (E by default): advance dialogue → attune/use a Waystone → trade with a
    // merchant → talk to an NPC.
    if (tapped('interact')) {
      const px = this.controller.physics.x;
      const pz = this.controller.physics.z;
      if (store.dialogue) {
        store.advanceDialogue();
      } else if (store.questDialog) {
        this.quests.closeDialog();
      } else if (store.vendor) {
        this.combat.closeVendor();
      } else if (
        !this.combat.interactWaystone() &&
        !this.gather.interact(px, this.controller.physics.y, pz)
      ) {
        const npc = this.entities.interactNearest(px, pz);
        if (npc && questGiverById(npc.id)) {
          this.quests.openGiver(npc.id, npc.name);
        } else if (npc?.kind === 'vendor') {
          this.combat.openVendor(npc.name, npc.seed, npc.x, npc.z);
        } else if (npc) {
          store.openDialogue(npc.name, npc.dialogue);
        }
      }
    }
    if (this.input.wasTapped('Escape')) {
      // Escape closes whatever transient dialog is open; if nothing is, it toggles Settings.
      const anyOpen =
        store.dialogue !== null ||
        store.showTravel ||
        store.vendor !== null ||
        store.questDialog !== null;
      if (anyOpen) {
        store.closeDialogue();
        store.closeTravel();
        this.combat.closeVendor();
        this.quests.closeDialog();
      } else {
        store.toggleSettings();
      }
    }

    if (this.camera.mode === 'freeFly') {
      const sp = FREE_FLY_SPEED * dt * (this.input.isDown('ShiftLeft') ? 3 : 1);
      let f = 0;
      let s = 0;
      let u = 0;
      if (this.input.isDown('KeyW')) f += sp;
      if (this.input.isDown('KeyS')) f -= sp;
      if (this.input.isDown('KeyD')) s += sp;
      if (this.input.isDown('KeyA')) s -= sp;
      if (this.input.isDown('Space')) u += sp;
      if (this.input.isDown('ControlLeft')) u -= sp;
      this.camera.moveFree(f, s, u);
    }
  }

  private loop = (now: number): void => {
    if (!this.running) return;
    const dt = Math.min((now - this.lastTime) / 1000, MAX_FRAME_DT);
    this.lastTime = now;

    this.handleFrameInput(dt);

    // Fixed-tick simulation with interpolation.
    const active = this.camera.mode === 'thirdPerson';
    this.accumulator += dt;
    let ticks = 0;
    while (this.accumulator >= TICK_DT && ticks < 5) {
      // Mount rules + ground-speed multiplier, from the pre-tick context. Mounts
      // are outdoor-only and drop the instant combat starts (GDD §7); Trailblazer
      // adds out-of-combat speed on top.
      const pre = this.controller.physics;
      const surfaceY = this.world.heightAt(Math.floor(pre.x), Math.floor(pre.z));
      const underground = pre.y < surfaceY - UNDERGROUND_MARGIN;
      const inCombat = this.combat.isInCombat();
      this.mount.updateEnv(inCombat, underground, pre.inWater);
      let speedMult = this.mount.speedMult();
      if (!inCombat) speedMult *= 1 + this.meta.outOfCombatSpeedBonus;

      if (active) {
        this.controller.tick(this.sampler, this.input, this.camera.yaw, TICK_DT, speedMult);
      } else {
        // Keep the player settled (gravity only) while free-flying.
        this.controller.tick(this.sampler, freeInput, this.controller.physics.yaw, TICK_DT);
      }
      const ph = this.controller.physics;
      this.combat.simTick(ph.x, ph.y, ph.z, ph.yaw);
      this.accumulator -= TICK_DT;
      ticks++;
    }
    const alpha = this.accumulator / TICK_DT;
    const rs = this.controller.renderState(alpha);

    // Player model follows the interpolated state, seated up on the mount if any.
    const thirdPerson = this.camera.mode === 'thirdPerson';
    this.playerModel.setTransform(rs.x, rs.y + this.mount.riderYOffset(), rs.z, rs.yaw);
    this.playerModel.setClip(rs.moveState);
    this.playerModel.group.visible = thirdPerson;
    this.playerModel.update(dt);
    this.mount.render(rs, dt, thirdPerson);

    this.camera.update(rs.x, rs.y, rs.z, this.sampler.isSolid);
    this.shadowFocus.set(rs.x, rs.y, rs.z);
    this.env.update(dt, this.camera.camera.position, this.shadowFocus);
    this.chunks.update(rs.x, rs.z);
    this.propRenderer.tick(dt); // wind sway clock
    this.propRenderer.update();
    this.entities.update(
      dt,
      rs.x,
      rs.z,
      this.camera.camera,
      this.canvas.clientWidth,
      this.canvas.clientHeight,
    );
    this.combat.render(
      dt,
      alpha,
      this.camera.camera,
      this.canvas.clientWidth,
      this.canvas.clientHeight,
    );
    useStore.getState().setNameplates([...this.entities.nameplates, ...this.combat.enemyPlates]);

    // "Press E to trade" prompt: nearest merchant in reach, unless a panel is open.
    const st = useStore.getState();
    const promptName =
      st.dialogue || st.vendor || st.showTravel
        ? null
        : (this.entities.nearestVendor(rs.x, rs.z, 4.5)?.name ?? null);
    if (st.nearbyVendor !== promptName) st.setNearbyVendor(promptName);

    // Quest explore-objective checks (throttled inside).
    this.quests.tickExplore(dt, rs.x, rs.z);

    // Gathering: node proximity, channel/fishing progress (cancels on movement).
    const gMoved = Math.hypot(rs.x - this.lastGx, rs.z - this.lastGz) > 0.04;
    this.lastGx = rs.x;
    this.lastGz = rs.z;
    this.gather.update(dt, rs.x, rs.y, rs.z, gMoved);

    this.discovery.reveal(rs.x, rs.z);
    this.discovery.tick(dt);
    const live = useStore.getState().live;
    live.x = rs.x;
    live.z = rs.z;
    live.yaw = rs.yaw;

    this.renderer.render(this.scene, this.camera.camera);

    this.input.clearTapped();
    this.updateStats(dt, rs);
    this.rafId = requestAnimationFrame(this.loop);
  };

  private updateStats(
    dt: number,
    rs: { x: number; y: number; z: number; moveState: string },
  ): void {
    this.fps = this.fps * 0.9 + (1 / Math.max(dt, 1e-4)) * 0.1;
    this.statsTimer += dt;

    if (!this.started && this.chunks.isReadyAt(rs.x, rs.z) && this.chunks.loadedCount >= 8) {
      this.started = true;
      useStore.getState().setReady(true);
    }

    // Adaptive quality (Phase 5 "hold budgets in worst spots"): once running, if the
    // frame rate sags in a heavy spot, quietly drop the effective view distance a
    // notch (down to a floor); when it recovers, climb back toward the user's chosen
    // setting. Checked on a slow cadence with wide hysteresis so it never thrashes
    // the chunk streamer. The user's setting is the ceiling and is never overwritten.
    if (this.started) {
      this.adaptTimer += dt;
      if (this.adaptTimer >= 3) {
        this.adaptTimer = 0;
        const userMax = useStore.getState().viewDistance;
        let next = this.effectiveVD;
        if (this.fps < 35 && next > 4) next -= 1;
        else if (this.fps > 55 && next < userMax) next += 1;
        if (next !== this.effectiveVD) {
          this.effectiveVD = next;
          this.chunks.setRadius(next);
          this.env.setViewDistance(next);
        }
      }
    }

    if (this.statsTimer >= 0.2) {
      this.statsTimer = 0;
      const info = this.renderer.info.render;
      const biome = this.world.biomeAt(Math.floor(rs.x), Math.floor(rs.z));
      const target = (useStore.getState().viewDistance * 2 + 1) ** 2 * 0.78;
      useStore.getState().setSnapshot({
        fps: Math.round(this.fps),
        drawCalls: info.calls,
        triangles: info.triangles,
        chunksLoaded: this.chunks.loadedCount,
        chunksPending: this.chunks.pendingCount,
        posX: rs.x,
        posY: rs.y,
        posZ: rs.z,
        biome: BIOMES[biome].name,
        moveState: rs.moveState,
        timeOfDay: this.env.time,
        loadProgress: this.started ? 1 : Math.min(0.99, this.chunks.loadedCount / target),
      });
    }
  }

  private onResize = (): void => {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.setAspect(w / h);
  };

  // WebGL context-loss recovery (Phase 5): the GPU process can drop the context
  // (driver reset, tab backgrounding, OOM). preventDefault() lets the browser
  // restore it; we pause the loop and show an overlay until it comes back, then
  // resume — three re-uploads geometry/materials lazily on the next render.
  private onContextLost = (e: Event): void => {
    e.preventDefault();
    this.contextLost = true;
    this.running = false;
    cancelAnimationFrame(this.rafId);
    useStore.getState().setSnapshot({ contextLost: true });
  };

  private onContextRestored = (): void => {
    this.contextLost = false;
    useStore.getState().setSnapshot({ contextLost: false });
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight, false);
    if (!this.running) {
      this.running = true;
      this.lastTime = performance.now();
      this.rafId = requestAnimationFrame(this.loop);
    }
  };

  /** Merge live progression + position back into the character for autosave. */
  snapshotCharacter(): CharacterSave | null {
    if (!this.character) return null;
    const ph = this.controller.physics;
    return {
      ...this.character,
      class: this.currentClass,
      level: this.combat.characterLevel,
      xp: this.combat.characterXp,
      gold: this.combat.characterGold,
      inventory: this.combat.characterInventory,
      equipment: this.combat.characterEquipment,
      discoveredWaystones: this.combat.characterWaystones,
      quests: this.quests.state,
      professions: this.gather.state.professions,
      materials: this.gather.state.materials,
      consumables: this.gather.state.consumables,
      learnedRecipes: this.gather.state.learnedRecipes,
      deeds: this.meta.state.deeds,
      mounts: this.mount.state.mounts,
      activeMount: this.mount.state.activeMount,
      bank: this.combat.characterBank,
      mail: this.combat.characterMail,
      bounties: this.bounties.state,
      x: ph.x,
      y: ph.y,
      z: ph.z,
      yaw: ph.yaw,
    };
  }

  /** Account-wide Path Points + perks for autosave (shared across characters). */
  snapshotAccount(): AccountSave {
    return { pathPoints: this.meta.state.pathPoints, perks: { ...this.meta.state.perks } };
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.onResize);
    this.canvas.removeEventListener('mousedown', this.onCanvasClick);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost as EventListener);
    this.canvas.removeEventListener(
      'webglcontextrestored',
      this.onContextRestored as EventListener,
    );
    this.input.dispose();
    this.chunks.dispose();
    this.propRenderer.dispose();
    this.entities.dispose();
    this.combat.dispose();
    this.env.dispose();
    this.mount.dispose();
    this.playerModel.dispose();
    this.renderer.dispose();
  }
}

// A frozen "no movement" intent source used while free-flying.
const freeInput = {
  isDown: () => false,
  wasTapped: () => false,
} as unknown as Input;
