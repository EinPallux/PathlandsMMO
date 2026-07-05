// Mailbox (GDD §Supporting systems / WORLD §Waymeet): a stub of the Phase-6 mail
// system. Letters arrive from world NPCs (never other players yet) into a
// per-character inbox and can carry a small gold gift, claimed once. Pure data —
// the client's inbox is seeded from these and delivered on milestones.

export interface MailLetter {
  id: string;
  sender: string;
  subject: string;
  body: string;
  /** Gold attached to the letter, granted once when claimed. */
  gold?: number;
}

/** A letter as stored in the save: the content plus whether its gift was claimed. */
export interface MailLetterSave extends MailLetter {
  claimed: boolean;
}

/** Letters in a new character's inbox from the very start. */
export const STARTER_MAIL: readonly MailLetter[] = [
  {
    id: 'mail_welcome',
    sender: 'Elder Rowan of Brookhollow',
    subject: 'The Road Awaits',
    body:
      'Wayfarer — the old stones stir, and the Road needs walkers again. Take this ' +
      'purse for the journey ahead, and light a Waystone when you find one. Fortune ' +
      'walk with you.',
    gold: 25,
  },
  {
    id: 'mail_steward_intro',
    sender: 'The Waymeet Steward',
    subject: 'When You Reach the City',
    body:
      'Should the Road bring you to Waymeet, our vaults will keep your treasures safe ' +
      'and this box will hold your letters. The city welcomes every Wayfarer who lights ' +
      'the way.',
  },
];

/** The letter delivered the first time a character reaches level 5 (Waymeet band). */
export const WAYMEET_WELCOME: MailLetter = {
  id: 'mail_waymeet_welcome',
  sender: 'The Waymeet Steward',
  subject: 'A Place in the City',
  body:
    'Word of your deeds reaches the capital, Wayfarer. Enclosed is a stipend from the ' +
    'city coffers — spend it well. A Grand Waystone waits at our gates whenever the Road ' +
    'turns your way.',
  gold: 50,
};

const MAIL_BY_ID = new Map<string, MailLetter>(
  [...STARTER_MAIL, WAYMEET_WELCOME].map((m) => [m.id, m]),
);

export function mailById(id: string): MailLetter | undefined {
  return MAIL_BY_ID.get(id);
}

/** A fresh character's starting inbox (nothing claimed yet). */
export function starterInbox(): MailLetterSave[] {
  return STARTER_MAIL.map((m) => ({ ...m, claimed: false }));
}
