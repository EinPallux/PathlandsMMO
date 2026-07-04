// Intents are the ONLY way the player affects the simulation. The client turns raw
// input into intents; the sim validates and applies them. In Phase 6 these serialize
// to the server unchanged, and validation becomes the server's authority. (ARCH §3.)

/** Camera-resolved horizontal move wish plus jump/sprint and facing. */
export interface MoveIntent {
  type: 'Move';
  /** Desired horizontal direction in WORLD space, magnitude 0..1. */
  wishX: number;
  wishZ: number;
  jump: boolean;
  sprint: boolean;
  /** Facing yaw in radians (from the camera). */
  yaw: number;
}

/** Placeholder for the intents that arrive in later phases (cast, loot, interact…). */
export type Intent = MoveIntent;

export function makeMoveIntent(
  wishX: number,
  wishZ: number,
  jump: boolean,
  sprint: boolean,
  yaw: number,
): MoveIntent {
  return { type: 'Move', wishX, wishZ, jump, sprint, yaw };
}
