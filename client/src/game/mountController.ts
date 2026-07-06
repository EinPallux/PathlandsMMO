// Client mount orchestrator (GDD §7): owns which mounts the character has, the
// mount/dismount state and its rules, renders the ridden Wolf under the player, and
// hands the movement system a ground-speed multiplier. All the *rules* it enforces
// (level 20, outdoor-only, dismount the instant combat starts) become server-side
// checks in Phase 6; the speed itself flows through the MoveIntent the sim clamps.

import type * as THREE from 'three';
import {
  MOUNTS,
  BASE_MOUNT,
  MOUNT_MIN_LEVEL,
  mountById,
  mountForDeed,
  buildMountModel,
  type MountDef,
} from '@pathlands/shared';
import { ModelObject } from '../engine/voxelModel.js';
import type { CombatDirector } from './combatDirector.js';
import { useStore, type MountUi } from './store.js';
import type { RenderState } from './playerController.js';

/** World-metre offset that seats the rider on the Wolf's saddle. */
const RIDER_SEAT_Y = 0.95;

export class MountController {
  private readonly scene: THREE.Scene;
  private readonly combat: CombatDirector;
  private readonly owned: Set<string>;
  private activeId: string | null;
  private mounted = false;

  private model: ModelObject | null = null;
  private modelId: string | null = null;

  // Last known environment (updated each tick) → gates whether mounting is legal.
  private inCombat = false;
  private underground = false;
  private inWater = false;

  private toastSeq = 1;
  private lastPublishKey = '';

  constructor(
    scene: THREE.Scene,
    combat: CombatDirector,
    ownedMounts?: string[],
    activeMount?: string | null,
  ) {
    this.scene = scene;
    this.combat = combat;
    // Keep only ids that still resolve to a real mount def.
    this.owned = new Set((ownedMounts ?? []).filter((id) => mountById(id)));
    this.activeId =
      activeMount && this.owned.has(activeMount)
        ? activeMount
        : (this.owned.values().next().value ?? null);
    this.publish();
  }

  /** Owned mounts + the active skin, for the character autosave. */
  get state(): { mounts: string[]; activeMount: string | null } {
    return { mounts: [...this.owned], activeMount: this.activeId };
  }

  private activeMount(): MountDef | undefined {
    return this.activeId ? mountById(this.activeId) : undefined;
  }

  /** Ground-speed multiplier the game feeds into the movement intent (1 = on foot). */
  speedMult(): number {
    const m = this.mounted ? this.activeMount() : undefined;
    return m ? 1 + m.speedBonus : 1;
  }

  /** How far to raise the rider's model so they sit on the saddle (0 when on foot). */
  riderYOffset(): number {
    return this.mounted ? RIDER_SEAT_Y : 0;
  }

  isMounted(): boolean {
    return this.mounted;
  }

  // --- environment + rules ---------------------------------------------------

  /**
   * Called each tick with the player's current context. Auto-dismounts when the
   * mount rules break (entered combat, went underground/into a Hollow, or into
   * water) — GDD §7's "outdoor only, instant dismount on damage".
   */
  updateEnv(inCombat: boolean, underground: boolean, inWater: boolean): void {
    this.inCombat = inCombat;
    this.underground = underground;
    this.inWater = inWater;
    if (this.mounted) {
      const reason = inCombat ? 'combat' : underground ? 'indoors' : inWater ? 'water' : null;
      if (reason) this.dismount(reason);
    }
    this.maybeRepublish();
  }

  private blockReason(): string | null {
    if (this.owned.size === 0 || !this.activeId) return 'no mount';
    if (this.combat.characterLevel < MOUNT_MIN_LEVEL) return `requires level ${MOUNT_MIN_LEVEL}`;
    if (this.inCombat) return 'in combat';
    if (this.underground) return 'indoors';
    if (this.inWater) return 'in water';
    return null;
  }

  // --- player actions --------------------------------------------------------

  /** Toggle mount/dismount (bound to G). No-op with a hint if currently illegal. */
  toggle(): void {
    if (this.mounted) {
      this.dismount('dismount');
      return;
    }
    const reason = this.blockReason();
    if (reason) {
      this.toast(`Can't mount — ${reason}.`);
      return;
    }
    this.mounted = true;
    this.spawnModel();
    const m = this.activeMount();
    this.toast(`Mounted ${m?.name ?? 'mount'}.`);
    this.publish();
  }

  private dismount(reason: string): void {
    if (!this.mounted) return;
    this.mounted = false;
    this.despawnModel();
    if (reason === 'combat') this.toast('Dismounted — combat!');
    else if (reason === 'water') this.toast('Dismounted — deep water.');
    else if (reason === 'indoors') this.toast('Dismounted — no mounts indoors.');
    this.publish();
  }

  /** Buy the base Wolf (bound to the Character panel). Gold + level checked. */
  buyMount(): void {
    if (this.owned.has(BASE_MOUNT.id)) return;
    if (this.combat.characterLevel < MOUNT_MIN_LEVEL) {
      this.toast(`The stable won't sell until level ${MOUNT_MIN_LEVEL}.`);
      return;
    }
    const cost = BASE_MOUNT.source.kind === 'purchase' ? BASE_MOUNT.source.cost : 0;
    if (!this.combat.spendGold(cost)) {
      this.toast(`Not enough gold (need ${cost}).`);
      return;
    }
    this.owned.add(BASE_MOUNT.id);
    if (!this.activeId) this.activeId = BASE_MOUNT.id;
    this.toast(`Bought a ${BASE_MOUNT.name}! Press G to ride.`);
    this.publish();
  }

  /** Choose which owned skin to ride; swaps the live model if mounted. */
  selectMount(id: string): void {
    if (!this.owned.has(id) || id === this.activeId) return;
    this.activeId = id;
    if (this.mounted) this.spawnModel();
    this.publish();
  }

  /** Grant a Deed-unlocked skin (wired from MetaDirector.onDeedComplete). */
  grantSkinForDeed(deedId: string): void {
    const m = mountForDeed(deedId);
    if (!m || this.owned.has(m.id)) return;
    this.owned.add(m.id);
    if (!this.activeId) this.activeId = m.id;
    this.toast(`New mount earned: ${m.name}!`);
    this.publish();
  }

  // --- rendering -------------------------------------------------------------

  private spawnModel(): void {
    const m = this.activeMount();
    if (!m) return;
    if (this.modelId === m.modelId && this.model) return; // already the right skin
    this.despawnModel();
    const built = buildMountModel(m.modelId);
    if (!built) return;
    this.model = new ModelObject(built);
    this.modelId = m.modelId;
    this.scene.add(this.model.group);
  }

  private despawnModel(): void {
    if (this.model) {
      this.scene.remove(this.model.group);
      this.model.dispose();
      this.model = null;
      this.modelId = null;
    }
  }

  /** Place the ridden Wolf under the interpolated player state each frame. */
  render(rs: RenderState, dt: number, visible: boolean): void {
    if (!this.model) return;
    this.model.group.visible = this.mounted && visible;
    if (!this.mounted) return;
    this.model.setTransform(rs.x, rs.y, rs.z, rs.yaw);
    const clip =
      rs.moveState === 'run'
        ? 'run'
        : rs.moveState === 'walk'
          ? 'walk'
          : rs.moveState === 'jump'
            ? 'jump'
            : 'idle';
    this.model.setClip(clip);
    this.model.update(dt);
  }

  // --- store publishing ------------------------------------------------------

  /** The live buy-button state (canBuy + hint). Both depend on gold + level. */
  private buyState(): { cost: number; canBuy: boolean; buyHint: string } {
    const cost = BASE_MOUNT.source.kind === 'purchase' ? BASE_MOUNT.source.cost : 0;
    const level = this.combat.characterLevel;
    const gold = this.combat.characterGold;
    const hasBase = this.owned.has(BASE_MOUNT.id);
    const canBuy = !hasBase && level >= MOUNT_MIN_LEVEL && gold >= cost;
    const buyHint = hasBase
      ? ''
      : level < MOUNT_MIN_LEVEL
        ? `Requires level ${MOUNT_MIN_LEVEL}`
        : gold < cost
          ? `Costs ${cost} gold`
          : `${cost} gold`;
    return { cost, canBuy, buyHint };
  }

  private stateKey(buy: { canBuy: boolean; buyHint: string }): string {
    // The hint (not just canBuy) is in the key so it refreshes when the *reason*
    // a buy is blocked changes — e.g. crossing level 20 while still short on gold.
    return `${this.mounted}|${this.activeId}|${this.owned.size}|${buy.canBuy}|${buy.buyHint}`;
  }

  private maybeRepublish(): void {
    // The buy button depends on live gold/level, so republish when its answer (or
    // its reason) could have changed — but only then, to avoid a per-frame write.
    if (this.stateKey(this.buyState()) !== this.lastPublishKey) this.publish();
  }

  private publish(): void {
    const { cost, canBuy, buyHint } = this.buyState();
    const owned = MOUNTS.filter((m) => this.owned.has(m.id)).map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      active: m.id === this.activeId,
    }));
    const ui: MountUi = {
      ownsAny: this.owned.size > 0,
      mounted: this.mounted,
      activeId: this.activeId,
      reqLevel: MOUNT_MIN_LEVEL,
      cost,
      canBuy,
      buyHint,
      baseName: BASE_MOUNT.name,
      owned,
    };
    this.lastPublishKey = this.stateKey({ canBuy, buyHint });
    useStore.getState().setMount(ui);
  }

  private toast(text: string): void {
    const store = useStore.getState();
    store.setQuestToasts(
      [
        ...store.questToasts,
        { id: -3000 - this.toastSeq++, text, kind: 'progress' as const },
      ].slice(-4),
    );
  }

  dispose(): void {
    this.despawnModel();
  }
}
