/**
 * CRACKUP: Protocol Eclipse (v2.0 True 3D AAA Architecture)
 * Phase 4: Raycast 4-Wheel Suspension Vehicles & Strength-Based 3D Dynamic Object Picking/Throwing
 * + Rapier3D intersectionsWithShape(Sphere) Explosive Blast Resolver (PRD Section 4.1)
 */

import { CombatEventResult, EnemyCombatManager, EnemyPhysicsEntity } from '../combat/enemyRigSystem.js';
import {
  DynamicPropType,
  EnemyCombatState,
  EnemyLimbId,
  getDrivingParams,
  getExplosivesParams,
  getStrengthParams,
  WEAPON_BASE_DAMAGE,
  INPUT_FLAG_JUMP,
  PROP_PICKUP_RANGE_M,
  VEHICLE_INTERACT_RANGE_M,
  VEHICLE_WALL_THRUSTER_IMPULSE_Y,
  VEHICLE_WHEEL_RADIUS_M,
  VEHICLE_WHEEL_REST_LENGTH_M,
  WORLD_GRAVITY,
} from '../constants.js';
import {
  DynamicPropBinarySnapshotState,
  Quat4,
  quatFromYaw,
  Vec3,
  VehicleBinarySnapshotState,
} from '../protocol/binaryProtocol.js';
import { AgentPhysicsBody, eulerToQuat, RAPIER } from './characterController.js';
import { MAX_VEHICLE_DEBRIS, VEHICLE_COLLISION_SHAPES, VEHICLE_DEBRIS_LIFETIME_SEC, VEHICLE_MAX_HP, VEHICLE_PANELS, VEHICLE_RESPAWN_SEC, VEHICLE_WHEEL_MOUNTS, VehiclePanelId, multiplyVehicleQuaternions, rotateVehicleVector } from '../vehicles/vehicleDefinition.js';
import type { VehicleDamagePacket, VehicleDamageState, VehicleDebrisState } from '../protocol/vehicleDamageProtocol.js';

export interface WheelSuspensionState {
  name: 'FL' | 'FR' | 'RL' | 'RR';
  localMountOffset: Vec3;
  grounded: boolean;
  currentLengthM: number;
  compressionRatio: number; // [0..1]
  contactNormal: Vec3;
  suspensionForce: number;
}

export interface VehiclePhysicsEntity {
  hp: number;
  maxHp: number;
  generation: number;
  detachedMask: number;
  destroyed: boolean;
  respawnSec: number;
  wheelAngle: number;
  braking: boolean;
  collisionDamageCooldown: number;
  spawnYaw: number;
  damageColliders: RAPIER.Collider[];
  vehicleId: number;
  name: string;
  isInterceptor: boolean; // True = Agency Interceptor (unlocks Wall-Thruster Hop at Driving Lv 4+)
  spawnPosition: Vec3;
  position: Vec3;
  velocity: Vec3;
  rotation: Quat4;
  yaw: number;
  pitch: number;
  roll: number;

  driverEntityId: number; // 0 = unoccupied
  steerAngleRad: number;
  forwardSpeedMps: number;
  chassisMassKg: number;
  wallThrusterActive: boolean;
  wallThrusterCooldown: number;

  halfExtents: Vec3;
  rigidBody: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  wheels: [
    WheelSuspensionState,
    WheelSuspensionState,
    WheelSuspensionState,
    WheelSuspensionState,
  ];
}

export interface DynamicPropEntity {
  propId: number;
  name: string;
  propType: DynamicPropType;
  massKg: number;
  isExplosive: boolean;
  halfExtents: Vec3;

  spawnPosition: Vec3;
  position: Vec3;
  velocity: Vec3;
  rotation: Quat4;
  yaw: number;

  holderEntityId: number;      // 0 = free in world, >0 = carried by Agent
  throwerEntityId: number;     // >0 while airborne as a hurled ballistic projectile
  isThrownProjectile: boolean;
  isDetonated: boolean;
  respawnTimer: number;

  rigidBody: RAPIER.RigidBody;
  collider: RAPIER.Collider;
}

export interface PropSpecsDefinition {
  name: string;
  massKg: number;
  isExplosive: boolean;
  halfExtents: Vec3;
}

export const DYNAMIC_PROP_SPECS: Record<DynamicPropType, PropSpecsDefinition> = {
  [DynamicPropType.CRYO_BARREL]: {
    name: 'Aegis Volatile Cryo-Barrel',
    massKg: 85, // Liftable at Strength Lv 1 (<= 150 kg)
    isExplosive: true,
    halfExtents: { x: 0.38, y: 0.55, z: 0.38 },
  },
  [DynamicPropType.STEEL_DUMPSTER]: {
    name: 'Industrial Steel Dumpster',
    massKg: 140, // Liftable at Strength Lv 1 (<= 150 kg)
    isExplosive: false,
    halfExtents: { x: 0.85, y: 0.60, z: 0.65 },
  },
  [DynamicPropType.CONCRETE_BARRIER]: {
    name: 'Reinforced Jersey Barrier',
    massKg: 850, // Liftable at Strength Lv 2+ (<= 1112.5 kg)
    isExplosive: false,
    halfExtents: { x: 1.25, y: 0.52, z: 0.42 },
  },
  [DynamicPropType.CARGO_CONTAINER]: {
    name: 'Armored Cargo Container Pod',
    massKg: 2000, // Liftable at Strength Lv 3+ (<= 2075 kg)
    isExplosive: false,
    halfExtents: { x: 1.45, y: 0.95, z: 1.85 },
  },
  [DynamicPropType.APC_WRECK]: {
    name: 'Syndicate Heavy APC Chassis',
    massKg: 3400, // Liftable at Strength Lv 5 (<= 4000 kg)
    isExplosive: true,
    halfExtents: { x: 1.35, y: 0.85, z: 2.40 },
  },
};

const WHEEL_MOUNTS = VEHICLE_WHEEL_MOUNTS;

export class VehicleAndPropManager {
  public authoritativeDamage = true;
  public readonly vehicleDebris = new Map<number, { body: RAPIER.RigidBody; state: Omit<VehicleDebrisState, 'position' | 'rotation' | 'velocity'> }>();
  private nextDebrisId = 1;
  private readonly mountedAgents = new Map<number, AgentPhysicsBody>();
  public releaseAgent(entityId: number): void {
    this.mountedAgents.delete(entityId);
    for (const vehicle of this.vehicles.values()) if (vehicle.driverEntityId === entityId) vehicle.driverEntityId = 0;
  }
  public applyVehicleDamageSnapshot(packet: VehicleDamagePacket): void {
    if (this.authoritativeDamage) return;
    for (const state of packet.vehicles) { const vehicle = this.vehicles.get(state.vehicleId); if (vehicle) Object.assign(vehicle, state); }
    const active = new Set(packet.debris.map(d => d.id));
    for (const [id, existing] of this.vehicleDebris) if (!active.has(id)) { this.world.removeRigidBody(existing.body); this.vehicleDebris.delete(id); }
    for (const state of packet.debris) {
      let existing = this.vehicleDebris.get(state.id);
      if (existing && existing.state.generation !== state.generation) { this.world.removeRigidBody(existing.body); this.vehicleDebris.delete(state.id); existing = undefined; }
      if (!existing) {
        const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(state.position.x, state.position.y, state.position.z).setRotation(state.rotation));
        const half = VEHICLE_PANELS[state.panelId].halfExtents;
        this.world.createCollider(RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z), body);
        existing = { body, state: { id: state.id, vehicleId: state.vehicleId, generation: state.generation, panelId: state.panelId, isInterceptor: state.isInterceptor, ageSec: state.ageSec } }; this.vehicleDebris.set(state.id, existing);
      }
      existing.body.setTranslation(state.position, true); existing.body.setNextKinematicTranslation(state.position);
      existing.body.setRotation(state.rotation, true); existing.body.setNextKinematicRotation(state.rotation); existing.state.ageSec = state.ageSec;
    }
  }
  public readonly vehicles: Map<number, VehiclePhysicsEntity> = new Map();
  public readonly props: Map<number, DynamicPropEntity> = new Map();
  public readonly colliderHandleToPropId: Map<number, number> = new Map();
  public readonly colliderHandleToVehicleId: Map<number, number> = new Map();
  public readonly extraExplosionHandlers: ((attacker: AgentPhysicsBody, origin: Vec3, yieldScale: number) => CombatEventResult[])[] = [];

  constructor(
    private readonly world: RAPIER.World,
    private readonly combatManager: EnemyCombatManager
  ) {
    this.combatManager.weaponObstacleProbes.set('vehicle', (agent, origin, direction, distance) => this.resolveVehicleWeaponShot(agent, origin, direction, distance));
    this.combatManager.extraSolidCollider = collider => this.colliderHandleToVehicleId.has(collider.handle);
  }

  public toVehicleDamagePacket(serverTick: number): VehicleDamagePacket {
    return { serverTick, vehicles: [...this.vehicles.values()].map(v => ({ vehicleId: v.vehicleId, generation: v.generation, hp: v.hp, maxHp: v.maxHp,
      detachedMask: v.detachedMask, destroyed: v.destroyed, braking: v.braking, respawnSec: v.respawnSec, wheelAngle: v.wheelAngle })),
      debris: [...this.vehicleDebris.values()].map(d => ({ ...d.state, position: { ...d.body.translation() }, rotation: { ...d.body.rotation() }, velocity: { ...d.body.linvel() } })) };
  }

  private removeVehicleDebris(vehicleId?: number): void {
    for (const [id, debris] of this.vehicleDebris) if (vehicleId === undefined || debris.state.vehicleId === vehicleId) {
      this.world.removeRigidBody(debris.body); this.vehicleDebris.delete(id);
    }
  }
  private ejectDriver(v: VehiclePhysicsEntity): void {
    const agent = this.mountedAgents.get(v.driverEntityId);
    if (agent) {
      agent.mountedVehicleId = 0; agent.lastDriveThrottle = agent.lastDriveSteer = agent.lastDriveButtons = 0;
      const offset = rotateVehicleVector({ x: -1.9, y: -0.4, z: 0 }, v.rotation);
      agent.position = { x: v.position.x + offset.x, y: Math.max(0, v.position.y + offset.y), z: v.position.z + offset.z };
      agent.velocity = { x: 0, y: 0, z: 0 }; agent.grounded = false;
      agent.rigidBody.setTranslation({ x: agent.position.x, y: agent.position.y + 0.95, z: agent.position.z }, true);
      agent.rigidBody.setNextKinematicTranslation({ x: agent.position.x, y: agent.position.y + 0.95, z: agent.position.z });
    }
    this.mountedAgents.delete(v.driverEntityId); v.driverEntityId = 0;
  }
  private detachPanel(v: VehiclePhysicsEntity, panelId: VehiclePanelId): void {
    if (v.detachedMask & (1 << panelId)) return;
    v.detachedMask |= 1 << panelId;
    if (this.vehicleDebris.size >= MAX_VEHICLE_DEBRIS) {
      const [id, old] = this.vehicleDebris.entries().next().value!; this.world.removeRigidBody(old.body); this.vehicleDebris.delete(id);
    }
    const panel = VEHICLE_PANELS[panelId], offset = rotateVehicleVector(panel.position, v.rotation);
    const rotation = multiplyVehicleQuaternions(v.rotation, panel.rotation);
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(v.position.x + offset.x, v.position.y + offset.y, v.position.z + offset.z).setRotation(rotation).setCcdEnabled(true).setLinearDamping(0.15).setAngularDamping(0.3));
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(panel.halfExtents.x, panel.halfExtents.y, panel.halfExtents.z).setMass(panel.massKg).setRestitution(0.25).setFriction(0.7), body);
    const outward = rotateVehicleVector({ x: panelId === VehiclePanelId.LEFT_DOOR ? -3 : panelId === VehiclePanelId.RIGHT_DOOR ? 3 : 0,
      y: panelId === VehiclePanelId.HOOD ? 5 : 3.5, z: panelId === VehiclePanelId.HOOD ? -2 : panelId === VehiclePanelId.TRUNK ? 2 : 0 }, v.rotation);
    body.setLinvel({ x: v.velocity.x + outward.x, y: v.velocity.y + outward.y, z: v.velocity.z + outward.z }, true);
    body.setAngvel({ x: 2.5 + panelId, y: panelId % 2 === 0 ? 3 : -3, z: panelId % 2 === 0 ? 2 : -2 }, true);
    const id = this.nextDebrisId; this.nextDebrisId = (this.nextDebrisId + 1) >>> 0 || 1;
    this.vehicleDebris.set(id, { body, state: { id, vehicleId: v.vehicleId, generation: v.generation, panelId, isInterceptor: v.isInterceptor, ageSec: 0 } });
  }

  public damageVehicle(vehicleId: number, amount: number, origin: Vec3, attackerEntityId = 0): CombatEventResult | null {
    const v = this.vehicles.get(vehicleId);
    if (!this.authoritativeDamage || !v || v.destroyed || !Number.isFinite(amount) || amount <= 0 || ![origin.x, origin.y, origin.z].every(Number.isFinite)) return null;
    const damage = Math.min(v.hp, amount), before = v.detachedMask; v.hp -= damage;
    if (v.hp < v.maxHp * 0.5) this.detachPanel(v, VehiclePanelId.HOOD);
    if (v.hp < v.maxHp * 0.25) for (const part of [VehiclePanelId.LEFT_DOOR, VehiclePanelId.RIGHT_DOOR, VehiclePanelId.TRUNK]) this.detachPanel(v, part);
    if (v.hp === 0) { v.destroyed = true; v.respawnSec = VEHICLE_RESPAWN_SEC; v.wallThrusterActive = false; this.ejectDriver(v); }
    return { type: 'VEHICLE_HIT', attackerEntityId, targetEnemyId: 0, targetVehicleId: vehicleId, vehicleHp: v.hp, detachedPanelMask: v.detachedMask ^ before,
      damageDealt: damage, armorStripped: 0, isCrit: false, limbCrippled: false, shockwaveTriggered: false, shockwaveHits: 0, impactPoint: { ...v.position } };
  }
  private resolveVehicleWeaponShot(agent: AgentPhysicsBody, origin: Vec3, direction: Vec3, maxDistance: number): { distance: number; resolve: () => CombatEventResult } | null {
    const hit = this.world.castRay(new RAPIER.Ray(origin, direction), maxDistance, true, undefined, undefined, agent.collider, undefined,
      c => { const id = this.colliderHandleToVehicleId.get(c.handle); return id !== undefined && id !== agent.mountedVehicleId; });
    if (!hit) return null;
    const vehicleId = this.colliderHandleToVehicleId.get(hit.collider.handle)!;
    const impact = { x: origin.x + direction.x * hit.timeOfImpact, y: origin.y + direction.y * hit.timeOfImpact, z: origin.z + direction.z * hit.timeOfImpact };
    return { distance: hit.timeOfImpact, resolve: () => {
      const event = this.damageVehicle(vehicleId, WEAPON_BASE_DAMAGE * agent.buildModifiers.weaponDamageMultiplier, impact, agent.entityId);
      if (event) event.impactPoint = impact;
      return event ??
      { type: 'VEHICLE_HIT', attackerEntityId: agent.entityId, targetEnemyId: 0, targetVehicleId: vehicleId, vehicleHp: this.vehicles.get(vehicleId)!.hp,
        damageDealt: 0, armorStripped: 0, isCrit: false, limbCrippled: false, shockwaveTriggered: false, shockwaveHits: 0, impactPoint: impact };
    } };
  }
  private resetVehicle(v: VehiclePhysicsEntity): void {
    this.ejectDriver(v); this.removeVehicleDebris(v.vehicleId); v.hp = v.maxHp; v.detachedMask = 0; v.destroyed = false; v.respawnSec = 0;
    v.generation = v.generation % 65535 + 1; v.position = { ...v.spawnPosition }; v.velocity = { x: 0, y: 0, z: 0 }; v.yaw = v.spawnYaw;
    v.pitch = v.roll = v.forwardSpeedMps = v.steerAngleRad = v.wheelAngle = v.collisionDamageCooldown = 0; v.braking = false; v.wallThrusterCooldown = 0;
    v.rotation = quatFromYaw(v.yaw); v.rigidBody.setTranslation(v.position, true); v.rigidBody.setNextKinematicTranslation(v.position);
    v.rigidBody.setRotation(v.rotation, true); v.rigidBody.setNextKinematicRotation(v.rotation);
  }

  public spawnDefaultVehiclesAndProps(): void {
    // 1. Spawn 4 Agency Interceptors & Syndicate Cruisers around Central Plaza & Districts
    const vehicleSpawns = [
      { id: 1, name: 'AGENCY-INTERCEPTOR-01', x: -8.5, y: 0.95, z: 6.5, isInterceptor: true, yaw: 0 },
      { id: 2, name: 'AGENCY-INTERCEPTOR-02', x: 8.5, y: 0.95, z: 6.5, isInterceptor: true, yaw: 0 },
      { id: 3, name: 'SYNDICATE-BRUISER-01', x: -24.0, y: 0.95, z: 18.0, isInterceptor: false, yaw: 0.4 },
      { id: 4, name: 'AGENCY-INTERCEPTOR-03', x: 24.0, y: 0.95, z: -18.0, isInterceptor: true, yaw: -0.4 },
    ];

    for (const v of vehicleSpawns) {
      this.spawnVehicle(v.id, v.name, { x: v.x, y: v.y, z: v.z }, v.isInterceptor, v.yaw);
    }

    // 2. Spawn 12 Dynamic 3D Physics Props across all 5 Mass Tiers (85 kg -> 3400 kg)
    const propSpawns: Array<{ id: number; type: DynamicPropType; x: number; y: number; z: number }> = [
      // Near Central Plaza Spawn for immediate Strength Lv 1..5 pickup & throw testing
      { id: 1, type: DynamicPropType.CRYO_BARREL, x: 3.2, y: 0.55, z: 3.5 },
      { id: 2, type: DynamicPropType.STEEL_DUMPSTER, x: -3.5, y: 0.60, z: 3.5 },
      { id: 3, type: DynamicPropType.CONCRETE_BARRIER, x: 5.5, y: 0.52, z: 5.5 },
      { id: 4, type: DynamicPropType.CARGO_CONTAINER, x: -6.0, y: 0.95, z: 12.0 },
      { id: 5, type: DynamicPropType.APC_WRECK, x: 6.5, y: 0.85, z: 12.5 },
      // Additional tactical props near enemy squads
      { id: 6, type: DynamicPropType.CRYO_BARREL, x: 5.5, y: 0.55, z: -3.5 },
      { id: 7, type: DynamicPropType.CRYO_BARREL, x: -5.5, y: 0.55, z: -3.5 },
      { id: 8, type: DynamicPropType.STEEL_DUMPSTER, x: 11.5, y: 0.60, z: -6.0 },
      { id: 9, type: DynamicPropType.CONCRETE_BARRIER, x: -11.5, y: 0.52, z: -6.0 },
      { id: 10, type: DynamicPropType.CRYO_BARREL, x: 16.5, y: 0.55, z: -19.5 },
      { id: 11, type: DynamicPropType.CARGO_CONTAINER, x: -18.0, y: 0.95, z: 24.0 },
      { id: 12, type: DynamicPropType.APC_WRECK, x: 22.0, y: 0.85, z: 24.0 },
    ];

    for (const p of propSpawns) {
      this.spawnDynamicProp(p.id, p.type, { x: p.x, y: p.y, z: p.z });
    }
  }

  public spawnVehicle(
    vehicleId: number,
    name: string,
    spawnPos: Vec3,
    isInterceptor: boolean,
    initialYaw = 0
  ): VehiclePhysicsEntity {
    const existing = this.vehicles.get(vehicleId);
    if (existing) {
      this.ejectDriver(existing); this.removeVehicleDebris(vehicleId);
      for (const collider of existing.damageColliders) this.colliderHandleToVehicleId.delete(collider.handle);
      this.world.removeRigidBody(existing.rigidBody);
      this.vehicles.delete(vehicleId);
    }

    const halfExtents: Vec3 = { x: 1.05, y: 0.52, z: 2.30 };
    const rot = quatFromYaw(initialYaw);
    const rbDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(spawnPos.x, spawnPos.y, spawnPos.z)
      .setRotation(rot);
    const rigidBody = this.world.createRigidBody(rbDesc);

    // Make vehicle chassis a sensor for swept character controller so players can approach smoothly,
    // while registering in colliderHandleToVehicleId for raycast/shape queries!
    const colDesc = RAPIER.ColliderDesc.cuboid(
      halfExtents.x,
      halfExtents.y,
      halfExtents.z
    ).setSensor(true);
    const collider = this.world.createCollider(colDesc, rigidBody);
    this.colliderHandleToVehicleId.set(collider.handle, vehicleId);
    const canopy = VEHICLE_COLLISION_SHAPES[1];
    const canopyCollider = this.world.createCollider(RAPIER.ColliderDesc.cuboid(canopy.halfExtents.x, canopy.halfExtents.y, canopy.halfExtents.z).setTranslation(canopy.position.x, canopy.position.y, canopy.position.z).setSensor(true), rigidBody);
    this.colliderHandleToVehicleId.set(canopyCollider.handle, vehicleId);

    const wheels = WHEEL_MOUNTS.map((m) => ({
      name: m.name,
      localMountOffset: { ...m.offset },
      grounded: true,
      currentLengthM: VEHICLE_WHEEL_REST_LENGTH_M * 0.75,
      compressionRatio: 0.25,
      contactNormal: { x: 0, y: 1, z: 0 },
      suspensionForce: 0,
    })) as [
      WheelSuspensionState,
      WheelSuspensionState,
      WheelSuspensionState,
      WheelSuspensionState,
    ];

    const vehicle: VehiclePhysicsEntity = {
      hp: VEHICLE_MAX_HP, maxHp: VEHICLE_MAX_HP, generation: existing ? existing.generation % 65535 + 1 : 1, detachedMask: 0, destroyed: false,
      respawnSec: 0, wheelAngle: 0, braking: false, collisionDamageCooldown: 0, spawnYaw: initialYaw,
      damageColliders: [collider, canopyCollider],
      vehicleId,
      name,
      isInterceptor,
      spawnPosition: { ...spawnPos },
      position: { ...spawnPos },
      velocity: { x: 0, y: 0, z: 0 },
      rotation: rot,
      yaw: initialYaw,
      pitch: 0,
      roll: 0,
      driverEntityId: 0,
      steerAngleRad: 0,
      forwardSpeedMps: 0,
      chassisMassKg: 1400,
      wallThrusterActive: false,
      wallThrusterCooldown: 0,
      halfExtents,
      rigidBody,
      collider,
      wheels,
    };

    this.vehicles.set(vehicleId, vehicle);
    return vehicle;
  }

  public spawnDynamicProp(
    propId: number,
    propType: DynamicPropType,
    spawnPos: Vec3
  ): DynamicPropEntity {
    const existing = this.props.get(propId);
    if (existing) {
      this.colliderHandleToPropId.delete(existing.collider.handle);
      this.world.removeRigidBody(existing.rigidBody);
      this.props.delete(propId);
    }

    const spec = DYNAMIC_PROP_SPECS[propType];
    const rbDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
      spawnPos.x,
      spawnPos.y,
      spawnPos.z
    );
    const rigidBody = this.world.createRigidBody(rbDesc);

    const colDesc = RAPIER.ColliderDesc.cuboid(
      spec.halfExtents.x,
      spec.halfExtents.y,
      spec.halfExtents.z
    ).setSensor(true);
    const collider = this.world.createCollider(colDesc, rigidBody);
    this.colliderHandleToPropId.set(collider.handle, propId);

    const prop: DynamicPropEntity = {
      propId,
      name: spec.name,
      propType,
      massKg: spec.massKg,
      isExplosive: spec.isExplosive,
      halfExtents: { ...spec.halfExtents },
      spawnPosition: { ...spawnPos },
      position: { ...spawnPos },
      velocity: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      yaw: 0,
      holderEntityId: 0,
      throwerEntityId: 0,
      isThrownProjectile: false,
      isDetonated: false,
      respawnTimer: 0,
      rigidBody,
      collider,
    };

    this.props.set(propId, prop);
    return prop;
  }

  /**
   * computes the effective maximum mass (kg) an Agent can lift and hurl based on Strength Level (150kg -> 4000kg)
   * plus Skill Tree & Prototype Relic modifiers.
   */
  public getEffectiveThrowMassLimitKg(agent: AgentPhysicsBody): number {
    const { throwMassLimitKg } = getStrengthParams(agent.attributes.strength);
    const mods = agent.buildModifiers;
    return throwMassLimitKg * mods.throwMassBonusMultiplier + mods.flatThrowMassBonusKg;
  }

  /**
   * Enters or exits the nearest 4-wheel suspension vehicle within 4.5m when pressing E
   */
  public toggleVehicleMount(agent: AgentPhysicsBody): VehiclePhysicsEntity | null {
    // If already driving a vehicle, dismount beside the left door
    if (agent.mountedVehicleId > 0) {
      const currentVeh = this.vehicles.get(agent.mountedVehicleId);
      agent.mountedVehicleId = 0;
      if (currentVeh) {
        this.mountedAgents.delete(agent.entityId);
        currentVeh.driverEntityId = 0;
        const cosY = Math.cos(currentVeh.yaw);
        const sinY = Math.sin(currentVeh.yaw);
        agent.position = {
          x: currentVeh.position.x - 1.9 * cosY,
          y: Math.max(0, currentVeh.position.y - 0.4),
          z: currentVeh.position.z + 1.9 * sinY,
        };
        agent.velocity = { ...currentVeh.velocity };
        return currentVeh;
      }
      return null;
    }

    // Find nearest unoccupied vehicle within VEHICLE_INTERACT_RANGE_M
    let nearest: VehiclePhysicsEntity | null = null;
    let bestDist = Infinity;
    for (const v of this.vehicles.values()) {
      if (v.destroyed) continue;
      if (v.driverEntityId !== 0) continue;
      const d = Math.hypot(
        v.position.x - agent.position.x,
        v.position.y - agent.position.y,
        v.position.z - agent.position.z
      );
      if (d <= VEHICLE_INTERACT_RANGE_M && d < bestDist) {
        bestDist = d;
        nearest = v;
      }
    }

    if (!nearest) return null;

    // Release any held prop before mounting
    if (agent.heldPropId > 0) {
      const prop = this.props.get(agent.heldPropId);
      if (prop) {
        prop.holderEntityId = 0;
      }
      agent.heldPropId = 0;
    }
    agent.grappleActive = false;

    nearest.driverEntityId = agent.entityId;
    this.mountedAgents.set(agent.entityId, agent);
    agent.mountedVehicleId = nearest.vehicleId;
    agent.position = {
      x: nearest.position.x,
      y: nearest.position.y - 0.35,
      z: nearest.position.z,
    };
    return nearest;
  }

  /**
   * Steps 4-Wheel Raycast Suspension Physics for all vehicles at 60Hz (PRD Section 4.1 #3 Driving)
   */
  public stepVehicles(
    agents: Map<number, AgentPhysicsBody>,
    dt: number,
    outCombatEvents: CombatEventResult[]
  ): void {
    const maxRayLength = VEHICLE_WHEEL_REST_LENGTH_M + VEHICLE_WHEEL_RADIUS_M;
    if (this.authoritativeDamage) for (const [id, d] of this.vehicleDebris) {
      d.state.ageSec += dt; if (d.state.ageSec >= VEHICLE_DEBRIS_LIFETIME_SEC) { this.world.removeRigidBody(d.body); this.vehicleDebris.delete(id); }
    }

    for (const v of this.vehicles.values()) {
      v.collisionDamageCooldown = Math.max(0, v.collisionDamageCooldown - dt);
      if (v.destroyed && this.authoritativeDamage) { v.respawnSec = Math.max(0, v.respawnSec - dt); if (v.respawnSec === 0) this.resetVehicle(v); }
      const driver = v.driverEntityId > 0 ? agents.get(v.driverEntityId) : undefined;
      if (v.driverEntityId > 0 && !driver && this.authoritativeDamage) {
        this.mountedAgents.delete(v.driverEntityId);
        v.driverEntityId = 0;
      }

      const drivingLv = driver ? driver.attributes.driving : 1;
      const drivingParams = getDrivingParams(drivingLv);
      const speedMult = driver ? driver.buildModifiers.vehicleTopSpeedMultiplier : 1.0;
      const topSpeedMps = drivingParams.topSpeedMps * speedMult;
      v.chassisMassKg = drivingParams.chassisMassKg;

      const minThrusterLevel = driver ? driver.buildModifiers.wallThrusterMinDrivingLevel : 4;
      const canWallThrusterHop = v.isInterceptor && drivingLv >= minThrusterLevel;

      if (v.wallThrusterCooldown > 0) {
        v.wallThrusterCooldown = Math.max(0, v.wallThrusterCooldown - dt);
      }
      v.wallThrusterActive = false;
      v.braking = v.destroyed || !!driver && (Math.abs(driver.lastDriveThrottle) < 0.01 && Math.abs(v.forwardSpeedMps) > 1 || driver.lastDriveThrottle * v.forwardSpeedMps < -0.1);

      // Forward (-Z at yaw=0) and Right (+X at yaw=0) unit vectors in world XZ plane
      const fwdX = -Math.sin(v.yaw);
      const fwdZ = -Math.cos(v.yaw);
      const rightX = Math.cos(v.yaw);
      const rightZ = -Math.sin(v.yaw);

      // 1. Cast 4 downward suspension rays from each wheel mount (FL, FR, RL, RR)
      let totalSuspensionForceY = 0;
      let groundedWheelCount = 0;
      let frontCompressionAvg = 0;
      let rearCompressionAvg = 0;
      let leftCompressionAvg = 0;
      let rightCompressionAvg = 0;

      for (let i = 0; i < 4; i++) {
        const w = v.wheels[i]!;
        const worldMountX =
          v.position.x + w.localMountOffset.x * rightX - w.localMountOffset.z * fwdX;
        const worldMountY = v.position.y + w.localMountOffset.y;
        const worldMountZ =
          v.position.z + w.localMountOffset.x * rightZ - w.localMountOffset.z * fwdZ;

        const ray = new RAPIER.Ray(
          { x: worldMountX, y: worldMountY, z: worldMountZ },
          { x: 0, y: -1, z: 0 }
        );

        const hit = this.world.castRayAndGetNormal(
          ray,
          maxRayLength,
          true,
          RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
          undefined,
          driver?.collider
        );

        if (hit !== null) {
          w.grounded = true;
          groundedWheelCount++;
          const distToGround = hit.timeOfImpact;
          const springLength = Math.max(0.08, distToGround - VEHICLE_WHEEL_RADIUS_M);
          const compression = Math.max(0, VEHICLE_WHEEL_REST_LENGTH_M - springLength);
          w.currentLengthM = springLength;
          w.compressionRatio = Math.min(1.0, compression / VEHICLE_WHEEL_REST_LENGTH_M);
          w.contactNormal = { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z };

          // Hooke's law spring stiffness + vertical velocity damping
          const springAccel = drivingParams.springStiffness * compression;
          const dampAccel = drivingParams.damping * v.velocity.y;
          const wheelForce = Math.max(0, springAccel - dampAccel);
          w.suspensionForce = wheelForce;
          totalSuspensionForceY += wheelForce;
        } else {
          w.grounded = false;
          w.currentLengthM = VEHICLE_WHEEL_REST_LENGTH_M;
          w.compressionRatio = 0;
          w.contactNormal = { x: 0, y: 1, z: 0 };
          w.suspensionForce = 0;
        }

        if (i < 2) frontCompressionAvg += w.compressionRatio * 0.5;
        else rearCompressionAvg += w.compressionRatio * 0.5;
        if (i % 2 === 0) leftCompressionAvg += w.compressionRatio * 0.5;
        else rightCompressionAvg += w.compressionRatio * 0.5;
      }

      // Compute subtle chassis pitch & roll from 4-wheel suspension compression differential
      v.pitch = (rearCompressionAvg - frontCompressionAvg) * 0.14;
      v.roll = (leftCompressionAvg - rightCompressionAvg) * 0.16;

      // 2. Integrate vertical suspension force vs gravity
      if (groundedWheelCount > 0) {
        v.velocity.y += (totalSuspensionForceY + WORLD_GRAVITY.y) * dt;
        // Clamp ride height smoothly above ground so chassis never bottoms out
        const minGroundClearanceY = 0.88;
        if (v.position.y < minGroundClearanceY && v.velocity.y < 0) {
          v.position.y = minGroundClearanceY;
          v.velocity.y = 0;
        }
        v.velocity.y *= 0.88;
      } else {
        v.velocity.y += WORLD_GRAVITY.y * dt;
      }

      // 3. Process Driver Throttle, Steering, Lateral Tire Friction & Wall-Thruster Hops
      if (driver) {
        const throttle = driver.lastDriveThrottle; // [-1..+1]
        const steerInput = driver.lastDriveSteer;  // [-1..+1]
        const jumpPressed = (driver.lastDriveButtons & INPUT_FLAG_JUMP) !== 0;

        v.steerAngleRad = -steerInput * 0.52;

        // Decompose current horizontal velocity into forward and lateral components
        const currentFwdSpeed = v.velocity.x * fwdX + v.velocity.z * fwdZ;
        const currentLatSpeed = v.velocity.x * rightX + v.velocity.z * rightZ;

        // Longitudinal acceleration scaled by Driving topSpeedMps
        const accelRate = 26.0 + drivingLv * 5.5;
        let nextFwdSpeed = currentFwdSpeed;
        if (Math.abs(throttle) > 1e-3) {
          nextFwdSpeed += throttle * accelRate * dt;
          nextFwdSpeed = Math.max(-topSpeedMps * 0.45, Math.min(topSpeedMps, nextFwdSpeed));
        } else {
          // Rolling resistance
          const decel = Math.min(Math.abs(nextFwdSpeed), 9.5 * dt);
          nextFwdSpeed -= Math.sign(nextFwdSpeed) * decel;
        }

        // Lateral tire friction cancels sideways slip (scales with drivingParams.lateralTireFriction)
        const latDecay = Math.exp(-drivingParams.lateralTireFriction * dt);
        const nextLatSpeed = currentLatSpeed * latDecay;

        // Steering yaw rate when moving
        if (Math.abs(nextFwdSpeed) > 0.35) {
          const speedFactor = Math.min(1.0, Math.abs(nextFwdSpeed) / 10.0);
          const turnDir = nextFwdSpeed >= 0 ? 1 : -1;
          v.yaw += v.steerAngleRad * 2.45 * speedFactor * turnDir * dt;
        }

        const newFwdX = -Math.sin(v.yaw);
        const newFwdZ = -Math.cos(v.yaw);
        const newRightX = Math.cos(v.yaw);
        const newRightZ = -Math.sin(v.yaw);

        v.velocity.x = newFwdX * nextFwdSpeed + newRightX * nextLatSpeed;
        v.velocity.z = newFwdZ * nextFwdSpeed + newRightZ * nextLatSpeed;
        v.forwardSpeedMps = nextFwdSpeed;

        // Agency Interceptor Vertical Wall-Thruster Hop (PRD Section 4.1 #3 Driving Lv 4+)
        if (canWallThrusterHop && jumpPressed && v.wallThrusterCooldown <= 0) {
          v.wallThrusterActive = true;
          v.wallThrusterCooldown = 0.55;
          v.velocity.y = VEHICLE_WALL_THRUSTER_IMPULSE_Y;

          // Check if facing a vertical skyscraper wall within 4.5m -> boost vertical wall-climb!
          const wallRay = new RAPIER.Ray(
            { x: v.position.x, y: v.position.y + 0.3, z: v.position.z },
            { x: newFwdX, y: 0, z: newFwdZ }
          );
          const wallHit = this.world.castRayAndGetNormal(
            wallRay,
            4.5,
            true,
            RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
            undefined,
            driver.collider
          );
          if (wallHit && Math.abs(wallHit.normal.y) < 0.3) {
            v.velocity.y = VEHICLE_WALL_THRUSTER_IMPULSE_Y * 1.45; // Wall-thruster vertical climb boost!
            v.pitch = 0.42;
          }
        }

        driver.telemetry.vehiclesDrivenSeconds =
          (driver.telemetry.vehiclesDrivenSeconds || 0) + dt;
      } else {
        // Unoccupied vehicle brakes to rest
        v.velocity.x *= Math.exp(-6.0 * dt);
        v.velocity.z *= Math.exp(-6.0 * dt);
        v.forwardSpeedMps = Math.hypot(v.velocity.x, v.velocity.z);
        v.steerAngleRad = 0;
      }

      // 4. Swept horizontal collision check against solid buildings before integrating position
      const horizSpeed = Math.hypot(v.velocity.x, v.velocity.z);
      if (horizSpeed > 0.05) {
        const moveDir = { x: v.velocity.x / horizSpeed, y: 0, z: v.velocity.z / horizSpeed };
        const bumperRay = new RAPIER.Ray(
          { x: v.position.x, y: v.position.y + 0.25, z: v.position.z },
          moveDir
        );
        const bumperHit = this.world.castRayAndGetNormal(
          bumperRay,
          v.halfExtents.z + horizSpeed * dt,
          true,
          RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
          undefined,
          driver?.collider
        );
        if (bumperHit && Math.abs(bumperHit.normal.y) < 0.35) {
          // Slide/bounce off vertical building wall
          const dot = v.velocity.x * bumperHit.normal.x + v.velocity.z * bumperHit.normal.z;
          if (dot < 0) {
            if (dot < -8 && v.collisionDamageCooldown === 0) {
              const event = this.damageVehicle(v.vehicleId, (-dot - 8) * 16, v.position, driver?.entityId ?? 0);
              if (event) outCombatEvents.push(event); v.collisionDamageCooldown = 0.6;
            }
            v.velocity.x -= 1.35 * dot * bumperHit.normal.x;
            v.velocity.z -= 1.35 * dot * bumperHit.normal.z;
            v.forwardSpeedMps *= 0.4;
          }
        }
      }

      v.position.x += v.velocity.x * dt;
      v.position.y = Math.max(0.88, v.position.y + v.velocity.y * dt);
      v.position.z += v.velocity.z * dt;
      v.rotation = eulerToQuat(v.pitch, v.yaw, v.roll);
      const signedSpeed = v.velocity.x * -Math.sin(v.yaw) + v.velocity.z * -Math.cos(v.yaw);
      v.wheelAngle = (v.wheelAngle + signedSpeed * dt / VEHICLE_WHEEL_RADIUS_M) % (Math.PI * 2);

      v.rigidBody.setTranslation(v.position, true);
      v.rigidBody.setNextKinematicTranslation(v.position);
      v.rigidBody.setRotation(v.rotation, true);
      v.rigidBody.setNextKinematicRotation(v.rotation);

      // Keep mounted driver synchronized to the vehicle's cockpit in 3D space
      if (driver && !v.destroyed && driver.mountedVehicleId === v.vehicleId) {
        driver.position = {
          x: v.position.x,
          y: v.position.y - 0.35,
          z: v.position.z,
        };
        driver.velocity = { ...v.velocity };
        driver.facingYaw = v.yaw;
        driver.rotation = quatFromYaw(v.yaw);
        driver.rigidBody.setTranslation(
          { x: driver.position.x, y: driver.position.y + 0.95, z: driver.position.z },
          true
        );
        driver.rigidBody.setNextKinematicTranslation({
          x: driver.position.x,
          y: driver.position.y + 0.95,
          z: driver.position.z,
        });

        // High-speed vehicle ramming against enemies (momentum = chassisMassKg * speed)
        if (horizSpeed > 6.5) {
          for (const enemy of this.combatManager.enemies.values()) {
            if (enemy.combatState === EnemyCombatState.DEAD) continue;
            const d = Math.hypot(
              enemy.position.x - v.position.x,
              enemy.position.y - (v.position.y - 0.8),
              enemy.position.z - v.position.z
            );
            if (d <= 2.75) {
              const ramMult = driver.buildModifiers.vehicleRamImpulseMultiplier;
              const ramDamage = Math.round(
                (v.chassisMassKg / 1400) * horizSpeed * 4.5 * ramMult
              );
              const ev = this.combatManager.applyLimbDamage(
                driver,
                enemy,
                EnemyLimbId.TORSO,
                ramDamage
              );
              // Knock enemy away along vehicle velocity vector
              enemy.position.x += (v.velocity.x / horizSpeed) * 3.5;
              enemy.position.z += (v.velocity.z / horizSpeed) * 3.5;
              this.combatManager.syncEnemyBoneColliders(enemy);
              outCombatEvents.push(ev);
            }
          }
        }
      }
    }
  }

  /**
   * Strength-Based 3D Dynamic Object Pick Up or Hurl (PRD Section 4.1 #2 Strength)
   */
  public tryPickupOrThrowProp(
    agent: AgentPhysicsBody,
    aimYaw: number,
    aimPitch: number
  ): { action: 'PICKED_UP' | 'THROWN' | 'TOO_HEAVY' | 'NONE'; prop?: DynamicPropEntity; requiredMassKg?: number } {
    // 1. If already holding a 3D prop -> Hurl it along the 3D aim vector with calculated impulse!
    if (agent.heldPropId > 0) {
      const held = this.props.get(agent.heldPropId);
      agent.heldPropId = 0;
      if (!held) {
        return { action: 'NONE' };
      }

      const cosP = Math.cos(aimPitch);
      const dirX = -Math.sin(aimYaw) * cosP;
      const dirY = Math.max(0.12, Math.sin(aimPitch) + 0.18);
      const dirZ = -Math.cos(aimYaw) * cosP;
      const len = Math.hypot(dirX, dirY, dirZ) || 1;

      const strengthLv = agent.attributes.strength;
      const launchSpeed =
        (22.0 + strengthLv * 4.5) * agent.buildModifiers.throwVelocityMultiplier;

      held.holderEntityId = 0;
      held.throwerEntityId = agent.entityId;
      held.isThrownProjectile = true;
      held.position = {
        x: agent.position.x + (dirX / len) * 1.1,
        y: agent.position.y + 1.85,
        z: agent.position.z + (dirZ / len) * 1.1,
      };
      held.velocity = {
        x: (dirX / len) * launchSpeed,
        y: (dirY / len) * launchSpeed,
        z: (dirZ / len) * launchSpeed,
      };
      held.rigidBody.setTranslation(held.position, true);
      held.rigidBody.setNextKinematicTranslation(held.position);

      agent.telemetry.propsThrown = (agent.telemetry.propsThrown || 0) + 1;
      return { action: 'THROWN', prop: held };
    }

    // 2. Otherwise search for nearest free dynamic prop within PROP_PICKUP_RANGE_M (4.0m)
    const maxLiftMassKg = this.getEffectiveThrowMassLimitKg(agent);
    let nearestLiftable: DynamicPropEntity | null = null;
    let nearestLiftableDist = Infinity;
    let nearestTooHeavy: DynamicPropEntity | null = null;
    let nearestTooHeavyDist = Infinity;

    for (const p of this.props.values()) {
      if (p.holderEntityId !== 0 || p.isDetonated) continue;
      const d = Math.hypot(
        p.position.x - agent.position.x,
        p.position.y - (agent.position.y + 0.8),
        p.position.z - agent.position.z
      );
      if (d <= PROP_PICKUP_RANGE_M) {
        if (p.massKg <= maxLiftMassKg) {
          if (d < nearestLiftableDist) {
            nearestLiftableDist = d;
            nearestLiftable = p;
          }
        } else if (d < nearestTooHeavyDist) {
          nearestTooHeavyDist = d;
          nearestTooHeavy = p;
        }
      }
    }

    if (nearestLiftable) {
      nearestLiftable.holderEntityId = agent.entityId;
      nearestLiftable.throwerEntityId = 0;
      nearestLiftable.isThrownProjectile = false;
      nearestLiftable.velocity = { x: 0, y: 0, z: 0 };
      agent.heldPropId = nearestLiftable.propId;
      this.syncHeldPropTransform(agent, nearestLiftable);
      return { action: 'PICKED_UP', prop: nearestLiftable };
    }

    if (nearestTooHeavy) {
      return {
        action: 'TOO_HEAVY',
        prop: nearestTooHeavy,
        requiredMassKg: nearestTooHeavy.massKg,
      };
    }

    return { action: 'NONE' };
  }

  public syncHeldPropTransform(agent: AgentPhysicsBody, prop: DynamicPropEntity): void {
    const fwdX = -Math.sin(agent.facingYaw);
    const fwdZ = -Math.cos(agent.facingYaw);
    prop.position = {
      x: agent.position.x + fwdX * 0.45,
      y: agent.position.y + 2.25 + prop.halfExtents.y * 0.4,
      z: agent.position.z + fwdZ * 0.45,
    };
    prop.yaw = agent.facingYaw;
    prop.rotation = quatFromYaw(prop.yaw);
    prop.rigidBody.setTranslation(prop.position, true);
    prop.rigidBody.setNextKinematicTranslation(prop.position);
    prop.rigidBody.setRotation(prop.rotation, true);
    prop.rigidBody.setNextKinematicRotation(prop.rotation);
  }

  /**
   * Steps all Dynamic 3D Physics Props (held overhead, airborne hurled projectiles, and explosive blasts)
   */
  public stepDynamicProps(
    agents: Map<number, AgentPhysicsBody>,
    dt: number,
    outCombatEvents: CombatEventResult[]
  ): void {
    for (const p of this.props.values()) {
      // Handle detonated prop respawn
      if (p.isDetonated) {
        p.respawnTimer -= dt;
        if (p.respawnTimer <= 0) {
          p.isDetonated = false;
          p.isThrownProjectile = false;
          p.holderEntityId = 0;
          p.throwerEntityId = 0;
          p.position = { ...p.spawnPosition };
          p.velocity = { x: 0, y: 0, z: 0 };
          p.rigidBody.setTranslation(p.position, true);
          p.rigidBody.setNextKinematicTranslation(p.position);
        }
        continue;
      }

      // If carried by an Agent, keep locked above Agent's shoulders
      if (p.holderEntityId > 0) {
        const holder = agents.get(p.holderEntityId);
        if (!holder || holder.heldPropId !== p.propId) {
          p.holderEntityId = 0;
        } else {
          this.syncHeldPropTransform(holder, p);
          continue;
        }
      }

      // Step free / hurled ballistic 3D prop physics
      const speed = Math.hypot(p.velocity.x, p.velocity.y, p.velocity.z);
      if (!p.isThrownProjectile && speed < 0.05 && p.position.y <= p.halfExtents.y + 0.02) {
        p.position.y = p.halfExtents.y;
        p.velocity = { x: 0, y: 0, z: 0 };
        continue;
      }

      p.velocity.y += WORLD_GRAVITY.y * dt;
      const nextX = p.position.x + p.velocity.x * dt;
      const nextY = p.position.y + p.velocity.y * dt;
      const nextZ = p.position.z + p.velocity.z * dt;

      const thrower = p.throwerEntityId > 0 ? agents.get(p.throwerEntityId) : undefined;
      let hitSolidOrGround = false;
      let hitEnemy: EnemyPhysicsEntity | null = null;
      let hitVehicleId: number | null = null;
      if (p.isThrownProjectile && thrower && speed > 0.2) {
        const length = Math.hypot(nextX - p.position.x, nextY - p.position.y, nextZ - p.position.z);
        const direction = { x: (nextX - p.position.x) / length, y: (nextY - p.position.y) / length, z: (nextZ - p.position.z) / length };
        const ray = new RAPIER.Ray(p.position, direction);
        const hit = this.world.castRay(ray, length + Math.max(p.halfExtents.x, p.halfExtents.y, p.halfExtents.z), true, undefined, undefined, undefined, undefined, c => this.colliderHandleToVehicleId.has(c.handle));
        if (hit && !this.world.castRay(ray, hit.timeOfImpact, true, RAPIER.QueryFilterFlags.ONLY_FIXED | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS)) hitVehicleId = this.colliderHandleToVehicleId.get(hit.collider.handle)!;
      }

      // 1. Check direct 3D collision with any Enemy while hurled
      if (p.isThrownProjectile && hitVehicleId === null) {
        for (const enemy of this.combatManager.enemies.values()) {
          if (enemy.combatState === EnemyCombatState.DEAD) continue;
          const d = Math.hypot(
            enemy.position.x - nextX,
            enemy.position.y + 1.0 - nextY,
            enemy.position.z - nextZ
          );
          const hitRadius = Math.max(p.halfExtents.x, p.halfExtents.z) + 0.65;
          if (d <= hitRadius) {
            hitEnemy = enemy;
            break;
          }
        }
      }

      // 2. Check swept ray against solid world geometry or ground plane
      if (!hitEnemy && speed > 0.2) {
        const dir = { x: p.velocity.x / speed, y: p.velocity.y / speed, z: p.velocity.z / speed };
        const ray = new RAPIER.Ray(p.position, dir);
        const envHit = this.world.castRay(
          ray,
          speed * dt + p.halfExtents.y,
          true,
          RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
          undefined,
          thrower?.collider
        );
        if (envHit !== null || nextY <= p.halfExtents.y) {
          hitSolidOrGround = true;
        }
      } else if (nextY <= p.halfExtents.y) {
        hitSolidOrGround = true;
      }

      p.position.x = nextX;
      p.position.y = Math.max(p.halfExtents.y, nextY);
      p.position.z = nextZ;
      p.yaw += 1.8 * dt;
      p.rotation = quatFromYaw(p.yaw);
      p.rigidBody.setTranslation(p.position, true);
      p.rigidBody.setNextKinematicTranslation(p.position);
      p.rigidBody.setRotation(p.rotation, true);
      p.rigidBody.setNextKinematicRotation(p.rotation);

      // 3. Resolve Kinetic Crush & Explosive Blast on Impact!
      if (p.isThrownProjectile && (hitEnemy || hitVehicleId !== null || hitSolidOrGround)) {
        p.isThrownProjectile = false;
        if (hitVehicleId !== null && thrower) {
          const event = this.damageVehicle(hitVehicleId, Math.round(55 + p.massKg * 0.085 + speed * 1.5), p.position, thrower.entityId);
          if (event) outCombatEvents.push(event);
        }

        if (hitEnemy && thrower) {
          // Kinetic impact damage scales with thrown prop mass (85kg..3400kg) & speed
          const kineticDmg = Math.round(55 + p.massKg * 0.085 + speed * 1.5);
          const ev = this.combatManager.applyLimbDamage(
            thrower,
            hitEnemy,
            EnemyLimbId.TORSO,
            kineticDmg,
            true
          );
          outCombatEvents.push(ev);
        }

        const shouldDetonate =
          p.isExplosive || (thrower ? thrower.buildModifiers.thrownPropConcussiveBlast : false);

        if (shouldDetonate && thrower) {
          const blastEvents = this.triggerSphericalExplosion(
            thrower,
            p.position,
            p.isExplosive ? 1.0 : 0.65
          );
          outCombatEvents.push(...blastEvents);
          p.isDetonated = true;
          p.respawnTimer = 8.0;
          p.velocity = { x: 0, y: 0, z: 0 };
        } else {
          // Non-explosive heavy prop settles on the ground
          p.velocity.x *= 0.25;
          p.velocity.z *= 0.25;
          p.velocity.y = 0;
          p.position.y = p.halfExtents.y;
          p.rigidBody.setTranslation(p.position, true);
          p.rigidBody.setNextKinematicTranslation(p.position);
        }
      }
    }
  }

  /**
   * PRD Section 4.1 (#5 Explosives):
   * Server queries Rapier3D `intersectionsWithShape(Sphere(radius))`, applying inverse-square
   * damage falloff and 3D radial ragdoll/rigidbody impulse vectors!
   */
  public triggerSphericalExplosion(
    attacker: AgentPhysicsBody,
    blastOrigin: Vec3,
    yieldScale = 1.0
  ): CombatEventResult[] {
    const expParams = getExplosivesParams(attacker.attributes.explosives);
    const mods = attacker.buildModifiers;
    const blastRadius = expParams.blastRadiusMeters * mods.blastRadiusMultiplier * yieldScale;
    const maxImpulseNs = expParams.impulseNs * mods.blastImpulseMultiplier * yieldScale;
    const baseBlastDamage = (110 + attacker.attributes.explosives * 32) * yieldScale;

    const sphereShape = new RAPIER.Ball(blastRadius);
    const shapeRot = { x: 0, y: 0, z: 0, w: 1 };
    const hitEnemyIds = new Set<number>();
    const hitPropIds = new Set<number>();
    const hitVehicleIds = new Set<number>();

    // Query Rapier3D 3D spatial broadphase/narrowphase with a true 3D Sphere shape!
    this.world.intersectionsWithShape(blastOrigin, shapeRot, sphereShape, (collider) => {
      const limbMatch = this.combatManager.colliderHandleToLimb.get(collider.handle);
      if (limbMatch) {
        hitEnemyIds.add(limbMatch.enemyId);
      }
      const propId = this.colliderHandleToPropId.get(collider.handle);
      const vehicleId = this.colliderHandleToVehicleId.get(collider.handle); if (vehicleId !== undefined) hitVehicleIds.add(vehicleId);
      if (propId !== undefined) {
        hitPropIds.add(propId);
      }
      return true;
    });

    const events: CombatEventResult[] = [];
    for (const id of hitVehicleIds) {
      const vehicle = this.vehicles.get(id)!;
      const direction = { x: vehicle.position.x - blastOrigin.x, y: vehicle.position.y - blastOrigin.y, z: vehicle.position.z - blastOrigin.z };
      const distance = Math.hypot(direction.x, direction.y, direction.z);
      if (distance > 0.01 && this.world.castRay(new RAPIER.Ray(blastOrigin, { x: direction.x / distance, y: direction.y / distance, z: direction.z / distance }), distance, true, RAPIER.QueryFilterFlags.ONLY_FIXED | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS)) continue;
      const falloff = 1 / (1 + (distance / Math.max(1, blastRadius * 0.55)) ** 2);
      const event = this.damageVehicle(id, Math.max(18, Math.round(baseBlastDamage * falloff)), blastOrigin, attacker.entityId);
      if (event) { event.shockwaveTriggered = true; event.shockwaveHits = hitVehicleIds.size; events.push(event); }
    }

    // Apply inverse-square damage falloff & 3D radial impulse vectors to intersected enemies
    for (const enemyId of hitEnemyIds) {
      const enemy = this.combatManager.enemies.get(enemyId);
      if (!enemy || enemy.combatState === EnemyCombatState.DEAD) continue;

      const dx = enemy.position.x - blastOrigin.x;
      const dy = enemy.position.y + 0.9 - blastOrigin.y;
      const dz = enemy.position.z - blastOrigin.z;
      const dist = Math.hypot(dx, dy, dz);

      // Inverse-square falloff: 1 / (1 + (d / (0.5 * R))^2)
      const normDist = dist / Math.max(1.0, blastRadius * 0.55);
      const inverseSquareFalloff = 1.0 / (1.0 + normDist * normDist);
      const damage = Math.max(18, Math.round(baseBlastDamage * inverseSquareFalloff));

      const ev = this.combatManager.applyLimbDamage(
        attacker,
        enemy,
        EnemyLimbId.TORSO,
        damage,
        true
      );
      ev.shockwaveTriggered = true;
      ev.shockwaveHits = hitEnemyIds.size;

      // Apply 3D radial impulse vector scaled by maxImpulseNs and inverseSquareFalloff
      const invLen = 1.0 / (dist || 1.0);
      const radialImpulse = (maxImpulseNs / 18.0) * inverseSquareFalloff;
      this.combatManager.reactToHit(enemy, blastOrigin, true);
      enemy.combatState =
        enemy.hp <= 0 ? EnemyCombatState.DEAD : EnemyCombatState.STAGGER_BLIND;
      enemy.staggerTimer = Math.max(enemy.staggerTimer, 3.0);
      this.combatManager.syncEnemyBoneColliders(enemy);

      events.push(ev);
    }

    // Apply 3D radial impulse vectors to nearby dynamic physics props inside the blast sphere
    for (const propId of hitPropIds) {
      const prop = this.props.get(propId);
      if (!prop || prop.isDetonated || prop.holderEntityId !== 0) continue;
      const dx = prop.position.x - blastOrigin.x;
      const dy = prop.position.y - blastOrigin.y;
      const dz = prop.position.z - blastOrigin.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist < 0.1) continue;

      const normDist = dist / Math.max(1.0, blastRadius * 0.55);
      const inverseSquareFalloff = 1.0 / (1.0 + normDist * normDist);
      const massScale = Math.max(0.15, 250 / (prop.massKg + 150));
      const impulseSpeed = maxImpulseNs * 0.45 * inverseSquareFalloff * massScale;

      prop.velocity.x += (dx / dist) * impulseSpeed;
      prop.velocity.y += Math.max(3.5, (dy / dist) * impulseSpeed + 5.0 * inverseSquareFalloff);
      prop.velocity.z += (dz / dist) * impulseSpeed;
    }

    for (const handler of this.extraExplosionHandlers) events.push(...handler(attacker, blastOrigin, yieldScale));
    return events;
  }

  public toBinaryVehicleSnapshots(): VehicleBinarySnapshotState[] {
    const out: VehicleBinarySnapshotState[] = [];
    for (const v of this.vehicles.values()) {
      let wheelGroundedMask = 0;
      const wheelCompressionRatio: [number, number, number, number] = [0, 0, 0, 0];
      for (let i = 0; i < 4; i++) {
        if (v.wheels[i]!.grounded) wheelGroundedMask |= 1 << i;
        wheelCompressionRatio[i] = v.wheels[i]!.compressionRatio;
      }

      out.push({
        vehicleId: v.vehicleId,
        driverEntityId: v.driverEntityId,
        isInterceptor: v.isInterceptor,
        wallThrusterActive: v.wallThrusterActive,
        wheelGroundedMask,
        position: { ...v.position },
        rotation: { ...v.rotation },
        speedMps: v.forwardSpeedMps,
        steerAngleRad: v.steerAngleRad,
        wheelCompressionRatio,
      });
    }
    return out;
  }

  public toBinaryPropSnapshots(): DynamicPropBinarySnapshotState[] {
    const out: DynamicPropBinarySnapshotState[] = [];
    for (const p of this.props.values()) {
      out.push({
        propId: p.propId,
        holderEntityId: p.holderEntityId,
        propType: p.propType,
        isThrownProjectile: p.isThrownProjectile,
        isDetonated: p.isDetonated,
        massKg: p.massKg,
        position: { ...p.position },
        rotation: { ...p.rotation },
      });
    }
    return out;
  }
}

