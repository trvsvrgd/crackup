import { DistrictId } from '../constants.js';
import type { Vec3 } from '../protocol/binaryProtocol.js';
import type { WorldBoxStructure } from '../world/neoVeridiaBlock.js';
import { immutable } from './worldLore.js';

export interface Bounds3 { center: Vec3; halfExtents: Vec3 }
export const TIER2_DISTRICTS = immutable([
  { district: DistrictId.NEON_DOCKS, x: -550, z: 70, roof: 42, ceiling: 75 },
  { district: DistrictId.FOUNDRY_SLUMS, x: 550, z: 70, roof: 62, ceiling: 90 },
  { district: DistrictId.HELIOS_SPIRE, x: 550, z: -70, roof: 102, ceiling: 120 },
  { district: DistrictId.AEGIS_CITADEL, x: -550, z: -70, roof: 82, ceiling: 100 },
]);
export interface VerticalHazardSpec extends Bounds3 {
  id: string; district: DistrictId; kind: 'THERMAL_UPDRAFT' | 'CANYON_CROSSWIND' | 'TIMED_LOUVER' | 'SAM_CEILING';
  impulse: Vec3; periodSec: number; activeSec: number; phaseSec: number; damagePerSec: number;
  /** SAM bounds are a horizontal rectangle at center.y extruded upward without an altitude escape cap. */
  extendsUpward?: boolean;
}
export const VERTICAL_HAZARD_SPECS = immutable(TIER2_DISTRICTS.flatMap((d, i): VerticalHazardSpec[] => [
  { id: `crosswind-${i}`, district: d.district, kind: 'CANYON_CROSSWIND', center: { x: d.x, y: d.roof + 15, z: d.z - 28 }, halfExtents: { x: 11, y: 20, z: 12 }, impulse: { x: i % 2 ? -6.5 : 6.5, y: 0, z: 0 }, periodSec: 0, activeSec: 0, phaseSec: 0, damagePerSec: 0 },
  { id: `louver-${i}`, district: d.district, kind: 'TIMED_LOUVER', center: { x: d.x - 9, y: d.roof + 2, z: d.z }, halfExtents: { x: 2, y: 2, z: 4 }, impulse: { x: 0, y: 0, z: 0 }, periodSec: 6, activeSec: 1.5, phaseSec: 0, damagePerSec: 40 },
  { id: `sam-${i}`, district: d.district, kind: 'SAM_CEILING', center: { x: Math.sign(d.x) * 300, y: d.ceiling, z: Math.sign(d.z) * 300 }, halfExtents: { x: 300, y: 0, z: 300 }, extendsUpward: true, impulse: { x: 0, y: 0, z: 0 }, periodSec: 5.5, activeSec: 2.5, phaseSec: 3, damagePerSec: 0 },
  ...(d.district === DistrictId.FOUNDRY_SLUMS ? [{ id: 'foundry-updraft', district: d.district, kind: 'THERMAL_UPDRAFT' as const, center: { x: d.x + 9, y: 78, z: d.z + 18 }, halfExtents: { x: 5, y: 62, z: 5 }, impulse: { x: 0, y: 18, z: 0 }, periodSec: 0, activeSec: 0, phaseSec: 0, damagePerSec: 0 }] : []),
]));
export const AIRSPACE_RULES = immutable({ lockSec: 3, stallSec: 2.5, flareLevel: 4, flareProtectionSec: 3, flareCooldownSec: 8 });
export const RADAR_NODE_SPECS = immutable(TIER2_DISTRICTS.map((d, i) => ({ id: 200 + i, district: d.district, hp: 120,
  center: { x: d.x, y: d.roof + 1, z: d.z + 5 }, halfExtents: { x: 0.7, y: 1, z: 0.7 } })));
export const DESTRUCTIBLE_ARCHITECTURE_SPECS = immutable({
  BREACHABLE_WALL: { hp: 250, strengthLevel: 3, explosivesLevel: 3 },
  TACTICAL_FALLING_PROP: { anchorHP: 80, massKg: 1200, crushDamage: 450, impactRadiusM: 5 },
  SELF_HEALING_REGEN: { cooldownSec: 180, playerExclusionRadiusM: 80 },
});
export interface ArchitectureSpec extends Bounds3 {
  id: number; district: DistrictId; kind: 'BREACHABLE_WALL' | 'TACTICAL_FALLING_PROP';
  name: string; anchor: Vec3;
}
export const ARCHITECTURE_PLACEMENTS = immutable(TIER2_DISTRICTS.flatMap((d, i): ArchitectureSpec[] => [
  { id: 10 + i, district: d.district, kind: 'BREACHABLE_WALL', name: 'Cracked concrete cache entrance', center: { x: d.x, y: 34, z: d.z + 6 }, halfExtents: { x: 3, y: 2, z: 0.3 }, anchor: { x: d.x, y: 34, z: d.z + 6 } },
  ...['Corporate holo-sign', 'HVAC chiller', 'Suspended cargo load'].map((name, j): ArchitectureSpec => ({ id: 30 + i * 3 + j, district: d.district, kind: 'TACTICAL_FALLING_PROP', name,
    center: { x: d.x - 12 + j * 12, y: 18 + j * 3, z: d.z + 26 }, halfExtents: { x: j === 0 ? 3 : 1.5, y: j === 0 ? 1 : 1.5, z: 1 }, anchor: { x: d.x - 12 + j * 12, y: 21 + j * 3, z: d.z + 26 } })),
]));
export const SAFE_HOUSE_REGISTRY = immutable(TIER2_DISTRICTS.flatMap((d, i) => [
  { id: i * 2, district: d.district, kind: 'STREET_GARAGE' as const, center: { x: d.x, y: 1, z: d.z + 40 }, halfExtents: { x: 7, y: 3, z: 6 }, spawn: { x: d.x + 10, y: 1.2, z: d.z + 40 }, clearRadiusM: 60, services: ['CUSTOM_VEHICLE', 'CHASSIS_SWAP', 'AMMO_RESUPPLY'] as const },
  { id: i * 2 + 1, district: d.district, kind: 'ROOFTOP_PAD' as const, center: { x: d.x, y: d.roof + 1, z: d.z }, halfExtents: { x: 7, y: 3, z: 6 }, spawn: { x: d.x, y: d.roof + 1.5, z: d.z - 4 }, clearRadiusM: 60, services: ['VTOL', 'CHASSIS_SWAP', 'AMMO_RESUPPLY'] as const },
]));
export const DYNAMIC_SKIRMISH_TABLE = immutable([
  { kind: 'PUBLIC_SERVANT_ESCORT', minStability: 70, maxStability: 100, upperExclusive: false, intervalSec: 150, durationSec: 90, hostileCount: 0 },
  { kind: 'PUBLIC_SERVANT_REPAIR', minStability: 70, maxStability: 100, upperExclusive: false, intervalSec: 150, durationSec: 90, hostileCount: 0 },
  { kind: 'SYNDICATE_ARMORED_ROBBERY', minStability: 0, maxStability: 40, upperExclusive: true, intervalSec: 60, durationSec: 90, hostileCount: 3 },
  { kind: 'RIOT_CLINIC_SIEGE', minStability: 0, maxStability: 40, upperExclusive: true, intervalSec: 60, durationSec: 90, hostileCount: 4 },
  { kind: 'AEGIS_HIT_SQUAD_AMBUSH', minStability: 0, maxStability: 40, upperExclusive: true, intervalSec: 60, durationSec: 90, hostileCount: 3 },
]);
export const SKIRMISH_RULES = immutable({
  escort: { hp: 180, distanceM: 25, speedMps: 1.5, accompanyRadiusM: 4 },
  repair: { hp: 100, initialHp: 25, workSec: 10, interactRadiusM: 3 },
  robbery: { hp: 600, distanceM: 50, speedMps: 4, recoverSec: 3, interactRadiusM: 3 },
  siege: { hp: 400, defendSec: 45, waveTimesSec: [15, 30], attackersPerWave: 2, damagePerSec: 10, attackRangeM: 14 },
  ambush: { triggerRadiusM: 8, reinforcementSec: 6, reinforcements: 3 },
  activationRadiusM: 100, maxActorsPerDistrict: 8,
});

/** Additive occupied geometry; excluded from persisted orb placement order. */
export function buildTier2Structures(): WorldBoxStructure[] {
  const out: WorldBoxStructure[] = [];
  for (const d of TIER2_DISTRICTS) {
    const box = (id: string, x: number, y: number, z: number, hx: number, hy: number, hz: number, material: WorldBoxStructure['material'] = 'brutalist_concrete') =>
      out.push({ id: `tier2-${d.district}-${id}`, district: d.district, center: { x, y, z }, halfExtents: { x: hx, y: hy, z: hz }, material, excludeOrbPlacement: true });
    box('cache-floor', d.x, 31.5, d.z, 7, 0.5, 10);
    box('cache-roof', d.x, 36.5, d.z, 7, 0.5, 7);
    box('cache-left', d.x - 6, 34, d.z, 1, 2, 6);
    box('cache-right', d.x + 6, 34, d.z, 1, 2, 6);
    box('cache-back', d.x, 34, d.z - 6, 5, 2, 0.5);
    box('entrance-left', d.x - 4, 34, d.z + 6, 1, 2, 0.3);
    box('entrance-right', d.x + 4, 34, d.z + 6, 1, 2, 0.3);
    box('landing-pad', d.x, d.roof - 0.5, d.z, 9, 0.5, 9, 'industrial_grate');
    box('supply-cache', d.x, 32.6, d.z - 3, 1.2, 0.6, 0.6, 'neon_cyan');
    for (const side of [-1, 1]) {
      box(`cache-support-${side}`, d.x + side * 6, 15.5, d.z, 0.6, 15.5, 0.6, 'obsidian_steel');
      box(`pad-support-${side}`, d.x + side * 7, (37 + d.roof - 1) / 2, d.z, 0.5, (d.roof - 38) / 2, 0.5, 'obsidian_steel');
      for (let y = 52; y < d.roof - 5; y += 20) box(`grapple-rest-${side}-${y}`, d.x + side * 8, y, d.z, 2, 0.3, 3, 'industrial_grate');
    }
    box('garage', d.x, 0.1, d.z + 40, 8, 0.1, 7, 'industrial_grate');
    for (const side of [-1, 1]) box(`canyon-${side}`, d.x + side * 18, (d.roof + 40) / 2, d.z - 28, 6, (d.roof + 40) / 2, 12, 'helios_glass');
    for (let j = 0; j < 3; j++) {
      box(`cargo-arm-${j}`, d.x - 12 + j * 12, 22 + j * 3, d.z + 26, 3.9, 0.3, 1, 'obsidian_steel');
      box(`cargo-post-${j}`, d.x - 15.6 + j * 12, (22 + j * 3) / 2, d.z + 26, 0.3, (22 + j * 3) / 2, 0.3, 'obsidian_steel');
    }
  }
  return out;
}
