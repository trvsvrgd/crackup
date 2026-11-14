import { DistrictId } from '../constants.js';
import type { Vec3 } from '../protocol/binaryProtocol.js';
import type { WorldBoxStructure } from './neoVeridiaBlock.js';

export interface ArchitecturePlan {
  id: string;
  district: DistrictId;
  origin: Vec3;
  height: number;
  podiumHeight: number;
  lowerHalfWidth: number;
  upperHalfWidth: number;
  setbackHeight: number;
  members: WorldBoxStructure[];
  additions: WorldBoxStructure[];
  anchors: Record<string, Vec3>;
  sign: string;
}
export const ARCHITECTURE_REPRESENTATIVES = ['crane_alpha', 'foundry_stack_01', 'helios_tower_01', 'aegis_bastion_south'] as const;
export type ArchitectureRollout = 'representatives' | 'citywide';
export const ARCHITECTURE_ROLLOUT: ArchitectureRollout = 'citywide';

/** Derive architecture from legacy building footprints rather than replacing their IDs or layouts. */
export function getArchitecturePlans(structures: readonly WorldBoxStructure[], rollout: ArchitectureRollout = 'citywide'): ArchitecturePlan[] {
  const ids = new Set(structures.filter(s => s.id.endsWith('_podium')).map(s => s.id.slice(0, -7)));
  for (const s of structures) if (/^crane_\w+_pier$/.test(s.id)) ids.add(s.id.slice(0, -5));
  return [...ids].filter(id => rollout === 'citywide' || (ARCHITECTURE_REPRESENTATIVES as readonly string[]).includes(id)).flatMap(id => {
    const memberSuffix = /^(podium|pier|lower_shaft|upper_shaft|core|shaft|mast|rooftop_crown|crown|elevator_spine|ledge_\d+|hvac_\d+|turret_(nw|ne|sw|se)|truss_ledge_\d+|boom|suspended_cargo)$/;
    const members = structures.filter(s => s.id.startsWith(`${id}_`) && memberSuffix.test(s.id.slice(id.length + 1)));
    const podium = members.find(s => s.id === `${id}_podium` || s.id === `${id}_pier`);
    const lower = members.find(s => s.id === `${id}_lower_shaft` || s.id === `${id}_core` || s.id === `${id}_shaft` || s.id === `${id}_mast`);
    if (!podium || !lower) return [];
    const upper = members.find(s => s.id === `${id}_upper_shaft`) ?? lower;
    const crown = members.find(s => s.id === `${id}_rooftop_crown` || s.id === `${id}_crown`);
    const height = crown ? crown.center.y + crown.halfExtents.y : upper.center.y + upper.halfExtents.y;
    const podiumHeight = podium.center.y + podium.halfExtents.y;
    const origin = { x: podium.center.x, y: 0, z: podium.center.z };
    const district = podium.district!;
    const plan: ArchitecturePlan = { id, district, origin, height, podiumHeight,
      lowerHalfWidth: lower.halfExtents.x, upperHalfWidth: upper.halfExtents.x,
      setbackHeight: upper === lower ? height : upper.center.y - upper.halfExtents.y,
      members, additions: [], anchors: {}, sign: district === DistrictId.NEON_DOCKS ? 'PORT / 07' : district === DistrictId.FOUNDRY_SLUMS ? 'FORGE / 12' : district === DistrictId.HELIOS_SPIRE ? 'HELIOS' : 'AEGIS' };
    const add = (name: string, local: Vec3, half: Vec3, material: WorldBoxStructure['material']) => {
      const part: WorldBoxStructure = { id: `arch3a_${id}_${name}`, center: { x: origin.x + local.x, y: local.y, z: origin.z + local.z }, halfExtents: half,
        material, district, excludeOrbPlacement: true };
      plan.additions.push(part); return part;
    };
    // A ledge every 4m, split into four strips so a mantle can finish outside the shaft.
    // Keep legacy wraparound ledges, HVAC platforms and their saved orb positions intact.
    const existingTop = members.filter(s => s.material === 'ledge_trim').map(s => s.center.y + s.halfExtents.y);
    const neighboringStructures = structures.filter(p => !p.excludeOrbPlacement && (!members.includes(p) || /_(boom|suspended_cargo|elevator_spine)$/.test(p.id)) && !p.isSensorOnly && p.material !== 'harbor_water');
    for (let y = podiumHeight + 4; y <= height - 2; y += 4) {
      if (existingTop.some(top => Math.abs(top - y) < 2.4)) continue;
      const hw = y >= plan.setbackHeight ? plan.upperHalfWidth : plan.lowerHalfWidth;
      const lip = 1.65, thickness = 0.18;
      const candidates: [string, Vec3, Vec3][] = [
        ['north', { x: 0, y: y - thickness, z: -hw - lip / 2 }, { x: hw + lip, y: thickness, z: lip / 2 }],
        ['south', { x: 0, y: y - thickness, z: hw + lip / 2 }, { x: hw + lip, y: thickness, z: lip / 2 }],
        ['west', { x: -hw - lip / 2, y: y - thickness, z: 0 }, { x: lip / 2, y: thickness, z: hw }],
        ['east', { x: hw + lip / 2, y: y - thickness, z: 0 }, { x: lip / 2, y: thickness, z: hw }],
      ];
      for (const [face, center, half] of candidates) {
        // Preserve standing headroom over every existing HVAC stepping stone, not just known orb IDs.
        const blocksRoute = members.some(p => p.id.includes('_hvac_') && Math.abs(p.center.y + p.halfExtents.y - y) < 2.4 &&
          Math.abs(p.center.x - origin.x - center.x) < p.halfExtents.x + half.x + 0.45 && Math.abs(p.center.z - origin.z - center.z) < p.halfExtents.z + half.z + 0.45);
        // Existing skybridges take precedence where they meet a facade; do not add shelves inside them.
        const crossesConnection = neighboringStructures.some(p => p.center.y - p.halfExtents.y < y + 2.2 && p.center.y + p.halfExtents.y > y - thickness * 2 &&
          Math.abs(p.center.x - origin.x - center.x) < p.halfExtents.x + half.x + 0.45 && Math.abs(p.center.z - origin.z - center.z) < p.halfExtents.z + half.z + 0.45);
        if (!blocksRoute && !crossesConnection) add(`ledge_${y}_${face}`, center, half, 'ledge_trim');
      }
    }
    const roofHalf = crown?.halfExtents.x ?? plan.upperHalfWidth;
    const parapet = 0.2;
    // Leave a centered 3m gap in the south parapet for roof entry.
    add('parapet_north', { x: 0, y: height + 0.45, z: -roofHalf + parapet }, { x: roofHalf, y: 0.45, z: parapet }, 'brutalist_concrete');
    for (const side of [-1, 1]) {
      add(`parapet_${side}_side`, { x: side * (roofHalf - parapet), y: height + 0.45, z: 0 }, { x: parapet, y: 0.45, z: roofHalf }, 'brutalist_concrete');
      const width = Math.max(0.5, (roofHalf - 1.5) / 2);
      add(`parapet_south_${side}`, { x: side * (1.5 + width), y: height + 0.45, z: roofHalf - parapet }, { x: width, y: 0.45, z: parapet }, 'brutalist_concrete');
    }
    // The full legacy podium is solid. Put the accessible recessed vestibule and colonnade outside it.
    const front = podium.halfExtents.z, columnX = Math.min(6, podium.halfExtents.x - 1);
    for (const side of [-1, 1]) {
      add(`lobby_column_${side}`, { x: side * columnX, y: 2.7, z: -front - 1.5 }, { x: 0.3, y: 2.7, z: 0.3 }, 'brutalist_concrete');
      if (podium.halfExtents.x >= 12) add(`outer_lobby_column_${side}`, { x: side * (podium.halfExtents.x - 1.5), y: 2.7, z: -front - 1.5 }, { x: 0.3, y: 2.7, z: 0.3 }, 'brutalist_concrete');
    }
    add('lobby_awning', { x: 0, y: 5.6, z: -front - 1.2 }, { x: columnX + 0.6, y: 0.2, z: 2 }, 'obsidian_steel');
    add('roof_hvac_left', { x: -roofHalf * 0.5, y: height + 0.4, z: -roofHalf * 0.4 }, { x: 1.35, y: 0.4, z: 1.6 }, 'industrial_grate');
    add('roof_hvac_right', { x: roofHalf * 0.5, y: height + 0.4, z: -roofHalf * 0.4 }, { x: 1.35, y: 0.4, z: 1.6 }, 'industrial_grate');
    plan.anchors = { Entrance: { x: 0, y: 0, z: -front - 3.5 }, RoofEntry: { x: 0, y: height, z: roofHalf - 1 },
      Helipad: { x: 0, y: height + 0.025, z: 0 }, Antenna: { x: -roofHalf * 0.7, y: height, z: roofHalf * 0.7 }, Sign: { x: -plan.lowerHalfWidth + 0.8, y: podiumHeight + 11, z: -plan.lowerHalfWidth - 0.42 } };
    return [plan];
  });
}
