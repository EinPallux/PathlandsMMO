import { describe, it, expect } from 'vitest';
import {
  BOUNTY_POOL,
  BOUNTY_HUBS,
  bountyById,
  hubPool,
  dailyBountyIds,
  enemyById,
  EnemyFamily,
  WORLD_SEED,
} from '../src/index.js';

const FAMILIES = new Set(Object.values(EnemyFamily));

describe('Bounty content (GDD §11)', () => {
  it('every bounty is well-formed and posted at a known hub', () => {
    for (const x of BOUNTY_POOL) {
      expect(BOUNTY_HUBS).toContain(x.hub);
      expect(x.count).toBeGreaterThan(0);
      expect(x.gold).toBeGreaterThan(0);
      expect(x.xp).toBeGreaterThan(0);
      expect(bountyById(x.id)).toBe(x);
    }
  });

  it('kill targets resolve to a real enemy id or family', () => {
    for (const x of BOUNTY_POOL) {
      if (x.kind !== 'kill') continue;
      if (x.targetIsFamily) expect(FAMILIES.has(x.target as EnemyFamily)).toBe(true);
      else expect(enemyById(x.target), x.id).toBeDefined();
    }
  });

  it('every hub posts at least a few bounties', () => {
    for (const hub of BOUNTY_HUBS) expect(hubPool(hub).length).toBeGreaterThanOrEqual(3);
  });
});

describe('Daily bounty rotation', () => {
  it('is deterministic for a given seed + day + hub', () => {
    const a = dailyBountyIds(WORLD_SEED, 100, 'brookhollow');
    const b = dailyBountyIds(WORLD_SEED, 100, 'brookhollow');
    expect(a).toEqual(b);
  });

  it('posts distinct bounties that all belong to the hub', () => {
    const ids = dailyBountyIds(WORLD_SEED, 42, 'waymeet', 3);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(bountyById(id)!.hub).toBe('waymeet');
  });

  it('rotates across days (not identical every day)', () => {
    const days = new Set<string>();
    for (let d = 0; d < 20; d++) days.add(dailyBountyIds(WORLD_SEED, d, 'mossgate').join(','));
    expect(days.size).toBeGreaterThan(1);
  });
});
