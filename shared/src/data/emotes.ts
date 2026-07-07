// Emotes (GDD §12 Social): the /command set that turns into an action line everyone in
// range sees ("Alia waves."). Pure data + lookup helpers — the server validates a slash
// command against this table and broadcasts the third-person phrase under the player's
// authoritative name; the client uses the same table for instant "unknown emote" feedback.
// Phase 6 chat is a global channel, so an emote is seen by every joined player for now.

/** One emote: its slash command (no leading `/`) and the third-person phrase appended after the name. */
export interface EmoteDef {
  /** Command word typed after `/`, lowercase (e.g. `wave` for `/wave`). */
  cmd: string;
  /** Third-person action phrase; the broadcast reads `${name} ${phrase}` (e.g. "waves."). */
  phrase: string;
}

/** The launch emote set — a compact, evergreen spread of greetings, cheers, and moods. */
export const EMOTES: readonly EmoteDef[] = [
  { cmd: 'wave', phrase: 'waves.' },
  { cmd: 'bow', phrase: 'bows deeply.' },
  { cmd: 'cheer', phrase: 'cheers!' },
  { cmd: 'laugh', phrase: 'bursts out laughing.' },
  { cmd: 'dance', phrase: 'breaks into a dance.' },
  { cmd: 'salute', phrase: 'snaps off a crisp salute.' },
  { cmd: 'thank', phrase: 'gives thanks.' },
  { cmd: 'sit', phrase: 'sits down for a rest.' },
  { cmd: 'point', phrase: 'points ahead.' },
  { cmd: 'flex', phrase: 'flexes with pride.' },
  { cmd: 'cry', phrase: 'sheds a quiet tear.' },
  { cmd: 'roar', phrase: 'lets out a mighty roar!' },
  { cmd: 'shrug', phrase: 'shrugs.' },
  { cmd: 'nod', phrase: 'nods.' },
  { cmd: 'kneel', phrase: 'kneels.' },
];

const EMOTE_BY_CMD: ReadonlyMap<string, EmoteDef> = new Map(EMOTES.map((e) => [e.cmd, e]));

/** Look up an emote by its command word (case-insensitive, no leading slash), or null. */
export function findEmote(cmd: string): EmoteDef | null {
  return EMOTE_BY_CMD.get(cmd.toLowerCase()) ?? null;
}

/** The full list of command words (for help text / autocomplete). */
export function emoteCommands(): string[] {
  return EMOTES.map((e) => e.cmd);
}
