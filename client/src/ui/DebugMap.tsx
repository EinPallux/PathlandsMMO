import { useEffect, useRef, useState } from 'react';
import {
  World,
  WORLD_SEED,
  WORLD_SIZE_X,
  WORLD_SIZE_Z,
  SEA_LEVEL,
  SNOW_LINE,
  Biome,
  pal,
  shade,
} from '@pathlands/shared';
import { useStore } from '../game/store.js';
import { panel, colors } from './theme.js';

const SIZE = 300; // rendered map resolution (px)

const BIOME_COLOR: Record<Biome, number> = {
  [Biome.Vale]: pal.grassVale,
  [Biome.Weald]: pal.grassWeald,
  [Biome.Foothills]: pal.grassFoothills,
  [Biome.Peaks]: pal.stone,
  [Biome.Trollmoor]: pal.grassTrollmoor,
  [Biome.Coast]: pal.sand,
};

function renderMap(ctx: CanvasRenderingContext2D): void {
  const world = new World(WORLD_SEED);
  const img = ctx.createImageData(SIZE, SIZE);
  const data = img.data;
  for (let j = 0; j < SIZE; j++) {
    const wz = (j / SIZE) * WORLD_SIZE_Z;
    for (let i = 0; i < SIZE; i++) {
      const wx = (i / SIZE) * WORLD_SIZE_X;
      const h = world.heightAt(wx, wz);
      const biome = world.biomeAt(wx, wz);
      let rgb: number;
      if (h <= SEA_LEVEL) {
        const depth = Math.max(0.45, 1 - (SEA_LEVEL - h) / 40);
        rgb = shade(pal.water, depth);
      } else if (h > SNOW_LINE) {
        rgb = pal.snow;
      } else {
        const bright = 0.72 + Math.min(0.5, (h - SEA_LEVEL) / 150);
        rgb = shade(BIOME_COLOR[biome], bright);
      }
      const o = (j * SIZE + i) * 4;
      data[o] = (rgb >> 16) & 0xff;
      data[o + 1] = (rgb >> 8) & 0xff;
      data[o + 2] = rgb & 0xff;
      data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

const LABELS: Array<{ name: string; x: number; z: number }> = [
  { name: 'Glimmerpeaks', x: 0.18, z: 0.16 },
  { name: 'Trollmoor', x: 0.53, z: 0.15 },
  { name: 'Foothills', x: 0.16, z: 0.5 },
  { name: 'Heartmead Vale', x: 0.5, z: 0.5 },
  { name: 'Mossfang Weald', x: 0.84, z: 0.52 },
  { name: 'Sunlit Coast', x: 0.5, z: 0.86 },
];

export function DebugMap(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(false);
  const posX = useStore((s) => s.posX);
  const posZ = useStore((s) => s.posZ);
  const toggleMap = useStore((s) => s.toggleMap);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const id = window.setTimeout(() => {
      renderMap(ctx);
      setRendered(true);
    }, 30);
    return () => window.clearTimeout(id);
  }, []);

  const displaySize = 520;
  const px = (posX / WORLD_SIZE_X) * displaySize;
  const pz = (posZ / WORLD_SIZE_Z) * displaySize;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.55)',
        zIndex: 60,
        pointerEvents: 'auto',
      }}
      onClick={() => toggleMap()}
    >
      <div style={{ ...panel, padding: 16 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <b style={{ color: colors.gold }}>The Pathlands — World Atlas</b>
          <span style={{ color: colors.inkDim, fontSize: 11 }}>
            seed {WORLD_SEED} · press M to close
          </span>
        </div>
        <div style={{ position: 'relative', width: displaySize, height: displaySize }}>
          <canvas
            ref={canvasRef}
            width={SIZE}
            height={SIZE}
            style={{
              width: displaySize,
              height: displaySize,
              imageRendering: 'pixelated',
              borderRadius: 6,
              border: `1px solid ${colors.panelBorder}`,
              filter: rendered ? 'none' : 'blur(6px)',
            }}
          />
          {LABELS.map((l) => (
            <span
              key={l.name}
              style={{
                position: 'absolute',
                left: l.x * displaySize,
                top: l.z * displaySize,
                transform: 'translate(-50%, -50%)',
                color: '#fff',
                fontSize: 11,
                textShadow: '0 1px 3px #000, 0 0 3px #000',
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              {l.name}
            </span>
          ))}
          {/* Player marker */}
          <div
            style={{
              position: 'absolute',
              left: px,
              top: pz,
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: colors.accent,
              border: '2px solid #fff',
              transform: 'translate(-50%, -50%)',
              boxShadow: '0 0 6px #000',
              pointerEvents: 'none',
            }}
          />
        </div>
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: colors.inkDim,
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <span>North ▲ is up</span>
          <span>● you</span>
          <span>blue = sea/rivers</span>
          <span>white = snowline</span>
        </div>
      </div>
    </div>
  );
}
