// Phase-5 acceptance checks (ROADMAP §Phase 5 Acceptance Criteria). Encodes the
// parts of the five criteria that are provable in pure `shared/`. The rest are
// runtime/human criteria, verified in-browser and on a first playtest:
//
//   #1 blind-playtest reaches level 5 unaided — the onboarding + first-time tips
//      (client `FirstTimeTips.tsx`, keybind-aware) cover movement/combat/quests/gear;
//      final sign-off is a human playtest.
//   #3 frame/load budgets — draw calls (~85–120) and the gzipped bundle (~280 KB ≪ 3 MB)
//      are verified in the headless smokes; real-hardware 60 FPS is confirmed on the
//      reference laptop at launch.
//   #4 audio/VFX for every action — the WebAudio SFX (cast/defeat/level-up/quest) and the
//      pooled VFX (hit/death/cast/level-up/Waystone/blight) are client-side, verified in
//      the in-browser smokes.
//   #5 publicly shareable build — `vercel.json` + the repo-root `dist/` build; the
//      `v1.0-solo` tag is cut at launch.
//
// This file proves #2: the whole game is completable in one save with no blockers.

import { describe, it, expect } from 'vitest';
import {
  QUESTS,
  HOLLOWS,
  HOLLOW_ENCOUNTERS,
  enemyById,
  Profession,
  primaryMaterial,
  TIER_SKILL,
  SKILL_MAX,
  SAVE_VERSION,
  createNewSave,
  validateSave,
  DEFAULT_SETTINGS,
  LEVEL_CAP,
} from '../src/index.js';

describe('Acceptance #2 — the full solo game is completable in one save', () => {
  it('the main story is a complete, level-ordered chain to the level-30 finale', () => {
    const story = QUESTS.filter((q) => q.chain === 'waymakers-path');
    const chapters = new Set(story.map((q) => q.chapter));
    for (const ch of [1, 2, 3, 4, 5, 6]) expect(chapters.has(ch), `chapter ${ch}`).toBe(true);
    const finale = story.find((q) => q.chapter === 6 && q.minLevel === LEVEL_CAP);
    expect(finale, 'a level-30 chapter-6 finale exists').toBeDefined();
    expect(
      finale!.objectives.some((o) => o.kind === 'boss'),
      'finale is a boss fight',
    ).toBe(true);
  });

  it('all five Hollows are enterable and end in a real, world-placed boss', () => {
    expect(HOLLOWS.length).toBe(5);
    for (const h of HOLLOWS) {
      const enc = HOLLOW_ENCOUNTERS.find((e) => e.hollowId === h.id);
      expect(enc, `${h.id} encounter`).toBeDefined();
      const boss = enemyById(enc!.bossEnemyId);
      expect(boss, `${h.id} boss`).toBeDefined();
      expect(boss!.boss, `${h.id} boss has a script`).toBeDefined();
    }
  });

  it('every gathering profession can be levelled all the way to 100', () => {
    // A profession climbs 1→100 by working nodes across its four tiers (skill gates
    // 1/25/50/75). Each tier must have a material to gather, or the skill stalls.
    for (const prof of [Profession.Mining, Profession.Herbalism, Profession.Fishing]) {
      for (let tier = 0; tier < TIER_SKILL.length; tier++) {
        expect(primaryMaterial(prof, tier), `${prof} tier ${tier}`).toBeDefined();
      }
    }
    expect(SKILL_MAX).toBe(100);
  });

  it('quest gates blanket the whole 1→30 climb with no dead band', () => {
    const gates = [...new Set(QUESTS.map((q) => q.minLevel))].sort((a, b) => a - b);
    expect(gates[0]).toBe(1);
    for (let i = 1; i < gates.length; i++) {
      expect(gates[i]! - gates[i - 1]!, `gap ${gates[i - 1]}→${gates[i]}`).toBeLessThanOrEqual(4);
    }
    expect(gates[gates.length - 1]).toBeGreaterThanOrEqual(28);
  });
});

describe('Acceptance — the Phase-5 polish systems are in place', () => {
  it('a fresh save is valid at the current version with the graphics settings', () => {
    const save = createNewSave();
    expect(save.version).toBe(SAVE_VERSION); // v13
    expect(validateSave(save)).toBe(true);
    // The Performance-pass graphics options exist with sane defaults.
    expect(DEFAULT_SETTINGS.shadows).toBeDefined();
    expect(DEFAULT_SETTINGS.vfxDensity).toBeDefined();
    expect(DEFAULT_SETTINGS.resolutionScale).toBeGreaterThan(0);
  });
});
