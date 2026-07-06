// Rebindable keybinds (GDD §14 Settings). The panel-toggle and a few action keys are
// remappable to any KeyboardEvent.code; movement (WASD/Space/Shift), the hotbar digits,
// dev (`), and Escape (the settings menu itself) stay fixed so you can't lock yourself
// out. Pure data — the client reads the (persisted) map and the Settings panel edits it.

export const KEYBIND_ACTIONS = [
  'toggleMap',
  'toggleChar',
  'toggleQuestLog',
  'toggleProfessions',
  'toggleCrafting',
  'toggleJournal',
  'toggleBank',
  'toggleBounties',
  'toggleMount',
  'toggleFreeFly',
  'interact',
  'cycleTarget',
  'toggleAutoAttack',
  'releaseSpirit',
] as const;

export type KeybindAction = (typeof KEYBIND_ACTIONS)[number];

/** Human labels for the Settings panel rows. */
export const KEYBIND_LABEL: Record<KeybindAction, string> = {
  toggleMap: 'World map',
  toggleChar: 'Character sheet',
  toggleQuestLog: 'Quest log',
  toggleProfessions: 'Professions',
  toggleCrafting: 'Crafting',
  toggleJournal: "Wayfarer's Journal",
  toggleBank: 'Bank & mail',
  toggleBounties: 'Bounty board',
  toggleMount: 'Mount / dismount',
  toggleFreeFly: 'Free-fly camera',
  interact: 'Interact',
  cycleTarget: 'Cycle target',
  toggleAutoAttack: 'Auto-attack',
  releaseSpirit: 'Release spirit',
};

/** The default binding for each action (KeyboardEvent.code). */
export const DEFAULT_KEYBINDS: Record<KeybindAction, string> = {
  toggleMap: 'KeyM',
  toggleChar: 'KeyC',
  toggleQuestLog: 'KeyL',
  toggleProfessions: 'KeyP',
  toggleCrafting: 'KeyK',
  toggleJournal: 'KeyJ',
  toggleBank: 'KeyB',
  toggleBounties: 'KeyO',
  toggleMount: 'KeyG',
  toggleFreeFly: 'KeyF',
  interact: 'KeyE',
  cycleTarget: 'Tab',
  toggleAutoAttack: 'KeyR',
  releaseSpirit: 'Enter',
};

/** A fresh copy of the default binding map. */
export function defaultKeybinds(): Record<string, string> {
  return { ...DEFAULT_KEYBINDS };
}

/** Codes that may never be bound (reserved for movement / menu / hotbar). */
export const RESERVED_CODES: readonly string[] = [
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'Space',
  'ShiftLeft',
  'ShiftRight',
  'Escape',
  'Backquote',
  'Digit1',
  'Digit2',
  'Digit3',
  'Digit4',
  'Digit5',
  'Digit6',
  'Digit7',
  'Digit8',
  'Digit9',
  'Digit0',
];

/** A short display label for a KeyboardEvent.code (e.g. 'KeyM' → 'M', 'Backquote' → '`'). */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const named: Record<string, string> = {
    Backquote: '`',
    Tab: 'Tab',
    Enter: 'Enter',
    Space: 'Space',
    Escape: 'Esc',
    ShiftLeft: 'LShift',
    ShiftRight: 'RShift',
    ControlLeft: 'LCtrl',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
  };
  return named[code] ?? code;
}
