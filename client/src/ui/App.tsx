import { useEffect, useRef, useState } from 'react';
import type { AccountSave, CharacterSave, SaveGame } from '@pathlands/shared';
import { Game } from '../game/game.js';
import { useStore } from '../game/store.js';
import { upsertCharacterAndAccount } from '../platform/saveStore.js';
import { audio } from '../platform/audio.js';

type Settings = SaveGame['settings'];
import { LoadingScreen } from './LoadingScreen.js';
import { Hud } from './Hud.js';
import { DevOverlay } from './DevOverlay.js';
import { DebugMap } from './DebugMap.js';
import { Nameplates } from './Nameplates.js';
import { Dialogue } from './Dialogue.js';
import { Minimap } from './Minimap.js';
import { CombatHud } from './CombatHud.js';
import { CharacterPanel } from './CharacterPanel.js';
import { WaystonePanel } from './WaystonePanel.js';
import { VendorPanel } from './VendorPanel.js';
import { QuestDialog } from './QuestDialog.js';
import { QuestLogPanel } from './QuestLogPanel.js';
import { QuestTracker } from './QuestTracker.js';
import { QuestToasts } from './QuestToasts.js';
import { GatherPrompt } from './GatherPrompt.js';
import { ProfessionsPanel } from './ProfessionsPanel.js';
import { CraftingPanel } from './CraftingPanel.js';
import { Journal } from './Journal.js';
import { BankPanel } from './BankPanel.js';
import { BountyBoard } from './BountyBoard.js';
import { SettingsPanel } from './SettingsPanel.js';
import { FirstTimeTips } from './FirstTimeTips.js';
import { NetStatusHud } from './NetStatusHud.js';
import { Chat } from './Chat.js';
import { PartyPanel } from './PartyPanel.js';
import { PartyInvite } from './PartyInvite.js';
import { LoginScreen } from './LoginScreen.js';
import { Onboarding } from './Onboarding.js';
import { putCharacter } from '../net/authClient.js';
import { resolveServerUrl } from '../net/serverUrl.js';

// Pathlands is MMO-only: the client always connects to an authoritative server (default:
// the page's own origin — see resolveServerUrl). Accounts/login always gate the world.
const SERVER_URL = resolveServerUrl();
const TOKEN_KEY = 'pathlands.token';

export function App(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [entry, setEntry] = useState<{
    character: CharacterSave;
    account: AccountSave;
    settings: Settings;
  } | null>(null);
  // Account session token: restored from localStorage, cleared on logout / server
  // rejection. Required — the world is always gated behind a logged-in account.
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const ready = useStore((s) => s.ready);
  const showDev = useStore((s) => s.showDev);
  const showMap = useStore((s) => s.showMap);
  const contextLost = useStore((s) => s.contextLost);
  const masterVolume = useStore((s) => s.masterVolume);

  // Keep the audio master bus in sync with the Settings slider (and its seed on boot).
  useEffect(() => {
    audio.setMasterVolume(masterVolume);
  }, [masterVolume]);

  // Login/character-select bed until a character is entered, then the in-game bed.
  // (Autoplay policy: playback starts on the first click/keypress — see audio.ts.)
  useEffect(() => {
    audio.playMusic(entry ? 'game' : 'login');
  }, [entry]);

  useEffect(() => {
    if (!entry || !canvasRef.current || gameRef.current) return;
    // Seed the store from the saved settings before the game reads them.
    const st = useStore.getState();
    st.setSnapshot({ viewDistance: entry.settings.viewDistance });
    st.setKeybinds(entry.settings.keybinds);
    st.setMasterVolume(entry.settings.masterVolume);
    st.setGraphics({
      shadows: entry.settings.shadows,
      vfxDensity: entry.settings.vfxDensity,
      resolutionScale: entry.settings.resolutionScale,
    });
    // On auth failure the server rejected our token — drop it and return to login.
    const onAuthError = (): void => {
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
      setEntry(null);
    };
    const game = new Game(canvasRef.current, entry.character, entry.account, token, onAuthError);
    gameRef.current = game;

    // Best-effort cloud-save migration: hand the local character to the account so the
    // server can restore its position on the next login.
    if (token !== null) {
      void putCharacter(SERVER_URL, token, entry.character);
    }

    const save = (): void => {
      const snap = game.snapshotCharacter();
      // Character + account persist together (Path Points/perks are account-wide).
      if (snap) void upsertCharacterAndAccount(snap, game.snapshotAccount());
    };
    const autosave = window.setInterval(save, 30_000);
    window.addEventListener('beforeunload', save);

    return () => {
      window.clearInterval(autosave);
      window.removeEventListener('beforeunload', save);
      save();
      game.dispose();
      gameRef.current = null;
    };
  }, [entry, token]);

  // MMO-only: gate the whole flow behind account login until we hold a token.
  if (token === null) {
    return (
      <LoginScreen
        serverUrl={SERVER_URL}
        onAuthed={(t) => {
          localStorage.setItem(TOKEN_KEY, t);
          setToken(t);
        }}
      />
    );
  }

  if (!entry) {
    return (
      <Onboarding
        onEnter={(character, account, settings) => setEntry({ character, account, settings })}
      />
    );
  }

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <canvas id="game-canvas" ref={canvasRef} />
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {ready && <Nameplates />}
        {ready && <Minimap />}
        {ready && <Hud />}
        {ready && <CombatHud />}
        {ready && <CharacterPanel />}
        {ready && <WaystonePanel />}
        {ready && <VendorPanel />}
        {ready && <QuestTracker />}
        {ready && <QuestToasts />}
        {ready && <QuestDialog />}
        {ready && <QuestLogPanel />}
        {ready && <GatherPrompt />}
        {ready && <ProfessionsPanel />}
        {ready && <CraftingPanel />}
        {ready && <Journal />}
        {ready && <BankPanel />}
        {ready && <BountyBoard />}
        {ready && <SettingsPanel />}
        {ready && <FirstTimeTips />}
        {ready && <NetStatusHud />}
        {ready && <PartyPanel />}
        {ready && <PartyInvite />}
        {ready && <Chat />}
        {ready && <Dialogue />}
        {ready && showDev && <DevOverlay />}
        {ready && showMap && <DebugMap />}
      </div>
      {!ready && <LoadingScreen />}
      {contextLost && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            background: 'rgba(8, 6, 4, 0.82)',
            color: '#f2ead9',
            fontFamily: 'system-ui, sans-serif',
            textAlign: 'center',
            pointerEvents: 'auto',
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 700, color: '#c9a23f' }}>Rendering paused</div>
          <div style={{ fontSize: 13, color: '#b8a888', maxWidth: 360, lineHeight: 1.5 }}>
            The graphics context was lost (a GPU or driver hiccup). The game will resume
            automatically once it&apos;s restored — your progress is safe.
          </div>
        </div>
      )}
    </div>
  );
}
