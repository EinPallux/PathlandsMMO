// Quest log (GDD §8): the full list of active quests with objective progress, a pin
// toggle for the tracker, and abandon. Toggled with L (or the ✕).

import { useStore } from '../game/store.js';
import { colors, panel } from './theme.js';

export function QuestLogPanel(): JSX.Element | null {
  const show = useStore((s) => s.showQuestLog);
  const log = useStore((s) => s.questLog);
  const cmd = useStore((s) => s.commands);
  const toggle = useStore((s) => s.toggleQuestLog);
  if (!show) return null;

  const quests = log ?? [];

  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 420,
        maxHeight: '80vh',
        overflowY: 'auto',
        ...panel,
        pointerEvents: 'auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <b style={{ color: colors.gold, fontSize: 15 }}>Quest Log ({quests.length})</b>
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

      {quests.length === 0 && (
        <div style={{ color: colors.inkDim, fontSize: 12, marginTop: 8 }}>
          No active quests. Seek out villagers marked with a golden “!”.
        </div>
      )}

      {quests.map((q) => (
        <div
          key={q.id}
          style={{ marginTop: 10, borderTop: `1px solid ${colors.panelBorder}`, paddingTop: 8 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span
              style={{
                color: q.complete ? colors.gold : colors.ink,
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              {q.chapter ? `[Ch.${q.chapter}] ` : ''}
              {q.name}
              {q.complete ? ' ✓' : ''}
            </span>
            <span style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => cmd?.pinQuest(q.id, !q.pinned)}
                title="Pin to tracker"
                style={{
                  background: 'transparent',
                  border: `1px solid ${q.pinned ? colors.gold : colors.panelBorder}`,
                  borderRadius: 4,
                  color: q.pinned ? colors.gold : colors.inkDim,
                  cursor: 'pointer',
                  fontSize: 10,
                  padding: '1px 5px',
                }}
              >
                {q.pinned ? 'Pinned' : 'Pin'}
              </button>
              <button
                onClick={() => cmd?.abandonQuest(q.id)}
                title="Abandon"
                style={{
                  background: 'transparent',
                  border: `1px solid ${colors.panelBorder}`,
                  borderRadius: 4,
                  color: colors.inkDim,
                  cursor: 'pointer',
                  fontSize: 10,
                  padding: '1px 5px',
                }}
              >
                Abandon
              </button>
            </span>
          </div>
          {q.objectives.map((o, i) => (
            <div
              key={i}
              style={{ fontSize: 12, color: o.done ? colors.inkDim : colors.ink, marginTop: 3 }}
            >
              {o.done ? '✓' : '•'} {o.label}
              {o.need > 1 ? ` (${o.count}/${o.need})` : ''}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
