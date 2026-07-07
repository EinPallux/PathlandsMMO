// The "Press E to pick up" prompt for the nearest dropped item in reach. Ground items are how
// players trade now (bank/mail/trade were scrapped): drop a stack, someone walks over and grabs
// it. Reads the `nearbyLoot` slice the game loop maintains; the E key is handled in game.ts.

import { useStore } from '../game/store.js';
import { colors, panel } from './theme.js';

export function GroundLootPrompt(): JSX.Element | null {
  const loot = useStore((s) => s.nearbyLoot);
  // Hidden while any blocking panel is open (the game loop also suppresses the slice then).
  const busy = useStore((s) => s.dialogue !== null || s.vendor !== null || s.showTravel);
  if (!loot || busy) return null;
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 128,
        left: '50%',
        transform: 'translateX(-50%)',
        ...panel,
        textAlign: 'center',
        pointerEvents: 'none',
      }}
    >
      <div style={{ color: colors.gold, fontWeight: 700 }}>{loot.name}</div>
      <div style={{ fontSize: 12, color: colors.inkDim }}>
        Press <b style={{ color: colors.ink }}>E</b> to pick up
      </div>
    </div>
  );
}
