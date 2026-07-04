import { describe, it, expect } from 'vitest';
import { meshVolume, type SolidFn, type ColorFn } from '../src/engine/greedyMesh.js';

const WHITE: ColorFn = () => 0xffffff;

describe('greedy voxel mesher', () => {
  it('meshes a single voxel as 6 quads (24 verts, 36 indices)', () => {
    const solid: SolidFn = (x, y, z) => x === 0 && y === 0 && z === 0;
    const m = meshVolume(1, 1, 1, solid, WHITE);
    expect(m.positions.length).toBe(24 * 3);
    expect(m.indices.length).toBe(6 * 6);
    expect(m.normals.length).toBe(24 * 3);
    expect(m.colors.length).toBe(24 * 3);
  });

  it('merges a flat 4×1×4 slab top into a single quad (6 quads total)', () => {
    const solid: SolidFn = (x, y, z) => y === 0 && x >= 0 && x < 4 && z >= 0 && z < 4;
    const m = meshVolume(4, 1, 4, solid, WHITE);
    // A fully-uniform slab collapses to 6 merged faces regardless of area.
    expect(m.indices.length).toBe(6 * 6);
  });

  it('produces no faces for an empty volume', () => {
    const m = meshVolume(4, 4, 4, () => false, WHITE);
    expect(m.positions.length).toBe(0);
    expect(m.indices.length).toBe(0);
  });

  it('culls internal faces between two adjacent voxels', () => {
    const solid: SolidFn = (x, y, z) => y === 0 && z === 0 && (x === 0 || x === 1);
    const m = meshVolume(2, 1, 1, solid, WHITE);
    // 2 voxels sharing one face → 10 exposed faces, all merged where possible.
    // Top(2×1), bottom(2×1), and the two ends(1×1 each) and two sides(2×1) → 6 quads.
    expect(m.indices.length).toBe(6 * 6);
  });

  it('bakes ambient occlusion darker in a concave corner', () => {
    // An L-shaped wall creates occluded corners on the inner faces.
    const solid: SolidFn = (x, y, z) => {
      if (y < 0 || y > 2) return false;
      return (x === 0 && z >= 0 && z <= 2) || (z === 0 && x >= 0 && x <= 2);
    };
    const m = meshVolume(3, 3, 3, solid, WHITE);
    let minChannel = 1;
    for (let i = 0; i < m.colors.length; i++) minChannel = Math.min(minChannel, m.colors[i]!);
    // Some vertices are occluded → colour multiplier below full white.
    expect(minChannel).toBeLessThan(0.9);
  });

  it('is deterministic across runs', () => {
    const solid: SolidFn = (x, y, z) => (x + y + z) % 2 === 0 && x < 3 && y < 3 && z < 3;
    const color: ColorFn = (x, _y, _z) => (x * 40) << 16;
    const a = meshVolume(3, 3, 3, solid, color);
    const b = meshVolume(3, 3, 3, solid, color);
    expect(Array.from(a.indices)).toEqual(Array.from(b.indices));
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
  });
});
