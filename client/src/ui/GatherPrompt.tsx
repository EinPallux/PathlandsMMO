// Gather prompt + channel bar (GDD §9). Shows "Press E to mine/gather/fish" when a
// node or water is in reach, and a progress bar while working a node or fishing.

import { useStore } from '../game/store.js';
import { colors, panel } from './theme.js';

export function GatherPrompt(): JSX.Element | null {
  const nearby = useStore((s) => s.nearbyNode);
  const status = useStore((s) => s.gatherStatus);

  if (status) {
    return (
      <div
        style={{
          position: 'absolute',
          bottom: 128,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 240,
          ...panel,
          textAlign: 'center',
        }}
      >
        <div style={{ color: colors.gold, fontWeight: 700, fontSize: 13 }}>{status.label}</div>
        <div
          style={{
            height: 8,
            marginTop: 5,
            background: '#000',
            borderRadius: 4,
            overflow: 'hidden',
            border: '1px solid rgba(0,0,0,0.7)',
          }}
        >
          <div
            style={{
              width: `${Math.round(status.frac * 100)}%`,
              height: '100%',
              background: status.hint ? colors.gold : '#5fbf4e',
            }}
          />
        </div>
        {status.hint && (
          <div style={{ fontSize: 12, color: colors.ink, marginTop: 4 }}>{status.hint}</div>
        )}
      </div>
    );
  }

  if (!nearby) return null;
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 128,
        left: '50%',
        transform: 'translateX(-50%)',
        ...panel,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 12, color: colors.inkDim }}>
        Press <b style={{ color: colors.ink }}>E</b> to{' '}
        <span style={{ color: colors.gold }}>{nearby.label}</span>
      </div>
    </div>
  );
}
