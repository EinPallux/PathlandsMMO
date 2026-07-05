// Class skill definitions (GDD §3). Data-driven and executable: the sim resolver
// (Part 3) reads each skill's cost/cast/cooldown/range/target and applies its
// `effects` list. Durations are in ticks (20/s). Coefficients multiply the
// caster's weaponDamage ('weapon') or spellPower ('spell') per GDD §4. Pure data.

import { CharacterClass } from '../models/characters/index.js';
import { TICK_RATE } from '../core/constants.js';

/** Seconds → whole ticks (20 Hz sim). */
const S = (seconds: number): number => Math.round(seconds * TICK_RATE);

/** Global cooldown shared by most actives (GDD §3: 1.2 s). */
export const GCD_TICKS = S(1.2);

export type DamageSchool = 'physical' | 'nature' | 'holy' | 'fire' | 'frost' | 'arcane' | 'shadow';
export type DamageSource = 'weapon' | 'spell';

/** How a skill chooses what it lands on. */
export type SkillTarget =
  | 'enemy' // single hostile
  | 'ally' // single friendly (self-castable)
  | 'self'
  | 'ground' // placed AoE
  | 'cone' // in front of caster
  | 'aoeSelf' // centered on caster
  | 'aoeTarget'; // centered on current target

export type SkillEffect =
  | { kind: 'damage'; coef: number; school: DamageSchool; source: DamageSource }
  | { kind: 'dot'; coef: number; durationTicks: number; school: DamageSchool; source: DamageSource }
  | { kind: 'heal'; coef: number }
  | { kind: 'hot'; coef: number; durationTicks: number }
  | { kind: 'shield'; coef: number; durationTicks: number }
  | { kind: 'buff'; buff: string; durationTicks: number; magnitude: number }
  | { kind: 'debuff'; debuff: string; durationTicks: number; magnitude: number }
  | { kind: 'stun'; durationTicks: number }
  | { kind: 'slow'; pct: number; durationTicks: number }
  | { kind: 'root'; durationTicks: number }
  | { kind: 'silence'; durationTicks: number }
  | { kind: 'interrupt' }
  | { kind: 'taunt'; durationTicks: number }
  | { kind: 'cleanse'; count: number }
  | {
      kind: 'dash';
      motion: 'toTarget' | 'backward' | 'blink';
      distance: number;
      stunTicks?: number;
    }
  | { kind: 'summon'; summonId: string }
  | { kind: 'resource'; amount: number }
  | { kind: 'execute'; coefMin: number; coefMax: number; hpThreshold: number }
  | { kind: 'immune'; durationTicks: number; dropThreat?: boolean }
  | { kind: 'special'; tag: string };

export interface SkillDef {
  id: string;
  name: string;
  cls: CharacterClass;
  /** Character level at which the trainer teaches it. */
  level: number;
  /** Resource cost (flat). Variable-cost skills use `resourceMax` too. */
  resource: number;
  resourceMax?: number;
  /** Cast time in ticks (0 = instant). */
  castTicks: number;
  cooldownTicks: number;
  /** Whether the skill triggers/respects the global cooldown. */
  gcd: boolean;
  /** Range in metres (0 = self/no target needed). */
  range: number;
  target: SkillTarget;
  effects: SkillEffect[];
  /** Toggle/stance skills flip a persistent state instead of firing once. */
  toggle?: boolean;
  description: string;
}

const MELEE = 5;
const RANGED = 30;

// --- Warrior (Rage) — GDD §3.1 ---
const WARRIOR: SkillDef[] = [
  {
    id: 'cleavingStrike',
    name: 'Cleaving Strike',
    cls: CharacterClass.Warrior,
    level: 1,
    resource: 15,
    castTicks: 0,
    cooldownTicks: 0,
    gcd: true,
    range: MELEE,
    target: 'enemy',
    effects: [
      { kind: 'damage', coef: 1.3, school: 'physical', source: 'weapon' },
      { kind: 'special', tag: 'cleaveSplash' }, // +50% weapon dmg to one nearby enemy
    ],
    description: 'Weapon damage ×1.3 to the target and +50% to one nearby enemy.',
  },
  {
    id: 'battleShout',
    name: 'Battle Shout',
    cls: CharacterClass.Warrior,
    level: 2,
    resource: 10,
    castTicks: 0,
    cooldownTicks: 0,
    gcd: true,
    range: 0,
    target: 'self',
    effects: [{ kind: 'buff', buff: 'attackPower', durationTicks: S(300), magnitude: 0.1 }],
    description: '+10% attack power for 5 minutes.',
  },
  {
    id: 'charge',
    name: 'Charge',
    cls: CharacterClass.Warrior,
    level: 4,
    resource: 0,
    castTicks: 0,
    cooldownTicks: S(15),
    gcd: false,
    range: 25,
    target: 'enemy',
    effects: [
      { kind: 'dash', motion: 'toTarget', distance: 25, stunTicks: S(1) },
      { kind: 'resource', amount: 20 },
    ],
    description: 'Dash to a target (8–25 m), stunning 1 s and generating 20 Rage.',
  },
  {
    id: 'shieldWall',
    name: 'Shield Wall',
    cls: CharacterClass.Warrior,
    level: 6,
    resource: 0,
    castTicks: 0,
    cooldownTicks: 0,
    gcd: false,
    range: 0,
    target: 'self',
    toggle: true,
    effects: [{ kind: 'special', tag: 'shieldWallStance' }],
    description: 'Stance: −20% damage taken, −15% damage dealt, ×2 threat.',
  },
  {
    id: 'rend',
    name: 'Rend',
    cls: CharacterClass.Warrior,
    level: 8,
    resource: 20,
    castTicks: 0,
    cooldownTicks: 0,
    gcd: true,
    range: MELEE,
    target: 'enemy',
    effects: [
      { kind: 'dot', coef: 1.2, durationTicks: S(12), school: 'physical', source: 'weapon' },
    ],
    description: 'Bleed for weapon damage ×1.2 over 12 s.',
  },
  {
    id: 'taunt',
    name: 'Taunt',
    cls: CharacterClass.Warrior,
    level: 10,
    resource: 0,
    castTicks: 0,
    cooldownTicks: S(8),
    gcd: false,
    range: MELEE,
    target: 'enemy',
    effects: [{ kind: 'taunt', durationTicks: S(3) }],
    description: 'Force an enemy to attack you for 3 s (sets threat 10% above top).',
  },
  {
    id: 'thunderSlam',
    name: 'Thunder Slam',
    cls: CharacterClass.Warrior,
    level: 12,
    resource: 30,
    castTicks: 0,
    cooldownTicks: S(10),
    gcd: true,
    range: 6,
    target: 'aoeSelf',
    effects: [
      { kind: 'damage', coef: 0.9, school: 'physical', source: 'weapon' },
      { kind: 'slow', pct: 0.3, durationTicks: S(6) },
    ],
    description: 'Weapon ×0.9 to all enemies in 6 m and slow 30% for 6 s.',
  },
  {
    id: 'execute',
    name: 'Execute',
    cls: CharacterClass.Warrior,
    level: 16,
    resource: 20,
    resourceMax: 60,
    castTicks: 0,
    cooldownTicks: 0,
    gcd: true,
    range: MELEE,
    target: 'enemy',
    effects: [{ kind: 'execute', coefMin: 2.0, coefMax: 5.0, hpThreshold: 0.25 }],
    description: 'On a target below 25% HP: huge damage scaling with Rage spent (20–60).',
  },
  {
    id: 'rallyingCry',
    name: 'Rallying Cry',
    cls: CharacterClass.Warrior,
    level: 20,
    resource: 25,
    castTicks: 0,
    cooldownTicks: S(60),
    gcd: true,
    range: 0,
    target: 'self',
    effects: [{ kind: 'hot', coef: 0.2, durationTicks: S(10) }],
    description: 'Heal yourself (and party) 20% max HP over 10 s.',
  },
  {
    id: 'whirlwind',
    name: 'Whirlwind',
    cls: CharacterClass.Warrior,
    level: 24,
    resource: 40,
    castTicks: 0,
    cooldownTicks: S(15),
    gcd: true,
    range: 7,
    target: 'aoeSelf',
    effects: [{ kind: 'damage', coef: 1.1, school: 'physical', source: 'weapon' }],
    description: 'Weapon ×1.1 to all enemies within 7 m.',
  },
  {
    id: 'lastStand',
    name: 'Last Stand',
    cls: CharacterClass.Warrior,
    level: 28,
    resource: 0,
    castTicks: 0,
    cooldownTicks: S(180),
    gcd: false,
    range: 0,
    target: 'self',
    effects: [{ kind: 'buff', buff: 'maxHpPct', durationTicks: S(15), magnitude: 0.4 }],
    description: '+40% max HP for 15 s.',
  },
  {
    id: 'avatarOfThePath',
    name: 'Avatar of the Path',
    cls: CharacterClass.Warrior,
    level: 30,
    resource: 50,
    castTicks: 0,
    cooldownTicks: S(120),
    gcd: true,
    range: 0,
    target: 'self',
    effects: [
      { kind: 'buff', buff: 'damageDealt', durationTicks: S(12), magnitude: 0.25 },
      { kind: 'special', tag: 'slowImmune' },
    ],
    description: '+25% damage and immunity to slows for 12 s.',
  },
];

// --- Ranger (Focus) — GDD §3.2 ---
const RANGER: SkillDef[] = [
  {
    id: 'aimedShot',
    name: 'Aimed Shot',
    cls: CharacterClass.Ranger,
    level: 1,
    resource: 20,
    castTicks: 0,
    cooldownTicks: 0,
    gcd: true,
    range: RANGED,
    target: 'enemy',
    effects: [{ kind: 'damage', coef: 1.4, school: 'physical', source: 'weapon' }],
    description: 'A precise shot for weapon damage ×1.4.',
  },
  {
    id: 'huntersMark',
    name: "Hunter's Mark",
    cls: CharacterClass.Ranger,
    level: 2,
    resource: 0,
    castTicks: 0,
    cooldownTicks: 0,
    gcd: true,
    range: RANGED,
    target: 'enemy',
    effects: [{ kind: 'debuff', debuff: 'damageTaken', durationTicks: S(120), magnitude: 0.08 }],
    description: 'Mark a target: it takes +8% damage.',
  },
  {
    id: 'serpentSting',
    name: 'Serpent Sting',
    cls: CharacterClass.Ranger,
    level: 4,
    resource: 15,
    castTicks: 0,
    cooldownTicks: 0,
    gcd: true,
    range: RANGED,
    target: 'enemy',
    effects: [{ kind: 'dot', coef: 1.1, durationTicks: S(12), school: 'nature', source: 'weapon' }],
    description: 'A nature poison dealing weapon ×1.1 over 12 s.',
  },
  {
    id: 'disengage',
    name: 'Disengage',
    cls: CharacterClass.Ranger,
    level: 6,
    resource: 0,
    castTicks: 0,
    cooldownTicks: S(12),
    gcd: false,
    range: 0,
    target: 'self',
    effects: [{ kind: 'dash', motion: 'backward', distance: 12 }],
    description: 'Leap backwards out of danger (off-GCD).',
  },
  {
    id: 'multiShot',
    name: 'Multi-Shot',
    cls: CharacterClass.Ranger,
    level: 8,
    resource: 25,
    castTicks: 0,
    cooldownTicks: 0,
    gcd: true,
    range: RANGED,
    target: 'cone',
    effects: [{ kind: 'damage', coef: 0.8, school: 'physical', source: 'weapon' }],
    description: 'Weapon ×0.8 to all enemies in a cone.',
  },
  {
    id: 'wolfCompanion',
    name: 'Wolf Companion',
    cls: CharacterClass.Ranger,
    level: 10,
    resource: 0,
    castTicks: S(1.5),
    cooldownTicks: S(30),
    gcd: true,
    range: 0,
    target: 'self',
    effects: [{ kind: 'summon', summonId: 'wolfPet' }],
    description: 'Summon a wolf that tanks and attacks — the solo cornerstone.',
  },
  {
    id: 'concussiveShot',
    name: 'Concussive Shot',
    cls: CharacterClass.Ranger,
    level: 12,
    resource: 15,
    castTicks: 0,
    cooldownTicks: S(6),
    gcd: true,
    range: RANGED,
    target: 'enemy',
    effects: [{ kind: 'slow', pct: 0.5, durationTicks: S(6) }],
    description: 'Slow a target 50% for 6 s.',
  },
  {
    id: 'camouflage',
    name: 'Camouflage',
    cls: CharacterClass.Ranger,
    level: 16,
    resource: 0,
    castTicks: 0,
    cooldownTicks: S(30),
    gcd: true,
    range: 0,
    target: 'self',
    effects: [{ kind: 'special', tag: 'stealthOoc' }],
    description: 'Vanish while out of combat; breaks on any action.',
  },
  {
    id: 'killShot',
    name: 'Kill Shot',
    cls: CharacterClass.Ranger,
    level: 20,
    resource: 25,
    castTicks: 0,
    cooldownTicks: S(10),
    gcd: true,
    range: RANGED,
    target: 'enemy',
    effects: [{ kind: 'execute', coefMin: 2.5, coefMax: 2.5, hpThreshold: 0.2 }],
    description: 'Finisher usable on targets below 20% HP.',
  },
  {
    id: 'volley',
    name: 'Volley',
    cls: CharacterClass.Ranger,
    level: 24,
    resource: 40,
    castTicks: 0,
    cooldownTicks: S(20),
    gcd: true,
    range: RANGED,
    target: 'ground',
    effects: [
      { kind: 'damage', coef: 0.6, school: 'physical', source: 'weapon' },
      { kind: 'special', tag: 'channelAoe' },
    ],
    description: 'Channel a rain of arrows over a ground area.',
  },
  {
    id: 'feignDeath',
    name: 'Feign Death',
    cls: CharacterClass.Ranger,
    level: 28,
    resource: 0,
    castTicks: 0,
    cooldownTicks: S(120),
    gcd: false,
    range: 0,
    target: 'self',
    effects: [{ kind: 'special', tag: 'dropCombat' }],
    description: 'Drop combat instantly (2 min cooldown).',
  },
  {
    id: 'windrunnersFocus',
    name: "Windrunner's Focus",
    cls: CharacterClass.Ranger,
    level: 30,
    resource: 0,
    castTicks: 0,
    cooldownTicks: S(120),
    gcd: false,
    range: 0,
    target: 'self',
    effects: [{ kind: 'buff', buff: 'focusCostReduction', durationTicks: S(12), magnitude: 0.5 }],
    description: 'Focus costs −50% for 12 s.',
  },
];

// --- Priest (Mana) — GDD §3.3 ---
const PRIEST: SkillDef[] = [
  {
    id: 'smite',
    name: 'Smite',
    cls: CharacterClass.Priest,
    level: 1,
    resource: 12,
    castTicks: S(1.5),
    cooldownTicks: 0,
    gcd: true,
    range: RANGED,
    target: 'enemy',
    effects: [{ kind: 'damage', coef: 1.2, school: 'holy', source: 'spell' }],
    description: 'A bolt of holy light for spell power ×1.2.',
  },
  {
    id: 'mend',
    name: 'Mend',
    cls: CharacterClass.Priest,
    level: 2,
    resource: 18,
    castTicks: S(2),
    cooldownTicks: 0,
    gcd: true,
    range: RANGED,
    target: 'ally',
    effects: [{ kind: 'heal', coef: 1.6 }],
    description: 'A direct heal for spell power ×1.6.',
  },
  {
    id: 'renew',
    name: 'Renew',
    cls: CharacterClass.Priest,
    level: 4,
    resource: 16,
    castTicks: 0,
    cooldownTicks: 0,
    gcd: true,
    range: RANGED,
    target: 'ally',
    effects: [{ kind: 'hot', coef: 1.5, durationTicks: S(12) }],
    description: 'Heal over time: spell power ×1.5 over 12 s.',
  },
  {
    id: 'holyShield',
    name: 'Holy Shield',
    cls: CharacterClass.Priest,
    level: 6,
    resource: 20,
    castTicks: 0,
    cooldownTicks: S(8),
    gcd: true,
    range: RANGED,
    target: 'ally',
    effects: [{ kind: 'shield', coef: 2.0, durationTicks: S(15) }],
    description: 'An absorb bubble worth spell power ×2.',
  },
  {
    id: 'purify',
    name: 'Purify',
    cls: CharacterClass.Priest,
    level: 8,
    resource: 12,
    castTicks: 0,
    cooldownTicks: S(6),
    gcd: true,
    range: RANGED,
    target: 'ally',
    effects: [{ kind: 'cleanse', count: 1 }],
    description: 'Remove a poison or disease.',
  },
  {
    id: 'radiance',
    name: 'Radiance',
    cls: CharacterClass.Priest,
    level: 10,
    resource: 30,
    castTicks: 0,
    cooldownTicks: S(8),
    gcd: true,
    range: 0,
    target: 'aoeSelf',
    effects: [{ kind: 'heal', coef: 1.1 }],
    description: 'A burst of light healing all nearby allies.',
  },
  {
    id: 'holyFire',
    name: 'Holy Fire',
    cls: CharacterClass.Priest,
    level: 12,
    resource: 22,
    castTicks: S(1.5),
    cooldownTicks: 0,
    gcd: true,
    range: RANGED,
    target: 'enemy',
    effects: [
      { kind: 'damage', coef: 1.0, school: 'holy', source: 'spell' },
      { kind: 'dot', coef: 0.8, durationTicks: S(8), school: 'holy', source: 'spell' },
    ],
    description: 'Sear a target for spell ×1.0 plus a burning DoT.',
  },
  {
    id: 'chastise',
    name: 'Chastise',
    cls: CharacterClass.Priest,
    level: 16,
    resource: 14,
    castTicks: 0,
    cooldownTicks: S(20),
    gcd: false,
    range: RANGED,
    target: 'enemy',
    effects: [{ kind: 'interrupt' }, { kind: 'silence', durationTicks: S(2) }],
    description: 'Interrupt and silence a caster for 2 s (off-GCD).',
  },
  {
    id: 'prayerOfThePath',
    name: 'Prayer of the Path',
    cls: CharacterClass.Priest,
    level: 20,
    resource: 35,
    castTicks: 0,
    cooldownTicks: S(12),
    gcd: true,
    range: 0,
    target: 'aoeSelf',
    effects: [{ kind: 'hot', coef: 1.0, durationTicks: S(12) }],
    description: 'A party-wide heal over time.',
  },
  {
    id: 'guardianSpirit',
    name: 'Guardian Spirit',
    cls: CharacterClass.Priest,
    level: 24,
    resource: 20,
    castTicks: 0,
    cooldownTicks: S(300),
    gcd: true,
    range: RANGED,
    target: 'ally',
    effects: [{ kind: 'buff', buff: 'cheatDeath', durationTicks: S(10), magnitude: 1 }],
    description: 'Ward an ally from a killing blow (5 min cooldown).',
  },
  {
    id: 'mindSear',
    name: 'Mind Sear',
    cls: CharacterClass.Priest,
    level: 28,
    resource: 30,
    castTicks: S(3),
    cooldownTicks: 0,
    gcd: true,
    range: RANGED,
    target: 'aoeTarget',
    effects: [
      { kind: 'damage', coef: 0.5, school: 'shadow', source: 'spell' },
      { kind: 'special', tag: 'channelAoe' },
    ],
    description: 'Channel shadow damage around the target.',
  },
  {
    id: 'sanctuary',
    name: 'Sanctuary',
    cls: CharacterClass.Priest,
    level: 30,
    resource: 40,
    castTicks: 0,
    cooldownTicks: S(60),
    gcd: true,
    range: 0,
    target: 'ground',
    effects: [{ kind: 'special', tag: 'sanctuaryCircle' }],
    description: 'A ground circle: allies inside take −20% damage for 10 s.',
  },
];

// --- Mage (Mana) — GDD §3.4 ---
const MAGE: SkillDef[] = [
  {
    id: 'frostbolt',
    name: 'Frostbolt',
    cls: CharacterClass.Mage,
    level: 1,
    resource: 14,
    castTicks: S(1.5),
    cooldownTicks: 0,
    gcd: true,
    range: RANGED,
    target: 'enemy',
    effects: [
      { kind: 'damage', coef: 1.25, school: 'frost', source: 'spell' },
      { kind: 'slow', pct: 0.2, durationTicks: S(4) },
    ],
    description: 'A frost bolt for spell ×1.25 that slows 20%.',
  },
  {
    id: 'fireBlast',
    name: 'Fire Blast',
    cls: CharacterClass.Mage,
    level: 2,
    resource: 12,
    castTicks: 0,
    cooldownTicks: S(6),
    gcd: false,
    range: RANGED,
    target: 'enemy',
    effects: [{ kind: 'damage', coef: 0.9, school: 'fire', source: 'spell' }],
    description: 'An instant fire burst (off-GCD).',
  },
  {
    id: 'arcaneBarrier',
    name: 'Arcane Barrier',
    cls: CharacterClass.Mage,
    level: 4,
    resource: 20,
    castTicks: 0,
    cooldownTicks: S(20),
    gcd: true,
    range: 0,
    target: 'self',
    effects: [{ kind: 'shield', coef: 1.8, durationTicks: S(12) }],
    description: 'An absorb shield worth spell power ×1.8.',
  },
  {
    id: 'blink',
    name: 'Blink',
    cls: CharacterClass.Mage,
    level: 6,
    resource: 10,
    castTicks: 0,
    cooldownTicks: S(12),
    gcd: false,
    range: 0,
    target: 'self',
    effects: [{ kind: 'dash', motion: 'blink', distance: 12 }],
    description: 'Teleport a short distance (off-GCD).',
  },
  {
    id: 'fireball',
    name: 'Fireball',
    cls: CharacterClass.Mage,
    level: 8,
    resource: 24,
    castTicks: S(2.5),
    cooldownTicks: 0,
    gcd: true,
    range: RANGED,
    target: 'enemy',
    effects: [{ kind: 'damage', coef: 2.0, school: 'fire', source: 'spell' }],
    description: 'A big fire cast for spell power ×2.',
  },
  {
    id: 'frostNova',
    name: 'Frost Nova',
    cls: CharacterClass.Mage,
    level: 10,
    resource: 18,
    castTicks: 0,
    cooldownTicks: S(20),
    gcd: true,
    range: 0,
    target: 'aoeSelf',
    effects: [{ kind: 'root', durationTicks: S(5) }],
    description: 'Root all nearby enemies for 5 s.',
  },
  {
    id: 'arcaneMissiles',
    name: 'Arcane Missiles',
    cls: CharacterClass.Mage,
    level: 12,
    resource: 20,
    castTicks: S(2.5),
    cooldownTicks: 0,
    gcd: true,
    range: RANGED,
    target: 'enemy',
    effects: [
      { kind: 'damage', coef: 1.6, school: 'arcane', source: 'spell' },
      { kind: 'special', tag: 'channel' },
    ],
    description: 'Channel a volley of arcane missiles.',
  },
  {
    id: 'counterspell',
    name: 'Counterspell',
    cls: CharacterClass.Mage,
    level: 16,
    resource: 10,
    castTicks: 0,
    cooldownTicks: S(24),
    gcd: false,
    range: RANGED,
    target: 'enemy',
    effects: [{ kind: 'interrupt' }, { kind: 'silence', durationTicks: S(2) }],
    description: 'Interrupt a cast and silence for 2 s (off-GCD).',
  },
  {
    id: 'blizzard',
    name: 'Blizzard',
    cls: CharacterClass.Mage,
    level: 20,
    resource: 38,
    castTicks: 0,
    cooldownTicks: S(8),
    gcd: true,
    range: RANGED,
    target: 'ground',
    effects: [
      { kind: 'damage', coef: 0.5, school: 'frost', source: 'spell' },
      { kind: 'slow', pct: 0.3, durationTicks: S(2) },
      { kind: 'special', tag: 'channelAoe' },
    ],
    description: 'A ground blizzard dealing frost damage and slowing.',
  },
  {
    id: 'iceBlock',
    name: 'Ice Block',
    cls: CharacterClass.Mage,
    level: 24,
    resource: 10,
    castTicks: 0,
    cooldownTicks: S(180),
    gcd: false,
    range: 0,
    target: 'self',
    effects: [{ kind: 'immune', durationTicks: S(8), dropThreat: true }],
    description: 'Freeze yourself solid: immune 8 s, drops threat.',
  },
  {
    id: 'combustion',
    name: 'Combustion',
    cls: CharacterClass.Mage,
    level: 28,
    resource: 20,
    castTicks: 0,
    cooldownTicks: S(90),
    gcd: false,
    range: 0,
    target: 'self',
    effects: [{ kind: 'buff', buff: 'combustion', durationTicks: S(10), magnitude: 3 }],
    description: 'Your next 3 fire spells are instant and crit.',
  },
  {
    id: 'meteor',
    name: 'Meteor',
    cls: CharacterClass.Mage,
    level: 30,
    resource: 45,
    castTicks: S(3),
    cooldownTicks: S(120),
    gcd: true,
    range: RANGED,
    target: 'ground',
    effects: [
      { kind: 'damage', coef: 3.0, school: 'fire', source: 'spell' },
      { kind: 'stun', durationTicks: S(2) },
    ],
    description: 'Call down a meteor for massive fire damage and a knockdown.',
  },
];

export const ALL_SKILLS: readonly SkillDef[] = [...WARRIOR, ...RANGER, ...PRIEST, ...MAGE];

const SKILLS_BY_CLASS: Record<CharacterClass, SkillDef[]> = {
  [CharacterClass.Warrior]: WARRIOR,
  [CharacterClass.Ranger]: RANGER,
  [CharacterClass.Priest]: PRIEST,
  [CharacterClass.Mage]: MAGE,
};

const SKILL_BY_ID = new Map<string, SkillDef>(ALL_SKILLS.map((s) => [s.id, s]));

export function skillById(id: string): SkillDef | undefined {
  return SKILL_BY_ID.get(id);
}

/** All skills a class has, in learn order. */
export function skillsForClass(cls: CharacterClass): readonly SkillDef[] {
  return SKILLS_BY_CLASS[cls];
}

/** Skills a class knows at or below `level` (what fits on the hotbar / skill book). */
export function skillsKnownAt(cls: CharacterClass, level: number): SkillDef[] {
  return SKILLS_BY_CLASS[cls].filter((s) => s.level <= level);
}

// --- Path specializations (GDD §3): pick 1 of 2 at levels 10 / 20 / 30 ---
export interface PathChoice {
  id: string;
  name: string;
  tier: 10 | 20 | 30;
  description: string;
}

export const CLASS_PATHS: Record<CharacterClass, PathChoice[]> = {
  [CharacterClass.Warrior]: [
    { id: 'bulwark', name: 'Bulwark', tier: 10, description: '+10% armor; Shield Wall stronger.' },
    { id: 'berserker', name: 'Berserker', tier: 10, description: '+15% Rage generation.' },
    { id: 'juggernaut', name: 'Juggernaut', tier: 20, description: 'Charge resets on a kill.' },
    {
      id: 'bloodletter',
      name: 'Bloodletter',
      tier: 20,
      description: 'Rend spreads via Cleaving Strike.',
    },
    {
      id: 'unbreakable',
      name: 'Unbreakable',
      tier: 30,
      description: 'Last Stand clears debuffs, −60 s CD.',
    },
    {
      id: 'warbringer',
      name: 'Warbringer',
      tier: 30,
      description: 'Whirlwind CD −5 s; Cleave +1 target.',
    },
  ],
  [CharacterClass.Ranger]: [
    {
      id: 'beastbond',
      name: 'Beastbond',
      tier: 10,
      description: 'Pet +30% HP/threat (solo-tank pick).',
    },
    { id: 'sharpshooter', name: 'Sharpshooter', tier: 10, description: '+5% crit.' },
    {
      id: 'serpentsKiss',
      name: "Serpent's Kiss",
      tier: 20,
      description: 'Sting spreads via Multi-Shot.',
    },
    {
      id: 'fleetfoot',
      name: 'Fleetfoot',
      tier: 20,
      description: 'Disengage grants 3 s +40% speed.',
    },
    { id: 'alphasCall', name: "Alpha's Call", tier: 30, description: 'Two wolves, each weaker.' },
    { id: 'deadeye', name: 'Deadeye', tier: 30, description: 'Kill Shot usable below 35%.' },
  ],
  [CharacterClass.Priest]: [
    {
      id: 'cloistered',
      name: 'Cloistered',
      tier: 10,
      description: 'Smite/Holy Fire +15% (solo pick).',
    },
    { id: 'shepherd', name: 'Shepherd', tier: 10, description: 'Heals +10%.' },
    {
      id: 'everflame',
      name: 'Everflame',
      tier: 20,
      description: 'Holy Fire DoT spreads via Smite crits.',
    },
    {
      id: 'lightwell',
      name: 'Lightwell',
      tier: 20,
      description: 'Renew also ticks a small absorb.',
    },
    { id: 'zealot', name: 'Zealot', tier: 30, description: 'Mind Sear channels while moving.' },
    {
      id: 'miracleWorker',
      name: 'Miracle-Worker',
      tier: 30,
      description: 'Guardian Spirit CD −2 min.',
    },
  ],
  [CharacterClass.Mage]: [
    {
      id: 'frostbound',
      name: 'Frostbound',
      tier: 10,
      description: 'Slows +15%; Nova radius +2 m.',
    },
    { id: 'emberheart', name: 'Emberheart', tier: 10, description: 'Fire +10%.' },
    {
      id: 'chainfrost',
      name: 'Chainfrost',
      tier: 20,
      description: 'Frostbolt bounces once at 50%.',
    },
    { id: 'wildfire', name: 'Wildfire', tier: 20, description: 'Fireball splashes 30%.' },
    {
      id: 'wintersGrasp',
      name: "Winter's Grasp",
      tier: 30,
      description: 'Nova roots 8 s; Blizzard cheaper.',
    },
    { id: 'sunfall', name: 'Sunfall', tier: 30, description: 'Meteor CD −60 s.' },
  ],
};

/** The two path options a class chooses between at a given tier. */
export function pathChoicesAt(cls: CharacterClass, tier: 10 | 20 | 30): PathChoice[] {
  return CLASS_PATHS[cls].filter((p) => p.tier === tier);
}
