import { useEffect, useState } from 'react';
import { useStore } from '../game/store.js';
import { LOADING_ART } from '../platform/assetManifest.js';
import { colors } from './theme.js';

const TIPS = [
  'The Waymakers are gone, but their roads remain. Follow the Old Paths.',
  'One continent, one world — no loading screens between the zones ahead.',
  'Move with WASD, look with the mouse, jump with Space. Hold Shift to run.',
  'Press ` to toggle the developer overlay, M for the world map, F to free-fly.',
  'The Verdigris Blight seeps up from somewhere deep. Something is waking.',
];

export function LoadingScreen(): JSX.Element {
  const progress = useStore((s) => s.loadProgress);
  const [tip, setTip] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTip((t) => (t + 1) % TIPS.length), 4200);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: `linear-gradient(rgba(11,13,18,0.72), rgba(11,13,18,0.92)), url(${LOADING_ART}) center/contain no-repeat, #0b0d12`,
        zIndex: 100,
      }}
    >
      <h1
        style={{ fontSize: 58, letterSpacing: 6, color: colors.ink, textShadow: '0 3px 14px #000' }}
      >
        PATHLANDS
      </h1>
      <p style={{ color: colors.gold, marginTop: 4, letterSpacing: 2, fontSize: 14 }}>
        A voxel world awaits
      </p>

      <div
        style={{
          width: 340,
          height: 8,
          background: 'rgba(255,255,255,0.12)',
          borderRadius: 4,
          marginTop: 34,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${Math.round(progress * 100)}%`,
            height: '100%',
            background: colors.accent,
            transition: 'width 0.25s ease',
          }}
        />
      </div>
      <p style={{ color: colors.inkDim, marginTop: 10, fontSize: 12 }}>
        Weaving the continent… {Math.round(progress * 100)}%
      </p>

      <p
        style={{
          color: colors.inkDim,
          marginTop: 40,
          maxWidth: 460,
          textAlign: 'center',
          fontSize: 13,
          minHeight: 40,
          padding: '0 16px',
        }}
      >
        {TIPS[tip]}
      </p>
    </div>
  );
}
