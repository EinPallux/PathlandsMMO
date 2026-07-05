// Vendor / general-goods merchant (GDD §6): a proximity "Press E to trade" prompt,
// and a shop with Buy / Sell / Buyback columns. Reads the vendor + inventory slices
// the CombatDirector publishes; buy/sell/buyback go through GameCommands.

import { type ReactNode } from 'react';
import { useStore } from '../game/store.js';
import { RARITY_COLOR, type ItemDef } from '@pathlands/shared';
import { colors, panel } from './theme.js';

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;
const rarityHex = (item: ItemDef): string => hex(RARITY_COLOR[item.rarity] ?? 0x888888);

function itemLine(item: ItemDef): string {
  const parts = [`Item Level ${item.ilvl} · req ${item.reqLevel}`];
  if (item.weapon && item.weapon.dps > 0) parts.push(`${item.weapon.dps.toFixed(1)} dps`);
  if (item.armor) parts.push(`${item.armor} armor`);
  for (const [k, v] of Object.entries(item.stats)) if (v) parts.push(`+${v} ${k}`);
  return parts.join(' · ');
}

function Row({
  item,
  price,
  action,
  afford,
  label,
}: {
  item: ItemDef;
  price: number;
  action: () => void;
  afford: boolean;
  label: string;
}): JSX.Element {
  return (
    <button
      onClick={action}
      disabled={!afford}
      title={itemLine(item)}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        marginTop: 4,
        background: '#241a11',
        border: `1px solid ${colors.panelBorder}`,
        borderRadius: 6,
        padding: '5px 8px',
        cursor: afford ? 'pointer' : 'not-allowed',
        fontSize: 12,
        textAlign: 'left',
      }}
    >
      <span style={{ color: rarityHex(item), overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {item.name}
      </span>
      <span style={{ color: afford ? colors.gold : '#8a6a48', whiteSpace: 'nowrap' }}>
        {label} {price}c
      </span>
    </button>
  );
}

function Column({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ color: colors.inkDim, fontSize: 11, marginBottom: 2 }}>{title}</div>
      <div style={{ maxHeight: 300, overflowY: 'auto' }}>{children}</div>
    </div>
  );
}

export function VendorPanel(): JSX.Element | null {
  const vendor = useStore((s) => s.vendor);
  const nearby = useStore((s) => s.nearbyVendor);
  const inv = useStore((s) => s.inventory);
  const cmd = useStore((s) => s.commands);
  const gold = inv?.gold ?? 0;

  // Proximity prompt when a merchant is in reach and the shop is closed.
  if (!vendor) {
    if (!nearby) return null;
    return (
      <div
        style={{
          position: 'absolute',
          bottom: 96,
          left: '50%',
          transform: 'translateX(-50%)',
          ...panel,
          textAlign: 'center',
        }}
      >
        <div style={{ color: colors.gold, fontWeight: 700 }}>{nearby}</div>
        <div style={{ fontSize: 12, color: colors.inkDim }}>
          Press <b style={{ color: colors.ink }}>E</b> to trade
        </div>
      </div>
    );
  }

  const bag = inv?.bag ?? [];

  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 640,
        ...panel,
        pointerEvents: 'auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <b style={{ color: colors.gold, fontSize: 15 }}>{vendor.name}</b>
        <span style={{ color: colors.gold, fontSize: 12 }}>{gold}c</span>
      </div>
      <div style={{ fontSize: 11, color: colors.inkDim, margin: '4px 0 8px' }}>
        Buy wares · sell from your bag (¼ value) · buy back what you sold.
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <Column title="FOR SALE">
          {vendor.stock.map((s, i) => (
            <Row
              key={`${s.item.id}:${i}`}
              item={s.item}
              price={s.price}
              afford={gold >= s.price}
              label="Buy"
              action={() => cmd?.buyItem(i)}
            />
          ))}
        </Column>

        <Column title={`YOUR BAG (${bag.length})`}>
          {bag.length === 0 && (
            <div style={{ color: colors.inkDim, fontSize: 12 }}>Bag is empty.</div>
          )}
          {bag.map((s, i) => {
            const price = Math.max(1, Math.floor((s.item.value / 4) * s.qty));
            return (
              <Row
                key={`${s.item.id}:${i}`}
                item={s.item}
                price={price}
                afford
                label="Sell"
                action={() => cmd?.sellItem(i)}
              />
            );
          })}
        </Column>

        <Column title="BUYBACK">
          {vendor.buyback.length === 0 && (
            <div style={{ color: colors.inkDim, fontSize: 12 }}>Nothing sold yet.</div>
          )}
          {vendor.buyback.map((b, i) => (
            <Row
              key={`${b.item.id}:${i}`}
              item={b.item}
              price={b.price}
              afford={gold >= b.price}
              label="Buy"
              action={() => cmd?.buybackItem(i)}
            />
          ))}
        </Column>
      </div>

      <button
        onClick={() => cmd?.closeVendor()}
        style={{
          marginTop: 10,
          width: '100%',
          background: 'transparent',
          border: `1px solid ${colors.panelBorder}`,
          borderRadius: 6,
          color: colors.inkDim,
          padding: '6px',
          cursor: 'pointer',
        }}
      >
        Close (Esc)
      </button>
    </div>
  );
}
