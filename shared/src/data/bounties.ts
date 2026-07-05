// Daily bounties (GDD §11 Endgame): notice-board tasks posted at the hub towns —
// slay a family of foes or gather materials for gold, XP, and Deed progress. The
// pool is pure data; each day a deterministic slice is posted per hub, seeded by the
// world seed + a day index supplied at the integration edge (no wall-clock in sim).

import { makeRng } from '../core/rng.js';
import { EnemyFamily } from './enemies.js';

export type BountyKind = 'kill' | 'gather';

export interface BountyDef {
  id: string;
  /** Settlement id whose board posts this bounty. */
  hub: string;
  title: string;
  kind: BountyKind;
  /** kill: an EnemyFamily value or an enemy id; gather: a material id. */
  target: string;
  /** kill only: `target` is a family (any enemy of it counts) rather than one id. */
  targetIsFamily?: boolean;
  count: number;
  gold: number;
  xp: number;
}

/** Hub towns that post a daily board (GDD: 4 hubs). */
export const BOUNTY_HUBS: readonly string[] = ['brookhollow', 'waymeet', 'fernwick', 'mossgate'];

const k = (
  kind: BountyKind,
  target: string,
  opts: Partial<BountyDef> = {},
): Partial<BountyDef> => ({
  kind,
  target,
  ...opts,
});

function b(
  id: string,
  hub: string,
  title: string,
  count: number,
  gold: number,
  xp: number,
  rest: Partial<BountyDef>,
): BountyDef {
  return { id, hub, title, count, gold, xp, kind: rest.kind!, target: rest.target!, ...rest };
}

export const BOUNTY_POOL: readonly BountyDef[] = [
  // --- Brookhollow / Heartmead Vale (beasts, meadow, copper) ---
  b('bh_boars', 'brookhollow', 'Cull the Boars', 8, 60, 120, k('kill', 'thornbackBoar')),
  b(
    'bh_beasts',
    'brookhollow',
    'Thin the Wild',
    10,
    70,
    140,
    k('kill', EnemyFamily.Beast, { targetIsFamily: true }),
  ),
  b(
    'bh_bloom',
    'brookhollow',
    'Meadowbloom for the Healers',
    6,
    55,
    90,
    k('gather', 'meadowbloom'),
  ),
  b('bh_copper', 'brookhollow', 'Copper for the Smith', 6, 55, 90, k('gather', 'copperOre')),
  // --- Waymeet / capital & coast (undead, silver, fish) ---
  b('wm_drowned', 'waymeet', 'Still the Drowned', 8, 110, 220, k('kill', 'drownedDead')),
  b(
    'wm_undead',
    'waymeet',
    'Rest the Restless',
    10,
    120,
    240,
    k('kill', EnemyFamily.Undead, { targetIsFamily: true }),
  ),
  b('wm_silver', 'waymeet', 'Silver for the Vaults', 6, 100, 180, k('gather', 'silverOre')),
  b('wm_marlin', 'waymeet', 'A Coast Feast', 5, 95, 160, k('gather', 'coastMarlin')),
  // --- Fernwick / Mossfang Weald (plants, fenweed, iron) ---
  b('fw_spriggans', 'fernwick', 'Prune the Spriggans', 8, 85, 170, k('kill', 'venomcapSpriggan')),
  b(
    'fw_plants',
    'fernwick',
    'Blight-Wardens',
    10,
    90,
    180,
    k('kill', EnemyFamily.Plant, { targetIsFamily: true }),
  ),
  b('fw_fenweed', 'fernwick', 'Fenweed Harvest', 6, 80, 140, k('gather', 'fenweed')),
  b('fw_iron', 'fernwick', 'Iron for the Weald', 6, 80, 140, k('gather', 'ironOre')),
  // --- Mossgate / Stonejaw Foothills (humanoids, aberrations, stone) ---
  b('mg_gnolls', 'mossgate', 'Rout the Gnolls', 8, 95, 190, k('kill', 'caveGnoll')),
  b(
    'mg_humanoids',
    'mossgate',
    'Bandit Bounty',
    10,
    100,
    200,
    k('kill', EnemyFamily.Humanoid, { targetIsFamily: true }),
  ),
  b('mg_grubs', 'mossgate', 'Grub Extermination', 8, 90, 180, k('kill', 'stonejawGrub')),
  b('mg_cavemoss', 'mossgate', 'Cavemoss for the Alchemists', 6, 85, 150, k('gather', 'cavemoss')),
];

const BOUNTY_BY_ID = new Map<string, BountyDef>(BOUNTY_POOL.map((x) => [x.id, x]));
export function bountyById(id: string): BountyDef | undefined {
  return BOUNTY_BY_ID.get(id);
}

/** Bounties in a hub's pool (all candidates before the daily slice). */
export function hubPool(hub: string): BountyDef[] {
  return BOUNTY_POOL.filter((x) => x.hub === hub);
}

/**
 * The ids posted at `hub` on a given day — a deterministic slice of the hub's pool,
 * seeded by the world seed + hub + day index (which the client derives from the
 * local date at bootstrap, the one allowed wall-clock touch). Same seed+day+hub ⇒
 * same board on every machine.
 */
export function dailyBountyIds(seed: number, dayIndex: number, hub: string, n = 3): string[] {
  const pool = hubPool(hub);
  if (pool.length <= n) return pool.map((x) => x.id);
  const rng = makeRng(seed, 'bounty', hub, String(dayIndex));
  const idx = pool.map((_, i) => i);
  // Partial Fisher–Yates: pick n distinct indices deterministically.
  for (let i = 0; i < n; i++) {
    const j = rng.int(i, idx.length - 1);
    [idx[i], idx[j]] = [idx[j]!, idx[i]!];
  }
  return idx.slice(0, n).map((i) => pool[i]!.id);
}
