import { immutable } from './worldLore.js';
import { DistrictId, DistrictLoopRewardId, FactionId } from '../constants.js';
import type { DistrictLoopSpec } from '../world/phase5Systems.js';
import { CHARACTER_REGISTRY } from './characterRegistry.js';
export const DISTRICT_LOOP_SPECS: DistrictLoopSpec[] = [
  {
    district: DistrictId.NEON_DOCKS,
    districtIndex: 0,
    name: 'Neon Docks Smuggler Grid',
    faction: FactionId.NEON_SYNDICATE,
    rewardId: DistrictLoopRewardId.UNLOCK_GRAPPLE_OVERDRIVE,
    rewardName: '3D Grapple-Hook Overdrive (+20m Range & +35% Winch Speed)',
    stage1Terminals: [
      { x: -24.0, y: 0.0, z: 20.0 },
      { x: -34.0, y: 0.0, z: 26.0 },
    ],
    lieutenantEnemyId: 501,
    lieutenantCallsign: CHARACTER_REGISTRY.find(c => c.id === 'CHAR_VANE')!.legacyCallsign!,
    lieutenantSpawnPos: { x: -30.0, y: 0.0, z: 24.0 },
    kingpinEnemyId: 511,
    kingpinCallsign: CHARACTER_REGISTRY.find(c => c.id === 'CHAR_KAEL')!.legacyCallsign!,
    kingpinSpawnPos: { x: -38.0, y: 0.0, z: 32.0 },
    coreOverridePos: { x: -38.0, y: 0.0, z: 32.0 },
  },
  {
    district: DistrictId.FOUNDRY_SLUMS,
    districtIndex: 1,
    name: 'Foundry Slums Thermobaric Core',
    faction: FactionId.FOUNDRY_IRONCLAD,
    rewardId: DistrictLoopRewardId.UNLOCK_PLASMA_RAILGUN,
    rewardName: 'Hyperion Plasma Railgun (1.65x Weapon DMG & +50% Armor Strip)',
    stage1Terminals: [
      { x: 24.0, y: 0.0, z: 20.0 },
      { x: 34.0, y: 0.0, z: 26.0 },
    ],
    lieutenantEnemyId: 502,
    lieutenantCallsign: CHARACTER_REGISTRY.find(c => c.id === 'CHAR_IGNIS')!.legacyCallsign!,
    lieutenantSpawnPos: { x: 30.0, y: 0.0, z: 24.0 },
    kingpinEnemyId: 512,
    kingpinCallsign: CHARACTER_REGISTRY.find(c => c.id === 'CHAR_SOLANGE')!.legacyCallsign!,
    kingpinSpawnPos: { x: 38.0, y: 0.0, z: 32.0 },
    coreOverridePos: { x: 38.0, y: 0.0, z: 32.0 },
  },
  {
    district: DistrictId.HELIOS_SPIRE,
    districtIndex: 2,
    name: 'Helios Spire Orbital Telemetry',
    faction: FactionId.HELIOS_EXECUTIVE_GUARD,
    rewardId: DistrictLoopRewardId.UNLOCK_GRAV_FLIGHT_OVERDRIVE,
    rewardName: 'Grav-Flight Overdrive (+6s Jetpack Fuel & +40% Vector Thrust)',
    stage1Terminals: [
      { x: 24.0, y: 0.0, z: -20.0 },
      { x: 34.0, y: 0.0, z: -26.0 },
    ],
    lieutenantEnemyId: 503,
    lieutenantCallsign: CHARACTER_REGISTRY.find(c => c.id === 'CHAR_CASSIA')!.legacyCallsign!,
    lieutenantSpawnPos: { x: 30.0, y: 0.0, z: -24.0 },
    kingpinEnemyId: 513,
    kingpinCallsign: CHARACTER_REGISTRY.find(c => c.id === 'CHAR_GRAVES')!.legacyCallsign!,
    kingpinSpawnPos: { x: 38.0, y: 0.0, z: -32.0 },
    coreOverridePos: { x: 38.0, y: 0.0, z: -32.0 },
  },
  {
    district: DistrictId.AEGIS_CITADEL,
    districtIndex: 3,
    name: 'Aegis Citadel Eclipse Bastion',
    faction: FactionId.AEGIS_DIRECTORATE,
    rewardId: DistrictLoopRewardId.UNLOCK_PROTOCOL_ECLIPSE_OVERRIDE,
    rewardName: 'Protocol Eclipse Override (+30% Max HP, +15m Vigilante Sphere & Shield Pierce)',
    stage1Terminals: [
      { x: -24.0, y: 0.0, z: -20.0 },
      { x: -34.0, y: 0.0, z: -26.0 },
    ],
    lieutenantEnemyId: 504,
    lieutenantCallsign: CHARACTER_REGISTRY.find(c => c.id === 'CHAR_ROOK')!.legacyCallsign!,
    lieutenantSpawnPos: { x: -30.0, y: 0.0, z: -24.0 },
    kingpinEnemyId: 514,
    kingpinCallsign: CHARACTER_REGISTRY.find(c => c.id === 'CHAR_THORNE')!.legacyCallsign!,
    kingpinSpawnPos: { x: -38.0, y: 0.0, z: -32.0 },
    coreOverridePos: { x: -38.0, y: 0.0, z: -32.0 },
  },
];


immutable(DISTRICT_LOOP_SPECS);
