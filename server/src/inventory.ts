// Server-authoritative player inventory (Phase 6 economy migration, Stage 1). The bag, gold, and
// worn equipment become server state — seeded from the persisted character on join, mutated by the
// authoritative paths (kill loot, ground-item pickup/drop, and — as the migration proceeds — vendor
// buy/sell and equip/unequip), and replicated to the owning client. This closes the item-dupe and
// gold-mint vectors that a client-authoritative bag left open.
//
// The gameplay LOGIC (bag capacity, equip swap, sell/buyback pricing) is the same the client ran;
// it's ported here so the server can validate every mutation. Pure and deterministic — no wall
// clock, no unseeded randomness. Item stats themselves are still trusted from the client that first
// looted/crafted them (loot is server-rolled; crafting validation lands with the profession stage).

import {
  BAG_SIZE,
  canEquip,
  sellPrice,
  EquipSlot,
  RING_SLOTS,
  CharacterClass,
  type ItemDef,
  type ItemStackSave,
} from '@pathlands/shared';

/** How many buyback slots a vendor remembers per player (mirrors the client). */
const BUYBACK_MAX = 12;

/** One remembered sale, re-purchasable at the price it sold for. */
export interface BuybackEntry {
  item: ItemDef;
  qty: number;
  price: number;
}

/** One player's authoritative economy state. */
export interface PlayerInventory {
  cls: CharacterClass;
  level: number;
  bag: ItemStackSave[];
  gold: number;
  equipment: Record<string, ItemDef>;
  buyback: BuybackEntry[];
  /** Extra bag slots from Path perks (Deep Pockets) — added to BAG_SIZE for this player's cap. */
  bagBonus: number;
  /** Set when the bag/gold/equipment changed since the last replication; cleared after sending. */
  dirty: boolean;
}

/** What a seed needs — the subset of a persisted character the economy owns. */
export interface InventorySeed {
  cls: string;
  level: number;
  inventory: ItemStackSave[];
  gold: number;
  equipment: Record<string, ItemDef>;
  /** Extra bag slots from account Path perks (0 for a guest). */
  bagBonus?: number;
}

function sanitizeClass(raw: string): CharacterClass {
  return (Object.values(CharacterClass) as string[]).includes(raw)
    ? (raw as CharacterClass)
    : CharacterClass.Warrior;
}

/** The authoritative inventories of every joined player, keyed by session id. */
export class Inventories {
  private readonly map = new Map<string, PlayerInventory>();

  /** Admit a player, seeding their bag/gold/equipment from the persisted character (or empty). */
  seed(id: string, seed: InventorySeed): void {
    this.map.set(id, {
      cls: sanitizeClass(seed.cls),
      level: Math.max(1, Math.floor(seed.level)),
      bag: seed.inventory.map((s) => ({ item: s.item, qty: Math.max(1, Math.floor(s.qty)) })),
      gold: Math.max(0, Math.floor(seed.gold)),
      equipment: { ...seed.equipment },
      buyback: [],
      bagBonus: Math.max(0, Math.floor(seed.bagBonus ?? 0)),
      dirty: true, // replicate the seeded state on the first broadcast
    });
  }

  remove(id: string): void {
    this.map.delete(id);
  }

  get(id: string): PlayerInventory | null {
    return this.map.get(id) ?? null;
  }

  /** The authoritative bag capacity for a player (base slots + their Deep-Pockets bonus). */
  bagCap(id: string): number {
    const inv = this.map.get(id);
    return inv === undefined ? BAG_SIZE : BAG_SIZE + inv.bagBonus;
  }

  /** Whether the player's bag has room for one more stack. */
  hasRoom(id: string): boolean {
    const inv = this.map.get(id);
    return inv !== undefined && inv.bag.length < BAG_SIZE + inv.bagBonus;
  }

  /**
   * Add a looted / picked-up / crafted stack to the bag. Returns whether it fit (a full bag
   * rejects it — the caller decides what to do; for a ground pickup the item is put back). Marks
   * the inventory dirty on success.
   */
  addStack(id: string, item: ItemDef, qty: number): boolean {
    const inv = this.map.get(id);
    if (inv === undefined) return false;
    if (inv.bag.length >= BAG_SIZE + inv.bagBonus) return false;
    inv.bag.push({ item, qty: Math.max(1, Math.floor(qty)) });
    inv.dirty = true;
    return true;
  }

  /** Credit gold (kill reward / vendor sale / quest reward). */
  addGold(id: string, amount: number): void {
    const inv = this.map.get(id);
    if (inv === undefined || amount <= 0) return;
    inv.gold += Math.floor(amount);
    inv.dirty = true;
  }

  /** Debit gold if affordable (vendor buy / travel fee / mount). Returns whether it was paid. */
  spendGold(id: string, amount: number): boolean {
    const inv = this.map.get(id);
    if (inv === undefined || amount < 0 || inv.gold < amount) return false;
    inv.gold -= Math.floor(amount);
    inv.dirty = true;
    return true;
  }

  /**
   * Remove a bag stack by index (a drop). Returns the removed stack, or null for an out-of-range
   * slot. The server validates the index against its OWN bag, so a client can't drop what it doesn't
   * hold — the authoritative anti-dup for the trade economy.
   */
  removeStackAt(id: string, index: number): ItemStackSave | null {
    const inv = this.map.get(id);
    if (inv === undefined || index < 0 || index >= inv.bag.length) return null;
    const removed = inv.bag.splice(index, 1)[0];
    if (removed === undefined) return null;
    inv.dirty = true;
    return removed;
  }

  /**
   * Find and remove the FIRST bag stack matching an item id + qty (a drop identified by content, for
   * clients that don't send an index). Returns the removed stack, or null if no match. Content-match
   * is a transitional convenience; the index path is preferred.
   */
  removeMatchingStack(id: string, itemId: string, qty: number): ItemStackSave | null {
    const inv = this.map.get(id);
    if (inv === undefined) return null;
    const idx = inv.bag.findIndex((s) => s.item.id === itemId && s.qty === qty);
    if (idx < 0) return null;
    return this.removeStackAt(id, idx);
  }

  /** Equip the bag item at `index` (rings auto-pick a free finger). Returns whether it equipped. */
  equip(id: string, index: number): boolean {
    const inv = this.map.get(id);
    if (inv === undefined) return false;
    const stack = inv.bag[index];
    if (stack === undefined) return false;
    const item = stack.item;
    if (!canEquip(inv.cls, inv.level, item)) return false;
    let slot: string = item.slot;
    if (slot === EquipSlot.Ring1 || slot === EquipSlot.Ring2) {
      slot = RING_SLOTS.find((s) => !inv.equipment[s]) ?? EquipSlot.Ring1;
    }
    const prev = inv.equipment[slot];
    inv.equipment[slot] = item;
    if (stack.qty > 1) stack.qty -= 1;
    else inv.bag.splice(index, 1);
    if (prev) inv.bag.push({ item: prev, qty: 1 });
    inv.dirty = true;
    return true;
  }

  /** Unequip `slot` back to the bag (if there's room). Returns whether it unequipped. */
  unequip(id: string, slot: string): boolean {
    const inv = this.map.get(id);
    if (inv === undefined) return false;
    const item = inv.equipment[slot];
    if (item === undefined) return false;
    if (inv.bag.length >= BAG_SIZE + inv.bagBonus) return false;
    delete inv.equipment[slot];
    inv.bag.push({ item, qty: 1 });
    inv.dirty = true;
    return true;
  }

  /** Sell the bag item at `index` for its sale value, remembering it for buyback. */
  sell(id: string, index: number): boolean {
    const inv = this.map.get(id);
    if (inv === undefined) return false;
    const stack = inv.bag[index];
    if (stack === undefined) return false;
    const price = sellPrice(stack.item, stack.qty);
    inv.gold += price;
    inv.bag.splice(index, 1);
    inv.buyback.unshift({ item: stack.item, qty: stack.qty, price });
    if (inv.buyback.length > BUYBACK_MAX) inv.buyback.pop();
    inv.dirty = true;
    return true;
  }

  /** Buy a vendor stock item (validated stock + price supplied by the caller). */
  buy(id: string, item: ItemDef, price: number): 'ok' | 'full' | 'poor' | 'gone' {
    const inv = this.map.get(id);
    if (inv === undefined) return 'gone';
    if (inv.bag.length >= BAG_SIZE + inv.bagBonus) return 'full';
    if (inv.gold < price) return 'poor';
    inv.gold -= price;
    inv.bag.push({ item, qty: 1 });
    inv.dirty = true;
    return 'ok';
  }

  /** Buy back a previously-sold stack at `index` for the price it sold for. */
  buyback(id: string, index: number): 'ok' | 'full' | 'poor' | 'gone' {
    const inv = this.map.get(id);
    if (inv === undefined) return 'gone';
    const entry = inv.buyback[index];
    if (entry === undefined) return 'gone';
    if (inv.bag.length >= BAG_SIZE + inv.bagBonus) return 'full';
    if (inv.gold < entry.price) return 'poor';
    inv.gold -= entry.price;
    inv.bag.push({ item: entry.item, qty: entry.qty });
    inv.buyback.splice(index, 1);
    inv.dirty = true;
    return 'ok';
  }

  /** Whether the inventory changed since the last `markClean`. */
  isDirty(id: string): boolean {
    return this.map.get(id)?.dirty === true;
  }

  markClean(id: string): void {
    const inv = this.map.get(id);
    if (inv !== undefined) inv.dirty = false;
  }
}
