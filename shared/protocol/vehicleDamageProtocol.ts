import type { Quat4, Vec3 } from './binaryProtocol.js';
import { MAX_VEHICLE_DEBRIS, type VehiclePanelId } from '../vehicles/vehicleDefinition.js';

export const VEHICLE_DAMAGE_PACKET = 0x09;
export const VEHICLE_DAMAGE_HEADER_BYTES = 12, VEHICLE_DAMAGE_RECORD_BYTES = 24, VEHICLE_DEBRIS_RECORD_BYTES = 56;
export interface VehicleDamageState {
  vehicleId: number; generation: number; hp: number; maxHp: number; detachedMask: number;
  destroyed: boolean; braking: boolean; respawnSec: number; wheelAngle: number;
}
export interface VehicleDebrisState {
  id: number; vehicleId: number; generation: number; panelId: VehiclePanelId; isInterceptor: boolean;
  ageSec: number; position: Vec3; rotation: Quat4; velocity: Vec3;
}
export interface VehicleDamagePacket { serverTick: number; vehicles: VehicleDamageState[]; debris: VehicleDebrisState[] }
const uint = (n: number, max: number) => Number.isInteger(n) && n >= 0 && n <= max;
function valid(packet: VehicleDamagePacket): boolean {
  if (!uint(packet.serverTick, 0xffffffff) || packet.vehicles.length > 256 || packet.debris.length > MAX_VEHICLE_DEBRIS) return false;
  const vehicles = new Set<number>(), ids = new Set<number>();
  for (const v of packet.vehicles) {
    if (typeof v.destroyed !== 'boolean' || typeof v.braking !== 'boolean') return false;
    if (!uint(v.vehicleId, 65535) || v.vehicleId === 0 || vehicles.has(v.vehicleId) || !uint(v.generation, 65535) || v.generation === 0 || !uint(v.detachedMask, 15) ||
      ![v.hp, v.maxHp, v.respawnSec, v.wheelAngle].every(Number.isFinite) || v.maxHp <= 0 || v.hp < 0 || v.hp > v.maxHp || v.respawnSec < 0 || v.respawnSec > 60 || v.destroyed !== (v.hp === 0)) return false;
    vehicles.add(v.vehicleId);
  }
  for (const d of packet.debris) {
    if (typeof d.isInterceptor !== 'boolean') return false;
    const v = packet.vehicles.find(v => v.vehicleId === d.vehicleId);
    const qLen = Math.hypot(d.rotation.x, d.rotation.y, d.rotation.z, d.rotation.w);
    if (!uint(d.id, 0xffffffff) || d.id === 0 || ids.has(d.id) || !v || v.generation !== d.generation || !uint(d.panelId, 3) || !(v.detachedMask & (1 << d.panelId)) ||
      ![d.ageSec, d.position.x, d.position.y, d.position.z, d.rotation.x, d.rotation.y, d.rotation.z, d.rotation.w, d.velocity.x, d.velocity.y, d.velocity.z].every(Number.isFinite) || d.ageSec < 0 || d.ageSec > 60 || qLen < 0.98 || qLen > 1.02) return false;
    ids.add(d.id);
  }
  return true;
}
export function encodeVehicleDamage(packet: VehicleDamagePacket): ArrayBuffer {
  if (!valid(packet)) throw new Error('Invalid vehicle damage snapshot');
  const buffer = new ArrayBuffer(VEHICLE_DAMAGE_HEADER_BYTES + packet.vehicles.length * VEHICLE_DAMAGE_RECORD_BYTES + packet.debris.length * VEHICLE_DEBRIS_RECORD_BYTES), view = new DataView(buffer);
  view.setUint8(0, VEHICLE_DAMAGE_PACKET); view.setUint8(1, 1); view.setUint16(2, packet.vehicles.length, true); view.setUint16(4, packet.debris.length, true); view.setUint32(8, packet.serverTick, true);
  packet.vehicles.forEach((v, i) => {
    const b = VEHICLE_DAMAGE_HEADER_BYTES + i * VEHICLE_DAMAGE_RECORD_BYTES;
    view.setUint16(b, v.vehicleId, true); view.setUint16(b + 2, v.generation, true); view.setFloat32(b + 4, v.hp, true); view.setFloat32(b + 8, v.maxHp, true);
    view.setUint8(b + 12, v.detachedMask); view.setUint8(b + 13, (v.destroyed ? 1 : 0) | (v.braking ? 2 : 0)); view.setFloat32(b + 16, v.respawnSec, true); view.setFloat32(b + 20, v.wheelAngle, true);
  });
  packet.debris.forEach((d, i) => {
    const b = VEHICLE_DAMAGE_HEADER_BYTES + packet.vehicles.length * VEHICLE_DAMAGE_RECORD_BYTES + i * VEHICLE_DEBRIS_RECORD_BYTES;
    view.setUint32(b, d.id, true); view.setUint16(b + 4, d.vehicleId, true); view.setUint16(b + 6, d.generation, true); view.setUint8(b + 8, d.panelId); view.setUint8(b + 9, d.isInterceptor ? 1 : 0);
    [d.ageSec, d.position.x, d.position.y, d.position.z, d.rotation.x, d.rotation.y, d.rotation.z, d.rotation.w, d.velocity.x, d.velocity.y, d.velocity.z].forEach((n, j) => view.setFloat32(b + 12 + j * 4, n, true));
  });
  return buffer;
}
export function decodeVehicleDamage(buffer: ArrayBuffer, byteOffset = 0, byteLength?: number): VehicleDamagePacket | null {
  const length = byteLength ?? buffer.byteLength - byteOffset;
  if (!uint(byteOffset, buffer.byteLength) || !uint(length, buffer.byteLength - byteOffset) || length < VEHICLE_DAMAGE_HEADER_BYTES) return null;
  const v = new DataView(buffer, byteOffset, length);
  if (v.getUint8(0) !== VEHICLE_DAMAGE_PACKET || v.getUint8(1) !== 1 || v.getUint16(6, true) !== 0) return null;
  const count = v.getUint16(2, true), debrisCount = v.getUint16(4, true);
  if (count > 256 || debrisCount > MAX_VEHICLE_DEBRIS || length !== VEHICLE_DAMAGE_HEADER_BYTES + count * VEHICLE_DAMAGE_RECORD_BYTES + debrisCount * VEHICLE_DEBRIS_RECORD_BYTES) return null;
  const packet: VehicleDamagePacket = { serverTick: v.getUint32(8, true), vehicles: [], debris: [] };
  for (let i = 0; i < count; i++) {
    const b = VEHICLE_DAMAGE_HEADER_BYTES + i * VEHICLE_DAMAGE_RECORD_BYTES, flags = v.getUint8(b + 13);
    if (flags > 3 || v.getUint16(b + 14, true) !== 0) return null;
    packet.vehicles.push({ vehicleId: v.getUint16(b, true), generation: v.getUint16(b + 2, true), hp: v.getFloat32(b + 4, true), maxHp: v.getFloat32(b + 8, true), detachedMask: v.getUint8(b + 12), destroyed: !!(flags & 1), braking: !!(flags & 2), respawnSec: v.getFloat32(b + 16, true), wheelAngle: v.getFloat32(b + 20, true) });
  }
  for (let i = 0; i < debrisCount; i++) {
    const b = VEHICLE_DAMAGE_HEADER_BYTES + count * VEHICLE_DAMAGE_RECORD_BYTES + i * VEHICLE_DEBRIS_RECORD_BYTES, n = Array.from({ length: 11 }, (_, j) => v.getFloat32(b + 12 + j * 4, true));
    if (v.getUint8(b + 9) > 1 || v.getUint16(b + 10, true) !== 0) return null;
    packet.debris.push({ id: v.getUint32(b, true), vehicleId: v.getUint16(b + 4, true), generation: v.getUint16(b + 6, true), panelId: v.getUint8(b + 8), isInterceptor: !!v.getUint8(b + 9), ageSec: n[0], position: { x: n[1], y: n[2], z: n[3] }, rotation: { x: n[4], y: n[5], z: n[6], w: n[7] }, velocity: { x: n[8], y: n[9], z: n[10] } });
  }
  return valid(packet) ? packet : null;
}
