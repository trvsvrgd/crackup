import { VEHICLE_BY_ID, meetsRequirements } from '../content/arsenalAndVehicleRegistry.js';
import { attributeParams } from '../content/progressionRegistry.js';
import RAPIER from '@dimforge/rapier3d-compat';
import { DistrictId, getDistrictForPosition, INPUT_FLAG_DASH, INPUT_FLAG_JUMP, INPUT_FLAG_SPRINT, WORLD_GRAVITY } from '../constants.js';
import { AIRSPACE_RULES, RADAR_NODE_SPECS, SAFE_HOUSE_REGISTRY, VERTICAL_HAZARD_SPECS } from '../content/worldSystemsRegistry.js';
import type { AgentPhysicsBody } from './characterController.js';
import type { Quat4, Vec3 } from '../protocol/binaryProtocol.js';

const identity = { x: 0, y: 0, z: 0, w: 1 };
export interface AircraftState {
  id: number; active: boolean; pilotId: number; lockSec: number; stallSec: number; flareSec: number; flareCooldownSec: number;
  position: Vec3; rotation: Quat4; velocity: Vec3; angularVelocity: Vec3;
}
export class AirspaceController {
  public onEMP: ((position: Vec3, pilotId: number) => void) | null = null;
  public authoritative = true;
  public readonly aircraft = new Map<number, { body: RAPIER.RigidBody; collider: RAPIER.Collider; state: AircraftState; flareHeld: boolean; variantId?: string; hp?: number; maxHp?: number }>();
  public readonly radar = new Map<number, { hp: number; collider: RAPIER.Collider; body: RAPIER.RigidBody }>();
  public readonly liberated = new Set<DistrictId>();
  constructor(private readonly world: RAPIER.World) {
    for (const spec of RADAR_NODE_SPECS) {
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(spec.center.x, spec.center.y, spec.center.z));
      const h = spec.halfExtents;
      this.radar.set(spec.id, { hp: spec.hp, body, collider: world.createCollider(RAPIER.ColliderDesc.cuboid(h.x, h.y, h.z), body) });
    }
    for (const house of SAFE_HOUSE_REGISTRY.filter(s => s.kind === 'ROOFTOP_PAD')) {
      const id = 1000 + house.id, p = house.spawn;
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x, p.y, p.z).setCcdEnabled(true).setLinearDamping(0.25).setAngularDamping(2));
      const collider = world.createCollider(RAPIER.ColliderDesc.cuboid(1.8, 0.7, 3).setMass(2400).setFriction(0.8), body);
      body.setEnabled(false);
      this.aircraft.set(id, { body, collider, flareHeld: false, state: { id, active: false, pilotId: 0, lockSec: 0, stallSec: 0, flareSec: 0, flareCooldownSec: 0, position: { ...p }, rotation: { ...identity }, velocity: { x: 0, y: 0, z: 0 }, angularVelocity: { x: 0, y: 0, z: 0 } } });
    }
  }
  public spawn(houseId: number): boolean {
    const a = this.aircraft.get(1000 + houseId), house = SAFE_HOUSE_REGISTRY.find(h => h.id === houseId);
    if (!this.authoritative || !a || !house || a.state.active) return false;
    a.body.setEnabled(true); a.body.setTranslation(house.spawn, true); a.state.active = true; return true;
  }
  public damageInRadius(center: Vec3, radius: number, damage: number): void {
    if (!this.authoritative || !Number.isFinite(damage) || damage <= 0) return;
    for (const a of this.aircraft.values()) {
      const p = a.body.translation(), range = Math.hypot(p.x - center.x, p.y - center.y, p.z - center.z);
      if (!a.state.active || a.hp === undefined || range > radius) continue;
      a.hp = Math.max(0, a.hp - damage * (1 - range / radius));
      if (a.hp === 0) { a.state.active = false; a.body.setEnabled(false); }
    }
  }
  public damageRadar(id: number, amount: number, agent: AgentPhysicsBody): number {
    const node = this.radar.get(id);
    // Ground support comes from the actual capsule contact, not an untrusted action payload.
    if (!this.authoritative || !node || node.hp <= 0 || !Number.isFinite(amount) || amount <= 0 || agent.hp <= 0 || agent.mountedVehicleId !== 0 || !agent.grounded || agent.jetpackActive || agent.grappleActive) return 0;
    const damage = Math.min(node.hp, amount); node.hp -= damage; node.collider.setEnabled(node.hp > 0); return damage;
  }
  public toggleMount(agent: AgentPhysicsBody): boolean {
    const mounted = this.aircraft.get(agent.mountedVehicleId);
    if (mounted) {
      const p = mounted.body.translation();
      const exit = { x: p.x + 3.2, y: p.y, z: p.z };
      if (this.world.intersectionWithShape({ ...exit, y: exit.y + 0.95 }, identity, new RAPIER.Capsule(0.6, 0.35), RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, agent.collider, mounted.body)) return true;
      mounted.state.pilotId = 0; agent.mountedVehicleId = 0; agent.collider.setEnabled(true); agent.position = exit; agent.velocity = { ...mounted.body.linvel() }; return true;
    }
    if (agent.mountedVehicleId || agent.heldPropId) return false;
    for (const a of this.aircraft.values()) {
      const p = a.body.translation();
      if (a.variantId && !meetsRequirements(agent.attributes, VEHICLE_BY_ID.get(a.variantId)!.requires)) continue;
      if (!a.state.active || a.state.pilotId || Math.hypot(p.x - agent.position.x, p.y - agent.position.y, p.z - agent.position.z) > 4) continue;
      const origin = { ...agent.position, y: agent.position.y + 1 };
      const delta = { x: p.x - origin.x, y: p.y - origin.y, z: p.z - origin.z }, distance = Math.hypot(delta.x, delta.y, delta.z);
      const hit = distance > 0.01 ? this.world.castRay(new RAPIER.Ray(origin, { x: delta.x / distance, y: delta.y / distance, z: delta.z / distance }), distance, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, agent.collider) : null;
      if (hit && hit.collider.handle !== a.collider.handle) continue;
      a.state.pilotId = agent.entityId; agent.mountedVehicleId = a.state.id; agent.grappleActive = false; agent.jetpackActive = false; agent.collider.setEnabled(false); return true;
    }
    return false;
  }
  public step(dt: number, time: number, agents: Map<number, AgentPhysicsBody>): void {
    if (!this.authoritative) return;
    for (const a of this.aircraft.values()) {
      const s = a.state;
      if (!s.active) {
        const pilot = agents.get(s.pilotId);
        if (pilot) { pilot.collider.setEnabled(true); pilot.mountedVehicleId = 0; pilot.velocity = { ...s.velocity }; }
        s.pilotId = 0; continue;
      }
      let pilot = agents.get(s.pilotId);
      if (pilot && (pilot.hp <= 0 || pilot.mountedVehicleId !== s.id)) {
        pilot.collider.setEnabled(true); pilot.mountedVehicleId = 0; pilot = undefined;
      }
      if (!pilot) s.pilotId = 0;
      s.stallSec = Math.max(0, s.stallSec - dt); s.flareSec = Math.max(0, s.flareSec - dt); s.flareCooldownSec = Math.max(0, s.flareCooldownSec - dt);
      a.body.resetForces(true); a.body.resetTorques(true);
      const p = a.body.translation(), district = getDistrictForPosition(p.x, p.z);
      const sam = VERTICAL_HAZARD_SPECS.find(h => h.kind === 'SAM_CEILING' && h.district === district)!;
      const node = RADAR_NODE_SPECS.find(n => n.district === sam.district)!;
      const flare = !!pilot && !!(pilot.lastDriveButtons & INPUT_FLAG_DASH);
      if (pilot && flare && !a.flareHeld && pilot.attributes.flying >= AIRSPACE_RULES.flareLevel && s.flareCooldownSec === 0) {
        s.flareSec = AIRSPACE_RULES.flareProtectionSec; s.flareCooldownSec = AIRSPACE_RULES.flareCooldownSec; s.lockSec = 0;
      }
      a.flareHeld = flare;
      const abovePlane = sam.extendsUpward && p.y > sam.center.y && new RAPIER.HalfSpace({ x: 0, y: -1, z: 0 }).containsPoint(sam.center, identity, p);
      const inFootprint = new RAPIER.Cuboid(sam.halfExtents.x, 1, sam.halfExtents.z).containsPoint({ ...sam.center, y: p.y }, identity, p);
      const denied = !!pilot && pilot.tier3.samDisabledSec <= 0 && abovePlane && inFootprint && !this.liberated.has(sam.district) && this.radar.get(node.id)!.hp > 0;
      if (!denied || s.flareSec > 0) s.lockSec = 0;
      else if (s.stallSec === 0) {
        s.lockSec += dt;
        if (s.lockSec + 1e-8 >= sam.phaseSec) { s.stallSec = sam.activeSec; s.lockSec = 0; this.onEMP?.({ ...p }, s.pilotId); }
      }
      if (!pilot) continue;
      const variant = a.variantId ? VEHICLE_BY_ID.get(a.variantId) : undefined;
      const handling = attributeParams('flying', pilot.attributes.flying).vtolHandlingMultiplier * (variant?.handling ?? 1);
      const thrust = (variant?.speedMps ?? 28) * .5;
      const level = Math.max(1, Math.min(5, pilot.attributes.flying));
      const mass = a.body.mass(), velocity = a.body.linvel();
      if (s.stallSec === 0) {
        const climb = pilot.lastDriveButtons & INPUT_FLAG_JUMP ? 12 : pilot.lastDriveButtons & INPUT_FLAG_SPRINT ? -8 : 0;
        a.body.addForce({ x: -Math.sin(pilot.facingYaw) * pilot.lastDriveThrottle * mass * thrust - velocity.x * mass * 0.5,
          y: mass * (-WORLD_GRAVITY.y + (climb - velocity.y) * 3), z: -Math.cos(pilot.facingYaw) * pilot.lastDriveThrottle * mass * thrust - velocity.z * mass * 0.5 }, true);
      }
      a.body.addTorque({ x: -a.body.rotation().x * mass * 4, y: -pilot.lastDriveSteer * mass * 3 * handling, z: -a.body.rotation().z * mass * 4 }, true);
      // Rapier cuboid overlap limits turbulence to authored gaps between real skyscraper blocks.
      for (const h of VERTICAL_HAZARD_SPECS.filter(h => h.kind === 'CANYON_CROSSWIND')) {
        const b = h.halfExtents;
        const contact = a.collider.contactShape(new RAPIER.Cuboid(b.x, b.y, b.z), h.center, identity, 0);
        if (!contact || contact.distance > 0) continue;
        const wave = Math.sin(time * 2.3 + p.z * 0.04) + 0.5 * Math.cos(time * 4.7 + p.x * 0.03);
        a.body.applyImpulse({ x: h.impulse.x * mass * dt / level, y: 0, z: wave * mass * dt / level }, true);
        a.body.applyTorqueImpulse({ x: wave * mass * dt / level, y: 0, z: wave * mass * 2 * dt / level }, true);
      }
    }
  }
  public syncPilots(agents: Map<number, AgentPhysicsBody>): void {
    for (const a of this.aircraft.values()) {
      Object.assign(a.state, { position: { ...a.body.translation() }, rotation: { ...a.body.rotation() }, velocity: { ...a.body.linvel() }, angularVelocity: { ...a.body.angvel() } });
      const pilot = agents.get(a.state.pilotId);
      if (!pilot) continue;
      pilot.position = { ...a.state.position }; pilot.velocity = { ...a.state.velocity }; pilot.rotation = { ...a.state.rotation }; pilot.grounded = false;
      pilot.facingYaw = Math.atan2(2 * (pilot.rotation.w * pilot.rotation.y + pilot.rotation.x * pilot.rotation.z), 1 - 2 * (pilot.rotation.y ** 2 + pilot.rotation.z ** 2));
      pilot.rigidBody.setTranslation({ ...pilot.position, y: pilot.position.y + 0.95 }, true);
      pilot.rigidBody.setNextKinematicTranslation({ ...pilot.position, y: pilot.position.y + 0.95 });
    }
  }
}
