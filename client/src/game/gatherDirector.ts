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
  RECIPES,
  canCraft,
  craft,
  recipeById,
  consumableById,
  type World,
  type PropInstance,
  type RecipeOutput,
  type ConsumableEffect,
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
  private readonly combat: CombatDirector;
  private skills: Record<string, number>;
  private materials: Record<string, number>;
  private consumables: Record<string, number>;

  private nodes: Node[] = [];
  private nodeCX = Infinity;
  private nodeCZ = Infinity;
  private readonly depleted = new Map<string, number>(); // key → clock time it respawns
  private clock = 0;
  private channel: Channel | null = null;
  private actionSeq = 1;
  private nearby: { label: string; kind: string } | null = null;

  /** Meta hooks (set by the game): a craft finished / a gathering skill increased. */
  onCraft?: () => void;
  onGatherSkill?: (skill: number) => void;

  constructor(
    world: World,
    combat: CombatDirector,
    skills?: Record<string, number>,
    materials?: Record<string, number>,
    consumables?: Record<string, number>,
  ) {
    this.world = world;
    this.combat = combat;
    this.skills = skills
      ? { ...skills }
      : { mining: 1, herbalism: 1, fishing: 1, blacksmithing: 1, alchemy: 1 };
    this.materials = materials ? { ...materials } : {};
    this.consumables = consumables ? { ...consumables } : {};
    this.publishProfessions();
    this.publishCrafting();
  }

  /** Progression for the character autosave. */
  get state(): {
    professions: Record<string, number>;
    materials: Record<string, number>;
    consumables: Record<string, number>;
  } {
    return {
      professions: { ...this.skills },
      materials: { ...this.materials },
      consumables: { ...this.consumables },
    };
  }

  // --- crafting + consumables -----------------------------------------------

  /** Craft a recipe: consume materials, bank the output, level the profession. */
  craftRecipe(id: string): void {
    const recipe = recipeById(id);
    if (!recipe) return;
    const skill = this.skills[recipe.profession] ?? 1;
    const rng = makeRng(this.world.seed, 'craft', id, String(this.actionSeq++));
    const res = craft(rng, recipe, this.materials, skill);
    if (!res) {
      this.toast('You lack the materials or skill.');
      return;
    }
    this.skills[recipe.profession] = res.newSkill;
    this.applyOutput(res.output);
    this.onCraft?.();
    this.publishProfessions();
    this.publishCrafting();
  }

  private applyOutput(output: RecipeOutput): void {
    if (output.kind === 'material') {
      this.materials[output.id] = (this.materials[output.id] ?? 0) + output.qty;
      this.toast(`Crafted ${output.qty}× ${materialById(output.id)?.name ?? output.id}`);
    } else if (output.kind === 'consumable') {
      this.consumables[output.id] = (this.consumables[output.id] ?? 0) + output.qty;
      this.toast(`Brewed ${consumableById(output.id)?.name ?? output.id}`);
    } else {
      this.combat.craftGear({
        slot: output.slot,
        rarity: output.rarity,
        reqLevel: output.reqLevel,
      });
    }
  }

  /** Drink a consumable: apply its effect to the player and consume one. */
  useConsumable(id: string): void {
    const have = this.consumables[id] ?? 0;
    if (have <= 0) return;
    const def = consumableById(id);
    if (!def) return;
    if (have - 1 <= 0) delete this.consumables[id];
    else this.consumables[id] = have - 1;
    this.combat.applyConsumable(def.effect);
    this.publishProfessions();
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
    if (newSkill > oldSkill) {
      msg += `  (${PROFESSION_NAME[prof]} ${newSkill})`;
      this.onGatherSkill?.(newSkill); // Deed progress (gathering milestones)
    }
    this.toast(msg);
    this.publishProfessions();
    this.publishCrafting(); // new materials may unlock recipes
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
    const recipes = RECIPES.map((r) => {
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
