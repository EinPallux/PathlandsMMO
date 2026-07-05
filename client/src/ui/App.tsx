import { useEffect, useRef, useState } from 'react';
import type { CharacterSave } from '@pathlands/shared';
import { Game } from '../game/game.js';
import { useStore } from '../game/store.js';
import { upsertCharacter } from '../platform/saveStore.js';
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
import { Onboarding } from './Onboarding.js';

export function App(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [character, setCharacter] = useState<CharacterSave | null>(null);
  const ready = useStore((s) => s.ready);
  const showDev = useStore((s) => s.showDev);
  const showMap = useStore((s) => s.showMap);

  useEffect(() => {
    if (!character || !canvasRef.current || gameRef.current) return;
    const game = new Game(canvasRef.current, character);
    gameRef.current = game;

    const save = (): void => {
      const snap = game.snapshotCharacter();
      if (snap) void upsertCharacter(snap);
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
  }, [character]);

  if (!character) {
    return <Onboarding onEnter={setCharacter} />;
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
        {ready && <Dialogue />}
        {ready && showDev && <DevOverlay />}
        {ready && showMap && <DebugMap />}
      </div>
      {!ready && <LoadingScreen />}
    </div>
  );
}
