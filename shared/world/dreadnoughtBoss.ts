/** Narrative Act III: Director Vance's Apex Eclipse Dreadnought. */
import RAPIER from '@dimforge/rapier3d-compat';
import {
  DREADNOUGHT_BASE_ALTITUDE_M, DREADNOUGHT_ORBIT_CENTER, DREADNOUGHT_ORBIT_RADIUS_M,
  DREADNOUGHT_RESPAWN_SEC, DREADNOUGHT_WEAPON_RANGE_M, DreadnoughtPartId,
  DreadnoughtPhase, FIXED_TIMESTEP, WEAPON_BASE_DAMAGE,
} from '../constants.js';
import type { AgentPhysicsBody } from '../physics/characterController.js';
import { quatFromYaw, type DreadnoughtBinaryState, type Vec3 } from '../protocol/binaryProtocol.js';
import type { Phase6EventNotification } from './cyberPetArena.js';

export interface DreadnoughtPart {
  partId: DreadnoughtPartId;
  hp: number;
  maxHp: number;
  localPosition: Vec3;
  collider: RAPIER.Collider;
}

const PART_SPECS: Array<{ id: DreadnoughtPartId; hp: number; offset: Vec3; size: Vec3 }> = [
  { id: DreadnoughtPartId.CORE_REACTOR, hp: 1800, offset: { x: 0, y: -2, z: 0 }, size: { x: 5, y: 4, z: 7 } },
  { id: DreadnoughtPartId.ENGINE_FL, hp: 500, offset: { x: -13, y: 0, z: -12 }, size: { x: 3, y: 3, z: 5 } },
  { id: DreadnoughtPartId.ENGINE_FR, hp: 500, offset: { x: 13, y: 0, z: -12 }, size: { x: 3, y: 3, z: 5 } },
  { id: DreadnoughtPartId.ENGINE_RL, hp: 500, offset: { x: -13, y: 0, z: 12 }, size: { x: 3, y: 3, z: 5 } },
  { id: DreadnoughtPartId.ENGINE_RR, hp: 500, offset: { x: 13, y: 0, z: 12 }, size: { x: 3, y: 3, z: 5 } },
  { id: DreadnoughtPartId.FLAK_TURRET_PORT, hp: 350, offset: { x: -9, y: 4, z: 0 }, size: { x: 2, y: 2, z: 3 } },
  { id: DreadnoughtPartId.FLAK_TURRET_STARBOARD, hp: 350, offset: { x: 9, y: 4, z: 0 }, size: { x: 2, y: 2, z: 3 } },
];
const ENGINE_IDS = [DreadnoughtPartId.ENGINE_FL, DreadnoughtPartId.ENGINE_FR,
  DreadnoughtPartId.ENGINE_RL, DreadnoughtPartId.ENGINE_RR];
export { PART_SPECS as DREADNOUGHT_PART_SPECS };
const TURRET_IDS = [DreadnoughtPartId.FLAK_TURRET_PORT, DreadnoughtPartId.FLAK_TURRET_STARBOARD];

export class ApexDreadnoughtDirector {
  public phase = DreadnoughtPhase.DORMANT;
  public position: Vec3 = {
    x: DREADNOUGHT_ORBIT_CENTER.x + DREADNOUGHT_ORBIT_RADIUS_M,
    y: DREADNOUGHT_BASE_ALTITUDE_M, z: DREADNOUGHT_ORBIT_CENTER.z,
  };
  public yaw = Math.PI;
  public readonly parts = new Map<DreadnoughtPartId, DreadnoughtPart>();
  public readonly rigidBody: RAPIER.RigidBody;
  public lanceTarget: Vec3 = { ...this.position };
  public lanceChargeSec = 0;
  public lanceActiveSec = 0;
  public respawnTimerSec = 0;
  private orbitAngle = 0;
  private flakTimer = 3;
  private flakShotsRemaining = 0;
  private lanceCooldown = 2;
  private readonly participants = new Map<number, AgentPhysicsBody>();
  private readonly colliderParts = new Map<number, DreadnoughtPartId>();

  constructor(
    private readonly world: RAPIER.World,
    private readonly notifications: Phase6EventNotification[],
    private readonly deployAuditors: (position: Vec3) => void = () => {},
  ) {
    this.rigidBody = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    for (const spec of PART_SPECS) {
      const collider = world.createCollider(RAPIER.ColliderDesc.cuboid(spec.size.x, spec.size.y, spec.size.z)
        .setTranslation(spec.offset.x, spec.offset.y, spec.offset.z), this.rigidBody);
      collider.setEnabled(false);
      this.parts.set(spec.id, { partId: spec.id, hp: spec.hp, maxHp: spec.hp,
        localPosition: { ...spec.offset }, collider });
      this.colliderParts.set(collider.handle, spec.id);
    }
    this.syncTransform();
  }

  public get shielded(): boolean { return this.phase === DreadnoughtPhase.PHASE_1_SHIELDED; }
  public get active(): boolean {
    return this.phase >= DreadnoughtPhase.PHASE_1_SHIELDED && this.phase <= DreadnoughtPhase.PHASE_3_ENRAGED;
  }

  /** The world unlocks Act III after all four district loops; tests may deploy a raid explicitly. */
  public deploy(): boolean {
    if (this.phase !== DreadnoughtPhase.DORMANT) return false;
    this.phase = DreadnoughtPhase.PHASE_1_SHIELDED;
    this.participants.clear();
    this.orbitAngle = 0;
    this.position.y = DREADNOUGHT_BASE_ALTITUDE_M;
    this.flakTimer = 3;
    this.flakShotsRemaining = 0;
    this.lanceCooldown = 2;
    this.lanceChargeSec = this.lanceActiveSec = this.respawnTimerSec = 0;
    for (const part of this.parts.values()) { part.hp = part.maxHp; part.collider.setEnabled(true); }
    this.updateOrbit(0);
    this.notifications.push({ type: 'DREADNOUGHT_DEPLOYED', phase: this.phase,
      message: 'ACT III: Director Vance deployed the Apex Eclipse Dreadnought. Destroy all four engine nacelles!' });
    return true;
  }

  public getPartWorldPosition(partId: DreadnoughtPartId): Vec3 {
    const p = this.parts.get(partId)!.localPosition;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    return { x: this.position.x + p.x * c + p.z * s, y: this.position.y + p.y,
      z: this.position.z - p.x * s + p.z * c };
  }

  public damagePart(agent: AgentPhysicsBody, partId: DreadnoughtPartId, damage: number): number {
    const part = this.parts.get(partId);
    if (!this.active || agent.hp <= 0 || !part || part.hp <= 0 || !Number.isFinite(damage) || damage <= 0) return 0;
    if (partId === DreadnoughtPartId.CORE_REACTOR && this.shielded) return 0;
    const dealt = Math.min(part.hp, damage);
    part.hp -= dealt;
    this.participants.set(agent.entityId, agent);
    agent.telemetry.dreadnoughtDamageDealt = (agent.telemetry.dreadnoughtDamageDealt || 0) + dealt;
    if (part.hp === 0) {
      part.collider.setEnabled(false);
      this.notifications.push({ type: 'DREADNOUGHT_PART_DESTROYED', ownerEntityId: agent.entityId, partId,
        message: `Dreadnought part ${DreadnoughtPartId[partId]} destroyed.` });
    }
    if (partId === DreadnoughtPartId.CORE_REACTOR && part.hp === 0) {
      this.phase = DreadnoughtPhase.DEFEATED;
      this.respawnTimerSec = DREADNOUGHT_RESPAWN_SEC;
      this.lanceChargeSec = this.lanceActiveSec = 0;
      for (const p of this.parts.values()) p.collider.setEnabled(false);
      for (const participant of this.participants.values()) {
        participant.telemetry.dreadnoughtRaidsCompleted = (participant.telemetry.dreadnoughtRaidsCompleted || 0) + 1;
      }
      this.notifications.push({ type: 'DREADNOUGHT_DEFEATED', phase: this.phase,
        participantEntityIds: [...this.participants.keys()], message: 'Director Vance defeated. Protocol Eclipse neutralized!' });
    } else if (this.shielded && ENGINE_IDS.every((id) => this.parts.get(id)!.hp === 0)) {
      this.changePhase(DreadnoughtPhase.PHASE_2_CORE_EXPOSED);
      this.deployAuditors({ ...this.position });
    } else if (this.phase === DreadnoughtPhase.PHASE_2_CORE_EXPOSED &&
      this.parts.get(DreadnoughtPartId.CORE_REACTOR)!.hp < 1800 * 0.4) {
      this.changePhase(DreadnoughtPhase.PHASE_3_ENRAGED);
    }
    return dealt;
  }

  /** Returns true when the normal fire ray hits a boss part, including a shielded core. */
  public resolveWeaponShot(agent: AgentPhysicsBody, yaw: number, pitch: number): boolean {
    if (!this.active || agent.hp <= 0) return false;
    const origin = { x: agent.position.x, y: agent.position.y + 1.55, z: agent.position.z };
    const cp = Math.cos(pitch);
    const ray = new RAPIER.Ray(origin, { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp });
    // A single nearest-hit query respects cover, other parts, agents and enemy bone sensors.
    const hit = this.world.castRay(ray, DREADNOUGHT_WEAPON_RANGE_M, true, undefined, undefined, agent.collider);
    if (!hit) return false;
    const partId = this.colliderParts.get(hit.collider.handle);
    if (partId === undefined) return false;
    this.damagePart(agent, partId, WEAPON_BASE_DAMAGE * agent.buildModifiers.weaponDamageMultiplier);
    return true;
  }

  public removeAgent(entityId: number): void { this.participants.delete(entityId); }

  private changePhase(phase: DreadnoughtPhase): void {
    this.phase = phase;
    this.notifications.push({ type: 'DREADNOUGHT_PHASE_CHANGED', phase,
      message: phase === DreadnoughtPhase.PHASE_2_CORE_EXPOSED
        ? 'All engines destroyed! Core exposed; Aegis Auditors deploying.'
        : 'Dreadnought enraged! Evade the charged Eclipse Lance.' });
  }

  private syncTransform(): void {
    const q = quatFromYaw(this.yaw);
    this.rigidBody.setTranslation(this.position, true);
    this.rigidBody.setNextKinematicTranslation(this.position);
    this.rigidBody.setRotation(q, true);
    this.rigidBody.setNextKinematicRotation(q);
  }

  private updateOrbit(dt: number): void {
    this.orbitAngle = (this.orbitAngle + dt * (this.phase === DreadnoughtPhase.PHASE_3_ENRAGED ? 0.2 : 0.12)) % (Math.PI * 2);
    this.position.x = DREADNOUGHT_ORBIT_CENTER.x + Math.cos(this.orbitAngle) * DREADNOUGHT_ORBIT_RADIUS_M;
    this.position.z = DREADNOUGHT_ORBIT_CENTER.z + Math.sin(this.orbitAngle) * DREADNOUGHT_ORBIT_RADIUS_M;
    const altitude = this.shielded ? DREADNOUGHT_BASE_ALTITUDE_M : 110;
    this.position.y += Math.max(-12 * dt, Math.min(12 * dt, altitude - this.position.y));
    this.yaw = -this.orbitAngle + Math.PI;
    this.syncTransform();
  }

  private hasLineOfSight(origin: Vec3, target: Vec3): boolean {
    const dx = target.x - origin.x, dy = target.y - origin.y, dz = target.z - origin.z;
    const d = Math.hypot(dx, dy, dz);
    if (d < 0.01) return true;
    return !this.world.castRay(new RAPIER.Ray(origin, { x: dx / d, y: dy / d, z: dz / d }),
      d, true, RAPIER.QueryFilterFlags.ONLY_FIXED | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
  }

  private damageAgent(agent: AgentPhysicsBody, damage: number): void {
    if (agent.hp <= 0 || agent.spawnProtectionSec > 0) return;
    agent.hp = Math.max(0, agent.hp - damage);
    if (agent.hp === 0) {
      agent.telemetry.agentDowns = (agent.telemetry.agentDowns || 0) + 1;
      this.notifications.push({ type: 'AGENT_DOWNED', ownerEntityId: agent.entityId,
        message: `${agent.callsign} downed by the Dreadnought. Squad triage required.` });
    }
  }

  public step(agents: Map<number, AgentPhysicsBody>, dt = FIXED_TIMESTEP, actIIIUnlocked = false): void {
    if (this.phase === DreadnoughtPhase.DEFEATED) {
      this.respawnTimerSec = Math.max(0, this.respawnTimerSec - dt);
      if (this.respawnTimerSec === 0) this.phase = DreadnoughtPhase.DORMANT;
      return;
    }
    if (this.phase === DreadnoughtPhase.DORMANT) {
      if (actIIIUnlocked && agents.size > 0) this.deploy();
      return;
    }
    this.updateOrbit(dt);
    const targets = [...agents.values()].filter((a) => a.hp > 0 &&
      Math.hypot(a.position.x - this.position.x, a.position.y - this.position.y, a.position.z - this.position.z) <= DREADNOUGHT_WEAPON_RANGE_M);
    targets.sort((a, b) => Math.hypot(a.position.x - this.position.x, a.position.y - this.position.y, a.position.z - this.position.z) -
      Math.hypot(b.position.x - this.position.x, b.position.y - this.position.y, b.position.z - this.position.z) || a.entityId - b.entityId);
    this.flakTimer -= dt;
    if (this.flakTimer <= 0) {
      if (this.flakShotsRemaining === 0) this.flakShotsRemaining = 3;
      for (const id of TURRET_IDS) {
        const origin = this.getPartWorldPosition(id);
        const target = targets.find((a) => this.hasLineOfSight(origin, a.position));
        if (this.parts.get(id)!.hp > 0 && target) this.damageAgent(target, 12);
      }
      this.flakShotsRemaining--;
      this.flakTimer = this.flakShotsRemaining > 0 ? 0.2 : (this.phase === DreadnoughtPhase.PHASE_3_ENRAGED ? 2 : 3);
    }
    if (this.phase !== DreadnoughtPhase.PHASE_3_ENRAGED) return;
    if (this.lanceChargeSec > 0) {
      this.lanceChargeSec = Math.max(0, this.lanceChargeSec - dt);
      if (this.lanceChargeSec === 0) this.lanceActiveSec = 1.5;
    } else if (this.lanceActiveSec > 0) {
      this.lanceActiveSec = Math.max(0, this.lanceActiveSec - dt);
      // Sweep the locked beam across a 20m span; players can evade during its 1.5s telegraph.
      const sweep = Math.sin((1.5 - this.lanceActiveSec) / 1.5 * Math.PI * 2) * 10;
      const end = { x: this.lanceTarget.x + sweep, y: this.lanceTarget.y, z: this.lanceTarget.z };
      const dx = end.x - this.position.x, dy = end.y - this.position.y, dz = end.z - this.position.z;
      const lengthSq = dx * dx + dy * dy + dz * dz || 1;
      for (const a of targets) {
        const p = { x: a.position.x, y: a.position.y + 1, z: a.position.z };
        const t = Math.max(0, Math.min(1, ((p.x - this.position.x) * dx + (p.y - this.position.y) * dy + (p.z - this.position.z) * dz) / lengthSq));
        if (Math.hypot(p.x - this.position.x - t * dx, p.y - this.position.y - t * dy, p.z - this.position.z - t * dz) < 3 &&
          this.hasLineOfSight(this.position, p)) this.damageAgent(a, 100 * dt);
      }
      if (this.lanceActiveSec === 0) this.lanceCooldown = 4;
    } else {
      this.lanceCooldown -= dt;
      const target = targets.find((a) => this.hasLineOfSight(this.position, a.position));
      if (this.lanceCooldown <= 0 && target) {
        this.lanceTarget = { x: target.position.x, y: target.position.y + 1, z: target.position.z };
        this.lanceChargeSec = 1.5;
      }
    }
  }

  public toBinarySnapshot(): DreadnoughtBinaryState {
    return { phase: this.phase, shielded: this.shielded, position: { ...this.position }, yaw: this.yaw,
      parts: [...this.parts.values()].map((p) => ({ partId: p.partId, hp: p.hp, maxHp: p.maxHp, destroyed: p.hp === 0 })),
      lanceTarget: { ...this.lanceTarget }, lanceChargeSec: this.lanceChargeSec,
      lanceActiveSec: this.lanceActiveSec, respawnTimerSec: this.respawnTimerSec };
  }
}
