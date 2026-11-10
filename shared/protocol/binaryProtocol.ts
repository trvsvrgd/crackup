/**
 * CRACKUP: Protocol Eclipse (v2.0 True 3D AAA Architecture)
 * Binary ArrayBuffer / DataView Network Serialization Protocol
 * Zero JSON overhead for real-time 60Hz Client Inputs and 30Hz Authoritative World Snapshots.
 */

import { AgentAnimState, DynamicPropType, EnemyCombatState, EnemyLimbId } from '../constants.js';

export enum PacketType {
  CLIENT_INPUT = 0x01,
  WORLD_SNAPSHOT = 0x02,
  RENEGADE_ORB_SNAPSHOT = 0x03,
  ENEMY_SNAPSHOT = 0x04,
  VEHICLE_PROP_SNAPSHOT = 0x05,
  WORLD_EVENTS_SNAPSHOT = 0x06,
}

export const CLIENT_INPUT_BYTE_LENGTH = 29;
export const SNAPSHOT_HEADER_BYTE_LENGTH = 16;
export const SNAPSHOT_ENTITY_BYTE_LENGTH = 40;
export const ORB_SNAPSHOT_HEADER_BYTE_LENGTH = 4;
export const ORB_SNAPSHOT_RECORD_BYTE_LENGTH = 16;
export const ENEMY_SNAPSHOT_HEADER_BYTE_LENGTH = 4;
export const ENEMY_SNAPSHOT_RECORD_BYTE_LENGTH = 36;
export const VEHICLE_PROP_HEADER_BYTE_LENGTH = 4;
export const VEHICLE_RECORD_BYTE_LENGTH = 32;
export const PROP_RECORD_BYTE_LENGTH = 28;
export const WORLD_EVENTS_HEADER_BYTE_LENGTH = 4;
export const OMEGA_BOUNTY_BYTE_LENGTH = 36;
export const DISTRICT_LOOP_RECORD_BYTE_LENGTH = 16;
export const AUDITOR_AIRSHIP_RECORD_BYTE_LENGTH = 24;

export interface OmegaBountyBinaryState {
  active: boolean;
  escaped: boolean;
  completed: boolean;
  enemyId: number;
  waypointIndex: number;
  totalWaypoints: number;
  timeRemainingSec: number;
  position: Vec3;
  targetWaypoint: Vec3;
  hp: number;
  maxHp: number;
}

export interface DistrictLoopBinaryState {
  districtIndex: number;     // 0=NEON_DOCKS, 1=FOUNDRY_SLUMS, 2=HELIOS_SPIRE, 3=AEGIS_CITADEL
  currentStage: number;      // 1=STAGE_1_TERMINALS, 2=STAGE_2_LIEUTENANT, 3=STAGE_3_CORE_OVERRIDE, 4=COMPLETED
  terminalsHacked: number;   // 0..2
  totalTerminals: number;    // 2
  activeObjectivePos: Vec3;  // 3D world coordinates of current stage objective
}

export interface AuditorAirshipBinaryState {
  airshipId: number;
  targetEntityId: number;
  mutationIndex: number;     // 0=PYRO_NEUROSIS, 1=SURGICAL_COLDNESS, 2=HOLLOW_FRAME, 3=GHOST_CONSCIENCE
  active: boolean;
  position: Vec3;
  yaw: number;
}

export interface VehicleBinarySnapshotState {
  vehicleId: number;
  driverEntityId: number;
  isInterceptor: boolean;
  wallThrusterActive: boolean;
  wheelGroundedMask: number; // bits 0..3 for FL, FR, RL, RR
  position: Vec3;
  rotation: Quat4;
  speedMps: number;
  steerAngleRad: number;
  wheelCompressionRatio: [number, number, number, number]; // [0..1] for FL, FR, RL, RR
}

export interface DynamicPropBinarySnapshotState {
  propId: number;
  holderEntityId: number;
  propType: DynamicPropType;
  isThrownProjectile: boolean;
  isDetonated: boolean;
  massKg: number;
  position: Vec3;
  rotation: Quat4;
}

export interface RenegadeOrbBinaryState {
  orbId: number;
  isFleeing: boolean;
  position: Vec3;
}

export interface EnemyBinarySnapshotState {
  enemyId: number;
  combatState: EnemyCombatState;
  isElite: boolean;
  armsCrippled: boolean;
  legsCrippled: boolean;
  headBlinded: boolean;
  lastHitLimb: EnemyLimbId;
  position: Vec3;
  yaw: number;
  hp: number;
  maxHp: number;
  armor: number;
  limbHpPct: [number, number, number, number, number, number];
  stateTimer: number;
}

export interface ClientInputPacket {
  seq: number;        // Uint32 monotonically increasing sequence number
  moveX: number;      // Float32 [-1.0, +1.0] local right/left strafe input
  moveZ: number;      // Float32 [-1.0, +1.0] local forward/backward input (-1 = forward in -Z or +1 = forward; convention: +1 = forward along camera look, -1 = backward)
  yaw: number;        // Float32 radians (camera horizontal yaw)
  pitch: number;      // Float32 radians (camera vertical pitch)
  buttons: number;    // Uint16 bitmask (JUMP, DASH, MANTLE, SPRINT, AIM)
  dt: number;         // Float32 seconds (clamped around FIXED_TIMESTEP)
}

export interface Quat4 {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface EntitySnapshotState {
  entityId: number;       // Uint16
  animState: AgentAnimState;
  grounded: boolean;
  mantling: boolean;
  dashing: boolean;
  agilityLevel: number;   // 1..5
  position: Vec3;         // Float32 x 3 (meters, Y-up foot origin)
  rotation: Quat4;        // Compressed Int16 x 4 on wire, normalized unit quaternion
  velocity: Vec3;         // Float32 x 3 (meters/sec)
  mantleProgress: number; // Float32 [0..1]
}

export interface WorldSnapshotPacket {
  recipientEntityId: number;
  serverTick: number;
  lastProcessedInputSeq: number;
  serverTimeSec: number;
  entities: EntitySnapshotState[];
}

/**
 * Computes a deterministic 16-bit checksum over the first 27 bytes of a ClientInputPacket buffer
 */
export function computeInputChecksum(view: DataView): number {
  let hash = 0x811c;
  for (let i = 0; i < 27; i++) {
    hash ^= view.getUint8(i);
    hash = Math.imul(hash, 0x0101) & 0xffff;
  }
  return hash & 0xffff;
}

/**
 * Compresses a floating-point quaternion component [-1.0, 1.0] into signed Int16 [-32767, 32767]
 */
export function compressQuatComponent(v: number): number {
  if (!Number.isFinite(v)) return 0;
  const clamped = Math.max(-1.0, Math.min(1.0, v));
  return Math.round(clamped * 32767);
}

/**
 * Decompresses a signed Int16 [-32767, 32767] back into a floating-point quaternion component
 */
export function decompressQuatComponent(qInt16: number): number {
  return Math.max(-1.0, Math.min(1.0, qInt16 / 32767));
}

/**
 * Normalizes a 4D quaternion in-place or returns identity (0, 0, 0, 1) if degenerate
 */
export function normalizeQuat(q: Quat4): Quat4 {
  const lenSq = q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w;
  if (!Number.isFinite(lenSq) || lenSq < 1e-8) {
    return { x: 0, y: 0, z: 0, w: 1 };
  }
  const invLen = 1.0 / Math.sqrt(lenSq);
  return {
    x: q.x * invLen,
    y: q.y * invLen,
    z: q.z * invLen,
    w: q.w * invLen,
  };
}

/**
 * Creates a Y-axis rotation quaternion from a yaw angle in radians
 */
export function quatFromYaw(yawRad: number): Quat4 {
  const half = yawRad * 0.5;
  return {
    x: 0,
    y: Math.sin(half),
    z: 0,
    w: Math.cos(half),
  };
}

/**
 * Extracts yaw angle (radians) from a quaternion
 */
export function yawFromQuat(q: Quat4): number {
  const siny_cosp = 2 * (q.w * q.y + q.z * q.x);
  const cosy_cosp = 1 - 2 * (q.x * q.x + q.y * q.y);
  return Math.atan2(siny_cosp, cosy_cosp);
}

/**
 * Spherical Linear Interpolation (SLERP) between two unit quaternions
 */
export function slerpQuat(a: Quat4, b: Quat4, t: number): Quat4 {
  const clampedT = Math.max(0, Math.min(1, t));
  let bx = b.x;
  let by = b.y;
  let bz = b.z;
  let bw = b.w;

  let cosHalfTheta = a.x * bx + a.y * by + a.z * bz + a.w * bw;
  if (cosHalfTheta < 0) {
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
    cosHalfTheta = -cosHalfTheta;
  }

  if (cosHalfTheta >= 0.9995) {
    return normalizeQuat({
      x: a.x + clampedT * (bx - a.x),
      y: a.y + clampedT * (by - a.y),
      z: a.z + clampedT * (bz - a.z),
      w: a.w + clampedT * (bw - a.w),
    });
  }

  const halfTheta = Math.acos(Math.min(1.0, cosHalfTheta));
  const sinHalfTheta = Math.sqrt(1.0 - cosHalfTheta * cosHalfTheta);
  if (Math.abs(sinHalfTheta) < 1e-4) {
    return normalizeQuat({
      x: a.x * 0.5 + bx * 0.5,
      y: a.y * 0.5 + by * 0.5,
      z: a.z * 0.5 + bz * 0.5,
      w: a.w * 0.5 + bw * 0.5,
    });
  }

  const ratioA = Math.sin((1 - clampedT) * halfTheta) / sinHalfTheta;
  const ratioB = Math.sin(clampedT * halfTheta) / sinHalfTheta;
  return normalizeQuat({
    x: a.x * ratioA + bx * ratioB,
    y: a.y * ratioA + by * ratioB,
    z: a.z * ratioA + bz * ratioB,
    w: a.w * ratioA + bw * ratioB,
  });
}

/**
 * Serializes a ClientInputPacket into a 29-byte binary ArrayBuffer
 */
export function encodeClientInput(input: ClientInputPacket): ArrayBuffer {
  const buffer = new ArrayBuffer(CLIENT_INPUT_BYTE_LENGTH);
  const view = new DataView(buffer);

  const safeMoveX = Number.isFinite(input.moveX) ? Math.max(-1, Math.min(1, input.moveX)) : 0;
  const safeMoveZ = Number.isFinite(input.moveZ) ? Math.max(-1, Math.min(1, input.moveZ)) : 0;
  const safeYaw = Number.isFinite(input.yaw) ? input.yaw : 0;
  const safePitch = Number.isFinite(input.pitch) ? input.pitch : 0;
  const safeDt = Number.isFinite(input.dt) ? Math.max(0.001, Math.min(0.1, input.dt)) : 1 / 60;

  view.setUint8(0, PacketType.CLIENT_INPUT);
  view.setUint32(1, input.seq >>> 0, true);
  view.setFloat32(5, safeMoveX, true);
  view.setFloat32(9, safeMoveZ, true);
  view.setFloat32(13, safeYaw, true);
  view.setFloat32(17, safePitch, true);
  view.setUint16(21, input.buttons & 0xffff, true);
  view.setFloat32(23, safeDt, true);

  const checksum = computeInputChecksum(view);
  view.setUint16(27, checksum, true);

  return buffer;
}

/**
 * Deserializes and validates a 29-byte binary ClientInputPacket
 */
export function decodeClientInput(buffer: ArrayBufferLike, byteOffset = 0, byteLength?: number): ClientInputPacket | null {
  const len = byteLength ?? buffer.byteLength - byteOffset;
  if (len !== CLIENT_INPUT_BYTE_LENGTH) {
    return null;
  }

  const view = new DataView(buffer, byteOffset, len);
  const packetType = view.getUint8(0);
  if (packetType !== PacketType.CLIENT_INPUT) {
    return null;
  }

  const expectedChecksum = computeInputChecksum(view);
  const actualChecksum = view.getUint16(27, true);
  if (expectedChecksum !== actualChecksum) {
    return null;
  }

  const seq = view.getUint32(1, true);
  const moveX = view.getFloat32(5, true);
  const moveZ = view.getFloat32(9, true);
  const yaw = view.getFloat32(13, true);
  const pitch = view.getFloat32(17, true);
  const buttons = view.getUint16(21, true);
  const dt = view.getFloat32(23, true);

  if (
    !Number.isFinite(moveX) ||
    !Number.isFinite(moveZ) ||
    !Number.isFinite(yaw) ||
    !Number.isFinite(pitch) ||
    !Number.isFinite(dt)
  ) {
    return null;
  }

  return {
    seq,
    moveX: Math.max(-1, Math.min(1, moveX)),
    moveZ: Math.max(-1, Math.min(1, moveZ)),
    yaw,
    pitch,
    buttons,
    dt: Math.max(0.001, Math.min(0.1, dt)),
  };
}

/**
 * Serializes an authoritative WorldSnapshotPacket into a packed binary ArrayBuffer
 */
export function encodeWorldSnapshot(snapshot: WorldSnapshotPacket): ArrayBuffer {
  const count = Math.min(255, snapshot.entities.length);
  const totalBytes = SNAPSHOT_HEADER_BYTE_LENGTH + count * SNAPSHOT_ENTITY_BYTE_LENGTH;
  const buffer = new ArrayBuffer(totalBytes);
  const view = new DataView(buffer);

  // 16-byte Header
  view.setUint8(0, PacketType.WORLD_SNAPSHOT);
  view.setUint8(1, count);
  view.setUint16(2, snapshot.recipientEntityId & 0xffff, true);
  view.setUint32(4, snapshot.serverTick >>> 0, true);
  view.setUint32(8, snapshot.lastProcessedInputSeq >>> 0, true);
  view.setFloat32(12, snapshot.serverTimeSec, true);

  // 40-byte Entity Records
  for (let i = 0; i < count; i++) {
    const e = snapshot.entities[i];
    const base = SNAPSHOT_HEADER_BYTE_LENGTH + i * SNAPSHOT_ENTITY_BYTE_LENGTH;

    const normQ = normalizeQuat(e.rotation);
    const agilityBits = (Math.max(1, Math.min(5, e.agilityLevel)) & 0x07) << 3;
    const statusFlags =
      (e.grounded ? 1 : 0) |
      (e.mantling ? 2 : 0) |
      (e.dashing ? 4 : 0) |
      agilityBits;

    view.setUint16(base + 0, e.entityId & 0xffff, true);
    view.setUint8(base + 2, e.animState & 0xff);
    view.setUint8(base + 3, statusFlags & 0xff);

    view.setFloat32(base + 4, Number.isFinite(e.position.x) ? e.position.x : 0, true);
    view.setFloat32(base + 8, Number.isFinite(e.position.y) ? e.position.y : 0, true);
    view.setFloat32(base + 12, Number.isFinite(e.position.z) ? e.position.z : 0, true);

    view.setInt16(base + 16, compressQuatComponent(normQ.x), true);
    view.setInt16(base + 18, compressQuatComponent(normQ.y), true);
    view.setInt16(base + 20, compressQuatComponent(normQ.z), true);
    view.setInt16(base + 22, compressQuatComponent(normQ.w), true);

    view.setFloat32(base + 24, Number.isFinite(e.velocity.x) ? e.velocity.x : 0, true);
    view.setFloat32(base + 28, Number.isFinite(e.velocity.y) ? e.velocity.y : 0, true);
    view.setFloat32(base + 32, Number.isFinite(e.velocity.z) ? e.velocity.z : 0, true);
    view.setFloat32(base + 36, Number.isFinite(e.mantleProgress) ? e.mantleProgress : 0, true);
  }

  return buffer;
}

/**
 * Deserializes a packed binary WorldSnapshotPacket ArrayBuffer
 */
export function decodeWorldSnapshot(buffer: ArrayBufferLike, byteOffset = 0, byteLength?: number): WorldSnapshotPacket | null {
  const len = byteLength ?? buffer.byteLength - byteOffset;
  if (len < SNAPSHOT_HEADER_BYTE_LENGTH) {
    return null;
  }

  const view = new DataView(buffer, byteOffset, len);
  const packetType = view.getUint8(0);
  if (packetType !== PacketType.WORLD_SNAPSHOT) {
    return null;
  }

  const entityCount = view.getUint8(1);
  const expectedLength = SNAPSHOT_HEADER_BYTE_LENGTH + entityCount * SNAPSHOT_ENTITY_BYTE_LENGTH;
  if (len !== expectedLength) {
    return null;
  }

  const recipientEntityId = view.getUint16(2, true);
  const serverTick = view.getUint32(4, true);
  const lastProcessedInputSeq = view.getUint32(8, true);
  const serverTimeSec = view.getFloat32(12, true);

  const entities: EntitySnapshotState[] = [];
  for (let i = 0; i < entityCount; i++) {
    const base = SNAPSHOT_HEADER_BYTE_LENGTH + i * SNAPSHOT_ENTITY_BYTE_LENGTH;

    const entityId = view.getUint16(base + 0, true);
    const animState = view.getUint8(base + 2) as AgentAnimState;
    const statusFlags = view.getUint8(base + 3);

    const grounded = (statusFlags & 1) !== 0;
    const mantling = (statusFlags & 2) !== 0;
    const dashing = (statusFlags & 4) !== 0;
    const agilityLevel = Math.max(1, Math.min(5, (statusFlags >> 3) & 0x07));

    const posX = view.getFloat32(base + 4, true);
    const posY = view.getFloat32(base + 8, true);
    const posZ = view.getFloat32(base + 12, true);

    const qx = decompressQuatComponent(view.getInt16(base + 16, true));
    const qy = decompressQuatComponent(view.getInt16(base + 18, true));
    const qz = decompressQuatComponent(view.getInt16(base + 20, true));
    const qw = decompressQuatComponent(view.getInt16(base + 22, true));
    const rotation = normalizeQuat({ x: qx, y: qy, z: qz, w: qw });

    const velX = view.getFloat32(base + 24, true);
    const velY = view.getFloat32(base + 28, true);
    const velZ = view.getFloat32(base + 32, true);
    const mantleProgress = view.getFloat32(base + 36, true);

    entities.push({
      entityId,
      animState,
      grounded,
      mantling,
      dashing,
      agilityLevel,
      position: { x: posX, y: posY, z: posZ },
      rotation,
      velocity: { x: velX, y: velY, z: velZ },
      mantleProgress,
    });
  }

  return {
    recipientEntityId,
    serverTick,
    lastProcessedInputSeq,
    serverTimeSec,
    entities,
  };
}

/**
 * Serializes dynamic Renegade Orb 3D transforms & flee states into a compact binary ArrayBuffer
 */
export function encodeRenegadeOrbSnapshot(
  serverTick: number,
  orbs: RenegadeOrbBinaryState[]
): ArrayBuffer {
  const count = Math.min(255, orbs.length);
  const totalBytes = ORB_SNAPSHOT_HEADER_BYTE_LENGTH + count * ORB_SNAPSHOT_RECORD_BYTE_LENGTH;
  const buffer = new ArrayBuffer(totalBytes);
  const view = new DataView(buffer);

  view.setUint8(0, PacketType.RENEGADE_ORB_SNAPSHOT);
  view.setUint8(1, count);
  view.setUint16(2, serverTick & 0xffff, true);

  for (let i = 0; i < count; i++) {
    const o = orbs[i];
    const base = ORB_SNAPSHOT_HEADER_BYTE_LENGTH + i * ORB_SNAPSHOT_RECORD_BYTE_LENGTH;
    view.setUint16(base + 0, o.orbId & 0xffff, true);
    view.setUint8(base + 2, o.isFleeing ? 1 : 0);
    view.setUint8(base + 3, 0);
    view.setFloat32(base + 4, Number.isFinite(o.position.x) ? o.position.x : 0, true);
    view.setFloat32(base + 8, Number.isFinite(o.position.y) ? o.position.y : 0, true);
    view.setFloat32(base + 12, Number.isFinite(o.position.z) ? o.position.z : 0, true);
  }

  return buffer;
}

/**
 * Deserializes a binary Renegade Orb Snapshot ArrayBuffer
 */
export function decodeRenegadeOrbSnapshot(
  buffer: ArrayBufferLike,
  byteOffset = 0,
  byteLength?: number
): { serverTickLow16: number; orbs: RenegadeOrbBinaryState[] } | null {
  const len = byteLength ?? buffer.byteLength - byteOffset;
  if (len < ORB_SNAPSHOT_HEADER_BYTE_LENGTH) {
    return null;
  }

  const view = new DataView(buffer, byteOffset, len);
  if (view.getUint8(0) !== PacketType.RENEGADE_ORB_SNAPSHOT) {
    return null;
  }

  const count = view.getUint8(1);
  const expectedLen = ORB_SNAPSHOT_HEADER_BYTE_LENGTH + count * ORB_SNAPSHOT_RECORD_BYTE_LENGTH;
  if (len !== expectedLen) {
    return null;
  }

  const serverTickLow16 = view.getUint16(2, true);
  const orbs: RenegadeOrbBinaryState[] = [];
  for (let i = 0; i < count; i++) {
    const base = ORB_SNAPSHOT_HEADER_BYTE_LENGTH + i * ORB_SNAPSHOT_RECORD_BYTE_LENGTH;
    const orbId = view.getUint16(base + 0, true);
    const isFleeing = (view.getUint8(base + 2) & 1) !== 0;
    const x = view.getFloat32(base + 4, true);
    const y = view.getFloat32(base + 8, true);
    const z = view.getFloat32(base + 12, true);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return null;
    }
    orbs.push({ orbId, isFleeing, position: { x, y, z } });
  }

  return { serverTickLow16, orbs };
}

/**
 * Serializes 3D Enemy Skeletal/Limb-Collider States into a packed binary ArrayBuffer (4B + 36B * N)
 */
export function encodeEnemySnapshot(
  serverTick: number,
  enemies: EnemyBinarySnapshotState[]
): ArrayBuffer {
  const count = Math.min(255, enemies.length);
  const totalBytes = ENEMY_SNAPSHOT_HEADER_BYTE_LENGTH + count * ENEMY_SNAPSHOT_RECORD_BYTE_LENGTH;
  const buffer = new ArrayBuffer(totalBytes);
  const view = new DataView(buffer);

  view.setUint8(0, PacketType.ENEMY_SNAPSHOT);
  view.setUint8(1, count);
  view.setUint16(2, serverTick & 0xffff, true);

  for (let i = 0; i < count; i++) {
    const e = enemies[i];
    const base = ENEMY_SNAPSHOT_HEADER_BYTE_LENGTH + i * ENEMY_SNAPSHOT_RECORD_BYTE_LENGTH;
    const statusFlags =
      (e.isElite ? 1 : 0) |
      (e.armsCrippled ? 2 : 0) |
      (e.legsCrippled ? 4 : 0) |
      (e.headBlinded ? 8 : 0) |
      ((e.lastHitLimb & 0x07) << 4);

    view.setUint16(base + 0, e.enemyId & 0xffff, true);
    view.setUint8(base + 2, e.combatState & 0xff);
    view.setUint8(base + 3, statusFlags & 0xff);

    view.setFloat32(base + 4, Number.isFinite(e.position.x) ? e.position.x : 0, true);
    view.setFloat32(base + 8, Number.isFinite(e.position.y) ? e.position.y : 0, true);
    view.setFloat32(base + 12, Number.isFinite(e.position.z) ? e.position.z : 0, true);
    view.setFloat32(base + 16, Number.isFinite(e.yaw) ? e.yaw : 0, true);

    view.setUint16(base + 20, Math.max(0, Math.round(e.hp)) & 0xffff, true);
    view.setUint16(base + 22, Math.max(1, Math.round(e.maxHp)) & 0xffff, true);
    view.setUint16(base + 24, Math.max(0, Math.round(e.armor)) & 0xffff, true);

    for (let l = 0; l < 6; l++) {
      const pct = Math.max(0, Math.min(100, Math.round(e.limbHpPct[l] ?? 100)));
      view.setUint8(base + 26 + l, pct);
    }

    view.setFloat32(base + 32, Number.isFinite(e.stateTimer) ? e.stateTimer : 0, true);
  }

  return buffer;
}

/**
 * Deserializes a binary Enemy Snapshot ArrayBuffer
 */
export function decodeEnemySnapshot(
  buffer: ArrayBufferLike,
  byteOffset = 0,
  byteLength?: number
): { serverTickLow16: number; enemies: EnemyBinarySnapshotState[] } | null {
  const len = byteLength ?? buffer.byteLength - byteOffset;
  if (len < ENEMY_SNAPSHOT_HEADER_BYTE_LENGTH) {
    return null;
  }

  const view = new DataView(buffer, byteOffset, len);
  if (view.getUint8(0) !== PacketType.ENEMY_SNAPSHOT) {
    return null;
  }

  const count = view.getUint8(1);
  const expectedLen = ENEMY_SNAPSHOT_HEADER_BYTE_LENGTH + count * ENEMY_SNAPSHOT_RECORD_BYTE_LENGTH;
  if (len !== expectedLen) {
    return null;
  }

  const serverTickLow16 = view.getUint16(2, true);
  const enemies: EnemyBinarySnapshotState[] = [];

  for (let i = 0; i < count; i++) {
    const base = ENEMY_SNAPSHOT_HEADER_BYTE_LENGTH + i * ENEMY_SNAPSHOT_RECORD_BYTE_LENGTH;
    const enemyId = view.getUint16(base + 0, true);
    const combatState = view.getUint8(base + 2) as EnemyCombatState;
    const statusFlags = view.getUint8(base + 3);

    const isElite = (statusFlags & 1) !== 0;
    const armsCrippled = (statusFlags & 2) !== 0;
    const legsCrippled = (statusFlags & 4) !== 0;
    const headBlinded = (statusFlags & 8) !== 0;
    const lastHitLimb = ((statusFlags >> 4) & 0x07) as EnemyLimbId;

    const x = view.getFloat32(base + 4, true);
    const y = view.getFloat32(base + 8, true);
    const z = view.getFloat32(base + 12, true);
    const yaw = view.getFloat32(base + 16, true);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || !Number.isFinite(yaw)) {
      return null;
    }

    const hp = view.getUint16(base + 20, true);
    const maxHp = view.getUint16(base + 22, true);
    const armor = view.getUint16(base + 24, true);

    const limbHpPct: [number, number, number, number, number, number] = [
      view.getUint8(base + 26),
      view.getUint8(base + 27),
      view.getUint8(base + 28),
      view.getUint8(base + 29),
      view.getUint8(base + 30),
      view.getUint8(base + 31),
    ];
    const stateTimer = view.getFloat32(base + 32, true);

    enemies.push({
      enemyId,
      combatState,
      isElite,
      armsCrippled,
      legsCrippled,
      headBlinded,
      lastHitLimb,
      position: { x, y, z },
      yaw,
      hp,
      maxHp,
      armor,
      limbHpPct,
      stateTimer,
    });
  }

  return { serverTickLow16, enemies };
}

/**
 * Serializes 3D 4-Wheel Suspension Vehicles & Dynamic Physics Props into a packed binary ArrayBuffer
 * (4B Header + 32B * vehicleCount + 28B * propCount)
 */
export function encodeVehiclePropSnapshot(
  serverTick: number,
  vehicles: VehicleBinarySnapshotState[],
  props: DynamicPropBinarySnapshotState[]
): ArrayBuffer {
  const vCount = Math.min(255, vehicles.length);
  const pCount = Math.min(255, props.length);
  const totalBytes =
    VEHICLE_PROP_HEADER_BYTE_LENGTH +
    vCount * VEHICLE_RECORD_BYTE_LENGTH +
    pCount * PROP_RECORD_BYTE_LENGTH;

  const buffer = new ArrayBuffer(totalBytes);
  const view = new DataView(buffer);

  view.setUint8(0, PacketType.VEHICLE_PROP_SNAPSHOT);
  view.setUint8(1, vCount);
  view.setUint8(2, pCount);
  view.setUint8(3, serverTick & 0xff);

  let offset = VEHICLE_PROP_HEADER_BYTE_LENGTH;
  for (let i = 0; i < vCount; i++) {
    const v = vehicles[i]!;
    const normQ = normalizeQuat(v.rotation);
    const flags =
      (v.isInterceptor ? 1 : 0) |
      (v.wallThrusterActive ? 2 : 0) |
      ((v.wheelGroundedMask & 0x0f) << 2);

    view.setUint16(offset + 0, v.vehicleId & 0xffff, true);
    view.setUint16(offset + 2, v.driverEntityId & 0xffff, true);
    view.setFloat32(offset + 4, Number.isFinite(v.position.x) ? v.position.x : 0, true);
    view.setFloat32(offset + 8, Number.isFinite(v.position.y) ? v.position.y : 0, true);
    view.setFloat32(offset + 12, Number.isFinite(v.position.z) ? v.position.z : 0, true);

    view.setInt16(offset + 16, compressQuatComponent(normQ.x), true);
    view.setInt16(offset + 18, compressQuatComponent(normQ.y), true);
    view.setInt16(offset + 20, compressQuatComponent(normQ.z), true);
    view.setInt16(offset + 22, compressQuatComponent(normQ.w), true);

    const speedCentimeters = Math.max(-32767, Math.min(32767, Math.round(v.speedMps * 100)));
    view.setInt16(offset + 24, speedCentimeters, true);
    const steerInt8 = Math.max(-127, Math.min(127, Math.round(v.steerAngleRad * 100)));
    view.setInt8(offset + 26, steerInt8);
    view.setUint8(offset + 27, flags & 0xff);

    for (let w = 0; w < 4; w++) {
      const compByte = Math.max(
        0,
        Math.min(255, Math.round((v.wheelCompressionRatio[w] ?? 0) * 255))
      );
      view.setUint8(offset + 28 + w, compByte);
    }

    offset += VEHICLE_RECORD_BYTE_LENGTH;
  }

  for (let i = 0; i < pCount; i++) {
    const p = props[i]!;
    const normQ = normalizeQuat(p.rotation);
    const flags = (p.isThrownProjectile ? 1 : 0) | (p.isDetonated ? 2 : 0);

    view.setUint16(offset + 0, p.propId & 0xffff, true);
    view.setUint16(offset + 2, p.holderEntityId & 0xffff, true);
    view.setFloat32(offset + 4, Number.isFinite(p.position.x) ? p.position.x : 0, true);
    view.setFloat32(offset + 8, Number.isFinite(p.position.y) ? p.position.y : 0, true);
    view.setFloat32(offset + 12, Number.isFinite(p.position.z) ? p.position.z : 0, true);

    view.setInt16(offset + 16, compressQuatComponent(normQ.x), true);
    view.setInt16(offset + 18, compressQuatComponent(normQ.y), true);
    view.setInt16(offset + 20, compressQuatComponent(normQ.z), true);
    view.setInt16(offset + 22, compressQuatComponent(normQ.w), true);

    view.setUint8(offset + 24, p.propType & 0xff);
    view.setUint8(offset + 25, flags & 0xff);
    view.setUint16(offset + 26, Math.max(0, Math.round(p.massKg)) & 0xffff, true);

    offset += PROP_RECORD_BYTE_LENGTH;
  }

  return buffer;
}

/**
 * Deserializes a binary Vehicle & Dynamic Prop Snapshot ArrayBuffer
 */
export function decodeVehiclePropSnapshot(
  buffer: ArrayBufferLike,
  byteOffset = 0,
  byteLength?: number
): {
  serverTickLow8: number;
  vehicles: VehicleBinarySnapshotState[];
  props: DynamicPropBinarySnapshotState[];
} | null {
  const len = byteLength ?? buffer.byteLength - byteOffset;
  if (len < VEHICLE_PROP_HEADER_BYTE_LENGTH) {
    return null;
  }

  const view = new DataView(buffer, byteOffset, len);
  if (view.getUint8(0) !== PacketType.VEHICLE_PROP_SNAPSHOT) {
    return null;
  }

  const vCount = view.getUint8(1);
  const pCount = view.getUint8(2);
  const serverTickLow8 = view.getUint8(3);
  const expectedLen =
    VEHICLE_PROP_HEADER_BYTE_LENGTH +
    vCount * VEHICLE_RECORD_BYTE_LENGTH +
    pCount * PROP_RECORD_BYTE_LENGTH;

  if (len !== expectedLen) {
    return null;
  }

  const vehicles: VehicleBinarySnapshotState[] = [];
  const props: DynamicPropBinarySnapshotState[] = [];
  let offset = VEHICLE_PROP_HEADER_BYTE_LENGTH;

  for (let i = 0; i < vCount; i++) {
    const vehicleId = view.getUint16(offset + 0, true);
    const driverEntityId = view.getUint16(offset + 2, true);
    const x = view.getFloat32(offset + 4, true);
    const y = view.getFloat32(offset + 8, true);
    const z = view.getFloat32(offset + 12, true);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return null;
    }

    const qx = decompressQuatComponent(view.getInt16(offset + 16, true));
    const qy = decompressQuatComponent(view.getInt16(offset + 18, true));
    const qz = decompressQuatComponent(view.getInt16(offset + 20, true));
    const qw = decompressQuatComponent(view.getInt16(offset + 22, true));
    const rotation = normalizeQuat({ x: qx, y: qy, z: qz, w: qw });

    const speedMps = view.getInt16(offset + 24, true) / 100.0;
    const steerAngleRad = view.getInt8(offset + 26) / 100.0;
    const flags = view.getUint8(offset + 27);
    const isInterceptor = (flags & 1) !== 0;
    const wallThrusterActive = (flags & 2) !== 0;
    const wheelGroundedMask = (flags >> 2) & 0x0f;

    const wheelCompressionRatio: [number, number, number, number] = [
      view.getUint8(offset + 28) / 255,
      view.getUint8(offset + 29) / 255,
      view.getUint8(offset + 30) / 255,
      view.getUint8(offset + 31) / 255,
    ];

    vehicles.push({
      vehicleId,
      driverEntityId,
      isInterceptor,
      wallThrusterActive,
      wheelGroundedMask,
      position: { x, y, z },
      rotation,
      speedMps,
      steerAngleRad,
      wheelCompressionRatio,
    });
    offset += VEHICLE_RECORD_BYTE_LENGTH;
  }

  for (let i = 0; i < pCount; i++) {
    const propId = view.getUint16(offset + 0, true);
    const holderEntityId = view.getUint16(offset + 2, true);
    const x = view.getFloat32(offset + 4, true);
    const y = view.getFloat32(offset + 8, true);
    const z = view.getFloat32(offset + 12, true);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return null;
    }

    const qx = decompressQuatComponent(view.getInt16(offset + 16, true));
    const qy = decompressQuatComponent(view.getInt16(offset + 18, true));
    const qz = decompressQuatComponent(view.getInt16(offset + 20, true));
    const qw = decompressQuatComponent(view.getInt16(offset + 22, true));
    const rotation = normalizeQuat({ x: qx, y: qy, z: qz, w: qw });

    const propType = view.getUint8(offset + 24) as DynamicPropType;
    const flags = view.getUint8(offset + 25);
    const isThrownProjectile = (flags & 1) !== 0;
    const isDetonated = (flags & 2) !== 0;
    const massKg = view.getUint16(offset + 26, true);

    props.push({
      propId,
      holderEntityId,
      propType,
      isThrownProjectile,
      isDetonated,
      massKg,
      position: { x, y, z },
      rotation,
    });
    offset += PROP_RECORD_BYTE_LENGTH;
  }

  return { serverTickLow8, vehicles, props };
}

/**
 * Encodes Authoritative Phase 5 World Events Snapshot (PacketType.WORLD_EVENTS_SNAPSHOT = 0x06):
 * - Header (4 bytes):
 *   [0] Uint8   packetType (0x06)
 *   [1] Uint8   districtCount (4)
 *   [2] Uint8   airshipCount
 *   [3] Uint8   serverTickLow8
 * - Omega Bounty Block (36 bytes):
 *   [0] Uint8   flags (bit0 = active, bit1 = escaped, bit2 = completed)
 *   [1] Uint8   waypointIndex
 *   [2] Uint8   totalWaypoints
 *   [3] Uint8   reserved
 *   [4] Uint16  enemyId
 *   [6] Uint16  timeRemainingDeciSec (timeRemainingSec * 10)
 *   [8] Float32 pos.x
 *   [12] Float32 pos.y
 *   [16] Float32 pos.z
 *   [20] Float32 targetWaypoint.x
 *   [24] Float32 targetWaypoint.y
 *   [28] Float32 targetWaypoint.z
 *   [32] Uint16  hp
 *   [34] Uint16  maxHp
 * - Per-District Loop Record (16 bytes * 4 = 64 bytes):
 *   [0] Uint8   districtIndex (0..3)
 *   [1] Uint8   currentStage (1..4)
 *   [2] Uint8   terminalsHacked
 *   [3] Uint8   totalTerminals
 *   [4] Float32 activeObjectivePos.x
 *   [8] Float32 activeObjectivePos.y
 *   [12] Float32 activeObjectivePos.z
 * - Per-Auditor Airship Record (24 bytes * airshipCount):
 *   [0] Uint16  airshipId
 *   [2] Uint16  targetEntityId
 *   [4] Uint8   mutationIndex (0..3)
 *   [5] Uint8   active (0 or 1)
 *   [6] Uint16  reserved
 *   [8] Float32 pos.x
 *   [12] Float32 pos.y
 *   [16] Float32 pos.z
 *   [20] Float32 yaw
 */
export function encodeWorldEventsSnapshot(
  serverTick: number,
  omega: OmegaBountyBinaryState,
  districts: DistrictLoopBinaryState[],
  airships: AuditorAirshipBinaryState[]
): ArrayBuffer {
  const dCount = Math.min(8, districts.length);
  const aCount = Math.min(16, airships.length);
  const totalBytes =
    WORLD_EVENTS_HEADER_BYTE_LENGTH +
    OMEGA_BOUNTY_BYTE_LENGTH +
    dCount * DISTRICT_LOOP_RECORD_BYTE_LENGTH +
    aCount * AUDITOR_AIRSHIP_RECORD_BYTE_LENGTH;

  const buffer = new ArrayBuffer(totalBytes);
  const view = new DataView(buffer);

  view.setUint8(0, PacketType.WORLD_EVENTS_SNAPSHOT);
  view.setUint8(1, dCount);
  view.setUint8(2, aCount);
  view.setUint8(3, serverTick & 0xff);

  let offset = WORLD_EVENTS_HEADER_BYTE_LENGTH;
  const omegaFlags =
    (omega.active ? 1 : 0) |
    (omega.escaped ? 2 : 0) |
    (omega.completed ? 4 : 0);
  view.setUint8(offset + 0, omegaFlags);
  view.setUint8(offset + 1, omega.waypointIndex & 0xff);
  view.setUint8(offset + 2, omega.totalWaypoints & 0xff);
  view.setUint8(offset + 3, 0);
  view.setUint16(offset + 4, omega.enemyId & 0xffff, true);
  view.setUint16(
    offset + 6,
    Math.max(0, Math.min(65535, Math.round(omega.timeRemainingSec * 10))),
    true
  );
  view.setFloat32(offset + 8, omega.position.x, true);
  view.setFloat32(offset + 12, omega.position.y, true);
  view.setFloat32(offset + 16, omega.position.z, true);
  view.setFloat32(offset + 20, omega.targetWaypoint.x, true);
  view.setFloat32(offset + 24, omega.targetWaypoint.y, true);
  view.setFloat32(offset + 28, omega.targetWaypoint.z, true);
  view.setUint16(offset + 32, Math.max(0, Math.round(omega.hp)), true);
  view.setUint16(offset + 34, Math.max(1, Math.round(omega.maxHp)), true);
  offset += OMEGA_BOUNTY_BYTE_LENGTH;

  for (let i = 0; i < dCount; i++) {
    const d = districts[i]!;
    view.setUint8(offset + 0, d.districtIndex & 0xff);
    view.setUint8(offset + 1, d.currentStage & 0xff);
    view.setUint8(offset + 2, d.terminalsHacked & 0xff);
    view.setUint8(offset + 3, d.totalTerminals & 0xff);
    view.setFloat32(offset + 4, d.activeObjectivePos.x, true);
    view.setFloat32(offset + 8, d.activeObjectivePos.y, true);
    view.setFloat32(offset + 12, d.activeObjectivePos.z, true);
    offset += DISTRICT_LOOP_RECORD_BYTE_LENGTH;
  }

  for (let i = 0; i < aCount; i++) {
    const a = airships[i]!;
    view.setUint16(offset + 0, a.airshipId & 0xffff, true);
    view.setUint16(offset + 2, a.targetEntityId & 0xffff, true);
    view.setUint8(offset + 4, a.mutationIndex & 0xff);
    view.setUint8(offset + 5, a.active ? 1 : 0);
    view.setUint16(offset + 6, 0, true);
    view.setFloat32(offset + 8, a.position.x, true);
    view.setFloat32(offset + 12, a.position.y, true);
    view.setFloat32(offset + 16, a.position.z, true);
    view.setFloat32(offset + 20, a.yaw, true);
    offset += AUDITOR_AIRSHIP_RECORD_BYTE_LENGTH;
  }

  return buffer;
}

export function decodeWorldEventsSnapshot(
  buffer: ArrayBuffer,
  byteOffset = 0,
  byteLength?: number
): {
  serverTickLow8: number;
  omega: OmegaBountyBinaryState;
  districts: DistrictLoopBinaryState[];
  airships: AuditorAirshipBinaryState[];
} | null {
  const len = byteLength ?? buffer.byteLength - byteOffset;
  if (len < WORLD_EVENTS_HEADER_BYTE_LENGTH + OMEGA_BOUNTY_BYTE_LENGTH) {
    return null;
  }

  const view = new DataView(buffer, byteOffset, len);
  if (view.getUint8(0) !== PacketType.WORLD_EVENTS_SNAPSHOT) {
    return null;
  }

  const dCount = view.getUint8(1);
  const aCount = view.getUint8(2);
  const serverTickLow8 = view.getUint8(3);
  const expectedLen =
    WORLD_EVENTS_HEADER_BYTE_LENGTH +
    OMEGA_BOUNTY_BYTE_LENGTH +
    dCount * DISTRICT_LOOP_RECORD_BYTE_LENGTH +
    aCount * AUDITOR_AIRSHIP_RECORD_BYTE_LENGTH;

  if (len !== expectedLen) {
    return null;
  }

  let offset = WORLD_EVENTS_HEADER_BYTE_LENGTH;
  const omegaFlags = view.getUint8(offset + 0);
  const omega: OmegaBountyBinaryState = {
    active: (omegaFlags & 1) !== 0,
    escaped: (omegaFlags & 2) !== 0,
    completed: (omegaFlags & 4) !== 0,
    waypointIndex: view.getUint8(offset + 1),
    totalWaypoints: view.getUint8(offset + 2),
    enemyId: view.getUint16(offset + 4, true),
    timeRemainingSec: view.getUint16(offset + 6, true) / 10.0,
    position: {
      x: view.getFloat32(offset + 8, true),
      y: view.getFloat32(offset + 12, true),
      z: view.getFloat32(offset + 16, true),
    },
    targetWaypoint: {
      x: view.getFloat32(offset + 20, true),
      y: view.getFloat32(offset + 24, true),
      z: view.getFloat32(offset + 28, true),
    },
    hp: view.getUint16(offset + 32, true),
    maxHp: view.getUint16(offset + 34, true),
  };
  offset += OMEGA_BOUNTY_BYTE_LENGTH;

  const districts: DistrictLoopBinaryState[] = [];
  for (let i = 0; i < dCount; i++) {
    districts.push({
      districtIndex: view.getUint8(offset + 0),
      currentStage: view.getUint8(offset + 1),
      terminalsHacked: view.getUint8(offset + 2),
      totalTerminals: view.getUint8(offset + 3),
      activeObjectivePos: {
        x: view.getFloat32(offset + 4, true),
        y: view.getFloat32(offset + 8, true),
        z: view.getFloat32(offset + 12, true),
      },
    });
    offset += DISTRICT_LOOP_RECORD_BYTE_LENGTH;
  }

  const airships: AuditorAirshipBinaryState[] = [];
  for (let i = 0; i < aCount; i++) {
    airships.push({
      airshipId: view.getUint16(offset + 0, true),
      targetEntityId: view.getUint16(offset + 2, true),
      mutationIndex: view.getUint8(offset + 4),
      active: view.getUint8(offset + 5) !== 0,
      position: {
        x: view.getFloat32(offset + 8, true),
        y: view.getFloat32(offset + 12, true),
        z: view.getFloat32(offset + 16, true),
      },
      yaw: view.getFloat32(offset + 20, true),
    });
    offset += AUDITOR_AIRSHIP_RECORD_BYTE_LENGTH;
  }

  return { serverTickLow8, omega, districts, airships };
}



