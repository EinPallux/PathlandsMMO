// Character sheet: equipment paperdoll, primary + derived stats, and the bag.
// Toggled with I / C (or the ✕). Click a bag item to equip, an equipped item to
// unequip, right-click a bag item to sell. Reads the inventory slice the
// CombatDirector publishes; actions go through GameCommands.

import { useStore, type MountUi } from '../game/store.js';
import { EQUIP_SLOTS, RARITY_COLOR, type ItemDef } from '@pathlands/shared';
import { colors, panel } from './theme.js';

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

const STAT_LABEL: Array<[string, string]> = [
  ['might', 'Might'],
  ['agility', 'Agility'],
  ['intellect', 'Intellect'],
  ['spirit', 'Spirit'],
  ['stamina', 'Stamina'],
];

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;
/** Rarity color with a safe fallback for unknown/corrupt rarities (old saves). */
const rarityHex = (item: ItemDef): string => hex(RARITY_COLOR[item.rarity] ?? 0x888888);

function itemSummary(item: ItemDef): string {
  const parts = [item.name, `Item Level ${item.ilvl} · requires level ${item.reqLevel}`];
  if (item.weapon) parts.push(`${item.weapon.kind} · ${item.weapon.dps.toFixed(1)} dps`);
  if (item.armor) parts.push(`${item.armor} armor`);
  for (const [k, v] of Object.entries(item.stats)) if (v) parts.push(`+${v} ${k}`);
  if (item.bonusCritChance) parts.push(`+${(item.bonusCritChance * 100).toFixed(1)}% crit`);
  parts.push(`Value ${item.value}c`);
  return parts.join('\n');
}

function ItemCell({
  item,
  onClick,
  onContext,
}: {
  item?: ItemDef;
  onClick?: () => void;
  onContext?: () => void;
}): JSX.Element {
  const border = item ? rarityHex(item) : colors.panelBorder;
  return (
    <button
      title={item ? itemSummary(item) : undefined}
      onClick={onClick}
      onContextMenu={(e) => {
        if (onContext) {
          e.preventDefault();
          onContext();
        }
      }}
      disabled={!item && !onClick}
      style={{
        width: 52,
        height: 52,
        borderRadius: 6,
        border: `2px solid ${border}`,
        background: item ? '#1c1610' : '#120d09',
        color: colors.ink,
        cursor: item ? 'pointer' : 'default',
        fontSize: 9,
        lineHeight: 1.1,
        padding: 3,
        overflow: 'hidden',
        textAlign: 'center',
      }}
    >
      {item ? item.name.split(' ').slice(-1)[0] : ''}
    </button>
  );
}

export function CharacterPanel(): JSX.Element | null {
  const show = useStore((s) => s.showChar);
  const inv = useStore((s) => s.inventory);
  const combat = useStore((s) => s.combat);
  const cmd = useStore((s) => s.commands);
  const mount = useStore((s) => s.mount);
  const toggle = useStore((s) => s.toggleChar);
  if (!show || !inv) return null;

  const s = inv.stats;

  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 620,
        ...panel,
        pointerEvents: 'auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <b style={{ color: colors.gold, fontSize: 16 }}>
          {combat?.player.className} — Level {combat?.player.level}
        </b>
        <span>
          <span style={{ color: colors.gold }}>{inv.gold}c</span>
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

      <div style={{ display: 'flex', gap: 14, marginTop: 10 }}>
        {/* Equipment */}
        <div style={{ width: 190 }}>
          <div style={{ color: colors.inkDim, fontSize: 11, marginBottom: 4 }}>EQUIPMENT</div>
          {EQUIP_SLOTS.map((slot) => {
            const item = inv.equipment[slot];
            return (
              <div
                key={slot}
                style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}
              >
                <ItemCell item={item} onClick={item ? () => cmd?.unequipItem(slot) : undefined} />
                <div style={{ fontSize: 11 }}>
                  <div style={{ color: colors.inkDim }}>{SLOT_LABEL[slot]}</div>
                  <div style={{ color: item ? rarityHex(item) : colors.inkDim }}>
                    {item ? item.name : '—'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Stats */}
        <div style={{ width: 130 }}>
          <div style={{ color: colors.inkDim, fontSize: 11, marginBottom: 4 }}>STATS</div>
          {STAT_LABEL.map(([k, label]) => (
            <Stat key={k} label={label} value={String(s[k as keyof typeof s])} />
          ))}
          <div style={{ height: 6 }} />
          <Stat label="Health" value={String(s.maxHP)} />
          <Stat label="Attack Pwr" value={String(s.attackPower)} />
          <Stat label="Spell Pwr" value={String(s.spellPower)} />
          <Stat label="Crit" value={`${(s.critChance * 100).toFixed(1)}%`} />
          <Stat label="Armor" value={String(s.armor)} />
        </div>

        {/* Bag */}
        <div style={{ flex: 1 }}>
          <div style={{ color: colors.inkDim, fontSize: 11, marginBottom: 4 }}>
            BAGS ({inv.bag.length}/{inv.bagSize}) · left-click equip · right-click sell
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 52px)', gap: 4 }}>
            {Array.from({ length: inv.bagSize }).map((_, i) => {
              const stack = inv.bag[i];
              return (
                <ItemCell
                  key={i}
                  item={stack?.item}
                  onClick={stack ? () => cmd?.equipItem(i) : undefined}
                  onContext={stack ? () => cmd?.sellItem(i) : undefined}
                />
              );
            })}
          </div>
        </div>
      </div>

      <MountSection
        mount={mount}
        onBuy={() => cmd?.buyMount()}
        onToggle={() => cmd?.toggleMount()}
        onSelect={(id) => cmd?.selectMount(id)}
      />
    </div>
  );
}

function MountSection({
  mount,
  onBuy,
  onToggle,
  onSelect,
}: {
  mount: MountUi | null;
  onBuy: () => void;
  onToggle: () => void;
  onSelect: (id: string) => void;
}): JSX.Element | null {
  if (!mount) return null;
  return (
    <div style={{ marginTop: 12, borderTop: `1px solid ${colors.panelBorder}`, paddingTop: 8 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: mount.ownsAny ? 6 : 0,
        }}
      >
        <span style={{ color: colors.inkDim, fontSize: 11 }}>
          MOUNT{' '}
          <span style={{ color: mount.mounted ? colors.gold : colors.inkDim }}>
            {mount.mounted ? '· riding' : mount.ownsAny ? '· on foot' : ''}
          </span>
        </span>
        {mount.ownsAny ? (
          <button
            onClick={onToggle}
            style={{
              background: '#3a2c1e',
              border: `1px solid ${colors.gold}`,
              borderRadius: 5,
              color: colors.gold,
              cursor: 'pointer',
              fontSize: 11,
              padding: '3px 10px',
            }}
          >
            {mount.mounted ? 'Dismount (G)' : 'Ride (G)'}
          </button>
        ) : (
          <button
            disabled={!mount.canBuy}
            onClick={onBuy}
            title={`Requires level ${mount.reqLevel}`}
            style={{
              background: mount.canBuy ? '#3a2c1e' : 'transparent',
              border: `1px solid ${mount.canBuy ? colors.gold : colors.panelBorder}`,
              borderRadius: 5,
              color: mount.canBuy ? colors.gold : colors.inkDim,
              cursor: mount.canBuy ? 'pointer' : 'not-allowed',
              fontSize: 11,
              padding: '3px 10px',
            }}
          >
            Buy {mount.baseName} · {mount.buyHint}
          </button>
        )}
      </div>
      {mount.owned.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {mount.owned.map((m) => (
            <button
              key={m.id}
              onClick={() => onSelect(m.id)}
              title={m.description}
              style={{
                background: m.active ? '#3a2c1e' : '#1c1610',
                border: `1px solid ${m.active ? colors.gold : colors.panelBorder}`,
                borderRadius: 5,
                color: m.active ? colors.gold : colors.ink,
                cursor: 'pointer',
                fontSize: 11,
                padding: '2px 8px',
              }}
            >
              {m.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div
      style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}
    >
      <span style={{ color: colors.inkDim }}>{label}</span>
      <b>{value}</b>
    </div>
  );
}
