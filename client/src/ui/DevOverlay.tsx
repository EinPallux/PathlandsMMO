import type { ReactNode } from 'react';
import { useStore } from '../game/store.js';
import { CharacterClass, CLASS_INFO } from '@pathlands/shared';
import { panel, button, buttonActive, colors } from './theme.js';

const ZONES: Array<{ name: string; x: number; z: number }> = [
  { name: 'Heartmead Vale', x: 1536, z: 1536 },
  { name: 'Mossfang Weald', x: 2580, z: 1560 },
  { name: 'Stonejaw Foothills', x: 500, z: 1536 },
  { name: 'Glimmerpeaks', x: 560, z: 490 },
  { name: 'Trollmoor Highlands', x: 1600, z: 460 },
  { name: 'Sunlit Coast', x: 1536, z: 2680 },
];

const CLASSES = [
  CharacterClass.Warrior,
  CharacterClass.Ranger,
  CharacterClass.Priest,
  CharacterClass.Mage,
];

function Row({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
      <span style={{ color: colors.inkDim, width: 78, fontSize: 11 }}>{label}</span>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>{children}</div>
    </div>
  );
}

export function DevOverlay(): JSX.Element {
  const s = useStore();
  const cmd = s.commands;

  return (
    <div style={{ position: 'absolute', top: 12, right: 12, width: 300, ...panel }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <b style={{ color: colors.gold }}>Dev Tools</b>
        <span style={{ fontSize: 11, color: colors.inkDim }}>press ` to hide</span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 4,
          marginTop: 8,
          fontSize: 12,
        }}
      >
        <div>
          FPS <b style={{ color: s.fps >= 55 ? colors.accent : '#e0a878' }}>{s.fps}</b>
        </div>
        <div>
          Draw calls <b>{s.drawCalls}</b>
        </div>
        <div>
          Tris <b>{(s.triangles / 1000).toFixed(0)}k</b>
        </div>
        <div>
          Chunks <b>{s.chunksLoaded}</b>{' '}
          <span style={{ color: colors.inkDim }}>(+{s.chunksPending})</span>
        </div>
      </div>

      <Row label="Class">
        {CLASSES.map((c) => (
          <button
            key={c}
            style={s.selectedClass === c ? buttonActive : button}
            onClick={() => cmd?.setClass(c)}
          >
            {CLASS_INFO[c].name}
          </button>
        ))}
      </Row>

      <Row label="Teleport">
        {ZONES.map((z) => (
          <button key={z.name} style={button} onClick={() => cmd?.teleport(z.x, z.z)}>
            {z.name.split(' ')[0]}
          </button>
        ))}
      </Row>

      <Row label="View dist">
        <input
          type="range"
          min={3}
          max={12}
          value={s.viewDistance}
          onChange={(e) => cmd?.setViewDistance(Number(e.target.value))}
          style={{ flex: 1 }}
        />
        <span style={{ width: 20 }}>{s.viewDistance}</span>
      </Row>

      <Row label="Day speed">
        {[
          { label: 'Slow', v: 1 / 480 },
          { label: 'Fast', v: 1 / 60 },
          { label: 'Rapid', v: 1 / 12 },
          { label: 'Pause', v: 0 },
        ].map((o) => (
          <button key={o.label} style={button} onClick={() => cmd?.setDayNightSpeed(o.v)}>
            {o.label}
          </button>
        ))}
      </Row>

      <Row label="Camera">
        <button style={s.freeFly ? buttonActive : button} onClick={() => cmd?.toggleFreeFly()}>
          Free-fly (F)
        </button>
        <button style={button} onClick={() => cmd?.respawn()}>
          Respawn
        </button>
        <button style={s.showMap ? buttonActive : button} onClick={() => s.toggleMap()}>
          Map (M)
        </button>
      </Row>
    </div>
  );
}
