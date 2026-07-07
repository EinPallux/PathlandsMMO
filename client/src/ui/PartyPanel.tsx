// Party roster panel (Phase 6 §Social). A compact list under the connection pill showing
// each member (class dot, name, level), the leader's crown, and controls: "Leave" for
// yourself and "Kick" beside each other member when you are the leader. It renders nothing
// when solo (store.party === null), so the single-player / ungrouped view is unchanged.
//
// Live ally HP/resource frames are a later slice — those need the server to replicate party
// members' vitals to each other (only your OWN combat state is sent today). This slice is the
// roster + membership controls; the panel is built to grow a vitals bar per row.

import { useStore } from '../game/store.js';
import { colors, panel } from './theme.js';

/** A muted class tint for the member dot (matches the four-class palette; cosmetic only). */
const CLASS_DOT: Record<string, string> = {
  warrior: '#c56b4a',
  ranger: '#6fa84e',
  priest: '#e8dcc0',
  mage: '#5a8fd0',
};

export function PartyPanel(): JSX.Element | null {
  const party = useStore((s) => s.party);
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
        gap: 6,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
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
        return (
          <div
            key={m.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              fontSize: 13,
            }}
          >
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
              }}
            >
              {isLeader && <span title="Party leader">👑 </span>}
              {m.name}
            </span>
            <span style={{ color: colors.inkDim, fontSize: 11, flex: '0 0 auto' }}>L{m.level}</span>
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
        );
      })}
    </div>
  );
}
