// Server-authoritative professions (Phase 6 profession migration #139). Each player's gathering
// skills, material stash, crafted consumables, and learned discovery recipes become server state:
// seeded from the persisted character on join, advanced only by the authoritative gather / fish /
// craft / use actions, and replicated to the owning client (which renders a pure mirror).
//
// The gameplay LOGIC is the pure `shared/professions` engine (gatherNode / rollFish / craft), reused
// here unchanged — it was written to run on both sides (deterministic, seeded RNG, no wall-clock).
// This model owns per-player state, the server-owned RNG stream (so yields / crafts can't be forged
// or predicted from a client seed), per-player node depletion (the anti-farm rate limit), and the
// per-action notices the client mirror plays. The gateway resolves WHICH node is in range (it has the
// world + the player's authoritative position) and hands the model the candidates; the model owns
// skill-gating, depletion, and the roll.

import {
  canGather,
  consumableById,
  craft,
  gatherNode,
  initialSkills,
  makeRng,
  recipeById,
  rollFish,
  WORLD_SEED,
  type ConsumableEffect,
  type GeneratedItemSpec,
  type NetProfNotice,
  type Profession,
} from '@pathlands/shared';

/** Defensive bounds on an uploaded (potentially crafted) profession blob — a forged save can't seed
 *  an oversized stash / recipe set (the id-space of real materials + recipes is tiny). */
const MAX_STASH_KINDS = 128;
const MAX_LEARNED = 128;
const SKILL_MIN = 1;
const SKILL_MAX = 100;

/** One gather-node candidate near a player, resolved by the gateway from the deterministic worldgen
 *  scatter + the player's authoritative position. The gateway sorts these nearest-first; the model
 *  gathers the first one that is both skill-eligible and not depleted (mirroring the client's pick). */
export interface GatherCandidate {
  prof: Profession;
  tier: number;
  /** Stable node key (rounded world x,z) — the depletion key, matching the client's key. */
  key: string;
}

/** The outcome of a craft: nothing (couldn't craft), a stash output already banked (material /
 *  consumable), or a gear spec the gateway forges + grants server-side (retiring the old trusted
 *  `claimReward` bridge). `seq` is the RNG stream position for a deterministic, unique gear roll. */
export type CraftOutcome =
  { kind: 'none' } | { kind: 'stash' } | { kind: 'gear'; spec: GeneratedItemSpec; seq: number };

interface PlayerProf {
  skills: Record<string, number>;
  materials: Record<string, number>;
  consumables: Record<string, number>;
  learned: Set<string>;
  /** node key → sim tick at which it respawns (per-player depletion — the anti-farm rate limit). */
  depleted: Map<string, number>;
  /** RNG stream key (account id or session id) — the server owns the yield / craft randomness. */
  key: string;
  /** Monotonic action counter feeding the RNG stream, so repeated actions never repeat a roll. */
  seq: number;
  /** Sim tick of this player's last gather / fish, for the action-cadence gate. */
  lastActionTick: number;
  /** What changed since the last replication (the client mirror plays these), cleared on markClean. */
  notices: NetProfNotice[];
  /** Set when the state changed since the last replication; cleared after sending. */
  dirty: boolean;
}

/** The authoritative profession state of every joined player, keyed by session id. */
export class Professions {
  private readonly map = new Map<string, PlayerProf>();

  /**
   * Admit a player, seeding their profession state from the persisted character (or defaults for a
   * guest). `key` is the RNG-stream key (the account id, or the session id for a guest) so the
   * server-owned gather / craft rolls are deterministic per player yet unpredictable to the client.
   */
  seed(
    id: string,
    key: string,
    blob: {
      professions?: Record<string, number> | null;
      materials?: Record<string, number> | null;
      consumables?: Record<string, number> | null;
      learnedRecipes?: readonly string[] | null;
    } | null,
  ): void {
    this.map.set(id, {
      skills: cloneSkills(blob?.professions),
      materials: cloneStash(blob?.materials),
      consumables: cloneStash(blob?.consumables),
      learned: new Set((blob?.learnedRecipes ?? []).slice(0, MAX_LEARNED).map((s) => String(s))),
      depleted: new Map(),
      key,
      seq: 0,
      lastActionTick: -Infinity,
      notices: [],
      dirty: true, // replicate the seeded state on the first broadcast
    });
  }

  remove(id: string): void {
    this.map.delete(id);
  }

  /** The player's profession state for replication + persistence, or null if not joined. */
  get(id: string): {
    skills: Record<string, number>;
    materials: Record<string, number>;
    consumables: Record<string, number>;
    learned: string[];
  } | null {
    const p = this.map.get(id);
    if (p === undefined) return null;
    return {
      skills: { ...p.skills },
      materials: { ...p.materials },
      consumables: { ...p.consumables },
      learned: [...p.learned],
    };
  }

  /**
   * Gather the nearest eligible node among `candidates` (nearest-first). Skips nodes above the
   * player's skill or still depleted (per-player), then runs the pure `gatherNode` on a server-owned
   * RNG, banks the yields, levels the skill, depletes the node for `respawnTicks`, and records a
   * gather notice. A per-player cadence gate (`minActionTicks` since the last gather / fish) bounds
   * the farm rate even where nodes are dense. Returns whether anything changed.
   */
  gather(
    id: string,
    candidates: readonly GatherCandidate[],
    tick: number,
    respawnTicks: number,
    minActionTicks: number,
  ): boolean {
    const p = this.map.get(id);
    if (p === undefined) return false;
    if (tick - p.lastActionTick < minActionTicks) return false; // too soon since the last action
    for (const c of candidates) {
      const skill = p.skills[c.prof] ?? SKILL_MIN;
      if (!canGather(skill, c.tier)) continue; // above the player's skill — try the next node
      const respawnAt = p.depleted.get(c.key);
      if (respawnAt !== undefined && respawnAt > tick) continue; // still depleted — try the next
      const rng = makeRng(WORLD_SEED, 'gather', p.key, String(p.seq++));
      const res = gatherNode(rng, c.prof, c.tier, skill);
      if (res === null) continue; // no primary material for this node (shouldn't happen) — skip
      for (const y of res.yields) {
        p.materials[y.materialId] = (p.materials[y.materialId] ?? 0) + y.qty;
      }
      const skillUp = res.newSkill > skill;
      p.skills[c.prof] = res.newSkill;
      p.depleted.set(c.key, tick + respawnTicks);
      p.lastActionTick = tick;
      this.pruneDepleted(p, tick);
      p.notices.push({
        kind: 'gather',
        prof: c.prof,
        yields: res.yields.map((y) => ({ id: y.materialId, qty: y.qty })),
        skill: res.newSkill,
        skillUp,
      });
      p.dirty = true;
      return true;
    }
    return false;
  }

  /**
   * Resolve a fishing catch at a water `tier` (the gateway computed it from the player's biome).
   * Fishing has no node to deplete, so the cadence gate is the only rate limit. Runs `rollFish` on a
   * server-owned RNG, banks the catch, levels Fishing, records a gather notice. Returns whether it
   * changed.
   */
  fish(id: string, tier: number, tick: number, minActionTicks: number): boolean {
    const p = this.map.get(id);
    if (p === undefined) return false;
    if (tick - p.lastActionTick < minActionTicks) return false;
    const skill = p.skills.fishing ?? SKILL_MIN;
    const rng = makeRng(WORLD_SEED, 'fish', p.key, String(p.seq++));
    const res = rollFish(rng, tier, skill);
    for (const y of res.yields) {
      p.materials[y.materialId] = (p.materials[y.materialId] ?? 0) + y.qty;
    }
    const skillUp = res.newSkill > skill;
    p.skills.fishing = res.newSkill;
    p.lastActionTick = tick;
    p.notices.push({
      kind: 'gather',
      prof: 'fishing',
      yields: res.yields.map((y) => ({ id: y.materialId, qty: y.qty })),
      skill: res.newSkill,
      skillUp,
    });
    p.dirty = true;
    return true;
  }

  /**
   * Craft a recipe: the pure `craft` engine re-validates skill + inputs + discovery-learned server-
   * side and consumes the inputs from the stash (mutated in place), so a cheat client can't craft
   * what it lacks. A material / consumable output is banked here; a gear output is returned as a spec
   * for the gateway to forge + grant (server-authoritative — the old trusted `claimReward` is gone).
   */
  craftRecipe(id: string, recipeId: string): CraftOutcome {
    const p = this.map.get(id);
    if (p === undefined) return { kind: 'none' };
    const recipe = recipeById(recipeId);
    if (recipe === undefined) return { kind: 'none' };
    const skill = p.skills[recipe.profession] ?? SKILL_MIN;
    const rng = makeRng(WORLD_SEED, 'craft', p.key, recipeId, String(p.seq++));
    const res = craft(rng, recipe, p.materials, skill, p.learned);
    if (res === null) return { kind: 'none' };
    p.skills[recipe.profession] = res.newSkill;
    if (res.discovered !== undefined) p.learned.add(res.discovered);
    const notice: NetProfNotice = { kind: 'craft', recipe: recipeId };
    if (res.discovered !== undefined) notice.discovered = res.discovered;
    p.notices.push(notice);
    p.dirty = true;
    const out = res.output;
    if (out.kind === 'material') {
      p.materials[out.id] = (p.materials[out.id] ?? 0) + out.qty;
      return { kind: 'stash' };
    }
    if (out.kind === 'consumable') {
      p.consumables[out.id] = (p.consumables[out.id] ?? 0) + out.qty;
      return { kind: 'stash' };
    }
    // Gear: the gateway forges it for the player's class on its own RNG stream (keyed on `seq`) and
    // grants it into the authoritative bag (overflow-safe). The inputs are already consumed above.
    return {
      kind: 'gear',
      spec: { slot: out.slot, rarity: out.rarity, reqLevel: out.reqLevel },
      seq: p.seq++,
    };
  }

  /**
   * Drink a consumable: decrement the stash (always, matching the client's fire-and-forget) and
   * return its effect for the gateway to apply to the player's combat entity, or null if none is
   * held. Records a `use` notice so the client floats the effect label (the HP / resource / buff
   * arrives on the combat-self frame).
   */
  useConsumable(id: string, consumableId: string): ConsumableEffect | null {
    const p = this.map.get(id);
    if (p === undefined) return null;
    const have = p.consumables[consumableId] ?? 0;
    if (have <= 0) return null;
    const def = consumableById(consumableId);
    if (def === undefined) return null;
    if (have - 1 <= 0) delete p.consumables[consumableId];
    else p.consumables[consumableId] = have - 1;
    p.notices.push({ kind: 'use', id: consumableId });
    p.dirty = true;
    return def.effect;
  }

  isDirty(id: string): boolean {
    return this.map.get(id)?.dirty === true;
  }

  /** Snapshot the frame payload (state + notices) for replication, or null if not joined. */
  frame(id: string): {
    skills: Record<string, number>;
    materials: Record<string, number>;
    consumables: Record<string, number>;
    learned: string[];
    notices: NetProfNotice[];
  } | null {
    const p = this.map.get(id);
    if (p === undefined) return null;
    return {
      skills: { ...p.skills },
      materials: { ...p.materials },
      consumables: { ...p.consumables },
      learned: [...p.learned],
      notices: [...p.notices],
    };
  }

  markClean(id: string): void {
    const p = this.map.get(id);
    if (p !== undefined) {
      p.dirty = false;
      p.notices = [];
    }
  }

  /** Drop already-respawned depletion entries so the per-player map can't grow without bound as a
   *  player roams (bounded by nodes visited within one respawn window). */
  private pruneDepleted(p: PlayerProf, tick: number): void {
    for (const [k, t] of p.depleted) if (t <= tick) p.depleted.delete(k);
  }
}

/** Clone + bound a skills map, clamping each to [1, 100] (a forged save can't push a skill past the
 *  cap, which would permanently unlock mastery / out-of-tier gathering). Defaults to fresh skills. */
function cloneSkills(src: Record<string, number> | null | undefined): Record<string, number> {
  const out = initialSkills();
  if (src) {
    for (const [k, v] of Object.entries(src)) {
      if (k in out && typeof v === 'number' && Number.isFinite(v)) {
        out[k] = Math.max(SKILL_MIN, Math.min(SKILL_MAX, Math.floor(v)));
      }
    }
  }
  return out;
}

/** Clone + bound a stash (material / consumable) map: positive integer counts, capped kind count. */
function cloneStash(src: Record<string, number> | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!src) return out;
  let kinds = 0;
  for (const [k, v] of Object.entries(src)) {
    if (kinds >= MAX_STASH_KINDS) break;
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
      out[k] = Math.floor(v);
      kinds += 1;
    }
  }
  return out;
}
