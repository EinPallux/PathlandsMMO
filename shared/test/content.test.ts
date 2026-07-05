import { describe, it, expect } from 'vitest';
import {
  CharacterClass,
  CHARACTER_CLASSES,
  ALL_SKILLS,
  skillsForClass,
  skillsKnownAt,
  skillById,
  pathChoicesAt,
  GCD_TICKS,
  ENEMIES,
  enemyById,
  enemiesForBand,
  enemyStatsFor,
  buildEnemyLootTable,
  buildEnemyModel,
  rollLoot,
  EnemyRank,
  WORLD_SPAWNS,
  DEEDS,
  LEVEL_CAP,
  makeRng,
  WORLD_SEED,
} from '../src/index.js';

describe('Class skills (GDD §3)', () => {
  it('gives each class 12 skills learned across levels 1–30', () => {
    for (const cls of CHARACTER_CLASSES) {
      const skills = skillsForClass(cls);
      expect(skills.length).toBe(12);
      for (const s of skills) {
        expect(s.level).toBeGreaterThanOrEqual(1);
        expect(s.level).toBeLessThanOrEqual(LEVEL_CAP);
        expect(s.cls).toBe(cls);
      }
    }
  });

  it('learn order is non-decreasing by level', () => {
    for (const cls of CHARACTER_CLASSES) {
      const levels = skillsForClass(cls).map((s) => s.level);
      const sorted = [...levels].sort((a, b) => a - b);
      expect(levels).toEqual(sorted);
    }
  });

  it('skillsKnownAt filters by level and skillById resolves', () => {
    const known = skillsKnownAt(CharacterClass.Warrior, 1);
    expect(known.length).toBe(1);
    expect(known[0]!.id).toBe('cleavingStrike');
    expect(skillById('cleavingStrike')?.name).toBe('Cleaving Strike');
    expect(skillById('nope')).toBeUndefined();
    expect(skillsKnownAt(CharacterClass.Mage, LEVEL_CAP).length).toBe(12);
  });

  it('every skill has coherent cost/timing and at least one effect', () => {
    for (const s of ALL_SKILLS) {
      expect(s.effects.length).toBeGreaterThan(0);
      expect(s.resource).toBeGreaterThanOrEqual(0);
      expect(s.castTicks).toBeGreaterThanOrEqual(0);
      expect(s.cooldownTicks).toBeGreaterThanOrEqual(0);
      expect(s.range).toBeGreaterThanOrEqual(0);
    }
    expect(GCD_TICKS).toBe(24); // 1.2 s at 20 Hz
  });

  it('offers two path choices per tier at 10/20/30', () => {
    for (const cls of CHARACTER_CLASSES) {
      for (const tier of [10, 20, 30] as const) {
        expect(pathChoicesAt(cls, tier).length).toBe(2);
      }
    }
  });

  it('skill ids are globally unique', () => {
    const ids = ALL_SKILLS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('Enemies (GDD §4, WORLD.md)', () => {
  it('includes the 10 asset enemies and the five Hollow bosses', () => {
    const ids = new Set(ENEMIES.map((e) => e.id));
    for (const asset of [
      'briarGoblin',
      'mossfangWolf',
      'thornbackBoar',
      'venomcapSpriggan',
      'hollowrootTreant',
      'direStag',
      'caveGnoll',
      'stonejawGrub',
      'crystalbackLizard',
      'ironhideTroll',
    ]) {
      expect(ids.has(asset), asset).toBe(true);
    }
    expect(ENEMIES.filter((e) => e.rank === EnemyRank.Boss).length).toBe(5);
  });

  it('has named rare-elites, each Elite-ranked, buildable, and world-spawned', () => {
    const rares = ENEMIES.filter((e) => e.named);
    expect(rares.length).toBeGreaterThanOrEqual(6);
    const spawnedIds = new Set(WORLD_SPAWNS.map((r) => r.enemyId));
    for (const r of rares) {
      expect(r.rank, `${r.id} rank`).toBe(EnemyRank.Elite);
      expect(r.blurb.length, `${r.id} blurb`).toBeGreaterThan(0);
      // Named rares reuse an existing enemy model, which must build.
      expect(buildEnemyModel(r.modelId), r.modelId).not.toBeNull();
      // Each is placed as a hunt target somewhere in the world.
      expect(spawnedIds.has(r.id), `${r.id} spawn`).toBe(true);
    }
    // The Rarebane Deed tracks the hunt.
    const rarebane = DEEDS.find((d) => d.metric === 'rare');
    expect(rarebane, 'Rarebane deed').toBeDefined();
  });

  it('scales stats by rank (boss ≫ normal at the same level)', () => {
    const normal = enemyStatsFor(enemyById('mossfangWolf')!, 10);
    const boss = enemyStatsFor(enemyById('bossLastWaymaker')!, 10);
    // Phase-3 solo tuning: boss ×4.5 HP / ×1.25 dmg over a same-level normal.
    expect(boss.maxHP).toBeGreaterThan(normal.maxHP * 4);
    expect(boss.damage).toBeGreaterThan(normal.damage);
  });

  it('band lookup finds level-appropriate enemies', () => {
    const low = enemiesForBand(1, 5).map((e) => e.id);
    expect(low).toContain('thornbackBoar');
    expect(low).not.toContain('ironhideTroll');
  });

  it('boss loot always yields items; is deterministic per seed', () => {
    const boss = enemyById('bossBriarking')!;
    const table = buildEnemyLootTable(boss, 12);
    const a = rollLoot(table, makeRng(WORLD_SEED, 'kill', boss.id), {
      forClass: CharacterClass.Warrior,
    });
    const b = rollLoot(table, makeRng(WORLD_SEED, 'kill', boss.id), {
      forClass: CharacterClass.Warrior,
    });
    expect(a.items.length).toBeGreaterThan(0);
    expect(a.gold).toBe(b.gold);
    expect(a.items.map((s) => s.item.id)).toEqual(b.items.map((s) => s.item.id));
  });
});
