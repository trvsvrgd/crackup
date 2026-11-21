import RAPIER from '@dimforge/rapier3d-compat';
import { DistrictId, EnemyCombatState, FactionId, INPUT_FLAG_OBJECTIVE_JETPACK, WEAPON_BASE_DAMAGE } from '../constants.js';
import { DYNAMIC_SKIRMISH_TABLE, SKIRMISH_RULES as RULES, TIER2_DISTRICTS } from '../content/worldSystemsRegistry.js';
import type { AgentPhysicsBody } from '../physics/characterController.js';
import type { EnemyCombatManager } from '../combat/enemyRigSystem.js';
import type { Vec3 } from '../protocol/binaryProtocol.js';

const identity = { x: 0, y: 0, z: 0, w: 1 };
export enum SkirmishOutcome { IDLE, ACTIVE, SUCCEEDED, FAILED }
export interface SkirmishState {
  districtIndex: number; kindIndex: number; active: boolean; elapsed: number; cooldown: number; progress: number; sequence: number; position: Vec3;
  objectiveHp: number; maxObjectiveHp: number; stage: number; targetEntityId: number; outcome: SkirmishOutcome;
}
interface Objective { body: RAPIER.RigidBody; collider: RAPIER.Collider }

/** One bounded, physically queried objective per district; outcome rules depend on the actual event. */
export class SkirmishSystem {
  public authoritative = true;
  public readonly states: SkirmishState[] = [];
  public readonly objectives = new Map<number, Objective>();
  constructor(private readonly world: RAPIER.World, private readonly combat: EnemyCombatManager) {
    TIER2_DISTRICTS.forEach((d, i) => {
      const position = { x: d.x, y: 1, z: d.z + 40 };
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(position.x, position.y, position.z));
      const collider = world.createCollider(RAPIER.ColliderDesc.cuboid(0.8, 1, 0.6), body); body.setEnabled(false);
      this.objectives.set(i, { body, collider });
      this.states.push({ districtIndex: i, kindIndex: 0, active: false, elapsed: 0, cooldown: 60, progress: 0, sequence: 0, position,
        objectiveHp: 0, maxObjectiveHp: 0, stage: 0, targetEntityId: 0, outcome: SkirmishOutcome.IDLE });
    });
    combat.weaponObstacleProbes.set('skirmish', (agent, origin, direction, maxDistance) => {
      const hit = world.castRay(new RAPIER.Ray(origin, direction), maxDistance + 0.001, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, agent.collider);
      if (!hit) return null;
      const s = this.states.find(s => s.active && this.objectives.get(s.districtIndex)!.collider.handle === hit.collider.handle);
      if (!s || s.kindIndex === 4) return null;
      const point = { x: origin.x + direction.x * hit.timeOfImpact, y: origin.y + direction.y * hit.timeOfImpact, z: origin.z + direction.z * hit.timeOfImpact };
      return { distance: hit.timeOfImpact, resolve: () => {
        const damage = this.authoritative ? Math.min(s.objectiveHp, WEAPON_BASE_DAMAGE * agent.buildModifiers.weaponDamageMultiplier) : 0;
        s.objectiveHp -= damage;
        return { type: 'WEAPON_HIT', attackerEntityId: agent.entityId, targetEnemyId: 0, damageDealt: damage, armorStripped: 0, isCrit: false, limbCrippled: false, shockwaveTriggered: false, shockwaveHits: 0, impactPoint: point };
      } };
    });
  }
  public actorId(district: number, index: number): number { return 63000 + district * 16 + index; }
  private shape(kind: number): RAPIER.Shape {
    return kind === 0 ? new RAPIER.Capsule(0.55, 0.35) : kind === 2 ? new RAPIER.Cuboid(1.4, 1.2, 3)
      : kind === 3 ? new RAPIER.Cuboid(2, 1.5, 2) : kind === 4 ? new RAPIER.Ball(RULES.ambush.triggerRadiusM) : new RAPIER.Cuboid(0.8, 1, 0.6);
  }
  private height(kind: number): number { return kind === 0 ? 0.9 : kind === 2 ? 1.2 : kind === 3 ? 1.5 : 1; }
  private clearActors(s: SkirmishState): void {
    for (let j = 0; j < RULES.maxActorsPerDistrict; j++) this.combat.removeEnemy(this.actorId(s.districtIndex, j));
  }
  private finish(s: SkirmishState, success: boolean): void {
    s.active = false; s.outcome = success ? SkirmishOutcome.SUCCEEDED : SkirmishOutcome.FAILED;
    if (success) s.progress = 1;
    s.cooldown = DYNAMIC_SKIRMISH_TABLE[s.kindIndex].intervalSec;
    this.objectives.get(s.districtIndex)!.body.setEnabled(false); this.clearActors(s);
  }
  private spawnWave(s: SkirmishState, first: number, count: number): boolean {
    const d = TIER2_DISTRICTS[s.districtIndex];
    for (let j = first; j < first + count; j++) {
      const origin = { x: d.x - 9 + (j % 4) * 6, y: 10, z: d.z + 50 + Math.floor(j / 4) * 5 };
      const ground = this.world.castRay(new RAPIER.Ray(origin, { x: 0, y: -1, z: 0 }), 14, true, RAPIER.QueryFilterFlags.ONLY_FIXED | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
      if (!ground) return false;
      const p = { ...origin, y: origin.y - ground.timeOfImpact };
      // Patrol routes approach the clinic/van when no Agent is in engagement range.
      this.combat.spawnEnemy(this.actorId(s.districtIndex, j), DYNAMIC_SKIRMISH_TABLE[s.kindIndex].kind, p, true,
        { faction: s.kindIndex === 4 ? FactionId.AEGIS_AUDITOR_HIT_SQUAD : FactionId.NEON_SYNDICATE, disableAutoRespawn: true,
          patrolWaypoints: [p, { ...s.position, y: p.y }], maxHp: 300, maxArmor: s.kindIndex === 2 ? 180 : 90 });
    }
    return true;
  }
  private begin(s: SkirmishState, kind: number): void {
    const d = TIER2_DISTRICTS[s.districtIndex], o = this.objectives.get(s.districtIndex)!;
    const ground = this.world.castRay(new RAPIER.Ray({ x: d.x, y: 10, z: d.z + 40 }, { x: 0, y: -1, z: 0 }), 14, true, RAPIER.QueryFilterFlags.ONLY_FIXED | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
    s.kindIndex = kind; s.sequence = s.sequence % 1000000 + 1; s.elapsed = s.progress = 0; s.targetEntityId = 0; s.stage = 0;
    s.maxObjectiveHp = [RULES.escort.hp, RULES.repair.hp, RULES.robbery.hp, RULES.siege.hp, 0][kind];
    s.objectiveHp = kind === 1 ? RULES.repair.initialHp : s.maxObjectiveHp;
    if (!ground) { this.finish(s, false); return; }
    s.position = { x: d.x, y: 10 - ground.timeOfImpact + this.height(kind) + 0.05, z: d.z + 40 };
    s.active = true; s.outcome = SkirmishOutcome.ACTIVE;
    o.collider.setShape(this.shape(kind)); o.collider.setSensor(kind === 4); o.body.setTranslation(s.position, true); o.body.setNextKinematicTranslation(s.position); o.body.setEnabled(true);
    this.clearActors(s);
    if ((kind === 2 || kind === 3) && !this.spawnWave(s, 0, DYNAMIC_SKIRMISH_TABLE[kind].hostileCount)) this.finish(s, false);
  }
  private unobstructed(from: Vec3, to: Vec3, s: SkirmishState, ignore?: RAPIER.Collider): boolean {
    const delta = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z }, length = Math.hypot(delta.x, delta.y, delta.z);
    if (length < 0.001) return true;
    return !this.world.castRay(new RAPIER.Ray(from, { x: delta.x / length, y: delta.y / length, z: delta.z / length }), Math.max(0, length - 0.01), true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, ignore, this.objectives.get(s.districtIndex)!.body);
  }
  private inRange(a: AgentPhysicsBody, s: SkirmishState, radius: number): boolean {
    if (a.hp <= 0 || a.mountedVehicleId) return false;
    const contact = a.collider.contactShape(new RAPIER.Ball(radius), s.position, identity, 0);
    return !!contact && contact.distance <= 0 && this.unobstructed({ ...a.position, y: a.position.y + 1.2 }, s.position, s, a.collider);
  }
  public handlesInteraction(agent: AgentPhysicsBody): boolean {
    return this.states.some(s => s.active && (s.kindIndex === 1 || s.kindIndex === 2 && s.objectiveHp === 0) && this.inRange(agent, s, 3));
  }
  private move(s: SkirmishState, distanceM: number): void {
    const o = this.objectives.get(s.districtIndex)!, d = TIER2_DISTRICTS[s.districtIndex], direction = { x: -Math.sign(d.x), y: 0, z: 0 };
    const hit = this.world.castShape(s.position, identity, direction, this.shape(s.kindIndex), 0, distanceM + 0.02, true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, o.body);
    const travel = hit ? Math.max(0, hit.time_of_impact - 0.02) : distanceM;
    const next = { ...s.position, x: s.position.x + direction.x * Math.min(distanceM, travel) };
    const ground = this.world.castShape({ ...next, y: next.y + 2 }, identity, { x: 0, y: -1, z: 0 }, this.shape(s.kindIndex), 0, 3, true,
      RAPIER.QueryFilterFlags.ONLY_FIXED | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, o.body);
    if (!ground) return;
    const supportedY = next.y + 2 - ground.time_of_impact + 0.05;
    if (Math.abs(supportedY - next.y) > 0.6) return;
    next.y = supportedY; s.position = next; o.body.setNextKinematicTranslation(next);
  }
  private alive(s: SkirmishState) {
    return Array.from({ length: RULES.maxActorsPerDistrict }, (_, j) => this.combat.enemies.get(this.actorId(s.districtIndex, j)))
      .filter(e => e && e.hp > 0 && e.combatState !== EnemyCombatState.DEAD);
  }
  public step(dt: number, agents: Map<number, AgentPhysicsBody>, stability: Record<DistrictId, number>): void {
    if (!this.authoritative || !Number.isFinite(dt) || dt <= 0) return;
    for (const s of this.states) {
      const d = TIER2_DISTRICTS[s.districtIndex];
      if (!s.active) {
        if (![...agents.values()].some(a => this.inRange(a, s, RULES.activationRadiusM))) continue;
        s.cooldown = Math.max(0, s.cooldown - dt);
        if (s.cooldown > 0) continue;
        const value = stability[d.district];
        const eligible = DYNAMIC_SKIRMISH_TABLE.map((spec, i) => ({ spec, i })).filter(e => value >= e.spec.minStability && (e.spec.upperExclusive ? value < e.spec.maxStability : value <= e.spec.maxStability));
        if (!eligible.length) continue;
        this.begin(s, eligible[s.sequence % eligible.length].i);
        if (!s.active) continue;
      }
      const previousTime = s.elapsed, spec = DYNAMIC_SKIRMISH_TABLE[s.kindIndex]; s.elapsed = Math.min(spec.durationSec, s.elapsed + dt);
      const helpers = [...agents.values()].filter(a => this.inRange(a, s, s.kindIndex === 0 ? RULES.escort.accompanyRadiusM : 3));
      const working = helpers.some(a => !!(a.prevButtons & INPUT_FLAG_OBJECTIVE_JETPACK));
      if (s.kindIndex !== 4 && s.objectiveHp <= 0 && s.kindIndex !== 2) { this.finish(s, false); continue; }
      if (s.kindIndex === 0) {
        if (helpers.length) this.move(s, Math.min(dt * RULES.escort.speedMps, Math.max(0, RULES.escort.distanceM - Math.abs(s.position.x - d.x))));
        s.progress = Math.min(1, Math.abs(s.position.x - d.x) / RULES.escort.distanceM);
        if (s.progress >= 1 - 1e-6) this.finish(s, true);
      } else if (s.kindIndex === 1) {
        if (working) s.objectiveHp = Math.min(s.maxObjectiveHp, s.objectiveHp + dt * (RULES.repair.hp - RULES.repair.initialHp) / RULES.repair.workSec);
        s.progress = Math.max(0, (s.objectiveHp - RULES.repair.initialHp) / (s.maxObjectiveHp - RULES.repair.initialHp));
        if (s.objectiveHp >= s.maxObjectiveHp) this.finish(s, true);
      } else if (s.kindIndex === 2) {
        if (s.objectiveHp > 0) {
          this.move(s, dt * RULES.robbery.speedMps);
          s.progress = Math.min(1, Math.abs(s.position.x - d.x) / RULES.robbery.distanceM);
          if (s.progress >= 1) this.finish(s, false);
        } else {
          if (s.stage === 0) { s.stage = 1; s.progress = 0; }
          if (working && this.alive(s).length === 0) s.progress = Math.min(1, s.progress + dt / RULES.robbery.recoverSec);
          if (s.progress >= 1) this.finish(s, true);
        }
      } else if (s.kindIndex === 3) {
        for (let i = 0; i < RULES.siege.waveTimesSec.length; i++) if (previousTime < RULES.siege.waveTimesSec[i] && s.elapsed >= RULES.siege.waveTimesSec[i]) {
          s.stage = i + 1;
          if (!this.spawnWave(s, spec.hostileCount + i * RULES.siege.attackersPerWave, RULES.siege.attackersPerWave)) this.finish(s, false);
        }
        if (!s.active) continue;
        for (const enemy of this.alive(s)) {
          const origin = { ...enemy!.position, y: enemy!.position.y + 1.3 };
          if (new RAPIER.Ball(RULES.siege.attackRangeM).containsPoint(s.position, identity, origin) && this.unobstructed(origin, s.position, s)) {
            s.objectiveHp = Math.max(0, s.objectiveHp - RULES.siege.damagePerSec * dt);
          }
        }
        s.progress = Math.min(1, s.elapsed / RULES.siege.defendSec);
        if (s.objectiveHp <= 0) this.finish(s, false);
        else if (s.elapsed >= RULES.siege.defendSec && this.alive(s).length === 0) this.finish(s, true);
      } else {
        if (s.stage === 0) {
          const target = [...agents.values()].find(a => this.inRange(a, s, RULES.ambush.triggerRadiusM));
          if (target) {
            s.targetEntityId = target.entityId; s.stage = 1; s.elapsed = 0;
            if (!this.spawnWave(s, 0, spec.hostileCount)) this.finish(s, false);
          }
        } else {
          const target = agents.get(s.targetEntityId);
          if (!target || target.hp <= 0) { this.finish(s, false); continue; }
          if (s.stage === 1 && s.elapsed >= RULES.ambush.reinforcementSec) {
            s.stage = 2;
            if (!this.spawnWave(s, spec.hostileCount, RULES.ambush.reinforcements)) this.finish(s, false);
          }
          s.progress = Math.max(0, 1 - this.alive(s).length / (spec.hostileCount + RULES.ambush.reinforcements));
          if (s.active && s.stage === 2 && this.alive(s).length === 0) this.finish(s, true);
        }
      }
      if (s.active && s.elapsed >= spec.durationSec) this.finish(s, false);
    }
  }
  public applySnapshot(states: SkirmishState[]): void {
    if (this.authoritative) return;
    this.states.splice(0, this.states.length, ...states.map(s => ({ ...s, position: { ...s.position } })));
    for (const s of this.states) {
      const o = this.objectives.get(s.districtIndex)!;
      o.collider.setShape(this.shape(s.kindIndex)); o.collider.setSensor(s.kindIndex === 4); o.body.setEnabled(s.active);
      o.body.setTranslation(s.position, true); o.body.setNextKinematicTranslation(s.position);
    }
  }
}
