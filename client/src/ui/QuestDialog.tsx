// Quest-giver dialogue (GDD §8): a modal listing a giver's ready turn-ins and
// available offers, with reward previews + class-filtered reward choices. Opens on
// E near a quest-giver NPC; actions go through GameCommands.

import { useStore } from '../game/store.js';
import { colors, panel } from './theme.js';

const btn = (primary: boolean): React.CSSProperties => ({
  marginTop: 6,
  padding: '6px 10px',
  borderRadius: 6,
  border: `1px solid ${primary ? colors.gold : colors.panelBorder}`,
  background: primary ? '#3a2c1e' : 'transparent',
  color: primary ? colors.gold : colors.ink,
  cursor: 'pointer',
  fontSize: 12,
});

export function QuestDialog(): JSX.Element | null {
  const dlg = useStore((s) => s.questDialog);
  const cmd = useStore((s) => s.commands);
  if (!dlg) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 460,
        maxHeight: '80vh',
        overflowY: 'auto',
        ...panel,
        pointerEvents: 'auto',
      }}
    >
      <b style={{ color: colors.gold, fontSize: 16 }}>{dlg.giver}</b>

      {dlg.turnIns.map((q) => (
        <div
          key={q.id}
          style={{ marginTop: 12, borderTop: `1px solid ${colors.panelBorder}`, paddingTop: 8 }}
        >
          <div style={{ color: colors.gold, fontSize: 13, fontWeight: 700 }}>? {q.name}</div>
          <div style={{ fontSize: 12, color: colors.ink, margin: '4px 0' }}>{q.complete}</div>
          <div style={{ fontSize: 11, color: colors.inkDim }}>Reward: {q.reward}</div>
          {q.choices.length > 0 ? (
            q.choices.map((c, i) => (
              <button key={i} style={btn(true)} onClick={() => cmd?.turnInQuest(q.id, i)}>
                Take: {c}
              </button>
            ))
          ) : (
            <button style={btn(true)} onClick={() => cmd?.turnInQuest(q.id, 0)}>
              Complete Quest
            </button>
          )}
        </div>
      ))}

      {dlg.offers.map((q) => (
        <div
          key={q.id}
          style={{ marginTop: 12, borderTop: `1px solid ${colors.panelBorder}`, paddingTop: 8 }}
        >
          <div style={{ color: colors.gold, fontSize: 13, fontWeight: 700 }}>
            ! {q.name}
            {q.chapter ? (
              <span style={{ color: colors.inkDim }}> · Chapter {q.chapter}</span>
            ) : null}
          </div>
          <div style={{ fontSize: 12, color: colors.ink, margin: '4px 0' }}>{q.intro}</div>
          <div style={{ fontSize: 11, color: colors.inkDim }}>Reward: {q.reward}</div>
          <button style={btn(false)} onClick={() => cmd?.acceptQuest(q.id)}>
            Accept
          </button>
        </div>
      ))}

      {dlg.active.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 11, color: colors.inkDim }}>
          In progress: {dlg.active.join(', ')}
        </div>
      )}

      <button
        onClick={() => cmd?.closeQuestDialog()}
        style={{
          marginTop: 12,
          width: '100%',
          background: 'transparent',
          border: `1px solid ${colors.panelBorder}`,
          borderRadius: 6,
          color: colors.inkDim,
          padding: '6px',
          cursor: 'pointer',
        }}
      >
        Farewell (Esc)
      </button>
    </div>
  );
}
