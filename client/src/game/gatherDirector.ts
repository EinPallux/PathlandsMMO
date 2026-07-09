// Client gathering orchestrator (GDD §9), a server-authoritative MIRROR now (profession migration
// #139). It still finds gather nodes by re-running the deterministic worldgen scatter near the player
// and drives the mining/herbalism channel + fishing minigame for UX, but every gather / fish / craft /
// consumable-use is sent to the server as an INTENT — the server owns the yields (its own seeded RNG),
// the skill-ups, node depletion, and the material / consumable stash. The authoritative state comes
// back on the professions frame, which is the SOLE writer of the local skills / materials / consumables
// / learned mirror; per-action notices on that frame drive the toasts + the still-client-side deed /
// bounty side effects. All gather rules live in shared/professions and run on the server.

import {
  nodeInfo,
  canGather,
  fishBiteDelaySeconds,
  materialById,
  makeRng,
  Profession,
  ALL_PROFESSIONS,
  PROFESSION_NAME,
  SKILL_MAX,
  masteryFor,
  isMastered,
  CHANNEL_SECONDS,
  RECIPES,
  canCraft,
  recipeById,
  consumableById,
  type World,
  type PropInstance,
  type RecipeOutput,
  type ConsumableEffect,
  type ClientProfAction,
  type NetProfNotice,
  type ServerProfessions,
} from '@pathlands/shared';
import type { CombatDirector } from './combatDirector.js';
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
      phase: 'wait' | 'bite';
      elapsed: number;
      biteAt: number;
      biteEnd: number;
    };

const NODE_RANGE = 3.5; // metres to work a node
const FISH_RANGE = 3.0; // metres from water to fish
const RESPAWN_SECONDS = 120; // node respawn (GDD §9: 90–180 s) — client-optimistic prompt only

/** How the GatherDirector reaches the network (profession migration #139). Wired by the game. */
export interface ProfNetSink {
  /** Take the authoritative profession frames since the last drain (state + per-action notices). */
  drainProfessions(): ServerProfessions[];
  /** Send a server-validated profession action; the change returns on the next professions frame. */
  sendProfAction(action: ClientProfAction['action'], id?: string): void;
}

export class GatherDirector {
  private readonly world: World;
  private readonly combat: CombatDirector;
  /** Server-authoritative MIRRORS (profession migration #139): written ONLY by `applyServerProfessions`.
   *  Actions go to the server as intents; the change comes back on the professions frame. */
  private skills: Record<string, number>;
  private materials: Record<string, number>;
  private consumables: Record<string, number>;
  /** Learned discovery-recipe ids (advanced recipes hidden until discovered). Mirror. */
  private learned: Set<string>;

  private netSink: ProfNetSink | null = null;

  private nodes: Node[] = [];
  private nodeCX = Infinity;
  private nodeCZ = Infinity;
  /** Client-optimistic depletion (key → clock time it respawns) so the prompt doesn't immediately
   *  re-offer a node just worked; the server owns the AUTHORITATIVE depletion + respawn. */
  private readonly depleted = new Map<string, number>();
  private clock = 0;
  private channel: Channel | null = null;
  private actionSeq = 1;
  private nearby: { label: string; kind: string } | null = null;

  /** Meta hooks (set by the game): a craft finished / a gathering skill increased. */
  onCraft?: () => void;
  onGatherSkill?: (skill: number) => void;
  /** A material was gathered (id + qty) — feeds gather bounties. */
  onMaterialGained?: (materialId: string, qty: number) => void;

  constructor(
    world: World,
    combat: CombatDirector,
    skills?: Record<string, number>,
    materials?: Record<string, number>,
    consumables?: Record<string, number>,
    learnedRecipes?: string[],
  ) {
    this.world = world;
    this.combat = combat;
    // Seed the mirror from the local cache; the first server frame is authoritative and wins.
    this.skills = skills
      ? { ...skills }
      : { mining: 1, herbalism: 1, fishing: 1, blacksmithing: 1, alchemy: 1 };
    this.materials = materials ? { ...materials } : {};
    this.consumables = consumables ? { ...consumables } : {};
    this.learned = new Set(learnedRecipes ?? []);
    this.publishProfessions();
    this.publishCrafting();
  }

  setNetSink(sink: ProfNetSink): void {
    this.netSink = sink;
  }

  /** Progression for the character autosave (read from the mirror). */
  get state(): {
    professions: Record<string, number>;
    materials: Record<string, number>;
    consumables: Record<string, number>;
    learnedRecipes: string[];
  } {
    return {
      professions: { ...this.skills },
      materials: { ...this.materials },
      consumables: { ...this.consumables },
      learnedRecipes: [...this.learned],
    };
  }

  // --- server frame → mirror + side effects ---------------------------------

  /**
   * Apply the authoritative profession frames the server sent — the SOLE writer of the local mirror.
   * Overwrites skills / materials / consumables / learned with the server's truth, then plays each
   * frame's notices (the toasts + the still-client-side deed / bounty side effects). A seed / reconnect
   * frame carries no notices, so a login replays nothing.
   */
  applyServerProfessions(): void {
    const frames = this.netSink?.drainProfessions();
    if (frames === undefined || frames.length === 0) return;
    for (const f of frames) {
      this.skills = { ...f.skills };
      this.materials = { ...f.materials };
      this.consumables = { ...f.consumables };
      this.learned = new Set(f.learned);
      for (const n of f.notices) this.playNotice(n);
    }
    this.publishProfessions();
    this.publishCrafting();
  }

  /** Play one server profession notice: the toast + the client-side deed / bounty side effects. The
   *  mirror state is already updated (the maps on the same frame are authoritative). */
  private playNotice(n: NetProfNotice): void {
    if (n.kind === 'gather') {
      const names = n.yields.map((y) => `${y.qty}× ${materialById(y.id)?.name ?? y.id}`);
      let msg = names.join(', ');
      if (n.skillUp) {
        const prof = n.prof as Profession;
        msg += `  (${PROFESSION_NAME[prof] ?? n.prof} ${n.skill})`;
        this.onGatherSkill?.(n.skill); // Deed progress (gathering milestones)
      }
      if (msg.length > 0) this.toast(msg);
      for (const y of n.yields) this.onMaterialGained?.(y.id, y.qty); // gather bounties
    } else if (n.kind === 'craft') {
      const recipe = recipeById(n.recipe);
      if (recipe !== undefined) {
        const o = recipe.output;
        if (o.kind === 'material') {
          this.toast(`Crafted ${o.qty}× ${materialById(o.id)?.name ?? o.id}`);
        } else if (o.kind === 'consumable') {
          this.toast(`Brewed ${consumableById(o.id)?.name ?? o.id}`);
        } else {
          // Gear: the item itself is forged server-side + arrives on the inventory frame.
          this.toast(`Crafted ${recipe.name}`);
        }
      }
      this.onCraft?.(); // Deed progress (craft milestones)
      if (n.discovered !== undefined) {
        this.toast(`Discovered a recipe: ${recipeById(n.discovered)?.name ?? n.discovered}!`);
      }
    } else {
      // A consumable was drunk server-side: float its effect cue (the HP / resource / buff itself is
      // applied to the combat entity server-side and arrives on the combat-self frame).
      const def = consumableById(n.id);
      if (def !== undefined) this.combat.applyConsumable(def.effect);
    }
  }

  /** Re-arm on a reconnect: clear the client-optimistic depletion so the fresh server state drives
   *  the prompts. (The mirror itself is overwritten by the next authoritative frame.) */
  resetBaseline(): void {
    this.depleted.clear();
  }

  // --- crafting + consumables (intent senders) ------------------------------

  /** Craft a recipe: a light client-side pre-check for instant feedback, then a `craft` intent. The
   *  server re-validates skill + inputs, consumes them, banks the output (or forges gear), and
   *  replicates — the toast fires from the returned notice. */
  craftRecipe(id: string): void {
    const recipe = recipeById(id);
    if (recipe === undefined) return;
    if (recipe.discovery && !this.learned.has(id)) return; // not learned yet (server also enforces)
    const skill = this.skills[recipe.profession] ?? 1;
    if (!canCraft(recipe, this.materials, skill)) {
      this.toast('You lack the materials or skill.');
      return;
    }
    this.netSink?.sendProfAction('craft', id);
  }

  /** Drink a consumable: a `use` intent (guarded on holding one for instant feedback). The server
   *  debits the stash + applies the effect; the count + cue return on the next frames. */
  useConsumable(id: string): void {
    if ((this.consumables[id] ?? 0) <= 0) return;
    this.netSink?.sendProfAction('use', id);
  }

  // --- per-frame ------------------------------------------------------------

  update(dt: number, px: number, py: number, pz: number, moved: boolean): void {
    this.clock += dt;
    // Respawn (client-optimistic) depleted nodes so the prompt returns.
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
      this.startFishing();
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

  /** The channel finished: send a `gather` intent (the server resolves the nearest node to the
   *  player's authoritative position + owns the yield). Optimistically deplete the node locally so
   *  the prompt doesn't instantly re-offer it. */
  private finishWork(): void {
    const c = this.channel;
    if (!c || c.mode !== 'work') return;
    this.channel = null;
    this.depleted.set(c.nodeKey, this.clock + RESPAWN_SECONDS);
    this.netSink?.sendProfAction('gather');
  }

  private startFishing(): void {
    // The bite timing is a client-side UX flourish (cosmetic RNG); the CATCH is server-authoritative.
    const rng = makeRng(this.world.seed, 'fishcast', String(this.actionSeq++));
    const biteAt = fishBiteDelaySeconds(rng);
    this.channel = { mode: 'fish', phase: 'wait', elapsed: 0, biteAt, biteEnd: 0 };
  }

  /** Reeled in on time: send a `fish` intent (the server validates water + owns the catch). */
  private catchFish(): void {
    const c = this.channel;
    if (!c || c.mode !== 'fish') return;
    this.channel = null;
    this.netSink?.sendProfAction('fish');
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
    const skills = ALL_PROFESSIONS.map((p) => {
      const skill = this.skills[p] ?? 1;
      const m = masteryFor(p);
      return {
        id: p,
        name: PROFESSION_NAME[p],
        skill,
        max: SKILL_MAX,
        mastery: m.name,
        masteryDesc: m.description,
        mastered: isMastered(skill),
      };
    });
    const materials = Object.entries(this.materials)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => ({ id, name: materialById(id)?.name ?? id, qty }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const consumables = Object.entries(this.consumables)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => {
        const def = consumableById(id);
        return { id, name: def?.name ?? id, qty, effect: effectLabel(def?.effect) };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    useStore.getState().setProfessions({ skills, materials, consumables });
  }

  private publishCrafting(): void {
    // Discovery recipes stay hidden until learned; everything else is skill-gated only.
    const recipes = RECIPES.filter((r) => !r.discovery || this.learned.has(r.id)).map((r) => {
      const skill = this.skills[r.profession] ?? 1;
      return {
        id: r.id,
        name: r.name,
        profession: PROFESSION_NAME[r.profession],
        category: r.category,
        output: outputLabel(r.output),
        skillReq: r.skillReq,
        craftable: canCraft(r, this.materials, skill),
        inputs: r.inputs.map((i) => ({
          name: materialById(i.id)?.name ?? i.id,
          qty: i.qty,
          have: this.materials[i.id] ?? 0,
        })),
      };
    });
    useStore.getState().setCrafting({ recipes });
  }
}

function outputLabel(o: RecipeOutput): string {
  if (o.kind === 'material') return `${o.qty}× ${materialById(o.id)?.name ?? o.id}`;
  if (o.kind === 'consumable') return consumableById(o.id)?.name ?? o.id;
  const r = o.rarity[0]!.toUpperCase() + o.rarity.slice(1);
  return `${r} ${o.slot} (req ${o.reqLevel})`;
}

function effectLabel(e?: ConsumableEffect): string {
  if (!e) return '';
  if (e.kind === 'heal') return `Restore ${e.amount} HP`;
  if (e.kind === 'resource') return `Restore ${e.amount} resource`;
  return e.label;
}
