# Section 6: next implementation steps

Plan prepared November 11, 2026 from the current source, PRD-Addendum.md and SECTION6_PROGRESS_REPORT.md. Stages 1-2 and Stages 3A-3C architecture/vehicles/relays are now complete and verified. Stage 3D weapon consolidation and the Stage 3 integration gate are the next implementation batch; the remainder of Stages 3-6 remains open.

## Execution rules

1. Complete and verify each stage before beginning the next. No cinematic production before Stages 3-5 pass.
2. Preserve the existing uncommitted work and gameplay systems. Extend shared world descriptors, combat events and network state where needed.
3. Generate visible traversable geometry and Rapier colliders from the same deterministic specifications.
4. Use real GLTF models when available and valid, with rich procedural fallbacks for loading/validation failure. Keep attachment names and gameplay anchors identical between the two paths.
5. Verify named functional features and actual appearance. Mesh/material counts alone cannot establish recognizable buildings, vehicles or relays.
6. At every stage gate, run the build, full regression suite, stage-specific checks and real-browser visual QA. Record screenshots, errors, render cost and relevant network costs in the progress report.

## First implementation batch: Stage 3A, architecture

Completed: four district prototypes passed the gate, then the builder was enabled for eighteen existing buildings. See SECTION6_PROGRESS_REPORT.md for verification, clearance rules and measured render costs.

### 0. Establish a fresh baseline

- Run `npm run build` and `npm run verify` before implementation.
- Capture current district views, climbing routes, a vehicle, a relay, weapon sockets and counter/disarm behavior at fixed camera positions.
- Record draw calls, triangles, frame time, memory and current snapshot traffic. Set explicit budgets against the captured baseline before expanding the whole city.

### 1. Define reusable builder contracts

- Define a builder result containing a visual root, named attachment/interaction anchors, animated parts, material references, owned-resource disposal and matching collision descriptors where applicable.
- Separate shared deterministic layout data from Three.js rendering. Extend the existing asset manifest/loader to support building, vehicle, relay and weapon models.
- Keep existing IDs and objective locations stable. Preserve the fallback path when assets are unavailable, malformed or missing required sockets.

### 2. Implement ArchBuilder

- Replace structural fallbacks with district-specific buildings: recessed podium/lobby entrances, colonnades, storefront glass, awnings, modular window bays and corner columns.
- Add 4m parkour ledges to the shared layout and matching Rapier geometry. Preserve existing routes and traversal fixtures while adding the new surfaces.
- Add a window interior-parallax shader with consistent room scale and lit/unlit variations.
- Add setback crowns, parapets, spinning HVAC fans, helipads, antennas, water towers where appropriate and vertical neon signs.
- Instance repeated window/column parts, share immutable resources and apply distance-based detail limits. Avoid multiplying draw calls per window.

**Checkpoint 3A:** One representative building per district is visually recognizable; every new ledge matches its collider and can be mantled at the intended agility levels; existing routes, objective access and orb placement still work. Expand the patterns citywide only after this checkpoint passes.

## Remaining Stage 3 batches

### 3B. VehicleBuilder and authoritative destruction (complete)

Completed: shared vehicle health/panel contracts, versioned 0x09 replication and physical debris were implemented before enabling the detailed meshes. The exact behavior and verification evidence are in SECTION6_PROGRESS_REPORT.md.

- Add server-authoritative vehicle HP, damage routing and persistent per-life panel states. Replicate health, detached components and bounded physical debris using a versioned extension that preserves existing packet layouts.
- Define exact threshold behavior: the implemented default is hood detachment on crossing below 50% HP, followed by doors/trunk below 25%. Each component detaches once per vehicle life and resets on respawn.
- Build a sculpted hood/bumper, raked windshield with pillars, cabin roof, trunk/fastback and wheel arches.
- Add headlights, brake light bar and underglow. Build four wheel hierarchies with tire tread, rims/spokes and calipers; keep steering, axle spin and suspension travel on separate transforms.
- Attach detached panels to real Rapier bodies, replicate their transforms, and bound lifetime/count/resource use.

**Checkpoint 3B: passed.** Driving and wall-thruster checks still pass; each wheel steers/spins/compresses correctly; both damage thresholds replicate exactly once to two observers and a late joiner; detached panels collide and clean up.

### 3C. RelayBuilder (complete)

Completed: eight relay assemblies, shared hull/lattice colliders, optional authoritative vent destruction/heat/shutdown/reboot, versioned 0x0A state and three-client/browser verification. Exact decisions and performance evidence are recorded in SECTION6_PROGRESS_REPORT.md.

- Build an octagonal bunker base, hazard striping, a 12m lattice tower, three rotating dishes, pulsing plasma tubes and a holographic console.
- Preserve existing terminal/core interactions and mission triggers through named anchors.
- Add authoritative destructible vent components and their replicated state. Define vent damage/overheat behavior without changing existing district completion requirements.
- Keep new tower/base colliders clear of mission interaction positions and navigation paths.

**Checkpoint 3C: passed.** All district loops remain completable; relays are recognizable from approach distance; dishes/plasma/vents animate; vent state is consistent across clients.

### 3D. WeaponBuilder and Stage 3 integration gate

- Promote the existing `createRigFirearm` implementation into the shared client weapon builder used by equipment sockets and dropped weapons.
- Add weapon-specific receiver, barrel/shroud, optic, magazine, muzzle brake and charge-strip variants with a consistent muzzle emitter socket.
- Verify hand/socket orientation through locomotion, aim, all three melee strikes, paired counters and disarms.
- Add Stage 3 verification covering shared geometry/collider agreement, functional named parts, asset failure fallbacks, destruction replication and resource cleanup.

**Stage 3 exit:** Build, full regression and Stage 3 checks pass; browser screenshots show the completed city/vehicle/relay/weapon designs; performance stays within the agreed baseline budgets. Update SECTION6_PROGRESS_REPORT.md before proceeding.

## Stage 4: PBR textures and Bay Area vista

Execute only after Stage 3 passes.

1. Extend the existing asset manager with world-space triplanar albedo/normal/roughness/metalness/emissive mapping. Generate deterministic concrete, brushed-metal, asphalt and carbon-fiber fallback maps; add validated WebP/KTX2 pack loading, hot-swap and disposal.
2. Build the 10,000m square Gerstner-wave bay, neon reflection treatment and shoreline foam around a defined peninsula/coastline.
3. Build two suspension bridges with towers, highway decks, main cables and individual suspenders. Add collision only where the bridge is traversable.
4. Add the 3,000-8,000m coastal/headland terrain ring, distant shore lights, height-dependent atmospheric fog and dusk-to-night sky lighting. Check camera range and depth/outline precision at vista distances.

**Stage 4 exit:** Texture scale remains stable on tall structures; fallback and external packs work; both bridges and coastline read clearly from street and rooftop views; day/night transitions and shoreline effects render correctly within the performance budget.

## Stage 5: combat effects, destructibles and spatial audio

Execute only after Stage 4 passes.

1. Define a consistent event path for muzzle origins, impact positions/normals, hit limbs, counter contact timing and destruction. Use authoritative events to prevent duplicate local/reconciled effects.
2. Add pooled 3D tracers, directional limb-hit spark cascades, thermobaric shockwave spheres, wall impact effects and tire skid marks. Reuse Stage 3 debris/component states.
3. Extend the existing WebAudio engine with HRTF footsteps, engines, gunfire, counters and orb sounds. Bound voice counts and handle mute, resume, disconnect and resource cleanup.
4. Align counter shockwaves and sounds with the paired animation's contact point; verify effects under latency and repeated combat.

**Stage 5 exit:** A sustained combat/driving session has readable, correctly timed effects and positional sound, no duplicate events or accumulating objects/audio nodes, and passing regression/performance checks.

## Stage 6: in-engine cinematics

Execute only after Stages 3-5 pass and the script, character designs and world visuals are finalized.

1. Build a cinematic camera director with timed tracks, dialogue cues and safe restoration of the existing spring-arm camera, HUD and input state.
2. Build the Act I bridge fly-in using the actual completed bridge, city, vehicles and characters, with Vance's briefing sourced from storyBible.ts.
3. Add boss introductions triggered by authoritative encounter events. Track seen/skipped sequences without interrupting co-op simulation or network processing.
4. Support skip at every point, including during dialogue; handle death, disconnect/reconnect and interrupted playback cleanly. Do not substitute pre-rendered video for the requested in-engine sequence.

**Stage 6 exit:** Opening and boss sequences use finalized upstream assets, play and skip correctly, restore gameplay cleanly and pass browser/co-op tests. Then perform a full three-act playthrough and document any remaining release limitations.

## Recommended next work order

Continue with Stage 3D weapon consolidation: establish a fresh build/test baseline, promote createRigFirearm into WeaponBuilder, and use it for hand sockets and dropped/disarmed weapons. Preserve the existing combat timing, hit reactions, counters, disarms and progression. Verify receiver/barrel/optic/magazine variants, muzzle anchors and socket orientation across locomotion, aim, melee and paired counters. Then run the full Stage 3 integration gate across architecture, vehicles, relays and weapons, including browser/resource/performance checks. No Stage 4-6 work should begin until that gate passes.
