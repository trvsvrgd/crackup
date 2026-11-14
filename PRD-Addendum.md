## 6. Art Direction, Procedural Mesh Fidelity, Combat Feel, and Narrative Requirements

### 6.1 Cohesive Visual Style (Crackdown Stylized PBR + Inked Outlines)
* Rendering Pipeline: Stylized Physically Based Rendering (PBR) combined with a post-processing Sobel depth-and-normal edge detection pass that draws crisp 1.5px dark ink outlines around characters, vehicles, and architectural silhouettes.
* Faction Color Language:
  * Aegis Directorate: Clinical white ceramic plating, brushed gunmetal, and authoritarian cyan/cobalt emissive trim.
  * Syndicate / Foundry Factions: Weathered industrial hazard yellow, rusted corten steel, and volatile amber/crimson plasma cores.
  * Resistance (Voss): Matte stealth carbon, copper wiring, and emerald telemetry HUD accents.
* Texture Pack Pipeline: Support loading standard PBR texture sets (`albedo`, `normal`, `roughness`, `metalness`, `emissive` in KTX2/WebP format) with triplanar world-space mapping on architecture so textures never stretch across tall skyscrapers, paired with procedural canvas/WebGL fallback texture generators for offline determinism.

### 6.2 Bay Area Vista and Environment Skybox (REQ-VISTA)
Neo-Veridia is an island and peninsula metropolis modeled after the San Francisco Bay Area:
1. Surrounding Bay Water Plane: A `10,000m x 10,000m` animated Gerstner wave water shader surrounding the city districts, reflecting city neon lights and skybox colors with shoreline foam where the water meets the Neon Docks sea walls.
2. Iconic Suspension Bridges: Two massive multi-tower suspension bridges (modeled after the Golden Gate and Bay Bridge) spanning from the city peninsula across the water to the distant headlands, built with 3D tower pylons, main suspension cables, vertical suspender ropes, and highway decks.
3. Distant Bay Area Topography: A surrounding low-poly terrain ring (`radius: 3000m to 8000m`) featuring coastal headlands, Marin-style hills, East Bay mountain ridges, and distant shore lights veiled by exponential height fog (`THREE.FogExp2`) and a dynamic dusk-to-night atmospheric scattering sky dome.

### 6.3 Multi-Part 3D Procedural Geometry Standards (Zero Box Primitives Rule)
Using a single `BoxGeometry`, `CylinderGeometry`, or `SphereGeometry` to represent any game entity is a critical build failure. Every entity must be constructed via a dedicated multi-mesh hierarchy or loaded via `GLTFLoader`:

1. Buildings (`ArchBuilder`):
   * Ground Lobby Podium (6m to 12m tall) with recessed entrance colonnades, illuminated storefront glass, and sidewalk awnings.
   * Mid-Rise Shaft with modular window bays, extruded concrete spandrel ledges (every 4m vertically for physical parkour mantling), structural corner columns, and fake interior parallax room shaders (`InteriorMapping` shader showing lit office/apartment rooms inside windows).
   * Crown & Rooftop Detail: Setback terraces, parapet walls, spinning HVAC cooling fans, water towers, helipads, cellular antennas, and vertical neon kanji/corporate holo-signs.
2. Vehicles (`VehicleBuilder`):
   * Sculpted multi-section chassis: angled front hood/bumper, raked windshield glass with A-pillars, cabin roof, rear fastback/trunk deck, and recessed wheel arches.
   * Emissive dual headlights, full-width cyberpunk LED brake light strips, underglow neon, and 4 independent wheel assemblies (tire tread cylinder + alloy rim spokes + brake caliper) that physically rotate with speed, turn on the front steering knuckle, and compress vertically with suspension travel.
   * Destructible state: Hood, doors, and trunk detach as physical rigidbodies when vehicle HP drops below 50% and 25%.
3. Relays and Objectives (`RelayBuilder`):
   * Heavy octagonal reinforced concrete base with hazard striping.
   * Lattice truss tower rising 12m with 3 rotating parabolic microwave dishes, pulsing vertical plasma conduit tubes, cooling vent louvers that open when overheated, and an interactive holographic terminal console.
4. Weapons (`WeaponBuilder`):
   * Distinct 3D meshes attached to the right-hand bone socket: receiver body, barrel shroud, magazine clip, holographic sight optic, muzzle brake, and emissive ammo charge strip.

### 6.4 Articulated Enemy Silhouettes and Skeletal Animation State Machine (REQ-ANIM)
1. Articulated Humanoid Hierarchy: Every Agent and Enemy consists of a minimum 15-joint skeletal hierarchy (`Pelvis -> Spine -> Chest -> Neck -> Head`, `Left/Right Clavicle -> UpperArm -> Forearm -> Hand`, `Left/Right Thigh -> Calf -> Foot`) with distinct armor plating meshes per enemy archetype:
   * Street Enforcer: Light tactical vest, glowing optic visor, SMG in right hand.
   * Cyber-Ronin: Sleek angular stealth chassis, twin back-mounted plasma blades, crouched sprint posture.
   * Aegis Shock-Trooper: Heavy pauldrons, riot shield on left forearm, heavy pulse rifle.
   * Sector Warden (Boss): 3.2m tall exosuit frame, shoulder rocket pods, hydraulic leg pistons.
2. Animation State Machine (Cross-Faded at 60Hz):
   * Locomotion: `IdleBreathing`, `Walk`, `TacticalSprint`, `AirborneRise`, `AirborneApex`, `FallLoop`, `HardLandingRoll`, `LedgeHang`, `LedgeMantleClimb`.
   * Combat: `AimRifleUpperBody` (blended on spine while legs run), `RecoilKick`, `MeleeCombo1_Jab`, `MeleeCombo2_Cross`, `MeleeCombo3_SpinningKick`, `AirborneGroundSlam`.

### 6.5 Physical Combat Interaction and Hit-Reaction System (REQ-COMBAT-FEEL)
Enemies must never passively absorb damage while sliding around in an idle pose. Every hit triggers an authoritative physical and visual reaction:
1. Light Hit Flinch (Ranged shots & Jab/Cross): Applies an additive upper-body procedural bone impulse tilting the torso/head away from the impact normal for `180ms`, spawns directional sparks/blood-mist particles, and flashes rim-light white for `60ms`.
2. Limb Cripple Stagger: Destroying a Leg collider forces the enemy into a `DropToKneeStagger` animation for `2.5s`; destroying an Arm collider triggers a `WeaponDropRecoil` animation where their gun physically flies out of their hand as a physics prop.
3. Heavy Knockback and Wall-Splat (Combo Finisher, Kick, or Shotgun): Applies a `14 m/s` horizontal impulse to the enemy capsule. If the enemy collides with a building wall or vehicle while traveling above `8 m/s`, trigger a `WallSplatStun` impact decal, bonus crush damage, and a `1.8s` slumped recovery.
4. Synchronized Paired Melee Counter (`Q` Parry): When the player counters an attacking enemy during their amber windup window, lock both transforms into a paired local coordinate space for `0.65s`: the player deflects the enemy's extended arm, delivers a visceral counter-strike (disarming or slamming them into the pavement), and sends neighbouring enemies flying outward via a radial shockwave.

### 6.6 Three-Act Narrative Bible and Character Progression (REQ-NARRATIVE)
All story beats are delivered dynamically through an in-HUD Tactical Comms Portrait Overlay (animated 3D/shader wireframe portraits of speakers with typewriter subtitles and WebAudio synthesized/recorded voice cadence) without freezing gameplay:
* Main Cast:
  * Director Julian Vance (Aegis Directorate): Cold, paternal, corporate authoritarian who views Neo-Veridia's citizens as raw neural processing power.
  * Handler Sera Lin (Squad Comms Officer): Starts as a loyal Aegis tactical dispatcher; gradually discovers Vance's cover-up in Act II and risks her life feeding your squad decrypted target data.
  * Dr. Kaelen Voss (Resistance Architect): Former chief cyberneticist who designed the Agents' neural implants before defecting when he learned Agility Orbs were harvested from dissident minds.
* Narrative Progression Triggers:
  * Act I (Districts 1 & 2, Vigilante Lv 1-2): Vance frames Voss's Resistance as terrorists sabotaging water and power relays.
  * Act II (Whisper Orbs collected >= 3 or Non-Lethal Bounties >= 2): Voss hacks your HUD during a relay sabotage, showing live telemetry that the "terrorist relays" are actually Aegis neural dampeners enslaving the district. Sera Lin confirms the data and helps you fake your telemetry to Vance.
  * Act III (District 4 Loop III): Vance activates the squad's neural kill-switches; Sera and Voss upload the Protocol Eclipse Override, freeing your squad to storm Aegis Citadel Plaza and destroy Vance's flying Dreadnought.