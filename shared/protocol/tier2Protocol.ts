import { ARCHITECTURE_PLACEMENTS, RADAR_NODE_SPECS, SAFE_HOUSE_REGISTRY } from '../content/worldSystemsRegistry.js';
import type { AircraftState } from '../physics/airspaceController.js';
import type { ArchitectureState, SkirmishState } from '../world/tier2World.js';

export const TIER2_PACKET = 0x0c;
export interface Tier2Snapshot {
  serverTick: number; elapsed: number; architecture: ArchitectureState[]; radar: { id: number; hp: number }[];
  aircraft: AircraftState[]; houses: number[]; skirmishes: SkirmishState[];
}
const LENGTH = 20 + ARCHITECTURE_PLACEMENTS.length * 52 + 4 * 8 + 4 * 80 + 4 * 60;
const integer = (n: number, max: number) => Number.isInteger(n) && n >= 0 && n <= max;
const finite = (n: number) => Number.isFinite(n) && Math.abs(n) < 1e8;
const vec = (p: { x: number; y: number; z: number }) => [p.x, p.y, p.z].every(finite);
const quat = (p: { x: number; y: number; z: number; w: number }) => vec(p) && finite(p.w) && Math.abs(Math.hypot(p.x, p.y, p.z, p.w) - 1) < 0.02;
function valid(p: Tier2Snapshot): boolean {
  if (!integer(p.serverTick, 0xffffffff) || !finite(p.elapsed) || p.elapsed < 0 || p.architecture.length !== ARCHITECTURE_PLACEMENTS.length || p.radar.length !== 4 || p.aircraft.length !== 4 || p.skirmishes.length !== 4 || p.houses.length > 8) return false;
  if (new Set(p.architecture.map(s => s.id)).size !== p.architecture.length || new Set(p.radar.map(s => s.id)).size !== 4 || new Set(p.aircraft.map(s => s.id)).size !== 4 || new Set(p.houses).size !== p.houses.length || new Set(p.skirmishes.map(s => s.districtIndex)).size !== 4) return false;
  for (const s of p.architecture) {
    const spec = ARCHITECTURE_PLACEMENTS.find(e => e.id === s.id), max = spec?.kind === 'BREACHABLE_WALL' ? 250 : 80;
    if (!spec || !finite(s.hp) || s.hp < 0 || s.hp > max || s.broken !== (s.hp === 0) || typeof s.impacted !== 'boolean' || (s.impacted && (!s.broken || spec.kind !== 'TACTICAL_FALLING_PROP')) || !integer(s.generation, 65535) || !s.generation || !finite(s.ageSec) || s.ageSec < 0 || !vec(s.position) || !quat(s.rotation)) return false;
  }
  if (p.radar.some(s => !RADAR_NODE_SPECS.some(n => n.id === s.id) || !finite(s.hp) || s.hp < 0 || s.hp > 120)) return false;
  const pilots = p.aircraft.filter(s => s.pilotId).map(s => s.pilotId);
  if (new Set(pilots).size !== pilots.length) return false;
  for (const s of p.aircraft) if (!SAFE_HOUSE_REGISTRY.some(h => h.kind === 'ROOFTOP_PAD' && 1000 + h.id === s.id) || typeof s.active !== 'boolean' || !integer(s.pilotId, 65535) || (!s.active && s.pilotId !== 0) || ![s.lockSec, s.stallSec, s.flareSec, s.flareCooldownSec].every(n => finite(n) && n >= 0 && n <= 8.01) || s.lockSec > 3.01 || s.stallSec > 2.51 || !vec(s.position) || !quat(s.rotation) || !vec(s.velocity) || !vec(s.angularVelocity)) return false;
  if (p.houses.some(id => !integer(id, 7))) return false;
  return p.skirmishes.every(s => integer(s.districtIndex, 3) && integer(s.kindIndex, 4) && typeof s.active === 'boolean' && integer(s.sequence, 1e7) && [s.elapsed, s.cooldown, s.progress].every(n => finite(n) && n >= 0) && s.progress <= 1 && s.elapsed <= 91 && s.cooldown <= 150 && vec(s.position) && finite(s.objectiveHp) && finite(s.maxObjectiveHp) && s.objectiveHp >= 0 && s.objectiveHp <= s.maxObjectiveHp && s.maxObjectiveHp <= 600 && integer(s.stage, 2) && integer(s.targetEntityId, 65535) && integer(s.outcome, 3) && s.active === (s.outcome === 1));
}
export function encodeTier2(p: Tier2Snapshot): ArrayBuffer {
  if (!valid(p)) throw new Error('Invalid Tier 2 snapshot');
  const buffer = new ArrayBuffer(LENGTH), v = new DataView(buffer); let offset = 20;
  v.setUint8(0, TIER2_PACKET); v.setUint8(1, 2); v.setUint32(4, p.serverTick, true); v.setFloat64(8, p.elapsed, true);
  v.setUint32(16, p.houses.reduce((mask, id) => mask | (1 << id), 0), true);
  const write = (values: number[]) => { for (const n of values) { v.setFloat32(offset, n, true); offset += 4; } };
  for (const s of p.architecture) write([s.id, s.hp, +s.broken, +s.impacted, s.ageSec, s.generation, s.position.x, s.position.y, s.position.z, s.rotation.x, s.rotation.y, s.rotation.z, s.rotation.w]);
  for (const s of p.radar) write([s.id, s.hp]);
  for (const s of p.aircraft) write([s.id, +s.active, s.pilotId, s.lockSec, s.stallSec, s.flareSec, s.flareCooldownSec, s.position.x, s.position.y, s.position.z, s.rotation.x, s.rotation.y, s.rotation.z, s.rotation.w, s.velocity.x, s.velocity.y, s.velocity.z, s.angularVelocity.x, s.angularVelocity.y, s.angularVelocity.z]);
  for (const s of p.skirmishes) write([s.districtIndex, s.kindIndex, +s.active, s.elapsed, s.cooldown, s.progress, s.sequence, s.position.x, s.position.y, s.position.z, s.objectiveHp, s.maxObjectiveHp, s.stage, s.targetEntityId, s.outcome]);
  return buffer;
}
export function decodeTier2(buffer: ArrayBuffer): Tier2Snapshot | null {
  if (buffer.byteLength !== LENGTH) return null;
  const v = new DataView(buffer); let offset = 20;
  if (v.getUint8(0) !== TIER2_PACKET || v.getUint8(1) !== 2 || v.getUint16(2, true) !== 0 || v.getUint32(16, true) > 255) return null;
  const read = (count: number) => Array.from({ length: count }, () => { const n = v.getFloat32(offset, true); offset += 4; return n; });
  const p: Tier2Snapshot = { serverTick: v.getUint32(4, true), elapsed: v.getFloat64(8, true), houses: SAFE_HOUSE_REGISTRY.filter(h => v.getUint32(16, true) & (1 << h.id)).map(h => h.id), architecture: [], radar: [], aircraft: [], skirmishes: [] };
  for (let i = 0; i < ARCHITECTURE_PLACEMENTS.length; i++) {
    const n = read(13); if (![n[2], n[3]].every(n => n === 0 || n === 1)) return null;
    p.architecture.push({ id: n[0], hp: n[1], broken: !!n[2], impacted: !!n[3], ageSec: n[4], generation: n[5], position: { x: n[6], y: n[7], z: n[8] }, rotation: { x: n[9], y: n[10], z: n[11], w: n[12] } });
  }
  for (let i = 0; i < 4; i++) { const n = read(2); p.radar.push({ id: n[0], hp: n[1] }); }
  for (let i = 0; i < 4; i++) {
    const n = read(20); if (n[1] !== 0 && n[1] !== 1) return null;
    p.aircraft.push({ id: n[0], active: !!n[1], pilotId: n[2], lockSec: n[3], stallSec: n[4], flareSec: n[5], flareCooldownSec: n[6], position: { x: n[7], y: n[8], z: n[9] }, rotation: { x: n[10], y: n[11], z: n[12], w: n[13] }, velocity: { x: n[14], y: n[15], z: n[16] }, angularVelocity: { x: n[17], y: n[18], z: n[19] } });
  }
  for (let i = 0; i < 4; i++) {
    const n = read(15); if (n[2] !== 0 && n[2] !== 1) return null;
    p.skirmishes.push({ districtIndex: n[0], kindIndex: n[1], active: !!n[2], elapsed: n[3], cooldown: n[4], progress: n[5], sequence: n[6], position: { x: n[7], y: n[8], z: n[9] }, objectiveHp: n[10], maxObjectiveHp: n[11], stage: n[12], targetEntityId: n[13], outcome: n[14] });
  }
  return valid(p) ? p : null;
}
