import RAPIER from '@dimforge/rapier3d-compat';
import { AugmentChassisId, DistrictId, EnemyCombatState, EnemyLimbId, FactionId, INPUT_FLAG_AIM, INPUT_FLAG_FIRE, INPUT_FLAG_MELEE, WEAPON_BASE_DAMAGE } from '../constants.js';
import { ARCHITECTURE_PLACEMENTS, DESTRUCTIBLE_ARCHITECTURE_SPECS as RULES, SAFE_HOUSE_REGISTRY, TIER2_DISTRICTS, VERTICAL_HAZARD_SPECS, type ArchitectureSpec } from '../content/worldSystemsRegistry.js';
import { AirspaceController } from '../physics/airspaceController.js';
import type { AgentPhysicsBody } from '../physics/characterController.js';
import type { VehicleAndPropManager } from '../physics/vehicleAndPropSystem.js';
import type { CombatEventResult, EnemyCombatManager } from '../combat/enemyRigSystem.js';
import type { ClientInputPacket, Quat4, Vec3 } from '../protocol/binaryProtocol.js';
import { computeAgentBuildModifiers } from '../progression/skillTreeSystem.js';
import type { Tier2Snapshot } from '../protocol/tier2Protocol.js';
import { EffectKind, effectSpec } from '../protocol/presentationProtocol.js';
import { SkirmishSystem, type SkirmishState } from './skirmishSystem.js';
export type { SkirmishState } from './skirmishSystem.js';

const identity = { x: 0, y: 0, z: 0, w: 1 };
const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export interface ArchitectureState { id: number; hp: number; broken: boolean; impacted: boolean; ageSec: number; generation: number; position: Vec3; rotation: Quat4 }
interface ArchitectureEntity { spec: ArchitectureSpec; state: ArchitectureState; body: RAPIER.RigidBody; collider: RAPIER.Collider; anchor: RAPIER.Collider | null; attacker?: AgentPhysicsBody }


export class Tier2WorldSystem {
  public readonly airspace: AirspaceController;
  public readonly architecture = new Map<number, ArchitectureEntity>();
  public readonly unlockedHouses = new Set<number>();
  public readonly stability: Record<DistrictId, number> = { NEON_DOCKS: 60, FOUNDRY_SLUMS: 60, HELIOS_SPIRE: 60, AEGIS_CITADEL: 60 };
  public readonly skirmishSystem: SkirmishSystem;
  public get skirmishes(): SkirmishState[] { return this.skirmishSystem.states; }
  public readonly charges = new Map<number, number>();
  private readonly hazardEntries = new Map<number, Set<string>>();
  private readonly meleeCharge = new Map<number, number>();
  private readonly targets = new Map<number, { kind: 'wall' | 'anchor' | 'radar'; id: number }>();
  private readonly cacheCollected = new Set<string>();
  public authoritative = true;
  public elapsed = 0;
  public releaseAgent(id: number): void {
    this.hazardEntries.delete(id); this.meleeCharge.delete(id); this.charges.delete(id);
    for (const key of this.cacheCollected) if (key.startsWith(`${id}:`)) this.cacheCollected.delete(key);
    for (const a of this.airspace.aircraft.values()) if (a.state.pilotId === id) a.state.pilotId = 0;
  }
  constructor(private readonly world: RAPIER.World, private readonly combat: EnemyCombatManager, private readonly vehicles: VehicleAndPropManager) {
    this.airspace = new AirspaceController(world);
    this.airspace.onEMP = (position, pilotId) => combat.onEffect?.(effectSpec(EffectKind.BLAST, position, { actor: pilotId, radius: 4 }));
    for (const spec of ARCHITECTURE_PLACEMENTS) {
      const p = spec.center, h = spec.halfExtents;
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(p.x, p.y, p.z).setCcdEnabled(true));
      const collider = world.createCollider(RAPIER.ColliderDesc.cuboid(h.x, h.y, h.z).setMass(spec.kind === 'TACTICAL_FALLING_PROP' ? 1200 : 0).setFriction(0.8), body);
      let anchor: RAPIER.Collider | null = null;
      if (spec.kind === 'TACTICAL_FALLING_PROP') {
        anchor = world.createCollider(RAPIER.ColliderDesc.cuboid(0.4, 0.6, 0.4).setTranslation(spec.anchor.x, spec.anchor.y, spec.anchor.z));
        this.targets.set(anchor.handle, { kind: 'anchor', id: spec.id });
      } else this.targets.set(collider.handle, { kind: 'wall', id: spec.id });
      this.architecture.set(spec.id, { spec, body, collider, anchor, state: { id: spec.id, hp: anchor ? 80 : 250, broken: false, impacted: false, ageSec: 0, generation: 1, position: { ...p }, rotation: { ...identity } } });
    }
    for (const [id, radar] of this.airspace.radar) this.targets.set(radar.collider.handle, { kind: 'radar', id });
    combat.weaponObstacleProbes.set('tier2', (agent, origin, direction, maxDistance) => {
      const hit = world.castRay(new RAPIER.Ray(origin, direction), maxDistance + 0.001, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, agent.collider);
      if (!hit) return null;
      const target = this.targets.get(hit.collider.handle);
      if (!target) return null;
      const point = { x: origin.x + direction.x * hit.timeOfImpact, y: origin.y + direction.y * hit.timeOfImpact, z: origin.z + direction.z * hit.timeOfImpact };
      return { distance: hit.timeOfImpact, resolve: () => {
        const amount = WEAPON_BASE_DAMAGE * agent.buildModifiers.weaponDamageMultiplier;
        const damage = target.kind === 'radar' ? this.airspace.damageRadar(target.id, amount, agent) : this.damageArchitecture(target.id, amount, 'bullet', agent);
        return { type: 'WEAPON_HIT', attackerEntityId: agent.entityId, targetEnemyId: 0, damageDealt: damage, armorStripped: 0, isCrit: false, limbCrippled: false, shockwaveTriggered: false, shockwaveHits: 0, impactPoint: point };
      } };
    });
    vehicles.thrownArchitectureHit = (agent, origin, delta, half, damage) => {
      const length = Math.hypot(delta.x, delta.y, delta.z);
      if (length < 1e-6) return false;
      const hit = world.castShape(origin, identity, { x: delta.x / length, y: delta.y / length, z: delta.z / length }, new RAPIER.Cuboid(half.x, half.y, half.z), 0, length, true, RAPIER.QueryFilterFlags.ONLY_FIXED | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, agent.collider);
      const target = hit ? this.targets.get(hit.collider.handle) : undefined;
      if (!target || target.kind === 'radar') return false;
      this.damageArchitecture(target.id, damage, 'thrown', agent); return true;
    };
    this.skirmishSystem = new SkirmishSystem(world, combat);
    TIER2_DISTRICTS.forEach((d, i) => {
      // Two real local defenders gate both facilities in their district.
      for (let j = 0; j < 2; j++) combat.spawnEnemy(62000 + i * 2 + j, `FACILITY-GUARD-${i}-${j}`, { x: d.x + 4, y: j ? d.roof : 0, z: d.z + (j ? 5 : 40) }, false, { disableAutoRespawn: true, maxHp: 240, maxArmor: 50 });
    });
  }
  public damageArchitecture(id: number, amount: number, source: 'bullet' | 'charged_melee' | 'thrown' | 'shaped_charge' | 'pet_vent', agent: AgentPhysicsBody): number {
    const e = this.architecture.get(id);
    if (!this.authoritative || !e || e.state.broken || agent.hp <= 0 || !Number.isFinite(amount) || amount <= 0) return 0;
    if (e.spec.kind === 'BREACHABLE_WALL' && !(source === 'pet_vent' || (source === 'charged_melee' || source === 'thrown') && agent.attributes.strength >= RULES.BREACHABLE_WALL.strengthLevel || source === 'shaped_charge' && agent.attributes.explosives >= RULES.BREACHABLE_WALL.explosivesLevel)) return 0;
    const damage = Math.min(e.state.hp, amount); e.state.hp -= damage;
    if (e.state.hp === 0) {
      e.state.broken = true; e.state.ageSec = 0; e.attacker = agent;
      this.combat.onEffect?.(effectSpec(EffectKind.DESTRUCTION, e.spec.center, { actor: agent.entityId, radius: 3 }));
      if (e.anchor) { e.anchor.setEnabled(false); e.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true); e.body.wakeUp(); }
      else e.collider.setEnabled(false);
    }
    return damage;
  }
  private aimedTarget(agent: AgentPhysicsBody, input: ClientInputPacket, range: number) {
    const origin = { ...agent.position, y: agent.position.y + 1.3 };
    const direction = { x: -Math.sin(input.yaw) * Math.cos(input.pitch), y: Math.sin(input.pitch), z: -Math.cos(input.yaw) * Math.cos(input.pitch) };
    const hit = this.world.castRay(new RAPIER.Ray(origin, direction), range, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, agent.collider);
    return hit ? this.targets.get(hit.collider.handle) : undefined;
  }
  public processAttack(agent: AgentPhysicsBody, input: ClientInputPacket, dt: number): boolean {
    if (!this.authoritative) return false;
    const held = !!(input.buttons & INPUT_FLAG_MELEE), previous = this.meleeCharge.get(agent.entityId) ?? 0;
    const charge = held ? previous + dt : 0;
    this.meleeCharge.set(agent.entityId, charge);
    if (held && charge >= 0.75 && previous < 0.75 && agent.grounded) {
      const target = this.aimedTarget(agent, input, 3);
      if (target?.kind === 'wall') { this.damageArchitecture(target.id, 250, 'charged_melee', agent); return true; }
    }
    if ((input.buttons & INPUT_FLAG_AIM) && (input.buttons & INPUT_FLAG_FIRE) && !(agent.prevButtons & INPUT_FLAG_FIRE)) {
      const target = this.aimedTarget(agent, input, 3);
      if (target?.kind === 'wall') {
        const ammo = this.charges.get(agent.entityId) ?? 3;
        if (ammo > 0 && this.damageArchitecture(target.id, 250, 'shaped_charge', agent) > 0) this.charges.set(agent.entityId, ammo - 1);
        return true;
      }
    }
    return false;
  }
  public applyHazards(agent: AgentPhysicsBody, wingsuiting: boolean, dt: number): void {
    if (agent.hp <= 0 || agent.mountedVehicleId) { this.hazardEntries.delete(agent.entityId); return; }
    const previous = this.hazardEntries.get(agent.entityId) ?? new Set<string>(), current = new Set<string>();
    for (const h of VERTICAL_HAZARD_SPECS) {
      if (h.kind === 'SAM_CEILING' || h.kind === 'THERMAL_UPDRAFT' && !wingsuiting) continue;
      const b = h.halfExtents;
      // Contact distance also handles deep containment, where Rapier's boolean GJK query can be degenerate.
      const contact = agent.collider.contactShape(new RAPIER.Cuboid(b.x, b.y, b.z), h.center, identity, 0);
      if (!contact || contact.distance > 0) continue;
      current.add(h.id);
      if (h.kind === 'TIMED_LOUVER') {
        if (this.authoritative && (this.elapsed + h.phaseSec) % h.periodSec < h.activeSec) agent.hp = Math.max(0, agent.hp - h.damagePerSec * dt);
      } else if (!previous.has(h.id)) {
        agent.velocity.x += h.impulse.x; agent.velocity.y += h.impulse.y; agent.velocity.z += h.impulse.z;
        if (h.kind === 'THERMAL_UPDRAFT') { agent.grounded = false; agent.controller.disableSnapToGround(); }
      }
    }
    this.hazardEntries.set(agent.entityId, current);
  }
  public interact(agent: AgentPhysicsBody): boolean {
    if (!this.authoritative || agent.hp <= 0 || agent.mountedVehicleId) return false;
    if (this.skirmishSystem.handlesInteraction(agent)) return true;
    for (const house of SAFE_HOUSE_REGISTRY) {
      const h = house.halfExtents;
      if (!this.unlockedHouses.has(house.id) || !agent.collider.intersectsShape(new RAPIER.Cuboid(h.x, h.y, h.z), house.center, identity)) continue;
      this.charges.set(agent.entityId, 3); agent.hp = agent.maxHp; agent.jetpackFuelSec = agent.maxJetpackFuelSec;
      if (house.kind === 'ROOFTOP_PAD') this.airspace.spawn(house.id);
      else if (!this.vehicles.vehicles.has(900 + house.id)) this.vehicles.spawnVehicle(900 + house.id, 'FOB Custom Interceptor', house.spawn, true);
      return true;
    }
    for (const e of this.architecture.values()) if (!e.anchor && e.state.broken) {
      const key = `${agent.entityId}:${e.spec.id}:${e.state.generation}`, center = { ...e.spec.center, z: e.spec.center.z - 6 };
      if (!this.cacheCollected.has(key) && agent.collider.intersectsShape(new RAPIER.Cuboid(3, 2, 3), center, identity)) {
        this.cacheCollected.add(key); this.charges.set(agent.entityId, 3); agent.hp = agent.maxHp; return true;
      }
    }
    return false;
  }
  public canSwapChassis(agent: AgentPhysicsBody): boolean {
    return this.authoritative && agent.hp > 0 && agent.mountedVehicleId === 0 && SAFE_HOUSE_REGISTRY.some(h => {
      const contact = agent.collider.contactShape(new RAPIER.Cuboid(h.halfExtents.x, h.halfExtents.y, h.halfExtents.z), h.center, identity, 0);
      return this.unlockedHouses.has(h.id) && contact !== null && contact.distance <= 0;
    });
  }
  public swapChassis(agent: AgentPhysicsBody, chassis: AugmentChassisId): boolean {
    if (!this.canSwapChassis(agent) || !Object.values(AugmentChassisId).includes(chassis)) return false;
    agent.augmentChassis = chassis; agent.buildModifiers = computeAgentBuildModifiers(chassis, agent.unlockedSkills, agent.unlockedRelics, agent.unlockedDistrictRewards, agent.activeNeuralDrifts); return true;
  }
  private enemiesInSphere(center: Vec3, radius: number): Set<number> {
    const ids = new Set<number>();
    this.world.intersectionsWithShape(center, identity, new RAPIER.Ball(radius), c => {
      const limb = this.combat.colliderHandleToLimb.get(c.handle);
      if (limb && this.combat.enemies.get(limb.enemyId)?.combatState !== EnemyCombatState.DEAD) ids.add(limb.enemyId);
      return true;
    });
    return ids;
  }
  public step(dt: number, agents: Map<number, AgentPhysicsBody>): void {
    this.airspace.authoritative = this.authoritative;
    this.skirmishSystem.authoritative = this.authoritative;
    if (!this.authoritative) return;
    this.elapsed += dt; this.airspace.step(dt, this.elapsed, agents);
    for (const id of this.hazardEntries.keys()) if (!agents.has(id)) { this.hazardEntries.delete(id); this.meleeCharge.delete(id); this.charges.delete(id); }
    for (const e of this.architecture.values()) {
      if (!e.state.broken) continue;
      e.state.ageSec += dt;
      const p = e.body.translation();
      if (e.state.ageSec + 1e-8 < RULES.SELF_HEALING_REGEN.cooldownSec || [...agents.values()].some(a => distance(a.position, e.spec.center) <= 80 || distance(a.position, p) <= 80)) continue;
      e.body.setBodyType(RAPIER.RigidBodyType.Fixed, true); e.body.setTranslation(e.spec.center, true); e.body.setRotation(identity, true);
      e.body.setLinvel({ x: 0, y: 0, z: 0 }, true); e.body.setAngvel({ x: 0, y: 0, z: 0 }, true); e.body.resetForces(true); e.body.resetTorques(true);
      e.collider.setEnabled(true); e.anchor?.setEnabled(true); e.attacker = undefined;
      Object.assign(e.state, { hp: e.anchor ? 80 : 250, broken: false, impacted: false, ageSec: 0, generation: e.state.generation % 65535 + 1 });
      for (const key of this.cacheCollected) if (key.split(':')[1] === String(e.spec.id)) this.cacheCollected.delete(key);
    }
    for (const h of SAFE_HOUSE_REGISTRY) if (!this.unlockedHouses.has(h.id) && this.enemiesInSphere(h.center, h.clearRadiusM).size === 0) this.unlockedHouses.add(h.id);
    this.skirmishSystem.step(dt, agents, this.stability);
  }
  public afterPhysics(agents: Map<number, AgentPhysicsBody>, events: CombatEventResult[]): void {
    this.airspace.syncPilots(agents);
    for (const e of this.architecture.values()) {
      e.state.position = { ...e.body.translation() }; e.state.rotation = { ...e.body.rotation() };
      if (!this.authoritative || !e.anchor || !e.state.broken || e.state.impacted) continue;
      let impact: Vec3 | null = null;
      this.world.contactPairsWith(e.collider, other => {
        if (other.isSensor()) return;
        this.world.contactPair(e.collider, other, manifold => {
          if (manifold.numSolverContacts() > 0) impact = { ...manifold.solverContactPoint(0) };
        });
      });
      if (!impact) continue;
      e.state.impacted = true;
      this.combat.onEffect?.(effectSpec(EffectKind.BLAST, impact, { actor: e.attacker?.entityId ?? 0, radius: 5 }));
      for (const id of this.enemiesInSphere(impact, RULES.TACTICAL_FALLING_PROP.impactRadiusM)) {
        const enemy = this.combat.enemies.get(id)!;
        if (e.attacker) events.push(this.combat.applyLimbDamage(e.attacker, enemy, EnemyLimbId.TORSO, RULES.TACTICAL_FALLING_PROP.crushDamage, true));
      }
    }
  }
  public snapshot(serverTick: number): Tier2Snapshot {
    return { serverTick, elapsed: this.elapsed, architecture: [...this.architecture.values()].map(e => ({ ...e.state, position: { ...e.body.translation() }, rotation: { ...e.body.rotation() } })),
      radar: [...this.airspace.radar].map(([id, node]) => ({ id, hp: node.hp })), aircraft: [...this.airspace.aircraft.values()].map(a => ({ ...a.state, position: { ...a.body.translation() }, rotation: { ...a.body.rotation() }, velocity: { ...a.body.linvel() }, angularVelocity: { ...a.body.angvel() } })),
      houses: [...this.unlockedHouses], skirmishes: this.skirmishes.map(s => ({ ...s, position: { ...s.position } })) };
  }
  public applySnapshot(packet: Tier2Snapshot, agents: Map<number, AgentPhysicsBody>): void {
    if (this.authoritative) return;
    this.elapsed = packet.elapsed;
    for (const s of packet.architecture) {
      const e = this.architecture.get(s.id)!; e.state = s;
      e.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true); e.body.setTranslation(s.position, true); e.body.setNextKinematicTranslation(s.position); e.body.setRotation(s.rotation, true); e.body.setNextKinematicRotation(s.rotation);
      e.collider.setEnabled(e.anchor !== null || !s.broken); e.anchor?.setEnabled(!s.broken);
    }
    for (const s of packet.radar) { const n = this.airspace.radar.get(s.id)!; n.hp = s.hp; n.collider.setEnabled(s.hp > 0); }
    for (const s of packet.aircraft) {
      const a = this.airspace.aircraft.get(s.id)!; a.state = s; a.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true); a.body.setEnabled(s.active); a.body.setTranslation(s.position, true); a.body.setNextKinematicTranslation(s.position); a.body.setRotation(s.rotation, true); a.body.setNextKinematicRotation(s.rotation);
    }
    for (const agent of agents.values()) {
      const craft = packet.aircraft.find(a => a.pilotId === agent.entityId && a.active);
      if (craft) { agent.mountedVehicleId = craft.id; agent.collider.setEnabled(false); }
      else if (this.airspace.aircraft.has(agent.mountedVehicleId)) { agent.mountedVehicleId = 0; agent.collider.setEnabled(true); }
    }
    this.unlockedHouses.clear(); for (const id of packet.houses) this.unlockedHouses.add(id);
    this.skirmishSystem.authoritative = false;
    this.skirmishSystem.applySnapshot(packet.skirmishes);
  }
}
