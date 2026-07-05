import { useStore } from '../game/store.js';
import { colors } from './theme.js';

export function Nameplates(): JSX.Element {
  const nameplates = useStore((s) => s.nameplates);
  return (
    <>
      {nameplates.map((p) => {
        const hostile = p.hostile === true;
        const nameColor = hostile ? '#e0736b' : colors.ink;
        return (
          <div
            key={p.id}
            style={{
              position: 'absolute',
              left: p.sx,
              top: p.sy,
              transform: 'translate(-50%, -100%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                padding: '1px 6px',
                fontSize: 12,
                color: nameColor,
                background: 'rgba(20,15,10,0.55)',
                border: `1px solid ${p.targeted ? colors.gold : colors.panelBorder}`,
                borderRadius: 4,
                whiteSpace: 'nowrap',
                textShadow: '0 1px 2px #000',
              }}
            >
              {p.name}
              {p.level !== undefined && (
                <span style={{ color: colors.inkDim, marginLeft: 4 }}>Lv {p.level}</span>
              )}
            </div>
            {p.hpFrac !== undefined && (
              <div
                style={{
                  width: 54,
                  height: 5,
                  background: '#000',
                  borderRadius: 3,
                  overflow: 'hidden',
                  border: '1px solid rgba(0,0,0,0.7)',
                }}
              >
                <div
                  style={{
                    width: `${Math.max(0, Math.min(1, p.hpFrac)) * 100}%`,
                    height: '100%',
                    background: '#c0392b',
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
