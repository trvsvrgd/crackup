/**
 * CRACKUP: Protocol Eclipse (v2.0 True 3D AAA Architecture)
 * Shared Deterministic Constants, 4-District Bounds, Orb Specs & 7-Attribute Curves
 * Coordinate Convention: 1.0 unit = 1.0 meter, Right-Handed Y-Up
 */

export const FIXED_TIMESTEP = 1 / 60; // 16.6667ms (60Hz deterministic step)
export const FIXED_TIMESTEP_MS = 1000 / 60;
export const SNAPSHOT_HZ = 30; // 30Hz authoritative binary snapshot broadcast
export const SNAPSHOT_INTERVAL_MS = 1000 / SNAPSHOT_HZ;
export const MAX_PLAYERS = 8;

export const PREDICTION_BUFFER_SIZE = 128; // 128-tick client prediction ring buffer
export const INTERPOLATION_DELAY_MS = 100; // 100ms remote entity interpolation buffer

export const WORLD_GRAVITY = { x: 0.0, y: -24.0, z: 0.0 } as const;
export const TERMINAL_VELOCITY = -55.0; // m/s

// Neo-Veridia 3D Metropolis Dimensions (PRD Section 3)
export const CITY_FOOTPRINT_METERS = 1200; // 1200m x 1200m (-600m to +600m X and Z)
export const CITY_HALF_EXTENT = 600;
export const CITY_MAX_ELEVATION_METERS = 320; // Aegis Citadel reaches 320m along Y axis

export enum DistrictId {
  NEON_DOCKS = 'NEON_DOCKS',         // Southwest Quadrant (-600..0 X, 0..+600 Z), 0m..85m
  FOUNDRY_SLUMS = 'FOUNDRY_SLUMS',   // Southeast Quadrant (0..+600 X, 0..+600 Z), 0m..140m
  HELIOS_SPIRE = 'HELIOS_SPIRE',     // Northeast Quadrant (0..+600 X, -600..0 Z), 0m..260m
  AEGIS_CITADEL = 'AEGIS_CITADEL',   // Northwest Quadrant (-600..0 X, -600..0 Z), 0m..320m
}

// 3D Environmental Orbs (PRD Section 4.5 - REQ-ORBS)
export const TOTAL_AGILITY_ORBS = 150;
export const TOTAL_RENEGADE_ORBS = 20;
export const TOTAL_WHISPER_ORBS = 12;
export const TOTAL_ORBS = TOTAL_AGILITY_ORBS + TOTAL_RENEGADE_ORBS + TOTAL_WHISPER_ORBS; // 182 Orbs
export const RENEGADE_FLEE_RADIUS_M = 18.0; // 18m trigger radius for 3D flee steering
export const RENEGADE_MAX_SPEED_MPS = 14.5; // m/s along rooftop waypoint graph
export const ORB_COLLECT_RADIUS_M = 1.85; // 3D center-to-core collection distance in meters

export enum OrbType {
  AGILITY = 0,
  RENEGADE = 1,
  WHISPER = 2,
}

// Swept Capsule Character Controller dimensions (1.90m total agent height)
export const CAPSULE_RADIUS = 0.4; // meters
export const CAPSULE_HALF_HEIGHT = 0.55; // meters
export const CAPSULE_TOTAL_HEIGHT = CAPSULE_HALF_HEIGHT * 2 + CAPSULE_RADIUS * 2; // 1.90m
export const CAPSULE_CENTER_OFFSET_Y = CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS; // +0.95m from foot origin

export const CONTROLLER_MAX_STEP_HEIGHT = 0.45; // meters
export const CONTROLLER_MIN_STEP_WIDTH = 0.2; // meters
export const CONTROLLER_MAX_SLOPE_CLIMB_ANGLE = (50 * Math.PI) / 180; // 50 degrees in radians
export const CONTROLLER_MIN_SLOPE_SLIDE_ANGLE = (52 * Math.PI) / 180; // 52 degrees in radians
export const CONTROLLER_SNAP_TO_GROUND_DIST = 0.3; // meters
export const CONTROLLER_AUTOSLIDE_OFFSET = 0.02; // meters skin width

// Procedural Ledge Mantling Constants (PRD Section 2.2.3)
export const MANTLE_CHEST_RAY_Y = 1.3; // +1.3m from feet
export const MANTLE_HEAD_RAY_Y = 2.1; // +2.1m from feet
export const MANTLE_BASE_REACH = 0.8; // 0.8m at Agility Lv 1 (scales up to 1.8m at Lv 5)
export const MANTLE_DURATION_SEC = 0.35; // 0.35s procedural vault interpolation trajectory

// Third-Person Spring-Arm Camera Constants (PRD Section 2.2.1)
export const CAMERA_SHOULDER_OFFSET = { x: 0.45, y: 1.65, z: 0.0 } as const;
export const CAMERA_PITCH_MIN_RAD = (-75 * Math.PI) / 180;
export const CAMERA_PITCH_MAX_RAD = (80 * Math.PI) / 180;
export const CAMERA_ARM_DEFAULT = 4.5; // meters
export const CAMERA_ARM_AIM = 2.2; // meters
export const CAMERA_ARM_SPRINT_MAX = 7.5; // meters
export const CAMERA_WHISKER_MARGIN = 0.2; // d - 0.2m occlusion snap margin
export const CAMERA_WHISKER_SPHERE_RADIUS = 0.22; // meters

// Air-Dash Constants
export const AIR_DASH_SPEED = 22.0; // m/s burst velocity
export const AIR_DASH_DURATION_SEC = 0.22; // seconds of dash burst

// Input Bitmask Flags
export const INPUT_FLAG_JUMP = 1 << 0;
export const INPUT_FLAG_DASH = 1 << 1;
export const INPUT_FLAG_MANTLE = 1 << 2;
export const INPUT_FLAG_SPRINT = 1 << 3;
export const INPUT_FLAG_AIM = 1 << 4;
export const INPUT_FLAG_FIRE = 1 << 5;
export const INPUT_FLAG_MELEE = 1 << 6;
export const INPUT_FLAG_PARRY = 1 << 7;
// Bits 8..10 encode V.A.T.S. targeted limb (0..5 = EnemyLimbId)
export const INPUT_LIMB_SHIFT = 8;
export const INPUT_LIMB_MASK = 0x07;
// Phase 4 Input Flags (Bits 11..14)
export const INPUT_FLAG_GRAPPLE = 1 << 11;          // G: 3D Grapple-Hook physical tether (45m)
export const INPUT_FLAG_GRAB_THROW = 1 << 12;       // F: Strength-based 3D object pick up / hurl
export const INPUT_FLAG_VEHICLE_INTERACT = 1 << 13; // E: Enter / Exit 4-wheel raycast suspension vehicle
export const INPUT_FLAG_RELIC_REWIND = 1 << 14;     // R: Chrono-Shift Anchor 3.0s 3D state rewind
// Phase 5 Input Flag (Bit 15)
export const INPUT_FLAG_OBJECTIVE_JETPACK = 1 << 15;// H: District Loop Terminal / Co-op Revive; J: Vector-Thrust Jetpack/Wingsuit

// Phase 5: AI Factions, District Operational Loops, Omega Bounties & Secret Neural Drift (PRD 4.4 & 4.5)
export enum FactionId {
  NEON_SYNDICATE = 'NEON_SYNDICATE',
  FOUNDRY_IRONCLAD = 'FOUNDRY_IRONCLAD',
  HELIOS_EXECUTIVE_GUARD = 'HELIOS_EXECUTIVE_GUARD',
  AEGIS_DIRECTORATE = 'AEGIS_DIRECTORATE',
  AEGIS_AUDITOR_HIT_SQUAD = 'AEGIS_AUDITOR_HIT_SQUAD',
}

export enum DistrictLoopRewardId {
  UNLOCK_GRAPPLE_OVERDRIVE = 'UNLOCK_GRAPPLE_OVERDRIVE',           // Neon Docks
  UNLOCK_PLASMA_RAILGUN = 'UNLOCK_PLASMA_RAILGUN',                 // Foundry Slums
  UNLOCK_GRAV_FLIGHT_OVERDRIVE = 'UNLOCK_GRAV_FLIGHT_OVERDRIVE',   // Helios Spire
  UNLOCK_PROTOCOL_ECLIPSE_OVERRIDE = 'UNLOCK_PROTOCOL_ECLIPSE_OVERRIDE', // Aegis Citadel
}

export enum NeuralDriftMutationId {
  PYRO_NEUROSIS = 'PYRO_NEUROSIS',                       // Triggered by high collateral_blast_damage_ratio
  SURGICAL_COLDNESS = 'SURGICAL_COLDNESS',               // Triggered by high limb_cripple_to_kill_ratio
  HOLLOW_FRAME_ADAPTATION = 'HOLLOW_FRAME_ADAPTATION',   // Triggered by high airborne_time_ratio
  GHOST_CONSCIENCE = 'GHOST_CONSCIENCE',                 // Triggered by high squad_revive_and_nonlethal_ratio
}

export const OMEGA_BOUNTY_DURATION_SEC = 90.0;           // 90s 3D waypoint extraction path across Neo-Veridia
export const DISTRICT_OBJECTIVE_INTERACT_RADIUS_M = 4.2; // 3D distance to sabotage/override District Loop relays

// Phase 6: 3D Cyber-Pets, Skybox Pet Arena & Apex Eclipse Dreadnought (PRD Section 4.5 REQ-PETS & Phase 6)
export enum CyberPetSpecies {
  NEON_FOX = 0,
  GRID_HOUND = 1,
  AERO_RAVEN_DRONE = 2,
  TITAN_BEETLE = 3,
}

export enum PetMode {
  FOLLOW = 0, // Boid orbit around owner Agent
  DERBY = 1,  // Racing the Neon Pet Derby skybox track
  CLASH = 2,  // Fighting in the Cyber-Pit Clash skybox arena
}

export enum PetArenaState {
  LOBBY = 0,
  COUNTDOWN = 1,
  ACTIVE = 2,
  RESULTS = 3,
}

export const SKYBOX_ARENA_BASE_Y = 400.0;          // Skybox deck elevation (80m above the 320m Aegis spire)
export const PET_ORBIT_RADIUS_M = 2.6;             // Boid orbit slot radius around owner
export const PET_SEPARATION_RADIUS_M = 2.2;        // Boid separation neighbourhood
export const PET_NEIGHBOR_RADIUS_M = 6.0;          // Boid alignment / cohesion neighbourhood
export const PET_TELEPORT_LEASH_M = 40.0;          // Re-warp to owner beyond this distance
export const PET_DERBY_LAPS = 2;
export const PET_DERBY_LOBBY_SEC = 8.0;
export const PET_DERBY_COUNTDOWN_SEC = 5.0;
export const PET_DERBY_MAX_RACE_SEC = 150.0;
export const PET_DERBY_RESULTS_SEC = 10.0;
export const PET_CLASH_LOBBY_SEC = 8.0;
export const PET_CLASH_COUNTDOWN_SEC = 3.0;
export const PET_CLASH_MAX_FIGHT_SEC = 90.0;
export const PET_CLASH_RESULTS_SEC = 8.0;

export enum DreadnoughtPhase {
  DORMANT = 0,
  PHASE_1_SHIELDED = 1,     // Core reactor shielded; destroy 4 engine nacelles (turrets optional)
  PHASE_2_CORE_EXPOSED = 2, // Engines down, Dreadnought descends, Auditor adds deploy
  PHASE_3_ENRAGED = 3,      // Core < 40% HP: Eclipse Lance beam sweeps
  DEFEATED = 4,
}

export enum DreadnoughtPartId {
  CORE_REACTOR = 0,
  ENGINE_FL = 1,
  ENGINE_FR = 2,
  ENGINE_RL = 3,
  ENGINE_RR = 4,
  FLAK_TURRET_PORT = 5,
  FLAK_TURRET_STARBOARD = 6,
}

export const DREADNOUGHT_PART_COUNT = 7;
export const DREADNOUGHT_ORBIT_CENTER = { x: -90.0, z: -90.0 } as const; // Aegis Citadel Plaza airspace
export const DREADNOUGHT_ORBIT_RADIUS_M = 70.0;
export const DREADNOUGHT_BASE_ALTITUDE_M = 150.0;
export const DREADNOUGHT_WEAPON_RANGE_M = 220.0;   // Heavy-target raycast range against Dreadnought colliders
export const DREADNOUGHT_RESPAWN_SEC = 300.0;
export const AGENT_RESPAWN_POSITION = { x: 0.0, y: 0.0, z: 2.0 } as const;

// Phase 4: 3D Grapple-Hook Tether Constants (PRD Section 4.5 - REQ-LOOPS)
export const GRAPPLE_MAX_RANGE_M = 45.0;            // 45m physical tether raycast range
export const GRAPPLE_MIN_LENGTH_M = 2.2;            // Release/vault distance at anchor
export const GRAPPLE_REEL_SPEED_MPS = 16.0;         // Reel-in contraction speed (m/s)
export const GRAPPLE_TENSION_ACCEL_MPS2 = 28.0;     // Reel-in tension acceleration (m/s^2)

// Phase 4: 4-Wheel Raycast Suspension Vehicle Constants (PRD Section 4.1 - REQ-SKILLS)
export const VEHICLE_WHEEL_REST_LENGTH_M = 0.65;    // Suspension spring rest length (m)
export const VEHICLE_WHEEL_RADIUS_M = 0.38;         // Wheel radius (m)
export const VEHICLE_INTERACT_RANGE_M = 4.5;        // Enter/exit distance (m)
export const VEHICLE_WALL_THRUSTER_IMPULSE_Y = 14.0;// Vertical wall-thruster hop impulse (m/s) at Driving Lv 4+

// Phase 4: Dynamic 3D Physics Props for Strength Picking & Throwing (PRD Section 4.1)
export enum DynamicPropType {
  CRYO_BARREL = 0,      // 85 kg (Liftable at Strength Lv 1 <= 150 kg; explosive on impact)
  STEEL_DUMPSTER = 1,   // 140 kg (Liftable at Strength Lv 1 <= 150 kg)
  CONCRETE_BARRIER = 2, // 850 kg (Liftable at Strength Lv 2 <= 1112.5 kg)
  CARGO_CONTAINER = 3,  // 2000 kg (Liftable at Strength Lv 3 <= 2075 kg)
  APC_WRECK = 4,        // 3400 kg (Liftable at Strength Lv 5 <= 4000 kg)
}

export const PROP_PICKUP_RANGE_M = 4.0;

// Phase 4: 5 Augment Chassis Classes & 20-Node Multi-Branch Skill Tree (PRD Section 4.4 - REQ-BUILDS)
export enum AugmentChassisId {
  TITAN_JUGGERNAUT = 'TITAN_JUGGERNAUT',
  PHANTOM_SHARPSHOOTER = 'PHANTOM_SHARPSHOOTER',
  AERO_VALKYRIE = 'AERO_VALKYRIE',
  DEMOLITION_SAVANT = 'DEMOLITION_SAVANT',
  PACK_VANGUARD = 'PACK_VANGUARD',
}

// Phase 4: 4 Physical 3D Prototype Relics (PRD Section 4.5 - REQ-RELICS)
export enum PrototypeRelicId {
  CHRONO_SHIFT_ANCHOR = 'CHRONO_SHIFT_ANCHOR', // R rewinds 3D transform/velocity/HP history buffer by 3.0s
  GRAV_FLUX_CORE = 'GRAV_FLUX_CORE',           // Low-gravity apex hang-time & +25% grapple swing impulse
  HYPERION_COIL = 'HYPERION_COIL',             // Supercharges V.A.T.S. crit & armor-strip multiplier (+20%)
  TITAN_GYRO = 'TITAN_GYRO',                   // +1000 kg throw mass capacity & +40% vehicle ramming impulse
}

export const CHRONO_REWIND_SECONDS = 3.0;
export const CHRONO_REWIND_TICKS = Math.round(CHRONO_REWIND_SECONDS / FIXED_TIMESTEP); // 180 ticks at 60Hz
export const RELIC_COLLECT_RADIUS_M = 2.6;

export function packTargetLimbIntoButtons(buttons: number, limbId: EnemyLimbId): number {
  return (buttons & ~(INPUT_LIMB_MASK << INPUT_LIMB_SHIFT)) | ((limbId & INPUT_LIMB_MASK) << INPUT_LIMB_SHIFT);
}

export function unpackTargetLimbFromButtons(buttons: number): EnemyLimbId {
  const raw = (buttons >> INPUT_LIMB_SHIFT) & INPUT_LIMB_MASK;
  return (raw <= 5 ? raw : EnemyLimbId.TORSO) as EnemyLimbId;
}

// 3D Bone-Collider Body-Part Targeting System Constants (PRD Section 4.2 - REQ-BODYPARTS)
export enum EnemyLimbId {
  HEAD = 0,
  TORSO = 1,
  LEFT_ARM = 2,
  RIGHT_ARM = 3,
  LEFT_LEG = 4,
  RIGHT_LEG = 5,
}

export const LIMB_COLLIDER_SPECS = {
  [EnemyLimbId.HEAD]: {
    name: 'HEAD',
    shape: 'sphere' as const,
    radius: 0.18, // Sphere r = 0.18m
    halfHeight: 0.0,
    damageMultiplier: 2.2, // 2.2x Crit multiplier
    staggerDurationSec: 4.0, // 4.0s Blind/Stagger interrupting windup
    localOffset: { x: 0.0, y: 1.68, z: 0.0 },
  },
  [EnemyLimbId.TORSO]: {
    name: 'TORSO',
    shape: 'capsule' as const,
    radius: 0.28, // Capsule r = 0.28m, h = 0.55m
    halfHeight: 0.275,
    damageMultiplier: 1.0, // 1.0x Base damage
    armorStripMultiplier: 1.3, // Strips ablative armor plating 30% faster
    localOffset: { x: 0.0, y: 1.18, z: 0.0 },
  },
  [EnemyLimbId.LEFT_ARM]: {
    name: 'LEFT_ARM',
    shape: 'capsule' as const,
    radius: 0.12, // Capsule r = 0.12m, h = 0.45m
    halfHeight: 0.225,
    damageMultiplier: 0.85, // 0.85x damage
    crippleDurationSec: 8.0, // Disables heavy weapon & reduces outgoing damage by 50% for 8.0s
    localOffset: { x: -0.34, y: 1.18, z: 0.0 },
  },
  [EnemyLimbId.RIGHT_ARM]: {
    name: 'RIGHT_ARM',
    shape: 'capsule' as const,
    radius: 0.12, // Capsule r = 0.12m, h = 0.45m
    halfHeight: 0.225,
    damageMultiplier: 0.85,
    crippleDurationSec: 8.0,
    localOffset: { x: 0.34, y: 1.18, z: 0.0 },
  },
  [EnemyLimbId.LEFT_LEG]: {
    name: 'LEFT_LEG',
    shape: 'capsule' as const,
    radius: 0.15, // Capsule r = 0.15m, h = 0.60m
    halfHeight: 0.30,
    damageMultiplier: 0.85, // 0.85x damage
    crippleDurationSec: 8.0, // Reduces max steering velocity by 70% for 8.0s & grounds airborne targets
    localOffset: { x: -0.15, y: 0.45, z: 0.0 },
  },
  [EnemyLimbId.RIGHT_LEG]: {
    name: 'RIGHT_LEG',
    shape: 'capsule' as const,
    radius: 0.15,
    halfHeight: 0.30,
    damageMultiplier: 0.85,
    crippleDurationSec: 8.0,
    localOffset: { x: 0.15, y: 0.45, z: 0.0 },
  },
} as const;

// Third-Person Melee Combat & Escalating Counter System (PRD Section 4.3 - REQ-MELEE)
export const MELEE_ENGAGE_RANGE_M = 4.5; // Pressing Melee within 4.5m warps toward target
export const MELEE_WARP_SPEED_MPS = 18.0; // Translates player capsule along root-motion vector at 18 m/s
export const MELEE_STRIKE_CONNECT_DIST_M = 1.65; // Clean 3D strike connection distance
export const PARRY_SHOCKWAVE_RADIUS_M = 6.0; // 6.0m radial kinetic shockwave at Strength Lv 3+
export const WEAPON_BASE_DAMAGE = 42.0; // Base Agency Sidearm/Carbine damage

export enum EnemyCombatState {
  IDLE = 0,
  CHASE = 1,
  WINDUP = 2,          // Amber 3D shader rim-light + overhead arc indicator (parryable window)
  ACTIVE_SWEEP = 3,    // Active melee hitbox sweep
  RECOVERY = 4,
  STAGGER_BLIND = 5,   // 4.0s Blind/Stagger from Head crit or Q Counter-Parry
  COUNTER_STANCE = 6,  // Elite crimson energy shield (basic melee bounces off & triggers counter-throw)
  DEAD = 7,
}

// Animation States (transmitted in binary snapshot)
export enum AgentAnimState {
  IDLE = 0,
  RUN = 1,
  SPRINT = 2,
  JUMP_ASCEND = 3,
  FALL = 4,
  AIR_DASH = 5,
  MANTLE_VAULT = 6,
  MELEE_STRIKE = 7,
  PARRY_TAKEDOWN = 8,
  GRAPPLE_SWING = 9,
  DRIVING_VEHICLE = 10,
  CARRYING_PROP = 11,
  CHRONO_REWIND = 12,
  JETPACK_FLIGHT = 13,
}

export interface AgentAttributes {
  agility: number;    // 1..5
  strength: number;   // 1..5
  driving: number;    // 1..5
  shooting: number;   // 1..5
  explosives: number; // 1..5
  flying: number;     // 1..5
  vigilante: number;  // 1..5
}

export interface AgentAttributeXP {
  agility: number;
  strength: number;
  driving: number;
  shooting: number;
  explosives: number;
  flying: number;
  vigilante: number;
}

export interface AgentTelemetry {
  totalDistanceMeters: number;
  mantlesCompleted: number;
  jumpsExecuted: number;
  airDashesExecuted: number;
  peakElevationMeters: number;
  playTimeSeconds: number;
  agilityOrbsCollected?: number;
  renegadeOrbsCollected?: number;
  whisperOrbsCollected?: number;
  enemiesDefeated?: number;
  limbsCrippled?: number;
  parriesExecuted?: number;
  meleeStrikesLanded?: number;
  propsThrown?: number;
  vehiclesDrivenSeconds?: number;
  grappleSwingsExecuted?: number;
  chronoRewindsExecuted?: number;
  relicsCollected?: number;
  totalDamageDealt?: number;
  collateralBlastDamageDealt?: number;
  airborneTimeSeconds?: number;
  squadRevivesAndNonLethalCount?: number;
  districtLoopsCompleted?: number;
  omegaBountiesCompleted?: number;
  auditorSquadsDefeated?: number;
  petDerbyWins?: number;
  petClashWins?: number;
  dreadnoughtRaidsCompleted?: number;
  dreadnoughtDamageDealt?: number;
  agentDowns?: number;
}

export const DEFAULT_ATTRIBUTES: AgentAttributes = {
  agility: 1,
  strength: 1,
  driving: 1,
  shooting: 1,
  explosives: 1,
  flying: 1,
  vigilante: 1,
};

export const DEFAULT_ATTRIBUTE_XP: AgentAttributeXP = {
  agility: 0,
  strength: 0,
  driving: 0,
  shooting: 0,
  explosives: 0,
  flying: 0,
  vigilante: 0,
};

export const DEFAULT_TELEMETRY: AgentTelemetry = {
  totalDistanceMeters: 0,
  mantlesCompleted: 0,
  jumpsExecuted: 0,
  airDashesExecuted: 0,
  peakElevationMeters: 0,
  playTimeSeconds: 0,
  agilityOrbsCollected: 0,
  renegadeOrbsCollected: 0,
  whisperOrbsCollected: 0,
};

// XP thresholds for Attribute Levels 1..5
export const ATTRIBUTE_XP_THRESHOLDS = [0, 100, 250, 500, 900] as const;

export function computeAttributeLevelFromXP(xp: number): number {
  if (!Number.isFinite(xp) || xp < ATTRIBUTE_XP_THRESHOLDS[1]) return 1;
  if (xp >= ATTRIBUTE_XP_THRESHOLDS[4]) return 5;
  if (xp >= ATTRIBUTE_XP_THRESHOLDS[3]) return 4;
  if (xp >= ATTRIBUTE_XP_THRESHOLDS[2]) return 3;
  return 2;
}

/**
 * Continuous mathematical scaling curves for all 7 attributes (PRD Section 4.1 - REQ-SKILLS)
 */
export function clampAttributeLevel(level: number): number {
  if (!Number.isFinite(level)) return 1;
  return Math.max(1, Math.min(5, level));
}

export function getAgilityParams(agilityLevel: number) {
  const lv = clampAttributeLevel(agilityLevel);
  const t = (lv - 1) / 4; // 0.0 at Lv 1 -> 1.0 at Lv 5
  const runSpeed = 8.0 + t * (16.5 - 8.0); // 8.0 m/s -> 16.5 m/s
  const sprintMultiplier = 1.28;
  const jumpApexMeters = 3.2 + t * (14.5 - 3.2); // 3.2m -> 14.5m
  // Dynamically scale gravity multiplier during ascent (PRD 4.1.1)
  const ascentGravityMultiplier = 1.0 - t * 0.32; // 1.0 -> 0.68
  const effectiveAscentGravity = Math.abs(WORLD_GRAVITY.y) * ascentGravityMultiplier;
  // v0 = sqrt(2 * g_eff * h_apex) so jump apex in meters matches PRD specification
  const jumpImpulseVelocity = Math.sqrt(2 * effectiveAscentGravity * jumpApexMeters);
  const maxAirDashes = Math.round(1 + t * 2); // 1 -> 3
  const ledgeGrabReach = 0.8 + t * (1.8 - 0.8); // 0.8m -> 1.8m

  return {
    level: lv,
    runSpeed,
    sprintSpeed: runSpeed * sprintMultiplier,
    jumpApexMeters,
    ascentGravityMultiplier,
    jumpImpulseVelocity,
    maxAirDashes,
    ledgeGrabReach,
  };
}

export function getStrengthParams(strengthLevel: number) {
  const lv = clampAttributeLevel(strengthLevel);
  const t = (lv - 1) / 4;
  return {
    level: lv,
    meleeBaseDamage: 35 + t * (140 - 35), // 35 -> 140 dmg
    maxHp: Math.round(200 + t * (600 - 200)), // 200 -> 600 HP
    throwMassLimitKg: 150 + t * (4000 - 150), // 150 kg -> 4000 kg
  };
}

export function getDrivingParams(drivingLevel: number) {
  const lv = clampAttributeLevel(drivingLevel);
  const t = (lv - 1) / 4;
  return {
    level: lv,
    topSpeedMps: 28.0 + t * (55.0 - 28.0), // 28 m/s -> 55 m/s
    chassisMassKg: 1400 + t * (3200 - 1400), // 1400 kg -> 3200 kg
    springStiffness: 42.0 + t * (78.0 - 42.0), // Suspension spring stiffness (N/m normalized)
    damping: 6.5 + t * (12.5 - 6.5), // Suspension velocity damping
    lateralTireFriction: 8.5 + t * (18.0 - 8.5), // Lateral grip / anti-drift coefficient
    unlockWallThrusterHop: lv >= 4,
  };
}

export function getShootingParams(shootingLevel: number) {
  const lv = clampAttributeLevel(shootingLevel);
  const t = (lv - 1) / 4;
  return {
    level: lv,
    spreadConeDeg: 4.2 - t * (4.2 - 0.4), // 4.2 deg -> 0.4 deg
    lockOnRangeMeters: 40.0 + t * (110.0 - 40.0), // 40m -> 110m
  };
}

export function getExplosivesParams(explosivesLevel: number) {
  const lv = clampAttributeLevel(explosivesLevel);
  const t = (lv - 1) / 4;
  return {
    level: lv,
    blastRadiusMeters: 4.5 + t * (12.0 - 4.5), // 4.5m -> 12.0m
    impulseNs: 18.0 + t * (65.0 - 18.0), // 18 N*s -> 65 N*s
  };
}

export function getFlyingParams(flyingLevel: number) {
  const lv = clampAttributeLevel(flyingLevel);
  const t = (lv - 1) / 4;
  return {
    level: lv,
    jetpackFuelSeconds: 3.0 + t * (12.0 - 3.0), // 3.0s -> 12.0s
    maxUpwardAccelMps2: 12.0 + t * (28.0 - 12.0), // 12 m/s^2 -> 28 m/s^2
    diveBombRadiusMeters: 15.0,
  };
}

export function getVigilanteParams(vigilanteLevel: number) {
  const lv = clampAttributeLevel(vigilanteLevel);
  const t = (lv - 1) / 4;
  return {
    level: lv,
    auraRadiusMeters: 15.0 + t * (45.0 - 15.0), // 15m -> 45m
    counterWindowMs: 220 + t * (420 - 220), // 220ms -> 420ms
  };
}

export function getAllAttributeParams(attrs: AgentAttributes) {
  return {
    agility: getAgilityParams(attrs.agility),
    strength: getStrengthParams(attrs.strength),
    driving: getDrivingParams(attrs.driving),
    shooting: getShootingParams(attrs.shooting),
    explosives: getExplosivesParams(attrs.explosives),
    flying: getFlyingParams(attrs.flying),
    vigilante: getVigilanteParams(attrs.vigilante),
  };
}

/**
 * Resolves which of the 4 Neo-Veridia Districts contains a 3D world position (x, z)
 */
export function getDistrictForPosition(x: number, z: number): DistrictId {
  if (z >= 0) {
    return x < 0 ? DistrictId.NEON_DOCKS : DistrictId.FOUNDRY_SLUMS;
  } else {
    return x >= 0 ? DistrictId.HELIOS_SPIRE : DistrictId.AEGIS_CITADEL;
  }
}
