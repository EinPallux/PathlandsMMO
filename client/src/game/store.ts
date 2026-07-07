// Zustand store bridging the imperative game loop to the React overlay UI.
// The game pushes a throttled snapshot; UI panels subscribe to slices. UI actions
// call back into the game via the registered command handlers.

import { create } from 'zustand';
import {
  CharacterClass,
  defaultKeybinds,
  type ItemDef,
  type ItemStackSave,
  type ShadowQuality,
  type VfxDensity,
} from '@pathlands/shared';

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

/** A quest marker to draw on the world map + minimap (world coords). */
export interface QuestMarker {
  x: number;
  z: number;
  /** Giver has a new quest (!), a turn-in (?), an in-progress quest, or an objective area. */
  kind: 'available' | 'turnin' | 'progress' | 'objective';
  label?: string;
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
  skills: Array<{
    id: string;
    name: string;
    skill: number;
    max: number;
    /** Mastery title, unlocked at max skill. */
    mastery: string;
    /** Mastery effect description. */
    masteryDesc: string;
    /** Whether the mastery is active (skill == max). */
    mastered: boolean;
  }>;
  materials: Array<{ id: string; name: string; qty: number }>;
  consumables: Array<{ id: string; name: string; qty: number; effect: string }>;
}

export interface CraftRecipeUi {
  id: string;
  name: string;
  profession: string;
  category: string;
  output: string;
  skillReq: number;
  craftable: boolean;
  inputs: Array<{ name: string; qty: number; have: number }>;
}

export interface CraftingUi {
  recipes: CraftRecipeUi[];
}

export interface JournalUi {
  pathPoints: number;
  deeds: Array<{
    id: string;
    name: string;
    description: string;
    category: string;
    progress: number;
    threshold: number;
    complete: boolean;
    pathPoints: number;
  }>;
  perks: Array<{
    id: string;
    name: string;
    description: string;
    rank: number;
    maxRank: number;
    cost: number;
    canBuy: boolean;
  }>;
}

export interface BankUi {
  size: number;
  items: ItemStackSave[];
}

export interface BountyUi {
  hub: string;
  day: number;
  board: Array<{
    id: string;
    title: string;
    kind: 'kill' | 'gather';
    progress: number;
    count: number;
    gold: number;
    xp: number;
    state: 'available' | 'active' | 'ready' | 'done';
  }>;
  activeCount: number;
}

export interface MailUi {
  letters: Array<{
    id: string;
    sender: string;
    subject: string;
    body: string;
    gold: number;
    claimed: boolean;
  }>;
  /** Letters with an unclaimed gold gift (drives the mail badge). */
  unread: number;
}

export interface MountUi {
  ownsAny: boolean;
  mounted: boolean;
  activeId: string | null;
  reqLevel: number;
  cost: number;
  /** Whether the base Wolf can be bought right now (level + gold met). */
  canBuy: boolean;
  /** Short reason/price line for the buy button. */
  buyHint: string;
  baseName: string;
  owned: Array<{ id: string; name: string; description: string; active: boolean }>;
}

export type WeatherKind = 'clear' | 'overcast' | 'rain';

export interface GameCommands {
  teleport(x: number, z: number): void;
  setClass(cls: CharacterClass): void;
  setViewDistance(chunks: number): void;
  /** Graphics (Phase 5): sun-shadow quality, VFX particle density, resolution scale. */
  setShadows(q: ShadowQuality): void;
  setVfxDensity(d: VfxDensity): void;
  setResolutionScale(scale: number): void;
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
  /** Professions: craft a recipe, drink a consumable. */
  craftRecipe(id: string): void;
  useConsumable(id: string): void;
  /** Meta: buy a rank of a Path perk. */
  buyPerk(id: string): void;
  /** Mounts: buy the Wolf, mount/dismount, pick which owned skin to ride. */
  buyMount(): void;
  toggleMount(): void;
  selectMount(id: string): void;
  /** Bank + mail: deposit a bag item, withdraw a vault item, claim a letter's gift. */
  depositItem(index: number): void;
  withdrawItem(index: number): void;
  claimMail(id: string): void;
  /** Bounties: accept a posted bounty, turn a completed one in. */
  acceptBounty(id: string): void;
  turnInBounty(id: string): void;
  /** Quests: accept, turn in (with a reward-choice index), abandon, pin, close dialog. */
  acceptQuest(id: string): void;
  turnInQuest(id: string, choiceIndex: number): void;
  abandonQuest(id: string): void;
  pinQuest(id: string, pinned: boolean): void;
  closeQuestDialog(): void;
  /** Waystones: attune/open the nearby stone, fast-travel to a discovered one. */
  interactWaystone(): void;
  travelTo(id: string): void;
  /** Multiplayer chat: send a line to the server (no-op in single-player). */
  sendChat(text: string): void;
  /** Whisper a nearby / party player by name (resolved to a session id client-side). */
  whisper(name: string, text: string): void;
  /** Request the online-player roster (`/who`); the reply prints to chat. */
  who(): void;
  /** GM tooling (only sent when the session is a GM): kick/mute/ban/teleport/give by player name. */
  gm(
    action: string,
    target: string,
    opts?: { minutes?: number; x?: number; z?: number; qty?: number },
  ): void;
  /** Party: invite a nearby player by name (resolved to a session id client-side), accept /
   *  decline a pending invite, leave the party, kick a member (leader-only) by session id. */
  partyInvite(name: string): void;
  partyAccept(): void;
  partyDecline(): void;
  partyLeave(): void;
  partyKick(id: string): void;
}

/** One party member as the roster panel renders it (Phase 6 §Social). */
export interface PartyMemberUi {
  id: string;
  name: string;
  cls: string;
  level: number;
}

/** The local player's party. `null` ⇒ solo (the panel is hidden). */
export interface PartyUi {
  /** Session id of the leader (the only member who may kick). */
  leaderId: string;
  /** Our own session id — flags "you" in the list and gates the leader-only controls. */
  selfId: string;
  members: PartyMemberUi[];
}

/** A pending invite awaiting the player's accept/decline (drives the invite toast). */
export interface PartyInviteUi {
  fromId: string;
  fromName: string;
}

/** One party member's live vitals for the ally frames (arrives at broadcast cadence). */
export interface PartyVitalUi {
  hp: number;
  maxHP: number;
  resource: number;
  maxResource: number;
  resourceKind: string;
  dead: boolean;
}

/** Multiplayer connection phase for the HUD indicator (Phase 6). */
export type NetPhase = 'connecting' | 'connected' | 'reconnecting';

/** Connection status the HUD shows; null ⇒ single-player (indicator hidden). */
export interface NetUi {
  phase: NetPhase;
  peers: number;
  latencyMs: number | null;
}

/** One rendered chat line (Phase 6). `self` styles your own lines; `system` is server/UI notices. */
export interface ChatLine {
  /** Stable React key (a UI-only monotonic counter). */
  key: number;
  from: string;
  text: string;
  self: boolean;
  system: boolean;
  /** True when `text` is a third-person emote phrase, rendered `${from} ${text}` (no colon). */
  emote: boolean;
  /** True for a directed whisper — `from` is the other party; rendered `To/From ${from}:`. */
  whisper?: boolean;
}

/** Most recent lines kept in the scrollback (older ones drop off). */
export const CHAT_HISTORY_MAX = 100;

/** UI-only monotonic key source for chat lines (cosmetic; never simulation state). */
let chatKeySeq = 0;

export interface UiState {
  ready: boolean;
  loadProgress: number; // 0..1
  /** WebGL context lost → rendering paused, awaiting GPU restore (Phase 5). */
  contextLost: boolean;
  /** Multiplayer status (Phase 6); null in single-player. Drives the NetStatusHud. */
  net: NetUi | null;
  /** Chat scrollback (Phase 6). Empty in single-player; the Chat panel hides when net is null. */
  chat: ChatLine[];
  /** True while the chat input is focused — the game loop suspends keyboard gameplay input. */
  chatTyping: boolean;
  /** The local player's party (Phase 6 §Social); null ⇒ solo. */
  party: PartyUi | null;
  /** A pending party invite awaiting accept/decline; null ⇒ none. Drives the invite toast. */
  partyInvite: PartyInviteUi | null;
  /** True when this session's account has GM privileges (unlocks the chat GM commands). */
  gm: boolean;
  /** Live vitals of each party member, keyed by session id (Part 20 ally frames). */
  partyVitals: Record<string, PartyVitalUi>;

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
  shadows: ShadowQuality;
  vfxDensity: VfxDensity;
  resolutionScale: number;
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
  questMarkers: QuestMarker[];
  showQuestLog: boolean;

  nearbyNode: { label: string; kind: string } | null;
  gatherStatus: GatherStatus | null;
  professions: ProfessionsUi | null;
  showProfessions: boolean;
  crafting: CraftingUi | null;
  showCrafting: boolean;
  journal: JournalUi | null;
  showJournal: boolean;
  mount: MountUi | null;
  bank: BankUi | null;
  mail: MailUi | null;
  showBank: boolean;
  bounties: BountyUi | null;
  showBounties: boolean;
  /** Rebindable action → KeyboardEvent.code (read live by the game each frame). */
  keybinds: Record<string, string>;
  masterVolume: number;
  showSettings: boolean;

  setSnapshot: (s: Partial<UiState>) => void;
  setReady: (ready: boolean) => void;
  setNet: (n: NetUi | null) => void;
  /** Append a chat line (assigns its key + trims the scrollback). */
  pushChat: (line: Omit<ChatLine, 'key'>) => void;
  /** Set the chat-input-focused flag that gates gameplay keyboard input. */
  setChatTyping: (typing: boolean) => void;
  /** Replace the party roster (empty members ⇒ solo → stored as null, clearing any invite). */
  setParty: (p: PartyUi) => void;
  /** Set (or clear, with null) the pending party invite. */
  setPartyInvite: (i: PartyInviteUi | null) => void;
  /** Set this session's GM privilege (from the welcome). */
  setGm: (gm: boolean) => void;
  /** Replace the party vitals map from a vitals frame (keyed by member session id). */
  setPartyVitals: (vitals: Array<PartyVitalUi & { id: string }>) => void;
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
  setQuestMarkers: (m: QuestMarker[]) => void;
  toggleQuestLog: () => void;
  setNearbyNode: (n: { label: string; kind: string } | null) => void;
  setGatherStatus: (g: GatherStatus | null) => void;
  setProfessions: (p: ProfessionsUi) => void;
  toggleProfessions: () => void;
  setCrafting: (c: CraftingUi) => void;
  toggleCrafting: () => void;
  setJournal: (j: JournalUi) => void;
  toggleJournal: () => void;
  setMount: (m: MountUi) => void;
  setBank: (b: BankUi) => void;
  setMail: (m: MailUi) => void;
  toggleBank: () => void;
  setBounties: (b: BountyUi) => void;
  toggleBounties: () => void;
  setKeybinds: (k: Record<string, string>) => void;
  setMasterVolume: (v: number) => void;
  setGraphics: (g: {
    shadows?: ShadowQuality;
    vfxDensity?: VfxDensity;
    resolutionScale?: number;
  }) => void;
  toggleSettings: () => void;
  openTravel: () => void;
  closeTravel: () => void;
  openDialogue: (name: string, lines: string[]) => void;
  advanceDialogue: () => void;
  closeDialogue: () => void;
}

export const useStore = create<UiState>((set) => ({
  contextLost: false,
  net: null,
  chat: [],
  chatTyping: false,
  party: null,
  partyInvite: null,
  partyVitals: {},
  gm: false,
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
  shadows: 'low',
  vfxDensity: 'full',
  resolutionScale: 1,
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
  questMarkers: [],
  showQuestLog: false,

  nearbyNode: null,
  gatherStatus: null,
  professions: null,
  showProfessions: false,
  crafting: null,
  showCrafting: false,
  journal: null,
  showJournal: false,
  mount: null,
  bank: null,
  mail: null,
  showBank: false,
  bounties: null,
  showBounties: false,
  keybinds: defaultKeybinds(),
  masterVolume: 0.8,
  showSettings: false,

  setSnapshot: (s) => set(s),
  setReady: (ready) => set({ ready }),
  setNet: (net) => set({ net }),
  pushChat: (line) =>
    set((st) => {
      const next = [...st.chat, { ...line, key: chatKeySeq++ }];
      if (next.length > CHAT_HISTORY_MAX) next.splice(0, next.length - CHAT_HISTORY_MAX);
      return { chat: next };
    }),
  setChatTyping: (chatTyping) => set({ chatTyping }),
  setParty: (p) =>
    // Empty roster ⇒ solo. Forming/refreshing a real party also dismisses any stale invite
    // (you can't hold a pending invite while grouped — the server rejects that). Going solo
    // drops any lingering vitals so a rejoin never shows a stale bar.
    set(p.members.length > 0 ? { party: p, partyInvite: null } : { party: null, partyVitals: {} }),
  setPartyInvite: (partyInvite) => set({ partyInvite }),
  setGm: (gm) => set({ gm }),
  setPartyVitals: (vitals) =>
    set(() => {
      const map: Record<string, PartyVitalUi> = {};
      for (const v of vitals) {
        map[v.id] = {
          hp: v.hp,
          maxHP: v.maxHP,
          resource: v.resource,
          maxResource: v.maxResource,
          resourceKind: v.resourceKind,
          dead: v.dead,
        };
      }
      return { partyVitals: map };
    }),
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
  setQuestMarkers: (questMarkers) => set({ questMarkers }),
  toggleQuestLog: () => set((st) => ({ showQuestLog: !st.showQuestLog })),
  setNearbyNode: (nearbyNode) => set({ nearbyNode }),
  setGatherStatus: (gatherStatus) => set({ gatherStatus }),
  setProfessions: (professions) => set({ professions }),
  toggleProfessions: () => set((st) => ({ showProfessions: !st.showProfessions })),
  setCrafting: (crafting) => set({ crafting }),
  toggleCrafting: () => set((st) => ({ showCrafting: !st.showCrafting })),
  setJournal: (journal) => set({ journal }),
  toggleJournal: () => set((st) => ({ showJournal: !st.showJournal })),
  setMount: (mount) => set({ mount }),
  setBank: (bank) => set({ bank }),
  setMail: (mail) => set({ mail }),
  toggleBank: () => set((st) => ({ showBank: !st.showBank })),
  setBounties: (bounties) => set({ bounties }),
  toggleBounties: () => set((st) => ({ showBounties: !st.showBounties })),
  setKeybinds: (keybinds) => set({ keybinds }),
  setMasterVolume: (masterVolume) => set({ masterVolume }),
  setGraphics: (g) => set(g),
  toggleSettings: () => set((st) => ({ showSettings: !st.showSettings })),
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
