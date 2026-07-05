// Ambient NPC & wildlife entities: deterministic spawns from the world, driven by
// the shared wander AI, rendered as ModelObjects. Handles streaming spawn/despawn
// around the player, nameplate projection, and talk-to-NPC interaction.

import * as THREE from 'three';
import {
  type World,
  makeRng,
  wanderStep,
  makeWanderState,
  buildNpc,
  buildCreature,
  CHUNK_SIZE,
  SEA_LEVEL,
  type WanderState,
  type WanderConfig,
  type NpcSpawn,
  type CreatureKind,
} from '@pathlands/shared';
import { ModelObject } from './voxelModel.js';
import type { Nameplate } from '../game/store.js';

const NPC_RADIUS = 72;
const WILDLIFE_CHUNK_RADIUS = 3;

const CFG: Record<string, WanderConfig> = {
  villager: { homeRadius: 6, speed: 1.0, faceRadius: 6 },
  guard: { homeRadius: 4, speed: 0.9, faceRadius: 6 },
  vendor: { homeRadius: 3, speed: 0.8, faceRadius: 6 },
  deer: { homeRadius: 20, speed: 2.2, faceRadius: 12 },
  direStag: { homeRadius: 24, speed: 2.4, faceRadius: 14 },
  rabbit: { homeRadius: 12, speed: 3.0, faceRadius: 6 },
  bird: { homeRadius: 10, speed: 1.8, faceRadius: 5 },
  fish: { homeRadius: 8, speed: 1.4, faceRadius: 0 },
};

interface Entity {
  key: string;
  obj: ModelObject;
  wander: WanderState;
  cfg: WanderConfig;
  isFish: boolean;
  npc?: NpcSpawn;
}

export class EntityManager {
  private readonly scene: THREE.Scene;
  private readonly world: World;
  private readonly entities = new Map<string, Entity>();
  private readonly loadedChunks = new Set<number>();
  private readonly npcSpawns: NpcSpawn[];
  private readonly tmpVec = new THREE.Vector3();
  private nameplateTimer = 0;

  constructor(scene: THREE.Scene, world: World) {
    this.scene = scene;
    this.world = world;
    this.npcSpawns = world.authored.npcSpawns();
  }

  private heightAt = (x: number, z: number): number => this.world.heightAt(x, z);
  private fishHeight = (): number => SEA_LEVEL - 1;

  private spawn(
    key: string,
    obj: ModelObject,
    x: number,
    y: number,
    z: number,
    kind: string,
    npc?: NpcSpawn,
  ): void {
    const rng = makeRng(this.world.seed, 'ent', key);
    const wander = makeWanderState(x, y, z, rng);
    this.scene.add(obj.group);
    this.entities.set(key, {
      key,
      obj,
      wander,
      cfg: CFG[kind] ?? CFG.villager!,
      isFish: kind === 'fish',
      ...(npc ? { npc } : {}),
    });
  }

  private despawn(key: string): void {
    const e = this.entities.get(key);
    if (!e) return;
    this.scene.remove(e.obj.group);
    e.obj.dispose();
    this.entities.delete(key);
  }

  update(
    dt: number,
    px: number,
    pz: number,
    camera: THREE.PerspectiveCamera,
    sw: number,
    sh: number,
  ): void {
    // --- NPC spawn/despawn by distance ---
    for (const npc of this.npcSpawns) {
      const near = Math.hypot(npc.x - px, npc.z - pz) < NPC_RADIUS;
      const has = this.entities.has(npc.id);
      if (near && !has) {
        const obj = new ModelObject(buildNpc(npc.kind, npc.seed));
        this.spawn(npc.id, obj, npc.x, npc.y, npc.z, npc.kind, npc);
      } else if (!near && has) {
        this.despawn(npc.id);
      }
    }

    // --- Wildlife spawn/despawn by chunk ---
    const pcx = Math.floor(px / CHUNK_SIZE);
    const pcz = Math.floor(pz / CHUNK_SIZE);
    const wanted = new Set<number>();
    for (let dz = -WILDLIFE_CHUNK_RADIUS; dz <= WILDLIFE_CHUNK_RADIUS; dz++) {
      for (let dx = -WILDLIFE_CHUNK_RADIUS; dx <= WILDLIFE_CHUNK_RADIUS; dx++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        const ck = cx * 4096 + cz;
        wanted.add(ck);
        if (!this.loadedChunks.has(ck)) {
          this.loadedChunks.add(ck);
          const spawns = this.world.wildlifeChunk(cx, cz);
          spawns.forEach((w, i) => {
            const key = `wl:${ck}:${i}`;
            const obj = new ModelObject(buildCreature(w.kind as CreatureKind));
            this.spawn(key, obj, w.x, w.y, w.z, w.kind, undefined);
          });
        }
      }
    }
    // Unload wildlife chunks out of range.
    for (const ck of [...this.loadedChunks]) {
      if (!wanted.has(ck)) {
        this.loadedChunks.delete(ck);
        for (const key of [...this.entities.keys()]) {
          if (key.startsWith(`wl:${ck}:`)) this.despawn(key);
        }
      }
    }

    // --- Step wander + animate ---
    for (const e of this.entities.values()) {
      wanderStep(e.wander, dt, e.cfg, e.isFish ? this.fishHeight : this.heightAt, px, pz);
      e.obj.setTransform(e.wander.x, e.wander.y, e.wander.z, e.wander.yaw);
      e.obj.setClip(e.wander.moveState === 'walk' ? 'walk' : 'idle');
      e.obj.update(dt);
    }

    // --- Nameplates (NPCs only, ~10 Hz) ---
    this.nameplateTimer += dt;
    if (this.nameplateTimer >= 0.1) {
      this.nameplateTimer = 0;
      this.publishNameplates(camera, sw, sh);
    }
  }

  private publishNameplates(camera: THREE.PerspectiveCamera, sw: number, sh: number): void {
    const plates: Nameplate[] = [];
    for (const e of this.entities.values()) {
      if (!e.npc) continue;
      this.tmpVec.set(e.wander.x, e.wander.y + 2.2, e.wander.z);
      this.tmpVec.project(camera);
      if (this.tmpVec.z > 1 || this.tmpVec.z < -1) continue;
      if (Math.abs(this.tmpVec.x) > 1.1 || Math.abs(this.tmpVec.y) > 1.1) continue;
      plates.push({
        id: e.key,
        name: e.npc.name,
        sx: (this.tmpVec.x * 0.5 + 0.5) * sw,
        sy: (-this.tmpVec.y * 0.5 + 0.5) * sh,
      });
    }
    // Provided to the caller via getter; the game pushes to the store.
    this.nameplates = plates;
  }

  /** Latest projected NPC nameplates (updated ~10 Hz). */
  nameplates: Nameplate[] = [];

  /** Nearest talkable NPC within reach of (px,pz), or null. */
  interactNearest(px: number, pz: number): NpcSpawn | null {
    let best: NpcSpawn | null = null;
    let bestD = 4.5;
    for (const e of this.entities.values()) {
      if (!e.npc) continue;
      const d = Math.hypot(e.wander.x - px, e.wander.z - pz);
      if (d < bestD) {
        bestD = d;
        best = e.npc;
      }
    }
    return best;
  }

  dispose(): void {
    for (const key of [...this.entities.keys()]) this.despawn(key);
    this.loadedChunks.clear();
  }
}
