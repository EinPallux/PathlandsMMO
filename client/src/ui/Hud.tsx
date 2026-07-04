import { useStore } from '../game/store.js';
import { panel, colors } from './theme.js';

function clock(timeOfDay: number): string {
  const totalMin = Math.floor(timeOfDay * 24 * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export function Hud(): JSX.Element {
  const posX = useStore((s) => s.posX);
  const posY = useStore((s) => s.posY);
  const posZ = useStore((s) => s.posZ);
  const biome = useStore((s) => s.biome);
  const moveState = useStore((s) => s.moveState);
  const timeOfDay = useStore((s) => s.timeOfDay);
  const freeFly = useStore((s) => s.freeFly);

  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          ...panel,
        }}
      >
        <span style={{ color: colors.gold, fontWeight: 600 }}>{biome}</span>
        <span style={{ color: colors.inkDim }}> · {clock(timeOfDay)}</span>
        {freeFly && <span style={{ color: colors.accent }}> · FREE-FLY</span>}
      </div>

      <div style={{ position: 'absolute', bottom: 12, left: 12, ...panel }}>
        <div>
          X <b>{posX.toFixed(1)}</b> &nbsp; Y <b>{posY.toFixed(1)}</b> &nbsp; Z{' '}
          <b>{posZ.toFixed(1)}</b>
        </div>
        <div style={{ color: colors.inkDim }}>state: {moveState}</div>
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: 12,
          right: 12,
          ...panel,
          fontSize: 12,
          color: colors.inkDim,
        }}
      >
        WASD move · Shift run · Space jump · Mouse look · Wheel zoom · M map · ` dev
      </div>
    </>
  );
}
