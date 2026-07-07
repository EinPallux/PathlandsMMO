// Party roster panel (Phase 6 §Social). A compact list under the connection pill showing each
// member (class dot, name, level), the leader's crown, live HP + resource bars (Part 20 —
// server-replicated vitals, world-wide so you see allies' health apart or together), and
// controls: "Leave" for yourself and "✕ kick" beside each other member when you are the leader.
// It renders nothing when solo (store.party === null), so the ungrouped view is unchanged.

import { useStore } from '../game/store.js';
import { colors, panel } from './theme.js';

/** A muted class tint for the member dot (matches the four-class palette; cosmetic only). */
const CLASS_DOT: Record<string, string> = {
  warrior: '#c56b4a',
  ranger: '#6fa84e',
  priest: '#e8dcc0',
  mage: '#5a8fd0',
};

/** Resource-bar tint by kind (the three in use: rage/focus/mana); a neutral fallback otherwise. */
const RESOURCE_TINT: Record<string, string> = {
  rage: '#c0392b',
  focus: '#d4b24a',
  mana: '#3d6fd0',
};

/** A thin horizontal bar filled to `frac` (0..1) in `color`, over a dark track. */
function Bar({
  frac,
  color,
  height,
}: {
  frac: number;
  color: string;
  height: number;
}): JSX.Element {
  const clamped = Math.max(0, Math.min(1, frac));
  return (
    <div
      style={{
        width: '100%',
        height,
        borderRadius: 3,
        background: 'rgba(0,0,0,0.45)',
        overflow: 'hidden',
      }}
    >
      <div style={{ width: `${clamped * 100}%`, height: '100%', background: color }} />
    </div>
  );
}

export function PartyPanel(): JSX.Element | null {
  const party = useStore((s) => s.party);
  const vitals = useStore((s) => s.partyVitals);
  const commands = useStore((s) => s.commands);
  if (party === null) return null; // solo — nothing to show

  const youAreLeader = party.leaderId === party.selfId;

  return (
    <div
      style={{
        position: 'absolute',
        // Below the connection pill (top:176 one-liner + gap).
        top: 210,
        left: 12,
        width: 190,
        ...panel,
        padding: '8px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ color: colors.gold, fontWeight: 700, fontSize: 12 }}>
          Party · {party.members.length}/4
        </span>
        <button
          type="button"
          onClick={() => commands?.partyLeave()}
          style={{
            background: 'transparent',
            border: 'none',
            color: colors.inkDim,
            cursor: 'pointer',
            fontSize: 11,
            padding: 0,
            textDecoration: 'underline',
          }}
        >
          Leave
        </button>
      </div>

      {party.members.map((m) => {
        const isYou = m.id === party.selfId;
        const isLeader = m.id === party.leaderId;
        const v = vitals[m.id];
        const hpFrac = v !== undefined && v.maxHP > 0 ? v.hp / v.maxHP : 0;
        const resFrac = v !== undefined && v.maxResource > 0 ? v.resource / v.maxResource : 0;
        const hpColor = v?.dead ? '#6b6b6b' : hpFrac < 0.3 ? '#d0503f' : '#5fbf50';
        return (
          <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13 }}>
              <span
                title={m.cls}
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: '50%',
                  flex: '0 0 auto',
                  background: CLASS_DOT[m.cls] ?? colors.inkDim,
                }}
              />
              <span
                style={{
                  color: isYou ? colors.accent : colors.ink,
                  fontWeight: isYou ? 700 : 500,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  flex: '1 1 auto',
                  opacity: v?.dead ? 0.55 : 1,
                }}
              >
                {isLeader && <span title="Party leader">👑 </span>}
                {m.name}
              </span>
              <span style={{ color: colors.inkDim, fontSize: 11, flex: '0 0 auto' }}>
                L{m.level}
              </span>
              {youAreLeader && !isYou && (
                <button
                  type="button"
                  title={`Remove ${m.name} from the party`}
                  onClick={() => commands?.partyKick(m.id)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#e0736a',
                    cursor: 'pointer',
                    fontSize: 13,
                    lineHeight: 1,
                    padding: 0,
                    flex: '0 0 auto',
                  }}
                >
                  ✕
                </button>
              )}
            </div>
            {/* Live vitals — hidden until the first vitals frame arrives for this member. */}
            {v !== undefined && (
              <>
                <Bar frac={hpFrac} color={hpColor} height={7} />
                {v.maxResource > 0 && (
                  <Bar
                    frac={resFrac}
                    color={RESOURCE_TINT[v.resourceKind] ?? '#8a7fa0'}
                    height={4}
                  />
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
