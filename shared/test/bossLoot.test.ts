// Hollow-boss signature loot (GDD §6, Phase 4 Part 15). Each of the five Hollow
// bosses drops one bespoke Epic unique — the endgame re-run chase. These verify the
// data covers every boss, the drop is a usable, bound, named Epic with a crit rider,
// it fires at roughly its configured chance, and it ONLY drops from that boss.

import { describe, it, expect } from 'vitest';
import {
  ENEMIES,
  EnemyRank,
  BOSS_SIGNATURES,
  bossSignature,
  buildEnemyLootTable,
  rollLoot,
  makeRng,
  canEquip,
  CharacterClass,
  Rarity,
  enemyById,
  type ItemDef,
} from '../src/index.js';

const BOSSES = ENEMIES.filter((e) => e.rank === EnemyRank.Boss);

/** Roll a boss's table N times, returning every item dropped across the runs. */
function rollN(bossId: string, n: number, cls = CharacterClass.Warrior): ItemDef[] {
  const def = enemyById(bossId)!;
  const level = def.band[0];
  const items: ItemDef[] = [];
  for (let i = 0; i < n; i++) {
    const rng = makeRng(1234, 'bossLoot', bossId, String(i));
    const table = buildEnemyLootTable(def, level);
    for (const s of rollLoot(table, rng, { forClass: cls }).items) items.push(s.item);
  }
  return items;
}

describe('Hollow boss signature loot', () => {
  it('every Hollow boss has a signature unique, and only bosses do', () => {
    // All five Hollow bosses are covered.
    expect(BOSSES.length).toBeGreaterThanOrEqual(5);
    for (const b of BOSSES) {
      expect(bossSignature(b.id), `${b.id} signature`).toBeDefined();
    }
    // Signature keys never collide (distinct uniques).
    const keys = Object.values(BOSS_SIGNATURES).map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    // Non-boss enemies have no signature.
    for (const e of ENEMIES) {
      if (e.rank !== EnemyRank.Boss) expect(bossSignature(e.id)).toBeUndefined();
    }
  });

  it('drops a named, Epic, bind-on-equip unique with a crit rider, usable by the killer', () => {
    for (const b of BOSSES) {
      const sig = bossSignature(b.id)!;
      const drops = rollN(b.id, 200);
      const unique = drops.find((it) => it.name === sig.name);
      expect(unique, `${b.id} never dropped ${sig.name}`).toBeDefined();
      expect(unique!.rarity).toBe(Rarity.Epic);
      expect(unique!.bindOnEquip).toBe(true);
      expect(unique!.slot).toBe(sig.slot);
      expect(unique!.bonusCritChance).toBeCloseTo(sig.bonusCritChance, 6);
      expect(unique!.id.startsWith('sig:')).toBe(true);
      // The stats are flavored for the killer, so it's always equippable at boss level.
      expect(canEquip(CharacterClass.Warrior, b.band[0], unique!)).toBe(true);
    }
  });

  it('fires at roughly its configured chance (not guaranteed, not vanishingly rare)', () => {
    for (const b of BOSSES) {
      const sig = bossSignature(b.id)!;
      const runs = 400;
      const def = enemyById(b.id)!;
      let hits = 0;
      for (let i = 0; i < runs; i++) {
        const rng = makeRng(99, 'rate', b.id, String(i));
        const table = buildEnemyLootTable(def, def.band[0]);
        if (
          rollLoot(table, rng, { forClass: CharacterClass.Ranger }).items.some(
            (s) => s.item.name === sig.name,
          )
        ) {
          hits++;
        }
      }
      const rate = hits / runs;
      // Wide tolerance — this is a sanity band, not a tuning assertion.
      expect(rate, `${b.id} rate ${rate}`).toBeGreaterThan(sig.chance * 0.5);
      expect(rate, `${b.id} rate ${rate}`).toBeLessThan(sig.chance * 1.6);
    }
  });

  it('normal and elite enemies never drop a signature unique', () => {
    const sigNames = new Set(Object.values(BOSS_SIGNATURES).map((s) => s.name));
    const nonBosses = ENEMIES.filter((e) => e.rank !== EnemyRank.Boss);
    for (const def of nonBosses) {
      const level = def.band[0];
      for (let i = 0; i < 40; i++) {
        const rng = makeRng(7, 'nonboss', def.id, String(i));
        const table = buildEnemyLootTable(def, level);
        for (const s of rollLoot(table, rng, { forClass: CharacterClass.Mage }).items) {
          expect(sigNames.has(s.item.name), `${def.id} dropped a signature`).toBe(false);
        }
      }
    }
  });
});
