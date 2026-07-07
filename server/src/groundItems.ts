// Droppable ground items: the world's authoritative loot-on-the-floor, and the entire
// player-to-player trade surface now that bank / mail / a trade window are scrapped. A player
// drops a bag stack, it becomes a WorldItem at their position, and any nearby player can walk
// over and pick it up (first-come-wins). Unclaimed stacks despawn after a fixed lifetime.
//
// This is authoritative server state (like enemies): the client never invents or removes a
// ground item, it only renders what is replicated and asks to drop / pick up. The atomic
// server-side removal on pickup is the anti-duplication guarantee — two players racing for one
// stack, exactly one wins.
//
// No wall-clock and no unseeded randomness here: lifetime is measured in SIM TICKS (passed in),
// and ids are a plain monotonic counter (an integration-edge concern, not sim state).

import type { ItemDef, NetWorldItem } from '@pathlands/shared';

/** One stack of items lying in the world. */
export interface WorldItem {
  readonly id: string;
  readonly item: ItemDef;
  readonly qty: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Sim tick the stack was dropped — despawn fires at `dropTick + ttlTicks`. */
  readonly dropTick: number;
}

/**
 * Hard cap on live ground items across the whole world — a memory / replication backstop against
 * a client that spam-drops. At the cap the OLDEST stack is despawned to make room, so a flood of
 * junk can't wall off the world with loot forever.
 */
const MAX_GROUND_ITEMS = 2048;

export class GroundItems {
  private readonly items = new Map<string, WorldItem>();
  private nextId = 1;

  /** Drop a stack at (x,y,z) as of `tick`. Returns the created WorldItem. */
  drop(item: ItemDef, qty: number, x: number, y: number, z: number, tick: number): WorldItem {
    // At the cap, evict the oldest (lowest dropTick, then lowest id) so we never grow unbounded.
    if (this.items.size >= MAX_GROUND_ITEMS) {
      let oldest: WorldItem | null = null;
      for (const wi of this.items.values()) {
        if (oldest === null || wi.dropTick < oldest.dropTick) oldest = wi;
      }
      if (oldest !== null) this.items.delete(oldest.id);
    }
    const wi: WorldItem = { id: `g${this.nextId++}`, item, qty, x, y, z, dropTick: tick };
    this.items.set(wi.id, wi);
    return wi;
  }

  /** The ground item with this id, or null. */
  get(id: string): WorldItem | null {
    return this.items.get(id) ?? null;
  }

  /**
   * Remove a ground item if it exists AND a player at (px,pz) is within `radius`. Returns the
   * removed stack (so the caller can grant it), or null when the item is gone or out of range.
   * The removal is atomic against concurrent pickups — the second caller sees a `null`.
   */
  tryPickup(id: string, px: number, pz: number, radius: number): WorldItem | null {
    const wi = this.items.get(id);
    if (wi === undefined) return null;
    const dx = wi.x - px;
    const dz = wi.z - pz;
    if (dx * dx + dz * dz > radius * radius) return null; // too far — not a valid pickup
    this.items.delete(id);
    return wi;
  }

  /**
   * Despawn every stack past its lifetime as of `tick` (ttl in sim ticks). Returns the removed
   * ids so the gateway can push them to clients' `gone` lists.
   */
  expire(tick: number, ttlTicks: number): string[] {
    const gone: string[] = [];
    for (const wi of this.items.values()) {
      if (tick - wi.dropTick >= ttlTicks) gone.push(wi.id);
    }
    for (const id of gone) this.items.delete(id);
    return gone;
  }

  /** Every live ground item (for building the replication interest index). */
  all(): WorldItem[] {
    return [...this.items.values()];
  }

  /** Project every ground item to the wire shape. */
  netItems(): NetWorldItem[] {
    return this.all().map(toNet);
  }

  /** Current count (tests / status). */
  get size(): number {
    return this.items.size;
  }
}

/** Project one WorldItem to its replication view. */
export function toNet(wi: WorldItem): NetWorldItem {
  return { id: wi.id, item: wi.item, qty: wi.qty, x: wi.x, y: wi.y, z: wi.z };
}
