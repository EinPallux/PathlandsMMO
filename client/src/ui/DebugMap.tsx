import { useEffect, useRef } from 'react';
import { WORLD_SEED, WORLD_SIZE_X, WORLD_SIZE_Z } from '@pathlands/shared';
import { useStore } from '../game/store.js';
import { getContinentMap, mapPois, mapRoads, MAP_RES } from '../engine/continentMap.js';
import { panel, colors } from './theme.js';

const DISPLAY = 540;

export function DebugMap(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const posX = useStore((s) => s.posX);
  const posZ = useStore((s) => s.posZ);
  const discovery = useStore((s) => s.discovery);
  const discoveryN = useStore((s) => s.discoveryN);
  const toggleMap = useStore((s) => s.toggleMap);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const src = getContinentMap();

    // Base continent.
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, MAP_RES, MAP_RES, 0, 0, DISPLAY, DISPLAY);

    // Roads.
    ctx.strokeStyle = 'rgba(120,96,64,0.9)';
    ctx.lineWidth = 2;
    for (const road of mapRoads()) {
      ctx.beginPath();
      road.forEach((n, i) => {
        const x = n.nx * DISPLAY;
        const y = n.nz * DISPLAY;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    // POI markers.
    for (const p of mapPois()) {
      const x = p.nx * DISPLAY;
      const y = p.nz * DISPLAY;
      if (p.kind === 'town') {
        ctx.fillStyle = '#e2c463';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = '11px system-ui';
        ctx.fillText(p.name, x + 7, y + 3);
      } else {
        ctx.fillStyle = '#8fe6f0';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y - 4);
        ctx.lineTo(x + 4, y);
        ctx.lineTo(x, y + 4);
        ctx.lineTo(x - 4, y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }

    // Fog of discovery: darken un-visited cells.
    if (discovery && discoveryN > 0) {
      const cell = DISPLAY / discoveryN;
      ctx.fillStyle = 'rgba(8,10,14,0.72)';
      for (let z = 0; z < discoveryN; z++) {
        for (let x = 0; x < discoveryN; x++) {
          if (!discovery[z * discoveryN + x]) {
            ctx.fillRect(x * cell, z * cell, cell + 1, cell + 1);
          }
        }
      }
    }

    // Player marker.
    const px = (posX / WORLD_SIZE_X) * DISPLAY;
    const py = (posZ / WORLD_SIZE_Z) * DISPLAY;
    ctx.fillStyle = colors.accent;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }, [posX, posZ, discovery, discoveryN]);

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
        <canvas
          ref={canvasRef}
          width={DISPLAY}
          height={DISPLAY}
          style={{
            width: DISPLAY,
            height: DISPLAY,
            borderRadius: 6,
            border: `1px solid ${colors.panelBorder}`,
            display: 'block',
          }}
        />
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: colors.inkDim,
            display: 'flex',
            gap: 14,
            flexWrap: 'wrap',
          }}
        >
          <span>North ▲ up</span>
          <span style={{ color: '#e2c463' }}>● towns</span>
          <span style={{ color: '#8fe6f0' }}>◆ Waystones</span>
          <span style={{ color: colors.accent }}>● you</span>
          <span>dark = undiscovered</span>
        </div>
      </div>
    </div>
  );
}
