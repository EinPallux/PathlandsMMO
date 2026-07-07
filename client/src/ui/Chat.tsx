// Multiplayer chat panel (Phase 6). A scrollback log at the bottom-left plus an input
// that opens on Enter. It renders nothing in single-player (store.net === null), so the
// standalone build is visually unchanged. While the input is focused the game suspends
// keyboard gameplay (store.chatTyping) so typing WASD never walks the character.

import { useEffect, useRef, useState } from 'react';
import { useStore } from '../game/store.js';
import { emoteCommands, findEmote, MAX_CHAT_LEN } from '@pathlands/shared';
import { colors } from './theme.js';

const LOG_WIDTH = 340;

export function Chat(): JSX.Element | null {
  const net = useStore((s) => s.net);
  const chat = useStore((s) => s.chat);
  const commands = useStore((s) => s.commands);
  const pushChat = useStore((s) => s.pushChat);
  const setChatTyping = useStore((s) => s.setChatTyping);
  const [active, setActive] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const hasServer = net !== null;

  // Enter opens the chat input (unless another text field already has focus). Bound at
  // the window level so it works while the canvas holds pointer-lock. Inert in
  // single-player: without this guard, Enter would set `chatTyping` and freeze gameplay
  // keyboard input with no visible field to escape from (this component renders null).
  useEffect(() => {
    if (!hasServer) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
      const el = document.activeElement as HTMLElement | null;
      const editing =
        el !== null &&
        (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (!editing) {
        e.preventDefault();
        setActive(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasServer]);

  // Focus the field when opening; tell the game to suspend gameplay input while typing.
  // Releasing pointer-lock frees the cursor for the field and stops mouse-look from
  // accumulating a delta that would snap the camera the moment typing ends.
  useEffect(() => {
    const typing = hasServer && active;
    setChatTyping(typing);
    if (typing) {
      document.exitPointerLock?.();
      inputRef.current?.focus();
    }
    return () => setChatTyping(false);
  }, [active, hasServer, setChatTyping]);

  // Keep the log pinned to the newest line.
  useEffect(() => {
    const el = logRef.current;
    if (el !== null) el.scrollTop = el.scrollHeight;
  }, [chat, active]);

  if (net === null) return null; // single-player — no chat

  const submit = (e: React.FormEvent): void => {
    e.preventDefault();
    const text = draft.trim();
    if (text.length > 0) send(text);
    setDraft('');
    setActive(false);
    inputRef.current?.blur();
  };

  // Route a line: a `/command` is a party action, an emote, or the help listing. Party +
  // emote commands are handled locally (instant feedback, never a raw command hits the wire);
  // a valid emote or plain say line goes out (the server re-validates + formats emotes).
  const send = (text: string): void => {
    const capped = text.slice(0, MAX_CHAT_LEN);
    if (capped.startsWith('/')) {
      const raw = capped.slice(1).split(/\s+/)[0] ?? '';
      const cmd = raw.toLowerCase();
      // Party: /invite <name> (alias /pinvite) forms/adds; /pleave drops you from the party.
      if (cmd === 'invite' || cmd === 'pinvite') {
        const name = capped.slice(1 + raw.length).trim();
        if (name.length === 0) {
          pushChat({
            from: '',
            text: 'Usage: /invite <player name>',
            self: false,
            system: true,
            emote: false,
          });
          return;
        }
        commands?.partyInvite(name);
        return;
      }
      if (cmd === 'pleave') {
        commands?.partyLeave();
        return;
      }
      if (cmd === 'emote' || cmd === 'emotes' || cmd === 'help') {
        pushChat({
          from: '',
          text: `Party: /invite <name> · /pleave  ·  Emotes: ${emoteCommands()
            .map((c) => '/' + c)
            .join('  ')}`,
          self: false,
          system: true,
          emote: false,
        });
        return;
      }
      if (findEmote(cmd) === null) {
        pushChat({
          from: '',
          text: `Unknown command "/${cmd}". Type /help for the list.`,
          self: false,
          system: true,
          emote: false,
        });
        return;
      }
    }
    commands?.sendChat(capped);
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setDraft('');
      setActive(false);
      inputRef.current?.blur();
    }
  };

  // Idle (not typing): show only the last few lines, dimmed, and let clicks pass through.
  const visible = active ? chat : chat.slice(-6);

  return (
    <div
      style={{
        position: 'absolute',
        left: 12,
        bottom: 12,
        width: LOG_WIDTH,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        pointerEvents: active ? 'auto' : 'none',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {visible.length > 0 && (
        <div
          ref={logRef}
          style={{
            maxHeight: active ? 220 : 130,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            padding: active ? '8px 10px' : '2px 4px',
            borderRadius: 8,
            background: active ? colors.panelBg : 'transparent',
            border: active ? `1px solid ${colors.panelBorder}` : '1px solid transparent',
            backdropFilter: active ? 'blur(3px)' : 'none',
            transition: 'background 120ms ease',
            opacity: active ? 1 : 0.85,
          }}
        >
          {visible.map((line) => (
            <div key={line.key} style={{ fontSize: 13, lineHeight: 1.45, wordBreak: 'break-word' }}>
              {line.system ? (
                <span style={{ color: colors.gold, fontStyle: 'italic' }}>{line.text}</span>
              ) : line.emote ? (
                // Emote action line: "Alia waves." — italic, no colon, one colour.
                <span
                  style={{
                    color: line.self ? colors.accent : '#d9b45a',
                    fontStyle: 'italic',
                    textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                  }}
                >
                  {line.from} {line.text}
                </span>
              ) : (
                <>
                  <span
                    style={{
                      color: line.self ? colors.accent : colors.gold,
                      fontWeight: 600,
                      textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                    }}
                  >
                    {line.from}:{' '}
                  </span>
                  <span style={{ color: colors.ink, textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
                    {line.text}
                  </span>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {active && (
        <form onSubmit={submit}>
          <input
            ref={inputRef}
            value={draft}
            maxLength={MAX_CHAT_LEN}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={() => setActive(false)}
            placeholder="Say something…  (/help · Enter to send, Esc to cancel)"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '8px 11px',
              borderRadius: 6,
              border: `1px solid ${colors.panelBorder}`,
              background: 'rgba(0,0,0,0.55)',
              color: colors.ink,
              fontSize: 14,
              outline: 'none',
            }}
          />
        </form>
      )}
    </div>
  );
}
