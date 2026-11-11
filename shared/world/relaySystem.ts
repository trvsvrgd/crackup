import RAPIER from '@dimforge/rapier3d-compat';
import { getExplosivesParams, WEAPON_BASE_DAMAGE } from '../constants.js';
import type { AgentPhysicsBody } from '../physics/characterController.js';
import type { CombatEventResult, EnemyCombatManager } from '../combat/enemyRigSystem.js';
import type { RelayPacket, RelayState } from '../protocol/relayProtocol.js';
import type { Vec3 } from '../protocol/binaryProtocol.js';
import { relayBaseVertices, RelayMode, RELAY_REBOOT_SEC, RELAY_VENT_MAX_HP, type RelayPlan } from './relayDefinition.js';

const quat = (x: number, z: number) => ({ x: Math.sin(x / 2) * Math.cos(z / 2), y: -Math.sin(x / 2) * Math.sin(z / 2), z: Math.cos(x / 2) * Math.sin(z / 2), w: Math.cos(x / 2) * Math.cos(z / 2) });
export class RelaySystem {
  public authoritative = true;
  public readonly states = new Map<number, RelayState>();
  public readonly ventColliders = new Map<number, { relayId: number; ventId: number }>();
  private readonly bodies: RAPIER.RigidBody[] = [];
  constructor(private readonly world: RAPIER.World, private readonly combat: EnemyCombatManager, public readonly plans: readonly RelayPlan[], private readonly isHacked: (plan: RelayPlan) => boolean) {
    for (const plan of plans) {
      this.states.set(plan.relayId, { relayId: plan.relayId, generation: 1, mode: RelayMode.ONLINE, hacked: false, heat: 0, rebootSec: 0, ventHp: [RELAY_VENT_MAX_HP, RELAY_VENT_MAX_HP, RELAY_VENT_MAX_HP] });
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(plan.origin.x, plan.origin.y, plan.origin.z)); this.bodies.push(body);
      const base = RAPIER.ColliderDesc.convexHull(new Float32Array(relayBaseVertices(plan.towerOffset)))!;
      world.createCollider(base.setFriction(0.8), body);
      for (const box of plan.boxes) world.createCollider(RAPIER.ColliderDesc.cuboid(box.halfExtents.x, box.halfExtents.y, box.halfExtents.z)
        .setTranslation(box.center.x, box.center.y, box.center.z).setRotation(quat(box.rotation?.x ?? 0, box.rotation?.z ?? 0)).setFriction(0.8), body);
      for (const v of plan.vents) {
        const collider = world.createCollider(RAPIER.ColliderDesc.cuboid(v.halfExtents.x, v.halfExtents.y, v.halfExtents.z).setTranslation(v.center.x, v.center.y, v.center.z).setSensor(true), body);
        this.ventColliders.set(collider.handle, { relayId: plan.relayId, ventId: v.ventId });
      }
    }
    combat.weaponObstacleProbes.set('relay', (agent, origin, direction, distance) => {
      const hit = world.castRay(new RAPIER.Ray(origin, direction), distance, true, undefined, undefined, agent.collider, undefined, c => this.ventColliders.has(c.handle));
      if (!hit) return null;
      const target = this.ventColliders.get(hit.collider.handle)!;
      const impact = { x: origin.x + direction.x * hit.timeOfImpact, y: origin.y + direction.y * hit.timeOfImpact, z: origin.z + direction.z * hit.timeOfImpact };
      return { distance: hit.timeOfImpact, resolve: () => this.damageVent(target.relayId, target.ventId, WEAPON_BASE_DAMAGE * agent.buildModifiers.weaponDamageMultiplier, impact, agent.entityId) ??
        this.event(target.relayId, target.ventId, 0, impact, agent.entityId) };
    });
  }
  private event(relayId: number, ventId: number, damage: number, impact: Vec3, attackerEntityId: number): CombatEventResult {
    return { type: 'RELAY_VENT_HIT', targetRelayId: relayId, targetVentId: ventId, ventHp: this.states.get(relayId)!.ventHp[ventId],
      attackerEntityId, targetEnemyId: 0, damageDealt: damage, armorStripped: 0, isCrit: false, limbCrippled: false, shockwaveTriggered: false, shockwaveHits: 0, impactPoint: { ...impact } };
  }
  public damageVent(relayId: number, ventId: number, amount: number, impact: Vec3, attackerEntityId = 0): CombatEventResult | null {
    const state = this.states.get(relayId), plan = this.plans.find(p => p.relayId === relayId);
    if (!this.authoritative || !state || !plan || this.isHacked(plan) || state.hacked || state.mode === RelayMode.SHUTDOWN || !Number.isInteger(ventId) || ventId < 0 || ventId > 2 ||
      !Number.isFinite(amount) || amount <= 0 || ![impact.x, impact.y, impact.z].every(Number.isFinite) || state.ventHp[ventId] <= 0) return null;
    const damage = Math.min(state.ventHp[ventId], amount); state.ventHp[ventId] -= damage;
    if (state.ventHp[ventId] === 0) state.mode = RelayMode.OVERHEATING;
    return this.event(relayId, ventId, damage, impact, attackerEntityId);
  }
  public step(dt: number): void {
    if (!this.authoritative || !Number.isFinite(dt) || dt <= 0) return;
    for (const plan of this.plans) {
      const state = this.states.get(plan.relayId)!;
      if (this.isHacked(plan)) {
        state.hacked = true; state.mode = RelayMode.HACKED; state.rebootSec = 0; state.heat = Math.max(0, state.heat - dt * 0.3); continue;
      }
      if (state.mode === RelayMode.SHUTDOWN) {
        state.rebootSec = Math.max(0, state.rebootSec - dt);
        if (state.rebootSec === 0) { state.heat = 0; state.ventHp = [RELAY_VENT_MAX_HP, RELAY_VENT_MAX_HP, RELAY_VENT_MAX_HP]; state.generation = state.generation % 65535 + 1; state.mode = RelayMode.ONLINE; }
        continue;
      }
      const destroyed = state.ventHp.filter(hp => hp === 0).length;
      state.mode = destroyed ? RelayMode.OVERHEATING : RelayMode.ONLINE;
      state.heat = Math.min(1, state.heat + [0, 0.04, 0.12, 0.25][destroyed] * dt);
      if (state.heat === 1) { state.mode = RelayMode.SHUTDOWN; state.rebootSec = RELAY_REBOOT_SEC; }
    }
  }
  public applyBlast(agent: AgentPhysicsBody, origin: Vec3, yieldScale: number): CombatEventResult[] {
    if (!this.authoritative) return [];
    const radius = getExplosivesParams(agent.attributes.explosives).blastRadiusMeters * agent.buildModifiers.blastRadiusMultiplier * yieldScale;
    const events: CombatEventResult[] = [];
    for (const plan of this.plans) for (const vent of plan.vents) {
      const p = { x: plan.origin.x + vent.center.x, y: plan.origin.y + vent.center.y, z: plan.origin.z + vent.center.z };
      const delta = { x: p.x - origin.x, y: p.y - origin.y, z: p.z - origin.z }, distance = Math.hypot(delta.x, delta.y, delta.z);
      if (distance > radius) continue;
      if (distance > 0.01 && this.world.castRay(new RAPIER.Ray(origin, { x: delta.x / distance, y: delta.y / distance, z: delta.z / distance }), distance, true, RAPIER.QueryFilterFlags.ONLY_FIXED | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS)) continue;
      const damage = Math.max(18, Math.round((110 + agent.attributes.explosives * 32) * yieldScale / (1 + (distance / Math.max(1, radius * 0.55)) ** 2)));
      const event = this.damageVent(plan.relayId, vent.ventId, damage, p, agent.entityId);
      if (event) { event.shockwaveTriggered = true; events.push(event); }
    }
    return events;
  }
  public snapshot(serverTick: number): RelayPacket { return { serverTick, relays: [...this.states.values()].map(s => ({ ...s, ventHp: [...s.ventHp] })) }; }
  public applySnapshot(packet: RelayPacket): void { if (!this.authoritative) for (const s of packet.relays) if (this.states.has(s.relayId)) this.states.set(s.relayId, { ...s, ventHp: [...s.ventHp] }); }
  public dispose(): void { for (const body of this.bodies) this.world.removeRigidBody(body); this.bodies.length = 0; this.ventColliders.clear(); this.states.clear(); this.combat.weaponObstacleProbes.delete('relay'); }
}
