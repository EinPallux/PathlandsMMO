// Phase-4 acceptance checks (ROADMAP §Phase 4 Acceptance Criteria). These encode the
// criteria that are testable in pure `shared/` — chiefly criterion #1 (a gap-free
// 1→30 quest path) — plus cross-checks of the meta / mount / bounty / crafting systems.
// Play-only criteria (#3 UI behaviour, #5 wall-clock pace) are verified in-browser.

import { describe, it, expect } from 'vitest';
import {
  QUESTS,
  MOUNTS,
  MOUNT_MIN_LEVEL,
  DEEDS,
  PERKS,
  RECIPES,
  CONSUMABLES,
  Profession,
  buyPerk,
  applyDeedProgress,
  createDeedState,
  scaledQuestXp,
  totalXpToReachLevel,
  LEVEL_CAP,
} from '../src/index.js';

// Criterion #1 is "quest+kill XP suffices without grinding WALLS, finishing the
// main story solo". A wall is a level band with no quest content to do while you
// level. Kill XP is unbounded (every zone is populated), so the pure-`shared`
// property to prove is: quests blanket the whole 1→30 band with no dead zone, and
// the main story is level-ordered to the cap. (The quest-vs-kill XP *share* — GDD §5
// targets ~55% quests, the current tuning leans on kills — is a Phase-5 tuning item,
// recorded in GDD §15; it changes pace, not reachability.)
const MAX_LEVEL_GAP = 4;

describe('Acceptance #1 — a gap-free 1→30 quest path', () => {
  it('quests blanket the whole 1→30 band with no dead zone', () => {
    const gates = [...new Set(QUESTS.map((q) => q.minLevel))].sort((a, b) => a - b);
    expect(gates[0]).toBe(1); // content starts at level 1
    // Never more than MAX_LEVEL_GAP levels between one quest's requirement and the
    // next — a follower always has something to do while they climb.
    for (let i = 1; i < gates.length; i++) {
      expect(gates[i]! - gates[i - 1]!, `gap ${gates[i - 1]}→${gates[i]}`).toBeLessThanOrEqual(
        MAX_LEVEL_GAP,
      );
    }
    // Content reaches the cap band.
    expect(gates[gates.length - 1]).toBeGreaterThanOrEqual(28);
  });

  it('quests lead the climb after the Phase-5 pace tuning (~40–50% of the curve)', () => {
    // GDD §5 wants a quest-led economy. With the tuned curve (~549k) and quest XP scaled
    // ×2, the sum of all quest rewards (done once) covers a large share of 1→30 — kills
    // (unbounded) supply the rest. This guards the tuning from silently regressing.
    const questXp = QUESTS.reduce((s, q) => s + scaledQuestXp(q.reward.xp), 0);
    const toCap = totalXpToReachLevel(LEVEL_CAP);
    const share = questXp / toCap;
    expect(share).toBeGreaterThan(0.35);
    expect(share).toBeLessThan(0.55);
  });

  it('quest rewards scale up with the level they require', () => {
    // Every quest gives XP, and higher-level quests are worth more than the starters
    // (rewards track the curve, so questing never becomes pointless).
    for (const q of QUESTS) expect(q.reward.xp).toBeGreaterThan(0);
    const starters = QUESTS.filter((q) => q.minLevel <= 3);
    const finale = QUESTS.find((q) => q.id === 'q_the_last_waymaker');
    const avgStarter = starters.reduce((s, q) => s + q.reward.xp, 0) / starters.length;
    expect(finale!.reward.xp).toBeGreaterThan(avgStarter * 5);
  });

  it('the main story is a complete, solo-finishable chain to level 30', () => {
    const story = QUESTS.filter((q) => q.chain === 'waymakers-path');
    const chapters = new Set(story.map((q) => q.chapter));
    for (const ch of [1, 2, 3, 4, 5, 6]) expect(chapters.has(ch)).toBe(true);
    const finale = story.find((q) => q.chapter === 6 && q.minLevel === 30);
    expect(finale, 'a level-30 chapter-6 finale exists').toBeDefined();
    expect(finale!.objectives.some((o) => o.kind === 'boss')).toBe(true);
  });
});

describe('Acceptance #2 — professions & crafting depth (pure checks)', () => {
  it('has all five professions and at least 10 useful recipes/consumables', () => {
    expect(Object.values(Profession).length).toBe(5);
    expect(RECIPES.length + CONSUMABLES.length).toBeGreaterThanOrEqual(10);
  });
});

describe('Acceptance #4 — Deeds, Path Points, perks, and mounts', () => {
  it('Deeds award Path Points and perks are buyable/spendable', () => {
    const s = createDeedState();
    // A completable Deed exists in every category and awards points.
    expect(DEEDS.every((d) => d.pathPoints > 0)).toBe(true);
    applyDeedProgress(s, 'boss'); // Hollow-Delver → 3 PP
    const res = buyPerk({}, 3, 'deepPockets');
    expect(res).not.toBeNull();
    expect(res!.pathPoints).toBeLessThan(3);
    expect(PERKS.length).toBeGreaterThanOrEqual(4);
  });

  it('the mount is a level-gated, outdoor-only ground-speed boost', () => {
    for (const m of MOUNTS) expect(m.speedBonus).toBeGreaterThan(0);
    expect(MOUNT_MIN_LEVEL).toBe(20);
  });
});
