import type { Vec3 } from '../protocol/binaryProtocol.js';
import type { WorldBoxStructure } from './neoVeridiaBlock.js';
import { DISTRICT_LOOP_SPECS, OMEGA_EXTRACTION_WAYPOINTS } from './phase5Systems.js';

export const RELAY_VENT_MAX_HP = 120;
export const RELAY_REBOOT_SEC = 8;
export const RELAY_TOWER_HEIGHT = 12;
export enum RelayMode { ONLINE = 0, OVERHEATING = 1, SHUTDOWN = 2, HACKED = 3 }
export interface RelayVentSpec { ventId: number; name: string; center: Vec3; halfExtents: Vec3 }
export interface RelayPlan {
  relayId: number; districtIndex: number; terminalIndex: number; origin: Vec3; towerOffset: Vec3;
  boxes: WorldBoxStructure[]; vents: RelayVentSpec[];
}
export const RELAY_BASE_RADIUS = 1.8, RELAY_BASE_HEIGHT = 1.6;
/** Same vertices feed the rendered octagon and its exact convex Rapier hull. */
export function relayBaseVertices(offset: Vec3): number[] {
  const points: number[] = [];
  for (const y of [0, RELAY_BASE_HEIGHT]) for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4; points.push(offset.x + Math.sin(a) * RELAY_BASE_RADIUS, offset.y + y, offset.z + Math.cos(a) * RELAY_BASE_RADIUS);
  }
  return points;
}
export function createRelayPlan(relayId: number, districtIndex: number, terminalIndex: number, origin: Vec3, towerOffset: Vec3): RelayPlan {
  const boxes: WorldBoxStructure[] = [], o = towerOffset;
  const box = (id: string, x: number, y: number, z: number, hx: number, hy: number, hz: number, rx = 0, rz = 0) =>
    boxes.push({ id: `relay_${relayId}_${id}`, center: { x: o.x + x, y: o.y + y, z: o.z + z }, halfExtents: { x: hx, y: hy, z: hz },
      rotation: { x: rx, y: 0, z: rz }, material: 'obsidian_steel', excludeOrbPlacement: true });
  for (const x of [-0.65, 0.65]) for (const z of [-0.65, 0.65]) box(`post_${x}_${z}`, x, 7.6, z, 0.085, 6, 0.085);
  for (let i = 0; i <= 6; i++) for (const side of [-1, 1]) {
    const y = 1.6 + i * 2;
    box(`rail_x_${i}_${side}`, 0, y, side * 0.65, 0.735, 0.06, 0.06);
    box(`rail_z_${i}_${side}`, side * 0.65, y, 0, 0.06, 0.06, 0.735);
    if (i < 6) {
      const angle = Math.atan2(1.3, 2) * (i % 2 ? -1 : 1), length = Math.hypot(1.3, 2);
      box(`brace_x_${i}_${side}`, 0, y + 1, side * 0.65, 0.035, length / 2, 0.035, 0, angle);
      box(`brace_z_${i}_${side}`, side * 0.65, y + 1, 0, 0.035, length / 2, 0.035, angle);
    }
  }
  const vents: RelayVentSpec[] = [
    { ventId: 0, name: 'CoolingVentLeft', center: { x: o.x - 1.83, y: o.y + 0.95, z: o.z }, halfExtents: { x: 0.12, y: 0.42, z: 0.55 } },
    { ventId: 1, name: 'CoolingVentRight', center: { x: o.x + 1.83, y: o.y + 0.95, z: o.z }, halfExtents: { x: 0.12, y: 0.42, z: 0.55 } },
    { ventId: 2, name: 'CoolingVentRear', center: { x: o.x, y: o.y + 0.95, z: o.z - 1.83 }, halfExtents: { x: 0.55, y: 0.42, z: 0.12 } },
  ];
  return { relayId, districtIndex, terminalIndex, origin: { ...origin }, towerOffset: { ...o }, boxes, vents };
}
/** Locate beside each original console, outside buildings, mission actors and the extraction route. */
export function getRelayPlans(structures: readonly WorldBoxStructure[]): RelayPlan[] {
  const plans: RelayPlan[] = [], objectives = DISTRICT_LOOP_SPECS.flatMap(d => [...d.stage1Terminals, d.coreOverridePos, d.lieutenantSpawnPos]);
  for (const district of DISTRICT_LOOP_SPECS) for (const [terminalIndex, origin] of district.stage1Terminals.entries()) {
    const sx = Math.sign(origin.x);
    const candidates = [ [sx * 5, 0], [-sx * 5, 0], [0, 5], [0, -5], [sx * 5, 5], [sx * 5, -5], [-sx * 5, 5], [-sx * 5, -5], [sx * 8, 0], [0, 8], [0, -8] ];
    for (const radius of [8, 11, 14, 17]) for (let i = 0; i < 16; i++) candidates.push([Math.cos(i * Math.PI / 8) * radius, Math.sin(i * Math.PI / 8) * radius]);
    const offset = candidates.find(([x, z]) => {
      const cx = origin.x + x, cz = origin.z + z;
      // Preserve the central plaza's established vehicle/prop play space.
      if (Math.hypot(cx, cz) < 36) return false;
      if (structures.some(s => !s.isSensorOnly && s.center.y + s.halfExtents.y > 0.25 && s.center.y - s.halfExtents.y < 14 &&
        Math.abs(cx - s.center.x) < s.halfExtents.x + 2.6 && Math.abs(cz - s.center.z) < s.halfExtents.z + 2.6)) return false;
      if (objectives.some(p => Math.hypot(cx - p.x, cz - p.z) < 3.3)) return false;
      if (objectives.some(p => {
        const t = Math.max(0, Math.min(1, (cx * p.x + cz * p.z) / (p.x * p.x + p.z * p.z)));
        return Math.hypot(cx - p.x * t, cz - p.z * t) < 2.9;
      })) return false;
      if (OMEGA_EXTRACTION_WAYPOINTS.some(p => Math.hypot(cx - p.x, cz - p.z) < 3.3)) return false;
      return !plans.some(p => Math.hypot(cx - p.origin.x - p.towerOffset.x, cz - p.origin.z - p.towerOffset.z) < 5.3);
    });
    if (!offset) throw new Error(`No clear relay site for district ${district.districtIndex} terminal ${terminalIndex}`);
    plans.push(createRelayPlan(district.districtIndex * 2 + terminalIndex + 1, district.districtIndex, terminalIndex, origin, { x: offset[0], y: 0, z: offset[1] }));
  }
  return plans;
}
