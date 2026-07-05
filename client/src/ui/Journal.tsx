// Wayfarer's Journal (GDD §10): Deeds (achievements) and Path perks bought with the
// Path Points those Deeds award. Toggled with J. Reads the journal slice the
// MetaDirector publishes; buying a perk goes through GameCommands.

import { useStore } from '../game/store.js';
import { colors, panel } from './theme.js';

const CATEGORY_LABEL: Record<string, string> = {
  exploration: 'Exploration',
  combat: 'Combat',
  quests: 'Quests',
  professions: 'Professions',
};

export function Journal(): JSX.Element | null {
  const show = useStore((s) => s.showJournal);
  const journal = useStore((s) => s.journal);
  const cmd = useStore((s) => s.commands);
  const toggle = useStore((s) => s.toggleJournal);
  if (!show) return null;

  const deeds = journal?.deeds ?? [];
  const perks = journal?.perks ?? [];
  const categories = [...new Set(deeds.map((d) => d.category))];

  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 560,
        maxHeight: '84vh',
        overflowY: 'auto',
        ...panel,
        pointerEvents: 'auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <b style={{ color: colors.gold, fontSize: 15 }}>Wayfarer's Journal</b>
        <span>
          <span style={{ color: colors.gold }}>{journal?.pathPoints ?? 0} Path Points</span>
          <button
            onClick={toggle}
            style={{
              marginLeft: 12,
              background: 'transparent',
              border: 'none',
              color: colors.inkDim,
              cursor: 'pointer',
              fontSize: 16,
            }}
          >
            ✕
          </button>
        </span>
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
        {/* Deeds */}
        <div style={{ flex: 1.3, minWidth: 0 }}>
          <div style={{ color: colors.inkDim, fontSize: 11, marginBottom: 4 }}>DEEDS</div>
          {categories.map((cat) => (
            <div key={cat} style={{ marginBottom: 8 }}>
              <div style={{ color: colors.inkDim, fontSize: 10, marginBottom: 2 }}>
                {CATEGORY_LABEL[cat] ?? cat}
              </div>
              {deeds
                .filter((d) => d.category === cat)
                .map((d) => (
                  <div key={d.id} style={{ marginBottom: 5 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: d.complete ? colors.gold : colors.ink }}>
                        {d.complete ? '✓ ' : ''}
                        {d.name}
                      </span>
                      <span style={{ color: colors.inkDim }}>
                        {d.complete ? `+${d.pathPoints} PP` : `${d.progress}/${d.threshold}`}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: colors.inkDim }}>{d.description}</div>
                  </div>
                ))}
            </div>
          ))}
        </div>

        {/* Perks */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: colors.inkDim, fontSize: 11, marginBottom: 4 }}>PATH PERKS</div>
          {perks.map((p) => (
            <div
              key={p.id}
              style={{
                marginBottom: 6,
                padding: '5px 8px',
                background: '#241a11',
                border: `1px solid ${colors.panelBorder}`,
                borderRadius: 6,
              }}
            >
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span style={{ fontSize: 12, color: colors.ink }}>
                  {p.name}{' '}
                  <span style={{ color: colors.inkDim }}>
                    ({p.rank}/{p.maxRank})
                  </span>
                </span>
                <button
                  disabled={!p.canBuy}
                  onClick={() => cmd?.buyPerk(p.id)}
                  style={{
                    background: p.canBuy ? '#3a2c1e' : 'transparent',
                    border: `1px solid ${p.canBuy ? colors.gold : colors.panelBorder}`,
                    borderRadius: 5,
                    color: p.canBuy ? colors.gold : colors.inkDim,
                    cursor: p.canBuy ? 'pointer' : 'not-allowed',
                    fontSize: 11,
                    padding: '2px 8px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {p.rank >= p.maxRank ? 'Maxed' : `${p.cost} PP`}
                </button>
              </div>
              <div style={{ fontSize: 11, color: colors.inkDim }}>{p.description}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
