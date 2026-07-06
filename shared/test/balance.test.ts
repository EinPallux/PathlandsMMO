// Balance audit (Phase 5, GDD §15 tuning targets). A deterministic harness that
// builds an at-level, appropriately-geared player of each class and measures its
// *baseline auto-attack sustain* against normal and elite enemies through the real
// combat resolver, plus boss stat-scaling, itemization-curve, and gold-economy
// checks.
//
// Scope note — why auto-attack only: full skill rotations (cast-time management,
// cooldown priority, kiting, potions) are player skill the combat resolver models
// but a unit test can't drive fairly — a "spam every skill" loop just restarts
// casters' casts and dumps melee cooldowns instantly. Dynamic full-rotation combat
// is already covered by combat.test.ts (resolver integration) and hollows.test.ts
// (a hand-played melee loadout that solo-clears a Hollow boss). So here we audit the
// *floor*: every class's white-damage sustain must solo-kill at-level content and
// survive, and no class may be a wild outlier. Skills only add burst on top.
//
// The gear model is grounded in the itemization formulas (statBudget/armorRating at
// ilvl≈level), so "geared at-level" means what the item system actually hands out.

import { describe, it, expect } from 'vitest';
import {
  createCombatState,
  addEntity,
  makePlayerEntity,
  makeEnemyById,
  enemyById,
  enemyStatsFor,
  applyIntent,
  stepSim,
  drainEvents,
  CharacterClass,
  statBudget,
  armorRating,
  armorClassFor,
  ilvlFor,
  weaponDps,
  EquipSlot,
  Rarity,
  MOUNTS,
  MOUNT_MIN_LEVEL,
  QUESTS,
  type StatBlock,
  type StatKey,
} from '../src/index.js';

const CLASSES = [
  CharacterClass.Warrior,
  CharacterClass.Ranger,
  CharacterClass.Priest,
  CharacterClass.Mage,
] as const;

const CLASS_NAME: Record<CharacterClass, string> = {
  [CharacterClass.Warrior]: 'Warrior',
  [CharacterClass.Ranger]: 'Ranger',
  [CharacterClass.Priest]: 'Priest',
  [CharacterClass.Mage]: 'Mage',
};

const PRIMARY: Record<CharacterClass, StatKey> = {
  [CharacterClass.Warrior]: 'might',
  [CharacterClass.Ranger]: 'agility',
  [CharacterClass.Priest]: 'intellect',
  [CharacterClass.Mage]: 'intellect',
};

// A representative at-level kit: eight stat-bearing slots at Uncommon (ilvl≈level),
// budget split between the class primary stat and stamina; armor summed across the
// worn armor slots (Warriors add a shield in the off-hand).
function gearForLevel(
  cls: CharacterClass,
  level: number,
): {
  gear: Partial<StatBlock>;
  armor: number;
  weaponIlvl: number;
  bonusCritChance: number;
} {
  const rarity = Rarity.Uncommon;
  const ilvl = ilvlFor(level, rarity);
  const STAT_SLOTS = 8; // head/chest/legs/feet/hands/amulet + 2 rings
  const budget = STAT_SLOTS * statBudget(ilvl, rarity);
  const gear: Partial<StatBlock> = {
    [PRIMARY[cls]]: Math.round(budget * 0.55),
    stamina: Math.round(budget * 0.45),
  };
  const ac = armorClassFor(cls);
  const armorSlots = [
    EquipSlot.Head,
    EquipSlot.Chest,
    EquipSlot.Legs,
    EquipSlot.Feet,
    EquipSlot.Hands,
  ];
  let armor = 0;
  for (const slot of armorSlots) armor += armorRating(ilvl, slot, ac);
  if (cls === CharacterClass.Warrior) armor += armorRating(ilvl, EquipSlot.OffHand, ac);
  return { gear, armor, weaponIlvl: ilvl, bonusCritChance: 0.03 };
}

interface Fight {
  seconds: number;
  enemyDead: boolean;
  playerDead: boolean;
}

// Auto-attack sustain: target on, auto-attack on, no skills issued (see the scope
// note above). Melee swing with their weapon; casters auto with spell power.
function simulate(cls: CharacterClass, level: number, enemyId: string, enemyLevel: number): Fight {
  const s = createCombatState(2024);
  const g = gearForLevel(cls, level);
  const p = addEntity(
    s,
    makePlayerEntity(
      'p',
      'P',
      cls,
      level,
      0,
      64,
      0,
      g.gear,
      { armor: g.armor, bonusCritChance: g.bonusCritChance },
      g.weaponIlvl,
    ),
  );
  const enemy = makeEnemyById('m', enemyId, enemyLevel, 0, 64, 3);
  if (!enemy) throw new Error(`unknown enemy ${enemyId}`);
  addEntity(s, enemy);
  applyIntent(s, 'p', { type: 'SetTarget', targetId: 'm' });
  applyIntent(s, 'p', { type: 'ToggleAutoAttack', on: true });

  const maxTicks = 120 * 20; // generous cap for a baseline (no-skills) fight
  let enemyDead = false;
  let playerDead = false;
  let ticks = 0;
  for (; ticks < maxTicks && !enemyDead && !playerDead; ticks++) {
    if (!enemyDead && p.targetId !== 'm') applyIntent(s, 'p', { type: 'SetTarget', targetId: 'm' });
    stepSim(s);
    for (const ev of drainEvents(s)) {
      if (ev.type === 'death' && ev.entityId === 'm') enemyDead = true;
      if (ev.type === 'death' && ev.entityId === 'p') playerDead = true;
    }
  }
  return { seconds: ticks / 20, enemyDead, playerDead };
}

describe('Balance audit — baseline auto-attack sustain (GDD §15)', () => {
  // caveGnoll is a mid-game normal (band 12–16); hollowrootTreant is an elite (10–14).
  const mob = new Map(CLASSES.map((c) => [c, simulate(c, 14, 'caveGnoll', 14)]));
  const elite = new Map(CLASSES.map((c) => [c, simulate(c, 12, 'hollowrootTreant', 12)]));

  it('DIAGNOSTIC: prints at-level baseline (auto-attack only) TTK per class', () => {
    const lines = CLASSES.map(
      (c) =>
        `${CLASS_NAME[c].padEnd(8)} mob=${mob.get(c)!.seconds.toFixed(1)}s  elite=${elite
          .get(c)!
          .seconds.toFixed(1)}s`,
    );

    console.log('\n' + lines.join('\n') + '\n');
    expect(lines.length).toBe(4);
  });

  it('every class can white-damage an at-level normal mob down and survive (≤ 30 s)', () => {
    for (const c of CLASSES) {
      const f = mob.get(c)!;
      expect(f.enemyDead, CLASS_NAME[c]).toBe(true);
      expect(f.playerDead, CLASS_NAME[c]).toBe(false);
      expect(f.seconds, CLASS_NAME[c]).toBeLessThanOrEqual(30);
    }
  });

  it('every class can white-damage an at-level elite down and survive (≤ 60 s)', () => {
    for (const c of CLASSES) {
      const f = elite.get(c)!;
      expect(f.enemyDead, CLASS_NAME[c]).toBe(true);
      expect(f.playerDead, CLASS_NAME[c]).toBe(false);
      expect(f.seconds, CLASS_NAME[c]).toBeLessThanOrEqual(60);
    }
  });

  it('no class is a wild outlier: slowest baseline mob TTK ≤ 3× the fastest', () => {
    const secs = CLASSES.map((c) => mob.get(c)!.seconds);
    expect(Math.max(...secs) / Math.min(...secs)).toBeLessThanOrEqual(3);
  });
});

describe('Balance audit — Hollow boss scaling (GDD §15, WORLD.md §6)', () => {
  const BOSSES = [
    { id: 'bossBriarking', level: 12 },
    { id: 'bossGloommother', level: 18 },
    { id: 'bossCrystalWyrm', level: 22 },
    { id: 'bossIronvein', level: 28 },
    { id: 'bossLastWaymaker', level: 30 },
  ] as const;

  it('every boss is a real fight — far more HP than an at-level normal (rank multiplier lands)', () => {
    for (const b of BOSSES) {
      const boss = enemyById(b.id)!;
      const normal = enemyById('caveGnoll')!;
      const bossHP = enemyStatsFor(boss, b.level).maxHP;
      const normalHP = enemyStatsFor(normal, b.level).maxHP;
      // Boss rank is ×4.5 HP over a normal of the same level (formulas.ts RANK_HP_MULT).
      expect(bossHP / normalHP, b.id).toBeGreaterThan(4);
      expect(bossHP / normalHP, b.id).toBeLessThan(5);
      // A boss must be a sustained fight: its HP dwarfs any single-hit burst.
      expect(bossHP, b.id).toBeGreaterThan(1000);
    }
  });

  it('boss damage stays survivable — a boss swing is not a one-shot vs an at-level tank', () => {
    // A geared Warrior's max HP at the boss level should comfortably exceed a few
    // boss swings, so the fight is about attrition/mitigation, not instant death.
    for (const b of BOSSES) {
      const boss = enemyById(b.id)!;
      const swing = enemyStatsFor(boss, b.level).damage;
      const g = gearForLevel(CharacterClass.Warrior, b.level);
      const s = createCombatState(1);
      const p = addEntity(
        s,
        makePlayerEntity('p', 'W', CharacterClass.Warrior, b.level, 0, 64, 0, g.gear, {
          armor: g.armor,
        }),
      );
      expect(p.maxHP / swing, b.id).toBeGreaterThan(5); // survives ≥5 unmitigated swings
    }
  });
});

describe('Balance audit — gold economy (GDD §15)', () => {
  const goldBy = (lvl: number): number =>
    QUESTS.filter((q) => q.minLevel <= lvl).reduce((sum, q) => sum + (q.reward.gold ?? 0), 0);
  const mount = MOUNTS.find((m) => m.source.kind === 'purchase')!;
  const cost = mount.source.kind === 'purchase' ? mount.source.cost : 0;

  it('DIAGNOSTIC: quest gold by level vs mount cost', () => {
    console.log(
      `\nquest gold by L20=${goldBy(20)}, by L30=${goldBy(30)}; mount cost=${cost} (reqLevel ${MOUNT_MIN_LEVEL})\n`,
    );
    expect(cost).toBeGreaterThan(0);
  });

  it('the mount is a real gold sink at 20 — affordable from quest gold, but a saved-for buy', () => {
    const gold20 = goldBy(20);
    // Affordable: quest gold alone (ignoring kills/bounties/loot) covers it.
    expect(cost).toBeLessThanOrEqual(gold20);
    // But meaningful: it costs a real chunk of that gold (GDD "choice pressure"),
    // not the pocket change it used to be.
    expect(cost).toBeGreaterThanOrEqual(0.25 * gold20);
  });

  it('quest gold keeps flowing after 20 (the economy does not dry up)', () => {
    expect(goldBy(30)).toBeGreaterThan(goldBy(20));
  });
});

describe('Balance audit — itemization curve', () => {
  it('weapon dps, stat budget, and armor rise monotonically with item level', () => {
    const warriorAC = armorClassFor(CharacterClass.Warrior);
    for (let ilvl = 1; ilvl < 40; ilvl++) {
      expect(weaponDps(ilvl + 1)).toBeGreaterThan(weaponDps(ilvl));
      expect(statBudget(ilvl + 1, Rarity.Rare)).toBeGreaterThanOrEqual(
        statBudget(ilvl, Rarity.Rare),
      );
      expect(armorRating(ilvl + 1, EquipSlot.Chest, warriorAC)).toBeGreaterThan(
        armorRating(ilvl, EquipSlot.Chest, warriorAC),
      );
    }
  });

  it('higher rarity is strictly more stat budget at the same item level', () => {
    for (const ilvl of [5, 15, 30]) {
      expect(statBudget(ilvl, Rarity.Uncommon)).toBeGreaterThan(statBudget(ilvl, Rarity.Common));
      expect(statBudget(ilvl, Rarity.Rare)).toBeGreaterThan(statBudget(ilvl, Rarity.Uncommon));
      expect(statBudget(ilvl, Rarity.Epic)).toBeGreaterThan(statBudget(ilvl, Rarity.Rare));
    }
  });
});
