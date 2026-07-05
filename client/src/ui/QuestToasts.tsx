// Transient quest toasts (GDD §8): "Quest accepted / Objective complete / Quest
// complete" banners, top-centre, auto-clearing a few seconds after the latest.

import { useEffect } from 'react';
import { useStore } from '../game/store.js';
import { colors } from './theme.js';

const KIND_COLOR: Record<string, string> = {
  accept: colors.ink,
  progress: '#d8c7ad',
  complete: colors.gold,
};

export function QuestToasts(): JSX.Element | null {
  const toasts = useStore((s) => s.questToasts);
  const setToasts = useStore((s) => s.setQuestToasts);

  useEffect(() => {
    if (toasts.length === 0) return;
    const t = window.setTimeout(() => setToasts([]), 3500);
    return () => window.clearTimeout(t);
  }, [toasts, setToasts]);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 70,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        pointerEvents: 'none',
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            background: 'rgba(20,15,10,0.8)',
            border: `1px solid ${colors.panelBorder}`,
            borderRadius: 5,
            padding: '4px 12px',
            fontSize: 13,
            fontWeight: 600,
            color: KIND_COLOR[t.kind] ?? colors.ink,
            textShadow: '0 1px 2px #000',
          }}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
