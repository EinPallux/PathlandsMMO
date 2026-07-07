// Leveling & experience (GDD §5). Pure, deterministic integer math.
//   XP to complete level L: XP(L) = 250 · L^1.55  (≈250 at 1, ≈46k at 29; ~549k to cap).
// Cap is 30; a level-30 character cannot gain further levels.
//
// Phase-5 pace tuning (was 400·L^1.55 ≈ 878k): the old curve made a 1→30 run lean grindy
// (Phase-4 acceptance #5 / GDD §15). Lowering the base to 250 (~549k) and scaling quest XP
// ×2 (QUEST_XP_SCALE) moves quests to ~44% of the climb — closer to the GDD §5 intent
// (quests-led) and a ~25–35 h pace. Kill XP (killXp) is unchanged and fills the rest.

export const LEVEL_CAP = 30;
const XP_BASE = 250;
const XP_EXPONENT = 1.55;

/**
 * Multiplier applied to authored quest reward XP at the grant + display edge (GDD §5/§15
 * tuning). The reward data in `shared/data/quests` stays readable; the effective value is
 * scaled here so it stays one source of truth for client, UI, and the Phase-6 server.
 */
export const QUEST_XP_SCALE = 2;

/** A quest reward's effective XP after the §5 tuning scale (rounded). */
export function scaledQuestXp(baseXp: number): number {
  return Math.round(baseXp * QUEST_XP_SCALE);
}

/**
 * XP required to advance FROM `level` to `level + 1`. Returns Infinity at the
 * cap (level 30 never completes). Rounded to a whole number so totals are exact.
 */
export function xpToCompleteLevel(level: number): number {
  if (level >= LEVEL_CAP) return Infinity;
  if (level < 1) return XP_BASE;
  return Math.round(XP_BASE * Math.pow(level, XP_EXPONENT));
}

/** Cumulative XP needed to first reach `level` (reaching level 1 costs 0). */
export function totalXpToReachLevel(level: number): number {
  const target = Math.min(Math.max(level, 1), LEVEL_CAP);
  let total = 0;
  for (let l = 1; l < target; l++) total += xpToCompleteLevel(l);
  return total;
}

export interface LevelProgress {
  level: number;
  /** XP accumulated into the current level. */
  xpIntoLevel: number;
  /** XP needed to finish the current level (Infinity at cap). */
  xpForLevel: number;
}

/**
 * Resolve a total lifetime-XP figure into a level + progress within it. Clamps to
 * [1, LEVEL_CAP]; XP beyond the cap is ignored (a capped character shows full).
 */
export function levelProgressFromTotalXp(totalXp: number): LevelProgress {
  let level = 1;
  let remaining = Math.max(0, Math.floor(totalXp));
  while (level < LEVEL_CAP) {
    const need = xpToCompleteLevel(level);
    if (remaining < need) break;
    remaining -= need;
    level++;
  }
  return {
    level,
    xpIntoLevel: level >= LEVEL_CAP ? 0 : remaining,
    xpForLevel: xpToCompleteLevel(level),
  };
}

// --- Kill XP with level delta (GDD §4 enemy baseline) ---
// Same-level: 12 + 6·L. Scales with the enemy-minus-player level delta: tougher
// mobs are worth more (+20%/level, capped), and reward fades linearly to zero at
// six levels below the player ("gray" mobs give nothing).

const KILL_XP_FLAT = 12;
const KILL_XP_PER_LEVEL = 6;
export const GRAY_LEVEL_DELTA = -6;

/** XP multiplier for an (enemyLevel − playerLevel) delta. */
export function killXpMultiplier(delta: number): number {
  if (delta <= GRAY_LEVEL_DELTA) return 0;
  if (delta < 0) return 1 + delta / -GRAY_LEVEL_DELTA; // linear → 0 at −6
  return Math.min(1 + 0.2 * delta, 1.4); // tougher mobs up to +40%
}

/** XP awarded for killing an enemy of `enemyLevel` by a player of `playerLevel`. */
export function killXp(playerLevel: number, enemyLevel: number): number {
  const base = KILL_XP_FLAT + KILL_XP_PER_LEVEL * enemyLevel;
  return Math.round(base * killXpMultiplier(enemyLevel - playerLevel));
}

// --- Rested XP (GDD §5) ---
// Logging out at an inn or near a Waystone accrues a pool that grants +100% kill
// XP (kills award double) until spent, capped at 1.5 levels' worth. Path Points
// can raise the cap; callers pass the current cap multiplier.

export const RESTED_CAP_LEVELS = 1.5;

/** Maximum rested pool for a character at `level` (in XP points). */
export function restedCap(level: number, capLevels = RESTED_CAP_LEVELS): number {
  return Math.round(xpToCompleteLevelSafe(level) * capLevels);
}

function xpToCompleteLevelSafe(level: number): number {
  const need = xpToCompleteLevel(level);
  return Number.isFinite(need) ? need : xpToCompleteLevel(LEVEL_CAP - 1);
}

export interface RestedAward {
  /** Total XP the player receives (base + rested bonus). */
  xp: number;
  /** Rested pool consumed by the bonus. */
  restedSpent: number;
}

/**
 * Apply the rested bonus to a base kill-XP amount. The bonus doubles kill XP,
 * drawing an equal amount from the rested pool until it runs dry.
 */
export function applyRested(baseKillXp: number, restedPool: number): RestedAward {
  const bonus = Math.min(Math.max(0, restedPool), baseKillXp);
  return { xp: baseKillXp + bonus, restedSpent: bonus };
}

// --- Party kill-XP sharing (GDD §Party; Phase-6 grouping) ---
// Grouping scales rewards up, never gates: every party member close enough to "be in the
// fight" gets the FULL kill XP (no split), so playing together is strictly better than apart.
// The radius matches the boss-ally "in the fight" distance so the two group rules agree.
// TODO(tuning): a level-difference share penalty could curb trivial power-leveling; for the
// level-30 solo-first game this generous rule is fine and simpler.

/** Distance (metres) within which a party member shares a kill's XP — same as the boss-ally range. */
export const PARTY_XP_SHARE_RADIUS = 40;

/** A party member's id + planar position, for the XP-share range check. */
export interface XpShareMember {
  id: string;
  x: number;
  z: number;
}

/**
 * Which players receive a kill's XP: the earner always, plus every OTHER party member within
 * `radius` of the earner. Pure + deterministic (no split — each recipient gets the full amount).
 * `members` may include the earner (skipped) and is otherwise the earner's party; an empty list
 * (solo) yields just the earner. The returned ids are unique and lead with the earner.
 */
export function partyXpRecipients(
  earnerId: string,
  earner: { x: number; z: number },
  members: readonly XpShareMember[],
  radius = PARTY_XP_SHARE_RADIUS,
): string[] {
  const out = [earnerId];
  const r2 = radius * radius;
  for (const m of members) {
    if (m.id === earnerId) continue;
    const dx = m.x - earner.x;
    const dz = m.z - earner.z;
    if (dx * dx + dz * dz <= r2) out.push(m.id);
  }
  return out;
}
