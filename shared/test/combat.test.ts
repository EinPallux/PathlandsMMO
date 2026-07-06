import { describe, it, expect } from 'vitest';
import {
  createCombatState,
  addEntity,
  makePlayerEntity,
  makeEnemyById,
  applyDamage,
  applyIntent,
  stepCombat,
  stepSim,
  stepEnemyAI,
  drainEvents,
  createSpawner,
  stepSpawner,
  liveCount,
  CharacterClass,
  enemyById,
  type CombatEvent,
} from '../src/index.js';

const sumDamage = (events: CombatEvent[]): number =>
  events.reduce((a, e) => a + (e.type === 'damage' ? e.amount : 0), 0);

function collect(events: CombatEvent[], type: CombatEvent['type']): CombatEvent[] {
  return events.filter((e) => e.type === type);
}

describe('Combat resolver (GDD §4)', () => {
  it('an ally-target skill cannot be cast on a hostile enemy (no healing the boss)', () => {
    const state = createCombatState(999);
    addEntity(state, makePlayerEntity('p1', 'Cleric', CharacterClass.Priest, 6, 0, 64, 0));
    const boar = makeEnemyById('m1', 'thornbackBoar', 4, 0, 64, 1)!;
    boar.hp = 10; // wounded — a heal would be visible if it landed
    addEntity(state, boar);
    // Mend is an ally-target heal; aiming it at the enemy must be rejected (badTarget),
    // never start a cast, and leave the enemy's health untouched.
    const ok = applyIntent(state, 'p1', { type: 'CastSkill', skillId: 'mend', targetId: 'm1' });
    expect(ok).toBe(false);
    expect(collect(drainEvents(state), 'castFail').length).toBeGreaterThan(0);
    expect(state.entities.get('m1')!.hp).toBe(10);
  });

  it('a Warrior kills a boar with skills + auto-attacks and gains XP', () => {
    const state = createCombatState(12345);
    const player = addEntity(
      state,
      makePlayerEntity('p1', 'Hero', CharacterClass.Warrior, 5, 0, 64, 0),
    );
    const boar = makeEnemyById('m1', 'thornbackBoar', 4, 0, 64, 2)!;
    addEntity(state, boar);

    applyIntent(state, 'p1', { type: 'SetTarget', targetId: 'm1' });
    applyIntent(state, 'p1', { type: 'ToggleAutoAttack', on: true });

    const allEvents: CombatEvent[] = [];
    let died = false;
    for (let i = 0; i < 400 && !died; i++) {
      // Cast Cleaving Strike whenever off cooldown/GCD and Rage allows.
      applyIntent(state, 'p1', { type: 'CastSkill', skillId: 'cleavingStrike', targetId: 'm1' });
      stepCombat(state);
      const ev = drainEvents(state);
      allEvents.push(...ev);
      if (ev.some((e) => e.type === 'death' && e.entityId === 'm1')) died = true;
    }

    expect(died).toBe(true);
    expect(state.entities.get('m1')!.dead).toBe(true);
    // Damage was dealt and XP awarded.
    expect(collect(allEvents, 'damage').length).toBeGreaterThan(0);
    const xp = collect(allEvents, 'xp');
    expect(xp.length).toBe(1);
    expect((xp[0] as { amount: number }).amount).toBeGreaterThan(0);
    // The player took some damage back but survived.
    expect(player.hp).toBeLessThan(player.maxHP);
    expect(player.dead).toBe(false);
  });

  it('is deterministic: same seed + inputs ⇒ identical outcome', () => {
    const run = (): number => {
      const s = createCombatState(999);
      addEntity(s, makePlayerEntity('p', 'A', CharacterClass.Mage, 8, 0, 64, 0));
      addEntity(s, makeEnemyById('m', 'mossfangWolf', 8, 0, 64, 3)!);
      applyIntent(s, 'p', { type: 'SetTarget', targetId: 'm' });
      let dmg = 0;
      for (let i = 0; i < 60; i++) {
        applyIntent(s, 'p', { type: 'CastSkill', skillId: 'frostbolt', targetId: 'm' });
        stepCombat(s);
        for (const e of drainEvents(s)) if (e.type === 'damage') dmg += e.amount;
      }
      return dmg;
    };
    expect(run()).toBe(run());
  });

  it('enforces resource, range, GCD, and cooldown on casts', () => {
    const state = createCombatState(7);
    const mage = addEntity(state, makePlayerEntity('p', 'M', CharacterClass.Mage, 10, 0, 64, 0));
    addEntity(state, makeEnemyById('m', 'briarGoblin', 8, 0, 64, 200)!); // far away

    // Out of range.
    applyIntent(state, 'p', { type: 'SetTarget', targetId: 'm' });
    expect(
      applyIntent(state, 'p', { type: 'CastSkill', skillId: 'frostbolt', targetId: 'm' }),
    ).toBe(false);
    expect(drainEvents(state).some((e) => e.type === 'castFail')).toBe(true);

    // Move the enemy adjacent; instant Fire Blast works, but re-firing hits cooldown.
    const m = state.entities.get('m')!;
    m.x = 0;
    m.z = 2;
    expect(
      applyIntent(state, 'p', { type: 'CastSkill', skillId: 'fireBlast', targetId: 'm' }),
    ).toBe(true);
    stepCombat(state);
    expect(
      applyIntent(state, 'p', { type: 'CastSkill', skillId: 'fireBlast', targetId: 'm' }),
    ).toBe(false);

    // Draining all mana blocks a big cast.
    mage.resource = 0;
    expect(applyIntent(state, 'p', { type: 'CastSkill', skillId: 'fireball', targetId: 'm' })).toBe(
      false,
    );
  });

  it('applies a DoT that ticks over time', () => {
    const state = createCombatState(3);
    addEntity(state, makePlayerEntity('p', 'R', CharacterClass.Ranger, 6, 0, 64, 0));
    const wolf = addEntity(state, makeEnemyById('m', 'mossfangWolf', 6, 0, 64, 3)!);
    applyIntent(state, 'p', { type: 'SetTarget', targetId: 'm' });
    applyIntent(state, 'p', { type: 'CastSkill', skillId: 'serpentSting', targetId: 'm' });

    const hpAfterCast = wolf.hp;
    let dotTicks = 0;
    for (let i = 0; i < 60; i++) {
      stepCombat(state);
      for (const e of drainEvents(state)) {
        if (e.type === 'damage' && e.skillId === 'serpentSting') dotTicks++;
      }
    }
    expect(dotTicks).toBeGreaterThanOrEqual(3);
    expect(wolf.hp).toBeLessThan(hpAfterCast);
  });

  it('enemy AI aggros, chases, and retaliates', () => {
    const state = createCombatState(42);
    const player = addEntity(state, makePlayerEntity('p', 'H', CharacterClass.Priest, 8, 0, 64, 0));
    // Wolf spawns 10 m away, aggro radius 16 → should notice and close in.
    addEntity(state, makeEnemyById('m', 'mossfangWolf', 8, 10, 64, 0)!);

    let playerHit = false;
    for (let i = 0; i < 200 && !playerHit; i++) {
      stepSim(state);
      for (const e of drainEvents(state)) {
        if (e.type === 'damage' && e.targetId === 'p') playerHit = true;
      }
    }
    expect(playerHit).toBe(true);
    expect(player.hp).toBeLessThan(player.maxHP);
    // The wolf moved toward the player from its spawn.
    expect(state.entities.get('m')!.x).toBeLessThan(10);
  });

  it('leashes an enemy back home when chased too far', () => {
    const state = createCombatState(5);
    const wolf = addEntity(state, makeEnemyById('m', 'mossfangWolf', 8, 0, 64, 0)!);
    wolf.targetId = 'p';
    wolf.aiState = 'aggro';
    wolf.threat['p'] = 100;
    // Player is way outside the leash radius.
    addEntity(state, makePlayerEntity('p', 'H', CharacterClass.Ranger, 8, 100, 64, 0));

    for (let i = 0; i < 200; i++) {
      stepEnemyAI(state);
      state.tick++;
    }
    // Wolf returned near its spawn and reset.
    expect(Math.hypot(wolf.x - 0, wolf.z - 0)).toBeLessThan(3);
    expect(wolf.hp).toBe(wolf.maxHP);
  });
});

describe('Spawner', () => {
  it('maintains a population and respawns the dead deterministically', () => {
    const state = createCombatState(1);
    const spawner = createSpawner(1);
    const region = {
      id: 'vale-boars',
      enemyId: 'thornbackBoar',
      level: [2, 4] as [number, number],
      cx: 1536,
      cz: 1536,
      radius: 20,
      count: 3,
      respawnTicks: 40,
    };

    stepSpawner(state, spawner, region);
    expect(liveCount(spawner, region.id, state)).toBe(3);

    // Kill one; it should respawn after the timer.
    const firstLive = [...state.entities.values()].find((e) => e.enemyId === 'thornbackBoar')!;
    firstLive.dead = true;
    stepSpawner(state, spawner, region); // frees the slot
    expect(liveCount(spawner, region.id, state)).toBe(2);
    for (let i = 0; i < 41; i++) {
      state.tick++;
      stepSpawner(state, spawner, region);
    }
    expect(liveCount(spawner, region.id, state)).toBe(3);

    // Determinism: an identical run yields identical spawn positions.
    const state2 = createCombatState(1);
    const spawner2 = createSpawner(1);
    stepSpawner(state2, spawner2, region);
    const pos = (s: typeof state): number[] =>
      [...s.entities.values()].map((e) => Math.round(e.x * 100)).sort((a, b) => a - b);
    // Compare fresh single-step spawns.
    const state3 = createCombatState(1);
    const spawner3 = createSpawner(1);
    stepSpawner(state3, spawner3, region);
    expect(pos(state2)).toEqual(pos(state3));
  });

  it('boss enemy stats dwarf a normal of the same level', () => {
    expect(enemyById('bossBriarking')!.rank).toBe('boss');
  });
});

describe('Adversarial-review regressions (GDD §3/§4)', () => {
  it('Execute scales with the Rage actually spent (was inverted)', () => {
    const run = (rage: number): number => {
      const s = createCombatState(1);
      const p = addEntity(s, makePlayerEntity('p', 'W', CharacterClass.Warrior, 16, 0, 64, 0));
      const m = addEntity(s, makeEnemyById('m', 'thornbackBoar', 16, 0, 64, 2)!);
      m.hp = m.maxHP * 0.1; // below the 25% Execute threshold
      p.stats.critChance = 0; // remove crit variance
      p.resource = rage;
      applyIntent(s, 'p', { type: 'SetTarget', targetId: 'm' });
      applyIntent(s, 'p', { type: 'CastSkill', skillId: 'execute', targetId: 'm' });
      return sumDamage(drainEvents(s));
    };
    expect(run(60)).toBeGreaterThan(run(20));
  });

  it('Shield Wall stance reduces damage taken (stance was ignored)', () => {
    const loss = (stance: boolean): number => {
      const s = createCombatState(2);
      const p = addEntity(s, makePlayerEntity('p', 'W', CharacterClass.Warrior, 10, 0, 64, 0));
      const m = addEntity(s, makeEnemyById('m', 'thornbackBoar', 10, 0, 64, 2)!);
      m.stats.critChance = 0;
      if (stance) p.stance['shieldWallStance'] = 1;
      const before = p.hp;
      applyDamage(s, m, p, 100, 'physical', 't');
      return before - p.hp;
    };
    expect(loss(true)).toBeLessThan(loss(false));
  });

  it('a DoT delivers all N ticks over its full duration (was N−1)', () => {
    const s = createCombatState(3);
    addEntity(s, makePlayerEntity('p', 'R', CharacterClass.Ranger, 6, 0, 64, 0));
    const m = addEntity(s, makeEnemyById('m', 'mossfangWolf', 6, 0, 64, 3)!);
    m.hp = 1e6; // survive the whole DoT
    m.maxHP = 1e6;
    applyIntent(s, 'p', { type: 'SetTarget', targetId: 'm' });
    applyIntent(s, 'p', { type: 'CastSkill', skillId: 'serpentSting', targetId: 'm' });
    let ticks = 0;
    for (let i = 0; i < 260; i++) {
      stepCombat(s);
      for (const e of drainEvents(s))
        if (e.type === 'damage' && e.skillId === 'serpentSting') ticks++;
    }
    expect(ticks).toBe(12); // 12 s duration / 1 s interval
  });

  it('Purify removes a nature poison DoT but not a bleed (was debuff-only)', () => {
    const s = createCombatState(4);
    const p = addEntity(s, makePlayerEntity('p', 'P', CharacterClass.Priest, 10, 0, 64, 0));
    const dot = (skillId: string, school: 'nature' | 'physical') => ({
      uid: `x-${skillId}`,
      sourceId: 'e',
      skillId,
      kind: 'dot' as const,
      expiresTick: s.tick + 200,
      school,
      amountPerTick: 1,
      nextTickAt: s.tick + 9999,
      tickInterval: 20,
    });
    p.auras.push(dot('poison', 'nature'), dot('bleed', 'physical'));
    applyIntent(s, 'p', { type: 'CastSkill', skillId: 'purify', targetId: 'p' });
    expect(p.auras.some((a) => a.skillId === 'poison')).toBe(false);
    expect(p.auras.some((a) => a.skillId === 'bleed')).toBe(true);
  });

  it('a stunned attacker cannot auto-attack (stun only gated new casts before)', () => {
    const s = createCombatState(5);
    addEntity(s, makePlayerEntity('p', 'W', CharacterClass.Warrior, 10, 0, 64, 0));
    const m = addEntity(s, makeEnemyById('m', 'thornbackBoar', 10, 0, 64, 2)!);
    m.targetId = 'p';
    m.auras.push({ uid: 'st', sourceId: 'p', skillId: 'stun', kind: 'stun', expiresTick: 60 });
    let hits = 0;
    for (let i = 0; i < 30; i++) {
      stepCombat(s);
      for (const e of drainEvents(s)) if (e.type === 'damage' && e.targetId === 'p') hits++;
    }
    expect(hits).toBe(0);
  });

  it('a ground-targeted skill out of range fails', () => {
    const s = createCombatState(6);
    const p = addEntity(s, makePlayerEntity('p', 'M', CharacterClass.Mage, 20, 0, 64, 0));
    p.resource = p.maxResource;
    // Blizzard has RANGED (30 m) range; 200 m away must fail.
    expect(
      applyIntent(s, 'p', { type: 'CastSkill', skillId: 'blizzard', groundX: 200, groundZ: 0 }),
    ).toBe(false);
    expect(
      applyIntent(s, 'p', { type: 'CastSkill', skillId: 'blizzard', groundX: 5, groundZ: 0 }),
    ).toBe(true);
  });

  it('aura uids are reproducible from the seed (auraSeq lives in the state)', () => {
    const uids = (): string => {
      const s = createCombatState(7);
      const p = addEntity(s, makePlayerEntity('p', 'W', CharacterClass.Warrior, 10, 0, 64, 0));
      p.resource = p.maxResource; // fund the rage cost so the DoT actually lands
      const m = addEntity(s, makeEnemyById('m', 'thornbackBoar', 10, 0, 64, 2)!);
      applyIntent(s, 'p', { type: 'SetTarget', targetId: 'm' });
      applyIntent(s, 'p', { type: 'CastSkill', skillId: 'rend', targetId: 'm' });
      return m.auras.map((a) => a.uid).join(',');
    };
    expect(uids()).toBe(uids());
    expect(uids()).toContain('a1');
  });

  it('an enemy switches to the highest-threat attacker (Taunt), not the first', () => {
    const s = createCombatState(8);
    addEntity(s, makePlayerEntity('tank', 'W', CharacterClass.Warrior, 10, 1, 64, 0));
    addEntity(s, makePlayerEntity('dps', 'M', CharacterClass.Mage, 10, -1, 64, 0));
    const m = addEntity(s, makeEnemyById('m', 'thornbackBoar', 10, 0, 64, 0)!);
    m.threat = { dps: 100 }; // dps has aggro
    stepEnemyAI(s);
    expect(m.targetId).toBe('dps');
    // Tank taunts → threat set above the top → enemy switches.
    applyIntent(s, 'tank', { type: 'SetTarget', targetId: 'm' });
    applyIntent(s, 'tank', { type: 'CastSkill', skillId: 'taunt', targetId: 'm' });
    stepEnemyAI(s);
    expect(m.targetId).toBe('tank');
  });
});
