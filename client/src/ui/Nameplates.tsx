import { useStore } from '../game/store.js';
import { colors } from './theme.js';

export function Nameplates(): JSX.Element {
  const nameplates = useStore((s) => s.nameplates);
  return (
    <>
      {nameplates.map((p) => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            left: p.sx,
            top: p.sy,
            transform: 'translate(-50%, -100%)',
            padding: '1px 6px',
            fontSize: 12,
            color: colors.ink,
            background: 'rgba(20,15,10,0.55)',
            border: `1px solid ${colors.panelBorder}`,
            borderRadius: 4,
            whiteSpace: 'nowrap',
            textShadow: '0 1px 2px #000',
            pointerEvents: 'none',
          }}
        >
          {p.name}
        </div>
      ))}
    </>
  );
}
