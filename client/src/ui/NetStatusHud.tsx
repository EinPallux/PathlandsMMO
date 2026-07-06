// Multiplayer connection indicator (Phase 6). A small pill under the minimap that shows
// the connection phase and, when connected, the peer count and round-trip latency. It
// renders nothing in single-player (store.net === null), so the single-player build is
// visually unchanged.

import { useStore } from '../game/store.js';
import { colors, panel } from './theme.js';

const PHASE = {
  connecting: { dot: colors.gold, label: 'Connecting…' },
  reconnecting: { dot: '#e0a878', label: 'Reconnecting…' },
  connected: { dot: colors.accent, label: 'Connected' },
} as const;

function latencyColor(ms: number): string {
  if (ms < 80) return colors.accent;
  if (ms < 160) return colors.gold;
  return '#e0736a';
}

export function NetStatusHud(): JSX.Element | null {
  const net = useStore((s) => s.net);
  if (net === null) return null; // single-player — no indicator

  const p = PHASE[net.phase];
  return (
    <div
      style={{
        position: 'absolute',
        // Tucked just below the 156px minimap (top:12 + 156 + 8).
        top: 176,
        left: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        ...panel,
        padding: '5px 9px',
        fontSize: 12,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: p.dot,
          boxShadow: `0 0 6px ${p.dot}`,
          flex: '0 0 auto',
        }}
      />
      <span style={{ color: colors.ink }}>{p.label}</span>
      {net.phase === 'connected' && (
        <>
          <span style={{ color: colors.inkDim }}>· {net.peers} nearby</span>
          <span
            style={{ color: net.latencyMs === null ? colors.inkDim : latencyColor(net.latencyMs) }}
          >
            · {net.latencyMs === null ? '— ms' : `${Math.round(net.latencyMs)} ms`}
          </span>
        </>
      )}
    </div>
  );
}
