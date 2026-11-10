# Product Requirements Document (PRD): CRACKUP Protocol Eclipse (v2.0 True 3D AAA Architecture)

Document Status: Production Engineering Specification v2.0
Genre: 8-Player Real-Time Online Co-op Third-Person 3D Open-City Action RPG
Core Inspiration: Crackdown (3D Vertical Sandbox, Physics Sandbox, Orb Hunting, 7-Stat Evolution) + Fallout V.A.T.S. (3D Bone-Collider Targeting) + Batman Arkham (Timed Third-Person Melee Counters)
Target Concurrency: 8 Concurrent Players per Authoritative 3D Physics Instance

## 1. Executive Summary and Technical Mandate

CRACKUP Protocol Eclipse is a true third-person 3D multiplayer action RPG set in Neo-Veridia, a vertical cyberpunk metropolis built in a continuous 3D Cartesian coordinate space (1.0 unit = 1.0 meter, Y-up convention). Up to 8 players connect to an authoritative server running a headless 3D physics simulation synchronized with browser clients rendering via Three.js (WebGPU with WebGL2 fallback) and Rapier3D WASM physics.

Strict Production Mandate:
1. Zero 2D Canvas rendering for gameplay. All world geometry, agents, vehicles, projectiles, and orbs exist as 3D meshes and 3D physics colliders.
2. Zero placeholder stubs, mock arrays, or simulated local networking. Every subsystem must execute real 3D vector math, real raycasts, real rigidbody dynamics, and live binary socket synchronization.
3. All distances, velocities, and radii are defined in meters (m) and meters per second (m/s), never pixels.

## 2. Core Engine and Network Architecture

### 2.1 Technology Stack
| Layer | Technology | Production Specification |
| :--- | :--- | :--- |
| 3D Rendering Engine | Three.js (r165+) | PerspectiveCamera, WebGPURenderer / WebGLRenderer, Cascaded Shadow Maps (CSM), InstancedMesh for city blocks and props, PostProcessing pipeline (UnrealBloomPass, SSAO/GTAO, SMAA). |
| 3D Physics Engine (Shared) | @dimforge/rapier3d-compat | Identical deterministic WASM 3D physics engine running at a fixed 60Hz timestep (16.66ms) on both Client (prediction) and Node.js Server (authority). |
| Networking Transport | uWebSockets.js or ws + Binary DataView | Server broadcasts world snapshots at 30Hz using packed binary ArrayBuffers (Float32Array / Uint16Array) rather than verbose JSON strings for transform and velocity sync. |
| Client-Side Netcode | Prediction + Interpolation + Rewind | Local player inputs apply immediately to the local Rapier3D world and store in a 128-tick ring buffer. Server corrections trigger deterministic physics replay. Remote entities render 100ms behind server clock via Hermite spline / quaternion slerp interpolation. |
| Persistent Database | SQLite3 (better-sqlite3 in WAL mode) | Acid-compliant relational database storing accounts, inventory, skill trees, pet telemetry, and neural drift vectors with prepared statements and zero file-locking race conditions. |

### 2.2 Third-Person Camera and Character Controller Specification
1. Spring-Arm Orbital Camera:
   * Orbits a target pivot at `(player.position.x + 0.45m, player.position.y + 1.65m, player.position.z)` for an over-the-right-shoulder Crackdown framing.
   * Spherical coordinate rotation driven by PointerLock mouse deltas (`yaw`, `pitch` clamped between -75 degrees and +80 degrees).
   * Default arm length: `4.5m` in exploration, interpolating to `2.2m` during precision aiming / V.A.T.S. lock-on, and expanding to `7.5m` at high sprint or flight speeds.
   * Camera Occlusion Whisker Raycast: Every frame, cast a sphere/ray from the shoulder pivot to the desired camera position against environment collision layers. If obstructed at distance `d`, snap camera distance to `d - 0.2m` and smoothly damp back out when clear.
2. Swept Capsule Character Controller:
   * Rapier3D `KinematicCharacterController` paired with a capsule collider (`radius: 0.4m`, `halfHeight: 0.55m`, total height `1.9m`).
   * Features auto-stepping (`maxStepHeight: 0.45m`, `minStepWidth: 0.2m`), slope climbing (`maxSlopeClimbAngle: 50 degrees`), slope sliding, and ground snap downward casting.
3. Procedural Ledge Mantling and Verticality:
   * While airborne and moving toward a structure, cast two forward rays from chest height (`+1.3m`) and head height (`+2.1m`) to distance `0.8m`.
   * If the chest ray hits a vertical face and the head ray clears open space, cast a downward ray from `(hitPoint.x, headRay.y, hitPoint.z)` to find the exact ledge surface Y coordinate, triggering a procedural 0.35s ledge-grab and vault trajectory.

## 3. World Scale and Procedural 3D City Architecture (Neo-Veridia)

The city spans a `1200m x 1200m` footprint with vertical skyscrapers reaching `320m` along the Y axis, divided into 4 Districts across a spatial octree / chunk grid:
1. Neon Docks (Southwest Quadrant, elevation 0m to 85m): Shipping container stacks, gantry cranes with climbable truss geometry, suspended cargo platforms, and water shaders.
2. Foundry Slums (Southeast Quadrant, elevation 0m to 140m): Multi-tiered brutalist walkways, industrial furnace stacks, thermal updraft volumes, and heavy pipe bridges.
3. Helios Financial Spire (Northeast Quadrant, elevation 0m to 260m): Stepped glass-and-steel skyscrapers with setback ledges every 8m to 16m specifically spaced for Agility Level 1 through 5 jump arcs, connected by sky-bridges.
4. Aegis Citadel Plaza (Northwest Quadrant, elevation 0m to 320m): Central monolithic tower with exterior elevator shafts, defensive turret emplacements, and anti-air forcefields.

Building Construction Rules:
* No flat untextured cubes. Every building is assembled via modular procedural 3D geometry generators creating distinct base podiums, recessed window bays, exterior HVAC/ledge protrusions (each generating matching Rapier3D trimesh or compound cuboid colliders so players can climb every architectural lip), rooftop parapets, and emissive neon signage.

## 4. Gameplay Mechanics in 3D World Space

### 4.1 Seven Levellable Agent Attributes (REQ-SKILLS)
Every attribute scales from Level 1 to Level 5 using continuous mathematical curves applied to the 3D physics controller and combat resolver:

| Attribute | Level 1 Baseline | Level 5 Apex Values | 3D Physics and Visual Evolution |
| :--- | :--- | :--- | :--- |
| 1. Agility | Run: `8.0 m/s`, Jump apex: `3.2m`, Air-dashes: `1` | Run: `16.5 m/s`, Jump apex: `14.5m`, Air-dashes: `3` | Dynamically scales gravity multiplier during ascent, increases ledge-grab reach to `1.8m`, adds procedural wind-shear trail meshes. |
| 2. Strength | Melee base: `35 dmg`, Max HP: `200`, Throw mass limit: `150 kg` | Melee base: `140 dmg`, Max HP: `600`, Throw mass limit: `4000 kg` | Allows picking up and hurling dynamic 3D physics props (dumpsters, concrete barriers, vehicles) with calculated impulse vectors. |
| 3. Driving | Top speed: `28 m/s`, Chassis mass: `1400 kg` | Top speed: `55 m/s`, Chassis mass: `3200 kg` | Raycast 4-wheel suspension vehicle physics (`springStiffness`, `damping`, `lateralTireFriction`). Unlocks vertical wall-thruster hops on Agency Interceptor. |
| 4. Shooting | Spread cone: `4.2 deg`, Lock-on range: `40m` | Spread cone: `0.4 deg`, Lock-on range: `110m` | Governs 3D raycast weapon dispersion, recoil camera kick recovery, and V.A.T.S. sub-collider hit probability. |
| 5. Explosives | Blast radius: `4.5m`, Impulse: `18 N*s` | Blast radius: `12.0m`, Impulse: `65 N*s` | Server queries Rapier3D `intersectionsWithShape(Sphere(radius))`, applying inverse-square damage falloff and 3D radial ragdoll/rigidbody impulse vectors. |
| 6. Flying | Jetpack fuel: `3.0s`, Max upward accel: `12 m/s^2` | Jetpack fuel: `12.0s`, Max upward accel: `28 m/s^2` | Vector-thrust wingsuit physics with pitch-based glide lift/drag ratios and supersonic dive-bomb shockwaves (`15m` radius on ground impact). |
| 7. Vigilante | Aura radius: `15m`, Counter window: `220ms` | Aura radius: `45m`, Counter window: `420ms` | Expands 3D spherical co-op buff volume, widens melee parry frames, and unlocks encrypted Aegis transmission decryption. |

### 4.2 3D Bone-Collider Body-Part Targeting System (REQ-BODYPARTS)
Every enemy and boss entity possesses a hierarchical 3D rig with 6 distinct child physics colliders attached to animated bone transforms:
* Head Collider (Sphere `r = 0.18m`): `2.2x` Crit multiplier. Applies 4.0s Blind/Stagger state, interrupting current animation state machine windup.
* Torso Collider (Capsule `r = 0.28m, h = 0.55m`): `1.0x` Base damage. Strips ablative armor plating `30%` faster.
* Left and Right Arm Colliders (Capsules `r = 0.12m, h = 0.45m`): `0.85x` damage. At limb HP zero, disables heavy weapon firing and reduces outgoing damage by `50%` for 8.0s.
* Left and Right Leg Colliders (Capsules `r = 0.15m, h = 0.60m`): `0.85x` damage. At limb HP zero, reduces enemy navmesh/steering max velocity by `70%` for 8.0s and grounds airborne targets.

When the player holds Aim (`Right Mouse Button`) on a target within lock-on range, the camera interpolates to the over-the-shoulder V.A.T.S. framing, rendering 3D world-space wireframe bounding boxes around each limb collider with real-time occlusion raycast checks (a limb blocked by cover displays `0%` hit probability).

### 4.3 Third-Person Melee Combat and Escalating Counter System (REQ-MELEE)
* Motion-Warped Melee Attacks: Pressing Melee within `4.5m` of a target smoothly translates the player capsule along a root-motion vector toward the target at `18 m/s` so strikes connect cleanly in 3D space.
* Directional Telegraph and Parry System:
  * Enemy Combat State Machine transitions through `Idle -> Chase -> Windup (amber 3D shader rim-light + overhead arc indicator) -> Active Hitbox Sweep -> Recovery`.
  * Elite enemies enter `Counter Stance` (crimson energy shield mesh). Basic melee strikes against an active Counter Stance bounce off and trigger an immediate enemy counter-throw.
  * Pressing `Q` during an enemy's `Windup` window triggers a server-validated Counter-Parry (checked against lag-compensated timestamp), snapping the player and attacker into a synchronized 3D parry takedown and emitting a radial kinetic shockwave (`radius: 6.0m` at Strength Lv 3+).

### 4.4 Builds, Multi-Branch Skill Tree, and Secret Neural Drift (REQ-BUILDS & REQ-SECRET)
* 5 Augment Chassis Classes and 20 Skill Tree Nodes (4 per branch across Titan Juggernaut, Phantom Sharpshooter, Aero-Valkyrie, Demolition Savant, Pack Vanguard) stored persistently in SQLite and applied as active modifiers in the server combat/physics pipeline.
* Secret Neural Drift Engine: Server tracks rolling telemetry ratios in SQLite (`collateral_blast_damage_ratio`, `limb_cripple_to_kill_ratio`, `airborne_time_ratio`, `squad_revive_and_nonlethal_ratio`) and organically activates the 4 drift mutations (*Pyro-Neurosis*, *Surgical Coldness*, *Hollow-Frame Adaptation*, *Ghost Conscience*) with both mechanical buffs and world consequences (such as spawning Aegis Auditor hit-squads in 3D airships).

### 4.5 3D Orbs, Dynamic Bounties, District Loops, Relics, and Cyber-Pets
* 3D Environmental Orbs (`REQ-ORBS`):
  * 150 Agility Orbs, 20 Renegade Orbs, and 12 Whisper Orbs placed on rooftop ledges, crane booms, and sky-bridge arches (`Y = 10m` to `Y = 310m`).
  * Rendered as rotating 3D icosahedron energy cores with point lights and spatialized 3D WebAudio harmonic hums (`PannerNode` with HRTF distance rolloff so players can hunt orbs by sound).
  * Renegade Orbs run a 3D steering behavior (`flee` vector + rooftop waypoint graph) when a player enters an `18m` radius.
* Omega Bounties (`REQ-BOUNTIES`): Server-wide 3D convoy or boss events with a `90s` 3D waypoint extraction path across the city.
* District Operational Loops (`REQ-LOOPS`): 3-stage physical 3D objectives per district unlocking the 3D Grapple-Hook (`G` fires a physical tether raycast up to `45m`, applying pendulum swing and reel-in tension forces), Plasma Railgun, Grav-Flight Overdrive, and Protocol Eclipse Override.
* Prototype Relics (`REQ-RELICS`): 4 physical 3D artifacts tracked via directional 3D radar audio/visual pings, including the *Chrono-Shift Anchor* (`R` rewinds player 3D transform/velocity/HP history buffer by 3.0 seconds).
* 3D Cyber-Pets and Arena (`REQ-PETS`): Articulated 3D companion meshes orbiting the player using boid steering behaviors, plus a dedicated 3D physical obstacle course track in the skybox for the 8-player *Neon Pet Derby* and *Cyber-Pit Clash*.

## 5. Multi-Week Phased Engineering Roadmap

To guarantee AAA depth and prevent shallow boilerplate generation, development is strictly partitioned into 6 sequential phases. No phase may begin until the previous phase passes all automated verification gates.

* Phase 1 (Core 3D Engine, Shared Rapier3D Physics, and Binary Netcode): Three.js WebGPU/WebGL2 scene, CSM lighting, deterministic Rapier3D world on Node.js + Client, swept capsule character controller, spring-arm camera with wall collision, binary ArrayBuffer sync at 30Hz, and SQLite WAL persistence.
* Phase 2 (Procedural 3D Neo-Veridia City, Parkour Mantling, and Spatial Audio Orbs): Procedural 3D skyscraper generator with climbable ledges across 4 districts, chest/head raycast ledge-mantling, 7-stat scaling physics curves, and 182 3D orbs with HRTF spatial audio and Renegade flee steering.
* Phase 3 (3D Skeletal Rig, Limb Colliders, V.A.T.S. Aiming, and Motion-Warped Melee): Articulated humanoid rigs, 6 bone-attached physics colliders per enemy, over-the-shoulder V.A.T.S. wireframe targeting with occlusion raycasts, motion-warped melee combos, and `Q` Counter-Parry shockwaves.
* Phase 4 (Vehicles, Dynamic Physics Throwing, Grapple Tether, and Skill Trees): Raycast 4-wheel suspension vehicles, Strength-based 3D object picking/throwing, pendulum Grapple-Hook physics, 20-node Skill Tree, and 4 Prototype Relics (including 3-second transform rewind).
* Phase 5 (AI Factions, District Loops, Omega Bounties, and Secret Neural Drift): 3D steering/navmesh enemy squads, 4 District 3-stage operational loops, fleeing Omega Bounty convoys, and SQLite telemetry tracking for Secret Neural Drift consequences.
* Phase 6 (3D Cyber-Pets, Live 3D Pet Arena, Narrative Act III Boss, and Deployment): 3D companion boid steering, physical 3D Neon Pet Derby track, Director Vance's flying Apex Eclipse Dreadnought multi-part raid boss, Docker/Render production configs, and 8-client load verification.