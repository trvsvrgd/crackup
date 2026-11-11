# Section 6 upgrade: Stages 1, 2 and 3A-3C

Completed and verified on November 11, 2026. This report concerns the new art/narrative pipeline stages, separate from the existing Phase 1-6 gameplay roadmap.

Current checkpoint: Stage 3C relays is complete. Stage 3D weapon consolidation and the full Stage 3 integration gate are next.

## Stage 1: complete

- `shared/narrative/storyBible.ts` defines the three acts, Vance/Sera/Voss profiles and visual descriptions, branching dialogue with valid terminal paths, ordered milestone prerequisites, and twelve Whisper Orb transcripts.
- `client/narrative/tacticalComms.ts` delivers live typewriter subtitles, animated 3D wireframe portraits, faction colors, synthesized voice cadence with mute control, timed/default dialogue choices, and local per-callsign presentation progress.
- Gameplay supplies authoritative Whisper Orb and non-lethal bounty counts, district relay progress, Citadel Loop III and Dreadnought defeat milestones.
- `client/shaders/factionPalette.ts` supplies Aegis, Syndicate/Foundry and Resistance PBR palettes, illustrated lighting bands and a directional white hit rim.
- `client/shaders/inkOutlinePass.ts` implements a full 3x3 Sobel kernel over scene normals and linearized depth, at 1.5-pixel sample spacing, before output color conversion. Render state and resize resources are restored correctly.

Stage 1's build and narrative/material/resource verification passed before Stage 2 implementation began.

## Stage 2: complete

- Shared articulated client rig with nineteen named joints: pelvis, spine, chest, neck, head; two clavicle/upper-arm/forearm/hand chains; and two thigh/calf/foot chains. Each joint is an actual Three.js Bone with attached bevelled armor meshes.
- Four enemy silhouettes: Street Enforcer, Cyber-Ronin, Aegis Shock-Trooper and a 3.2m Sector Warden. Five player augment silhouettes retain their distinct armor, blades, flight vanes, ordnance and squad/medical hardware.
- Fixed 60 Hz procedural animation, interrupted-transition cross-fades, render interpolation, breathing/walk/sprint, rise/apex/fall, landing roll, ledge hang/mantle, aim and recoil layers, three melee strikes, ground slam, knockback, knee-drop, disarm, blind stagger, windup and paired counter roles.
- Every weapon, melee, thrown-prop and explosion hit invokes the physical reaction path. Light hits apply a 180ms additive bone impulse and 60ms white rim flash. Leg cripples force a 2.5s knee-drop; arm cripples detach a visible multipart weapon backed by a dynamic Rapier body.
- Heavy hits and combo finishers apply 14m/s horizontal knockback. Swept capsules detect walls/vehicles above 8m/s, add 35 crush damage, and enter a 1.8s wall-splat slump with an impact marker.
- Q counters validate windup/history and obstruction, lock both participants for 0.65s, animate the two roles in a shared frame, disarm the attacker and preserve the established Strength Lv3 radial shockwave unlock. Movement input cannot break the lock.
- Three-hit melee cadence prevents held input from dealing damage every physics tick. Airborne melee starts a ground slam that resolves on landing even after the button is released.
- Disabling both legs of a living Omega bounty records an authoritative non-lethal capture and feeds Act II's alternate evidence milestone.
- A versioned 0x08 presentation packet replicates reaction timers, directions, impulses, archetypes, pair timing and dynamic dropped-weapon transforms to all observers, preserving existing 0x01-0x07 layouts. Removed/captured enemies and expired debris are cleaned up.

The current imported packs lack the complete required combat pose set; the rich procedural rig is the active visual fallback. Existing external model/texture loading remains available. Dash and agility trail cues remain in the agent renderer.

## Minimum entity fidelity

Existing structural modules and loose props now have multipart fallbacks with separate hardware, windows/columns where appropriate, materials and powered trim. Automated guards reject tested entity roots with fewer than three meshes or two materials. Existing vehicles, relay terminals and the new socket weapons are multipart hierarchies. Box/cylinder/sphere geometries remain valid as subcomponents and physics colliders.

ArchBuilder has now replaced the fallback assemblies for eighteen major buildings. VehicleBuilder, destructible vehicle panels and RelayBuilder are also complete; weapon consolidation and the full Stage 3 integration gate remain pending. Other loose world modules continue to use the minimum multipart fallback. This does not mark the full Stage 3 complete.

## Stage 3A: complete

- `shared/world/architecture.ts` derives building plans from the existing eighteen tower/control-building footprints, including four port crane/control facilities, Foundry/Helios/Aegis towers and two gateway buildings. Legacy structure IDs and all 549 legacy descriptors remain byte-for-byte unchanged.
- `client/builders/builderContract.ts` defines visual roots, named anchors, animated parts, materials, collision descriptors, model source, update and disposal. Reference-counted geometry/material/texture scopes let neighboring buildings share resources safely.
- `client/builders/ArchBuilder.ts` supplies district palettes, colonnaded external lobby vestibules, storefront glazing/awnings, upper podium windows, corner columns, instanced facade bays and rails, setbacks, roof parapets, HVAC fans/louvers, helipad markings, antennas, neon signage and district-specific crowns. Port buildings retain their crane booms and suspended cargo, with visible support cables.
- Existing solid podium volumes are preserved. Their recessed glazed entrances and accessible colonnades occupy an external vestibule rather than introducing walk-through interiors into the legacy collision boxes.
- `client/shaders/interiorMapping.ts` ray-intersects virtual room cubes behind each window, with wall/floor depth, furniture silhouettes and stable lit/unlit variation. It composes with both stylized PBR and the actual CSM shadow shader callback.
- New ledges follow an additive 4m vertical grid. Existing ledges take precedence within 2.4m to retain standing headroom; shelves that would intersect existing HVAC stepping stones, elevators, skybridges or crane booms are omitted. Original ledges, routes and orbital anchors are preserved rather than moved to force an exact uniform replacement grid.
- All 898 new ledge segments and the new columns, awnings, roof HVAC housings and parapets use the same shared collision descriptors as their visible instanced geometry. Antennas, tank details, fan blades and signage are cosmetic attachments. The live city contains 1,663 static structure descriptors in total.
- New surfaces are excluded from deterministic orb placement. Fixtures verify unchanged geometry for all original structures, all 182 orb transforms/waypoints and all district objective data. New colliders also pass explicit orb-clearance and mission-interaction clearance checks.
- Repeated shells, ledges, columns and windows use instancing; distant window/detail groups have visibility limits and distant fans stop updating. A dedicated disposal path releases building resources and post-processing targets.
- The asset manifest accepts optional building/vehicle/relay/weapon GLTF entries. Missing/invalid assets fall back independently. Building imports must retain meter units, the shared ground origin, required anchors and a compatible footprint/height; failed candidates and disposed clones are cleaned up. No new external art pack is required to play.

Optional manifest example: `models.building.foundry_stack_01 = { "url": "/assets/buildings/foundry_stack_01.glb", "requiredAnchors": ["Antenna", "Sign"] }`. Building entries always require `Entrance`, `RoofEntry` and `Helipad`; the other three builder categories have their own wheel/terminal/grip/muzzle anchor requirements.

### Stage 3A verification and rendering budget

- Fresh baseline build and full tests passed before implementation. The four representative buildings passed browser review and render-cost checks before enabling the eighteen-building rollout.
- `npm run build` and `npm run verify` pass, including the newly added `verify:stage3a` command.
- All 898 ledge segments pass real Rapier mantle detection at Agility 1, 3 and 5; four representative full controller vaults finish standing on their rendered ledges.
- Headless checks cover semantic building features, geometry/collider transforms, no duplicate ownership from nested building prefixes, LOD, shared-resource disposal, valid GLTF activation, and missing/malformed model fallback.
- Browser checks cover all four district prototypes, interior parallax, facade/roof views, CSM/Sobel integration and the actual city scene. Live authentication/rendering with the installed HDR/PBR assets also passes without console errors.
- The fixed city comparison view measured **1,654 -> 1,195 draw calls** (about 28% fewer) and **74,814 -> 92,982 triangles** (about 24% more) through the same post-processing pipeline. Prototype render budgets and the full-city limits (at most 15% more calls and 2.5x triangles) passed. These are one controlled browser/view comparison, not a hardware-independent FPS guarantee. CPU submission samples are recorded separately from GPU time.
- Browser artifacts: `output/playwright/stage3a-browser.json`, district/facade/roof PNGs and `stage3a-live.png`. Repeat with `npm run verify:stage3a:browser` and open the printed local URL.
- Live visual QA also exposed an existing ghost outline around transparent dash effects. The normal/depth ink pass now omits translucent effects and restores their visibility afterward; a browser pixel-comparison regression check passes. The comms overlay was moved clear of the health card.

## Stage 3B: complete

- `client/builders/VehicleBuilder.ts` replaces the legacy car assembly with a chamfered loft chassis, sculpted hood and trunk, raked windshield/rear glass and pillars, cabin roof, bucket seats/dashboard, wheel wells, bumpers/intakes, headlights, emissive underglow and a full-width brake bar. The exposed battery/power-cell bay appears after the hood detaches.
- Both Agency Interceptor and Syndicate cruiser palettes share reference-counted geometry/materials. Repeated rigid hardware uses instancing inside each independently animated part. Wheels have separate suspension, steering and axle transforms, with tread, rims/spokes and stationary calipers. Suspension derives from the same mounts/rest length as physics; wheel phase follows signed speed. Drivers use a seated pose with their firearm hidden.
- Shared vehicle/panel definitions supply chassis and roof damage sensors, panel transforms, dimensions and masses. Existing driving suspension, wall-thruster hops, vehicle spawns and the 0x05 packet remain compatible. The added roof sensor makes level-height shots hit the visible canopy; vehicle sensors also stop heavy enemy knockback for wall splats.
- Each vehicle starts at 1,000 HP. Strictly below 50% detaches the hood; strictly below 25% detaches both doors and the trunk. Each panel detaches once per generation, including damage that crosses both thresholds in one hit. Gunfire respects nearer enemies and cover, explosions deduplicate chassis/canopy hits and respect fixed cover, hurled props apply one kinetic hit, and hard bumper impacts have a 0.6s damage cooldown.
- Detached panels use real dynamic Rapier bodies with CCD, matching cuboid dimensions/masses, inherited vehicle velocity, outward impulse and angular motion. They collide with the ground/world, expire after 12 seconds and have a global oldest-first cap of 64. Their detached bits remain set after debris expires.
- Zero HP ejects the driver, disables mounting/thrusters and leaves a scorched wreck. After 20 seconds, the car returns to its original spawn with restored health/panels and an incremented generation; old debris is removed. Vehicle health/damage belongs to the active server session, rather than account persistence.
- Versioned little-endian packet 0x09 replicates health, generation, masks, wreck/brake state, respawn countdown, wheel phase and bounded debris transforms/velocities at the existing 30 Hz broadcast rate. Layout: 12-byte header, 24 bytes per car and 56 bytes per panel. Existing packets 0x01-0x08 retain their layouts. Client prediction cannot create authoritative damage; clients create/remove kinematic debris collision proxies from validated snapshots.
- The mounted HUD displays current vehicle HP and driving controls; local hits provide hit feedback and panel-detachment notices. Reconnect clears stale vehicle/debris snapshots, remote driver occupancy survives prediction, and renderer removal/disposal releases vehicle and panel resources.
- Optional GLTF entries `models.vehicle.interceptor` and `models.vehicle.syndicate-cruiser` activate only after validation. Models use meter units and an identity root; direct-root `WheelFL/FR/RL/RR -> SteerFL/FR/RL/RR -> AxleFL/FR/RL/RR` hierarchies must align to shared mounts. Direct-root `PanelHood/PanelLeftDoor/PanelRightDoor/PanelTrunk` must match shared transforms/scale; `LeftHeadlight`, `RightHeadlight`, `FullWidthTailLightBar` and `WallThrusterPlume` are required. Invalid templates stay on the procedural fallback without cloning every frame. Valid imported panel geometry is cloned into physical debris; imported wheel/light/thruster controls remain active. Tests use a synthetic valid model; no external vehicle art pack has been installed.

### Stage 3B verification and rendering cost

- A fresh build and full baseline suite passed before implementation. Final `npm run build` and `npm run verify` pass, including the new `verify:stage3b` CPU/physics and three-client network checks.
- Physics checks cover strict thresholds, once-per-life detachment, rotated panel transforms, mass/CCD, dynamic floor collisions, lifetime/cap and body/collider cleanup, ejection/respawn, roof and cover rays, nearer enemies, vehicle wall splats, blast/prop/crash damage and cooldown, malformed/offset packets, prediction proxies and remote occupancy.
- Three real WebSocket clients verify an actual binary fire input, both thresholds, matching debris transforms at a shared server tick, late joining, ignored forged damage messages, debris expiry without reattachment and a fresh respawn generation. Legacy driving and wall-thruster tests still pass.
- Browser verification renders healthy, damaged, wrecked and driving states through Stylized PBR and the Sobel outline pass, checks physical panel motion and wheel spin, and verifies resource cleanup with zero shader/WebGL errors. Live authentication, mounting, driving and vehicle HP display also pass using the installed environment/PBR pack.
- At the fixed 1280x720 browser view, the old vehicle measured **19 calls / 526 triangles** versus **97 calls / 9,094 triangles** for the detailed healthy model. Static hardware batching reduced the initial new-model 153 calls to 97. A four-vehicle view measured **373 calls / 36,358 triangles**. Isolated checks enforce 120 calls / 12,000 triangles; the four-vehicle check enforces 450 calls / 45,000 triangles. This fidelity increase has a real rendering cost; these controlled scene budgets are not an FPS guarantee or a new full-city benchmark.
- Browser evidence is under ignored `output/playwright/`: `stage3b-browser.json`, healthy/damaged/rear/wreck views and `stage3b-live-mounted.png`. Repeat with `npm run verify:stage3b:browser` and open its local URL.

## Stage 3C: complete

- Eight relay assemblies replace the old terminal shells. Each includes an octagonal bunker, hazard striping, a 12m lattice above the 1.6m base, three independently scanning parabolic microwave dishes with rims/feed horns/supports, pulsing plasma conduits and collars, three cooling vents with louvers/exposed coils, and a holographic control console.
- The original console foot points, terminal/core interaction rules, objective markers, lieutenant/kingpin requirements and district rewards are unchanged. The tower/bunker sits beside the console, linked by an embedded visual conduit. Deterministic placement excludes existing building volumes, saved orb positions, mission actors, extraction points, plaza-to-objective approach corridors and the central vehicle/prop area. The existing four core override beacons remain intact.
- Shared definitions supply the exact 16-vertex octagonal bunker hull and 56 oriented lattice members per relay. Rendering and Rapier consume the same coordinates. Each relay adds one fixed compound body with its base, structural members and three vent sensors: eight bodies and 480 colliders in total. Dishes, feed horns, hazard paint, console holograms and embedded conduits are presentation equipment rather than additional traversable solids.
- Each vent has 120 HP and accepts authoritative gunfire and explosion damage. Hits select the nearest vent, vehicle or enemy without damaging targets behind cover; static bunker/world geometry shields far-side vents from blasts. Breaking a vent hides its louvers and reveals glowing fins and a torn grille. This stage does not add loose vent debris or new melee/prop damage routes.
- One/two/three destroyed vents increase normalized heat by 0.04/0.12/0.25 per second. At full heat the relay shuts down: dishes park, plasma dims red and the console/ring shows the fault. After eight seconds, automatic reboot restores all vents, clears heat and increments the generation. Repeated hits cannot repeatedly break a destroyed vent.
- Overheating/shutdown is an optional presentation/destruction interaction. It awards no progression and never completes a terminal, weakens a mission boss or changes district completion requirements. Hacking remains available during shutdown. A hacked relay cools toward zero, uses green presentation, scans slowly and stops accepting vent damage.
- Versioned little-endian packet 0x0A broadcasts exact per-relay generation, individual vent HP, heat, mode, hack flag and reboot countdown at the existing 30 Hz rate: eight-byte header plus 28 bytes per relay, or 232 bytes for eight relays. Packets 0x01-0x09 retain their layouts. Decoding rejects malformed sizes/offsets, duplicate IDs, reserved fields, nonfinite/out-of-range data and inconsistent modes.
- Client prediction does not create relay damage or simulate local heating/reboots. Reconnect clears the relay snapshot and hides stale visuals until fresh authoritative state arrives. Exact A/B hack flags prevent the old count-only approximation from marking the wrong console green when B is hacked first. Local weapon hits give recoil/hit feedback and a one-time vent-disabled notice.
- Optional GLTF entries use `models.relay.district-0` through `district-3`. Models require meter units, an identity root, the original `Terminal` origin, `CoolingVent`, `BunkerBase`, `TwelveMeterLattice`, `PlasmaTubes`, `HolographicDisplay`, `TerminalRing`, `DishPivot1/2/3`, and positioned/oriented `CoolingVentLeft/Right/Rear` groups with `VentLouvers` and `VentExposedCoil` children. Bunker/tower bounds and interactive anchors must agree with shared collision geometry. Missing or invalid models retain the procedural fallback without per-frame cloning. Synthetic valid/invalid models are tested; no new external relay pack is installed.
- Fixed hardware is merged within rigid components while dishes and vent states remain independently controlled. Shared resource scopes, imported-model disposal and the Phase 5 renderer disposal path release their meshes/materials. Removed airship geometry now also releases its renderer resources.

### Stage 3C verification and rendering cost

- A fresh build/full-suite baseline passed before implementation. `npm run build` and `npm run verify` pass, including new `verify:stage3c` physics/model/protocol checks and three-client WebSocket tests. Legacy driving, combat, all four district loops, orb/layout fixtures and earlier art-stage tests remain passing.
- Physical checks cover all eight relay hulls, rendered lattice/collider transforms, capsule-swept plaza approaches, saved-orb clearance, vent break-once behavior, heat/shutdown/reboot generations, gunfire/static cover, nearer vehicle occlusion, blast shielding, prediction guards, malformed packets and body/material cleanup. All four district loops retain the living-kingpin core gate and complete normally.
- Three live observers verify an actual binary fire input, independent vent damage, heating and shutdown, matching state at a common server tick, late joining, ignored forged JSON/binary state, B-first hacking, automatic reboot and normal hacking afterward.
- Real-browser checks render all four district palettes, rotating dishes, damaged/shutdown/hacked states and the holographic console through CSM shadows and the Sobel ink pass. The city comparison uses the actual CSM/SSAO/bloom/Sobel pipeline. Shader checks report zero errors; resource and state-animation checks pass.
- Batching reduced a fixed-view isolated prototype from **184 to 94 calls**. The optimized isolated view measured **17,876 triangles**, versus **13 calls / 202 triangles** for the old terminal in the same framing and lighting pipeline. The city comparison measured **1,885 -> 2,895 calls** and **163,020 -> 382,200 triangles**. The checks enforce an isolated ceiling of 240 calls / 50,000 triangles and a city increment of at most 1,200 calls / 250,000 triangles. This is a measurable fidelity cost, not an FPS guarantee; the overall Stage 3 integration/performance gate remains open.
- Live authentication with the installed HDR/PBR assets and an actual H interaction advanced the objective to 1/2 and switched the correct relay to its hacked presentation, with zero browser console errors.
- Evidence is under ignored `output/playwright/`: `stage3c-browser.json` plus online, console, shutdown, hacked, city and live-game screenshots. Repeat via `npm run verify:stage3c:browser` and open its printed local URL.

## Verification

- `npm run build`: passed (strict TypeScript server/client compilation and browser bundle).
- `npm run verify`: passed Phase 1-6, alpha, Stages 1-2 and 3A-3C, including the combat, vehicle and relay network checks.
- Stage 1 checks dialogue reachability, both evidence routes, act/milestone prerequisites, no repeat transmissions, faction materials and depth/normal render-target lifecycle.
- Stage 2 checks rig topology and all nine silhouettes, finite animated transforms, 60/120Hz determinism, aim, physical reactions, real dropped-body motion, swept wall impacts, paired input locks, combo cadence, slam landing, non-lethal capture, malformed packets and multipart entity roots.
- Two live WebSocket observers received authoritative disarm reactions and physical weapon snapshots.
- Real browser verification rendered all nine rigs and the comms portrait through the Sobel pass, checked shader/WebGL errors and resize behavior: passed, zero errors. A live game authentication/render check also had zero browser console errors.
- The legacy Phase 3 verifier was updated to wait through the newly required knee-drop and combo cooldown before checking the existing chase-speed penalty and elite counter bounce.

Browser evidence is generated under ignored `output/playwright/`: `art-verification.json`, `stages-1-2.png` and `live-stages-1-2.png`. Run `npm run verify:art:browser` and open the printed local URL to repeat the render check.

## Dependency boundary

Stages 1, 2 and 3A-3C are complete. Stage 3D weapon consolidation and the full Stage 3 integration gate are next. Stage 4 textures/vista, Stage 5 effects/spatial audio polish and Stage 6 cinematic direction remain pending. No intro videos or cutscenes were generated. Cinematics must consume the finalized script, character designs and world art after Stages 3-5 pass their gates.

The implementation runs retained the existing deployment, persistence, asset and alpha-release work. The subsequent branch/commit/PR saving checkpoint is tracked in [the project progress ledger](artifacts/project-progress.md). Production deployment and release validation remain outstanding.
