import { useStore } from '../game/store.js';
import { panel, colors } from './theme.js';

export function Dialogue(): JSX.Element | null {
  const dialogue = useStore((s) => s.dialogue);
  const advance = useStore((s) => s.advanceDialogue);
  const close = useStore((s) => s.closeDialogue);
  if (!dialogue) return null;

  const line = dialogue.lines[dialogue.index] ?? '';
  const last = dialogue.index >= dialogue.lines.length - 1;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 90,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(560px, 82vw)',
        ...panel,
        padding: 16,
      }}
    >
      <div style={{ color: colors.gold, fontWeight: 600, marginBottom: 6 }}>{dialogue.name}</div>
      <div style={{ fontSize: 15, lineHeight: 1.5, minHeight: 44 }}>{line}</div>
      <div
        style={{
          marginTop: 10,
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
          fontSize: 12,
          color: colors.inkDim,
        }}
      >
        <button
          onClick={() => advance()}
          style={{
            background: '#3a2c1e',
            border: `1px solid ${colors.panelBorder}`,
            borderRadius: 6,
            color: colors.ink,
            padding: '4px 12px',
            cursor: 'pointer',
          }}
        >
          {last ? 'Farewell [E]' : 'Continue [E]'}
        </button>
        <button
          onClick={() => close()}
          style={{
            background: 'transparent',
            border: 'none',
            color: colors.inkDim,
            cursor: 'pointer',
          }}
        >
          Esc
        </button>
      </div>
    </div>
  );
}
