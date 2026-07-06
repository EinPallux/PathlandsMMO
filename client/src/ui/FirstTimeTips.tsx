// First-time-player tips (Phase 5 UI/UX, GDD §13 onboarding). A short guided
// sequence that teaches movement, targeting, the hotbar, quests, and the panels
// so a blind playtester reaches level 5 without external help (acceptance #1).
// Shown once per browser (localStorage flag), skippable at any step. Tips read the
// live keybind map so they name the player's actual keys after any rebind.

import { useState } from 'react';
import { keyLabel } from '@pathlands/shared';
import { useStore } from '../game/store.js';
import { colors } from './theme.js';

const SEEN_KEY = 'pathlands.introSeen';

function alreadySeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* private mode — the tips simply show again next boot, which is harmless */
  }
}

interface Tip {
  title: string;
  body: (k: Record<string, string>) => string;
}

const TIPS: Tip[] = [
  {
    title: 'Welcome to the Pathlands',
    body: () =>
      'You are a Wayfarer on the Old Paths. A few pointers to get you moving — you can skip these any time.',
  },
  {
    title: 'Moving around',
    body: () => 'Move with W A S D, look with the mouse, jump with Space. Hold Shift to run.',
  },
  {
    title: 'Fighting',
    body: (k) =>
      `Left-click an enemy (or press ${keyLabel(k.cycleTarget ?? 'Tab')}) to target it, then press 1–6 to use your hotbar skills. ${keyLabel(k.toggleAutoAttack ?? 'KeyR')} toggles auto-attack.`,
  },
  {
    title: 'Quests',
    body: (k) =>
      `Villagers with a ! above them have work for you — walk up and press ${keyLabel(k.interact ?? 'KeyE')} to talk. Your active quests track at the top-left; a ? marks where to turn one in.`,
  },
  {
    title: 'Your gear & skills',
    body: (k) =>
      `Open your Character sheet with ${keyLabel(k.toggleChar ?? 'KeyC')} to equip loot, and the Quest log with ${keyLabel(k.toggleQuestLog ?? 'KeyL')}. Drink potions from your hotbar when you're hurt.`,
  },
  {
    title: 'The wider world',
    body: (k) =>
      `Open the map with ${keyLabel(k.toggleMap ?? 'KeyM')}. Attune glowing Waystones (press ${keyLabel(k.interact ?? 'KeyE')}) to unlock fast travel between them. Everything else — professions, the bank, mounts — you'll meet as you go. Press ${keyLabel('Escape')} for Settings.`,
  },
];

export function FirstTimeTips(): JSX.Element | null {
  const ready = useStore((s) => s.ready);
  const keybinds = useStore((s) => s.keybinds);
  const [step, setStep] = useState(0);
  const [dismissed, setDismissed] = useState(alreadySeen);

  if (!ready || dismissed) return null;

  const tip = TIPS[step]!;
  const last = step === TIPS.length - 1;
  const finish = (): void => {
    markSeen();
    setDismissed(true);
  };

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 108,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 440,
        maxWidth: '90vw',
        background: 'rgba(26, 20, 16, 0.94)',
        border: `1px solid ${colors.gold}`,
        borderRadius: 10,
        padding: '14px 16px',
        color: colors.ink,
        boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
        pointerEvents: 'auto',
        backdropFilter: 'blur(3px)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <b style={{ color: colors.gold, fontSize: 15 }}>{tip.title}</b>
        <span style={{ color: colors.inkDim, fontSize: 11 }}>
          {step + 1} / {TIPS.length}
        </span>
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.5, margin: '8px 0 12px', color: colors.ink }}>
        {tip.body(keybinds)}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          onClick={finish}
          style={{
            background: 'transparent',
            border: 'none',
            color: colors.inkDim,
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          Skip tips
        </button>
        <button
          onClick={() => (last ? finish() : setStep((s) => s + 1))}
          style={{
            background: colors.accent,
            border: 'none',
            borderRadius: 6,
            color: '#12200c',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 700,
            padding: '7px 18px',
          }}
        >
          {last ? "Got it — let's go" : 'Next'}
        </button>
      </div>
    </div>
  );
}
