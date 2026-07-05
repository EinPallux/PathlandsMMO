// Zustand store bridging the imperative game loop to the React overlay UI.
// The game pushes a throttled snapshot; UI panels subscribe to slices. UI actions
// call back into the game via the registered command handlers.

import { create } from 'zustand';
import { CharacterClass, type ItemDef, type ItemStackSave } from '@pathlands/shared';

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
  /** Quest-giver indicator (GDD §8): available "!", ready "?" gold, in-progress "?" grey. */
  indicator?: 'available' | 'turnin' | 'progress';
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

export interface CharStats {
  might: number;
  agility: number;
  intellect: number;
  spirit: number;
  stamina: number;
  maxHP: number;
  attackPower: number;
  spellPower: number;
  critChance: number;
  armor: number;
}

export interface InventoryUi {
  gold: number;
  bag: ItemStackSave[];
  bagSize: number;
  equipment: Record<string, ItemDef>;
  stats: CharStats;
}

export interface WaystoneUi {
  /** Name of the Waystone within reach, or null. */
  nearbyName: string | null;
  /** Whether the nearby Waystone is not yet attuned. */
  nearbyNew: boolean;
  /** Whether the player is standing at any Waystone (can travel). */
  atWaystone: boolean;
  /** Activated Waystones + the fee to travel there from here (0 = current/none). */
  discovered: Array<{ id: string; name: string; fee: number }>;
}

export interface DialogueState {
  name: string;
  lines: string[];
  index: number;
}

export interface VendorEntry {
  item: ItemDef;
  price: number;
}

export interface VendorUi {
  /** Merchant name (title bar). */
  name: string;
  /** Wares for sale (unlimited quantity), with buy prices. */
  stock: VendorEntry[];
  /** Recently sold items, buyable back at the sold price. */
  buyback: VendorEntry[];
}

export interface QuestObjectiveUi {
  label: string;
  count: number;
  need: number;
  done: boolean;
}

export interface QuestEntryUi {
  id: string;
  name: string;
  chapter: number | null;
  pinned: boolean;
  complete: boolean;
  objectives: QuestObjectiveUi[];
}

export interface QuestDialogUi {
  giver: string;
  giverId: string;
  offers: Array<{
    id: string;
    name: string;
    intro: string;
    chapter: number | null;
    reward: string;
  }>;
  turnIns: Array<{ id: string; name: string; complete: string; reward: string; choices: string[] }>;
  active: string[];
}

export interface QuestToast {
  id: number;
  text: string;
  kind: 'accept' | 'progress' | 'complete';
}

export interface GatherStatus {
  /** Channel label, e.g. "Mining…" / "Fishing…" / "A bite!". */
  label: string;
  /** Progress 0..1 (or 1 during a fishing bite). */
  frac: number;
  /** Action hint, e.g. "Press E to reel in!". */
  hint: string;
}

export interface ProfessionsUi {
  skills: Array<{ id: string; name: string; skill: number; max: number }>;
  materials: Array<{ id: string; name: string; qty: number }>;
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
  /** Inventory: equip a bag item, unequip a slot, sell a bag item. */
  equipItem(index: number): void;
  unequipItem(slot: string): void;
  sellItem(index: number): void;
  /** Vendors: buy a stock item, buy back a sold item, close the shop. */
  buyItem(index: number): void;
  buybackItem(index: number): void;
  closeVendor(): void;
  /** Quests: accept, turn in (with a reward-choice index), abandon, pin, close dialog. */
  acceptQuest(id: string): void;
  turnInQuest(id: string, choiceIndex: number): void;
  abandonQuest(id: string): void;
  pinQuest(id: string, pinned: boolean): void;
  closeQuestDialog(): void;
  /** Waystones: attune/open the nearby stone, fast-travel to a discovered one. */
  interactWaystone(): void;
  travelTo(id: string): void;
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
  inventory: InventoryUi | null;
  showChar: boolean;
  waystone: WaystoneUi | null;
  showTravel: boolean;
  vendor: VendorUi | null;
  /** Name of a merchant within trade range (drives the "Press E to trade" prompt). */
  nearbyVendor: string | null;

  questLog: QuestEntryUi[] | null;
  questTracker: QuestEntryUi[];
  questDialog: QuestDialogUi | null;
  questToasts: QuestToast[];
  showQuestLog: boolean;

  nearbyNode: { label: string; kind: string } | null;
  gatherStatus: GatherStatus | null;
  professions: ProfessionsUi | null;
  showProfessions: boolean;

  setSnapshot: (s: Partial<UiState>) => void;
  setReady: (ready: boolean) => void;
  toggleMap: () => void;
  toggleDev: () => void;
  toggleChar: () => void;
  setSelectedClass: (cls: CharacterClass) => void;
  setCommands: (c: GameCommands) => void;
  setNameplates: (n: Nameplate[]) => void;
  setCombat: (c: CombatUi) => void;
  setFloaters: (f: Floater[]) => void;
  setInventory: (i: InventoryUi) => void;
  setWaystone: (w: WaystoneUi) => void;
  setVendor: (v: VendorUi | null) => void;
  setNearbyVendor: (name: string | null) => void;
  setQuestLog: (q: QuestEntryUi[]) => void;
  setQuestTracker: (q: QuestEntryUi[]) => void;
  setQuestDialog: (q: QuestDialogUi | null) => void;
  setQuestToasts: (t: QuestToast[]) => void;
  toggleQuestLog: () => void;
  setNearbyNode: (n: { label: string; kind: string } | null) => void;
  setGatherStatus: (g: GatherStatus | null) => void;
  setProfessions: (p: ProfessionsUi) => void;
  toggleProfessions: () => void;
  openTravel: () => void;
  closeTravel: () => void;
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
  inventory: null,
  showChar: false,
  waystone: null,
  showTravel: false,
  vendor: null,
  nearbyVendor: null,

  questLog: null,
  questTracker: [],
  questDialog: null,
  questToasts: [],
  showQuestLog: false,

  nearbyNode: null,
  gatherStatus: null,
  professions: null,
  showProfessions: false,

  setSnapshot: (s) => set(s),
  setReady: (ready) => set({ ready }),
  toggleMap: () => set((st) => ({ showMap: !st.showMap })),
  toggleDev: () => set((st) => ({ showDev: !st.showDev })),
  toggleChar: () => set((st) => ({ showChar: !st.showChar })),
  setSelectedClass: (selectedClass) => set({ selectedClass }),
  setCommands: (commands) => set({ commands }),
  setNameplates: (nameplates) => set({ nameplates }),
  setCombat: (combat) => set({ combat }),
  setFloaters: (floaters) => set({ floaters }),
  setInventory: (inventory) => set({ inventory }),
  setWaystone: (waystone) => set({ waystone }),
  setVendor: (vendor) => set({ vendor }),
  setNearbyVendor: (nearbyVendor) => set({ nearbyVendor }),
  setQuestLog: (questLog) => set({ questLog }),
  setQuestTracker: (questTracker) => set({ questTracker }),
  setQuestDialog: (questDialog) => set({ questDialog }),
  setQuestToasts: (questToasts) => set({ questToasts }),
  toggleQuestLog: () => set((st) => ({ showQuestLog: !st.showQuestLog })),
  setNearbyNode: (nearbyNode) => set({ nearbyNode }),
  setGatherStatus: (gatherStatus) => set({ gatherStatus }),
  setProfessions: (professions) => set({ professions }),
  toggleProfessions: () => set((st) => ({ showProfessions: !st.showProfessions })),
  openTravel: () => set({ showTravel: true }),
  closeTravel: () => set({ showTravel: false }),
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
