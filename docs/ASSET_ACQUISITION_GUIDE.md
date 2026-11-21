# CRACKUP asset acquisition and Codex handoff guide

Reviewed against this checkout and the linked publishers on **12 November 2026**.

## What is worth getting next

Prioritize **animation, distinctive characters/weapons, authored sound, and a
small coordinated environment kit**. The project already has a real HDR, four
2K PBR sets, Soldier/Xbot rigs, and substantial procedural art. Additional generic
textures have less immediate value than making movement, impacts, weapons and
the opening district feel finished.

AAA presentation is a quality target. Downloads supply ingredients; the result
still depends on consistent art direction, animation blending, lighting, sound
mixing, readable combat, stable multiplayer and performance on a declared minimum
machine. The first acquisition milestone is one polished **Neon Docks opening
operation**, then expansion into the other districts.

**You do not need to manually collect everything.** Your most useful web tasks
are account-only Mixamo downloads, choosing/purchasing licensed packs, and
commissioning original character art, animation or voice work. Codex can attempt
public CC0 downloads and use texture APIs from the links below; a source site may
still require a manual browser step. Buying a pack is optional; the first batch
can be free.

## Current inventory and integration reality

| Already present | Current implication |
| --- | --- |
| Belfast dusk HDR; concrete, asphalt, iron and carbon-fiber 2K maps | Enough to start a coherent lighting/material pass. Keep the current files. |
| Soldier and Xbot GLBs with locomotion clips | Useful reference rigs and loader checks. They are not finished faction characters. |
| Nineteen-joint procedural humanoids, class/enemy silhouettes, hit reactions and counters | New skins/animation must preserve joint-driven hitboxes, readable silhouettes and authoritative combat timing. |
| Detailed ArchBuilder, VehicleBuilder and RelayBuilder | Buy adaptable parts and source meshes. Existing gameplay geometry and destruction impose tighter requirements than a generic GLB viewer. |
| Procedural orb/combat tones | Recorded footsteps, impacts, weapon and vehicle layers can materially improve perceived quality. |
| WeaponBuilder, Stage 4 PBR/bay/bridges, Stage 5 effects/spatial audio and Stage 6 cinematics are implemented and verified | Release qualification is next. Bespoke hero/boss art, recorded sound and scenery remain refinement work. |

The visible character uses `HumanoidRig` and `SkeletalAnimator`. The real Capoeira
Armada clip is retargeted onto that armor for the third melee strike; the other
38 clips can be inspected in the motion studio. The unused hidden character
clones have been removed. New skins and locomotion clips still need explicit
rig adaptation and gameplay-state mapping. The model-loader checks do not
replace building, vehicle, relay or weapon attachment contracts.

## Acquisition order

Quantities are a proposed first-batch scope, not statements about what a pack
contains. Select files from a pack after previewing them.

| Priority | Get | First useful delivery | Where it helps | Who should handle it |
| --- | --- | --- | --- | --- |
| P0 | Combat and locomotion animation | Seven original Mixamo clips; then strafing, jump/landing, aim, reload and reactions | Movement/combat feel; imported-rig work | You for authenticated Mixamo; Codex for conversion/retargeting |
| P2 | Hero weapon refinement | One service rifle and one heavy/energy variant with separate parts | Refine the verified three-variant WeaponBuilder | Optional source kit or commission; no longer a stage blocker |
| P0 | Gameplay sound | A curated 40–60-file set: footsteps, impacts, guns, counters, vehicle and UI cues | Refine the implemented Stage 5 synthesized sound identity | Codex can provision CC0; you select/commission final sound identity |
| P1 | Distinctive character skins | One agent, one light enemy and one heavy enemy in the same design family | Main silhouettes and close camera | You choose source/artist; Codex adapts rigs/materials |
| P1 | Docks/industrial dressing | Approximately 12–20 repeatable props/modules plus one sign/decal atlas | Lived-in city and parkour route landmarks | Codex can acquire a coordinated CC0 kit |
| P1 | Small material expansion | White ceramic, rubber, grating and painted/rusted metal; a few decals | Faction contrast and Stage 4 | Codex can use existing public APIs |
| P1 | Particle textures | A small atlas of sparks, smoke, muzzle flash, shockwave and skid/impact marks | Stage 5 pooled effects | CC0 textures; Codex implements Three.js effects |
| P2 | Two adaptable vehicle bodies | Agency interceptor and Syndicate cruiser with removable panels | Vehicle identity/destruction | Artist/pack selection requires checking source hierarchy |
| P2 | Vista components | Bridge detail modules, shoreline rocks, hill/terrain source and distant silhouettes | Stage 4 Bay Area vista | Usually procedural/commissioned adaptation; no full city purchase needed |
| P2 | Voice and music | Three short cast auditions and a small adaptive music/stinger set | Narrative identity; later cinematics | You commission/select; Codex handles cues, subtitles and mixing |
| P3 | Boss, cyber-pets and cinematics | Modular Dreadnought parts; one pet rig per locomotion family | Final encounters and late polish | Original commission after earlier stages stabilize |

## Verified source shortlist

Use publisher pages to obtain the actual pack; these are source pages, not
invented binary download URLs. Save the license that applies to your download.
Free tiers can contain only part of a publisher's full catalog.

| Source | What to obtain | Cost/license route | Fit and remaining work |
| --- | --- | --- | --- |
| [Adobe Mixamo](https://www.mixamo.com/) and [official FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html) | Original seven clips, then selected movement/reactions | Free Adobe ID; FAQ permits game use | Best match for the existing seven-FBX converter. Account/download steps may need you. |
| [Quaternius Universal Animation Library](https://quaternius.com/packs/universalanimationlibrary.html) | Standard/free library in GLB/FBX, with its supplied rig | Publisher lists CC0 and a free tier | Useful locomotion/combat expansion. Verify which clips are in the chosen tier. Its rig requires retargeting; it is not an input for the Mixamo-only merger. |
| [Quaternius Sci-Fi Modular Gun Pack](https://quaternius.com/packs/scifimodularguns.html) | glTF or FBX source; choose two assembled guns and compatible parts | CC0 | Practical first WeaponBuilder source. Codex adds game sockets, materials and effects. |
| [Quaternius Sci-Fi Essentials](https://quaternius.com/packs/scifiessentialskit.html) | Selected robots, screens, crates and source textures | CC0; standard/free tier available | A coordinated prop/enemy starting point. Preview its simplified silhouettes before choosing hero assets. |
| [Quaternius Modular Sci-Fi Megakit](https://quaternius.com/packs/modularscifimegakit.html) | A small set of wall/door/industrial modules matching Essentials | CC0; free and expanded tiers | Works as one design family with Essentials. Engine-specific shaders need a Three.js implementation. |
| [Kenney City Kit Industrial](https://kenney.nl/assets/city-kit-industrial) | Selected background industrial pieces | CC0 on publisher page | Appropriate for distant/set-dressing use; preview against the existing more detailed architecture. |
| [Kenney Sci-fi Sounds](https://kenney.nl/assets/sci-fi-sounds) and [Impact Sounds](https://kenney.nl/assets/impact-sounds) | Selected clean effect files with variants | CC0 | Good free source layers. Final weapon/vehicle identity still needs selection, layering and mixing. |
| [Sonniss GameAudioGDC](https://sonniss.com/gameaudiogdc/) | Select useful foley, machinery and environment recordings | Free bundle under its [current license](https://sonniss.com/gdc-bundle-license/) | Audition and shortlist before downloading a large archive. The catalog challenged automated access during this review; use your browser if needed. Save terms at download time. |
| [Kenney Particle Pack](https://kenney.nl/assets/particle-pack) | Selected transparent particle sprites | Free publisher pack; retain included license | Texture ingredients; no automatic particle system import. |
| [Kenney Input Prompts](https://kenney.nl/assets/input-prompts) | Keyboard/mouse glyphs first | CC0 | Improves onboarding. Controller icons alone do not implement controller support. |
| [Poly Haven textures](https://polyhaven.com/textures) / [ambientCG](https://ambientcg.com/list) | Only missing surface types and useful masks | CC0 asset route | Existing provisioning handles the initial material sets. New materials still need registration and styling. |
| [Synty POLYGON Sci-Fi City](https://syntystore.com/products/polygon-sci-fi-city) | Optional coherent city/character/weapon source collection | Paid; [current one-time license](https://syntystore.com/pages/one-time-purchase-licence) | Conditional shortlist, not a purchase recommendation yet. Publisher provides FBX source and says characters have no animations. Preview the low-poly direction and confirm workflow/seat/source-sharing/AI provisions before purchase. |

For a free first batch, use **one animation route, the modular gun kit, selected
Essentials/Megakit pieces, and the two Kenney sound packs**. These give Codex
enough source material to develop a representative opening operation without
waiting for a large purchase.

For money spent toward a distinctive finished game, prioritize an original agent
and two faction designs, a short combat/parkour animation cleanup pass, and a
sound designer's opening-mission mix. A new generic environment bundle is lower
priority until that sample defines the final style.

## Exact Mixamo instructions

### Current project status (November 12, 2026)

Your **Capoeira Pack worked**. The original ZIP and all 40 FBXs are already in
`asset-inbox/packages/mixamo-capoeira/`. No further manual move is needed.
The built `public/assets/models/characters/capoeira_ybot.glb` contains the Y Bot
skin and 39 real motion clips. `npm run assets:preview` opens a local motion
studio so you can compare every source move with the game's armored rig.

The third melee strike now uses Armada. The remaining motions are available
for integration, rather than automatically gaining new gameplay controls.
The seven-clip starter converter below still exists separately. Its missing
files do not prevent use of the Capoeira library.

**Keep Y Bot selected for your next batch.** Useful next downloads are locomotion
(Idle, Walk, in-place Run), jumps/landings, rifle aim/fire/reload, and hit/death
reactions. More Capoeira variants are lower priority now. The controlled Stage 3
and Stage 4/5/6 implementation gates pass. In-engine opening and boss cameras
work with the current assets (`npm run cinematics:preview`). Stage 5 already has working
synthesized HRTF cues; prioritize a coherent final sound set and the missing
locomotion/reaction clips over additional scenery packs. Preview current cues
with `npm run effects:preview` before acquiring replacements.

### Required traversal pack follow-up

For the November 19 living-city program, use the [traversal animation pack specification](TRAVERSAL_ANIMATION_PACK_SPEC.md). It defines the required jump anticipation/arm motion, ledge reach/catch/hang/mantle, landing compression and fall-damage recovery, with 20 runtime coverage rows and free-tier source verification. The old seven-file Mixamo merger and installed Capoeira library do not by themselves establish this coverage. Current no-spending constraints govern this work; older optional paid suggestions in this guide are not authorization to purchase anything.

### One character can use many animations

“Keep the same character selected” means **one consistent source body/skeleton
for many downloaded movements**. It does not limit the character to one action
or to the original seven clips. The people/robots shown on animation thumbnails
are demonstrations. Click an animation card to preview that movement on the
character selected in the editor; Adobe describes this workflow in its
[animation instructions](https://helpx.adobe.com/creative-cloud/help/animate-characters-mixamo.html).

**Y Bot** is now our consistent source character from your downloaded pack. Select
it in the **Characters** tab, then browse as many actions as needed in the
**Animations** tab. Your final game character can have different armor/appearance;
Codex must adapt or retarget these movements to the final gameplay rig.

For example, the same selected Y Bot can preview Idle, Jumping Down, a punch,
a taunt and a dance in succession. Download the base once **With Skin** (body
mesh, rig and animation). Download additional actions **Without Skin** (rig and
animation, without another copy of the body mesh). Keep FBX Binary and 30 fps
consistent.

Most humanoid movements are useful source material, but preview success does
not guarantee finished gameplay. Landing contacts, weapon grips, root movement,
loop seams and transitions still need checking. An archery or sword animation
also needs the corresponding prop and gameplay; downloading the motion does not
implement that weapon system.

You can collect a broader library now. Keep the seven starter clips identifiable,
and put additional real downloads in
`asset-inbox/packages/mixamo-combat/extras/` with their original names. Prioritize:

| Group | Useful additions |
| --- | --- |
| Movement | Walk, run/sprint, directional strafes, backpedal, starts/stops, crouch-to-stand |
| Parkour | Jump, falling/air poses, jumping down/landing, vault and climb/mantle candidates |
| Combat | Rifle idle/aim/fire/reload, punches, kicks, hit reactions, stagger, dying/get-up |
| Personality | Taunt, victory/defeat, sitting, laughing and selected dances/emotes |

From the example library view, **Basic Shooter Pack**, **Reaction**, **Shoved
Reaction With Spin**, **Jumping Down**, **Crouch To Stand** and selected **Dying**
clips are sensible candidates to inspect. Packs are collections of actions, not
a requirement to change the selected character. Inspect their actual contents
before choosing the motions for this game's controls.

`assets:mixamo` processes the seven named starter files; `assets:capoeira` handles
the complete supplied Capoeira pack. Other packs remain available for Codex to
catalog and integrate with explicit state/blending mappings. Their presence on
disk does not automatically add player actions.

### Starter download procedure

1. Log into Mixamo and select one biped character. Keep that **same character**
   selected for every animation in this batch.
2. Preview Idle. Download **FBX Binary**, **30 fps**, **With Skin**. This is the
   base character file, not a separate unrelated rig.
3. Preview/download Fast Run, Jump, Punching Combo, Roundhouse Kick, Hit To Body,
   and Dying as **FBX Binary**, **30 fps**, **Without Skin**. Choose **In Place**
   for Fast Run when that option is available. Keep keyframe reduction at None
   where offered. Preserve visible names/settings in your package notes.
4. Save files under `asset-inbox/packages/mixamo-combat/`. Save a copy of the
   applicable terms/FAQ and source information there. Codex will keep originals
   and make build copies with these exact filenames:

```text
Idle.fbx
Fast Run.fbx
Jump.fbx
Punching Combo.fbx
Roundhouse Kick.fbx
Hit To Body.fbx
Dying.fbx
```

5. If a search label has changed, keep the real animation you found and describe
   it. Codex must check whether it meets the role and update mappings rather than
   treating a renamed unrelated clip as a match.

The existing converter expects copies in `.cache/prod-assets/mixamo/` and runs
with `npm run assets:mixamo`. It is a **seven-clip baseline**, not a complete AAA
combat set. It does not retarget arbitrary rigs or add gameplay transitions.

After this baseline, acquire directional strafes/backpedals, sprint start/stop,
jump ascent/air loop/landing, mantle/vault, rifle aim/fire/reload, directional
flinches, knee stagger/get-up and weapon-drop reactions. Paired counters require
two synchronized roles with matching timing/contact markers; separately found
attacker/victim clips are not automatically a usable pair. Preserve the current
server windows while blending or time-warping presentation.

## What to request from a character or asset artist

Our style is stylized PBR with ink outlines, strong silhouettes and restrained
emissive accents:

- Aegis: white ceramic, gunmetal, cyan/cobalt.
- Syndicate/Foundry: industrial hazard yellow, worn steel/rust, amber/crimson.
- Resistance: matte carbon, copper, emerald telemetry.

Ask for original designs, editable source, a clean neutral T/A pose, a named
humanoid skeleton, deformation examples, UVs, source texture maps and lower LODs.
Request one shared body/rig family with interchangeable faction armor where
possible. Supply `client/animation/humanoidRig.ts` and the rig/joint mapping as
technical references. Stock skins must preserve class and enemy readability.

For weapons request separate receiver, magazine, barrel and optional moving
parts, a hand grip point, correct muzzle direction and a separate emissive mask.
For vehicles request independent wheels, doors, hood and trunk plus their pivot
locations. For relays/bosses request separate damageable modules. A single fused
sculpt is expensive to adapt to the current destruction systems.

For recorded narrative audio, use the existing Vance, Sera Lin and Kaelen Voss
dialogue/story bible. Start with short auditions rather than the entire script;
request clean dry takes, alternate deliveries, agreed commercial game rights,
speaker/line IDs and transcripts. Music should include loopable exploration and
combat layers plus transition/victory stingers, with loop/BPM notes. Voice casting
and a finished score are later work after the playable route and timing settle.

## Download formats and proposed import targets

These are **starting targets for review**, not established engine limits or
measured performance guarantees. Codex can optimize an appropriate source asset.

| Asset | Ask for | Suggested first LOD/material scope |
| --- | --- | --- |
| Hero humanoid | GLB/glTF or rigged FBX plus textures; editable source if available | 20–40k triangles, 2–4 materials; lower LODs |
| Repeated enemy | Same rig family; separate equipment | 10–20k triangles, 1–3 materials |
| Third-person weapon | GLB/glTF or FBX; named/independent components | 5–12k triangles, 1–2 materials |
| Drivable vehicle | Editable hierarchy and separated damage panels | 15–30k triangles, roughly 3–6 materials |
| Repeated prop | GLB/glTF; shared atlas/material family | Roughly 0.3–3k triangles, usually one material |
| Material | 2K base color, OpenGL normal, roughness, optional metalness/emissive | PNG/JPEG maps, actual dimensions and channel packing recorded |
| Spatial sound | Clean WAV master, preferably 48 kHz; several variations | Mono point sources; stereo ambience/music; loop notes |
| Sprite/decal | PNG with alpha, atlas coordinates and clear usage | Small shared atlases; avoid many large transparent layers |

Source GLB/glTF is preferred for review; FBX is useful for editable/rigged source.
An OBJ can help with static geometry but does not carry a usable animated rig.
Keep `.gltf`, `.bin` and texture folders together. Preserve master sources; Codex
prepares smaller runtime exports.

Use meters, Y-up and a documented forward axis. This game's rigs/weapons use
forward **-Z**; Codex can add a wrapper rotation for a different source convention.
Applied transforms, useful ground/pivot origins and separated parts reduce work.

Current `ProductionAssetManager` does **not** configure Draco, Meshopt or KTX2
decoders. Obtain uncompressed source versions; decoder setup/verification must
precede promoting compressed exports. PNG/JPEG maps work today. Base color and
emissive color are sRGB; normals, roughness, AO and metalness are linear. Existing
offline checks currently assume 2K square material maps; extend those checks
deliberately when introducing atlases or lower-resolution maps.

## Game-specific contracts Codex must preserve

You only need to obtain adaptable source. Codex/Blender can author the required
nodes and transforms. Renaming nodes alone does not satisfy collision alignment.

| System | Required adaptation |
| --- | --- |
| Humanoids | Retarget to the visible gameplay rig or implement an imported skinned-rig adapter; preserve aim layers, joint hitboxes, class silhouette, reactions and counter timing. Imported skins still require explicit gameplay-state integration. |
| Weapons | Loader minimum: `Grip`, `MuzzleFlashEmitter`. Stage 3D already verifies equipped/dropped/disarmed variants and muzzle direction. A replacement must preserve those contracts. |
| Buildings | Loader requires `Entrance`, `RoofEntry`, `Helipad`. `ArchBuilder.attachModel` checks their world positions against each building plan, ground origin, footprint and height. Preserve shared parkour ledges/colliders; use acquired modules to dress existing plans. |
| Vehicles | `WheelFL/FR/RL/RR`, each with matching `Steer*` then `Axle*` children; `PanelHood`, `PanelLeftDoor`, `PanelRightDoor`, `PanelTrunk`; `FullWidthTailLightBar`, `WallThrusterPlume`, headlights. Pivots, panel transforms and bounds must match `shared/vehicles/vehicleDefinition.ts`. |
| Relays | `Terminal`, `CoolingVent` are only loader minima. Attachment also validates `BunkerBase`, `TwelveMeterLattice`, `PlasmaTubes`, `HolographicDisplay`, `TerminalRing`, three vent assemblies and `DishPivot1/2/3`, with positions/bounds in the shared relay plan. Use kit pieces around the preserved interactable structure. |
| Dreadnought | Preserve four independent engine targets, two flak turrets and the reactor/phase structure. Request separate editable modules rather than a fused spaceship. |
| Cyber-pets | Separate quadruped/bird/insect rig needs. Mixamo's biped route does not cover these; preserve each pet's locomotion and gameplay dimensions. |

The loader currently recognizes model kinds `building`, `vehicle`, `relay` and
`weapon`; generic props, standalone audio and VFX need additional integration.
New textures also need material/manifest registration. Changing one manifest
entry does not implement those missing systems.

## City/vista details worth collecting

Choose 12–20 useful pieces across vents/HVAC, tanks/pipes, electrical cabinets,
cable trays, antennae, kiosks, barriers, container details, bollards, lamps,
seawall fixtures, original faction signs and ground grunge. Prefer repeatable
modules with common materials and editable masks. Keep the relay approach and
parkour silhouette clear; decorative collision should not block an existing route.

For the bay, bridge pylons/cable details, shoreline rock modules and distant
terrain silhouettes are enough source material. The 10 km water plane,
dusk/night lighting, fog, bridge spans and terrain assembly are Stage 4 engine/art
work, now implemented and verified. These downloads are optional refinement.
The bridges, bay and current lighting do not require another purchase.

The saved Stage 3C city view already records **2,895 draw calls**. Treat this as a
profiling signal, not spare capacity for many unique prop materials. Share
materials, instance repeated pieces, author LODs, profile the combined route and
add staged loading before expanding the catalog. New full-city scenery is lower
priority than minimum-hardware profiling; the controlled Stage 3 gate has passed.

## Make downloads available to Codex

1. Download to your normal Downloads folder, then copy each actual pack to:
   **`C:\Users\travi\Documents\Python_Projects\crackup\asset-inbox\packages\<pack-id>\`**.
2. Keep original archives and original file names. Optionally extract into
   `extracted/`. Preserve licenses, readmes, texture folders and source files.
3. Copy `asset-inbox/metadata.template.json` into the package as `asset.json`.
   Fill creator, source page, download date, license filename, intended use,
   preferred files and attribution. Unknown rights stay `null`, not assumed true.
4. Run **`npm run assets:intake`**, or tell Codex to run it. It creates local
   `asset-inbox/index.generated.json` and `.md` with the files actually present,
   hashes and basic GLB/image metadata. Archives are recorded without extraction.
5. Give Codex this handoff:

> Read docs/ASSET_ACQUISITION_GUIDE.md and asset-inbox/index.generated.json.
> Integrate PACKAGE-ID into the Neon Docks opening operation for PURPOSE.
> Check its source/license, inspect the real contents, preserve the current
> gameplay/collision contracts and procedural fallbacks, implement any adapters,
> and report verification and rendering cost before promoting runtime assets.

Keep raw packs in this inbox until reviewed. Both packages and generated indexes
are Git-ignored. Codex sees them in this local workspace; ignored files must be
transferred separately and privately for a cloud/other-machine checkout. A receipt
or a URL does not supply the model/audio files. Keep purchase receipts privately;
put license terms and a non-sensitive entitlement note in the package.

CC0 is the simplest route for versioned source assets. Commercial packs, Mixamo
and audio libraries have their own conditions: permitted use inside a finished
game does not automatically permit distributing the raw pack in a public code
repository. Synty's current terms additionally address source access and
generative-AI/model-generation uses; confirm the intended workflow if unclear.
Sonniss distinguishes finished projects from distributing sound libraries and
prohibits AI-training uses. These are vendor-specific limits to record, not a
blanket ban on deterministic asset conversion. Use the publisher's applicable
terms, not a label such as “free” or “royalty-free,” to decide promotion.

## Codex integration and acceptance sequence

1. Index and inspect the actual sources. Record gaps without manufacturing a
   missing model, clip, map, source URL or permission.
2. Select the smallest coherent subset; preserve masters. Review terms and any
   required credits before copying runtime exports into `public/assets/`.
3. Normalize units/origins, repair export issues, adapt rigs/sockets, map clips and
   implement material/shader/audio hooks. Preserve the completed Stage 3/4/5
   gates, including bounded effect/audio pools and counter contact timing.
4. Update `public/assets/manifest.json` and relevant verification coverage for
   the actual new asset types. The current fetch/verify scripts were built for
   the baseline files; review their assumptions before rerunning provisioning
   over a broader custom manifest.
5. Verify geometry, animation binding/contact, world collision, destructible
   pivots, disposal and missing-file fallback. Test all required motions/events.
6. Run relevant build/regression checks and a browser scene with representative
   player/enemy counts. Measure draw calls, frame time, texture memory, payload
   and loading pauses on the chosen minimum machine. Listen for clipped/repeated
   sound, bad loops, excessive voices and spatial cues that obscure objectives.
7. Walk the opening route in co-op, capture before/after evidence, then update
   the progress ledger only for stages that actually pass.

**A first acquisition batch is enough when** Codex can attempt a coherent agent
and two enemies, two weapons, a dressed relay approach and a curated sound/effect
set. Final character quality, bespoke paired combat, voice, boss art and
production performance remain their own acceptance work.
