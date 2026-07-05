// Quest tracker HUD (GDD §8): the pinned quests shown at the right edge with live
// objective progress. Read-only; pinning is done in the quest log.

import { useStore } from '../game/store.js';
import { colors } from './theme.js';

export function QuestTracker(): JSX.Element | null {
  const tracker = useStore((s) => s.questTracker);
  if (!tracker || tracker.length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 90,
        right: 12,
        width: 210,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {tracker.map((q) => (
        <div
          key={q.id}
          style={{
            background: 'rgba(20,15,10,0.55)',
            border: `1px solid ${colors.panelBorder}`,
            borderRadius: 5,
            padding: '5px 8px',
          }}
        >
          <div
            style={{ color: q.complete ? colors.gold : colors.ink, fontSize: 12, fontWeight: 700 }}
          >
            {q.name}
            {q.complete ? ' ✓' : ''}
          </div>
          {q.objectives.map((o, i) => (
            <div
              key={i}
              style={{ fontSize: 11, color: o.done ? colors.inkDim : '#d8c7ad', marginTop: 2 }}
            >
              {o.done ? '✓' : '–'} {o.label}
              {o.need > 1 ? ` ${o.count}/${o.need}` : ''}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
