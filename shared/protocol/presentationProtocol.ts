import type { Vec3 } from "./binaryProtocol.js";

export enum EffectKind {
  SHOT,
  HIT,
  COUNTER,
  BLAST,
  WALL,
  FOOTSTEP,
  SKID,
  DESTRUCTION,
}
export const PRESENTATION_PACKET = 0x0b,
  MAX_EFFECT_EVENTS = 256;
export const COUNTER_CONTACT_SEC = 0.48,
  PAIRED_DURATION_SEC = 0.65;
export interface EffectEvent {
  id: number;
  tick: number;
  kind: EffectKind;
  actor: number;
  target: number;
  limb: number;
  flags: number;
  origin: Vec3;
  point: Vec3;
  normal: Vec3;
  radius: number;
  delay: number;
}
export type EffectSpec = Omit<EffectEvent, "id" | "tick">;
export interface EffectPacket {
  tick: number;
  events: EffectEvent[];
}
const uint = (n: number, max: number) =>
  Number.isInteger(n) && n >= 0 && n <= max;
function valid(p: EffectPacket): boolean {
  if (!uint(p.tick, 0xffffffff) || p.events.length > MAX_EFFECT_EVENTS)
    return false;
  const ids = new Set<number>();
  for (const e of p.events) {
    if (
      !uint(e.id, 0xffffffff) ||
      !e.id ||
      ids.has(e.id) ||
      !uint(e.tick, 0xffffffff) ||
      !uint(e.kind, 7) ||
      !uint(e.actor, 65535) ||
      !uint(e.target, 65535) ||
      !uint(e.limb, 6) ||
      !uint(e.flags, 7)
    )
      return false;
    if (
      ![
        ...Object.values(e.origin),
        ...Object.values(e.point),
        ...Object.values(e.normal),
        e.radius,
        e.delay,
      ].every(Number.isFinite) ||
      e.radius < 0 ||
      e.radius > 100 ||
      e.delay < 0 ||
      e.delay > 2 ||
      Math.abs(Math.hypot(e.normal.x, e.normal.y, e.normal.z) - 1) > 0.02
    )
      return false;
    if (
      [...Object.values(e.origin), ...Object.values(e.point)].some(
        (n) => Math.abs(n) > 100000,
      )
    )
      return false;
    ids.add(e.id);
  }
  return true;
}
export function encodeEffects(packet: EffectPacket): ArrayBuffer {
  if (!valid(packet)) throw new Error("Invalid presentation packet");
  const buffer = new ArrayBuffer(8 + packet.events.length * 64),
    v = new DataView(buffer);
  v.setUint8(0, PRESENTATION_PACKET);
  v.setUint8(1, 1);
  v.setUint16(2, packet.events.length, true);
  v.setUint32(4, packet.tick, true);
  packet.events.forEach((e, i) => {
    const b = 8 + i * 64;
    v.setUint32(b, e.id, true);
    v.setUint32(b + 4, e.tick, true);
    v.setUint8(b + 8, e.kind);
    v.setUint8(b + 9, e.limb);
    v.setUint16(b + 10, e.flags, true);
    v.setUint16(b + 12, e.actor, true);
    v.setUint16(b + 14, e.target, true);
    [
      e.origin.x,
      e.origin.y,
      e.origin.z,
      e.point.x,
      e.point.y,
      e.point.z,
      e.normal.x,
      e.normal.y,
      e.normal.z,
      e.radius,
      e.delay,
    ].forEach((f, j) => v.setFloat32(b + 16 + j * 4, f, true));
  });
  return buffer;
}
export function decodeEffects(buffer: ArrayBuffer): EffectPacket | null {
  if (buffer.byteLength < 8) return null;
  const v = new DataView(buffer),
    n = v.getUint16(2, true);
  if (
    v.getUint8(0) !== PRESENTATION_PACKET ||
    v.getUint8(1) !== 1 ||
    n > MAX_EFFECT_EVENTS ||
    buffer.byteLength !== 8 + n * 64
  )
    return null;
  const packet: EffectPacket = { tick: v.getUint32(4, true), events: [] };
  for (let i = 0; i < n; i++) {
    const b = 8 + i * 64,
      f = (j: number) => v.getFloat32(b + 16 + j * 4, true);
    if (v.getUint32(b + 60, true) !== 0) return null;
    packet.events.push({
      id: v.getUint32(b, true),
      tick: v.getUint32(b + 4, true),
      kind: v.getUint8(b + 8),
      limb: v.getUint8(b + 9),
      flags: v.getUint16(b + 10, true),
      actor: v.getUint16(b + 12, true),
      target: v.getUint16(b + 14, true),
      origin: { x: f(0), y: f(1), z: f(2) },
      point: { x: f(3), y: f(4), z: f(5) },
      normal: { x: f(6), y: f(7), z: f(8) },
      radius: f(9),
      delay: f(10),
    });
  }
  return valid(packet) ? packet : null;
}
export function effectSpec(
  kind: EffectKind,
  point: Vec3,
  overrides: Partial<EffectSpec> = {},
): EffectSpec {
  return {
    kind,
    actor: 0,
    target: 0,
    limb: 6,
    flags: 0,
    origin: { ...point },
    point: { ...point },
    normal: { x: 0, y: 1, z: 0 },
    radius: 1,
    delay: 0,
    ...overrides,
  };
}
