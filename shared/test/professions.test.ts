import { describe, it, expect } from 'vitest';
import {
  Profession,
  MATERIALS,
  SKILL_MAX,
  TIER_SKILL,
  materialById,
  primaryMaterial,
  nodeInfo,
  NODE_INFO,
  difficulty,
  canGather,
  skillUp,
  gatherNode,
  rollFish,
  initialSkills,
  makeRng,
  WORLD_SEED,
} from '../src/index.js';

describe('Profession data (GDD §9)', () => {
  it('maps every node prop to a real material tier', () => {
    for (const [prop, info] of Object.entries(NODE_INFO)) {
      const mat = primaryMaterial(info.profession, info.tier);
      expect(mat, prop).toBeDefined();
    }
    expect(nodeInfo('oreCopper')).toEqual({ profession: Profession.Mining, tier: 0 });
    expect(nodeInfo('notANode')).toBeUndefined();
  });

  it('has a primary material for every gathering tier', () => {
    for (const prof of [Profession.Mining, Profession.Herbalism, Profession.Fishing]) {
      for (let tier = 0; tier < TIER_SKILL.length; tier++) {
        expect(primaryMaterial(prof, tier), `${prof} t${tier}`).toBeDefined();
      }
    }
    expect(materialById('copperOre')!.value).toBeGreaterThan(0);
  });
});

describe('Gather skill curve (GDD §9)', () => {
  it('gates nodes by skill and colours difficulty', () => {
    // canGather(skill, tier): tier req = 1 / 25 / 50 / 75.
    expect(canGather(1, 0)).toBe(true); // copper at skill 1
    expect(canGather(1, 1)).toBe(false); // iron needs 25
    expect(canGather(25, 1)).toBe(true);
    expect(canGather(74, 3)).toBe(false); // crystalium needs 75
    expect(difficulty(1, 0)).toBe('orange');
    expect(difficulty(10, 0)).toBe('yellow');
    expect(difficulty(20, 0)).toBe('green');
    expect(difficulty(26, 0)).toBe('gray'); // fully outleveled tier 0
  });

  it('skills up at orange/yellow, never past the cap', () => {
    const rng = makeRng(WORLD_SEED, 'skill');
    expect(skillUp(rng, 1, 0)).toBe(2); // orange → +1
    expect(skillUp(rng, SKILL_MAX, 0)).toBe(SKILL_MAX); // capped
    expect(skillUp(rng, 30, 0)).toBe(30); // gray tier 0 → no gain
  });

  it('mining yields ore + stone deterministically; above-skill returns null', () => {
    const a = gatherNode(makeRng(WORLD_SEED, 'g'), Profession.Mining, 0, 1);
    const b = gatherNode(makeRng(WORLD_SEED, 'g'), Profession.Mining, 0, 1);
    expect(a).toEqual(b);
    expect(a!.yields.some((y) => y.materialId === 'copperOre')).toBe(true);
    expect(a!.yields.some((y) => y.materialId === 'roughStone')).toBe(true);
    expect(a!.newSkill).toBe(2);
    // Iron node (tier 1, req 25) with skill 5 → cannot gather.
    expect(gatherNode(makeRng(WORLD_SEED, 'g'), Profession.Mining, 1, 5)).toBeNull();
  });

  it('herbalism yields the herb with no stone byproduct', () => {
    const r = gatherNode(makeRng(WORLD_SEED, 'h'), Profession.Herbalism, 0, 1)!;
    expect(r.yields.some((y) => y.materialId === 'meadowbloom')).toBe(true);
    expect(r.yields.some((y) => y.materialId === 'roughStone')).toBe(false);
  });

  it('fishing rolls a catch deterministically', () => {
    const a = rollFish(makeRng(WORLD_SEED, 'f'), 0, 1);
    const b = rollFish(makeRng(WORLD_SEED, 'f'), 0, 1);
    expect(a).toEqual(b);
    const fishIds = new Set(
      MATERIALS.filter((m) => m.profession === Profession.Fishing).map((m) => m.id),
    );
    expect(a.yields.some((y) => fishIds.has(y.materialId))).toBe(true);
  });

  it('initial skills start every profession at 1', () => {
    const s = initialSkills();
    expect(s.mining).toBe(1);
    expect(Object.keys(s)).toHaveLength(5);
  });
});
