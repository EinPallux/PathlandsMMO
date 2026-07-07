// Renders the server-authoritative dropped items lying in the world as small glowing motes —
// a floating, slowly-spinning gem colored by item rarity, easy to spot from a distance. It is a
// pure view of what the netcode replicates (NetWorldItem): the client never creates or removes a
// ground item, it only mirrors the set. Meshes are added/removed as items enter/leave interest.

import * as THREE from 'three';
import { RARITY_COLOR, type NetWorldItem } from '@pathlands/shared';

/** Colour for an item's rarity, with a safe amber fallback for unknown/absent rarities. A
 *  `constructor`/prototype-keyed rarity would resolve to a function, so require an actual number. */
function rarityColor(item: NetWorldItem['item']): number {
  const r = (item as { rarity?: string }).rarity;
  const c = r === undefined ? undefined : RARITY_COLOR[r as keyof typeof RARITY_COLOR];
  return typeof c === 'number' ? c : 0xffcc55;
}

export class GroundItemRenderer {
  private readonly scene: THREE.Scene;
  private readonly group = new THREE.Group();
  private readonly meshes = new Map<string, THREE.Mesh>();
  /** One shared octahedron for every mote (a little faceted gem). */
  private readonly geom = new THREE.OctahedronGeometry(0.28, 0);
  /** Materials cached by colour so N motes of one rarity share one material. */
  private readonly materials = new Map<number, THREE.MeshStandardMaterial>();
  /** Base Y per mote (the drop height); the render adds a bob on top. */
  private readonly baseY = new Map<string, number>();
  private clock = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.group.name = 'groundItems';
    this.scene.add(this.group);
  }

  private materialFor(color: number): THREE.MeshStandardMaterial {
    let mat = this.materials.get(color);
    if (mat === undefined) {
      mat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.6,
        roughness: 0.35,
        metalness: 0.1,
      });
      this.materials.set(color, mat);
    }
    return mat;
  }

  /** Reconcile the mote set with the replicated items, then animate (spin + bob). */
  sync(items: readonly NetWorldItem[], dt: number): void {
    this.clock += dt;
    const seen = new Set<string>();
    for (const wi of items) {
      seen.add(wi.id);
      let mesh = this.meshes.get(wi.id);
      if (mesh === undefined) {
        mesh = new THREE.Mesh(this.geom, this.materialFor(rarityColor(wi.item)));
        this.meshes.set(wi.id, mesh);
        this.group.add(mesh);
      }
      mesh.position.set(wi.x, wi.y + 0.6, wi.z);
      this.baseY.set(wi.id, wi.y + 0.6);
    }
    // Remove motes for items that left interest / were picked up / despawned.
    for (const [id, mesh] of this.meshes) {
      if (seen.has(id)) continue;
      this.group.remove(mesh);
      this.meshes.delete(id);
      this.baseY.delete(id);
    }
    // Animate: a gentle spin + a bob so drops read as "loot" even when small on screen.
    const bob = Math.sin(this.clock * 2.5) * 0.12;
    for (const [id, mesh] of this.meshes) {
      mesh.rotation.y = this.clock * 1.4;
      mesh.position.y = (this.baseY.get(id) ?? mesh.position.y) + bob;
    }
  }

  /** Drop every mote (a fresh session / disconnect clears the world view). */
  clear(): void {
    for (const mesh of this.meshes.values()) this.group.remove(mesh);
    this.meshes.clear();
    this.baseY.clear();
  }

  dispose(): void {
    this.clear();
    this.scene.remove(this.group);
    this.geom.dispose();
    for (const mat of this.materials.values()) mat.dispose();
    this.materials.clear();
  }
}
