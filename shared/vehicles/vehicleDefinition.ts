import type { Quat4, Vec3 } from '../protocol/binaryProtocol.js';

export enum VehiclePanelId { HOOD, LEFT_DOOR, RIGHT_DOOR, TRUNK }
export const VEHICLE_MAX_HP = 1000;
export const VEHICLE_RESPAWN_SEC = 20;
export const VEHICLE_DEBRIS_LIFETIME_SEC = 12;
export const MAX_VEHICLE_DEBRIS = 64;
export const VEHICLE_COLLISION_SHAPES = [
  { name: 'Chassis', position: { x: 0, y: 0, z: 0 }, halfExtents: { x: 1.05, y: 0.52, z: 2.3 } },
  { name: 'Canopy', position: { x: 0, y: 0.63, z: 0.1 }, halfExtents: { x: 0.82, y: 0.25, z: 0.85 } },
] as const;
export const VEHICLE_WHEEL_MOUNTS = [
  { name: 'FL', offset: { x: -0.95, y: -0.15, z: -1.55 } },
  { name: 'FR', offset: { x: 0.95, y: -0.15, z: -1.55 } },
  { name: 'RL', offset: { x: -0.95, y: -0.15, z: 1.55 } },
  { name: 'RR', offset: { x: 0.95, y: -0.15, z: 1.55 } },
] as const;
export interface VehiclePanelSpec {
  name: string; position: Vec3; rotation: Quat4; halfExtents: Vec3; massKg: number;
}
export const VEHICLE_PANELS: Record<VehiclePanelId, VehiclePanelSpec> = {
  [VehiclePanelId.HOOD]: { name: 'PanelHood', position: { x: 0, y: 0.25, z: -1.42 }, rotation: { x: -0.06, y: 0, z: 0, w: Math.sqrt(1 - 0.06 ** 2) }, halfExtents: { x: 0.88, y: 0.07, z: 0.65 }, massKg: 18 },
  [VehiclePanelId.LEFT_DOOR]: { name: 'PanelLeftDoor', position: { x: -1.01, y: 0.35, z: 0.02 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, halfExtents: { x: 0.055, y: 0.4, z: 0.65 }, massKg: 25 },
  [VehiclePanelId.RIGHT_DOOR]: { name: 'PanelRightDoor', position: { x: 1.01, y: 0.35, z: 0.02 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, halfExtents: { x: 0.055, y: 0.4, z: 0.65 }, massKg: 25 },
  [VehiclePanelId.TRUNK]: { name: 'PanelTrunk', position: { x: 0, y: 0.26, z: 1.65 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, halfExtents: { x: 0.89, y: 0.065, z: 0.47 }, massKg: 15 },
};
export function rotateVehicleVector(v: Vec3, q: Quat4): Vec3 {
  const tx = 2 * (q.y * v.z - q.z * v.y), ty = 2 * (q.z * v.x - q.x * v.z), tz = 2 * (q.x * v.y - q.y * v.x);
  return { x: v.x + q.w * tx + q.y * tz - q.z * ty, y: v.y + q.w * ty + q.z * tx - q.x * tz, z: v.z + q.w * tz + q.x * ty - q.y * tx };
}
export function multiplyVehicleQuaternions(a: Quat4, b: Quat4): Quat4 {
  return { x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y, y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w, w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z };
}
