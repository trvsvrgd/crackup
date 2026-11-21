import type { AttributeValues } from './progressionRegistry.js';
import { ARCHITECTURE_PLACEMENTS } from './worldSystemsRegistry.js';
export type Requirements = Partial<AttributeValues>;
export function meetsRequirements(attributes: AttributeValues, requires: Requirements): boolean {
  return Object.entries(requires).every(([stat, level]) => Number.isFinite(attributes[stat as keyof AttributeValues]) && attributes[stat as keyof AttributeValues] >= level);
}
export interface MovementSynergy {
  kind: 'none' | 'dash' | 'jump' | 'glide' | 'launch' | 'shield' | 'uppercut' | 'wave' | 'brake' | 'pin' | 'lift' | 'tether';
  speedMps: number; heightM: number; rangeM: number; durationSec: number; gravityScale: number;
}
const motion = (kind: MovementSynergy['kind'], speedMps = 0, heightM = 0, rangeM = 0, durationSec = .35, gravityScale = 1): MovementSynergy => ({ kind, speedMps, heightM, rangeM, durationSec, gravityScale });
export interface WeaponDefinition {
  id: string; name: string; category: 'melee' | 'firearm' | 'explosive'; requires: Requirements;
  damage: number; cooldownSec: number; magazine: number; reloadSec: number; burst: number; movement: MovementSynergy;
}
function weapon(id: string, name: string, requires: Requirements, damage: number, cooldownSec: number, movement: MovementSynergy, magazine = 0, burst = 1): WeaponDefinition {
  return { id, name, requires, damage, cooldownSec, movement, magazine, burst, reloadSec: 2,
    category: id.startsWith('ML') ? 'melee' : id.startsWith('GN') ? 'firearm' : 'explosive' };
}
export const WEAPON_REGISTRY: readonly WeaponDefinition[] = [
  weapon('ML_01', 'Shock-Baton', { strength: 1 }, 35, .4, motion('none')),
  weapon('ML_02', 'Street-Claw Knuckles', { strength: 1, agility: 2 }, 42, .3, motion('dash', 12, 0, 2, .16)),
  weapon('ML_03', 'Ronin Mono-Katana', { agility: 3, strength: 2 }, 75, .8, motion('dash', 24, 0, 8, 8 / 24)),
  weapon('ML_04', 'Pneumatic Pile-Bunker', { strength: 3, flying: 2 }, 110, 1.2, motion('dash', 30, 0, 15, .5)),
  weapon('ML_05', 'Bastion Riot Shield', { strength: 3, agility: 2 }, 55, .8, motion('shield', 22, 0, 22, 1)),
  weapon('ML_06', 'Twin Plasma Wakizashi', { agility: 4, flying: 2 }, 80, .5, motion('glide', 18, 0, 0, 2, .2)),
  weapon('ML_07', 'Foundry Slag-Hammer', { strength: 4 }, 125, 1.5, motion('launch', 24, 0, 6, .5)),
  weapon('ML_08', 'Valkyrie Hard-Light Aegis', { flying: 4, vigilante: 3 }, 90, 1, motion('shield', 12, 0, 3, 3)),
  weapon('ML_09', 'Graviton Fist', { strength: 5, flying: 3 }, 140, 1.5, motion('uppercut', 14, 0, 4, 2, -.2)),
  weapon('ML_10', 'Eclipse Phase-Blade', { agility: 5, strength: 4 }, 150, 2, motion('wave', 0, 0, 25)),
  weapon('GN_01', 'P-9 Peacemaker', { shooting: 1 }, 42, .25, motion('none'), 12),
  weapon('GN_02', 'Viper Twin-SMGs', { shooting: 2, agility: 2 }, 18, .12, motion('brake', 0, 0, 0, .15, .9), 40, 2),
  weapon('GN_03', 'BR-55 3-Burst AR', { shooting: 2 }, 24, .35, motion('none'), 30, 3),
  weapon('GN_04', 'Breaker Shotgun', { shooting: 2, strength: 2 }, 80, 1, motion('jump', 0, 7), 6),
  weapon('GN_05', 'Smart-Link 5-Burst Carbine', { shooting: 3 }, 24, .5, motion('none'), 35, 5),
  weapon('GN_06', 'Heavy Suppressor LMG', { shooting: 3, strength: 3 }, 32, .14, motion('brake', 0, 0, 0, .4, .15), 60),
  weapon('GN_07', 'Needle Gauss Rifle', { shooting: 4 }, 115, 1.1, motion('pin', 18, 0, 80, 3), 8),
  weapon('GN_08', 'Arc-Caster Shotgun', { shooting: 4, explosives: 2 }, 95, .9, motion('wave', 0, 0, 8), 8),
  weapon('GN_09', 'Sun-Lance Plasma Railgun', { shooting: 5, flying: 3 }, 160, 1.5, motion('dash', 25, 0, 10, .4), 5),
  weapon('GN_10', 'Chimera 7-Voice Revolver', { shooting: 5, vigilante: 4 }, 30, 1.5, motion('none'), 7, 7),
  weapon('EX_01', 'Concussion Frag', { explosives: 1 }, 100, 1.5, motion('none'), 3),
  weapon('EX_02', 'Bolo Grapple-Mine', { explosives: 2, agility: 2 }, 70, 2, motion('tether', 18, 0, 20, 2), 3),
  weapon('EX_03', 'Grav-Updraft Grenade', { explosives: 3, flying: 2 }, 50, 4, motion('lift', 0, 35, 5, 4), 3),
  weapon('EX_04', 'M-79 Thumper', { explosives: 3, strength: 2 }, 120, 2, motion('jump', 0, 18), 4),
  weapon('EX_05', 'Viper-Lock Stinger', { explosives: 4, shooting: 3 }, 160, 3, motion('none'), 3),
  weapon('EX_06', 'Thermite Breacher', { explosives: 3 }, 250, 3, motion('wave', 0, 0, 5, 2), 3),
  weapon('EX_07', 'Tether-Harpoon Cluster', { explosives: 4, strength: 3 }, 150, 3, motion('tether', 24, 0, 35, 3), 3),
  weapon('EX_08', 'Protocol Eclipse Orbital Painter', { explosives: 5, vigilante: 4 }, 300, 10, motion('wave', 0, 0, 25, 2), 1),
];
export const WEAPON_BY_ID = new Map(WEAPON_REGISTRY.map(w => [w.id, w]));
export const RELIC_REGISTRY = [
  { id: 'RELIC_01', legacyId: 'CHRONO_SHIFT_ANCHOR', name: 'Chrono-Shift Anchor', requires: {}, parameters: { rewindSec: 3, cooldownSec: 3 }, position: { x: 0, y: 7, z: -20 } },
  { id: 'RELIC_02', legacyId: 'HYPERION_COIL', name: 'Somna-Cortical Crown', requires: {}, parameters: { focusMultiplier: 2, overkillShieldRatio: 1, shieldCap: 200, radiusM: 30 }, position: { x: -35, y: .5, z: 32 } },
  { id: 'RELIC_03', legacyId: 'GRAV_FLUX_CORE', name: 'Graviton Core Harness', requires: {}, parameters: { wallRunLimitSec: -1, hoverSec: 4, gravityScale: 0 }, position: { x: -32, y: 8.5, z: -36 } },
  { id: 'RELIC_04', legacyId: 'TITAN_GYRO', name: 'Aegis Master Key-Cipher', requires: {}, parameters: { radiusM: 30, hackSec: 30, samDisableSec: 10 }, position: { x: 35, y: .5, z: 32 } },
] as const;
export function ownsRelic(owned: Set<string>, id: string): boolean {
  const spec = RELIC_REGISTRY.find(r => r.id === id); return !!spec && (owned.has(id) || owned.has(spec.legacyId));
}
export interface VehicleDefinition {
  id: string; name: string; kind: 'ground' | 'air'; requires: Requirements; massKg: number;
  speedMps: number; hp: number; handling: number; wallDriveDeg: number; winchKg: number; weaponDamage: number;
}
const ground = (id: string, name: string, level: number, massKg: number, speedMps: number, hp: number, wallDriveDeg = 0): VehicleDefinition => ({ id, name, kind: 'ground', requires: { driving: level }, massKg, speedMps, hp, handling: 1, wallDriveDeg, winchKg: 0, weaponDamage: level >= 3 ? 32 : 0 });
const aircraft = (id: string, name: string, level: number, massKg: number, speedMps: number, hp: number, winchKg = 0): VehicleDefinition => ({ id, name, kind: 'air', requires: { flying: level }, massKg, speedMps, hp, handling: 1 + (level - 1) * .15, wallDriveDeg: 0, winchKg, weaponDamage: level >= 2 ? 45 : 0 });
export const VEHICLE_REGISTRY: readonly VehicleDefinition[] = [
  ground('VH_G01', 'Pulse Commuter', 1, 1400, 28, 400), ground('VH_G02', 'Kaze-900 Cyber-Cycle', 2, 250, 38, 220),
  ground('VH_G03', 'Agency Interceptor V8', 2, 1800, 42, 650), ground('VH_G04', 'Syndicate Mule Technical', 3, 2400, 34, 800),
  ground('VH_G05', 'Helios Spectre Hyper-Coupe', 4, 1500, 55, 550, 75), ground('VH_G06', 'Aegis Prowler MRAP', 4, 3200, 32, 1400),
  ground('VH_G07', 'Foundry Slag-Dozer', 5, 4000, 22, 1800), ground('VH_G08', 'Chimera Spider-Tank', 5, 4000, 30, 2200, 65),
  aircraft('VH_A01', 'Wasp Gyro-Copter', 1, 800, 28, 350), aircraft('VH_A02', 'Civic Med-Evac Hoist Chopper', 2, 1800, 32, 600, 1000),
  aircraft('VH_A03', 'Kestrel Tilt-Rotor VTOL', 2, 2400, 40, 750), aircraft('VH_A04', 'Goliath Sky-Crane', 3, 4000, 28, 1100, 4000),
  aircraft('VH_A05', 'Stealth Manta Dropship', 4, 3000, 45, 950), aircraft('VH_A06', 'Valkyrie Dogfighter VTOL', 4, 2200, 55, 850),
  aircraft('VH_A07', 'Mini-Dreadnought Command Gunship', 5, 6000, 35, 2400),
];
export const VEHICLE_BY_ID = new Map(VEHICLE_REGISTRY.map(v => [v.id, v]));
export const PET_FIELD_REGISTRY = [
  { id: 'PET_00', species: 0, name: 'Neon Fox', requires: { vigilante: 1 }, cooldownSec: 6, rangeM: 18, damage: 25, durationSec: 4, slowMultiplier: .5, shieldRadiusM: 0, coverDamage: 0, trackingRadiusM: 0, ventReachM: 8 },
  { id: 'PET_01', species: 1, name: 'Grid Hound', requires: { vigilante: 2 }, cooldownSec: 6, rangeM: 25, damage: 55, durationSec: 5, slowMultiplier: 0, shieldRadiusM: 0, coverDamage: 0, trackingRadiusM: 150, ventReachM: 0 },
  { id: 'PET_02', species: 2, name: 'Aero-Raven Drone', requires: { flying: 2 }, cooldownSec: 8, rangeM: 45, damage: 0, durationSec: 8, slowMultiplier: 1, shieldRadiusM: 0, coverDamage: 0, trackingRadiusM: 60, ventReachM: 0 },
  { id: 'PET_03', species: 3, name: 'Titan Beetle', requires: { strength: 3 }, cooldownSec: 10, rangeM: 12, damage: 70, durationSec: 5, slowMultiplier: .3, shieldRadiusM: 3, coverDamage: 250, trackingRadiusM: 0, ventReachM: 0 },
] as const;
export const PET_VENT_REGISTRY = ARCHITECTURE_PLACEMENTS.filter(p => p.kind === 'BREACHABLE_WALL').map(p => ({
  id: `VENT_${p.id}`, doorId: p.id, phaseSec: 1.2, unlockDamage: 250,
  entrance: { x: p.center.x - 1.6, y: p.center.y - 1.4, z: p.center.z + p.halfExtents.z + .3 },
  exit: { x: p.center.x - 1.6, y: p.center.y - 1.4, z: p.center.z - p.halfExtents.z - .6 },
}));
export const TIER3_RULES = { focusSec: 3, focusCooldownSec: 8, shieldCap: 200, shieldDecayPerSec: 10, maxActiveVolumes: 16, gravity: 24,
  wallProbeM: 1.1, wallRunSec: 3.5, wallRunSpeedMps: 14, railSpeedMps: 22, abilityMaxRangeM: 110, meleeScale: 35,
  spawnCooldownSec: 5, actionRateSec: .15, recoilPitchRad: .18, projectileSpeedMps: 22, projectileFuseSec: 2, projectileRadiusM: .12, projectileMassKg: 1, arcSegments: 24,
  fallDamageThresholdMps: 24, fallDamagePerMps: 4 } as const;

/** Projectile and attachment tuning shared by authority and presentation. */
export const TIER3_COMBAT = {
  stinger: { speedMps: 42, lifetimeSec: 5, turnPerSec: 5, coneCos: .8, proximityM: 1.5 },
  swarm: { speedMps: 32, lifetimeSec: 4, turnPerSec: 4, coneCos: .65, proximityM: 1.5 },
  orbital: { rangeM: 110, delaySec: 2, radiusM: 25 },
  winch: { lengthM: 6, springPerSec: 5, dampingPerSec: 3, breakRangeM: 30 },
  deflect: { cooldownSec: .6 },
} as const;
