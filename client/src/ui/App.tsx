import { useEffect, useRef, useState } from 'react';
import type { AccountSave, CharacterSave, SaveGame } from '@pathlands/shared';
import { Game } from '../game/game.js';
import { useStore } from '../game/store.js';
import { upsertCharacterAndAccount } from '../platform/saveStore.js';

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
import { Onboarding } from './Onboarding.js';

export function App(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [entry, setEntry] = useState<{
    character: CharacterSave;
    account: AccountSave;
    settings: Settings;
  } | null>(null);
  const ready = useStore((s) => s.ready);
  const showDev = useStore((s) => s.showDev);
  const showMap = useStore((s) => s.showMap);

  useEffect(() => {
    if (!entry || !canvasRef.current || gameRef.current) return;
    // Seed the store from the saved settings before the game reads them.
    const st = useStore.getState();
    st.setSnapshot({ viewDistance: entry.settings.viewDistance });
    st.setKeybinds(entry.settings.keybinds);
    st.setMasterVolume(entry.settings.masterVolume);
    const game = new Game(canvasRef.current, entry.character, entry.account);
    gameRef.current = game;

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
  }, [entry]);

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
        {ready && <Dialogue />}
        {ready && showDev && <DevOverlay />}
        {ready && showMap && <DebugMap />}
      </div>
      {!ready && <LoadingScreen />}
    </div>
  );
}
