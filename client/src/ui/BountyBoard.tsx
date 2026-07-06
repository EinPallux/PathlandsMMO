// The daily Bounty Board (O): the nearest hub town's posted tasks — slay a family
// of foes or gather materials for gold + XP + Deed progress. Reads the bounty slice
// the BountyDirector publishes; accept/turn-in go through GameCommands. The board
// resets each day. Physical notice-board gating is a later pass (like the bank).

import { useStore } from '../game/store.js';
import { colors, panel } from './theme.js';

const STATE_LABEL: Record<string, string> = {
  available: 'Accept',
  active: 'In progress',
  ready: 'Turn in',
  done: 'Done',
};

export function BountyBoard(): JSX.Element | null {
  const show = useStore((s) => s.showBounties);
  const bounties = useStore((s) => s.bounties);
  const cmd = useStore((s) => s.commands);
  const toggle = useStore((s) => s.toggleBounties);
  if (!show || !bounties) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 480,
        maxHeight: '84vh',
        overflowY: 'auto',
        ...panel,
        pointerEvents: 'auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <b style={{ color: colors.gold, fontSize: 15 }}>Bounty Board · {bounties.hub}</b>
        <button
          onClick={toggle}
          style={{
            background: 'transparent',
            border: 'none',
            color: colors.inkDim,
            cursor: 'pointer',
            fontSize: 16,
          }}
        >
          ✕
        </button>
      </div>
      <div style={{ color: colors.inkDim, fontSize: 11, margin: '4px 0 10px' }}>
        Today's postings · resets daily
      </div>

      {bounties.board.length === 0 && (
        <div style={{ color: colors.inkDim, fontSize: 12 }}>No bounties posted today.</div>
      )}

      {bounties.board.map((x) => {
        const ready = x.state === 'ready';
        const active = x.state === 'active';
        const done = x.state === 'done';
        return (
          <div
            key={x.id}
            style={{
              marginBottom: 8,
              padding: '8px 10px',
              background: '#241a11',
              border: `1px solid ${ready ? colors.gold : colors.panelBorder}`,
              borderRadius: 6,
              opacity: done ? 0.6 : 1,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ color: colors.ink, fontSize: 13 }}>{x.title}</div>
                <div style={{ color: colors.inkDim, fontSize: 11 }}>
                  {x.kind === 'kill' ? 'Slay' : 'Gather'} {x.count}
                  {active || ready ? ` · ${Math.min(x.progress, x.count)}/${x.count}` : ''} ·{' '}
                  <span style={{ color: colors.gold }}>{x.gold}g</span> · {x.xp} xp
                </div>
              </div>
              {done ? (
                <span style={{ color: colors.inkDim, fontSize: 11 }}>done</span>
              ) : (
                <button
                  disabled={active}
                  onClick={() =>
                    ready
                      ? cmd?.turnInBounty(x.id)
                      : x.state === 'available' && cmd?.acceptBounty(x.id)
                  }
                  style={{
                    background: active ? 'transparent' : '#3a2c1e',
                    border: `1px solid ${active ? colors.panelBorder : colors.gold}`,
                    borderRadius: 5,
                    color: active ? colors.inkDim : colors.gold,
                    cursor: active ? 'default' : 'pointer',
                    fontSize: 11,
                    padding: '3px 10px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {STATE_LABEL[x.state]}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
