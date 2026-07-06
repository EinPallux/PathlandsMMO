// Crafting panel (GDD §9): recipes grouped by profession with their inputs, output,
// and a Craft button enabled when the player has the materials + skill. Toggled with
// K. Consumes from the material stash; gear goes to the bag, potions to the stash.

import { useStore } from '../game/store.js';
import { colors, panel } from './theme.js';

export function CraftingPanel(): JSX.Element | null {
  const show = useStore((s) => s.showCrafting);
  const crafting = useStore((s) => s.crafting);
  const cmd = useStore((s) => s.commands);
  const toggle = useStore((s) => s.toggleCrafting);
  if (!show) return null;

  const recipes = crafting?.recipes ?? [];
  const professions = [...new Set(recipes.map((r) => r.profession))];

  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 480,
        maxHeight: '82vh',
        overflowY: 'auto',
        ...panel,
        pointerEvents: 'auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <b style={{ color: colors.gold, fontSize: 15 }}>Crafting</b>
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

      {professions.map((prof) => (
        <div key={prof} style={{ marginTop: 10 }}>
          <div style={{ color: colors.inkDim, fontSize: 11, marginBottom: 4 }}>
            {prof.toUpperCase()}
          </div>
          {recipes
            .filter((r) => r.profession === prof)
            .map((r) => (
              <div
                key={r.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 5,
                  padding: '5px 8px',
                  background: '#241a11',
                  border: `1px solid ${colors.panelBorder}`,
                  borderRadius: 6,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: colors.ink }}>
                    {r.name}
                    <span style={{ color: colors.inkDim }}> → {r.output}</span>
                  </div>
                  <div style={{ fontSize: 11, color: colors.inkDim }}>
                    req {r.skillReq} ·{' '}
                    {r.inputs.map((i) => `${i.qty}× ${i.name} (${i.have})`).join(', ')}
                  </div>
                </div>
                <button
                  disabled={!r.craftable}
                  onClick={() => cmd?.craftRecipe(r.id)}
                  style={{
                    background: r.craftable ? '#3a2c1e' : 'transparent',
                    border: `1px solid ${r.craftable ? colors.gold : colors.panelBorder}`,
                    borderRadius: 5,
                    color: r.craftable ? colors.gold : colors.inkDim,
                    cursor: r.craftable ? 'pointer' : 'not-allowed',
                    fontSize: 11,
                    padding: '3px 10px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Craft
                </button>
              </div>
            ))}
        </div>
      ))}
      <div style={{ color: colors.inkDim, fontSize: 10, marginTop: 10, lineHeight: 1.4 }}>
        Keep crafting to discover rare recipes — a master smith or alchemist sometimes learns one
        mid-craft.
      </div>
    </div>
  );
}
