// Waystones (GDD §7): a proximity prompt to attune/use the nearby stone, and a
// fast-travel modal listing activated Waystones with their fee from here. Reads the
// waystone slice the CombatDirector publishes; actions go through GameCommands.

import { useStore } from '../game/store.js';
import { colors, panel } from './theme.js';

export function WaystonePanel(): JSX.Element | null {
  const ws = useStore((s) => s.waystone);
  const showTravel = useStore((s) => s.showTravel);
  const gold = useStore((s) => s.inventory?.gold ?? 0);
  const cmd = useStore((s) => s.commands);
  const close = useStore((s) => s.closeTravel);

  return (
    <>
      {/* Proximity prompt (hidden while the travel list is open). */}
      {ws?.atWaystone && !showTravel && (
        <div
          style={{
            position: 'absolute',
            bottom: 96,
            left: '50%',
            transform: 'translateX(-50%)',
            ...panel,
            textAlign: 'center',
          }}
        >
          <div style={{ color: colors.gold, fontWeight: 700 }}>{ws.nearbyName}</div>
          <div style={{ fontSize: 12, color: colors.inkDim }}>
            Press <b style={{ color: colors.ink }}>E</b> to {ws.nearbyNew ? 'attune' : 'travel'}
          </div>
        </div>
      )}

      {showTravel && ws && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 320,
            ...panel,
            pointerEvents: 'auto',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <b style={{ color: colors.gold }}>Waystone Travel</b>
            <span style={{ color: colors.inkDim, fontSize: 12 }}>{gold}c</span>
          </div>
          <div style={{ fontSize: 12, color: colors.inkDim, margin: '4px 0 8px' }}>
            At {ws.nearbyName}. Choose a destination.
          </div>
          {ws.discovered.length <= 1 && (
            <div style={{ color: colors.inkDim, fontSize: 13 }}>
              Attune more Waystones to unlock travel routes.
            </div>
          )}
          {ws.discovered
            .filter((d) => d.name !== ws.nearbyName)
            .map((d) => {
              const afford = gold >= d.fee;
              return (
                <button
                  key={d.id}
                  disabled={!afford}
                  onClick={() => cmd?.travelTo(d.id)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    width: '100%',
                    marginTop: 5,
                    background: '#3a2c1e',
                    border: `1px solid ${colors.panelBorder}`,
                    borderRadius: 6,
                    color: afford ? colors.ink : colors.inkDim,
                    padding: '7px 10px',
                    cursor: afford ? 'pointer' : 'not-allowed',
                    fontSize: 13,
                  }}
                >
                  <span>{d.name}</span>
                  <span style={{ color: afford ? colors.gold : '#8a6a48' }}>{d.fee}c</span>
                </button>
              );
            })}
          <button
            onClick={close}
            style={{
              marginTop: 10,
              width: '100%',
              background: 'transparent',
              border: `1px solid ${colors.panelBorder}`,
              borderRadius: 6,
              color: colors.inkDim,
              padding: '6px',
              cursor: 'pointer',
            }}
          >
            Close (Esc)
          </button>
        </div>
      )}
    </>
  );
}
