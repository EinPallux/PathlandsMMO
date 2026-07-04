// Zustand store bridging the imperative game loop to the React overlay UI.
// The game pushes a throttled snapshot; UI panels subscribe to slices. UI actions
// call back into the game via the registered command handlers.

import { create } from 'zustand';
import { CharacterClass } from '@pathlands/shared';

export interface GameCommands {
  teleport(x: number, z: number): void;
  setClass(cls: CharacterClass): void;
  setViewDistance(chunks: number): void;
  toggleFreeFly(): void;
  setDayNightSpeed(speed: number): void;
  respawn(): void;
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

  freeFly: boolean;
  showMap: boolean;
  showDev: boolean;
  viewDistance: number;
  selectedClass: CharacterClass;

  commands: GameCommands | null;

  setSnapshot: (s: Partial<UiState>) => void;
  setReady: (ready: boolean) => void;
  toggleMap: () => void;
  toggleDev: () => void;
  setSelectedClass: (cls: CharacterClass) => void;
  setCommands: (c: GameCommands) => void;
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

  freeFly: false,
  showMap: false,
  showDev: true,
  viewDistance: 7,
  selectedClass: CharacterClass.Warrior,

  commands: null,

  setSnapshot: (s) => set(s),
  setReady: (ready) => set({ ready }),
  toggleMap: () => set((st) => ({ showMap: !st.showMap })),
  toggleDev: () => set((st) => ({ showDev: !st.showDev })),
  setSelectedClass: (selectedClass) => set({ selectedClass }),
  setCommands: (commands) => set({ commands }),
}));
