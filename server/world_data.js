/**
 * CRACKUP: Protocol Eclipse — World & Systems Data Definitions
 * Covers all PRD requirements:
 * - 7 Core Skills (Strength, Agility, Driving, Shooting, Explosives, Flying, Vigilante)
 * - 5 Classes & 20-Node Skill Tree
 * - 4 Body-Part Targets (Head, Torso, Arms, Legs)
 * - Secret Background Skill Progression ("Neural Drift" Positive & Negative Consequences)
 * - 64 Orbs (50 Agility, 8 Renegade Moving Orbs, 6 Whisper Lore Orbs)
 * - 4 Vertical Districts with Meaningful 3-Stage Loop Progression Unlocks
 * - 4 Prototype Relic Hunt Side Quests
 * - 5 Cyber-Pets & Competitive Mini-Games
 * - Rare High-Stakes Omega Bounties
 * - 3-Act Narrative Twist ("Are We the Bad Guys?")
 */

const WORLD_WIDTH = 3200;
const WORLD_HEIGHT = 3200;
const MAX_PLAYERS_PER_INSTANCE = 8;

const SKILLS = {
  agility: {
    id: 'agility',
    name: 'Agility',
    icon: '⚡',
    color: '#00f5d4',
    description: 'Increases sprint speed, rooftop jump height, air-control, and Agility Dodge cooldown/distance. Leveled by collecting Agility & Renegade Orbs.',
    xpThresholds: [0, 100, 260, 500, 900]
  },
  strength: {
    id: 'strength',
    name: 'Strength',
    icon: '👊',
    color: '#ff4d6d',
    description: 'Increases melee damage, max HP, shockwave slams, and evolves Timed Melee Counters. Leveled by melee combat & counter-parries.',
    xpThresholds: [0, 100, 260, 500, 900]
  },
  driving: {
    id: 'driving',
    name: 'Driving',
    icon: '🏎️',
    color: '#ffbe0b',
    description: 'Increases vehicle top speed, turbo thrust, ramming damage, and transforms Agency vehicles (Interceptor -> Enforcer -> Grav-Tank).',
    xpThresholds: [0, 100, 260, 500, 900]
  },
  shooting: {
    id: 'shooting',
    name: 'Shooting',
    icon: '🎯',
    color: '#3a86ff',
    description: 'Increases ranged firearm damage, body-part targeting hit accuracy, and critical multiplier. Leveled by precision ranged combat.',
    xpThresholds: [0, 100, 260, 500, 900]
  },
  explosives: {
    id: 'explosives',
    name: 'Explosives',
    icon: '💥',
    color: '#fb5607',
    description: 'Increases blast radius, cluster-bomblet count, and chain-detonation damage. Leveled by explosive kills and vehicle destruction.',
    xpThresholds: [0, 100, 260, 500, 900]
  },
  flying: {
    id: 'flying',
    name: 'Flying',
    icon: '🦅',
    color: '#7209b7',
    description: 'Increases Grav-Thruster fuel capacity, vertical ascent speed, air-hover stability, and Dive-Bomb force. Leveled by airborne actions & rings.',
    xpThresholds: [0, 100, 260, 500, 900]
  },
  vigilante: {
    id: 'vigilante',
    name: 'Vigilante',
    icon: '🛡️',
    color: '#b5179e',
    description: 'Increases Squad Co-op Aura, Bounty rewards, counter timing window, and decrypts classified truth logs. Leveled by Bounties, Loops & Squad assists.',
    xpThresholds: [0, 100, 260, 500, 900]
  }
};

const CLASSES = {
  titan: {
    id: 'titan',
    name: 'Titan Juggernaut',
    tagline: 'Heavy Kinetic Brawler & Counter Specialist',
    color: '#ff4d6d',
    startingBonuses: { strength: 50, vigilante: 25 },
    perk: '+20% Base Max HP & +15% Melee Counter Shockwave Radius'
  },
  phantom: {
    id: 'phantom',
    name: 'Phantom Sharpshooter',
    tagline: 'Surgical Body-Part Lock-On & Tactical Marksman',
    color: '#3a86ff',
    startingBonuses: { shooting: 50, agility: 25 },
    perk: '+12% Body-Part Targeting Accuracy & +20% Headshot Crit Damage'
  },
  valkyrie: {
    id: 'valkyrie',
    name: 'Aero-Valkyrie',
    tagline: 'Skyscraper Parkour, Orb Hunter & Aerial Striker',
    color: '#00f5d4',
    startingBonuses: { agility: 50, flying: 40 },
    perk: '+25% Grav-Flight Fuel & +15% Agility Dodge Speed'
  },
  demolition: {
    id: 'demolition',
    name: 'Demolition Savant',
    tagline: 'Ordnance Architect & Vehicular Juggernaut',
    color: '#fb5607',
    startingBonuses: { explosives: 50, driving: 35 },
    perk: '+20% Blast Radius & +25% Vehicle Ram Damage'
  },
  vanguard: {
    id: 'vanguard',
    name: 'Pack Vanguard',
    tagline: 'Cyber-Pet Commander, Bounty Hunter & Squad Tactician',
    color: '#b5179e',
    startingBonuses: { vigilante: 50, shooting: 25 },
    perk: '+25% Cyber-Pet Assist Rate & +15% Squad Co-op Aura'
  }
};

const SKILL_TREE = [
  // Branch 1: Titan Juggernaut (Strength / Melee)
  {
    id: 'titan_1',
    branch: 'titan',
    tier: 1,
    name: 'Kinetic Knuckles',
    cost: 1,
    requires: null,
    description: '+25% Melee damage and shreds enemy armor plating on every combo hit.'
  },
  {
    id: 'titan_2',
    branch: 'titan',
    tier: 2,
    name: 'Seismic Riposte',
    cost: 1,
    requires: 'titan_1',
    description: 'Timed Melee Counters (Q) emit a 140px shockwave that stuns surrounding enemies for 2.5s.'
  },
  {
    id: 'titan_3',
    branch: 'titan',
    tier: 3,
    name: 'Sub-Dermal Nano-Plating',
    cost: 2,
    requires: 'titan_2',
    description: '+120 Max HP and reduces incoming melee & explosion damage by 25%.'
  },
  {
    id: 'titan_4',
    branch: 'titan',
    tier: 4,
    name: 'CAPSTONE: Colossus Meteor Slam',
    cost: 2,
    requires: 'titan_3',
    description: 'Melee attacking from high altitude (z > 30) triggers a 3x Strength seismic crater slam.'
  },

  // Branch 2: Phantom Sharpshooter (Shooting / Body-Part Precision)
  {
    id: 'phantom_1',
    branch: 'phantom',
    tier: 1,
    name: 'Optic Calibrator',
    cost: 1,
    requires: null,
    description: '+15% Hit Accuracy when targeting Enemy HEAD or ARMS.'
  },
  {
    id: 'phantom_2',
    branch: 'phantom',
    tier: 2,
    name: 'Tendon Severance',
    cost: 1,
    requires: 'phantom_1',
    description: 'Targeting LEGS applies an 85% speed snare for 8s (essential for stopping Omega Bounties).'
  },
  {
    id: 'phantom_3',
    branch: 'phantom',
    tier: 3,
    name: 'Tungsten Core Rounds',
    cost: 2,
    requires: 'phantom_2',
    description: 'Ranged shots bypass 50% of enemy shield/armor mitigation and deal +20% base damage.'
  },
  {
    id: 'phantom_4',
    branch: 'phantom',
    tier: 4,
    name: 'CAPSTONE: Deadeye Neural Burst',
    cost: 2,
    requires: 'phantom_3',
    description: 'Targeted Body-Part shots fire a hyper-velocity twin burst with +45% Crit Multiplier.'
  },

  // Branch 3: Aero-Valkyrie (Agility / Flying / Mobility)
  {
    id: 'valkyrie_1',
    branch: 'valkyrie',
    tier: 1,
    name: 'Phase-Step Dodge',
    cost: 1,
    requires: null,
    description: 'Agility Dodge (Shift) grants 1.0s invulnerability frames and zaps nearby enemies.'
  },
  {
    id: 'valkyrie_2',
    branch: 'valkyrie',
    tier: 2,
    name: 'Stratosphere Thrusters',
    cost: 1,
    requires: 'valkyrie_1',
    description: '+60% Grav-Flight fuel capacity and +30% vertical climb speed.'
  },
  {
    id: 'valkyrie_3',
    branch: 'valkyrie',
    tier: 3,
    name: 'Harmonic Orb Magnetics',
    cost: 2,
    requires: 'valkyrie_2',
    description: '+50% Agility & Renegade Orb pickup radius and +20% Orb XP yield.'
  },
  {
    id: 'valkyrie_4',
    branch: 'valkyrie',
    tier: 4,
    name: 'CAPSTONE: Valkyrie Sky-Supremacy',
    cost: 2,
    requires: 'valkyrie_3',
    description: 'Deal +40% all damage while airborne (z > 25) and instantly refill 35% Flight Fuel on kill.'
  },

  // Branch 4: Demolition Savant (Explosives / Driving)
  {
    id: 'demo_1',
    branch: 'demolition',
    tier: 1,
    name: 'MIRV Cluster Payload',
    cost: 1,
    requires: null,
    description: 'Explosive attacks spawn 3 secondary cluster bomblets around the impact zone.'
  },
  {
    id: 'demo_2',
    branch: 'demolition',
    tier: 2,
    name: 'Nitro EMP Ram',
    cost: 1,
    requires: 'demo_1',
    description: 'Agency Vehicle collisions deal 2.5x damage and emit an EMP pulse that disables enemy weapons.'
  },
  {
    id: 'demo_3',
    branch: 'demolition',
    tier: 3,
    name: 'Volatile Chain Reaction',
    cost: 2,
    requires: 'demo_2',
    description: 'Enemies eliminated by explosives detonate for 90 AoE damage to nearby targets.'
  },
  {
    id: 'demo_4',
    branch: 'demolition',
    tier: 4,
    name: 'CAPSTONE: Thermobaric Cataclysm',
    cost: 2,
    requires: 'demo_3',
    description: '+50% Explosive Blast Radius and +35% Explosive Damage against Bosses & Wardens.'
  },

  // Branch 5: Pack Vanguard (Vigilante / Pet Synergy / Co-op)
  {
    id: 'vanguard_1',
    branch: 'vanguard',
    tier: 1,
    name: 'Tactical Squad Uplink',
    cost: 1,
    requires: null,
    description: 'Squadmates within 280px gain +15% Damage and regenerate +4 HP/sec.'
  },
  {
    id: 'vanguard_2',
    branch: 'vanguard',
    tier: 2,
    name: 'Cyber-Pet Overclock',
    cost: 1,
    requires: 'vanguard_1',
    description: 'Doubles your Cyber-Pet combat assist frequency and grants +15% stats in Pet Mini-Games.'
  },
  {
    id: 'vanguard_3',
    branch: 'vanguard',
    tier: 3,
    name: 'Omega Bounty Lockdown',
    cost: 2,
    requires: 'vanguard_2',
    description: '+35% Damage to Omega Bounties & Sector Wardens; slows nearby Bounty targets by 25%.'
  },
  {
    id: 'vanguard_4',
    branch: 'vanguard',
    tier: 4,
    name: 'CAPSTONE: Sovereign Awakening',
    cost: 2,
    requires: 'vanguard_3',
    description: 'Boosts all 7 Agent attributes by +1 effective tier and grants immunity to Aegis neural suppression.'
  }
];

const BODY_PARTS = {
  head: {
    id: 'head',
    name: 'HEAD (Optics)',
    baseHitChance: 0.68,
    damageMultiplier: 2.2,
    debuff: 'blinded',
    debuffDuration: 4500,
    description: '2.2x Crit Damage! Blinds target & cancels Enemy Counter Stance (Lower base accuracy).'
  },
  torso: {
    id: 'torso',
    name: 'TORSO (Core)',
    baseHitChance: 0.96,
    damageMultiplier: 1.0,
    debuff: 'armor_cracked',
    debuffDuration: 5000,
    description: '1.0x Reliable Damage (96% accuracy). Fractures heavy armor (+20% follow-up damage).'
  },
  arms: {
    id: 'arms',
    name: 'ARMS (Weapons)',
    baseHitChance: 0.80,
    damageMultiplier: 0.85,
    debuff: 'disarmed',
    debuffDuration: 8000,
    description: '0.85x Damage. Cripples weapon mounts (-50% enemy attack damage for 8s).'
  },
  legs: {
    id: 'legs',
    name: 'LEGS (Thrusters)',
    baseHitChance: 0.84,
    damageMultiplier: 0.85,
    debuff: 'crippled',
    debuffDuration: 8000,
    description: '0.85x Damage. Immobilizes/Slows target by 70% for 8s — vital to stop fleeing Bounties!'
  }
};

/**
 * Secret Background Progression ("Neural Drift" / Hidden Mutations)
 * Silently tracked by the server based on hidden behavioral metrics.
 * Each has BOTH positive and negative gameplay consequences!
 */
const SECRET_MUTATIONS = {
  pyro_neurosis: {
    id: 'pyro_neurosis',
    name: 'Neural Drift: Pyro-Neurosis',
    hint: 'TELEMETRY ANOMALY: Excessive explosive collateral trauma detected in cerebral cortex.',
    positiveDesc: '+20% Explosive Force & Blast Radius',
    negativeDesc: '-20% Natural HP Regen Rate (Aegis bio-monitors throttle your nanites)',
    positiveEffect: { explosiveMult: 1.20 },
    negativeEffect: { regenMult: 0.80 }
  },
  surgical_coldness: {
    id: 'surgical_coldness',
    name: 'Neural Drift: Surgical Synapse',
    hint: 'TELEMETRY ANOMALY: Cold, methodical limb-targeting pattern registered.',
    positiveDesc: '+18% Body-Part Lock-On Accuracy & +30% Limb Debuff Duration',
    negativeDesc: '-15% Raw Melee Damage (Suppressed berserker adrenaline)',
    positiveEffect: { accuracyBonus: 0.18, debuffDurationMult: 1.30 },
    negativeEffect: { meleeMult: 0.85 }
  },
  hollow_frame: {
    id: 'hollow_frame',
    name: 'Neural Drift: Hollow-Bone Avian Drift',
    hint: 'TELEMETRY ANOMALY: Prolonged high-altitude isolation altering skeletal density.',
    positiveDesc: '+25% Flight Fuel Efficiency & +15% Airborne Damage',
    negativeDesc: '+20% Incoming Ground Melee Damage taken',
    positiveEffect: { flightEfficiency: 1.25, airDamageMult: 1.15 },
    negativeEffect: { groundMeleeVuln: 1.20 }
  },
  ghost_conscience: {
    id: 'ghost_conscience',
    name: 'Neural Drift: Ghost Conscience',
    hint: 'WARNING [REDACTED]: Agent exhibiting unauthorized empathy, non-lethal restraint, and pack bonding.',
    positiveDesc: '+20% Vigilante XP, +25% Pet Assist Power & Early Story Truth Decryption',
    negativeDesc: 'Director Vance Suspicion: Aegis Enforcers deal +15% damage to you',
    positiveEffect: { vigilanteMult: 1.20, petPowerMult: 1.25 },
    negativeEffect: { aegisHostilityMult: 1.15 }
  }
};

const DISTRICTS = [
  {
    id: 'neon_docks',
    name: 'Sector 01: Neon Docks',
    bounds: { x: 0, y: 0, w: 1600, h: 1600 },
    color: '#00f5d4',
    wardenName: 'Warden Krax (Harbor Juggernaut)',
    loopStages: [
      'Stage 1: Disrupt Dockside Smuggler Patrols (0/4)',
      'Stage 2: Sabotage Crane Telemetry Relays (0/3)',
      'Stage 3: Defeat Warden Krax at Pier 9'
    ],
    unlockId: 'grapple_slingshot',
    unlockName: 'Grapple-Hook Slingshot (G)',
    unlockDesc: 'Unlocks the Kinetic Grapple-Hook (Press G) to zip instantly onto tall skyscrapers or yank enemies!'
  },
  {
    id: 'foundry_slums',
    name: 'Sector 02: Foundry Slums',
    bounds: { x: 1600, y: 0, w: 1600, h: 1600 },
    color: '#fb5607',
    wardenName: 'Foreman Vulcan (Siege Mech)',
    loopStages: [
      'Stage 1: Neutralize Foundry Brute Squads (0/4)',
      'Stage 2: Overload Slag Reactor Cores (0/3)',
      'Stage 3: Defeat Foreman Vulcan'
    ],
    unlockId: 'siege_armory',
    unlockName: 'Experimental Siege Armory (Railgun & Cluster Mortar)',
    unlockDesc: 'Permanently upgrades your Ranged & Explosive weapons into the Hyper-Railgun (+35% Dmg) & Plasma Mortar!'
  },
  {
    id: 'helios_spire',
    name: 'Sector 03: Helios Financial Spire',
    bounds: { x: 0, y: 1600, w: 1600, h: 1600 },
    color: '#3a86ff',
    wardenName: 'Archon Seraph (Aero-Valkyrie Boss)',
    loopStages: [
      'Stage 1: Clear Sky-Bridge Sniper Cells (0/4)',
      'Stage 2: Hack Orbital Comms Arrays (0/3)',
      'Stage 3: Defeat Archon Seraph atop Helios Tower'
    ],
    unlockId: 'flight_overdrive',
    unlockName: 'Grav-Flight Overdrive Wing',
    unlockDesc: 'Doubles maximum flight altitude ceiling, +50% Jetpack recharge speed, and unlocks Orbital Dive-Bomb!'
  },
  {
    id: 'citadel_plaza',
    name: 'Sector 04: Aegis Citadel Plaza',
    bounds: { x: 1600, y: 1600, w: 1600, h: 1600 },
    color: '#b5179e',
    wardenName: 'Commander Zero (Aegis Prime Praetorian)',
    loopStages: [
      'Stage 1: Eliminate Elite Praetorian Guards (0/4)',
      'Stage 2: Breach Classified ECLIPSE Vaults (0/3)',
      'Stage 3: Defeat Commander Zero & Expose Director Vance'
    ],
    unlockId: 'eclipse_override',
    unlockName: 'Protocol Eclipse Override (Endgame Boss Access)',
    unlockDesc: 'Exposes Director Vance, unlocks +25% All-Stat Sovereign Aura, and allows triggering the Final Co-op Raid!'
  }
];

// Generate Neo-Veridia Skyscrapers & Rooftops with vertical heights (z = 25 to 220)
const BUILDINGS = [
  // Sector 01: Neon Docks
  { id: 'b_docks_1', district: 'neon_docks', name: 'Harbor Crane Alpha', x: 260, y: 280, w: 180, h: 140, z: 45, color: '#1b263b' },
  { id: 'b_docks_2', district: 'neon_docks', name: 'Cold Storage Warehouse', x: 560, y: 240, w: 240, h: 180, z: 30, color: '#1d3557' },
  { id: 'b_docks_3', district: 'neon_docks', name: 'Port Authority Tower', x: 960, y: 320, w: 200, h: 200, z: 85, color: '#0f4c5c' },
  { id: 'b_docks_4', district: 'neon_docks', name: 'Container Stack West', x: 300, y: 740, w: 220, h: 160, z: 35, color: '#2b2d42' },
  { id: 'b_docks_5', district: 'neon_docks', name: 'Poseidon Logistics Hub', x: 740, y: 700, w: 260, h: 220, z: 65, color: '#1b3a4b' },
  { id: 'b_docks_6', district: 'neon_docks', name: 'Pier 9 Lighthouse Spire', x: 1220, y: 840, w: 170, h: 170, z: 120, color: '#006466' },
  { id: 'b_docks_7', district: 'neon_docks', name: 'Smuggler Drydock Roof', x: 460, y: 1180, w: 250, h: 180, z: 50, color: '#212529' },
  { id: 'b_docks_8', district: 'neon_docks', name: 'Aquila Customs Spire', x: 1020, y: 1180, w: 210, h: 200, z: 95, color: '#144552' },

  // Sector 02: Foundry Slums
  { id: 'b_foundry_1', district: 'foundry_slums', name: 'Smelter Stack 01', x: 1820, y: 260, w: 210, h: 170, z: 55, color: '#370617' },
  { id: 'b_foundry_2', district: 'foundry_slums', name: 'Vulcan Ironworks', x: 2220, y: 240, w: 280, h: 210, z: 75, color: '#6a040f' },
  { id: 'b_foundry_3', district: 'foundry_slums', name: 'Slag Cooling Tower', x: 2700, y: 340, w: 200, h: 200, z: 110, color: '#4a154b' },
  { id: 'b_foundry_4', district: 'foundry_slums', name: 'Rust Tenement Block', x: 1860, y: 720, w: 240, h: 190, z: 40, color: '#3c096c' },
  { id: 'b_foundry_5', district: 'foundry_slums', name: 'Omni-Forge Core', x: 2300, y: 740, w: 260, h: 240, z: 90, color: '#5a189a' },
  { id: 'b_foundry_6', district: 'foundry_slums', name: 'Exhaust Chimney Titan', x: 2780, y: 820, w: 180, h: 180, z: 145, color: '#7b2cbf' },
  { id: 'b_foundry_7', district: 'foundry_slums', name: 'Scrapyard Gantry', x: 1960, y: 1200, w: 230, h: 170, z: 45, color: '#240046' },
  { id: 'b_foundry_8', district: 'foundry_slums', name: 'Refinery Command Deck', x: 2520, y: 1200, w: 240, h: 200, z: 100, color: '#3c096c' },

  // Sector 03: Helios Financial Spire
  { id: 'b_helios_1', district: 'helios_spire', name: 'Veridia Exchange Plaza', x: 260, y: 1820, w: 220, h: 200, z: 70, color: '#03045e' },
  { id: 'b_helios_2', district: 'helios_spire', name: 'Solari Bank Monolith', x: 680, y: 1800, w: 240, h: 220, z: 130, color: '#023e8a' },
  { id: 'b_helios_3', district: 'helios_spire', name: 'Helios Apex Skyscraper', x: 1120, y: 1860, w: 230, h: 230, z: 190, color: '#0077b6' },
  { id: 'b_helios_4', district: 'helios_spire', name: 'Prism Media Tower', x: 280, y: 2300, w: 210, h: 210, z: 105, color: '#0096c7' },
  { id: 'b_helios_5', district: 'helios_spire', name: 'Sky-Bridge Nexus', x: 720, y: 2320, w: 260, h: 220, z: 150, color: '#03045e' },
  { id: 'b_helios_6', district: 'helios_spire', name: 'Cloud-9 Penthouse Spire', x: 1180, y: 2360, w: 200, h: 200, z: 175, color: '#023e8a' },
  { id: 'b_helios_7', district: 'helios_spire', name: 'Synthetix Bio-Labs', x: 420, y: 2760, w: 250, h: 190, z: 85, color: '#1d3557' },
  { id: 'b_helios_8', district: 'helios_spire', name: 'Starlight Orbital Dish', x: 980, y: 2780, w: 220, h: 200, z: 160, color: '#0077b6' },

  // Sector 04: Aegis Citadel Plaza
  { id: 'b_citadel_1', district: 'citadel_plaza', name: 'Aegis Security Bastion', x: 1840, y: 1820, w: 230, h: 200, z: 80, color: '#2b2d42' },
  { id: 'b_citadel_2', district: 'citadel_plaza', name: 'Peacekeeper Garrison', x: 2280, y: 1800, w: 250, h: 210, z: 115, color: '#3a0ca3' },
  { id: 'b_citadel_3', district: 'citadel_plaza', name: 'Ministry of Harmony', x: 2760, y: 1840, w: 220, h: 220, z: 155, color: '#480ca8' },
  { id: 'b_citadel_4', district: 'citadel_plaza', name: 'Neural Processing Vault', x: 1860, y: 2300, w: 220, h: 220, z: 135, color: '#560bad' },
  { id: 'b_citadel_5', district: 'citadel_plaza', name: 'AEGIS CITADEL ZIGGURAT', x: 2300, y: 2280, w: 300, h: 300, z: 220, color: '#7209b7' },
  { id: 'b_citadel_6', district: 'citadel_plaza', name: 'Inquisitor Watchtower', x: 2800, y: 2340, w: 190, h: 210, z: 170, color: '#b5179e' },
  { id: 'b_citadel_7', district: 'citadel_plaza', name: 'Detention Block Omega', x: 1940, y: 2780, w: 250, h: 190, z: 95, color: '#3c096c' },
  { id: 'b_citadel_8', district: 'citadel_plaza', name: 'Eclipse Broadcast Array', x: 2540, y: 2780, w: 240, h: 200, z: 185, color: '#f72585' }
];

// Generate 64 Environmental Orbs (50 Agility Orbs on rooftops & ledges, 8 dynamic fleeing Renegade Orbs, 6 Whisper Orbs)
function generateOrbs() {
  const orbs = [];
  // 32 Rooftop Agility Orbs (one atop every building at its rooftop z-elevation!)
  BUILDINGS.forEach((b, idx) => {
    orbs.push({
      id: `orb_agility_roof_${idx + 1}`,
      type: 'agility',
      name: `Agility Orb #${idx + 1} (${b.name})`,
      x: Math.round(b.x + b.w * 0.5),
      y: Math.round(b.y + b.h * 0.5),
      z: b.z,
      xp: 35 + Math.round(b.z * 0.35),
      tier: b.z >= 150 ? 4 : b.z >= 90 ? 3 : b.z >= 50 ? 2 : 1
    });
  });

  // 18 Additional High-Ledge & Bridge Agility Orbs
  const extraCoords = [
    { x: 450, y: 520, z: 25 }, { x: 880, y: 580, z: 40 }, { x: 1380, y: 450, z: 55 },
    { x: 680, y: 1050, z: 35 }, { x: 1420, y: 1380, z: 60 }, { x: 2100, y: 520, z: 50 },
    { x: 2600, y: 620, z: 70 }, { x: 2160, y: 1020, z: 65 }, { x: 2950, y: 1120, z: 80 },
    { x: 540, y: 2100, z: 75 }, { x: 980, y: 2120, z: 110 }, { x: 1420, y: 2150, z: 95 },
    { x: 600, y: 2600, z: 90 }, { x: 1350, y: 2680, z: 125 }, { x: 2120, y: 2100, z: 100 },
    { x: 2660, y: 2120, z: 130 }, { x: 2220, y: 2680, z: 140 }, { x: 2920, y: 2680, z: 150 }
  ];
  extraCoords.forEach((c, idx) => {
    orbs.push({
      id: `orb_agility_ledge_${idx + 33}`,
      type: 'agility',
      name: `Agility Orb #${idx + 33}`,
      x: c.x,
      y: c.y,
      z: c.z,
      xp: 40 + Math.round(c.z * 0.3),
      tier: c.z >= 110 ? 3 : 2
    });
  });

  // 8 Dynamic Fleeing Renegade Orbs (move along circuits and sprint away when chased!)
  const renegadeStarts = [
    { x: 620, y: 480, z: 30, name: 'Dockside Renegade Orb' },
    { x: 1150, y: 980, z: 45, name: 'Pier-Runner Renegade Orb' },
    { x: 2050, y: 480, z: 40, name: 'Smelter Renegade Orb' },
    { x: 2620, y: 980, z: 65, name: 'Forge-Spark Renegade Orb' },
    { x: 580, y: 2050, z: 80, name: 'Sky-Bridge Renegade Orb' },
    { x: 1120, y: 2560, z: 110, name: 'Helios Jet-Stream Renegade Orb' },
    { x: 2100, y: 2020, z: 90, name: 'Citadel Courtyard Renegade Orb' },
    { x: 2680, y: 2560, z: 130, name: 'Apex Eclipse Renegade Orb' }
  ];
  renegadeStarts.forEach((r, idx) => {
    orbs.push({
      id: `orb_renegade_${idx + 1}`,
      type: 'renegade',
      name: r.name,
      x: r.x,
      y: r.y,
      z: r.z,
      originX: r.x,
      originY: r.y,
      vx: 0,
      vy: 0,
      xp: 120,
      tier: 4
    });
  });

  // 6 Whisper / Hidden Lore Orbs (boost ALL 7 skills + unlock secret story audio logs!)
  const whisperOrbs = [
    {
      id: 'orb_whisper_1',
      type: 'whisper',
      name: 'Whisper Orb #1: Neural Harvest Log',
      x: 1305,
      y: 925,
      z: 120,
      xp: 75,
      loreLog: 'ENCRYPTED LOG #01 [DR. VOSS]: "God help us... the green Agility Orbs Aegis feeds their Agents aren\'t synthetic batteries. They\'re compressed human neural pathways from Detention Block Omega."'
    },
    {
      id: 'orb_whisper_2',
      type: 'whisper',
      name: 'Whisper Orb #2: Project Eclipse Directive',
      x: 2870,
      y: 910,
      z: 145,
      xp: 75,
      loreLog: 'ENCRYPTED LOG #02 [DIRECTOR VANCE MEMO]: "Let the 8 Agents believe they are heroes liberating Neo-Veridia. Once they wipe out Voss\'s Free Guard engineers, trigger their cortical kill-switches."'
    },
    {
      id: 'orb_whisper_3',
      type: 'whisper',
      name: 'Whisper Orb #3: The False Terrorists',
      x: 1235,
      y: 1975,
      z: 190,
      xp: 75,
      loreLog: 'ENCRYPTED LOG #03 [INTERCEPTED MEDIC SOS]: "Why are Aegis Agents bombing our water purification clinic?! We aren\'t a syndicate—we\'re keeping Sector 02\'s children alive!"'
    },
    {
      id: 'orb_whisper_4',
      type: 'whisper',
      name: 'Whisper Orb #4: Subject 08 Memory Fragment',
      x: 850,
      y: 2430,
      z: 150,
      xp: 75,
      loreLog: 'ENCRYPTED LOG #04 [AGENT BLACK-BOX]: "My own voice is on this recording... before Aegis wiped my memory, I was fighting ALONGSIDE Kaelen Voss against Director Vance!"'
    },
    {
      id: 'orb_whisper_5',
      type: 'whisper',
      name: 'Whisper Orb #5: The Citadel Core',
      x: 2450,
      y: 2430,
      z: 220,
      xp: 90,
      loreLog: 'ENCRYPTED LOG #05 [VOSS UPLINK]: "Agent, if you can hear this atop the Ziggurat—stop obeying Vance! Unlock Protocol Override and turn your weapons on the Aegis Dreadnought!"'
    },
    {
      id: 'orb_whisper_6',
      type: 'whisper',
      name: 'Whisper Orb #6: Vance\'s Confession',
      x: 2660,
      y: 2880,
      z: 185,
      xp: 90,
      loreLog: 'ENCRYPTED LOG #06 [VANCE PERSONAL ARCHIVE]: "Order requires obedience. The citizens of Neo-Veridia refused corporate annexation, so I manufactured the Syndicate crisis myself."'
    }
  ];

  return orbs.concat(whisperOrbs);
}

/**
 * 4 Meaningful Item Hunt Side Quests (Prototype Relic Hunts)
 * Each Relic permanently equips into the Agent's Relic Matrix and grants a major mechanic!
 */
const PROTOTYPE_RELICS = [
  {
    id: 'chrono_anchor',
    name: 'Chrono-Shift Anchor',
    questTitle: 'Relic Hunt: The Temporal Anomaly of Pier 9',
    clue: 'Triangulate the tachyon signal near the northeast Dockside Lighthouse (Sector 01, Rooftop z=120).',
    x: 1280,
    y: 900,
    z: 120,
    icon: '⏳',
    activeAbility: true,
    description: 'ACTIVE RELIC (Press R): Rewinds your Agent 3 seconds back in time—restoring HP to its peak over the last 3s, resetting Dodge cooldown, and detonating a temporal pulse!'
  },
  {
    id: 'orb_resonator',
    name: 'Harmonic Orb Resonator',
    questTitle: 'Relic Hunt: Song of the Spire',
    clue: 'Follow the harmonic sub-bass signal to the Cloud-9 Penthouse roof in Helios Spire (Sector 03, z=175).',
    x: 1260,
    y: 2440,
    z: 175,
    icon: '🔮',
    activeAbility: false,
    description: 'PASSIVE RELIC: Magnetically pulls Agility & Renegade Orbs from +95px away, reveals all Whisper Orbs on radar, and grants +30% Orb XP!'
  },
  {
    id: 'gravity_gauntlet',
    name: 'Gravity Tether Gauntlet',
    questTitle: 'Relic Hunt: Zero-Point Forge Prototype',
    clue: 'Recover the experimental gauntlet hidden atop the Exhaust Chimney Titan in Foundry Slums (Sector 02, z=145).',
    x: 2860,
    y: 900,
    z: 145,
    icon: '🧲',
    activeAbility: false,
    description: 'PASSIVE/ACTIVE UPGRADE: Upgrades Grapple (G) & Melee Slams to create a gravitational singularity that pulls enemies inward and deals +30% Strength/Explosive damage!'
  },
  {
    id: 'vance_decryptor',
    name: 'Vance Black-Box Decryptor',
    questTitle: 'Relic Hunt: The Director\'s Skeleton Key',
    clue: 'Infiltrate Detention Block Omega in Aegis Citadel Plaza (Sector 04, z=95) to steal Vance\'s neural cipher.',
    x: 2040,
    y: 2860,
    z: 95,
    icon: '🔓',
    activeAbility: false,
    description: 'TACTICAL & STORY RELIC: Highlights enemy anatomical weakpoints (+18% Body-Part Crit Damage), exposes Aegis lies in real time, and grants +2 Decryption Keys!'
  }
];

/**
 * 5 Cyber-Pet Species & Competitive Mini-Games
 */
const PET_SPECIES = {
  volt_hound: {
    id: 'volt_hound',
    name: 'Volt-Hound MK-IV',
    icon: '🐕‍🦺',
    color: '#00f5d4',
    passiveDesc: 'Arc-Zap: Periodically shocks nearby enemies for 18 dmg & +5% Agility XP.',
    baseStats: { speed: 14, ferocity: 12, wit: 10, stamina: 12 }
  },
  razor_hawk: {
    id: 'razor_hawk',
    name: 'Cobalt Razor-Hawk',
    icon: '🦅',
    color: '#3a86ff',
    passiveDesc: 'Sky-Spotter: +6% Body-Part Hit Accuracy & +5% Shooting/Flying XP.',
    baseStats: { speed: 16, ferocity: 11, wit: 13, stamina: 9 }
  },
  phase_ferret: {
    id: 'phase_ferret',
    name: 'Neon Phase-Ferret',
    icon: '🦦',
    color: '#f72585',
    passiveDesc: 'Orb Sniffer: Pulls nearby orbs +30px closer & +5% Vigilante XP.',
    baseStats: { speed: 15, ferocity: 9, wit: 16, stamina: 10 }
  },
  magma_beetle: {
    id: 'magma_beetle',
    name: 'Titan Magma-Beetle',
    icon: '🪲',
    color: '#fb5607',
    passiveDesc: 'Carapace Guard: +25 Agent Max HP & +5% Strength/Explosives XP.',
    baseStats: { speed: 9, ferocity: 16, wit: 9, stamina: 16 }
  },
  chrono_cat: {
    id: 'chrono_cat',
    name: 'Schrödinger Chrono-Cat',
    icon: '🐈‍⬛',
    color: '#b5179e',
    passiveDesc: 'Nine-Lives Glitch: 15% chance to auto-parry melee hits & +5% All XP.',
    baseStats: { speed: 13, ferocity: 12, wit: 15, stamina: 11 }
  }
};

/**
 * Rare, High-Stakes Omega Bounties
 */
const OMEGA_BOUNTIES = [
  {
    id: 'bounty_phantom_courier',
    name: 'VEX "NIGHTRUNNER" KADE',
    title: 'Omega Bounty: Encrypted Core Courier',
    hp: 950,
    maxHp: 950,
    speed: 4.6,
    rewardTokens: 3,
    rewardXp: 160,
    startX: 400,
    startY: 400,
    extractX: 2850,
    extractY: 2850,
    tip: 'HIGH SPEED RUNNER! Target LEGS (Key 4) to cripple his thrusters before he reaches Extraction!',
    truthTransmission: 'VEX KADE: "Wait—don\'t shoot! I\'m carrying insulin and neural-blockers for the children in Sector 02! Vance wants them dead!"'
  },
  {
    id: 'bounty_ironclad_titan',
    name: 'GOLIATH-9 SIEGE EXECUTIONER',
    title: 'Omega Bounty: Rogue Heavy War-Mech',
    hp: 1500,
    maxHp: 1500,
    speed: 2.6,
    rewardTokens: 4,
    rewardXp: 200,
    startX: 2400,
    startY: 500,
    extractX: 500,
    extractY: 2500,
    tip: 'HEAVY CANNON ARMS & COUNTER STANCE! Target ARMS (Key 3) to disarm cannons and use Timed Counter (Q)!',
    truthTransmission: 'GOLIATH BLACK-BOX: "DIRECTIVE OVERRIDE: Eliminating civilian witnesses to Project ECLIPSE per Director Vance\'s orders..."'
  },
  {
    id: 'bounty_dr_rostova',
    name: 'DR. ELENA ROSTOVA',
    title: 'Omega Bounty: Chief Bio-Architect Defector',
    hp: 850,
    maxHp: 850,
    speed: 4.1,
    rewardTokens: 4,
    rewardXp: 180,
    startX: 600,
    startY: 2400,
    extractX: 2700,
    extractY: 600,
    tip: 'CAPTURE ALIVE BONUS! Cripple her LEGS (Key 4) to capture without lethal headshot overkill for +2 Truth Keys!',
    truthTransmission: 'DR. ROSTOVA: "Agents, listen to me! I designed your augmentations! Director Vance put a slave-cipher in your skulls—here is the override key!"'
  }
];

/**
 * 3-Act Narrative Twist ("Are We the Bad Guys?")
 */
const STORY_ACTS = {
  1: {
    act: 1,
    title: 'ACT I: PEACEKEEPERS OF AEGIS',
    speaker: 'DIRECTOR VANCE (Aegis Directorate)',
    bannerColor: '#3a86ff',
    briefing: 'Welcome to Neo-Veridia, Agents. Kaelen Voss and his terrorists have destabilized the city. Collect Bio-Stabilizer Orbs, pacify the 4 Sectors, and eliminate high-value insurgents. Order through strength.'
  },
  2: {
    act: 2,
    title: 'ACT II: SIGNAL BLEED (CRACKS IN THE DIRECTIVE)',
    speaker: 'DR. KAELEN VOSS (Encrypted Resistance Frequency)',
    bannerColor: '#ffbe0b',
    briefing: 'Agents, stop firing! Look at your Neural Drift telemetry! The "Agility Orbs" you\'re absorbing are harvested civilian minds, and the "Syndicate outposts" Vance ordered you to bomb are refugee power stations. You\'re fighting for the tyrant who enslaved this city!'
  },
  3: {
    act: 3,
    title: 'ACT III: PROTOCOL ECLIPSE (THE RECKONING)',
    speaker: 'DIRECTOR VANCE [HOSTILE] vs. FREE GUARD SQUAD',
    bannerColor: '#ff4d6d',
    briefing: 'VANCE: "So you decrypted the truth. Pity. You were my finest bio-weapons—now you\'re obsolete! All Aegis Peacekeepers: execute the Agents!" — OBJECTIVE: Defeat Director Vance\'s Eclipse Dreadnought in Sector 04!'
  }
};

module.exports = {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  MAX_PLAYERS_PER_INSTANCE,
  SKILLS,
  CLASSES,
  SKILL_TREE,
  BODY_PARTS,
  SECRET_MUTATIONS,
  DISTRICTS,
  BUILDINGS,
  PROTOTYPE_RELICS,
  PET_SPECIES,
  OMEGA_BOUNTIES,
  STORY_ACTS,
  generateOrbs
};

