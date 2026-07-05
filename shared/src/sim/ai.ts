// Enemy AI + the per-tick simulation orchestrator. Deterministic: enemies aggro,
// chase, leash home, auto-attack (resolved in combat.ts), and use abilities off a
// seeded cadence. ARCH §3 order: tick++ → AI → combat resolution. Pure.

import { TICK_RATE } from '../core/constants.js';
import { hashFloat2 } from '../core/rng.js';
import {
  type CombatState,
  type CombatContext,
  resolveTick,
  tryCast,
  moveSpeedMultiplier,
} from './combat.js';
import { isAlive, type CombatEntity } from './entity.js';
import { skillById } from '../data/skills.js';

const TICK_DT = 1 / TICK_RATE;

function dist2D(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

/** Nearest alive player within radius of (x,z), or null. */
function nearestPlayer(
  state: CombatState,
  x: number,
  z: number,
  radius: number,
): CombatEntity | null {
  let best: CombatEntity | null = null;
  let bestD = radius;
  for (const e of state.entities.values()) {
    if (e.faction !== 'player' || !isAlive(e)) continue;
    const d = dist2D(x, z, e.x, e.z);
    if (d <= bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

/** Move an entity toward (tx,tz) at its move speed for one tick; ground via ctx. */
function moveToward(
  e: CombatEntity,
  tx: number,
  tz: number,
  speed: number,
  ctx: CombatContext,
): void {
  const dx = tx - e.x;
  const dz = tz - e.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d < 0.001) return;
  const step = Math.min(d, speed * TICK_DT);
  e.x += (dx / d) * step;
  e.z += (dz / d) * step;
  e.yaw = Math.atan2(dx, dz);
  if (ctx.heightAt) e.y = ctx.heightAt(e.x, e.z);
}

/** Run enemy AI for one tick (targeting, chasing, leashing, ability use). */
export function stepEnemyAI(state: CombatState, ctx: CombatContext = {}): void {
  const tick = state.tick;
  for (const e of state.entities.values()) {
    if (e.faction !== 'enemy' || !isAlive(e)) continue;
    const speed = (e.moveSpeed ?? 4) * moveSpeedMultiplier(e, tick);
    const spawnX = e.spawnX ?? e.x;
    const spawnZ = e.spawnZ ?? e.z;
    const leash = e.leashRadius ?? 28;

    // Leash: too far from home → drop aggro and walk back (healing on arrival).
    if (dist2D(e.x, e.z, spawnX, spawnZ) > leash) {
      e.aiState = 'leash';
      e.targetId = null;
      e.threat = {};
    }
    if (e.aiState === 'leash') {
      moveToward(e, spawnX, spawnZ, speed, ctx);
      if (dist2D(e.x, e.z, spawnX, spawnZ) < 1.5) {
        e.aiState = 'idle';
        e.hp = e.maxHP; // reset out of combat
      }
      continue;
    }

    // Target the highest-threat living attacker (Taunt sets threat above the top);
    // else keep the current target; else acquire a nearby player.
    let target: CombatEntity | undefined;
    let topThreat = 0;
    for (const [id, thr] of Object.entries(e.threat)) {
      if (thr > topThreat) {
        const cand = state.entities.get(id);
        if (isAlive(cand)) {
          topThreat = thr;
          target = cand;
        }
      }
    }
    if (!target) {
      const cur = e.targetId ? state.entities.get(e.targetId) : undefined;
      if (isAlive(cur)) target = cur;
    }
    if (!target && (e.aggroRadius ?? 0) > 0) {
      const p = nearestPlayer(state, e.x, e.z, e.aggroRadius ?? 0);
      if (p) {
        target = p;
        e.aiState = 'aggro';
        e.threat[p.id] = (e.threat[p.id] ?? 0) + 1;
      }
    }
    if (!target) {
      e.targetId = null;
      continue;
    }

    e.targetId = target.id;
    const meleeRange = 4.5;
    const d = dist2D(e.x, e.z, target.x, target.z);
    if (d > meleeRange) {
      moveToward(e, target.x, target.z, speed, ctx);
    } else {
      // In range: face the target (auto-attack is resolved in combat.ts) and,
      // occasionally, use an ability that is off cooldown.
      e.yaw = Math.atan2(target.x - e.x, target.z - e.z);
      maybeUseAbility(state, e, tick);
    }
  }
}

function maybeUseAbility(state: CombatState, e: CombatEntity, tick: number): void {
  if (!e.abilities || e.abilities.length === 0 || e.cast) return;
  if (e.gcdReadyTick > tick) return;
  // Deterministic ~1-in-3 chance per eligible tick, keyed by position + tick.
  const roll = hashFloat2(Math.round(e.x) * 73856093 + tick, Math.round(e.z) * 19349663, tick | 0);
  if (roll > 0.04) return;
  for (const id of e.abilities) {
    const skill = skillById(id);
    if (!skill) continue; // ability ids without skill defs are handled in Part 5
    if ((e.cooldowns[id] ?? 0) > tick) continue;
    tryCast(state, e, { type: 'CastSkill', skillId: id, targetId: e.targetId });
    return;
  }
}

/** Advance the whole simulation one tick: clock → AI → combat resolution (ARCH §3). */
export function stepSim(state: CombatState, ctx: CombatContext = {}): void {
  state.tick++;
  stepEnemyAI(state, ctx);
  resolveTick(state, ctx);
}
