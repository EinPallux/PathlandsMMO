// Professions panel (GDD §9): the five profession skill bars (1–100) and the
// gathered-materials stash. Toggled with P (or the ✕).

import { useStore } from '../game/store.js';
import { colors, panel } from './theme.js';

export function ProfessionsPanel(): JSX.Element | null {
  const show = useStore((s) => s.showProfessions);
  const prof = useStore((s) => s.professions);
  const cmd = useStore((s) => s.commands);
  const toggle = useStore((s) => s.toggleProfessions);
  if (!show) return null;

  const skills = prof?.skills ?? [];
  const materials = prof?.materials ?? [];
  const consumables = prof?.consumables ?? [];

  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 440,
        maxHeight: '80vh',
        overflowY: 'auto',
        ...panel,
        pointerEvents: 'auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <b style={{ color: colors.gold, fontSize: 15 }}>Professions</b>
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

      <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ color: colors.inkDim, fontSize: 11, marginBottom: 4 }}>SKILLS</div>
          {skills.map((s) => (
            <div key={s.id} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span>{s.name}</span>
                <b style={{ color: colors.gold }}>
                  {s.skill}
                  <span style={{ color: colors.inkDim }}>/{s.max}</span>
                </b>
              </div>
              <div
                style={{
                  height: 6,
                  marginTop: 2,
                  background: '#000',
                  borderRadius: 3,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${(s.skill / s.max) * 100}%`,
                    height: '100%',
                    background: '#5fbf4e',
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ color: colors.inkDim, fontSize: 11, marginBottom: 4 }}>MATERIALS</div>
          {materials.length === 0 && (
            <div style={{ color: colors.inkDim, fontSize: 12 }}>
              Nothing gathered yet. Mine ore veins, pick herbs, or fish at the water’s edge.
            </div>
          )}
          {materials.map((m) => (
            <div
              key={m.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 12,
                marginBottom: 3,
              }}
            >
              <span>{m.name}</span>
              <b>{m.qty}</b>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 12, borderTop: `1px solid ${colors.panelBorder}`, paddingTop: 8 }}>
        <div style={{ color: colors.inkDim, fontSize: 11, marginBottom: 4 }}>
          POTIONS &amp; ELIXIRS
        </div>
        {consumables.length === 0 && (
          <div style={{ color: colors.inkDim, fontSize: 12 }}>
            None brewed. Learn Alchemy recipes in the crafting menu (K).
          </div>
        )}
        {consumables.map((c) => (
          <div
            key={c.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 12,
              marginBottom: 4,
            }}
          >
            <span>
              {c.name} <span style={{ color: colors.inkDim }}>×{c.qty}</span>
              <span style={{ color: colors.inkDim }}> · {c.effect}</span>
            </span>
            <button
              onClick={() => cmd?.useConsumable(c.id)}
              style={{
                background: '#3a2c1e',
                border: `1px solid ${colors.gold}`,
                borderRadius: 5,
                color: colors.gold,
                cursor: 'pointer',
                fontSize: 11,
                padding: '2px 8px',
              }}
            >
              Use
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
