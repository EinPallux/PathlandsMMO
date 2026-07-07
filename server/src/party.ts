// Server-authoritative party (group) state (Phase 6 §Social). A pure bookkeeping layer over
// session ids: who is grouped with whom, plus a one-slot pending-invite box per player. It holds
// no game state and reads no wall-clock — the gateway drives it from validated client actions and
// re-broadcasts the resulting rosters. Parties are ephemeral (session-scoped): a member who
// disconnects leaves, and a party that drops to one member disbands. Max size is MAX_PARTY.

import { MAX_PARTY } from '@pathlands/shared';

export interface Party {
  /** Session ids in the party (2..MAX_PARTY while it exists). */
  members: string[];
  leaderId: string;
  /** Monotonic round-robin cursor for loot distribution (Part 22); advanced per credited kill. */
  lootTurn: number;
}

/** Outcome of an invite attempt (for player-facing feedback). */
export type InviteResult = 'ok' | 'self' | 'full' | 'targetBusy';

/** The set of members to re-send a roster to after a change, and whether the party disbanded. */
export interface PartyChange {
  notify: string[];
  disbanded: boolean;
}

export class PartyManager {
  /** playerId → the Party they belong to (one object shared by reference among its members). */
  private readonly memberParty = new Map<string, Party>();
  /** inviteeId → inviterId. A player holds at most one pending invite (a newer one overwrites). */
  private readonly invites = new Map<string, string>();

  /** The party `id` is in, or null if solo. */
  partyOf(id: string): Party | null {
    return this.memberParty.get(id) ?? null;
  }

  /** Record a pending invite from `fromId` to `toId`. Validates group sizes + target availability. */
  invite(fromId: string, toId: string): InviteResult {
    if (fromId === toId) return 'self';
    const fromParty = this.memberParty.get(fromId);
    if (fromParty !== undefined && fromParty.members.length >= MAX_PARTY) return 'full';
    if (this.memberParty.has(toId)) return 'targetBusy';
    this.invites.set(toId, fromId);
    return 'ok';
  }

  /**
   * Accept the recipient's one pending invite, joining the inviter's party (creating a fresh
   * two-person party if the inviter was solo). Returns the members to re-roster, or null if the
   * invite is stale (inviter gone, party filled, or the recipient already joined elsewhere).
   */
  accept(id: string): PartyChange | null {
    const fromId = this.invites.get(id);
    if (fromId === undefined) return null;
    this.invites.delete(id);
    if (this.memberParty.has(id)) return null; // joined another party since the invite
    let party = this.memberParty.get(fromId);
    if (party !== undefined) {
      if (party.members.length >= MAX_PARTY) return null; // filled meanwhile
      party.members.push(id);
    } else {
      party = { members: [fromId, id], leaderId: fromId, lootTurn: 0 };
      this.memberParty.set(fromId, party);
    }
    this.memberParty.set(id, party);
    return { notify: [...party.members], disbanded: false };
  }

  /** Discard the recipient's pending invite. */
  decline(id: string): void {
    this.invites.delete(id);
  }

  /**
   * Remove `id` from its party. The former members are all re-rostered (the leaver gets an empty
   * one, the rest the shrunk one). A party that drops to a single member disbands; a departing
   * leader hands off to the next member.
   */
  leave(id: string): PartyChange {
    const party = this.memberParty.get(id);
    if (party === undefined) return { notify: [], disbanded: false };
    const former = [...party.members];
    this.memberParty.delete(id);
    party.members = party.members.filter((m) => m !== id);
    if (party.members.length <= 1) {
      for (const m of party.members) this.memberParty.delete(m); // the lone survivor is solo again
      party.members = [];
      return { notify: former, disbanded: true };
    }
    if (party.leaderId === id) party.leaderId = party.members[0]!;
    return { notify: former, disbanded: false };
  }

  /** Leader-only: remove `targetId` from the party. Returns null if not permitted. */
  kick(fromId: string, targetId: string): PartyChange | null {
    const party = this.memberParty.get(fromId);
    if (party === undefined || party.leaderId !== fromId) return null;
    if (fromId === targetId || !party.members.includes(targetId)) return null;
    return this.leave(targetId);
  }

  /** Disconnect cleanup: clear any invite involving `id` (in or out) and drop it from its party. */
  remove(id: string): PartyChange {
    this.invites.delete(id); // a pending invite TO id
    for (const [invitee, inviter] of this.invites) {
      if (inviter === id) this.invites.delete(invitee); // pending invites FROM id
    }
    return this.leave(id);
  }
}
