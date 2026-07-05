import { useEffect, useRef } from 'react';
import { WORLD_SIZE_X, WORLD_SIZE_Z } from '@pathlands/shared';
import { useStore } from '../game/store.js';
import { getContinentMap, mapPois, MAP_RES } from '../engine/continentMap.js';
import { colors } from './theme.js';

const SIZE = 156; // px
const WINDOW_M = 680; // metres shown across the minimap

export function Minimap(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const src = getContinentMap();
    const pois = mapPois();

    const draw = (): void => {
      const live = useStore.getState().live;
      const pxMap = (live.x / WORLD_SIZE_X) * MAP_RES;
      const pzMap = (live.z / WORLD_SIZE_Z) * MAP_RES;
      const srcW = (WINDOW_M / WORLD_SIZE_X) * MAP_RES;

      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(src, pxMap - srcW / 2, pzMap - srcW / 2, srcW, srcW, 0, 0, SIZE, SIZE);

      // POI markers within the window.
      const scale = SIZE / srcW;
      for (const p of pois) {
        const gx = p.nx * MAP_RES;
        const gz = p.nz * MAP_RES;
        const sx = (gx - (pxMap - srcW / 2)) * scale;
        const sy = (gz - (pzMap - srcW / 2)) * scale;
        if (sx < 0 || sy < 0 || sx > SIZE || sy > SIZE) continue;
        ctx.fillStyle = p.kind === 'town' ? '#e2c463' : p.kind === 'hollow' ? '#c66' : '#8fe6f0';
        ctx.beginPath();
        ctx.arc(sx, sy, p.kind === 'town' ? 3 : 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 0.75;
        ctx.stroke();
      }

      // Player arrow at centre, pointing along facing (x right, z down).
      const dirX = Math.sin(live.yaw);
      const dirZ = Math.cos(live.yaw);
      const cx = SIZE / 2;
      const cy = SIZE / 2;
      const len = 7;
      const perpX = -dirZ;
      const perpZ = dirX;
      ctx.fillStyle = colors.accent;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx + dirX * len, cy + dirZ * len);
      ctx.lineTo(cx - dirX * 4 + perpX * 4, cy - dirZ * 4 + perpZ * 4);
      ctx.lineTo(cx - dirX * 4 - perpX * 4, cy - dirZ * 4 - perpZ * 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: 12,
        width: SIZE,
        height: SIZE,
        borderRadius: 10,
        overflow: 'hidden',
        border: `2px solid ${colors.panelBorder}`,
        boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
        pointerEvents: 'auto',
      }}
    >
      <canvas ref={canvasRef} width={SIZE} height={SIZE} style={{ display: 'block' }} />
      <div
        style={{
          position: 'absolute',
          top: 2,
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: 11,
          fontWeight: 700,
          color: '#fff',
          textShadow: '0 1px 2px #000',
          pointerEvents: 'none',
        }}
      >
        N
      </div>
    </div>
  );
}
