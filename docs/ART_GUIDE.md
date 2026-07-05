# Pathlands — Art Guide & Asset Pipeline

How Pathlands looks, and how every visual asset gets made. The law of the pipeline: **3D voxel models are authored in code** (typed voxel grids meshed at runtime — never .vox, never imported model files, never downloaded assets), and the **PNG renders in `public/assets/` are used directly as UI art** plus as the style reference for their 3D counterparts.

## 1. Style Definition

Reference: the existing PNGs (Cube-World-like voxel figurines). Distilled rules:

- **Chunky silhouettes, fine surface detail.** Forms read at a glance (a wolf, an inn); interest comes from per-voxel color variation, not geometry noise.
- **Color does the work.** No textures anywhere — palette + per-voxel shade jitter (±4–7% value, keep hue) + baked AO gives the "beaded" richness the renders have.
- **Warm, storybook palette.** Earthy browns/greens/golds for the world; saturated accents reserved for meaning: verdigris green = blight, cyan/violet = crystal/Waystone magic, warm orange = firelight/windows.
- **Heroic-cute proportions** for characters: big head (~1/3 of height), sturdy torso, short legs, oversized weapons (see §4 rig).
- **Nothing photoreal, nothing gritty.** Blood = none; damage reads via flashes and numbers.

### Named palette (constants in `shared/models/palette.ts`; extend there, document here)

Grass `#6FA84E` (vale) / `#4E7A3A` (weald) · dirt `#8A6A48` · stone `#8D8D93` / dark `#5E5E66` · sand `#E4D29A` · snow `#EFF3F6` · water `#3D7DC4` · wood oak `#7A5636` / dark `#4F3A26` · roof brick `#A6503E` · plaster `#E8DFC8` · wheat `#D9B54A` · blight `#7CCB2E` (emissive tier) · crystal `#7FD6E8`/`#9A7FE8` · flame `#F2A03D` · leather `#6E4F33` · iron `#B9BEC6` · gold trim `#C9A23F`. Skin tones ×4, hair ×6 defined alongside.

## 2. The Voxel Model Format (code-authored)

Models live in `shared/models/` as TypeScript data — human-writable, diffable, and meshable on client and (collision-only) server:

```ts
defineModel({
  id: 'enemy.mossfang_wolf',
  scale: 1/16,                    // world meters per voxel (characters ≈ 1/16)
  palette: { K: pal.furDark, G: pal.blight, F: pal.fangBone, ... },   // char → color
  parts: {
    // each part: named, pivoted, built from layer strings and/or box ops
    head:  part({ pivot: [0, 9, 5] }, layers(`...multi-line voxel slices...`)),
    torso: part({ pivot: [0, 8, 0] }, box(6, 6, 10, 'K').paint(mossPattern)),
    legFL: part({ pivot: [2, 6, 4] }, box(2, 6, 2, 'K')),
    ...
  },
  emissive: ['G'],                // palette keys that glow (blight, crystal, windows)
})
```

- **Authoring helpers** (`box`, `layers` slice-strings, `mirrorX`, `paint` masks, `jitter`) make models writable by hand/AI without tooling. Build a helper before building the tenth model that needed it.
- **Recolors are palette swaps** (`variantOf('enemy.mossfang_wolf', {K: pal.frostFur, G: pal.crystal})`) — the cheap way to fill spawn tables (frost wolf, blighted stag…). A recolor is only allowed with at least one distinguishing paint-mask tweak, so variants never read as pure reskins.
- Buildings/props use the same format at coarser scales (props 1/8, buildings 1/4–1/2) and get meshed once + instanced.
- **Fidelity bar for PNG reconstructions:** side-by-side at game camera distance, a player instantly says "that's that one." Match silhouette, proportions, and the 5–8 dominant colors; simplify micro-detail (target budgets: character ≤ ~4k voxels pre-mesh, building ≤ ~60k). Do not chase pixel-perfection — the renders have more resolution than gameplay models should.

## 3. Fixed World-Scale Facts

1 voxel (terrain) = 1 m. Character height ≈ 1.7 m (≈27 model-voxels at 1/16). Doorways ≥ 2×3 m so characters+wolf mount pass. Trees 6–14 m. Buildings reconstructed to footprint sizes that fit settlement plots defined in WORLD.md.

## 4. Rig & Animation

- **Humanoid rig (shared by all classes + NPCs):** parts `head, torso, armL, armR, legL, legR` (+`weaponMain, weaponOff` sockets on hands). Quadruped rig: `head, torso, tail, legFL, legFR, legBL, legBR`. Special rigs (treant, grub, wisp…) defined per model but reuse the same part-keyframe system.
- **Animation = part keyframes** (per-part position/rotation tracks, linear/ease interpolation), defined in code next to the model. Standard clip set every combat-capable model must have: `idle, walk, run, attack, hit, death` (+`cast` for casters, `jump/swim/mount` for players). Cube-World-style bounce: keep it snappy, 0.3–0.6 s clips, exaggerated key poses.
- Sim owns the animation _state_; client tweens the clip. Never gameplay-gate on visual animation timing.

## 5. The 2D Renders — Usage Map (`public/assets/`, filenames verbatim)

| Folder       | Files                                                                                                                                                                                                                   | 3D reconstruction                 | 2D UI usage                                                 |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------- |
| `classes/`   | `Warrior Class.png`, `Ranger Class.png`, `Priest Class.png`                                                                                                                                                             | player models (Phase 1)           | character creation/select portraits, class tooltips         |
| `enemies/`   | `Briar Goblin.png`, `Mossfang Wolf.png`, `Thornback Boar.png`, `Venomcap Spriggan.png`, `Hollowroot Treant.png`, `Dire Stag.png`, `Cave Gnoll.png`, `Stonejaw Grub.png`, `Crystalback Lizard.png`, `Ironhide Troll.png` | enemy models (Phase 3)            | bestiary/journal pages, boss-intro banners, loading screens |
| `buildings/` | `Medival House 1..4.png`, `Big Medival House 1..2.png`, `Medival Inn.png`, `Medival Church.png`, `Medival Stable.png`, `Medival Bathhouse.png`, `Medival Worker Hut.png`, `Medival Water Fountain.png`                  | settlement building kit (Phase 2) | loading screens, map POI vignettes                          |
| `mounts/`    | `Wolf Mount.png`                                                                                                                                                                                                        | mount model (Phase 4)             | mount journal/vendor UI                                     |

Access via a typed manifest module (`client/src/platform/assetManifest.ts`) so the misspelled filenames ("Medival") live in exactly one place. A **Mage portrait** must be produced in Phase 1 in the same framing/style (voxel-render look, white background); until AI-image parity is possible, compose it as a styled render of the in-game Mage model on the white card layout — visual consistency with the other three cards is the acceptance bar.

## 6. New-Asset Wishlist (authored in code, per phase)

- **Phase 1:** ✅ 4 class models (Warrior/Ranger/Priest reconstructed, Mage authored) via the shared parametric humanoid builder + weapon/hat/hood helpers; terrain palettes + `terrainColor(voxel, biome)`; `VoxelSet` authoring helpers and the runtime greedy model mesher (self-AO + shade jitter). Mage 2D portrait is rendered live from the in-game model on the class-select card (no source PNG).
- **Phase 2 (bulk):** ✅ trees (oak/birch/mosswood/pine/crystal-pine/palm/dead/blighted), rocks, bushes/flowers/crops, fences/signposts/lanterns/bridge/well/market stall/grave/ruin kit, ore-vein + herb-node + node shells, villager m/f ×3 outfits, guard, vendor, critters (deer/rabbit/bird/fish) + Dire Stag, **all 12 building models** (kit in `shared/models/structures/`), and themed Hollow-entrance portals (goblin/gnoll/crystal/iron/crypt). Emissive keys (windows/lanterns/blight/crystal) glow at night via the opaque+emissive mesher split.
- **Phase 3:** ✅ enemy models (`shared/models/creatures/enemies.ts`) — the 10 asset-PNG reconstructions + 8 new archetypes (blightrat, road bandit, bandit archer, marsh slime, cave bat, bog drake, drowned dead, crypt skeleton/sentinel) on a compact quadruped rig, the shared humanoid rig, and bespoke rigs (spriggan/treant/grub/slime/bat); the 5 Hollow bosses reuse their base model at Boss scale. `buildEnemyModel(modelId)` + cache. _(Named-rare dressings and per-class weapon visual tiers land with content in Phase 4/5.)_
- **Phase 4:** wolf mount + 3 skins, gathering tools, potion/ingredient icons (2D, drawn as mini voxel renders), quest-item props.
- **Phase 5:** VFX sprites, UI kit final pass.

Keep this list updated as models land (check off in the phase's ROADMAP items; note additions here).

## 7. UI Art Direction

Wood-and-parchment panels with iron corner rivets (drawn as crisp 2D, _not_ skeuomorphic photos — flat colors from §1 palette, 2 px dark outlines, chunky 8 px-radius corners). Rarity colors: Common white `#F2F2F2`, Uncommon green `#5FBF4E`, Rare blue `#4EA3E8` (brighter than world-water blue for text readability), Epic purple `#A66FE8`. Font: one warm rounded sans for UI + one display serif for titles (bundled locally, open-licensed). Icons: mini voxel-render style, 64 px grid. Damage floaters: white physical, class-colored magic, ×1.5-size gold crits. Dark-parchment tooltip with item-level right-aligned — classic MMO grammar throughout.
