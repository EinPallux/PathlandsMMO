// Client gathering orchestrator (GDD §9): finds gather nodes by re-running the
// deterministic worldgen scatter near the player, drives the mining/herbalism
// channel and the fishing minigame, banks materials + profession skill-ups, and
// publishes the gather prompt / channel bar / professions panel. All gather rules
// live in shared/professions; this is the input → engine → events edge.

import {
  Biome,
  nodeInfo,
  gatherNode,
  rollFish,
  canGather,
  fishBiteDelaySeconds,
  materialById,
  makeRng,
  Profession,
  ALL_PROFESSIONS,
  PROFESSION_NAME,
  SKILL_MAX,
  CHANNEL_SECONDS,
  type World,
  type PropInstance,
} from '@pathlands/shared';
import { useStore, type GatherStatus } from './store.js';

interface Node {
  key: string;
  prop: string;
  x: number;
  z: number;
  profession: Profession;
  tier: number;
}

type Channel =
  | {
      mode: 'work';
      profession: Profession;
      tier: number;
      nodeKey: string;
      elapsed: number;
      total: number;
    }
  | {
      mode: 'fish';
      tier: number;
      phase: 'wait' | 'bite';
      elapsed: number;
      biteAt: number;
      biteEnd: number;
    };

const NODE_RANGE = 3.5; // metres to work a node
const FISH_RANGE = 3.0; // metres from water to fish
const RESPAWN_SECONDS = 120; // node respawn (GDD §9: 90–180 s)

export class GatherDirector {
  private readonly world: World;
  private skills: Record<string, number>;
  private materials: Record<string, number>;

  private nodes: Node[] = [];
  private nodeCX = Infinity;
  private nodeCZ = Infinity;
  private readonly depleted = new Map<string, number>(); // key → clock time it respawns
  private clock = 0;
  private channel: Channel | null = null;
  private actionSeq = 1;
  private nearby: { label: string; kind: string } | null = null;

  constructor(world: World, skills?: Record<string, number>, materials?: Record<string, number>) {
    this.world = world;
    this.skills = skills
      ? { ...skills }
      : { mining: 1, herbalism: 1, fishing: 1, blacksmithing: 1, alchemy: 1 };
    this.materials = materials ? { ...materials } : {};
    this.publishProfessions();
  }

  /** Progression for the character autosave. */
  get state(): { professions: Record<string, number>; materials: Record<string, number> } {
    return { professions: { ...this.skills }, materials: { ...this.materials } };
  }

  // --- per-frame ------------------------------------------------------------

  update(dt: number, px: number, py: number, pz: number, moved: boolean): void {
    this.clock += dt;
    // Respawn depleted nodes.
    for (const [k, t] of this.depleted) if (this.clock >= t) this.depleted.delete(k);

    this.refreshNodes(px, pz);

    if (this.channel) {
      if (moved) {
        this.cancelChannel('Interrupted');
      } else if (this.channel.mode === 'work') {
        this.channel.elapsed += dt;
        if (this.channel.elapsed >= this.channel.total) this.finishWork();
      } else {
        this.tickFishing(dt);
      }
    }

    this.publishStatus();
    this.publishPrompt(px, py, pz);
  }

  private tickFishing(dt: number): void {
    const c = this.channel;
    if (!c || c.mode !== 'fish') return;
    c.elapsed += dt;
    if (c.phase === 'wait' && c.elapsed >= c.biteAt) {
      c.phase = 'bite';
      c.biteEnd = c.elapsed + 1.1; // ~1s reaction window
    } else if (c.phase === 'bite' && c.elapsed >= c.biteEnd) {
      this.channel = null;
      this.toast('The fish slipped the line.');
    }
  }

  // --- interaction (E) ------------------------------------------------------

  /** Handle an E press for gathering. Returns true if it consumed the press. */
  interact(px: number, py: number, pz: number): boolean {
    if (this.channel) {
      if (this.channel.mode === 'fish' && this.channel.phase === 'bite') this.catchFish();
      return true; // consume E while a gather is in progress
    }
    const node = this.nearestNode(px, pz);
    if (node) {
      this.startWork(node);
      return true;
    }
    if (this.nearWater(px, py, pz)) {
      this.startFishing(px, pz);
      return true;
    }
    return false;
  }

  private startWork(node: Node): void {
    const total = CHANNEL_SECONDS[node.profession] ?? 2.5;
    this.channel = {
      mode: 'work',
      profession: node.profession,
      tier: node.tier,
      nodeKey: node.key,
      elapsed: 0,
      total,
    };
  }

  private finishWork(): void {
    const c = this.channel;
    if (!c || c.mode !== 'work') return;
    this.channel = null;
    const rng = makeRng(this.world.seed, 'gather', c.profession, String(this.actionSeq++));
    const skill = this.skills[c.profession] ?? 1;
    const res = gatherNode(rng, c.profession, c.tier, skill);
    this.depleted.set(c.nodeKey, this.clock + RESPAWN_SECONDS);
    if (!res) {
      this.toast('Your skill is too low.');
      return;
    }
    this.bank(c.profession, res.yields, res.newSkill, skill);
  }

  private startFishing(px: number, pz: number): void {
    const tier = this.fishingTier(px, pz);
    const rng = makeRng(this.world.seed, 'fishcast', String(this.actionSeq++));
    const biteAt = fishBiteDelaySeconds(rng);
    this.channel = { mode: 'fish', tier, phase: 'wait', elapsed: 0, biteAt, biteEnd: 0 };
  }

  private catchFish(): void {
    const c = this.channel;
    if (!c || c.mode !== 'fish') return;
    this.channel = null;
    const rng = makeRng(this.world.seed, 'fish', String(this.actionSeq++));
    const skill = this.skills.fishing ?? 1;
    const res = rollFish(rng, c.tier, skill);
    this.bank(Profession.Fishing, res.yields, res.newSkill, skill);
  }

  private bank(
    prof: Profession,
    yields: Array<{ materialId: string; qty: number }>,
    newSkill: number,
    oldSkill: number,
  ): void {
    const names: string[] = [];
    for (const y of yields) {
      this.materials[y.materialId] = (this.materials[y.materialId] ?? 0) + y.qty;
      const m = materialById(y.materialId);
      names.push(`${y.qty}× ${m?.name ?? y.materialId}`);
    }
    this.skills[prof] = newSkill;
    let msg = names.join(', ');
    if (newSkill > oldSkill) msg += `  (${PROFESSION_NAME[prof]} ${newSkill})`;
    this.toast(msg);
    this.publishProfessions();
  }

  // --- node querying --------------------------------------------------------

  private refreshNodes(px: number, pz: number): void {
    const cx = Math.floor(px / 32);
    const cz = Math.floor(pz / 32);
    if (cx === this.nodeCX && cz === this.nodeCZ) return;
    this.nodeCX = cx;
    this.nodeCZ = cz;
    const list: Node[] = [];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        let props: PropInstance[];
        try {
          props = this.world.scatterChunk(cx + dx, cz + dz);
        } catch {
          continue;
        }
        for (const p of props) {
          const info = nodeInfo(p.prop);
          if (!info) continue;
          list.push({
            key: `${Math.round(p.x)},${Math.round(p.z)}`,
            prop: p.prop,
            x: p.x,
            z: p.z,
            profession: info.profession,
            tier: info.tier,
          });
        }
      }
    }
    this.nodes = list;
  }

  private nearestNode(px: number, pz: number): Node | null {
    let best: Node | null = null;
    let bestD = NODE_RANGE;
    for (const n of this.nodes) {
      if ((this.depleted.get(n.key) ?? 0) > this.clock) continue;
      const d = Math.hypot(n.x - px, n.z - pz);
      if (d < bestD && canGather(this.skills[n.profession] ?? 1, n.tier)) {
        bestD = d;
        best = n;
      }
    }
    return best;
  }

  private nearWater(px: number, py: number, pz: number): boolean {
    const y = Math.floor(py);
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      const wx = Math.floor(px + Math.cos(ang) * FISH_RANGE);
      const wz = Math.floor(pz + Math.sin(ang) * FISH_RANGE);
      for (let dy = -2; dy <= 0; dy++) {
        if (this.world.isFluidAt(wx, y + dy, wz)) return true;
      }
    }
    return false;
  }

  private fishingTier(px: number, pz: number): number {
    switch (this.world.biomeAt(Math.floor(px), Math.floor(pz))) {
      case Biome.Foothills:
        return 1;
      case Biome.Peaks:
        return 2;
      case Biome.Trollmoor:
      case Biome.Coast:
        return 3;
      default:
        return 0; // Vale / Weald ponds
    }
  }

  // --- publishing -----------------------------------------------------------

  private cancelChannel(reason: string): void {
    this.channel = null;
    this.toast(reason);
  }

  private toast(text: string): void {
    // Reuse the quest toast channel for a light gathering notice.
    const store = useStore.getState();
    store.setQuestToasts(
      [...store.questToasts, { id: -this.actionSeq, text, kind: 'progress' as const }].slice(-4),
    );
  }

  private publishStatus(): void {
    let status: GatherStatus | null = null;
    if (this.channel?.mode === 'work') {
      status = {
        label: this.channel.profession === Profession.Mining ? 'Mining…' : 'Gathering…',
        frac: Math.min(1, this.channel.elapsed / this.channel.total),
        hint: '',
      };
    } else if (this.channel?.mode === 'fish') {
      status =
        this.channel.phase === 'bite'
          ? { label: 'A bite!', frac: 1, hint: 'Press E to reel in!' }
          : {
              label: 'Fishing…',
              frac: Math.min(0.95, this.channel.elapsed / this.channel.biteAt),
              hint: '',
            };
    }
    useStore.getState().setGatherStatus(status);
  }

  private publishPrompt(px: number, py: number, pz: number): void {
    let next: { label: string; kind: string } | null = null;
    if (!this.channel) {
      const node = this.nearestNode(px, pz);
      if (node) {
        const m = materialById(this.primaryFor(node));
        next =
          node.profession === Profession.Mining
            ? { label: `Mine ${m?.name ?? 'ore'}`, kind: 'mining' }
            : { label: `Gather ${m?.name ?? 'herb'}`, kind: 'herbalism' };
      } else if (this.nearWater(px, py, pz)) {
        next = { label: 'Fish', kind: 'fishing' };
      }
    }
    const changed = next?.label !== this.nearby?.label;
    this.nearby = next;
    if (changed) useStore.getState().setNearbyNode(next);
  }

  private primaryFor(node: Node): string {
    // The node's own material id (copperOre, meadowbloom, …) for the prompt label.
    const propToMat: Record<string, string> = {
      oreCopper: 'copperOre',
      oreIron: 'ironOre',
      oreSilver: 'silverOre',
      oreCrystal: 'crystaliumOre',
      herbMeadow: 'meadowbloom',
      herbFen: 'fenweed',
    };
    return propToMat[node.prop] ?? '';
  }

  private publishProfessions(): void {
    const skills = ALL_PROFESSIONS.map((p) => ({
      id: p,
      name: PROFESSION_NAME[p],
      skill: this.skills[p] ?? 1,
      max: SKILL_MAX,
    }));
    const materials = Object.entries(this.materials)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => ({ id, name: materialById(id)?.name ?? id, qty }))
      .sort((a, b) => a.name.localeCompare(b.name));
    useStore.getState().setProfessions({ skills, materials });
  }
}
