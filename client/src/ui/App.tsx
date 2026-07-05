import { useEffect, useRef } from 'react';
import { Game } from '../game/game.js';
import { useStore } from '../game/store.js';
import { LoadingScreen } from './LoadingScreen.js';
import { Hud } from './Hud.js';
import { DevOverlay } from './DevOverlay.js';
import { DebugMap } from './DebugMap.js';
import { Nameplates } from './Nameplates.js';
import { Dialogue } from './Dialogue.js';

export function App(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const ready = useStore((s) => s.ready);
  const showDev = useStore((s) => s.showDev);
  const showMap = useStore((s) => s.showMap);

  useEffect(() => {
    if (!canvasRef.current || gameRef.current) return;
    gameRef.current = new Game(canvasRef.current);
    return () => {
      gameRef.current?.dispose();
      gameRef.current = null;
    };
  }, []);

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <canvas id="game-canvas" ref={canvasRef} />
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {ready && <Nameplates />}
        {ready && <Hud />}
        {ready && <Dialogue />}
        {ready && showDev && <DevOverlay />}
        {ready && showMap && <DebugMap />}
      </div>
      {!ready && <LoadingScreen />}
    </div>
  );
}
