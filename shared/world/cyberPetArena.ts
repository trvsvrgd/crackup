/**
 * CRACKUP: Protocol Eclipse (v2.0 True 3D AAA Architecture)
 * Phase 6 — 3D Cyber-Pets & Live Skybox Pet Arena (PRD Section 4.5 REQ-PETS)
 *
 *  1. Cyber-Pet companions: 4 species steered by classic boid rules (seek orbit slot + separation +
 *     alignment + cohesion) plus Rapier3D raycast obstacle whiskers and downward ground snapping.
 *  2. Neon Pet Derby: a physical 16-node elevated race loop at Y = 400m (skybox) built from oriented
 *     Rapier3D cuboid colliders. Pets race 2 laps through 8 checkpoint gates; falls respawn at the
 *     last safe node with a stall penalty.
 *  3. Cyber-Pit Clash: an open skybox platform where pets brawl with escalating knockback; ring-outs
 *     (falling below the deck) and HP depletion eliminate fighters until one remains.
 */

import RAPIER from '@dimforge/rapier3d-compat';
import {
  CyberPetSpecies,
  FIXED_TIMESTEP,
  PET_CLASH_COUNTDOWN_SEC,
  PET_CLASH_LOBBY_SEC,
  PET_CLASH_MAX_FIGHT_SEC,
  PET_CLASH_RESULTS_SEC,
  PET_DERBY_COUNTDOWN_SEC,
  PET_DERBY_LAPS,
  PET_DERBY_LOBBY_SEC,
  PET_DERBY_MAX_RACE_SEC,
  PET_DERBY_RESULTS_SEC,
  PET_NEIGHBOR_RADIUS_M,
  PET_ORBIT_RADIUS_M,
  PET_SEPARATION_RADIUS_M,
  PET_TELEPORT_LEASH_M,
  PetArenaState,
  PetMode,
  SKYBOX_ARENA_BASE_Y,
  WORLD_GRAVITY,
} from '../constants.js';
import type { AgentPhysicsBody } from '../physics/characterController.js';
import type {
  ClashFighterBinaryState,
  CyberPetBinaryState,
  DerbyRacerBinaryState,
  PetArenaBinaryHeader,
  Vec3,
} from '../protocol/binaryProtocol.js';
import type { WorldBoxStructure } from './neoVeridiaBlock.js';

// ---------------------------------------------------------------------------
// Species catalogue
// ---------------------------------------------------------------------------

export interface CyberPetSpeciesSpec {
  species: CyberPetSpecies;
  name: string;
  maxSpeedMps: number;
  maxAccelMps2: number;
  hoverHeightM: number; // 0 = ground walker (raycast ground snap), > 0 = hovering drone
  bodyRadiusM: number;
  maxHp: number;
  clashDamage: number;
  clashKnockbackMps: number;
  clashAttackIntervalSec: number;
  massKg: number;
}

export const CYBER_PET_SPECIES_SPECS: Record<CyberPetSpecies, CyberPetSpeciesSpec> = {
  [CyberPetSpecies.NEON_FOX]: {
    species: CyberPetSpecies.NEON_FOX,
    name: 'Neon Fox',
    maxSpeedMps: 15.0,
    maxAccelMps2: 38.0,
    hoverHeightM: 0,
    bodyRadiusM: 0.45,
    maxHp: 120,
    clashDamage: 14,
    clashKnockbackMps: 7.0,
    clashAttackIntervalSec: 0.75,
    massKg: 18,
  },
  [CyberPetSpecies.GRID_HOUND]: {
    species: CyberPetSpecies.GRID_HOUND,
    name: 'Grid Hound',
    maxSpeedMps: 13.5,
    maxAccelMps2: 32.0,
    hoverHeightM: 0,
    bodyRadiusM: 0.55,
    maxHp: 160,
    clashDamage: 18,
    clashKnockbackMps: 8.0,
    clashAttackIntervalSec: 0.9,
    massKg: 34,
  },
  [CyberPetSpecies.AERO_RAVEN_DRONE]: {
    species: CyberPetSpecies.AERO_RAVEN_DRONE,
    name: 'Aero-Raven Drone',
    maxSpeedMps: 16.5,
    maxAccelMps2: 42.0,
    hoverHeightM: 1.8,
    bodyRadiusM: 0.4,
    maxHp: 95,
    clashDamage: 11,
    clashKnockbackMps: 5.5,
    clashAttackIntervalSec: 0.6,
    massKg: 9,
  },
  [CyberPetSpecies.TITAN_BEETLE]: {
    species: CyberPetSpecies.TITAN_BEETLE,
    name: 'Titan Beetle',
    maxSpeedMps: 11.0,
    maxAccelMps2: 26.0,
    hoverHeightM: 0,
    bodyRadiusM: 0.7,
    maxHp: 240,
    clashDamage: 24,
    clashKnockbackMps: 11.0,
    clashAttackIntervalSec: 1.15,
    massKg: 80,
  },
};

export function isValidPetSpecies(v: unknown): v is CyberPetSpecies {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 3;
}

// ---------------------------------------------------------------------------
// Skybox geometry (Neon Pet Derby loop, spectator deck, Cyber-Pit Clash platform)
// ---------------------------------------------------------------------------

export const DERBY_TRACK_ELLIPSE_A_M = 70.0; // X semi-axis
export const DERBY_TRACK_ELLIPSE_B_M = 45.0; // Z semi-axis
export const DERBY_TRACK_WIDTH_M = 8.0;
export const DERBY_NODE_COUNT = 16;
export const DERBY_NODE_PASS_RADIUS_M = 7.5;
/** Elevation profile (meters above SKYBOX_ARENA_BASE_Y) per node: a banked hill climb on the north straight */
const DERBY_NODE_ELEVATION_M = [0, 0, 0, 1.5, 4.0, 6.0, 4.0, 1.5, 0, 0, 0, 0, 0, 0, 0, 0];

export const DERBY_TRACK_NODES: Vec3[] = Array.from({ length: DERBY_NODE_COUNT }, (_, i) => {
  const a = (i / DERBY_NODE_COUNT) * Math.PI * 2;
  return {
    x: DERBY_TRACK_ELLIPSE_A_M * Math.cos(a),
    y: SKYBOX_ARENA_BASE_Y + DERBY_NODE_ELEVATION_M[i]!,
    z: DERBY_TRACK_ELLIPSE_B_M * Math.sin(a),
  };
});

/** Checkpoint gates sit on every second node (8 gates per lap; node 0 = start/finish) */
export const DERBY_CHECKPOINT_NODE_INDICES = [0, 2, 4, 6, 8, 10, 12, 14];

export const DERBY_SPECTATOR_DECK_CENTER: Vec3 = { x: 0, y: SKYBOX_ARENA_BASE_Y, z: 0 };
export const CLASH_ARENA_CENTER: Vec3 = { x: 0, y: SKYBOX_ARENA_BASE_Y, z: 120 };
export const CLASH_ARENA_HALF_SIZE_M = 15.0;
export const CLASH_BALCONY_CENTER: Vec3 = { x: 0, y: SKYBOX_ARENA_BASE_Y + 4.0, z: 140 };
export const PET_ARENA_FALL_RESET_DEPTH_M = 15.0;

interface OrientedFrame {
  euler: { x: number; y: number; z: number };
  localX: Vec3;
  localY: Vec3;
  length: number;
}

/**
 * Builds an XYZ-order Euler rotation whose local +Z axis points from p0 to p1 (R = Ry(yaw) * Rx(pitch)).
 * Matches the Three.js 'XYZ' Euler convention and the shared eulerToQuat() used for Rapier3D colliders.
 */
export function computeOrientedFrame(p0: Vec3, p1: Vec3): OrientedFrame {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const dz = p1.z - p0.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  const yaw = Math.atan2(dx, dz);
  const pitch = -Math.asin(Math.max(-1, Math.min(1, dy / length)));
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const m13 = Math.max(-1, Math.min(1, sy * cp));
  return {
    euler: {
      x: Math.atan2(sp, cy * cp),
      y: Math.asin(m13),
      z: Math.atan2(-sy * sp, cy),
    },
    localX: { x: cy, y: 0, z: -sy },
    localY: { x: sy * sp, y: cp, z: cy * sp },
    length,
  };
}

let cachedSkyboxStructures: WorldBoxStructure[] | null = null;

/**
 * Deterministic skybox geometry shared by the authoritative server, client prediction and renderer.
 */
export function buildSkyboxPetArenaStructures(): WorldBoxStructure[] {
  if (cachedSkyboxStructures) return cachedSkyboxStructures;
  const out: WorldBoxStructure[] = [];
  const halfW = DERBY_TRACK_WIDTH_M * 0.5;
  const deckHalfThickness = 0.5;

  for (let i = 0; i < DERBY_NODE_COUNT; i++) {
    const p0 = DERBY_TRACK_NODES[i]!;
    const p1 = DERBY_TRACK_NODES[(i + 1) % DERBY_NODE_COUNT]!;
    const f = computeOrientedFrame(p0, p1);
    const mid = { x: (p0.x + p1.x) * 0.5, y: (p0.y + p1.y) * 0.5, z: (p0.z + p1.z) * 0.5 };

    out.push({
      id: `skybox_derby_segment_${i}`,
      center: {
        x: mid.x - f.localY.x * deckHalfThickness,
        y: mid.y - f.localY.y * deckHalfThickness,
        z: mid.z - f.localY.z * deckHalfThickness,
      },
      halfExtents: { x: halfW, y: deckHalfThickness, z: f.length * 0.5 + 0.75 },
      rotation: f.euler,
      material: 'obsidian_steel',
      emissiveTrim: i % 2 === 0 ? 'cyan' : 'magenta',
    });

    for (const side of [-1, 1]) {
      const off = (halfW + 0.25) * side;
      out.push({
        id: `skybox_derby_rail_${i}_${side < 0 ? 'inner' : 'outer'}`,
        center: {
          x: mid.x + f.localX.x * off + f.localY.x * 0.45,
          y: mid.y + f.localX.y * off + f.localY.y * 0.45,
          z: mid.z + f.localX.z * off + f.localY.z * 0.45,
        },
        halfExtents: { x: 0.25, y: 0.45, z: f.length * 0.5 },
        rotation: f.euler,
        material: 'ledge_trim',
        emissiveTrim: 'cyan',
      });
    }
  }

  // Flat joint pads at every node close the outer wedge gaps between rotated chord segments
  for (let i = 0; i < DERBY_NODE_COUNT; i++) {
    const prev = DERBY_TRACK_NODES[(i + DERBY_NODE_COUNT - 1) % DERBY_NODE_COUNT]!;
    const next = DERBY_TRACK_NODES[(i + 1) % DERBY_NODE_COUNT]!;
    const node = DERBY_TRACK_NODES[i]!;
    const yaw = Math.atan2(next.x - prev.x, next.z - prev.z);
    out.push({
      id: `skybox_derby_joint_${i}`,
      center: { x: node.x, y: node.y - deckHalfThickness, z: node.z },
      halfExtents: { x: halfW + 0.6, y: deckHalfThickness, z: halfW + 0.6 },
      rotation: { x: 0, y: yaw, z: 0 },
      material: 'obsidian_steel',
    });
  }

  // Checkpoint gate pylons (solid, climbable) flanking every checkpoint node
  for (const idx of DERBY_CHECKPOINT_NODE_INDICES) {
    const prev = DERBY_TRACK_NODES[(idx + DERBY_NODE_COUNT - 1) % DERBY_NODE_COUNT]!;
    const next = DERBY_TRACK_NODES[(idx + 1) % DERBY_NODE_COUNT]!;
    const node = DERBY_TRACK_NODES[idx]!;
    const yaw = Math.atan2(next.x - prev.x, next.z - prev.z);
    const lx = Math.cos(yaw);
    const lz = -Math.sin(yaw);
    for (const side of [-1, 1]) {
      const off = (halfW + 1.4) * side;
      out.push({
        id: `skybox_derby_gate_${idx}_${side < 0 ? 'l' : 'r'}`,
        center: { x: node.x + lx * off, y: node.y + 3.0, z: node.z + lz * off },
        halfExtents: { x: 0.45, y: 3.0, z: 0.45 },
        rotation: { x: 0, y: yaw, z: 0 },
        material: idx === 0 ? 'neon_amber' : 'neon_cyan',
      });
    }
  }

  out.push(
    {
      id: 'skybox_derby_spectator_deck',
      center: { x: DERBY_SPECTATOR_DECK_CENTER.x, y: SKYBOX_ARENA_BASE_Y - 0.5, z: DERBY_SPECTATOR_DECK_CENTER.z },
      halfExtents: { x: 16.0, y: 0.5, z: 9.0 },
      material: 'obsidian_steel',
      emissiveTrim: 'cyan',
    },
    {
      id: 'skybox_clash_arena_platform',
      center: { x: CLASH_ARENA_CENTER.x, y: SKYBOX_ARENA_BASE_Y - 0.75, z: CLASH_ARENA_CENTER.z },
      halfExtents: { x: CLASH_ARENA_HALF_SIZE_M, y: 0.75, z: CLASH_ARENA_HALF_SIZE_M },
      material: 'industrial_grate',
      emissiveTrim: 'magenta',
    },
    {
      id: 'skybox_clash_spectator_balcony',
      center: { x: CLASH_BALCONY_CENTER.x, y: CLASH_BALCONY_CENTER.y - 0.5, z: CLASH_BALCONY_CENTER.z },
      halfExtents: { x: 12.0, y: 0.5, z: 3.0 },
      material: 'obsidian_steel',
      emissiveTrim: 'magenta',
    }
  );

  cachedSkyboxStructures = out;
  return out;
}

// ---------------------------------------------------------------------------
// Runtime entities
// ---------------------------------------------------------------------------

export interface CyberPetEntity {
  petId: number;
  ownerEntityId: number;
  species: CyberPetSpecies;
  name: string;
  mode: PetMode;
  position: Vec3;
  velocity: Vec3;
  yaw: number;
  grounded: boolean;
  hp: number;
  maxHp: number;
  orbitPhase: number;
  derbyWins: number;
  clashWins: number;

  // Neon Pet Derby
  derbyNextNode: number;
  derbyLap: number;
  derbyLastSafeNode: number;
  derbyFinished: boolean;
  derbyFinishTimeSec: number;
  derbyPlace: number;
  derbyStallTimer: number;

  // Cyber-Pit Clash
  clashEliminated: boolean;
  clashAttackCooldown: number;
}

export interface Phase6EventNotification {
  type:
    | 'PET_ADOPTED'
    | 'PET_DERBY_COUNTDOWN'
    | 'PET_DERBY_STARTED'
    | 'PET_DERBY_FINISHED'
    | 'PET_CLASH_COUNTDOWN'
    | 'PET_CLASH_STARTED'
    | 'PET_CLASH_FINISHED'
    | 'DREADNOUGHT_DEPLOYED'
    | 'DREADNOUGHT_PART_DESTROYED'
    | 'DREADNOUGHT_PHASE_CHANGED'
    | 'DREADNOUGHT_DEFEATED'
    | 'AGENT_DOWNED';
  message: string;
  ownerEntityId?: number;
  winnerEntityId?: number;
  participantEntityIds?: number[];
  placements?: Array<{ ownerEntityId: number; place: number; timeSec: number }>;
  phase?: number;
  partId?: number;
}

interface ArenaRuntime {
  state: PetArenaState;
  timer: number;
  elapsedSec: number;
  petIds: number[];
  winnerPetId: number;
  finishOrder: number[];
}

export interface PersistedPetStats {
  species: CyberPetSpecies;
  name: string;
  derbyWins: number;
  clashWins: number;
}

const GRAVITY_Y = WORLD_GRAVITY.y;

function horizontalLength(v: Vec3): number {
  return Math.hypot(v.x, v.z);
}

export class CyberPetArenaManager {
  public readonly pets: Map<number, CyberPetEntity> = new Map();
  public readonly petIdByOwner: Map<number, number> = new Map();
  public readonly derby: ArenaRuntime = {
    state: PetArenaState.LOBBY,
    timer: 0,
    elapsedSec: 0,
    petIds: [],
    winnerPetId: 0,
    finishOrder: [],
  };
  public readonly clash: ArenaRuntime = {
    state: PetArenaState.LOBBY,
    timer: 0,
    elapsedSec: 0,
    petIds: [],
    winnerPetId: 0,
    finishOrder: [],
  };
  /** Pre-arena world positions so Agents return where they left */
  public readonly agentReturnPositions: Map<number, Vec3> = new Map();
  private nextPetId = 1;

  constructor(
    private readonly world: RAPIER.World,
    private readonly notifications: Phase6EventNotification[],
    private readonly teleportAgent: (agent: AgentPhysicsBody, pos: Vec3) => void
  ) {}

  // -------------------------------------------------------------------------
  // Adoption & lifecycle
  // -------------------------------------------------------------------------

  public adoptPet(
    owner: AgentPhysicsBody,
    species: CyberPetSpecies,
    stats?: Partial<PersistedPetStats>
  ): CyberPetEntity {
    this.removePetForOwner(owner.entityId);
    const spec = CYBER_PET_SPECIES_SPECS[species];
    const petId = this.nextPetId++;
    if (this.nextPetId > 65000) this.nextPetId = 1;

    const phase = (owner.entityId * 1.7) % (Math.PI * 2);
    const pet: CyberPetEntity = {
      petId,
      ownerEntityId: owner.entityId,
      species,
      name: (stats?.name || `${owner.callsign}'s ${spec.name}`).slice(0, 32),
      mode: PetMode.FOLLOW,
      position: {
        x: owner.position.x + Math.cos(phase) * PET_ORBIT_RADIUS_M,
        y: owner.position.y + spec.hoverHeightM,
        z: owner.position.z + Math.sin(phase) * PET_ORBIT_RADIUS_M,
      },
      velocity: { x: 0, y: 0, z: 0 },
      yaw: 0,
      grounded: spec.hoverHeightM === 0,
      hp: spec.maxHp,
      maxHp: spec.maxHp,
      orbitPhase: phase,
      derbyWins: Math.max(0, Math.floor(stats?.derbyWins ?? 0)),
      clashWins: Math.max(0, Math.floor(stats?.clashWins ?? 0)),
      derbyNextNode: 1,
      derbyLap: 0,
      derbyLastSafeNode: 0,
      derbyFinished: false,
      derbyFinishTimeSec: 0,
      derbyPlace: 0,
      derbyStallTimer: 0,
      clashEliminated: false,
      clashAttackCooldown: 0,
    };
    this.pets.set(petId, pet);
    this.petIdByOwner.set(owner.entityId, petId);
    this.notifications.push({
      type: 'PET_ADOPTED',
      ownerEntityId: owner.entityId,
      message: `${owner.callsign} bonded with Cyber-Pet "${pet.name}" (${spec.name}).`,
    });
    return pet;
  }

  public getPetForOwner(ownerEntityId: number): CyberPetEntity | undefined {
    const id = this.petIdByOwner.get(ownerEntityId);
    return id !== undefined ? this.pets.get(id) : undefined;
  }

  public getPersistedStats(ownerEntityId: number): PersistedPetStats | null {
    const pet = this.getPetForOwner(ownerEntityId);
    if (!pet) return null;
    return { species: pet.species, name: pet.name, derbyWins: pet.derbyWins, clashWins: pet.clashWins };
  }

  public removePetForOwner(ownerEntityId: number): void {
    const petId = this.petIdByOwner.get(ownerEntityId);
    if (petId === undefined) return;
    this.derby.petIds = this.derby.petIds.filter((id) => id !== petId);
    this.clash.petIds = this.clash.petIds.filter((id) => id !== petId);
    this.pets.delete(petId);
    this.petIdByOwner.delete(ownerEntityId);
    this.agentReturnPositions.delete(ownerEntityId);
  }

  // -------------------------------------------------------------------------
  // Arena entry / exit
  // -------------------------------------------------------------------------

  public joinDerby(owner: AgentPhysicsBody): { ok: boolean; error?: string } {
    const pet = this.getPetForOwner(owner.entityId);
    if (!pet) return { ok: false, error: 'Adopt a Cyber-Pet first.' };
    if (pet.mode !== PetMode.FOLLOW) return { ok: false, error: 'Pet is already in an arena.' };
    if (this.derby.state !== PetArenaState.LOBBY) return { ok: false, error: 'Derby race in progress.' };
    if (this.derby.petIds.length >= 8) return { ok: false, error: 'Derby grid is full (8/8).' };

    const slot = this.derby.petIds.length;
    this.derby.petIds.push(pet.petId);
    if (slot === 0) this.derby.timer = PET_DERBY_LOBBY_SEC;
    if (this.derby.petIds.length >= 8) this.derby.timer = 0;

    pet.mode = PetMode.DERBY;
    this.placePetOnDerbyGrid(pet, slot);

    this.agentReturnPositions.set(owner.entityId, { ...owner.position });
    this.teleportAgent(owner, {
      x: DERBY_SPECTATOR_DECK_CENTER.x - 10.5 + (slot % 4) * 7.0,
      y: SKYBOX_ARENA_BASE_Y + 0.05,
      z: DERBY_SPECTATOR_DECK_CENTER.z - 3.0 + Math.floor(slot / 4) * 6.0,
    });
    return { ok: true };
  }

  public joinClash(owner: AgentPhysicsBody): { ok: boolean; error?: string } {
    const pet = this.getPetForOwner(owner.entityId);
    if (!pet) return { ok: false, error: 'Adopt a Cyber-Pet first.' };
    if (pet.mode !== PetMode.FOLLOW) return { ok: false, error: 'Pet is already in an arena.' };
    if (this.clash.state !== PetArenaState.LOBBY) return { ok: false, error: 'Clash bout in progress.' };
    if (this.clash.petIds.length >= 8) return { ok: false, error: 'Clash roster is full (8/8).' };

    const slot = this.clash.petIds.length;
    this.clash.petIds.push(pet.petId);
    if (slot === 0) this.clash.timer = PET_CLASH_LOBBY_SEC;
    if (this.clash.petIds.length >= 8) this.clash.timer = 0;

    pet.mode = PetMode.CLASH;
    this.placePetInClashRing(pet, slot);

    this.agentReturnPositions.set(owner.entityId, { ...owner.position });
    this.teleportAgent(owner, {
      x: CLASH_BALCONY_CENTER.x - 9.0 + slot * 2.5,
      y: CLASH_BALCONY_CENTER.y + 0.05,
      z: CLASH_BALCONY_CENTER.z,
    });
    return { ok: true };
  }

  public leaveArena(owner: AgentPhysicsBody): boolean {
    const pet = this.getPetForOwner(owner.entityId);
    if (!pet || pet.mode === PetMode.FOLLOW) return false;
    if (pet.mode === PetMode.DERBY) {
      this.derby.petIds = this.derby.petIds.filter((id) => id !== pet.petId);
    } else {
      this.clash.petIds = this.clash.petIds.filter((id) => id !== pet.petId);
    }
    this.returnOwnerAndPet(owner, pet);
    return true;
  }

  private returnOwnerAndPet(owner: AgentPhysicsBody | undefined, pet: CyberPetEntity): void {
    pet.mode = PetMode.FOLLOW;
    pet.hp = pet.maxHp;
    pet.clashEliminated = false;
    pet.velocity = { x: 0, y: 0, z: 0 };
    if (owner) {
      const back = this.agentReturnPositions.get(owner.entityId);
      if (back) {
        this.teleportAgent(owner, back);
        this.agentReturnPositions.delete(owner.entityId);
      }
      this.warpPetToOwner(pet, owner);
    }
  }

  private placePetOnDerbyGrid(pet: CyberPetEntity, slot: number): void {
    const spec = CYBER_PET_SPECIES_SPECS[pet.species];
    const start = DERBY_TRACK_NODES[0]!;
    // Track tangent at node 0 is +Z; the grid forms 2 rows of 4 lanes behind the start/finish gate
    const lane = slot % 4;
    const row = Math.floor(slot / 4);
    pet.position = {
      x: start.x - 2.7 + lane * 1.8,
      y: start.y + spec.hoverHeightM + 0.05,
      z: start.z - 3.0 - row * 3.2,
    };
    pet.velocity = { x: 0, y: 0, z: 0 };
    pet.yaw = Math.PI; // facing +Z (forward = -sin(yaw), -cos(yaw))
    pet.derbyNextNode = 1;
    pet.derbyLap = 0;
    pet.derbyLastSafeNode = 0;
    pet.derbyFinished = false;
    pet.derbyFinishTimeSec = 0;
    pet.derbyPlace = 0;
    pet.derbyStallTimer = 0;
    pet.hp = pet.maxHp;
  }

  private placePetInClashRing(pet: CyberPetEntity, slot: number): void {
    const spec = CYBER_PET_SPECIES_SPECS[pet.species];
    const a = (slot / 8) * Math.PI * 2;
    pet.position = {
      x: CLASH_ARENA_CENTER.x + Math.cos(a) * 9.0,
      y: SKYBOX_ARENA_BASE_Y + spec.hoverHeightM + 0.05,
      z: CLASH_ARENA_CENTER.z + Math.sin(a) * 9.0,
    };
    pet.velocity = { x: 0, y: 0, z: 0 };
    pet.hp = pet.maxHp;
    pet.clashEliminated = false;
    pet.clashAttackCooldown = 0;
  }

  private warpPetToOwner(pet: CyberPetEntity, owner: AgentPhysicsBody): void {
    const spec = CYBER_PET_SPECIES_SPECS[pet.species];
    pet.position = {
      x: owner.position.x + Math.cos(pet.orbitPhase) * PET_ORBIT_RADIUS_M,
      y: owner.position.y + spec.hoverHeightM + 0.05,
      z: owner.position.z + Math.sin(pet.orbitPhase) * PET_ORBIT_RADIUS_M,
    };
    pet.velocity = { x: 0, y: 0, z: 0 };
    pet.grounded = false;
  }

  // -------------------------------------------------------------------------
  // Physics helpers (static-geometry-only Rapier3D raycasts)
  // -------------------------------------------------------------------------

  private castStaticRay(origin: Vec3, dir: Vec3, maxToi: number): { toi: number; normal: Vec3 } | null {
    const ray = new RAPIER.Ray(origin, dir);
    const hit = this.world.castRayAndGetNormal(ray, maxToi, true, RAPIER.QueryFilterFlags.ONLY_FIXED);
    if (!hit) return null;
    return { toi: hit.timeOfImpact, normal: { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z } };
  }

  /** Vertical integration with downward ground snap (ground walkers) or altitude hold (drones) */
  private integrateVertical(pet: CyberPetEntity, dt: number, hoverTargetY: number | null): void {
    const spec = CYBER_PET_SPECIES_SPECS[pet.species];
    const probeUp = 1.6;
    const probeLen = probeUp + Math.max(0.6, Math.abs(pet.velocity.y) * dt + 0.45);
    const hit = this.castStaticRay(
      { x: pet.position.x, y: pet.position.y + probeUp, z: pet.position.z },
      { x: 0, y: -1, z: 0 },
      probeLen + spec.hoverHeightM
    );
    const groundY = hit ? pet.position.y + probeUp - hit.toi : null;

    if (spec.hoverHeightM > 0) {
      const target =
        hoverTargetY !== null
          ? hoverTargetY
          : groundY !== null
            ? groundY + spec.hoverHeightM
            : null;
      if (target !== null && (groundY === null || target >= groundY + 0.2)) {
        const err = target - pet.position.y;
        pet.velocity.y += (err * 18.0 - pet.velocity.y * 6.0) * dt;
        pet.grounded = false;
      } else {
        pet.velocity.y += GRAVITY_Y * dt;
      }
      pet.position.y += pet.velocity.y * dt;
      if (groundY !== null && pet.position.y < groundY + 0.3) {
        pet.position.y = groundY + 0.3;
        pet.velocity.y = Math.max(0, pet.velocity.y);
      }
      return;
    }

    if (groundY !== null && pet.velocity.y <= 0.05 && pet.position.y - groundY <= Math.abs(pet.velocity.y) * dt + 0.4) {
      pet.position.y = groundY;
      pet.velocity.y = 0;
      pet.grounded = true;
    } else {
      pet.velocity.y = Math.max(-55, pet.velocity.y + GRAVITY_Y * dt);
      pet.position.y += pet.velocity.y * dt;
      pet.grounded = false;
      if (groundY !== null && pet.velocity.y <= 0 && pet.position.y <= groundY) {
        pet.position.y = groundY;
        pet.velocity.y = 0;
        pet.grounded = true;
      }
    }
  }

  private applyHorizontalSteering(pet: CyberPetEntity, steer: Vec3, maxSpeed: number, dt: number): void {
    const spec = CYBER_PET_SPECIES_SPECS[pet.species];
    const sMag = Math.hypot(steer.x, steer.z);
    if (sMag > spec.maxAccelMps2) {
      steer.x = (steer.x / sMag) * spec.maxAccelMps2;
      steer.z = (steer.z / sMag) * spec.maxAccelMps2;
    }
    pet.velocity.x += steer.x * dt;
    pet.velocity.z += steer.z * dt;
    const hs = horizontalLength(pet.velocity);
    if (hs > maxSpeed) {
      pet.velocity.x = (pet.velocity.x / hs) * maxSpeed;
      pet.velocity.z = (pet.velocity.z / hs) * maxSpeed;
    }
    pet.position.x += pet.velocity.x * dt;
    pet.position.z += pet.velocity.z * dt;
    if (hs > 0.3) {
      pet.yaw = Math.atan2(-pet.velocity.x, -pet.velocity.z);
    }
  }

  // -------------------------------------------------------------------------
  // Boid companion steering
  // -------------------------------------------------------------------------

  private stepFollowPet(pet: CyberPetEntity, owner: AgentPhysicsBody, followPets: CyberPetEntity[], dt: number): void {
    const spec = CYBER_PET_SPECIES_SPECS[pet.species];
    pet.orbitPhase = (pet.orbitPhase + dt * 0.9) % (Math.PI * 2);
    pet.hp = Math.min(pet.maxHp, pet.hp + 6 * dt);

    const slot: Vec3 = {
      x: owner.position.x + Math.cos(pet.orbitPhase) * PET_ORBIT_RADIUS_M,
      y: owner.position.y,
      z: owner.position.z + Math.sin(pet.orbitPhase) * PET_ORBIT_RADIUS_M,
    };

    const ownerDist = Math.hypot(
      owner.position.x - pet.position.x,
      owner.position.y - pet.position.y,
      owner.position.z - pet.position.z
    );
    if (ownerDist > PET_TELEPORT_LEASH_M || Math.abs(owner.position.y - pet.position.y) > 12.0) {
      this.warpPetToOwner(pet, owner);
      return;
    }

    const ownerHSpeed = horizontalLength(owner.velocity);
    const maxSpeed = Math.max(spec.maxSpeedMps, ownerHSpeed * 1.15);

    // 1. Seek orbit slot with arrival damping, inheriting the owner's velocity
    const tx = slot.x - pet.position.x;
    const tz = slot.z - pet.position.z;
    const td = Math.hypot(tx, tz);
    const arrivalSpeed = Math.min(maxSpeed, (td / 3.0) * spec.maxSpeedMps);
    const desired = {
      x: owner.velocity.x + (td > 1e-4 ? (tx / td) * arrivalSpeed : 0),
      y: 0,
      z: owner.velocity.z + (td > 1e-4 ? (tz / td) * arrivalSpeed : 0),
    };
    const steer: Vec3 = { x: desired.x - pet.velocity.x, y: 0, z: desired.z - pet.velocity.z };

    // 2. Boid separation / alignment / cohesion against all nearby companion pets
    let sepX = 0;
    let sepZ = 0;
    let alignX = 0;
    let alignZ = 0;
    let cohX = 0;
    let cohZ = 0;
    let neighbors = 0;
    for (const other of followPets) {
      if (other.petId === pet.petId) continue;
      const dx = pet.position.x - other.position.x;
      const dz = pet.position.z - other.position.z;
      const d = Math.hypot(dx, dz);
      if (d > PET_NEIGHBOR_RADIUS_M || Math.abs(pet.position.y - other.position.y) > 3.0) continue;
      neighbors += 1;
      alignX += other.velocity.x;
      alignZ += other.velocity.z;
      cohX += other.position.x;
      cohZ += other.position.z;
      if (d < PET_SEPARATION_RADIUS_M) {
        const inv = 1 / Math.max(0.15, d * d);
        sepX += dx * inv;
        sepZ += dz * inv;
      }
    }
    if (neighbors > 0) {
      steer.x += sepX * spec.maxSpeedMps * 1.6;
      steer.z += sepZ * spec.maxSpeedMps * 1.6;
      steer.x += (alignX / neighbors - pet.velocity.x) * 0.35;
      steer.z += (alignZ / neighbors - pet.velocity.z) * 0.35;
      steer.x += (cohX / neighbors - pet.position.x) * 0.2;
      steer.z += (cohZ / neighbors - pet.position.z) * 0.2;
    }

    // 3. Rapier3D raycast obstacle whiskers (center, +/-0.5 rad) along the desired heading
    const dMag = Math.hypot(desired.x, desired.z);
    if (dMag > 0.5) {
      const baseYaw = Math.atan2(desired.x, desired.z);
      const whiskerLen = 1.2 + dMag * 0.3;
      for (const off of [0, 0.5, -0.5]) {
        const a = baseYaw + off;
        const dir = { x: Math.sin(a), y: 0, z: Math.cos(a) };
        const hit = this.castStaticRay(
          { x: pet.position.x, y: pet.position.y + 0.5 + spec.hoverHeightM * 0.2, z: pet.position.z },
          dir,
          whiskerLen
        );
        if (hit) {
          const nh = Math.hypot(hit.normal.x, hit.normal.z) || 1;
          const strength = (1 - hit.toi / whiskerLen) * spec.maxAccelMps2 * 1.5;
          steer.x += (hit.normal.x / nh) * strength;
          steer.z += (hit.normal.z / nh) * strength;
        }
      }
    }

    this.applyHorizontalSteering(pet, steer, maxSpeed, dt);
    this.integrateVertical(pet, dt, spec.hoverHeightM > 0 ? owner.position.y + spec.hoverHeightM + 0.4 : null);
  }

  // -------------------------------------------------------------------------
  // Neon Pet Derby
  // -------------------------------------------------------------------------

  private stepDerbyRacer(pet: CyberPetEntity, owner: AgentPhysicsBody | undefined, racers: CyberPetEntity[], dt: number): void {
    const spec = CYBER_PET_SPECIES_SPECS[pet.species];
    const agilityLv = owner ? owner.attributes.agility : 1;
    const raceSpeed = spec.maxSpeedMps * (1 + 0.06 * (agilityLv - 1));

    if (pet.derbyStallTimer > 0) {
      pet.derbyStallTimer -= dt;
      pet.velocity.x *= 0.8;
      pet.velocity.z *= 0.8;
      this.integrateVertical(pet, dt, null);
      return;
    }

    const steer: Vec3 = { x: 0, y: 0, z: 0 };
    if (pet.derbyFinished) {
      steer.x = -pet.velocity.x * 3.0;
      steer.z = -pet.velocity.z * 3.0;
    } else {
      const target = DERBY_TRACK_NODES[pet.derbyNextNode]!;
      const tx = target.x - pet.position.x;
      const tz = target.z - pet.position.z;
      const td = Math.hypot(tx, tz);

      if (td < DERBY_NODE_PASS_RADIUS_M) {
        pet.derbyLastSafeNode = pet.derbyNextNode;
        if (pet.derbyNextNode === 0) {
          pet.derbyLap += 1;
          if (pet.derbyLap >= PET_DERBY_LAPS) {
            pet.derbyFinished = true;
            pet.derbyFinishTimeSec = this.derby.elapsedSec;
            this.derby.finishOrder.push(pet.petId);
            pet.derbyPlace = this.derby.finishOrder.length;
          }
        }
        pet.derbyNextNode = (pet.derbyNextNode + 1) % DERBY_NODE_COUNT;
      }

      const aim = DERBY_TRACK_NODES[pet.derbyNextNode]!;
      const after = DERBY_TRACK_NODES[(pet.derbyNextNode + 1) % DERBY_NODE_COUNT]!;
      const ad = Math.hypot(aim.x - pet.position.x, aim.z - pet.position.z);
      const blend = ad < 14 ? 0.35 * (1 - ad / 14) : 0;
      const gx = aim.x + (after.x - aim.x) * blend - pet.position.x;
      const gz = aim.z + (after.z - aim.z) * blend - pet.position.z;
      const gd = Math.hypot(gx, gz) || 1;
      steer.x = (gx / gd) * raceSpeed - pet.velocity.x;
      steer.z = (gz / gd) * raceSpeed - pet.velocity.z;

      // Lateral racer separation (boid avoidance between racing pets)
      for (const other of racers) {
        if (other.petId === pet.petId) continue;
        const dx = pet.position.x - other.position.x;
        const dz = pet.position.z - other.position.z;
        const d = Math.hypot(dx, dz);
        const minD = spec.bodyRadiusM + CYBER_PET_SPECIES_SPECS[other.species].bodyRadiusM + 0.8;
        if (d < minD && d > 1e-3) {
          const push = ((minD - d) / minD) * spec.maxAccelMps2 * 1.4;
          steer.x += (dx / d) * push;
          steer.z += (dz / d) * push;
        }
      }
    }

    this.applyHorizontalSteering(pet, steer, raceSpeed, dt);
    this.integrateVertical(pet, dt, null);

    if (pet.position.y < SKYBOX_ARENA_BASE_Y - PET_ARENA_FALL_RESET_DEPTH_M) {
      const safe = DERBY_TRACK_NODES[pet.derbyLastSafeNode]!;
      pet.position = { x: safe.x, y: safe.y + spec.hoverHeightM + 0.3, z: safe.z };
      pet.velocity = { x: 0, y: 0, z: 0 };
      pet.derbyStallTimer = 1.5;
    }
  }

  private stepDerby(agents: Map<number, AgentPhysicsBody>, dt: number): void {
    const d = this.derby;
    const racers = d.petIds.map((id) => this.pets.get(id)).filter((p): p is CyberPetEntity => !!p);

    if (d.state === PetArenaState.LOBBY) {
      if (racers.length === 0) return;
      for (const p of racers) {
        p.velocity.x = 0;
        p.velocity.z = 0;
        this.integrateVertical(p, dt, null);
      }
      d.timer -= dt;
      if (d.timer <= 0) {
        d.state = PetArenaState.COUNTDOWN;
        d.timer = PET_DERBY_COUNTDOWN_SEC;
        this.notifications.push({
          type: 'PET_DERBY_COUNTDOWN',
          participantEntityIds: racers.map((p) => p.ownerEntityId),
          message: `NEON PET DERBY: ${racers.length} racers on the grid — ${PET_DERBY_COUNTDOWN_SEC.toFixed(0)}s countdown!`,
        });
      }
      return;
    }

    if (d.state === PetArenaState.COUNTDOWN) {
      for (const p of racers) {
        p.velocity.x = 0;
        p.velocity.z = 0;
        this.integrateVertical(p, dt, null);
      }
      d.timer -= dt;
      if (d.timer <= 0) {
        d.state = PetArenaState.ACTIVE;
        d.elapsedSec = 0;
        d.finishOrder = [];
        d.winnerPetId = 0;
        this.notifications.push({
          type: 'PET_DERBY_STARTED',
          participantEntityIds: racers.map((p) => p.ownerEntityId),
          message: `NEON PET DERBY GREEN LIGHT! ${PET_DERBY_LAPS} laps across the skybox circuit.`,
        });
      }
      return;
    }

    if (d.state === PetArenaState.ACTIVE) {
      d.elapsedSec += dt;
      for (const p of racers) {
        this.stepDerbyRacer(p, agents.get(p.ownerEntityId), racers, dt);
      }
      const allDone = racers.length === 0 || racers.every((p) => p.derbyFinished);
      if (allDone || d.elapsedSec >= PET_DERBY_MAX_RACE_SEC) {
        // DNF racers are ranked by progress (laps, then node index, then distance to next node)
        const unfinished = racers
          .filter((p) => !p.derbyFinished)
          .sort((a, b) => {
            const pa = a.derbyLap * DERBY_NODE_COUNT + ((a.derbyNextNode + DERBY_NODE_COUNT - 1) % DERBY_NODE_COUNT);
            const pb = b.derbyLap * DERBY_NODE_COUNT + ((b.derbyNextNode + DERBY_NODE_COUNT - 1) % DERBY_NODE_COUNT);
            return pb - pa;
          });
        for (const p of unfinished) {
          d.finishOrder.push(p.petId);
          p.derbyPlace = d.finishOrder.length;
          p.derbyFinishTimeSec = d.elapsedSec;
        }
        d.winnerPetId = d.finishOrder[0] ?? 0;
        const winner = this.pets.get(d.winnerPetId);
        if (winner) {
          winner.derbyWins += 1;
          const wOwner = agents.get(winner.ownerEntityId);
          if (wOwner) wOwner.telemetry.petDerbyWins = (wOwner.telemetry.petDerbyWins || 0) + 1;
        }
        const placements = d.finishOrder
          .map((id) => this.pets.get(id))
          .filter((p): p is CyberPetEntity => !!p)
          .map((p) => ({ ownerEntityId: p.ownerEntityId, place: p.derbyPlace, timeSec: Number(p.derbyFinishTimeSec.toFixed(2)) }));
        this.notifications.push({
          type: 'PET_DERBY_FINISHED',
          winnerEntityId: winner?.ownerEntityId,
          placements,
          participantEntityIds: racers.map((p) => p.ownerEntityId),
          message: winner
            ? `NEON PET DERBY WON by "${winner.name}" in ${winner.derbyFinishTimeSec.toFixed(2)}s!`
            : 'NEON PET DERBY concluded with no finishers.',
        });
        d.state = PetArenaState.RESULTS;
        d.timer = PET_DERBY_RESULTS_SEC;
      }
      return;
    }

    // RESULTS
    for (const p of racers) {
      this.stepDerbyRacer(p, agents.get(p.ownerEntityId), racers, dt);
    }
    d.timer -= dt;
    if (d.timer <= 0) {
      for (const p of racers) {
        this.returnOwnerAndPet(agents.get(p.ownerEntityId), p);
      }
      d.petIds = [];
      d.finishOrder = [];
      d.state = PetArenaState.LOBBY;
      d.timer = 0;
      d.elapsedSec = 0;
    }
  }

  // -------------------------------------------------------------------------
  // Cyber-Pit Clash
  // -------------------------------------------------------------------------

  private stepClashFighter(pet: CyberPetEntity, owner: AgentPhysicsBody | undefined, fighters: CyberPetEntity[], dt: number, active: boolean): void {
    const spec = CYBER_PET_SPECIES_SPECS[pet.species];
    pet.clashAttackCooldown = Math.max(0, pet.clashAttackCooldown - dt);

    const steer: Vec3 = { x: 0, y: 0, z: 0 };
    if (active && !pet.clashEliminated) {
      let target: CyberPetEntity | null = null;
      let best = Infinity;
      for (const o of fighters) {
        if (o.petId === pet.petId || o.clashEliminated) continue;
        const d = Math.hypot(o.position.x - pet.position.x, o.position.z - pet.position.z);
        if (d < best) {
          best = d;
          target = o;
        }
      }
      if (target) {
        const tSpec = CYBER_PET_SPECIES_SPECS[target.species];
        const dx = target.position.x - pet.position.x;
        const dz = target.position.z - pet.position.z;
        const d = Math.hypot(dx, dz) || 1e-3;
        const reach = spec.bodyRadiusM + tSpec.bodyRadiusM + 0.45;
        if (d > reach) {
          if (pet.grounded || spec.hoverHeightM > 0) {
            steer.x = (dx / d) * spec.maxSpeedMps * 0.75 - pet.velocity.x;
            steer.z = (dz / d) * spec.maxSpeedMps * 0.75 - pet.velocity.z;
          }
        } else if (pet.clashAttackCooldown <= 0 && Math.abs(target.position.y - pet.position.y) < 2.5) {
          const strengthLv = owner ? owner.attributes.strength : 1;
          const dmg = spec.clashDamage * (1 + 0.08 * (strengthLv - 1));
          target.hp = Math.max(0, target.hp - dmg);
          // Escalating knockback: damaged fighters fly further; heavy fighters resist
          const damageRatio = 1 - target.hp / target.maxHp;
          const massRatio = Math.sqrt(spec.massKg / tSpec.massKg);
          const kb = spec.clashKnockbackMps * (1 + damageRatio * 1.6) * Math.min(1.8, Math.max(0.55, massRatio));
          target.velocity.x += (dx / d) * kb;
          target.velocity.z += (dz / d) * kb;
          target.velocity.y = Math.max(target.velocity.y, 3.5 + damageRatio * 3.0);
          target.grounded = false;
          pet.clashAttackCooldown = spec.clashAttackIntervalSec;
          if (target.hp <= 0) target.clashEliminated = true;
        }
      }
    }

    // Ground friction bleeds off knockback velocity
    if (pet.grounded) {
      const fr = Math.exp(-2.5 * dt);
      pet.velocity.x *= fr;
      pet.velocity.z *= fr;
    }
    this.applyHorizontalSteering(pet, steer, spec.maxSpeedMps * 2.4, dt);
    this.integrateVertical(pet, dt, null);

    if (!pet.clashEliminated && pet.position.y < SKYBOX_ARENA_BASE_Y - 6.0) {
      pet.clashEliminated = true; // Ring-out
    }
    if (pet.position.y < SKYBOX_ARENA_BASE_Y - PET_ARENA_FALL_RESET_DEPTH_M) {
      // Catch eliminated fighters on the spectator balcony instead of dropping them into the city
      pet.position = { x: CLASH_BALCONY_CENTER.x + (pet.petId % 8) - 4, y: CLASH_BALCONY_CENTER.y + 0.3, z: CLASH_BALCONY_CENTER.z };
      pet.velocity = { x: 0, y: 0, z: 0 };
    }
  }

  private stepClash(agents: Map<number, AgentPhysicsBody>, dt: number): void {
    const c = this.clash;
    const fighters = c.petIds.map((id) => this.pets.get(id)).filter((p): p is CyberPetEntity => !!p);

    if (c.state === PetArenaState.LOBBY) {
      if (fighters.length === 0) return;
      for (const p of fighters) this.stepClashFighter(p, agents.get(p.ownerEntityId), fighters, dt, false);
      c.timer -= dt;
      if (c.timer <= 0 && fighters.length >= 2) {
        c.state = PetArenaState.COUNTDOWN;
        c.timer = PET_CLASH_COUNTDOWN_SEC;
        this.notifications.push({
          type: 'PET_CLASH_COUNTDOWN',
          participantEntityIds: fighters.map((p) => p.ownerEntityId),
          message: `CYBER-PIT CLASH: ${fighters.length} fighters enter the skybox pit!`,
        });
      } else if (c.timer <= 0) {
        c.timer = PET_CLASH_LOBBY_SEC; // Need at least 2 fighters; keep the lobby open
      }
      return;
    }

    if (c.state === PetArenaState.COUNTDOWN) {
      for (const p of fighters) this.stepClashFighter(p, agents.get(p.ownerEntityId), fighters, dt, false);
      c.timer -= dt;
      if (c.timer <= 0) {
        c.state = PetArenaState.ACTIVE;
        c.elapsedSec = 0;
        c.winnerPetId = 0;
        c.finishOrder = [];
        this.notifications.push({
          type: 'PET_CLASH_STARTED',
          participantEntityIds: fighters.map((p) => p.ownerEntityId),
          message: 'CYBER-PIT CLASH — FIGHT!',
        });
      }
      return;
    }

    if (c.state === PetArenaState.ACTIVE) {
      c.elapsedSec += dt;
      for (const p of fighters) {
        const wasOut = p.clashEliminated;
        this.stepClashFighter(p, agents.get(p.ownerEntityId), fighters, dt, true);
        if (!wasOut && p.clashEliminated && !c.finishOrder.includes(p.petId)) c.finishOrder.push(p.petId);
      }
      // Fighters eliminated by an opponent's strike are recorded in elimination order as well
      for (const p of fighters) {
        if (p.clashEliminated && !c.finishOrder.includes(p.petId)) c.finishOrder.push(p.petId);
      }
      const alive = fighters.filter((p) => !p.clashEliminated);
      if (alive.length <= 1 || c.elapsedSec >= PET_CLASH_MAX_FIGHT_SEC) {
        const winner =
          alive.length === 1
            ? alive[0]!
            : alive.sort((a, b) => b.hp / b.maxHp - a.hp / a.maxHp)[0] ??
              this.pets.get(c.finishOrder[c.finishOrder.length - 1] ?? 0);
        c.winnerPetId = winner ? winner.petId : 0;
        if (winner) {
          winner.clashWins += 1;
          const wOwner = agents.get(winner.ownerEntityId);
          if (wOwner) wOwner.telemetry.petClashWins = (wOwner.telemetry.petClashWins || 0) + 1;
        }
        this.notifications.push({
          type: 'PET_CLASH_FINISHED',
          winnerEntityId: winner?.ownerEntityId,
          participantEntityIds: fighters.map((p) => p.ownerEntityId),
          message: winner
            ? `CYBER-PIT CLASH CHAMPION: "${winner.name}" (${Math.round(winner.hp)}/${winner.maxHp} HP) after ${c.elapsedSec.toFixed(1)}s!`
            : 'CYBER-PIT CLASH ended in a draw.',
        });
        c.state = PetArenaState.RESULTS;
        c.timer = PET_CLASH_RESULTS_SEC;
      }
      return;
    }

    for (const p of fighters) this.stepClashFighter(p, agents.get(p.ownerEntityId), fighters, dt, false);
    c.timer -= dt;
    if (c.timer <= 0) {
      for (const p of fighters) this.returnOwnerAndPet(agents.get(p.ownerEntityId), p);
      c.petIds = [];
      c.finishOrder = [];
      c.state = PetArenaState.LOBBY;
      c.timer = 0;
      c.elapsedSec = 0;
    }
  }

  // -------------------------------------------------------------------------
  // 60Hz step & binary export
  // -------------------------------------------------------------------------

  public step(agents: Map<number, AgentPhysicsBody>, dt: number = FIXED_TIMESTEP): void {
    // Orphaned pets (owner disconnected without explicit cleanup) are removed
    for (const pet of Array.from(this.pets.values())) {
      if (!agents.has(pet.ownerEntityId)) this.removePetForOwner(pet.ownerEntityId);
    }

    const followPets: CyberPetEntity[] = [];
    for (const pet of this.pets.values()) {
      if (pet.mode === PetMode.FOLLOW) followPets.push(pet);
    }
    for (const pet of followPets) {
      const owner = agents.get(pet.ownerEntityId);
      if (owner) this.stepFollowPet(pet, owner, followPets, dt);
    }

    this.stepDerby(agents, dt);
    this.stepClash(agents, dt);
  }

  public toBinaryPetStates(): CyberPetBinaryState[] {
    const out: CyberPetBinaryState[] = [];
    for (const p of this.pets.values()) {
      out.push({
        petId: p.petId,
        ownerEntityId: p.ownerEntityId,
        species: p.species,
        mode: p.mode,
        hpPct: Math.round((p.hp / p.maxHp) * 100),
        grounded: p.grounded,
        eliminated: p.clashEliminated,
        finished: p.derbyFinished,
        position: { ...p.position },
        yaw: p.yaw,
      });
    }
    return out;
  }

  public toBinaryArenaHeader(): PetArenaBinaryHeader {
    return {
      derbyState: this.derby.state,
      derbyTimerSec: this.derby.state === PetArenaState.ACTIVE ? this.derby.elapsedSec : Math.max(0, this.derby.timer),
      derbyWinnerPetId: this.derby.winnerPetId,
      derbyLaps: PET_DERBY_LAPS,
      clashState: this.clash.state,
      clashTimerSec: this.clash.state === PetArenaState.ACTIVE ? this.clash.elapsedSec : Math.max(0, this.clash.timer),
      clashWinnerPetId: this.clash.winnerPetId,
    };
  }

  public toBinaryDerbyRacers(): DerbyRacerBinaryState[] {
    const out: DerbyRacerBinaryState[] = [];
    for (const id of this.derby.petIds) {
      const p = this.pets.get(id);
      if (!p) continue;
      out.push({
        petId: p.petId,
        lap: p.derbyLap,
        nextNode: p.derbyNextNode,
        place: p.derbyPlace,
        finished: p.derbyFinished,
        finishTimeSec: p.derbyFinishTimeSec,
      });
    }
    return out;
  }

  public toBinaryClashFighters(): ClashFighterBinaryState[] {
    const out: ClashFighterBinaryState[] = [];
    for (const id of this.clash.petIds) {
      const p = this.pets.get(id);
      if (!p) continue;
      out.push({ petId: p.petId, hpPct: Math.round((p.hp / p.maxHp) * 100), eliminated: p.clashEliminated });
    }
    return out;
  }
}

