/**
 * CRACKUP: Protocol Eclipse (v2.0 True 3D AAA Architecture)
 * Phase 4: 5 Augment Chassis Classes, 20-Node Multi-Branch Skill Tree (REQ-BUILDS),
 * and 4 Physical 3D Prototype Relics with 3D Radar Ping & Chrono-Shift Rewind (REQ-RELICS).
 */

import {
  AugmentChassisId,
  DistrictId,
  DistrictLoopRewardId,
  NeuralDriftMutationId,
  PrototypeRelicId,
  RELIC_COLLECT_RADIUS_M,
} from '../constants.js';
import { Quat4, Vec3 } from '../protocol/binaryProtocol.js';

export interface AugmentChassisSpec {
  id: AugmentChassisId;
  name: string;
  branchName: string;
  description: string;
  accentHex: string;
}

export interface SkillNodeSpec {
  id: string;
  branch: AugmentChassisId;
  tier: 1 | 2 | 3 | 4;
  name: string;
  description: string;
}

export interface PrototypeRelicSpec {
  id: PrototypeRelicId;
  name: string;
  district: DistrictId;
  position: Vec3;
  description: string;
  activeAbilityDesc: string;
  colorHex: number;
}

export interface ChronoHistoryFrame {
  tick: number;
  position: Vec3;
  velocity: Vec3;
  rotation: Quat4;
  facingYaw: number;
  hp: number;
}

export interface RelicRadarPing {
  relicId: PrototypeRelicId;
  name: string;
  distanceMeters: number;
  bearingYawRad: number;
  elevationDeltaMeters: number;
  pingIntervalSec: number;
  position: Vec3;
}

export interface ActiveBuildModifiers {
  // Titan Juggernaut modifiers
  maxHpMultiplier: number;
  incomingDamageReduction: number;
  throwMassBonusMultiplier: number;
  throwVelocityMultiplier: number;
  parryShockwaveRadiusBonusM: number;
  parryDamageMultiplier: number;
  meleeEngageRangeBonusM: number;
  penetrateCounterStanceRatio: number;

  // Phantom Sharpshooter modifiers
  spreadConeMultiplier: number;
  vatsHitProbBonusPct: number;
  headshotCritMultiplierBonus: number;
  lockOnRangeBonusM: number;
  limbCrippleDurationBonusSec: number;
  limbDamageMultiplier: number;
  torsoArmorStripBonus: number;
  restoreAirDashOnCripple: boolean;

  // Aero-Valkyrie modifiers
  grappleRangeBonusM: number;
  grappleReelSpeedMultiplier: number;
  bonusAirDashes: number;
  airDashSpeedMultiplier: number;
  glideGravityMultiplier: number;
  mantleReachBonusM: number;
  unlockDiveBombShockwave: boolean;

  // Demolition Savant modifiers
  blastRadiusMultiplier: number;
  blastImpulseMultiplier: number;
  thrownPropConcussiveBlast: boolean;
  chainDetonationOnKill: boolean;

  // Pack Vanguard modifiers
  vigilanteAuraMultiplier: number;
  parryWindowBonusMs: number;
  vehicleTopSpeedMultiplier: number;
  wallThrusterMinDrivingLevel: number;
  siphonHpOnParryOrCripple: number;

  // Prototype Relic modifiers
  chronoRewindUnlocked: boolean;
  gravityScaleMultiplier: number;
  grappleSwingImpulseMultiplier: number;
  flatThrowMassBonusKg: number;
  vehicleRamImpulseMultiplier: number;

  // Phase 5: District Loop Rewards & Secret Neural Drift Modifiers
  jetpackFuelBonusSec: number;
  jetpackAccelMultiplier: number;
  weaponDamageMultiplier: number;
  vigilanteAuraRadiusBonusM: number;
  vigilanteTriageRegenHpPerSec: number;
}

export const AUGMENT_CHASSIS_CATALOG: Record<AugmentChassisId, AugmentChassisSpec> = {
  [AugmentChassisId.TITAN_JUGGERNAUT]: {
    id: AugmentChassisId.TITAN_JUGGERNAUT,
    name: 'Titan Juggernaut Exo-Frame',
    branchName: 'Titan Juggernaut',
    description: 'Heavy kinetic exo-chassis (+15% Max HP, +20% Throw Mass Limit baseline).',
    accentHex: '#ff9d00',
  },
  [AugmentChassisId.PHANTOM_SHARPSHOOTER]: {
    id: AugmentChassisId.PHANTOM_SHARPSHOOTER,
    name: 'Phantom Neural Optic Rig',
    branchName: 'Phantom Sharpshooter',
    description: 'Precision V.A.T.S. targeting chassis (-15% Spread Cone, +10m Lock-On Range baseline).',
    accentHex: '#00f2ff',
  },
  [AugmentChassisId.AERO_VALKYRIE]: {
    id: AugmentChassisId.AERO_VALKYRIE,
    name: 'Aero-Valkyrie Thruster Harness',
    branchName: 'Aero-Valkyrie',
    description: 'High-altitude parkour & grapple harness (+10m Grapple Range, +10% Air-Dash Speed baseline).',
    accentHex: '#38ef7d',
  },
  [AugmentChassisId.DEMOLITION_SAVANT]: {
    id: AugmentChassisId.DEMOLITION_SAVANT,
    name: 'Demolition Ordnance Rig',
    branchName: 'Demolition Savant',
    description: 'Thermobaric ordnance chassis (+15% Blast Radius & Impulse baseline).',
    accentHex: '#ff2a6d',
  },
  [AugmentChassisId.PACK_VANGUARD]: {
    id: AugmentChassisId.PACK_VANGUARD,
    name: 'Pack Vanguard Command Core',
    branchName: 'Pack Vanguard',
    description: 'Co-op interceptor & counter-parry chassis (+10% Vehicle Top Speed, +60ms Parry Window baseline).',
    accentHex: '#b56bff',
  },
};

/**
 * All 20 Skill Tree Nodes (4 tiers across each of the 5 branches — PRD Section 4.4 REQ-BUILDS)
 */
export const SKILL_TREE_NODES: SkillNodeSpec[] = [
  // Branch 1: Titan Juggernaut (4 nodes)
  {
    id: 'titan_1_kinetic_plating',
    branch: AugmentChassisId.TITAN_JUGGERNAUT,
    tier: 1,
    name: 'Ablative Kinetic Plating',
    description: '+25% Max HP and -15% incoming melee & ballistic damage.',
  },
  {
    id: 'titan_2_hydraulic_grip',
    branch: AugmentChassisId.TITAN_JUGGERNAUT,
    tier: 2,
    name: 'Hydraulic Servo Grip',
    description: '+35% Throw Mass Limit (kg) and +20% thrown 3D prop launch velocity.',
  },
  {
    id: 'titan_3_seismic_slam',
    branch: AugmentChassisId.TITAN_JUGGERNAUT,
    tier: 3,
    name: 'Seismic Parry Overdrive',
    description: 'Expands Q Counter-Parry radial shockwave radius by +2.5m (to 8.5m) and +30% parry damage.',
  },
  {
    id: 'titan_4_unstoppable_momentum',
    branch: AugmentChassisId.TITAN_JUGGERNAUT,
    tier: 4,
    name: 'Unstoppable Root-Motion',
    description: 'Extends motion-warped melee range by +1.7m (to 6.2m) and pierces 50% of Elite Counter-Stance shields.',
  },

  // Branch 2: Phantom Sharpshooter (4 nodes)
  {
    id: 'phantom_1_neural_stabilizer',
    branch: AugmentChassisId.PHANTOM_SHARPSHOOTER,
    tier: 1,
    name: 'Neural Recoil Stabilizer',
    description: 'Reduces 3D weapon spread cone by 30% and adds +12% V.A.T.S. limb hit probability.',
  },
  {
    id: 'phantom_2_hyper_velocity_rounds',
    branch: AugmentChassisId.PHANTOM_SHARPSHOOTER,
    tier: 2,
    name: 'Hyper-Velocity Sabot',
    description: 'Boosts Headshot Crit multiplier by +0.45x (to 2.65x) and extends lock-on range by +15m.',
  },
  {
    id: 'phantom_3_tendon_sever',
    branch: AugmentChassisId.PHANTOM_SHARPSHOOTER,
    tier: 3,
    name: 'Sub-Collider Tendon Sever',
    description: 'Extends Arm & Leg cripple duration from 8.0s to 12.0s and deals +25% limb damage.',
  },
  {
    id: 'phantom_4_phase_ricochet',
    branch: AugmentChassisId.PHANTOM_SHARPSHOOTER,
    tier: 4,
    name: 'Phase-Core Shatter',
    description: 'Torso shots strip ablative armor +30% faster (1.6x total) and crippling any limb restores 1 Air-Dash.',
  },

  // Branch 3: Aero-Valkyrie (4 nodes)
  {
    id: 'aero_1_grapnel_overdrive',
    branch: AugmentChassisId.AERO_VALKYRIE,
    tier: 1,
    name: 'High-Tension Grapnel Winch',
    description: 'Extends 3D Grapple-Hook range by +15m (to 60m) and increases reel-in tension speed by +30%.',
  },
  {
    id: 'aero_2_slipstream_capacitors',
    branch: AugmentChassisId.AERO_VALKYRIE,
    tier: 2,
    name: 'Slipstream Thruster Capacitors',
    description: 'Grants +1 bonus mid-air dash and +15% horizontal air-dash burst velocity.',
  },
  {
    id: 'aero_3_vector_wingsuit',
    branch: AugmentChassisId.AERO_VALKYRIE,
    tier: 3,
    name: 'Vector-Lift Foil Membrane',
    description: 'Reduces airborne descent gravity by 25% and increases ledge-mantle reach by +0.4m.',
  },
  {
    id: 'aero_4_supersonic_divebomb',
    branch: AugmentChassisId.AERO_VALKYRIE,
    tier: 4,
    name: 'Supersonic Dive-Bomb Impact',
    description: 'Ground impact from high vertical descent emits a 15.0m kinetic shockwave damaging enemies.',
  },

  // Branch 4: Demolition Savant (4 nodes)
  {
    id: 'demo_1_shaped_charges',
    branch: AugmentChassisId.DEMOLITION_SAVANT,
    tier: 1,
    name: 'High-Yield Shaped Charges',
    description: 'Increases 3D spherical explosive blast radius by +25%.',
  },
  {
    id: 'demo_2_thermobaric_core',
    branch: AugmentChassisId.DEMOLITION_SAVANT,
    tier: 2,
    name: 'Thermobaric Impulse Core',
    description: 'Increases 3D radial ragdoll/rigidbody blast impulse (N*s) by +35%.',
  },
  {
    id: 'demo_3_volatile_scavenger',
    branch: AugmentChassisId.DEMOLITION_SAVANT,
    tier: 3,
    name: 'Kinetic Ordnance Fuse',
    description: 'Every thrown 3D physics prop detonates with a concussive 6.0m blast wave on high-speed impact.',
  },
  {
    id: 'demo_4_chain_detonation',
    branch: AugmentChassisId.DEMOLITION_SAVANT,
    tier: 4,
    name: 'Chain Reaction Cascade',
    description: 'Enemies defeated by explosions or thrown props trigger a secondary 5.0m blast wave.',
  },

  // Branch 5: Pack Vanguard (4 nodes)
  {
    id: 'vanguard_1_tactical_relay',
    branch: AugmentChassisId.PACK_VANGUARD,
    tier: 1,
    name: 'Vigilante Telemetry Relay',
    description: 'Expands 3D spherical co-op Vigilante buff aura radius by +30%.',
  },
  {
    id: 'vanguard_2_reflex_chronometer',
    branch: AugmentChassisId.PACK_VANGUARD,
    tier: 2,
    name: 'Combat Reflex Chronometer',
    description: 'Widens lag-compensated Q Counter-Parry timing window by +120ms.',
  },
  {
    id: 'vanguard_3_interceptor_overclock',
    branch: AugmentChassisId.PACK_VANGUARD,
    tier: 3,
    name: 'Interceptor Suspension Overclock',
    description: 'Increases 4-wheel vehicle top speed by +20% and unlocks Wall-Thruster Hops at Driving Lv 3.',
  },
  {
    id: 'vanguard_4_nanite_siphon',
    branch: AugmentChassisId.PACK_VANGUARD,
    tier: 4,
    name: 'Nanite Triage Siphon',
    description: 'Counter-parries and limb cripples restore +35 HP to the Agent.',
  },
];

export const SKILL_NODE_BY_ID: Map<string, SkillNodeSpec> = new Map(
  SKILL_TREE_NODES.map((n) => [n.id, n])
);

/**
 * 4 Physical 3D Prototype Relics placed across Neo-Veridia (PRD Section 4.5 - REQ-RELICS)
 */
export const PROTOTYPE_RELIC_SPECS: PrototypeRelicSpec[] = [
  {
    id: PrototypeRelicId.CHRONO_SHIFT_ANCHOR,
    name: 'Chrono-Shift Anchor',
    district: DistrictId.HELIOS_SPIRE,
    // Placed on the Central/Helios calibration terrace so players can also reach it during tests/exploration
    position: { x: 0.0, y: 7.0, z: -20.0 },
    description:
      'Experimental temporal phase anchor recovered from Helios Spire. Continuously buffers 3.0 seconds of 3D transform, velocity, and HP state.',
    activeAbilityDesc: 'Press [R] to rewind 3D Position, Velocity, Rotation & HP by 3.0 seconds.',
    colorHex: 0x00f2ff,
  },
  {
    id: PrototypeRelicId.GRAV_FLUX_CORE,
    name: 'Aegis Grav-Flux Core',
    district: DistrictId.AEGIS_CITADEL,
    position: { x: -32.0, y: 8.5, z: -36.0 },
    description:
      'Zero-point gravimetric stabilizer from Aegis Citadel. Reduces downward gravity by 20% and amplifies Grapple-Hook pendulum swing impulse by +25%.',
    activeAbilityDesc: 'Passive: -20% Gravity & +25% Grapple Pendulum Swing Impulse.',
    colorHex: 0xb56bff,
  },
  {
    id: PrototypeRelicId.HYPERION_COIL,
    name: 'Hyperion Arc Coil',
    district: DistrictId.NEON_DOCKS,
    position: { x: -35.0, y: 0.5, z: 32.0 },
    description:
      'Superconducting magnetic railgun coil from Neon Docks. Boosts V.A.T.S. headshot crit multiplier (+0.3x) and armor-strip efficiency (+25%).',
    activeAbilityDesc: 'Passive: +0.3x Headshot Crit & +25% Armor Strip.',
    colorHex: 0xffd166,
  },
  {
    id: PrototypeRelicId.TITAN_GYRO,
    name: 'Foundry Titan Gyroscope',
    district: DistrictId.FOUNDRY_SLUMS,
    position: { x: 35.0, y: 0.5, z: 32.0 },
    description:
      'Heavy industrial inertial gyroscope from Foundry Slums. Increases dynamic 3D object throw mass limit by +1,000 kg and vehicle ramming impulse by +40%.',
    activeAbilityDesc: 'Passive: +1,000 kg Throw Mass Limit & +40% Vehicle Ram Impulse.',
    colorHex: 0xff2a6d,
  },
];

/**
 * Computes active build modifiers from the Agent's selected Augment Chassis, unlocked Skill Nodes (up to 20),
 * and collected Prototype Relics (up to 4).
 */
export function computeAgentBuildModifiers(
  chassis: AugmentChassisId = AugmentChassisId.TITAN_JUGGERNAUT,
  unlockedSkillIds: Iterable<string> = [],
  unlockedRelicIds: Iterable<string> = [],
  unlockedDistrictRewards: Iterable<string> = [],
  activeNeuralDrifts: Iterable<string> = []
): ActiveBuildModifiers {
  const skills = new Set(unlockedSkillIds);
  const relics = new Set(unlockedRelicIds);
  const loopRewards = new Set(unlockedDistrictRewards);
  const drifts = new Set(activeNeuralDrifts);

  const mods: ActiveBuildModifiers = {
    maxHpMultiplier: 1.0,
    incomingDamageReduction: 0.0,
    throwMassBonusMultiplier: 1.0,
    throwVelocityMultiplier: 1.0,
    parryShockwaveRadiusBonusM: 0.0,
    parryDamageMultiplier: 1.0,
    meleeEngageRangeBonusM: 0.0,
    penetrateCounterStanceRatio: 0.0,

    spreadConeMultiplier: 1.0,
    vatsHitProbBonusPct: 0,
    headshotCritMultiplierBonus: 0.0,
    lockOnRangeBonusM: 0.0,
    limbCrippleDurationBonusSec: 0.0,
    limbDamageMultiplier: 1.0,
    torsoArmorStripBonus: 0.0,
    restoreAirDashOnCripple: false,

    grappleRangeBonusM: 0.0,
    grappleReelSpeedMultiplier: 1.0,
    bonusAirDashes: 0,
    airDashSpeedMultiplier: 1.0,
    glideGravityMultiplier: 1.0,
    mantleReachBonusM: 0.0,
    unlockDiveBombShockwave: false,

    blastRadiusMultiplier: 1.0,
    blastImpulseMultiplier: 1.0,
    thrownPropConcussiveBlast: false,
    chainDetonationOnKill: false,

    vigilanteAuraMultiplier: 1.0,
    parryWindowBonusMs: 0,
    vehicleTopSpeedMultiplier: 1.0,
    wallThrusterMinDrivingLevel: 4,
    siphonHpOnParryOrCripple: 0,

    chronoRewindUnlocked: relics.has(PrototypeRelicId.CHRONO_SHIFT_ANCHOR),
    gravityScaleMultiplier: 1.0,
    grappleSwingImpulseMultiplier: 1.0,
    flatThrowMassBonusKg: 0,
    vehicleRamImpulseMultiplier: 1.0,

    jetpackFuelBonusSec: 0.0,
    jetpackAccelMultiplier: 1.0,
    weaponDamageMultiplier: 1.0,
    vigilanteAuraRadiusBonusM: 0.0,
    vigilanteTriageRegenHpPerSec: 0.0,
  };

  // 1. Apply Augment Chassis baseline passive
  switch (chassis) {
    case AugmentChassisId.TITAN_JUGGERNAUT:
      mods.maxHpMultiplier += 0.15;
      mods.throwMassBonusMultiplier += 0.2;
      break;
    case AugmentChassisId.PHANTOM_SHARPSHOOTER:
      mods.spreadConeMultiplier *= 0.85;
      mods.lockOnRangeBonusM += 10.0;
      break;
    case AugmentChassisId.AERO_VALKYRIE:
      mods.grappleRangeBonusM += 10.0;
      mods.airDashSpeedMultiplier += 0.1;
      break;
    case AugmentChassisId.DEMOLITION_SAVANT:
      mods.blastRadiusMultiplier += 0.15;
      mods.blastImpulseMultiplier += 0.15;
      break;
    case AugmentChassisId.PACK_VANGUARD:
      mods.vehicleTopSpeedMultiplier += 0.1;
      mods.parryWindowBonusMs += 60;
      break;
  }

  // 2. Apply unlocked Skill Tree Nodes (20 nodes across 5 branches)
  if (skills.has('titan_1_kinetic_plating')) {
    mods.maxHpMultiplier += 0.25;
    mods.incomingDamageReduction += 0.15;
  }
  if (skills.has('titan_2_hydraulic_grip')) {
    mods.throwMassBonusMultiplier += 0.35;
    mods.throwVelocityMultiplier += 0.2;
  }
  if (skills.has('titan_3_seismic_slam')) {
    mods.parryShockwaveRadiusBonusM += 2.5;
    mods.parryDamageMultiplier += 0.3;
  }
  if (skills.has('titan_4_unstoppable_momentum')) {
    mods.meleeEngageRangeBonusM += 1.7;
    mods.penetrateCounterStanceRatio = 0.5;
  }

  if (skills.has('phantom_1_neural_stabilizer')) {
    mods.spreadConeMultiplier *= 0.7;
    mods.vatsHitProbBonusPct += 12;
  }
  if (skills.has('phantom_2_hyper_velocity_rounds')) {
    mods.headshotCritMultiplierBonus += 0.45;
    mods.lockOnRangeBonusM += 15.0;
  }
  if (skills.has('phantom_3_tendon_sever')) {
    mods.limbCrippleDurationBonusSec += 4.0;
    mods.limbDamageMultiplier += 0.25;
  }
  if (skills.has('phantom_4_phase_ricochet')) {
    mods.torsoArmorStripBonus += 0.3;
    mods.restoreAirDashOnCripple = true;
  }

  if (skills.has('aero_1_grapnel_overdrive')) {
    mods.grappleRangeBonusM += 15.0;
    mods.grappleReelSpeedMultiplier += 0.3;
  }
  if (skills.has('aero_2_slipstream_capacitors')) {
    mods.bonusAirDashes += 1;
    mods.airDashSpeedMultiplier += 0.15;
  }
  if (skills.has('aero_3_vector_wingsuit')) {
    mods.glideGravityMultiplier *= 0.75;
    mods.mantleReachBonusM += 0.4;
  }
  if (skills.has('aero_4_supersonic_divebomb')) {
    mods.unlockDiveBombShockwave = true;
  }

  if (skills.has('demo_1_shaped_charges')) {
    mods.blastRadiusMultiplier += 0.25;
  }
  if (skills.has('demo_2_thermobaric_core')) {
    mods.blastImpulseMultiplier += 0.35;
  }
  if (skills.has('demo_3_volatile_scavenger')) {
    mods.thrownPropConcussiveBlast = true;
  }
  if (skills.has('demo_4_chain_detonation')) {
    mods.chainDetonationOnKill = true;
  }

  if (skills.has('vanguard_1_tactical_relay')) {
    mods.vigilanteAuraMultiplier += 0.3;
  }
  if (skills.has('vanguard_2_reflex_chronometer')) {
    mods.parryWindowBonusMs += 120;
  }
  if (skills.has('vanguard_3_interceptor_overclock')) {
    mods.vehicleTopSpeedMultiplier += 0.2;
    mods.wallThrusterMinDrivingLevel = 3;
  }
  if (skills.has('vanguard_4_nanite_siphon')) {
    mods.siphonHpOnParryOrCripple += 35;
  }

  // 3. Apply 4 Prototype Relic passives
  if (relics.has(PrototypeRelicId.GRAV_FLUX_CORE)) {
    mods.gravityScaleMultiplier *= 0.8;
    mods.grappleSwingImpulseMultiplier += 0.25;
  }
  if (relics.has(PrototypeRelicId.HYPERION_COIL)) {
    mods.headshotCritMultiplierBonus += 0.3;
    mods.torsoArmorStripBonus += 0.25;
  }
  if (relics.has(PrototypeRelicId.TITAN_GYRO)) {
    mods.flatThrowMassBonusKg += 1000;
    mods.vehicleRamImpulseMultiplier += 0.4;
  }

  // 4. Apply Phase 5 District Operational Loop Rewards (REQ-LOOPS)
  if (loopRewards.has(DistrictLoopRewardId.UNLOCK_GRAPPLE_OVERDRIVE)) {
    mods.grappleRangeBonusM += 20.0;
    mods.grappleReelSpeedMultiplier += 0.35;
  }
  if (loopRewards.has(DistrictLoopRewardId.UNLOCK_PLASMA_RAILGUN)) {
    mods.weaponDamageMultiplier *= 1.65;
    mods.torsoArmorStripBonus += 0.5;
  }
  if (loopRewards.has(DistrictLoopRewardId.UNLOCK_GRAV_FLIGHT_OVERDRIVE)) {
    mods.jetpackFuelBonusSec += 6.0;
    mods.jetpackAccelMultiplier *= 1.4;
    mods.glideGravityMultiplier *= 0.65;
  }
  if (loopRewards.has(DistrictLoopRewardId.UNLOCK_PROTOCOL_ECLIPSE_OVERRIDE)) {
    mods.maxHpMultiplier += 0.3;
    mods.vigilanteAuraRadiusBonusM += 15.0;
    mods.penetrateCounterStanceRatio = Math.max(mods.penetrateCounterStanceRatio, 1.0);
  }

  // 5. Apply Phase 5 Secret Neural Drift Mutations (REQ-SECRET)
  if (drifts.has(NeuralDriftMutationId.PYRO_NEUROSIS)) {
    mods.blastRadiusMultiplier += 0.3;
    mods.blastImpulseMultiplier += 0.35;
  }
  if (drifts.has(NeuralDriftMutationId.SURGICAL_COLDNESS)) {
    mods.headshotCritMultiplierBonus += 0.5;
    mods.limbDamageMultiplier += 0.25;
    mods.spreadConeMultiplier *= 0.75;
  }
  if (drifts.has(NeuralDriftMutationId.HOLLOW_FRAME_ADAPTATION)) {
    mods.gravityScaleMultiplier *= 0.75;
    mods.jetpackFuelBonusSec += 3.0;
    mods.airDashSpeedMultiplier += 0.15;
  }
  if (drifts.has(NeuralDriftMutationId.GHOST_CONSCIENCE)) {
    mods.vigilanteAuraRadiusBonusM += 15.0;
    mods.vigilanteTriageRegenHpPerSec += 20.0;
    mods.parryWindowBonusMs += 100;
  }

  return mods;
}

/**
 * Checks if an Agent is within 3D collection range of any uncollected Prototype Relic
 */
export function checkAgentRelicIntersection(agentPos: Vec3, relicPos: Vec3): boolean {
  const dx = agentPos.x - relicPos.x;
  const dy = agentPos.y + 0.95 - relicPos.y;
  const dz = agentPos.z - relicPos.z;
  return Math.hypot(dx, dy, dz) <= RELIC_COLLECT_RADIUS_M;
}

/**
 * Computes directional 3D radar audio/visual ping telemetry toward the nearest uncollected Prototype Relic
 */
export function computeNearestRelicRadarPing(
  agentPos: Vec3,
  collectedRelics: Set<string>
): RelicRadarPing | null {
  let nearest: PrototypeRelicSpec | null = null;
  let bestDist = Infinity;

  for (const r of PROTOTYPE_RELIC_SPECS) {
    if (collectedRelics.has(r.id)) continue;
    const d = Math.hypot(
      r.position.x - agentPos.x,
      r.position.y - agentPos.y,
      r.position.z - agentPos.z
    );
    if (d < bestDist) {
      bestDist = d;
      nearest = r;
    }
  }

  if (!nearest) return null;

  const dx = nearest.position.x - agentPos.x;
  const dz = nearest.position.z - agentPos.z;
  const bearingYawRad = Math.atan2(-dx, -dz);
  const elevationDeltaMeters = nearest.position.y - agentPos.y;
  // Ping frequency accelerates as the player approaches the 3D artifact (0.25s..2.4s)
  const pingIntervalSec = Math.max(0.25, Math.min(2.4, bestDist / 45.0));

  return {
    relicId: nearest.id,
    name: nearest.name,
    distanceMeters: bestDist,
    bearingYawRad,
    elevationDeltaMeters,
    pingIntervalSec,
    position: { ...nearest.position },
  };
}

