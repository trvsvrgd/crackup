import type { Quat4, Vec3 } from '../protocol/binaryProtocol.js';

export enum EnemyArchetype { STREET_ENFORCER, CYBER_RONIN, AEGIS_SHOCK_TROOPER, SECTOR_WARDEN }
export const WARDEN_RIG_SCALE = 3.2 / 1.88;
export enum HitReaction { NONE, FLINCH, KNEE_DROP, DISARM, KNOCKBACK, WALL_SPLAT, PAIRED_COUNTER }
export interface CombatPresentation {
  enemyId: number; archetype: EnemyArchetype; reaction: HitReaction; timer: number;
  flinchSec: number; flashSec: number; direction: Vec3; impulse: Vec3;
  pairedAgentId: number; pairedElapsed: number; weaponDropped: boolean; hitSequence: number;
}
export interface DroppedWeaponState { id: number; position: Vec3; rotation: Quat4 }
export const COMBAT_PRESENTATION_PACKET = 0x08;
const HEADER = 8, RECORD = 48, DROP = 32;
export function encodeCombatPresentation(tick: number, states: CombatPresentation[], drops: DroppedWeaponState[]): ArrayBuffer {
  const buffer = new ArrayBuffer(HEADER + states.length * RECORD + drops.length * DROP), view = new DataView(buffer);
  view.setUint8(0, COMBAT_PRESENTATION_PACKET); view.setUint8(1, 1); view.setUint16(2, states.length, true);
  view.setUint16(4, drops.length, true); view.setUint16(6, tick & 0xffff, true);
  states.forEach((s, i) => {
    const b = HEADER + i * RECORD;
    view.setUint16(b, s.enemyId, true); view.setUint8(b + 2, s.archetype); view.setUint8(b + 3, s.reaction);
    view.setUint16(b + 4, s.pairedAgentId, true); view.setUint8(b + 6, s.weaponDropped ? 1 : 0); view.setUint8(b + 7, s.hitSequence & 255);
    [s.timer, s.flinchSec, s.flashSec, s.direction.x, s.direction.z, s.impulse.x, s.impulse.y, s.impulse.z, s.pairedElapsed, s.direction.y].forEach((n, j) => view.setFloat32(b + 8 + j * 4, n, true));
  });
  drops.forEach((s, i) => {
    const b = HEADER + states.length * RECORD + i * DROP; view.setUint32(b, s.id, true);
    [s.position.x, s.position.y, s.position.z, s.rotation.x, s.rotation.y, s.rotation.z, s.rotation.w].forEach((n, j) => view.setFloat32(b + 4 + j * 4, n, true));
  });
  return buffer;
}
export function decodeCombatPresentation(buffer: ArrayBuffer): { states: CombatPresentation[]; drops: DroppedWeaponState[] } | null {
  if (buffer.byteLength < HEADER) return null;
  const v = new DataView(buffer); if (v.getUint8(0) !== COMBAT_PRESENTATION_PACKET || v.getUint8(1) !== 1) return null;
  const count = v.getUint16(2, true), dropped = v.getUint16(4, true);
  if (buffer.byteLength !== HEADER + count * RECORD + dropped * DROP) return null;
  const states: CombatPresentation[] = [], drops: DroppedWeaponState[] = [], ids = new Set<number>();
  for (let i = 0; i < count; i++) {
    const b = HEADER + i * RECORD, f = (j: number) => v.getFloat32(b + 8 + j * 4, true);
    const enemyId = v.getUint16(b, true), archetype = v.getUint8(b + 2), reaction = v.getUint8(b + 3);
    if (ids.has(enemyId) || archetype > 3 || reaction > 6 || v.getUint8(b + 6) > 1 || !Array.from({ length: 10 }, (_, j) => f(j)).every(Number.isFinite)) return null;
    ids.add(enemyId);
    states.push({ enemyId, archetype, reaction, pairedAgentId: v.getUint16(b + 4, true), weaponDropped: !!v.getUint8(b + 6), hitSequence: v.getUint8(b + 7),
      timer: f(0), flinchSec: f(1), flashSec: f(2), direction: { x: f(3), y: f(9), z: f(4) }, impulse: { x: f(5), y: f(6), z: f(7) }, pairedElapsed: f(8) });
  }
  ids.clear();
  for (let i = 0; i < dropped; i++) {
    const b = HEADER + count * RECORD + i * DROP, n = Array.from({ length: 7 }, (_, j) => v.getFloat32(b + 4 + j * 4, true));
    const id = v.getUint32(b, true); if (ids.has(id) || !n.every(Number.isFinite)) return null; ids.add(id);
    drops.push({ id, position: { x: n[0], y: n[1], z: n[2] }, rotation: { x: n[3], y: n[4], z: n[5], w: n[6] } });
  }
  return { states, drops };
}
export function createCombatPresentation(enemyId: number, archetype: EnemyArchetype): CombatPresentation {
  return { enemyId, archetype, reaction: HitReaction.NONE, timer: 0, flinchSec: 0, flashSec: 0, direction: { x: 0, y: 0, z: 1 }, impulse: { x: 0, y: 0, z: 0 }, pairedAgentId: 0, pairedElapsed: 0, weaponDropped: false, hitSequence: 0 };
}
