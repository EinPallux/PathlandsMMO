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
  /**
   * Ground-speed multiplier from mounts / out-of-combat perks (1 = normal). The
   * sim clamps it, so a bad client value can never grant absurd speed — in Phase 6
   * the server recomputes it from the authoritative mount/combat state.
   */
  speedMult?: number;
}

/** Acquire (or clear) the current target. */
export interface SetTargetIntent {
  type: 'SetTarget';
  /** Entity id to target, or null to clear. */
  targetId: string | null;
}

/** Cast a skill at the current (or given) target. */
export interface CastSkillIntent {
  type: 'CastSkill';
  skillId: string;
  /** Override target; omitted ⇒ use the caster's current target. */
  targetId?: string | null;
  /** For ground-targeted skills, the world point. */
  groundX?: number;
  groundZ?: number;
}

/** Toggle the auto-attack on/off (melee swing / ranged shot on weapon timer). */
export interface ToggleAutoAttackIntent {
  type: 'ToggleAutoAttack';
  on: boolean;
}

/** Interact with a nearby world entity (NPC, Waystone, node, loot). */
export interface InteractIntent {
  type: 'Interact';
  targetId: string;
}

/** Release spirit after death → respawn at the last Waystone. */
export interface ReleaseSpiritIntent {
  type: 'ReleaseSpirit';
}

export type Intent =
  | MoveIntent
  | SetTargetIntent
  | CastSkillIntent
  | ToggleAutoAttackIntent
  | InteractIntent
  | ReleaseSpiritIntent;

export function makeMoveIntent(
  wishX: number,
  wishZ: number,
  jump: boolean,
  sprint: boolean,
  yaw: number,
  speedMult = 1,
): MoveIntent {
  return { type: 'Move', wishX, wishZ, jump, sprint, yaw, speedMult };
}
