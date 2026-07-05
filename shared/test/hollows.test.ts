import { describe, it, expect } from 'vitest';
import {
  createCombatState,
  addEntity,
  makePlayerEntity,
  makeEnemyById,
  applyIntent,
  stepSim,
  stepBossMechanics,
  drainEvents,
  CharacterClass,
  enemyById,
  isAlive,
  WORLD_SPAWNS,
  HOLLOW_ENCOUNTERS,
  type CombatState,
  type CombatEntity,
} from '../src/index.js';

// Count summoned adds (ids are `${bossId}~add<tick>#<i>`).
const addCount = (s: CombatState): number =>
  [...s.entities.values()].filter((e) => e.id.includes('~add') && !e.dead).length;

function engagedBoss(bossId: string, level: number): { s: CombatState; boss: CombatEntity } {
  const s = createCombatState(7);
  addEntity(s, makePlayerEntity('p', 'W', CharacterClass.Warrior, level, 0, 64, 0));
  const boss = addEntity(s, makeEnemyById('b', bossId, level, 0, 64, 3)!);
  boss.targetId = 'p'; // engaged
  return { s, boss };
}

describe('Boss encounter scripts (WORLD.md §6, GDD §4)', () => {
  it('summons adds as the boss crosses its HP thresholds', () => {
    const { s, boss } = engagedBoss('bossBriarking', 12);
    expect(addCount(s)).toBe(0);
    boss.hp = boss.maxHP * 0.65; // below the 66% phase
    stepBossMechanics(s);
    expect(addCount(s)).toBe(1);
    expect(boss.bossPhaseIdx).toBe(1);
    boss.hp = boss.maxHP * 0.3; // below the 33% phase
    stepBossMechanics(s);
    expect(addCount(s)).toBe(2);
    expect(boss.bossPhaseIdx).toBe(2);
    // Adds are the boss's minions and engage the boss's target.
    const add = [...s.entities.values()].find((e) => e.id.includes('~add'))!;
    expect(add.enemyId).toBe('briarGoblin');
    expect(add.targetId).toBe('p');
  });

  it('fires each phase exactly once (no re-trigger at the same HP)', () => {
    const { s, boss } = engagedBoss('bossBriarking', 12);
    boss.hp = boss.maxHP * 0.6;
    stepBossMechanics(s);
    stepBossMechanics(s);
    stepBossMechanics(s);
    expect(addCount(s)).toBe(1); // only the 66% phase fired
  });

  it('does not script while the boss is unengaged', () => {
    const { s, boss } = engagedBoss('bossBriarking', 12);
    boss.targetId = null;
    boss.hp = boss.maxHP * 0.2;
    stepBossMechanics(s);
    expect(addCount(s)).toBe(0);
    expect(boss.bossPhaseIdx).toBe(0);
  });

  it('scales summon count up by one per extra nearby ally (group scaling)', () => {
    const { s, boss } = engagedBoss('bossBriarking', 12);
    addEntity(s, makePlayerEntity('p2', 'A', CharacterClass.Mage, 12, 1, 64, 3)); // 2nd ally in range
    boss.hp = boss.maxHP * 0.6;
    stepBossMechanics(s);
    expect(addCount(s)).toBe(2); // base 1 + 1 extra ally
  });

  it('gives Prismhide a reflective shield at its phase threshold', () => {
    const { s, boss } = engagedBoss('bossCrystalWyrm', 22);
    boss.hp = boss.maxHP * 0.6;
    stepBossMechanics(s);
    const shield = boss.auras.find((a) => a.kind === 'shield');
    expect(shield).toBeDefined();
    expect(shield!.absorb!).toBeGreaterThan(0);
  });

  it('enrages the boss (a damage-dealt buff) at its enrage phase', () => {
    const { s, boss } = engagedBoss('bossIronvein', 28);
    boss.hp = boss.maxHP * 0.55; // below Urzul's 0.6 enrage phase
    stepBossMechanics(s);
    const enrage = boss.auras.find((a) => a.kind === 'buff' && a.modifier === 'damageDealt');
    expect(enrage).toBeDefined();
    expect(enrage!.magnitude!).toBeGreaterThan(0);
  });

  it('emits a bossPhase event the UI can bark', () => {
    const s = createCombatState(1);
    addEntity(s, makePlayerEntity('p', 'W', CharacterClass.Warrior, 12, 0, 64, 0));
    const boss = addEntity(s, makeEnemyById('b', 'bossBriarking', 12, 0, 64, 3)!);
    boss.targetId = 'p';
    boss.hp = boss.maxHP * 0.6;
    stepBossMechanics(s);
    expect(drainEvents(s).some((e) => e.type === 'bossPhase')).toBe(true);
  });
});

describe('World spawn table (WORLD.md §3/§6)', () => {
  it('references only real enemies', () => {
    for (const r of WORLD_SPAWNS) expect(enemyById(r.enemyId), r.id).toBeDefined();
  });

  it('places all five Hollow bosses in the world', () => {
    const spawned = new Set(WORLD_SPAWNS.map((r) => r.enemyId));
    for (const enc of HOLLOW_ENCOUNTERS) {
      expect(spawned.has(enc.bossEnemyId), enc.hollowId).toBe(true);
      const def = enemyById(enc.bossEnemyId)!;
      expect(def.boss, enc.bossEnemyId).toBeDefined(); // every boss has a script
    }
  });

  it('places all ten asset enemies in their zones', () => {
    const spawned = new Set(WORLD_SPAWNS.map((r) => r.enemyId));
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
      expect(spawned.has(asset), asset).toBe(true);
    }
  });
});

describe('Briarhollow is clearable solo at-level (acceptance criterion 3)', () => {
  // A geared, at-level (L13) player of a "comfortable" class, standing rotation.
  const LOADOUT = {
    Warrior: {
      cls: CharacterClass.Warrior,
      gear: { might: 40, stamina: 40 },
      armor: 360,
      skills: ['cleavingStrike', 'rend'],
    },
    Ranger: {
      cls: CharacterClass.Ranger,
      gear: { agility: 40, stamina: 30 },
      armor: 180,
      skills: ['aimedShot', 'serpentSting'],
    },
  } as const;

  for (const name of ['Warrior', 'Ranger'] as const) {
    it(`${name} defeats Warlord Bramblegut solo without dying`, () => {
      const lo = LOADOUT[name];
      const s = createCombatState(2024);
      const p = addEntity(
        s,
        makePlayerEntity(
          'p',
          name,
          lo.cls,
          13,
          2300,
          64,
          1556,
          lo.gear,
          {
            armor: lo.armor,
            bonusCritChance: 0.04,
          },
          15,
        ),
      );
      addEntity(s, makeEnemyById('m', 'bossBriarking', 12, 2300, 64, 1560)!);
      applyIntent(s, 'p', { type: 'SetTarget', targetId: 'm' });
      applyIntent(s, 'p', { type: 'ToggleAutoAttack', on: true });
      if (lo.cls === CharacterClass.Warrior)
        applyIntent(s, 'p', { type: 'CastSkill', skillId: 'shieldWall' });

      let bossDead = false;
      let playerDead = false;
      let sawAdds = false;
      for (let i = 0; i < 4000 && !bossDead && !playerDead; i++) {
        if (p.targetId !== 'm') applyIntent(s, 'p', { type: 'SetTarget', targetId: 'm' });
        for (const sk of lo.skills)
          applyIntent(s, 'p', { type: 'CastSkill', skillId: sk, targetId: 'm' });
        if (lo.cls === CharacterClass.Warrior)
          applyIntent(s, 'p', { type: 'CastSkill', skillId: 'shieldWall' });
        stepSim(s);
        if (addCount(s) > 0) sawAdds = true;
        for (const ev of drainEvents(s)) {
          if (ev.type === 'death' && ev.entityId === 'm') bossDead = true;
          if (ev.type === 'death' && ev.entityId === 'p') playerDead = true;
        }
      }
      expect(bossDead).toBe(true);
      expect(playerDead).toBe(false);
      expect(sawAdds).toBe(true); // the summon mechanic actually fired mid-fight
      expect(isAlive(s.entities.get('p'))).toBe(true);
    });
  }
});
