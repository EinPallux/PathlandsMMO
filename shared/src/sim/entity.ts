// Combat entity: the unified, serialisable struct for players, enemies, and pets.
// Plain data (structuredClone-safe) so it flows into saves and Phase-6 snapshots.
// All combat state lives here; the resolver (combat.ts) advances it per tick.

import { CharacterClass } from '../models/characters/index.js';
import { TICK_RATE } from '../core/constants.js';
import { ResourceKind } from '../data/classes.js';
import type { DamageSchool, DamageSource } from '../data/skills.js';
import type { CombatStats } from '../combat/derive.js';
import { combatStatsForLevel } from '../combat/derive.js';
import type { StatBlock } from '../data/stats.js';
import { CLASS_WEAPON, WEAPON_SPEED, weaponDps } from '../data/items.js';
import { weaponDamage } from '../combat/formulas.js';
import { enemyById, enemyStatsFor, type EnemyDef } from '../data/enemies.js';

export type Faction = 'player' | 'enemy' | 'pet';

/** A timed effect on an entity (DoT/HoT/buff/debuff/CC/shield). */
export interface Aura {
  /** Instance id (unique on the entity). */
  uid: string;
  sourceId: string;
  skillId: string;
  kind:
    | 'dot'
    | 'hot'
    | 'buff'
    | 'debuff'
    | 'shield'
    | 'stun'
    | 'slow'
    | 'root'
    | 'silence'
    | 'immune'
    | 'taunt';
  expiresTick: number;
  // dot/hot:
  amountPerTick?: number;
  nextTickAt?: number;
  tickInterval?: number;
  school?: DamageSchool;
  // buff/debuff: a named modifier + magnitude (fraction).
  modifier?: string;
  magnitude?: number;
  // shield:
  absorb?: number;
  // slow:
  slowPct?: number;
}

export interface CombatEntity {
  id: string;
  faction: Faction;
  name: string;
  level: number;
  /** Players/pets. */
  cls?: CharacterClass;
  /** Enemies. */
  enemyId?: string;

  x: number;
  y: number;
  z: number;
  yaw: number;

  hp: number;
  maxHP: number;
  resource: number;
  maxResource: number;
  resourceKind: ResourceKind;
  stats: CombatStats;

  targetId: string | null;

  /** Auto-attack on (players toggle; enemies always on when engaged). */
  autoAttack: boolean;
  /** Weapon swing interval in ticks. */
  autoSpeedTicks: number;
  autoReadyTick: number;
  weaponBaseRoll: number;
  autoSource: DamageSource;
  autoSchool: DamageSchool;

  gcdReadyTick: number;
  cast: {
    skillId: string;
    targetId: string | null;
    endTick: number;
    groundX?: number;
    groundZ?: number;
  } | null;
  /** skillId → tick the cooldown ends. */
  cooldowns: Record<string, number>;
  auras: Aura[];
  /** Persistent stance/mode flags (Shield Wall, combustion charges…). */
  stance: Record<string, number>;

  /** Enemy threat table: attackerId → accumulated threat. */
  threat: Record<string, number>;

  dead: boolean;
  /** Tick a dead entity may respawn (enemies) or has released (players). */
  respawnTick?: number;
  /** Combat drops when the sim tick passes this (no actions in the window). */
  inCombatUntil: number;

  // Enemy AI:
  spawnX?: number;
  spawnZ?: number;
  aiState?: 'idle' | 'aggro' | 'leash';
  aggroRadius?: number;
  leashRadius?: number;
  moveSpeed?: number;
  abilities?: string[];
}

let auraCounter = 0;
/** Deterministic-per-run aura instance id (counter, not wall-clock/random). */
export function nextAuraUid(): string {
  auraCounter = (auraCounter + 1) | 0;
  return `a${auraCounter}`;
}

const S = (seconds: number): number => Math.round(seconds * TICK_RATE);

/** Build a player combat entity from class + level (+ optional gear stats/equip). */
export function makePlayerEntity(
  id: string,
  name: string,
  cls: CharacterClass,
  level: number,
  x: number,
  y: number,
  z: number,
  gear: Partial<StatBlock> = {},
  equip: { armor?: number; bonusCritChance?: number; bonusMaxHP?: number } = {},
  weaponIlvl = level,
): CombatEntity {
  const stats = combatStatsForLevel(cls, level, gear, equip);
  const kind = CLASS_WEAPON[cls];
  const speed = WEAPON_SPEED[kind] || 2.4;
  const dps = weaponDps(Math.max(1, weaponIlvl));
  const baseRoll = Math.round(dps * speed);
  // Casters auto-attack with spell power; melee/ranged with the weapon.
  const caster = cls === CharacterClass.Priest || cls === CharacterClass.Mage;
  return {
    id,
    faction: 'player',
    name,
    level,
    cls,
    x,
    y,
    z,
    yaw: 0,
    hp: stats.maxHP,
    maxHP: stats.maxHP,
    resource: stats.resourceKind === ResourceKind.Rage ? 0 : stats.maxResource,
    maxResource: stats.maxResource,
    resourceKind: stats.resourceKind,
    stats,
    targetId: null,
    autoAttack: false,
    autoSpeedTicks: S(speed),
    autoReadyTick: 0,
    weaponBaseRoll: baseRoll,
    autoSource: caster ? 'spell' : 'weapon',
    autoSchool: caster ? (cls === CharacterClass.Mage ? 'arcane' : 'holy') : 'physical',
    gcdReadyTick: 0,
    cast: null,
    cooldowns: {},
    auras: [],
    stance: {},
    threat: {},
    dead: false,
    inCombatUntil: 0,
  };
}

/** Build an enemy combat entity from its def + level at a world position. */
export function makeEnemyEntity(
  id: string,
  def: EnemyDef,
  level: number,
  x: number,
  y: number,
  z: number,
  nearbyPlayers = 1,
): CombatEntity {
  const s = enemyStatsFor(def, level, nearbyPlayers);
  return {
    id,
    faction: 'enemy',
    name: def.name,
    level,
    enemyId: def.id,
    x,
    y,
    z,
    yaw: 0,
    hp: s.maxHP,
    maxHP: s.maxHP,
    resource: 0,
    maxResource: 0,
    resourceKind: ResourceKind.Rage,
    stats: {
      maxHP: s.maxHP,
      resourceKind: ResourceKind.Rage,
      maxResource: 0,
      attackPower: 0,
      spellPower: 0,
      critChance: 0.05,
      armor: Math.round(level * 6),
    },
    targetId: null,
    autoAttack: true,
    autoSpeedTicks: S(2), // GDD §4 baseline swing is 2 s
    autoReadyTick: 0,
    weaponBaseRoll: s.damage,
    autoSource: 'weapon',
    autoSchool: def.school,
    gcdReadyTick: 0,
    cast: null,
    cooldowns: {},
    auras: [],
    stance: {},
    threat: {},
    dead: false,
    inCombatUntil: 0,
    spawnX: x,
    spawnZ: z,
    aiState: 'idle',
    aggroRadius: def.aggroRadius,
    leashRadius: def.leashRadius,
    moveSpeed: def.moveSpeed,
    abilities: def.abilities,
  };
}

/** Convenience wrapper: enemy entity straight from an enemy id. */
export function makeEnemyById(
  id: string,
  enemyDefId: string,
  level: number,
  x: number,
  y: number,
  z: number,
  nearbyPlayers = 1,
): CombatEntity | null {
  const def = enemyById(enemyDefId);
  if (!def) return null;
  return makeEnemyEntity(id, def, level, x, y, z, nearbyPlayers);
}

/** The player's auto-attack swing damage (weapon or spell powered). */
export function autoAttackDamage(e: CombatEntity): number {
  const power = e.autoSource === 'weapon' ? e.stats.attackPower : e.stats.spellPower;
  if (e.autoSource === 'weapon') {
    return weaponDamage(e.weaponBaseRoll, e.autoSpeedTicks / TICK_RATE, power);
  }
  // Caster zap: spell power scaled by swing time, plus the base roll.
  return e.weaponBaseRoll + power * 0.5;
}

export function isAlive(e: CombatEntity | null | undefined): e is CombatEntity {
  return !!e && !e.dead;
}

/** Whether the entity is stunned (cannot act; rooted entities can still act). */
export function isIncapacitated(e: CombatEntity, tick: number): boolean {
  return e.auras.some((a) => a.kind === 'stun' && a.expiresTick > tick);
}

export function hasAura(e: CombatEntity, kind: Aura['kind'], tick: number): boolean {
  return e.auras.some((a) => a.kind === kind && a.expiresTick > tick);
}
