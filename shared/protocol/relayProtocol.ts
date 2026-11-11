import { RelayMode, RELAY_REBOOT_SEC, RELAY_VENT_MAX_HP } from '../world/relayDefinition.js';
export const RELAY_PACKET = 0x0a, RELAY_HEADER_BYTES = 8, RELAY_RECORD_BYTES = 28;
export interface RelayState {
  relayId: number; generation: number; mode: RelayMode; hacked: boolean; heat: number; rebootSec: number;
  ventHp: [number, number, number];
}
export interface RelayPacket { serverTick: number; relays: RelayState[] }
const uint = (n: number, max: number) => Number.isInteger(n) && n >= 0 && n <= max;
function valid(p: RelayPacket): boolean {
  if (!uint(p.serverTick, 0xffffffff) || p.relays.length > 64) return false;
  const ids = new Set<number>();
  for (const s of p.relays) {
    if (!uint(s.relayId, 65535) || !s.relayId || ids.has(s.relayId) || !uint(s.generation, 65535) || !s.generation || !uint(s.mode, 3) ||
      typeof s.hacked !== 'boolean' || s.hacked !== (s.mode === RelayMode.HACKED) || s.ventHp.length !== 3 ||
      ![s.heat, s.rebootSec, ...s.ventHp].every(Number.isFinite) || s.heat < 0 || s.heat > 1 || s.rebootSec < 0 || s.rebootSec > RELAY_REBOOT_SEC ||
      s.ventHp.some(hp => hp < 0 || hp > RELAY_VENT_MAX_HP) || (s.mode === RelayMode.SHUTDOWN ? s.heat !== 1 : s.rebootSec !== 0)) return false;
    if (!s.hacked && ((s.mode === RelayMode.ONLINE && (s.heat !== 0 || s.ventHp.some(hp => hp === 0))) ||
      (s.mode !== RelayMode.ONLINE && !s.ventHp.some(hp => hp === 0)))) return false;
    ids.add(s.relayId);
  }
  return true;
}
export function encodeRelays(p: RelayPacket): ArrayBuffer {
  if (!valid(p)) throw new Error('Invalid relay snapshot');
  const buffer = new ArrayBuffer(RELAY_HEADER_BYTES + p.relays.length * RELAY_RECORD_BYTES), v = new DataView(buffer);
  v.setUint8(0, RELAY_PACKET); v.setUint8(1, 1); v.setUint16(2, p.relays.length, true); v.setUint32(4, p.serverTick, true);
  p.relays.forEach((s, i) => {
    const b = RELAY_HEADER_BYTES + i * RELAY_RECORD_BYTES; v.setUint16(b, s.relayId, true); v.setUint16(b + 2, s.generation, true);
    v.setUint8(b + 4, s.mode); v.setUint8(b + 5, s.hacked ? 1 : 0);
    [s.heat, s.rebootSec, ...s.ventHp].forEach((n, j) => v.setFloat32(b + 8 + j * 4, n, true));
  }); return buffer;
}
export function decodeRelays(buffer: ArrayBufferLike, byteOffset = 0, byteLength?: number): RelayPacket | null {
  const length = byteLength ?? buffer.byteLength - byteOffset;
  if (!uint(byteOffset, buffer.byteLength) || !uint(length, buffer.byteLength - byteOffset) || length < RELAY_HEADER_BYTES) return null;
  const v = new DataView(buffer, byteOffset, length), count = v.getUint16(2, true);
  if (v.getUint8(0) !== RELAY_PACKET || v.getUint8(1) !== 1 || count > 64 || length !== RELAY_HEADER_BYTES + count * RELAY_RECORD_BYTES) return null;
  const p: RelayPacket = { serverTick: v.getUint32(4, true), relays: [] };
  for (let i = 0; i < count; i++) {
    const b = RELAY_HEADER_BYTES + i * RELAY_RECORD_BYTES;
    if (v.getUint8(b + 5) > 1 || v.getUint16(b + 6, true) !== 0) return null;
    p.relays.push({ relayId: v.getUint16(b, true), generation: v.getUint16(b + 2, true), mode: v.getUint8(b + 4), hacked: !!v.getUint8(b + 5),
      heat: v.getFloat32(b + 8, true), rebootSec: v.getFloat32(b + 12, true), ventHp: [v.getFloat32(b + 16, true), v.getFloat32(b + 20, true), v.getFloat32(b + 24, true)] });
  }
  return valid(p) ? p : null;
}
