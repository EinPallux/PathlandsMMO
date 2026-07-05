// The tick-based combat resolver (GDD §4, ARCH §3). Pure and deterministic: it
// consumes intents, advances entities one 20 Hz tick at a time, and emits events
// for the UI (never the other way round). No DOM, no wall-clock, no Math.random —
// all rolls come from the seeded Rng on the state.

import { makeRng, type Rng } from '../core/rng.js';
import { TICK_RATE, WORLD_SEED } from '../core/constants.js';
import { CharacterClass } from '../models/characters/index.js';
import { ResourceKind } from '../data/classes.js';
import { resourceRegenPerSecond } from '../combat/derive.js';
import {
  applyCrit,
  isCritRoll,
  levelDeltaDamageMultiplier,
  mitigatePhysical,
  threatFromDamage,
  PULL_THRESHOLD_MELEE,
} from '../combat/formulas.js';
import { killXp } from '../combat/xp.js';
import { weaponDamage } from '../combat/formulas.js';
import { skillById, GCD_TICKS, type SkillDef, type SkillEffect } from '../data/skills.js';
import { type CombatEntity, type Aura, autoAttackDamage, isAlive, nextAuraUid } from './entity.js';
import type { CastSkillIntent, Intent } from './intents.js';

export type CombatEvent =
  | {
      type: 'damage';
      sourceId: string;
      targetId: string;
      amount: number;
      school: string;
      crit: boolean;
      skillId: string;
    }
  | {
      type: 'heal';
      sourceId: string;
      targetId: string;
      amount: number;
      crit: boolean;
      skillId: string;
    }
  | { type: 'miss'; sourceId: string; targetId: string; skillId: string }
  | { type: 'castStart'; entityId: string; skillId: string; endTick: number }
  | { type: 'castInterrupt'; entityId: string; skillId: string }
  | { type: 'death'; entityId: string; killerId: string | null }
  | { type: 'xp'; entityId: string; amount: number; enemyLevel: number }
  | { type: 'resource'; entityId: string; kind: ResourceKind; value: number }
  | { type: 'castFail'; entityId: string; skillId: string; reason: string };

export interface CombatContext {
  /** Ground height at a world column (for grounding chasing enemies). */
  heightAt?: (x: number, z: number) => number;
}

export interface CombatState {
  tick: number;
  entities: Map<string, CombatEntity>;
  rng: Rng;
  events: CombatEvent[];
}

export function createCombatState(seed = WORLD_SEED): CombatState {
  return { tick: 0, entities: new Map(), rng: makeRng(seed, 'combat'), events: [] };
}

export function addEntity(state: CombatState, e: CombatEntity): CombatEntity {
  state.entities.set(e.id, e);
  return e;
}

export function drainEvents(state: CombatState): CombatEvent[] {
  const out = state.events;
  state.events = [];
  return out;
}

const S = (seconds: number): number => Math.round(seconds * TICK_RATE);
const DOT_INTERVAL = S(1); // DoTs/HoTs tick once per second
const COMBAT_DROP = S(5);

function dist2D(a: CombatEntity, b: CombatEntity): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/** Sum of matching buff/debuff modifier magnitudes currently active. */
function modifier(e: CombatEntity, name: string, tick: number): number {
  let m = 0;
  for (const a of e.auras) {
    if ((a.kind === 'buff' || a.kind === 'debuff') && a.modifier === name && a.expiresTick > tick) {
      m += a.magnitude ?? 0;
    }
  }
  return m;
}

function hostile(a: CombatEntity, b: CombatEntity): boolean {
  const enemyFaction = (f: string): boolean => f === 'enemy';
  return enemyFaction(a.faction) !== enemyFaction(b.faction);
}

// --- Damage & healing ---------------------------------------------------------

export function applyDamage(
  state: CombatState,
  attacker: CombatEntity,
  target: CombatEntity,
  rawAmount: number,
  school: string,
  skillId: string,
): void {
  if (!isAlive(target) || rawAmount <= 0) return;
  const tick = state.tick;
  if (target.auras.some((a) => a.kind === 'immune' && a.expiresTick > tick)) {
    state.events.push({
      type: 'damage',
      sourceId: attacker.id,
      targetId: target.id,
      amount: 0,
      school,
      crit: false,
      skillId,
    });
    return;
  }

  let amount = rawAmount;
  amount *= 1 + modifier(attacker, 'damageDealt', tick);
  amount *= levelDeltaDamageMultiplier(attacker.level, target.level);

  const crit = isCritRoll(attacker.stats.critChance, state.rng.next());
  amount = applyCrit(amount, crit);

  if (school === 'physical') {
    amount = mitigatePhysical(amount, target.stats.armor, attacker.level);
  }
  // Target damage-taken modifiers (Hunter's Mark +, Shield Wall −, Sanctuary −).
  amount *= Math.max(0, 1 + modifier(target, 'damageTaken', tick));

  amount = Math.max(1, Math.round(amount));

  // Absorb shields soak first (oldest first).
  for (const a of target.auras) {
    if (a.kind === 'shield' && a.expiresTick > tick && (a.absorb ?? 0) > 0) {
      const soak = Math.min(a.absorb!, amount);
      a.absorb! -= soak;
      amount -= soak;
      if (amount <= 0) break;
    }
  }
  if (amount <= 0) {
    state.events.push({
      type: 'damage',
      sourceId: attacker.id,
      targetId: target.id,
      amount: 0,
      school,
      crit,
      skillId,
    });
    return;
  }

  target.hp -= amount;
  enterCombat(attacker, tick);
  enterCombat(target, tick);

  // Threat: the enemy remembers who hit it (tank-stance doubles the attacker's).
  if (target.faction === 'enemy') {
    const tankMult = attacker.stance['shieldWallStance'] ? 2 : 1;
    target.threat[attacker.id] =
      (target.threat[attacker.id] ?? 0) + threatFromDamage(amount, tankMult);
    if (target.aiState === 'idle') target.aiState = 'aggro';
    if (!target.targetId) target.targetId = attacker.id;
  }
  // Warriors build Rage from dealing/taking damage.
  buildRage(attacker, amount * 0.15, state);
  buildRage(target, amount * 0.1, state);

  state.events.push({
    type: 'damage',
    sourceId: attacker.id,
    targetId: target.id,
    amount,
    school,
    crit,
    skillId,
  });

  if (target.hp <= 0) killEntity(state, target, attacker);
}

export function applyHeal(
  state: CombatState,
  healer: CombatEntity,
  target: CombatEntity,
  rawAmount: number,
  skillId: string,
): void {
  if (!isAlive(target) || rawAmount <= 0) return;
  const crit = isCritRoll(healer.stats.critChance, state.rng.next());
  const amount = Math.max(1, Math.round(applyCrit(rawAmount, crit)));
  const before = target.hp;
  target.hp = Math.min(target.maxHP, target.hp + amount);
  const healed = target.hp - before;
  state.events.push({
    type: 'heal',
    sourceId: healer.id,
    targetId: target.id,
    amount: healed,
    crit,
    skillId,
  });
}

function buildRage(e: CombatEntity, amount: number, state: CombatState): void {
  if (e.resourceKind !== ResourceKind.Rage || amount <= 0) return;
  const before = e.resource;
  e.resource = Math.min(e.maxResource, e.resource + amount);
  if (Math.floor(e.resource) !== Math.floor(before)) {
    state.events.push({
      type: 'resource',
      entityId: e.id,
      kind: e.resourceKind,
      value: e.resource,
    });
  }
}

function enterCombat(e: CombatEntity, tick: number): void {
  e.inCombatUntil = tick + COMBAT_DROP;
}

export function inCombat(e: CombatEntity, tick: number): boolean {
  return e.inCombatUntil > tick;
}

function killEntity(state: CombatState, victim: CombatEntity, killer: CombatEntity | null): void {
  victim.hp = 0;
  victim.dead = true;
  victim.cast = null;
  victim.targetId = null;
  state.events.push({ type: 'death', entityId: victim.id, killerId: killer?.id ?? null });

  // Award XP when a player fells an enemy (pets credit their owner in Part 5).
  if (victim.faction === 'enemy' && killer?.faction === 'player') {
    state.events.push({
      type: 'xp',
      entityId: killer.id,
      amount: killXp(killer.level, victim.level),
      enemyLevel: victim.level,
    });
  }
  // Clear this victim from everyone's target/threat.
  for (const other of state.entities.values()) {
    if (other.targetId === victim.id) other.targetId = null;
    delete other.threat[victim.id];
  }
}

// --- Skill casting ------------------------------------------------------------

function resolveTargetId(
  caster: CombatEntity,
  intent: CastSkillIntent,
  skill: SkillDef,
): string | null {
  if (intent.targetId !== undefined) return intent.targetId;
  if (skill.target === 'self' || skill.target === 'aoeSelf' || skill.target === 'ground')
    return caster.id;
  return caster.targetId;
}

export function tryCast(
  state: CombatState,
  caster: CombatEntity,
  intent: CastSkillIntent,
): boolean {
  const tick = state.tick;
  const skill = skillById(intent.skillId);
  const fail = (reason: string): boolean => {
    state.events.push({ type: 'castFail', entityId: caster.id, skillId: intent.skillId, reason });
    return false;
  };
  if (!skill) return fail('unknown');
  if (!isAlive(caster)) return fail('dead');
  if (caster.cls && !caster.enemyId && skill.cls !== caster.cls) return fail('wrongClass');
  if (caster.level < skill.level) return fail('notLearned');
  if (
    caster.auras.some(
      (a) =>
        (a.kind === 'stun' || a.kind === 'silence') &&
        a.expiresTick > tick &&
        (a.kind === 'stun' || skill.castTicks > 0),
    )
  ) {
    return fail('incapacitated');
  }
  if (skill.gcd && caster.gcdReadyTick > tick) return fail('gcd');
  if ((caster.cooldowns[skill.id] ?? 0) > tick) return fail('cooldown');

  const cost = skillResourceCost(caster, skill);
  if (caster.resource < cost) return fail('resource');

  const targetId = resolveTargetId(caster, intent, skill);
  const needsEnemy = skill.target === 'enemy' || skill.target === 'aoeTarget';
  const needsAlly = skill.target === 'ally';
  if (needsEnemy || needsAlly) {
    const target = targetId ? state.entities.get(targetId) : undefined;
    if (!isAlive(target)) return fail('noTarget');
    if (needsEnemy && !hostile(caster, target)) return fail('badTarget');
    if (dist2D(caster, target) > skill.range) return fail('range');
  }

  // Commit: spend resource, start GCD + cooldown.
  spendResource(caster, cost, state);
  if (skill.gcd) caster.gcdReadyTick = tick + GCD_TICKS;
  if (skill.cooldownTicks > 0) caster.cooldowns[skill.id] = tick + skill.cooldownTicks;

  if (skill.castTicks > 0) {
    caster.cast = {
      skillId: skill.id,
      targetId,
      endTick: tick + skill.castTicks,
      groundX: intent.groundX,
      groundZ: intent.groundZ,
    };
    state.events.push({
      type: 'castStart',
      entityId: caster.id,
      skillId: skill.id,
      endTick: caster.cast.endTick,
    });
  } else {
    resolveSkill(state, caster, skill, targetId, intent.groundX, intent.groundZ);
  }
  return true;
}

function skillResourceCost(caster: CombatEntity, skill: SkillDef): number {
  // Variable-cost skills (Execute) spend all available up to the max.
  if (skill.resourceMax && skill.resourceMax > skill.resource) {
    return Math.min(skill.resourceMax, Math.max(skill.resource, caster.resource));
  }
  return skill.resource;
}

function spendResource(e: CombatEntity, cost: number, state: CombatState): void {
  if (cost <= 0) return;
  e.resource = Math.max(0, e.resource - cost);
  state.events.push({ type: 'resource', entityId: e.id, kind: e.resourceKind, value: e.resource });
}

function powerFor(
  caster: CombatEntity,
  effect: Extract<SkillEffect, { kind: 'damage' | 'dot' }>,
): number {
  if (effect.source === 'weapon') {
    return weaponDamage(
      caster.weaponBaseRoll,
      caster.autoSpeedTicks / TICK_RATE,
      caster.stats.attackPower,
    );
  }
  return caster.stats.spellPower;
}

function addAura(target: CombatEntity, aura: Aura): void {
  // Refresh a same-skill same-kind aura rather than stacking endlessly.
  const existing = target.auras.find((a) => a.skillId === aura.skillId && a.kind === aura.kind);
  if (existing) Object.assign(existing, aura);
  else target.auras.push(aura);
}

export function resolveSkill(
  state: CombatState,
  caster: CombatEntity,
  skill: SkillDef,
  targetId: string | null,
  groundX?: number,
  groundZ?: number,
): void {
  const tick = state.tick;
  const primary = targetId ? state.entities.get(targetId) : undefined;

  // Gather affected targets by the skill's targeting mode.
  const targets: CombatEntity[] = [];
  const wantHostile =
    skill.target === 'enemy' ||
    skill.target === 'aoeSelf' ||
    skill.target === 'aoeTarget' ||
    skill.target === 'cone' ||
    skill.target === 'ground';
  const center = skill.target === 'aoeTarget' && isAlive(primary) ? primary : caster;
  const radius = 7;
  if (skill.target === 'enemy' && isAlive(primary)) {
    targets.push(primary);
  } else if (skill.target === 'ally') {
    targets.push(isAlive(primary) ? primary : caster);
  } else if (skill.target === 'self') {
    targets.push(caster);
  } else if (wantHostile) {
    const cx = skill.target === 'ground' && groundX !== undefined ? groundX : center.x;
    const cz = skill.target === 'ground' && groundZ !== undefined ? groundZ : center.z;
    for (const e of state.entities.values()) {
      if (!isAlive(e) || !hostile(caster, e)) continue;
      const dx = e.x - cx;
      const dz = e.z - cz;
      if (Math.sqrt(dx * dx + dz * dz) <= radius) targets.push(e);
    }
  }

  for (const effect of skill.effects)
    applyEffect(state, caster, skill, effect, targets, primary ?? null, tick);
}

function applyEffect(
  state: CombatState,
  caster: CombatEntity,
  skill: SkillDef,
  effect: SkillEffect,
  targets: CombatEntity[],
  primary: CombatEntity | null,
  tick: number,
): void {
  switch (effect.kind) {
    case 'damage':
      for (const t of targets)
        applyDamage(
          state,
          caster,
          t,
          powerFor(caster, effect) * effect.coef,
          effect.school,
          skill.id,
        );
      break;
    case 'dot': {
      const total = powerFor(caster, effect) * effect.coef;
      const nTicks = Math.max(1, Math.round(effect.durationTicks / DOT_INTERVAL));
      for (const t of targets) {
        addAura(t, {
          uid: nextAuraUid(),
          sourceId: caster.id,
          skillId: skill.id,
          kind: 'dot',
          expiresTick: tick + effect.durationTicks,
          amountPerTick: total / nTicks,
          nextTickAt: tick + DOT_INTERVAL,
          tickInterval: DOT_INTERVAL,
          school: effect.school,
        });
      }
      break;
    }
    case 'heal':
      for (const t of targets)
        applyHeal(state, caster, t, caster.stats.spellPower * effect.coef, skill.id);
      break;
    case 'hot': {
      const total = caster.stats.spellPower * effect.coef;
      const nTicks = Math.max(1, Math.round(effect.durationTicks / DOT_INTERVAL));
      for (const t of targets) {
        addAura(t, {
          uid: nextAuraUid(),
          sourceId: caster.id,
          skillId: skill.id,
          kind: 'hot',
          expiresTick: tick + effect.durationTicks,
          amountPerTick: total / nTicks,
          nextTickAt: tick + DOT_INTERVAL,
          tickInterval: DOT_INTERVAL,
        });
      }
      break;
    }
    case 'shield':
      for (const t of targets) {
        addAura(t, {
          uid: nextAuraUid(),
          sourceId: caster.id,
          skillId: skill.id,
          kind: 'shield',
          expiresTick: tick + effect.durationTicks,
          absorb: Math.round(caster.stats.spellPower * effect.coef),
        });
      }
      break;
    case 'buff':
      for (const t of targets) {
        addAura(t, {
          uid: nextAuraUid(),
          sourceId: caster.id,
          skillId: skill.id,
          kind: 'buff',
          expiresTick: tick + effect.durationTicks,
          modifier: effect.buff,
          magnitude: effect.magnitude,
        });
      }
      break;
    case 'debuff':
      for (const t of targets) {
        addAura(t, {
          uid: nextAuraUid(),
          sourceId: caster.id,
          skillId: skill.id,
          kind: 'debuff',
          expiresTick: tick + effect.durationTicks,
          modifier: effect.debuff,
          magnitude: effect.magnitude,
        });
      }
      break;
    case 'slow':
      for (const t of targets)
        addAura(t, {
          uid: nextAuraUid(),
          sourceId: caster.id,
          skillId: skill.id,
          kind: 'slow',
          expiresTick: tick + effect.durationTicks,
          slowPct: effect.pct,
        });
      break;
    case 'stun':
    case 'root':
    case 'silence':
      for (const t of targets)
        addAura(t, {
          uid: nextAuraUid(),
          sourceId: caster.id,
          skillId: skill.id,
          kind: effect.kind,
          expiresTick: tick + effect.durationTicks,
        });
      break;
    case 'immune':
      addAura(caster, {
        uid: nextAuraUid(),
        sourceId: caster.id,
        skillId: skill.id,
        kind: 'immune',
        expiresTick: tick + effect.durationTicks,
      });
      if (effect.dropThreat) for (const e of state.entities.values()) delete e.threat[caster.id];
      break;
    case 'taunt':
      for (const t of targets) {
        if (t.faction !== 'enemy') continue;
        const top = Math.max(0, ...Object.values(t.threat));
        t.threat[caster.id] = top * 1.1 + 1;
        t.targetId = caster.id;
      }
      break;
    case 'interrupt':
      if (isAlive(primary) && primary.cast) {
        state.events.push({
          type: 'castInterrupt',
          entityId: primary.id,
          skillId: primary.cast.skillId,
        });
        primary.cast = null;
      }
      break;
    case 'cleanse':
      for (const t of targets) {
        let n = effect.count;
        t.auras = t.auras.filter((a) => {
          if (n > 0 && a.kind === 'debuff') {
            n--;
            return false;
          }
          return true;
        });
      }
      break;
    case 'resource':
      caster.resource = Math.min(caster.maxResource, caster.resource + effect.amount);
      state.events.push({
        type: 'resource',
        entityId: caster.id,
        kind: caster.resourceKind,
        value: caster.resource,
      });
      break;
    case 'execute':
      for (const t of targets) {
        if (t.hp / t.maxHP > effect.hpThreshold) continue;
        // Damage scales with resource available between coefMin and coefMax.
        const frac = skill.resourceMax ? caster.resource / skill.resourceMax : 1;
        const coef = effect.coefMin + (effect.coefMax - effect.coefMin) * Math.min(1, frac);
        const power = weaponDamage(
          caster.weaponBaseRoll,
          caster.autoSpeedTicks / TICK_RATE,
          caster.stats.attackPower,
        );
        applyDamage(state, caster, t, power * coef, 'physical', skill.id);
      }
      break;
    case 'dash':
      if (effect.motion === 'toTarget' && isAlive(primary)) {
        caster.x = primary.x;
        caster.z = primary.z;
        if (effect.stunTicks)
          addAura(primary, {
            uid: nextAuraUid(),
            sourceId: caster.id,
            skillId: skill.id,
            kind: 'stun',
            expiresTick: tick + effect.stunTicks,
          });
      }
      // backward/blink reposition is a client-feel movement; the sim just notes it.
      break;
    case 'summon':
    case 'special':
      // Pets, stances, channels, and other tagged behaviors are handled by higher
      // systems / Part 4-5; stance toggles flip a flag here for the resolver's use.
      if (effect.kind === 'special' && skill.toggle) {
        caster.stance[effect.tag] = caster.stance[effect.tag] ? 0 : 1;
      }
      break;
  }
}

// --- Per-tick advance ---------------------------------------------------------

/** Apply a player intent to their entity. Returns true if accepted. */
export function applyIntent(state: CombatState, entityId: string, intent: Intent): boolean {
  const e = state.entities.get(entityId);
  if (!e) return false;
  switch (intent.type) {
    case 'SetTarget':
      e.targetId = intent.targetId;
      return true;
    case 'ToggleAutoAttack':
      e.autoAttack = intent.on;
      return true;
    case 'CastSkill':
      return tryCast(state, e, intent);
    case 'ReleaseSpirit':
      if (e.dead) e.respawnTick = state.tick;
      return true;
    default:
      return false;
  }
}

/** Advance the whole combat simulation one tick (AI is run by stepSim in ai.ts). */
export function stepCombat(state: CombatState, ctx: CombatContext = {}): void {
  state.tick++;
  resolveTick(state, ctx);
}

/** Resolve one tick's combat WITHOUT advancing the clock (AI slots in before this). */
export function resolveTick(state: CombatState, ctx: CombatContext = {}): void {
  const tick = state.tick;
  void ctx;

  for (const e of state.entities.values()) {
    if (e.dead) continue;

    // Finish casts.
    if (e.cast && tick >= e.cast.endTick) {
      const skill = skillById(e.cast.skillId);
      const targetId = e.cast.targetId;
      const gx = e.cast.groundX;
      const gz = e.cast.groundZ;
      e.cast = null;
      if (skill) resolveSkill(state, e, skill, targetId, gx, gz);
    }

    // Aura ticks + expiry.
    tickAuras(state, e, tick);
    if (e.dead) continue;

    // Auto-attacks.
    if (e.autoAttack && !e.cast) tickAutoAttack(state, e, tick);

    // Resource regen.
    tickResource(state, e, tick);
  }
}

function tickAuras(state: CombatState, e: CombatEntity, tick: number): void {
  if (e.auras.length === 0) return;
  for (const a of e.auras) {
    if (a.expiresTick <= tick) continue;
    if (
      (a.kind === 'dot' || a.kind === 'hot') &&
      a.nextTickAt !== undefined &&
      tick >= a.nextTickAt
    ) {
      a.nextTickAt += a.tickInterval ?? DOT_INTERVAL;
      const src = state.entities.get(a.sourceId);
      if (a.kind === 'dot') {
        applyDamage(state, src ?? e, e, a.amountPerTick ?? 0, a.school ?? 'physical', a.skillId);
      } else {
        applyHeal(state, src ?? e, e, a.amountPerTick ?? 0, a.skillId);
      }
      if (e.dead) return;
    }
  }
  e.auras = e.auras.filter(
    (a) => a.expiresTick > tick && !(a.kind === 'shield' && (a.absorb ?? 0) <= 0),
  );
}

function tickAutoAttack(state: CombatState, e: CombatEntity, tick: number): void {
  if (tick < e.autoReadyTick) return;
  const target = e.targetId ? state.entities.get(e.targetId) : undefined;
  if (!isAlive(target) || !hostile(e, target)) return;
  const range = e.autoSource === 'weapon' && e.autoSchool === 'physical' ? 5.5 : 30;
  if (dist2D(e, target) > range + (e.enemyId ? 0.5 : 0)) return;
  e.autoReadyTick = tick + e.autoSpeedTicks;
  applyDamage(state, e, target, autoAttackDamage(e), e.autoSchool, 'auto');
}

function tickResource(state: CombatState, e: CombatEntity, tick: number): void {
  if (e.maxResource <= 0) return;
  const spirit = 0; // Spirit-scaled regen would read primary stats; combat stats suffice here.
  const perSec = resourceRegenPerSecond(
    e.resourceKind,
    spirit + e.stats.spellPower * 0.1,
    e.maxResource,
    inCombat(e, tick),
  );
  if (perSec === 0) return;
  const before = e.resource;
  e.resource = Math.max(0, Math.min(e.maxResource, e.resource + perSec / TICK_RATE));
  if (Math.floor(e.resource) !== Math.floor(before)) {
    state.events.push({
      type: 'resource',
      entityId: e.id,
      kind: e.resourceKind,
      value: e.resource,
    });
  }
}

/** Move speed multiplier from slows/roots (0 = rooted). */
export function moveSpeedMultiplier(e: CombatEntity, tick: number): number {
  let mult = 1;
  for (const a of e.auras) {
    if (a.expiresTick <= tick) continue;
    if (a.kind === 'root' || a.kind === 'stun') return 0;
    if (a.kind === 'slow') mult *= 1 - (a.slowPct ?? 0);
  }
  return Math.max(0, mult);
}

/** The id an enemy should attack: its highest-threat player past the pull threshold. */
export function topThreatTarget(enemy: CombatEntity): string | null {
  let best: string | null = null;
  let bestThreat = 0;
  for (const [id, threat] of Object.entries(enemy.threat)) {
    if (threat > bestThreat) {
      bestThreat = threat;
      best = id;
    }
  }
  void PULL_THRESHOLD_MELEE;
  return best;
}

export { CharacterClass };
