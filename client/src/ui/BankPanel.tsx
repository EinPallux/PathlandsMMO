// The Waymeet Bank (B): a two-tab panel — the Vault (shared item storage: move
// stacks between bag and vault) and Mail (letters from world NPCs with claimable
// gold gifts). Reads the bank/mail/inventory slices the CombatDirector publishes;
// actions go through GameCommands. Building-gating (visit the bank) is a later pass.

import { useState } from 'react';
import { useStore } from '../game/store.js';
import { RARITY_COLOR, type ItemDef } from '@pathlands/shared';
import { colors, panel } from './theme.js';
import { useHoverTip, TooltipPortal, ItemTooltipCard } from './Tooltip.js';

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;
const rarityHex = (item: ItemDef): string => hex(RARITY_COLOR[item.rarity] ?? 0x888888);

function Cell({
  item,
  qty,
  onClick,
}: {
  item?: ItemDef;
  qty?: number;
  onClick?: () => void;
}): JSX.Element {
  const { pos, handlers } = useHoverTip();
  return (
    <>
      <button
        {...handlers}
        onClick={onClick}
        disabled={!item}
        style={{
          position: 'relative',
          width: 50,
          height: 50,
          borderRadius: 6,
          border: `2px solid ${item ? rarityHex(item) : colors.panelBorder}`,
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
        {item && qty && qty > 1 ? (
          <span
            style={{ position: 'absolute', right: 2, bottom: 1, fontSize: 9, color: colors.gold }}
          >
            {qty}
          </span>
        ) : null}
      </button>
      {item && pos && (
        <TooltipPortal pos={pos}>
          <ItemTooltipCard item={item} />
        </TooltipPortal>
      )}
    </>
  );
}

export function BankPanel(): JSX.Element | null {
  const show = useStore((s) => s.showBank);
  const bank = useStore((s) => s.bank);
  const mail = useStore((s) => s.mail);
  const inv = useStore((s) => s.inventory);
  const cmd = useStore((s) => s.commands);
  const toggle = useStore((s) => s.toggleBank);
  const [tab, setTab] = useState<'vault' | 'mail'>('vault');
  if (!show || !bank) return null;

  const unread = mail?.unread ?? 0;

  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 600,
        maxHeight: '84vh',
        overflowY: 'auto',
        ...panel,
        pointerEvents: 'auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <b style={{ color: colors.gold, fontSize: 15 }}>Waymeet Bank</b>
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

      <div style={{ display: 'flex', gap: 8, margin: '10px 0' }}>
        <TabButton label="Vault" active={tab === 'vault'} onClick={() => setTab('vault')} />
        <TabButton
          label={unread > 0 ? `Mail (${unread})` : 'Mail'}
          active={tab === 'mail'}
          onClick={() => setTab('mail')}
        />
      </div>

      {tab === 'vault' ? (
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ color: colors.inkDim, fontSize: 11, marginBottom: 4 }}>
              VAULT ({bank.items.length}/{bank.size}) · click to withdraw
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 50px)', gap: 4 }}>
              {bank.items.map((stack, i) => (
                <Cell
                  key={i}
                  item={stack.item}
                  qty={stack.qty}
                  onClick={() => cmd?.withdrawItem(i)}
                />
              ))}
              {bank.items.length === 0 && (
                <div style={{ color: colors.inkDim, fontSize: 11 }}>Empty.</div>
              )}
            </div>
          </div>
          <div style={{ width: 1, background: colors.panelBorder }} />
          <div style={{ flex: 1 }}>
            <div style={{ color: colors.inkDim, fontSize: 11, marginBottom: 4 }}>
              BAGS ({inv?.bag.length ?? 0}/{inv?.bagSize ?? 0}) · click to deposit
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 50px)', gap: 4 }}>
              {(inv?.bag ?? []).map((stack, i) => (
                <Cell
                  key={i}
                  item={stack.item}
                  qty={stack.qty}
                  onClick={() => cmd?.depositItem(i)}
                />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div>
          {(mail?.letters ?? []).length === 0 && (
            <div style={{ color: colors.inkDim, fontSize: 12 }}>Your mailbox is empty.</div>
          )}
          {(mail?.letters ?? []).map((m) => (
            <div
              key={m.id}
              style={{
                marginBottom: 8,
                padding: '8px 10px',
                background: '#241a11',
                border: `1px solid ${colors.panelBorder}`,
                borderRadius: 6,
                opacity: m.claimed ? 0.7 : 1,
              }}
            >
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div>
                  <div style={{ color: colors.ink, fontSize: 13 }}>{m.subject}</div>
                  <div style={{ color: colors.inkDim, fontSize: 11 }}>from {m.sender}</div>
                </div>
                {m.gold > 0 &&
                  (m.claimed ? (
                    <span style={{ color: colors.inkDim, fontSize: 11 }}>claimed</span>
                  ) : (
                    <button
                      onClick={() => cmd?.claimMail(m.id)}
                      style={{
                        background: '#3a2c1e',
                        border: `1px solid ${colors.gold}`,
                        borderRadius: 5,
                        color: colors.gold,
                        cursor: 'pointer',
                        fontSize: 11,
                        padding: '3px 10px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Take {m.gold}g
                    </button>
                  ))}
              </div>
              <div style={{ color: colors.inkDim, fontSize: 11, marginTop: 5, lineHeight: 1.4 }}>
                {m.body}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? '#3a2c1e' : 'transparent',
        border: `1px solid ${active ? colors.gold : colors.panelBorder}`,
        borderRadius: 5,
        color: active ? colors.gold : colors.inkDim,
        cursor: 'pointer',
        fontSize: 12,
        padding: '4px 14px',
      }}
    >
      {label}
    </button>
  );
}
