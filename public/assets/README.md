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

## Mixamo combat pack

The browser bridge was unavailable during acquisition. **No Mixamo FBXs were
downloaded and no `agent_cyber.glb` has been fabricated.** The conversion tool is
installed and the build script is ready, but end-to-end conversion is pending
real source downloads and browser validation of the resulting file.

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
names. The runtime selects this custom model when its verified entry exists.

The baseline Soldier/Xbot models remain available to the asset loader. Their
clip sets do not cover the full required combat state machine, so the articulated
procedural rigs are the active character fallback. Rich procedural builders
also supply world geometry when a validated optional model is unavailable. Acquiring the combat clips does not by itself implement every combat
animation transition; gameplay-driven combat playback remains a separate task.
