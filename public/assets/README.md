# Production assets

These are real binary downloads, not placeholders. `manifest.json` records the
API-selected sources, SHA-256 hashes, upstream MD5 hashes, dimensions/resolution,
and any processing or substitution. Runtime code reads this manifest.

| Use | Asset | Source |
| --- | --- | --- |
| Environment | `env/bay_dusk.hdr`, 2048 x 1024, >1 MiB | [Belfast Sunset PureSky](https://polyhaven.com/a/belfast_sunset_puresky) |
| Facades | `textures/concrete_layers_02/` | [Poly Haven](https://polyhaven.com/a/concrete_layers_02) |
| Streets | `textures/asphalt_02/` | [Poly Haven](https://polyhaven.com/a/asphalt_02) |
| Industrial steel | `textures/corrugated_iron_02/` | [Poly Haven](https://polyhaven.com/a/corrugated_iron_02) |
| Carbon fiber | `textures/carbon_fiber/` | [ambientCG Fabric004](https://ambientcg.com/view?id=Fabric004) |
| Articulated humanoids | `models/characters/Soldier.glb`, `Xbot.glb` | [Official three.js example models](https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf) |
| Capoeira motion library | `models/characters/capoeira_ybot.glb`, 39 clips, 5.64 MB | [Adobe Mixamo](https://www.mixamo.com/) |

All material maps are 2048 x 2048. Each set has diffuse, roughness and OpenGL
normal maps; industrial steel also includes its real metalness map. JPEG color
and scalar maps are served directly. Normal maps use lossless PNG. Only diffuse
maps use sRGB; roughness, metalness and normals remain linear.

`san_francisco_4` and `carbon_fiber` returned HTTP 404 from the Poly Haven API
during provisioning. The HDR uses the user-approved Belfast alternative. Carbon
fiber uses ambientCG's real CC0 Fabric004 set, queried from its public API. It is
not represented as a Poly Haven asset.

The upstream Soldier model has invalid accessor strides and some unnormalized
skin weights. The provisioning script repacks the GLBs with glTF Transform and
normalizes their weights; it does not simplify geometry, fabricate animation
clips or use lossy compression. The original download hashes are preserved.
Soldier has Idle, Run, TPose and Walk. Xbot has agree, headShake, idle, run,
sad_pose, sneak_pose and walk. Capitalization is handled by the animation loader.

Poly Haven and ambientCG textures/HDRs are CC0. The menu includes the required
Poly Haven API credit. The three.js license is retained in
`licenses/threejs-LICENSE.txt`; model provenance remains in the manifest.

## Provision and verify

```powershell
npm ci
npm run assets:fetch
npm run assets:verify
npm run build
```

The downloader uses `User-Agent: CrackupAssetPipeline/1.0`, bounded retries,
streaming downloads, `.part` files, exact upstream sizes and MD5 checks where
available. Failed downloads do not become finished assets. Baseline model source
files and the ambientCG ZIP are cached outside the public tree under
`.cache/prod-assets/`. Reprovisioning preserves a previously verified custom
Mixamo model and its manifest entry.

For a real browser/WebGL check, run:

```powershell
node scripts/verify-prod-assets.mjs --serve
```

Open the printed localhost URL. It imports the production loader, loads every
manifest asset, checks dimensions/color spaces, plays every GLB clip, checks
independent cloned skeletons, disposes an avatar, compiles materials, and renders
the surviving avatar and textured objects. Results are saved to
`.cache/prod-assets/browser-verification.json`. Offline checks save to
`.cache/prod-assets/verification.json`.

## Installed Mixamo Capoeira pack

The project owner's real `Capoeira Pack.zip` is preserved under
`asset-inbox/packages/mixamo-capoeira/`, with Y Bot and 39 original FBXs in
`extracted/`. Build intermediates stay in `.cache/prod-assets/capoeira/`.

```powershell
npm run assets:capoeira
npm run assets:verify
npm run verify:stage3d
npm run assets:preview
```

The preview prints a local URL with a 39-clip selector, original Y Bot and the
retargeted game armor side by side, weapon variants and a combined city view.
The build uses FBX2glTF at 30 fps and glTF Transform CLI merge/resample, checks
joint hierarchy and transforms, rebinds every take to the one base skeleton,
and records source/output SHA-256 hashes. The short base bind-pose take is
discarded; it is not presented as an Idle animation. The GLB has zero errors
and two non-fatal upstream skinned-node hierarchy warnings.

`MixamoMotion` adapts source bind axes and the extra spine joint to the existing
19-joint armor rig. The third melee strike uses **armada**, fitted to the existing
0.28-second presentation window with a short blend, using the source's
1.05–1.50s kick/recovery interval rather than its opening footwork. World X/Z motion and damage
timing remain authoritative. All 39 clips are available for preview/integration;
the other 38 are not new player actions. Unsupported states retain procedural
animation. No hidden per-player GLB clone is needed. See [Mixamo provenance](licenses/Mixamo.md).

## Separate seven-animation starter pack (pending)

The original Idle/Run/Jump/Punch/Kick/Hit/Dying download batch is still incomplete;
`agent_cyber.glb` has not been fabricated or replaced by the Capoeira file. Continue
using **Y Bot** for compatible additional downloads from this library.

Use the same selected character for every download, FBX Binary, 30 fps. Download
Idle **With Skin** as the base character. Download the remaining animations
**Without Skin**. Use in-place Fast Run for network-authoritative movement.
Move the completed files from Downloads into `.cache/prod-assets/mixamo/` with
these names:

```text
Idle.fbx
Fast Run.fbx
Jump.fbx
Punching Combo.fbx
Roundhouse Kick.fbx
Hit To Body.fbx
Dying.fbx
```

```powershell
npm run assets:mixamo
npm run assets:verify
node scripts/verify-prod-assets.mjs --serve
```

The converter bakes at 30 fps with the installed native FBX2glTF executable,
merges using `@gltf-transform/cli`, rebinds animation channels to the base rig by
joint name, checks bind-transform compatibility, removes duplicate skeletons,
resamples, validates and atomically writes
`models/characters/agent_cyber.glb`. A bare CLI merge would retain separate rigs;
the rebinding step is required. Missing/incompatible clips fail the build.
Successful builds update the manifest with source FBX hashes and all seven clip
names. The loader can select this model when its verified entry exists; visible
gameplay-rig integration remains a separate step in the current client.

Soldier/Xbot remain installed and loader-verified. Gameplay renders the armored
class rig with the selected retargeted Capoeira move. Replacing its appearance
with a new skinned hero remains a separate art/integration task.
Procedural builders remain available for characters, effects and world geometry.

For the prioritized next acquisitions and the local download inbox, see the
[asset sourcing and Codex handoff guide](../../docs/ASSET_ACQUISITION_GUIDE.md).

## Stage 4 texture packs and vista

`ProductionAssetManager` now inherits the PBR texture library. Its
`replaceMaterialPack(name, maps)` API validates complete diffuse/normal/roughness
sets with optional metalness and emissive maps, accepts PNG/JPEG/WebP/KTX2,
updates bound materials atomically and retains the last valid pack on failure.
New materials have deterministic procedural fallback maps. World surfaces use
metres per tile; animated character materials retain their existing UV mapping.
Color/emissive maps use sRGB; normal/scalar maps stay linear. Owned texture clones
are released when their material is disposed.

Basis Universal transcoders are copied from the installed Three.js distribution
under `transcoders/`, with its README and Apache license. Browser QA downloads a
pinned official Three.js KTX2 fixture into ignored output solely for codec testing;
it is never used as game scenery. The WebP check converts the existing real
Poly Haven concrete albedo. Run `npm run verify:stage4`, `npm run vista:preview`
and consult the saved Stage 4 browser evidence.
