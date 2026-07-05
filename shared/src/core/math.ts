// Small, dependency-free math helpers used across the simulation core.
// Vectors are plain objects so they serialize cleanly into saves and (Phase 6)
// network snapshots.

export interface Vec2 {
  x: number;
  z: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

export const clamp01 = (v: number): number => clamp(v, 0, 1);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const invLerp = (a: number, b: number, v: number): number =>
  a === b ? 0 : (v - a) / (b - a);

export const remap = (
  v: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number => lerp(outMin, outMax, clamp01(invLerp(inMin, inMax, v)));

/** Hermite smoothstep (3t² − 2t³) on the [edge0, edge1] range. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01(invLerp(edge0, edge1, x));
  return t * t * (3 - 2 * t);
}

/** Ken Perlin's smootherstep (6t⁵ − 15t⁴ + 10t³). */
export function smootherstep(t: number): number {
  const c = clamp01(t);
  return c * c * c * (c * (c * 6 - 15) + 10);
}

/** Always-positive modulo (unlike JS % which keeps the sign of the dividend). */
export function pmod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

export const sign = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0);

export const toRadians = (deg: number): number => (deg * Math.PI) / 180;
export const toDegrees = (rad: number): number => (rad * 180) / Math.PI;

/** Shortest signed angular delta from a to b, in radians. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Interpolate an angle the short way around. */
export function lerpAngle(a: number, b: number, t: number): number {
  return a + angleDelta(a, b) * clamp01(t);
}

// --- Vec3 helpers (pure; never mutate inputs) ---
export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const addVec3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const subVec3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scaleVec3 = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const dotVec3 = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

export const lengthVec3 = (a: Vec3): number => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);

export function normalizeVec3(a: Vec3): Vec3 {
  const len = lengthVec3(a);
  return len < 1e-9 ? { x: 0, y: 0, z: 0 } : { x: a.x / len, y: a.y / len, z: a.z / len };
}

export function distanceVec3(a: Vec3, b: Vec3): number {
  return lengthVec3(subVec3(a, b));
}

/** Squared horizontal (XZ) distance — cheap for range checks. */
export function distSqXZ(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}
