// Zustand store bridging the imperative game loop to the React overlay UI.
// The game pushes a throttled snapshot; UI panels subscribe to slices. UI actions
// call back into the game via the registered command handlers.

import { create } from 'zustand';
import { CharacterClass } from '@pathlands/shared';

export interface Nameplate {
  id: string;
  name: string;
  sx: number;
  sy: number;
  /** Enemy nameplates carry combat info; NPC plates leave these undefined. */
  level?: number;
  hpFrac?: number;
  hostile?: boolean;
  targeted?: boolean;
}

export interface HotbarSlot {
  skillId: string;
  name: string;
  cost: number;
  /** Off cooldown + affordable. */
  ready: boolean;
  /** Remaining cooldown as a fraction 0..1 (0 = ready). */
  cooldownFrac: number;
}

export interface TargetInfo {
  id: string;
  name: string;
  level: number;
  hp: number;
  maxHP: number;
  hostile: boolean;
  castSkill: string | null;
  castFrac: number;
}

export interface PlayerCombat {
  className: string;
  level: number;
  xp: number;
  xpForLevel: number;
  hp: number;
  maxHP: number;
  resource: number;
  maxResource: number;
  resourceKind: string;
  alive: boolean;
}

export interface CombatUi {
  player: PlayerCombat;
  target: TargetInfo | null;
  hotbar: HotbarSlot[];
  autoAttack: boolean;
}

export interface Floater {
  id: number;
  sx: number;
  sy: number;
  text: string;
  kind: 'damage' | 'heal' | 'crit' | 'xp' | 'miss';
}

export interface DialogueState {
  name: string;
  lines: string[];
  index: number;
}

export type WeatherKind = 'clear' | 'overcast' | 'rain';

export interface GameCommands {
  teleport(x: number, z: number): void;
  setClass(cls: CharacterClass): void;
  setViewDistance(chunks: number): void;
  toggleFreeFly(): void;
  setDayNightSpeed(speed: number): void;
  setWeather(w: WeatherKind): void;
  respawn(): void;
  /** Combat: cast the hotbar slot (0-based), cycle target, toggle auto-attack. */
  castSlot(slot: number): void;
  cycleTarget(): void;
  toggleAutoAttack(): void;
  releaseSpirit(): void;
}

export interface UiState {
  ready: boolean;
  loadProgress: number; // 0..1

  fps: number;
  drawCalls: number;
  triangles: number;
  chunksLoaded: number;
  chunksPending: number;

  posX: number;
  posY: number;
  posZ: number;
  biome: string;
  moveState: string;
  timeOfDay: number;

  /** Mutable per-frame player transform for the minimap (read imperatively, no re-render). */
  live: { x: number; z: number; yaw: number };

  /** Fog-of-discovery grid (revealed cells), and its dimension. Set once by the game. */
  discovery: Uint8Array | null;
  discoveryN: number;

  freeFly: boolean;
  showMap: boolean;
  showDev: boolean;
  viewDistance: number;
  weather: WeatherKind;
  selectedClass: CharacterClass;

  commands: GameCommands | null;

  nameplates: Nameplate[];
  dialogue: DialogueState | null;

  combat: CombatUi | null;
  floaters: Floater[];

  setSnapshot: (s: Partial<UiState>) => void;
  setReady: (ready: boolean) => void;
  toggleMap: () => void;
  toggleDev: () => void;
  setSelectedClass: (cls: CharacterClass) => void;
  setCommands: (c: GameCommands) => void;
  setNameplates: (n: Nameplate[]) => void;
  setCombat: (c: CombatUi) => void;
  setFloaters: (f: Floater[]) => void;
  openDialogue: (name: string, lines: string[]) => void;
  advanceDialogue: () => void;
  closeDialogue: () => void;
}

export const useStore = create<UiState>((set) => ({
  ready: false,
  loadProgress: 0,

  fps: 0,
  drawCalls: 0,
  triangles: 0,
  chunksLoaded: 0,
  chunksPending: 0,

  posX: 0,
  posY: 0,
  posZ: 0,
  biome: '—',
  moveState: 'idle',
  timeOfDay: 0.36,

  live: { x: 0, z: 0, yaw: 0 },

  discovery: null,
  discoveryN: 0,

  freeFly: false,
  showMap: false,
  showDev: true,
  viewDistance: 7,
  weather: 'clear',
  selectedClass: CharacterClass.Warrior,

  commands: null,

  nameplates: [],
  dialogue: null,

  combat: null,
  floaters: [],

  setSnapshot: (s) => set(s),
  setReady: (ready) => set({ ready }),
  toggleMap: () => set((st) => ({ showMap: !st.showMap })),
  toggleDev: () => set((st) => ({ showDev: !st.showDev })),
  setSelectedClass: (selectedClass) => set({ selectedClass }),
  setCommands: (commands) => set({ commands }),
  setNameplates: (nameplates) => set({ nameplates }),
  setCombat: (combat) => set({ combat }),
  setFloaters: (floaters) => set({ floaters }),
  openDialogue: (name, lines) => set({ dialogue: { name, lines, index: 0 } }),
  advanceDialogue: () =>
    set((st) => {
      if (!st.dialogue) return {};
      const next = st.dialogue.index + 1;
      if (next >= st.dialogue.lines.length) return { dialogue: null };
      return { dialogue: { ...st.dialogue, index: next } };
    }),
  closeDialogue: () => set({ dialogue: null }),
}));
