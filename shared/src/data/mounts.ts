// Mounts (GDD §7): the level-20 Wolf and its Deed-reward skins. Pure data +
// lookup helpers. A mount is +ground-speed, outdoor-only, and dismounts the
// instant its rider enters combat — those rules live in the client MountController
// (and move server-side in Phase 6); this module just describes the catalog.

export interface MountDef {
  id: string;
  name: string;
  description: string;
  /** Voxel model id built by shared/models (buildMountModel). */
  modelId: string;
  /** Fractional ground-speed bonus (0.6 = +60%). */
  speedBonus: number;
  /**
   * How the mount is obtained: the base Wolf is bought for gold at `reqLevel`;
   * skins are granted when a specific Deed completes (`deedId`).
   */
  source: { kind: 'purchase'; cost: number; reqLevel: number } | { kind: 'deed'; deedId: string };
}

/** Minimum level to ride any mount (GDD §7). */
export const MOUNT_MIN_LEVEL = 20;

export const MOUNTS: readonly MountDef[] = [
  {
    id: 'wolf',
    name: 'Grey Wolf',
    description: 'A loyal Heartmead wolf, saddle-broken for the long roads. +60% ground speed.',
    modelId: 'mount.wolf',
    speedBonus: 0.6,
    source: { kind: 'purchase', cost: 40, reqLevel: MOUNT_MIN_LEVEL },
  },
  {
    id: 'direWolf',
    name: 'Dire Wolf',
    description: 'A scarred pack-alpha that only answers to a proven slayer. +60% ground speed.',
    modelId: 'mount.direWolf',
    speedBonus: 0.6,
    source: { kind: 'deed', deedId: 'd_slayer' },
  },
  {
    id: 'frostWolf',
    name: 'Frostfang Wolf',
    description: 'A pale wanderer from the high passes, earned by walking the world. +60% speed.',
    modelId: 'mount.frostWolf',
    speedBonus: 0.6,
    source: { kind: 'deed', deedId: 'd_pathfinder' },
  },
];

const MOUNT_BY_ID = new Map<string, MountDef>(MOUNTS.map((m) => [m.id, m]));

export function mountById(id: string): MountDef | undefined {
  return MOUNT_BY_ID.get(id);
}

/** The base, gold-purchasable mount (the one a stable sells). */
export const BASE_MOUNT = MOUNTS[0]!;

/** The skin a Deed unlocks, if any (used to grant skins on Deed completion). */
export function mountForDeed(deedId: string): MountDef | undefined {
  return MOUNTS.find((m) => m.source.kind === 'deed' && m.source.deedId === deedId);
}
