import { describe, it, expect } from 'vitest';
import { World, voxelIndex } from '../src/worldgen/world.js';
import { SETTLEMENTS, HOLLOWS } from '../src/worldgen/settlements.js';
import { WORLD_SEED, CHUNK_SIZE, Voxel, isSolidVoxel } from '../src/core/constants.js';

const BUILDING_MATERIALS = new Set([
  Voxel.WoodOak,
  Voxel.WoodDark,
  Voxel.Plaster,
  Voxel.RoofTile,
  Voxel.Cobble,
  Voxel.GlassWindow,
  Voxel.WaystoneGlow,
]);

describe('authored layer', () => {
  const w = new World(WORLD_SEED);

  it('flattens settlement ground to a platform', () => {
    const s = SETTLEMENTS.find((x) => x.id === 'brookhollow')!;
    const hCenter = w.heightAt(s.cx, s.cz);
    // Sample a ring inside the settlement — heights should be near-identical.
    let maxDelta = 0;
    for (let a = 0; a < 8; a++) {
      const x = s.cx + Math.round(Math.cos(a) * 10);
      const z = s.cz + Math.round(Math.sin(a) * 10);
      maxDelta = Math.max(maxDelta, Math.abs(w.heightAt(x, z) - hCenter));
    }
    expect(maxDelta).toBeLessThanOrEqual(2);
  });

  it('flattens the whole building grid so no outer-ring building floats or buries', () => {
    // Buildings sit on a square Chebyshev grid (PLOT spacing) out to `rings`; the
    // flat plateau must reach every plot or a building stamped at platformY hovers
    // over unflattened terrain (or sinks into a slope). Regression for the
    // grubbersRest/fernwick/mossgate floating-house bug.
    const PLOT = 18;
    for (const s of SETTLEMENTS) {
      const plat = w.heightAt(s.cx, s.cz);
      let worst = 0;
      let worstAt = '';
      for (let ring = 1; ring <= s.rings; ring++) {
        for (let gz = -ring; gz <= ring; gz++) {
          for (let gx = -ring; gx <= ring; gx++) {
            if (Math.max(Math.abs(gx), Math.abs(gz)) !== ring) continue;
            const g = w.heightAt(s.cx + gx * PLOT, s.cz + gz * PLOT);
            if (Math.abs(g - plat) > worst) {
              worst = Math.abs(g - plat);
              worstAt = `${s.id} plot(${gx},${gz}) ground=${g} platform=${plat}`;
            }
          }
        }
      }
      // ≤2m: every plot sits on the flat plateau. The only non-zero deltas are
      // plots directly on a road entrance, where the road ramp intentionally meets
      // the platform (same tolerance as the plaza-flatten test). Pre-fix these were
      // 5–36m floats/burials.
      expect(worst, worstAt).toBeLessThanOrEqual(2);
    }
  });

  it('stamps building materials into a settlement chunk', () => {
    const s = SETTLEMENTS.find((x) => x.id === 'waymeet')!;
    const cx = Math.floor(s.cx / CHUNK_SIZE);
    const cz = Math.floor(s.cz / CHUNK_SIZE);
    let found = 0;
    // Scan a 3×3 chunk area around the settlement centre.
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const chunk = w.generateChunk(cx + dx, cz + dz);
        for (let i = 0; i < chunk.voxels.length; i++) {
          if (BUILDING_MATERIALS.has(chunk.voxels[i]! as Voxel)) found++;
        }
      }
    }
    expect(found).toBeGreaterThan(200);
  });

  it('places a Waystone (emissive glow) at every settlement', () => {
    for (const s of SETTLEMENTS) {
      // Waystone stamped at (cx-7, cz-7); scan a small volume for its glow.
      let glow = false;
      for (let y = w.heightAt(s.cx - 7, s.cz - 7); y < w.heightAt(s.cx - 7, s.cz - 7) + 12; y++) {
        if (w.voxelAt(s.cx - 7, y, s.cz - 7) === Voxel.WaystoneGlow) glow = true;
      }
      expect(glow, `waystone at ${s.id}`).toBe(true);
    }
  });

  it('paves roads and plazas with Path', () => {
    // Brookhollow → Waymeet road midpoint should be paved.
    const midX = Math.round((1536 + 1712) / 2);
    const midZ = Math.round((1536 + 1852) / 2);
    let paved = false;
    for (let dx = -4; dx <= 4; dx++) {
      const h = w.heightAt(midX + dx, midZ);
      if (w.voxelAt(midX + dx, h, midZ) === Voxel.Path) paved = true;
    }
    expect(paved).toBe(true);
  });

  it('voxelAt reflects stamped structures (collision matches meshing)', () => {
    const s = SETTLEMENTS.find((x) => x.id === 'waymeet')!;
    const cx = Math.floor(s.cx / CHUNK_SIZE);
    const cz = Math.floor(s.cz / CHUNK_SIZE);
    const chunk = w.generateChunk(cx, cz);
    // Check a column that likely holds a building wall.
    let mismatches = 0;
    for (let lx = 0; lx < CHUNK_SIZE; lx += 4) {
      for (let lz = 0; lz < CHUNK_SIZE; lz += 4) {
        const wx = cx * CHUNK_SIZE + lx;
        const wz = cz * CHUNK_SIZE + lz;
        for (let y = w.heightAt(wx, wz); y < w.heightAt(wx, wz) + 6; y++) {
          if (w.voxelAt(wx, y, wz) !== (chunk.voxels[voxelIndex(lx, y, lz)]! as Voxel))
            mismatches++;
        }
      }
    }
    expect(mismatches).toBe(0);
  });

  it('spawns deterministic NPCs at every settlement', () => {
    const a = w.authored.npcSpawns();
    const b = new World(WORLD_SEED).authored.npcSpawns();
    expect(a.map((n) => `${n.id}:${n.name}:${n.x},${n.z}`)).toEqual(
      b.map((n) => `${n.id}:${n.name}:${n.x},${n.z}`),
    );
    for (const s of SETTLEMENTS) {
      expect(a.filter((n) => n.id.startsWith(s.id)).length).toBeGreaterThan(0);
    }
    // Towns with an inn get a vendor.
    expect(a.some((n) => n.kind === 'vendor')).toBe(true);
    expect(a.some((n) => n.kind === 'guard')).toBe(true);
  });

  it('carves a walkable Hollow entrance with a portal at every Hollow', () => {
    for (const hollow of HOLLOWS) {
      const surface = w.heightAt(hollow.x, hollow.z);
      // The bowl ring (offset from the central portal) is carved (air/water)...
      let carved = false;
      for (let y = surface - 3; y <= surface; y++) {
        if (!isSolidVoxel(w.voxelAt(hollow.x + 5, y, hollow.z))) carved = true;
      }
      expect(carved, `${hollow.id} carved`).toBe(true);
      // ...and the sealed stone portal stands at the centre.
      let portal = false;
      for (let y = surface - 7; y <= surface; y++) {
        const v = w.voxelAt(hollow.x, y, hollow.z);
        if (v === Voxel.CobbleDark || v === Voxel.Cobble || v === Voxel.WaystoneGlow) portal = true;
      }
      expect(portal, `${hollow.id} portal`).toBe(true);
    }
  });

  it('spawns wildlife deterministically', () => {
    const a = w.wildlifeChunk(70, 48);
    const b = new World(WORLD_SEED).wildlifeChunk(70, 48);
    expect(a).toEqual(b);
  });

  it('scatters props deterministically and avoids settlements', () => {
    const cx = 60;
    const cz = 55; // wilderness weald-ish
    const a = w.scatterChunk(cx, cz);
    const b = new World(WORLD_SEED).scatterChunk(cx, cz);
    expect(a.length).toEqual(b.length);
    expect(a.map((p) => `${p.prop}:${p.x.toFixed(2)}:${p.z.toFixed(2)}`)).toEqual(
      b.map((p) => `${p.prop}:${p.x.toFixed(2)}:${p.z.toFixed(2)}`),
    );

    // No props inside Brookhollow's footprint.
    const s = SETTLEMENTS.find((x) => x.id === 'brookhollow')!;
    const scx = Math.floor(s.cx / CHUNK_SIZE);
    const scz = Math.floor(s.cz / CHUNK_SIZE);
    const inTown = w
      .scatterChunk(scx, scz)
      .filter((p) => Math.hypot(p.x - s.cx, p.z - s.cz) < s.radius);
    expect(inTown.length).toBe(0);
  });
});
