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
  type VoxelSampler,
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
import { useStore, type GameCommands } from './store.js';

// Brookhollow plaza, just north of the fountain (which sits at 1536,1536).
const SPAWN_X = 1536.5;
const SPAWN_Z = 1524.5;
const FREE_FLY_SPEED = 28;
const MAX_FRAME_DT = 0.1;

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
  private readonly character: CharacterSave | null;

  private accumulator = 0;
  private lastTime = 0;
  private rafId = 0;
  private fps = 60;
  private statsTimer = 0;
  private running = true;
  private started = false;

  constructor(canvas: HTMLCanvasElement, character: CharacterSave | null = null) {
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
          }
        : undefined,
    );

    this.registerCommands();
    window.addEventListener('resize', this.onResize);
    this.canvas.addEventListener('mousedown', this.onCanvasClick);

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
        this.chunks.setRadius(chunks);
        this.env.setViewDistance(chunks);
        useStore.getState().setSnapshot({ viewDistance: chunks });
      },
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

    if (this.input.wasTapped('KeyF')) this.toggleFreeFly();
    if (this.input.wasTapped('KeyM')) useStore.getState().toggleMap();
    if (this.input.wasTapped('Backquote')) useStore.getState().toggleDev();
    if (this.input.wasTapped('KeyI') || this.input.wasTapped('KeyC')) {
      useStore.getState().toggleChar();
    }

    // Combat: Tab cycles target, digits cast hotbar slots, R toggles auto-attack,
    // Enter releases spirit on death.
    if (this.input.wasTapped('Tab')) this.combat.cycleTarget();
    if (this.input.wasTapped('KeyR')) this.combat.toggleAutoAttack();
    if (this.input.wasTapped('Enter')) this.combat.releaseSpirit();
    for (let i = 0; i < 10; i++) {
      const code = i === 9 ? 'Digit0' : `Digit${i + 1}`;
      if (this.input.wasTapped(code)) this.combat.castSlot(i);
    }

    // Interact with E: advance dialogue → attune/use a Waystone → talk to an NPC.
    if (this.input.wasTapped('KeyE')) {
      const store = useStore.getState();
      if (store.dialogue) {
        store.advanceDialogue();
      } else if (!this.combat.interactWaystone()) {
        const npc = this.entities.interactNearest(
          this.controller.physics.x,
          this.controller.physics.z,
        );
        if (npc) store.openDialogue(npc.name, npc.dialogue);
      }
    }
    if (this.input.wasTapped('Escape')) {
      useStore.getState().closeDialogue();
      useStore.getState().closeTravel();
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
      if (active) {
        this.controller.tick(this.sampler, this.input, this.camera.yaw, TICK_DT);
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

    // Player model follows the interpolated state.
    this.playerModel.setTransform(rs.x, rs.y, rs.z, rs.yaw);
    this.playerModel.setClip(rs.moveState);
    this.playerModel.group.visible = this.camera.mode === 'thirdPerson';
    this.playerModel.update(dt);

    this.camera.update(rs.x, rs.y, rs.z, this.sampler.isSolid);
    this.env.update(dt, this.camera.camera.position);
    this.chunks.update(rs.x, rs.z);
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
      x: ph.x,
      y: ph.y,
      z: ph.z,
      yaw: ph.yaw,
    };
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.onResize);
    this.canvas.removeEventListener('mousedown', this.onCanvasClick);
    this.input.dispose();
    this.chunks.dispose();
    this.propRenderer.dispose();
    this.entities.dispose();
    this.combat.dispose();
    this.env.dispose();
    this.playerModel.dispose();
    this.renderer.dispose();
  }
}

// A frozen "no movement" intent source used while free-flying.
const freeInput = {
  isDown: () => false,
  wasTapped: () => false,
} as unknown as Input;
