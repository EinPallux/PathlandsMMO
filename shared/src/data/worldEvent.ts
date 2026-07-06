// World events (WORLD.md §4, GDD §10 endgame). Phase-4 ships one repeatable solo
// world-boss event — "Restore the Grand Waystone" — as a data stub that Phase 6 grows
// into the scaling multiplayer world boss. The event reuses the ordinary spawn → loot →
// kill pipeline: its boss (`bossId`) lives in a long-respawn spawn region at the site,
// and killing it feeds the `worldEvent` Deed metric + the restoration announcement.
// Pure data — no DOM, no wall-clock.

export interface WorldEventDef {
  id: string;
  name: string;
  /** The Boss-rank enemy that guards/gates the event (enemies.ts). */
  bossId: string;
  /** The Deed advanced on completing the event (deeds.ts). */
  deedId: string;
  /** Event site (world voxel coords) — matches the boss's spawn region. */
  cx: number;
  cz: number;
  /** Announcement barked when the event completes. */
  restoreText: string;
  /** Short flavor for the atlas / docs. */
  blurb: string;
}

/** The Grand Waystone, south of Waymeet on the road to the Sunken Crypt. */
export const GRAND_WAYSTONE_EVENT: WorldEventDef = {
  id: 'restoreGrandWaystone',
  name: 'Restore the Grand Waystone',
  bossId: 'bossGrandWarden',
  deedId: 'd_waystone_restorer',
  cx: 1712,
  cz: 2050,
  restoreText: 'The Grand Waystone is restored — a hundred sleeping stones answer across the vale!',
  blurb:
    'A dormant Grand Waystone stands warded on the crypt road; best its Warden to wake the network anew.',
};

export const WORLD_EVENTS: readonly WorldEventDef[] = [GRAND_WAYSTONE_EVENT];

/** The world event a given boss belongs to, if any. */
export function worldEventForBoss(bossId: string): WorldEventDef | undefined {
  return WORLD_EVENTS.find((e) => e.bossId === bossId);
}
