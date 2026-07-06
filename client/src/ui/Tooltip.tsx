// Rich hover tooltips (Phase-5 UI polish): a portal-based tip that follows the cursor,
// an item card (rarity-coloured, colourblind-safe rarity label, full stats) with a
// vs-equipped comparison block, and a skill card. Replaces the plain native `title=`
// text. Pure presentation — reads item/skill data, no game state mutation.

import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { RARITY_COLOR, Rarity, skillById, type ItemDef, type StatBlock } from '@pathlands/shared';
import { colors, panel } from './theme.js';

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;
const rarityHex = (item: ItemDef): string => hex(RARITY_COLOR[item.rarity] ?? 0x888888);

/** Colourblind-safe rarity names (text, not just colour). */
export const RARITY_LABEL: Record<string, string> = {
  [Rarity.Common]: 'Common',
  [Rarity.Uncommon]: 'Uncommon',
  [Rarity.Rare]: 'Rare',
  [Rarity.Epic]: 'Epic',
};

const SLOT_LABEL: Record<string, string> = {
  mainHand: 'Main Hand',
  offHand: 'Off Hand',
  head: 'Head',
  chest: 'Chest',
  legs: 'Legs',
  feet: 'Feet',
  hands: 'Hands',
  amulet: 'Amulet',
  ring1: 'Ring',
  ring2: 'Ring',
  trinket: 'Trinket',
};

const STAT_KEYS: Array<[keyof StatBlock, string]> = [
  ['might', 'Might'],
  ['agility', 'Agility'],
  ['intellect', 'Intellect'],
  ['spirit', 'Spirit'],
  ['stamina', 'Stamina'],
];

// --- hover plumbing ----------------------------------------------------------

type Pos = { x: number; y: number };

/** Cursor-follow handlers + the current position (null when not hovering). */
export function useHoverTip(): {
  pos: Pos | null;
  handlers: {
    onMouseEnter: (e: React.MouseEvent) => void;
    onMouseMove: (e: React.MouseEvent) => void;
    onMouseLeave: () => void;
  };
} {
  const [pos, setPos] = useState<Pos | null>(null);
  return {
    pos,
    handlers: {
      onMouseEnter: (e) => setPos({ x: e.clientX, y: e.clientY }),
      onMouseMove: (e) => setPos({ x: e.clientX, y: e.clientY }),
      onMouseLeave: () => setPos(null),
    },
  };
}

/** Fixed-position card near the cursor, portalled to the body (escapes clipping). */
export function TooltipPortal({ pos, children }: { pos: Pos; children: ReactNode }): JSX.Element {
  const W = 250;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  // Flip to the left of the cursor if it would run off the right edge; clamp vertically.
  const left = pos.x + 16 + W > vw ? Math.max(8, pos.x - W - 16) : pos.x + 16;
  const top = Math.min(Math.max(8, pos.y + 14), vh - 240);
  return createPortal(
    <div
      style={{
        position: 'fixed',
        left,
        top,
        width: W,
        zIndex: 10000,
        pointerEvents: 'none',
        ...panel,
        fontSize: 12,
        lineHeight: 1.45,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

// --- item card ---------------------------------------------------------------

function Line({ children, color }: { children: ReactNode; color?: string }): JSX.Element {
  return <div style={{ color: color ?? colors.ink }}>{children}</div>;
}

/** One comparison row vs the equipped item (▲ upgrade / ▼ downgrade). */
function delta(label: string, diff: number, suffix = ''): JSX.Element | null {
  if (Math.abs(diff) < 0.05) return null;
  const up = diff > 0;
  const shown = suffix === '%' ? diff.toFixed(1) : Math.round(diff).toString();
  return (
    <div style={{ color: up ? colors.accent : '#d9736b', fontSize: 11 }}>
      {up ? '▲' : '▼'} {up ? '+' : ''}
      {shown}
      {suffix} {label}
    </div>
  );
}

function Comparison({ item, equipped }: { item: ItemDef; equipped: ItemDef }): JSX.Element {
  const rows: Array<JSX.Element | null> = [
    delta('item level', item.ilvl - equipped.ilvl),
    delta('dps', (item.weapon?.dps ?? 0) - (equipped.weapon?.dps ?? 0)),
    delta('armor', (item.armor ?? 0) - (equipped.armor ?? 0)),
    ...STAT_KEYS.map(([k, name]) => delta(name, (item.stats[k] ?? 0) - (equipped.stats[k] ?? 0))),
    delta('crit', ((item.bonusCritChance ?? 0) - (equipped.bonusCritChance ?? 0)) * 100, '%'),
  ];
  const shown = rows.filter(Boolean);
  return (
    <div style={{ marginTop: 6, borderTop: `1px solid ${colors.panelBorder}`, paddingTop: 5 }}>
      <div style={{ color: colors.inkDim, fontSize: 10, marginBottom: 2 }}>vs equipped</div>
      {shown.length > 0 ? (
        shown
      ) : (
        <div style={{ color: colors.inkDim, fontSize: 11 }}>No change</div>
      )}
    </div>
  );
}

/** The full item detail card, optionally comparing against the equipped item. */
export function ItemTooltipCard({
  item,
  equipped,
}: {
  item: ItemDef;
  equipped?: ItemDef;
}): JSX.Element {
  const rc = rarityHex(item);
  return (
    <div>
      <div style={{ color: rc, fontWeight: 700 }}>{item.name}</div>
      <div style={{ color: rc, fontSize: 11 }}>
        {RARITY_LABEL[item.rarity] ?? item.rarity} · {SLOT_LABEL[item.slot] ?? item.slot}
      </div>
      <Line color={colors.inkDim}>
        Item Level {item.ilvl} · requires level {item.reqLevel}
      </Line>
      {item.weapon && item.weapon.dps > 0 && (
        <Line>
          {item.weapon.kind} · {item.weapon.dps.toFixed(1)} dps
        </Line>
      )}
      {item.armor ? <Line>{item.armor} armor</Line> : null}
      {STAT_KEYS.map(([k, name]) =>
        item.stats[k] ? (
          <Line key={k} color={colors.accent}>
            +{item.stats[k]} {name}
          </Line>
        ) : null,
      )}
      {item.bonusCritChance ? (
        <Line color={colors.accent}>+{(item.bonusCritChance * 100).toFixed(1)}% crit</Line>
      ) : null}
      {item.trinket && (
        <Line color={colors.gold}>
          {item.trinket.trigger === 'onUse' ? 'Use' : 'Chance on hit'}: {item.trinket.kind}
        </Line>
      )}
      {item.bindOnEquip && <Line color={colors.inkDim}>Binds on equip</Line>}
      <Line color={colors.inkDim}>Value {item.value}c</Line>
      {equipped && equipped.id !== item.id && <Comparison item={item} equipped={equipped} />}
    </div>
  );
}

// --- skill card --------------------------------------------------------------

/** Skill detail: cost, cooldown, and description (looked up from shared data). */
export function SkillTooltipCard({ skillId }: { skillId: string }): JSX.Element | null {
  const s = skillById(skillId);
  if (!s) return null;
  const cd = s.cooldownTicks > 0 ? `${(s.cooldownTicks / 20).toFixed(0)}s cooldown` : 'no cooldown';
  return (
    <div>
      <div style={{ color: colors.gold, fontWeight: 700 }}>{s.name}</div>
      <Line color={colors.inkDim}>
        {s.resource > 0 ? `Costs ${s.resource}` : 'No cost'} · {cd}
      </Line>
      <Line>{s.description}</Line>
    </div>
  );
}
