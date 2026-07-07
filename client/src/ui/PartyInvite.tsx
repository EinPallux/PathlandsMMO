// Party-invite toast (Phase 6 §Social). When another player invites us, a small prompt
// appears above the hotbar with Accept / Decline. Acting sends the choice to the server and
// clears the prompt locally; a forming party (partyState) also clears it via the store. It
// renders nothing when there is no pending invite.

import { useStore } from '../game/store.js';
import { colors, panel, button, buttonActive } from './theme.js';

export function PartyInvite(): JSX.Element | null {
  const invite = useStore((s) => s.partyInvite);
  const commands = useStore((s) => s.commands);
  const setPartyInvite = useStore((s) => s.setPartyInvite);
  if (invite === null) return null;

  const accept = (): void => {
    commands?.partyAccept();
    setPartyInvite(null);
  };
  const decline = (): void => {
    commands?.partyDecline();
    setPartyInvite(null);
  };

  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 132,
        transform: 'translateX(-50%)',
        ...panel,
        padding: '12px 16px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
        pointerEvents: 'auto',
      }}
    >
      <div style={{ fontSize: 14, textAlign: 'center' }}>
        <span style={{ color: colors.gold, fontWeight: 700 }}>{invite.fromName}</span>
        <span style={{ color: colors.ink }}> invites you to a party.</span>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" style={buttonActive} onClick={accept}>
          Accept
        </button>
        <button type="button" style={button} onClick={decline}>
          Decline
        </button>
      </div>
    </div>
  );
}
