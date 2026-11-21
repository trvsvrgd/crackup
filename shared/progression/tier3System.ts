import RAPIER from '@dimforge/rapier3d-compat';
import { AgentAnimState, EnemyCombatState, EnemyLimbId, INPUT_FLAG_JUMP, INPUT_FLAG_SPRINT, INPUT_FLAG_FIRE, INPUT_FLAG_GRAB_THROW, INPUT_FLAG_PARRY, WORLD_GRAVITY, getStrengthParams, getExplosivesParams, PetMode } from '../constants.js';
import { HitReaction } from '../combat/combatPresentation.js';
import { ATTRIBUTE_UNLOCKS, hasAttributeAbility, type XPEvent, type AttributeAbility } from '../content/progressionRegistry.js';
import { meetsRequirements, ownsRelic, PET_FIELD_REGISTRY, PET_VENT_REGISTRY, RELIC_REGISTRY, TIER3_RULES, TIER3_COMBAT, VEHICLE_BY_ID, WEAPON_BY_ID, type MovementSynergy } from '../content/arsenalAndVehicleRegistry.js';
import { TIER3_SKILL_BY_ID } from '../content/skillTreeRegistry.js';
import { SAFE_HOUSE_REGISTRY } from '../content/worldSystemsRegistry.js';
import type { AgentPhysicsBody, SharedPhysicsWorld } from '../physics/characterController.js';
import type { ClientInputPacket, Vec3 } from '../protocol/binaryProtocol.js';
import type { CombatEventResult, EnemyPhysicsEntity } from '../combat/enemyRigSystem.js';

export type TraversalMode = '' | 'JumpLaunch' | 'AirDashBurst' | 'WingsuitBankGlide' | 'JetpackHoverAim' | 'WallRunLeft' | 'WallRunRight' | 'GrapplePendulumSwing' | 'ShieldSurfSlide' | 'SuperCraterSlam' | 'ParkourMomentumRoll';
export interface Tier3State {
  weaponId: string; ammo: number; reloadSec: number; cooldownSec: number; abilityCooldowns: Record<string, number>;
  mode: TraversalMode; modeSec: number; movement: MovementSynergy | null; movementDirection: Vec3;
  shield: number; shieldSec: number; focusSec: number; hoverSec: number; samDisabledSec: number;
  wallRunSec: number; petAnchorSec: number; petShieldSec: number; scanSec: number; scannedEnemyIds: number[]; trackedRelicIds: string[];
  combatLayer: '' | 'katana' | 'pile_bunker'; combatLayerSec: number; lastWeaponId: string;
}
export function createTier3State(weaponId = ''): Tier3State {
  const weapon = WEAPON_BY_ID.get(weaponId);
  return { weaponId: weapon?.id ?? '', ammo: weapon?.magazine ?? 0, reloadSec: 0, cooldownSec: 0, abilityCooldowns: {}, mode: '', modeSec: 0, movement: null,
    movementDirection: { x: 0, y: 0, z: -1 }, shield: 0, shieldSec: 0, focusSec: 0, hoverSec: 0, samDisabledSec: 0,
    wallRunSec: 0, petAnchorSec: 0, petShieldSec: 0, scanSec: 0, scannedEnemyIds: [], trackedRelicIds: [], combatLayer: '', combatLayerSec: 0, lastWeaponId: '' };
}
const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const direction = (yaw: number, pitch = 0): Vec3 => ({ x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) });
export class Tier3System {
  public onXP: ((agent: AgentPhysicsBody, event: XPEvent) => void) | null = null;
  public readonly hacks = new Map<number, { owner: number; remaining: number; fireSec: number }>();
  public readonly volumes: { owner: number; center: Vec3; radius: number; height: number; remaining: number; entered: Set<number> }[] = [];
  public readonly vehicleVariants = new Map<number, string>();
  public readonly projectiles: { owner: number; weaponId: string; body: RAPIER.RigidBody; collider: RAPIER.Collider; fuse: number; sticky: boolean; targetId?: number; missile?: 'stinger' | 'swarm'; damage?: number }[] = [];
  public readonly winches = new Map<number, number>();
  public readonly strikes: { owner: number; position: Vec3; remaining: number }[] = [];
  private readonly ventPhases = new Map<number, { petId: number; vent: typeof PET_VENT_REGISTRY[number]; start: Vec3; elapsed: number }>();
  private readonly metrics = new Map<number, { distance: number; drive: number; fly: number; jumps: number; mantles: number; throws: number; districts: number; bounties: number; raids: number }>();
  constructor(private readonly sim: SharedPhysicsWorld) {}
  public releaseAgent(id: number): void {
    this.metrics.delete(id);
    this.winches.delete(id);
    const phase = this.ventPhases.get(id), pet = phase && this.sim.cyberPetArenaManager.pets.get(phase.petId);
    if (pet) pet.fieldPhaseSec = 0;
    this.ventPhases.delete(id);
    for (let i = this.strikes.length - 1; i >= 0; i--) if (this.strikes[i].owner === id) this.strikes.splice(i, 1);
    for (let i = this.projectiles.length - 1; i >= 0; i--) if (this.projectiles[i].owner === id) { this.sim.world.removeRigidBody(this.projectiles[i].body); this.projectiles.splice(i, 1); }
    for (const [target, hack] of this.hacks) if (hack.owner === id) { const enemy = this.sim.combatManager.enemies.get(target); if (enemy) enemy.staggerTimer = 0; this.hacks.delete(target); }
    for (let i = this.volumes.length - 1; i >= 0; i--) if (this.volumes[i].owner === id) this.volumes.splice(i, 1);
  }
  public equip(agent: AgentPhysicsBody, id: string): string | null {
    const w = WEAPON_BY_ID.get(id);
    if (!w || !meetsRequirements(agent.attributes, w.requires)) return 'Weapon attribute requirements are not met.';
    if (agent.hp <= 0 || agent.tier3.cooldownSec > 0 || agent.tier3.reloadSec > 0) return 'Wait until your current action finishes.';
    if (agent.tier3.weaponId === id) return null;
    agent.tier3.weaponId = id; agent.tier3.ammo = w.magazine; agent.tier3.reloadSec = w.reloadSec;
    return null;
  }
  private visible(agent: AgentPhysicsBody, target: Vec3): boolean {
    const from = { ...agent.position, y: agent.position.y + 1.2 }, d = distance(from, target);
    if (d < .01) return true;
    const hit = this.sim.world.castRay(new RAPIER.Ray(from, { x: (target.x - from.x) / d, y: (target.y - from.y) / d, z: (target.z - from.z) / d }), d, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, agent.collider);
    return !hit || hit.timeOfImpact >= d - .6;
  }
  private enemies(agent: AgentPhysicsBody, range: number, throughWalls = false): EnemyPhysicsEntity[] {
    return [...this.sim.combatManager.enemies.values()].filter(e => e.hp > 0 && !this.hacks.has(e.enemyId) && distance(agent.position, e.position) <= range && (throughWalls || this.visible(agent, { ...e.position, y: e.position.y + 1 }))).sort((a, b) => distance(agent.position, a.position) - distance(agent.position, b.position));
  }
  private damage(agent: AgentPhysicsBody, enemy: EnemyPhysicsEntity, damage: number, limb = EnemyLimbId.TORSO, action: XPEvent = 'melee_hit'): CombatEventResult {
    const hp = enemy.limbs[limb].hp;
    const event = this.sim.combatManager.applyLimbDamage(agent, enemy, limb, damage);
    event.progressionAction = action;
    this.sim.pendingCombatEvents.push(event);
    this.afterHit(agent, event, Math.max(0, damage - hp));
    return event;
  }
  private blast(agent: AgentPhysicsBody, range: number, damage: number): void {
    for (const enemy of this.enemies(agent, range)) this.damage(agent, enemy, damage * Math.max(.2, 1 - distance(agent.position, enemy.position) / range), EnemyLimbId.TORSO, 'explosion_hit');
  }
  private hack(agent: AgentPhysicsBody, range: number, duration: number): void {
    this.sim.dreadnoughtDirector.overrideTurrets(agent, range, duration);
    for (const enemy of this.enemies(agent, range)) {
      // Only machines, never arbitrary citizens or story bosses.
      if (!/DRONE|TURRET|SENTRY/i.test(enemy.callsign)) continue;
      this.hacks.set(enemy.enemyId, { owner: agent.entityId, remaining: duration, fireSec: 0 });
    }
  }
  public afterHit(agent: AgentPhysicsBody, event: CombatEventResult, overkill = 0): void {
    const s = agent.tier3, w = WEAPON_BY_ID.get(s.weaponId);
    if (event.limbCrippled && hasAttributeAbility(agent.attributes, 'cripple_reload') && w) s.ammo = Math.min(w.magazine, s.ammo + Math.ceil(w.magazine * .5));
    if (event.limbCrippled && (event.limbId === EnemyLimbId.LEFT_ARM || event.limbId === EnemyLimbId.RIGHT_ARM) && hasAttributeAbility(agent.attributes, 'ammo_detonation') && !s.abilityCooldowns.ammo_detonation) {
      s.abilityCooldowns.ammo_detonation = .25;
      const spec = ATTRIBUTE_UNLOCKS.ammo_detonation.parameters;
      this.sim.pendingCombatEvents.push(...this.sim.vehiclePropManager.triggerSphericalExplosion(agent, event.impactPoint, 1, { damage: spec.damage, radiusM: spec.radiusM, impulseNs: getExplosivesParams(agent.attributes.explosives).impulseNs }));
    }
    if (ownsRelic(agent.unlockedRelics, 'RELIC_02') && overkill > 0) for (const ally of this.sim.agents.values()) {
      if (ally.entityId !== agent.entityId && ally.hp > 0 && distance(agent.position, ally.position) <= RELIC_REGISTRY[1].parameters.radiusM) {
        ally.tier3.shield = Math.min(RELIC_REGISTRY[1].parameters.shieldCap, ally.tier3.shield + overkill); ally.tier3.shieldSec = 10;
      }
    }
  }
  public mountedInput(agent: AgentPhysicsBody, input: ClientInputPacket): void {
    if (!this.sim.tier2.authoritative) return;
    const craft = this.sim.tier2.airspace.aircraft.get(agent.mountedVehicleId), s = agent.tier3;
    const fire = !!(input.buttons & INPUT_FLAG_FIRE) && !(agent.prevButtons & INPUT_FLAG_FIRE);
    if (fire && s.cooldownSec <= 0 && (craft ? agent.attributes.flying >= 2 : agent.attributes.driving >= 3)) {
      const weapon = craft ? ATTRIBUTE_UNLOCKS.chin_autocannon.parameters : ATTRIBUTE_UNLOCKS.roof_hmg.parameters;
      s.cooldownSec = weapon.cooldownSec;
      const event = this.sim.combatManager.resolveWeaponShot(agent, input.yaw, input.pitch, EnemyLimbId.TORSO, undefined, weapon.damage);
      if (event) this.sim.pendingCombatEvents.push(event);
    }
    const alternate = !!(input.buttons & INPUT_FLAG_PARRY) && !(agent.prevButtons & INPUT_FLAG_PARRY);
    if (alternate && (s.abilityCooldowns.mounted ?? 0) <= 0 && (craft ? agent.attributes.flying >= 3 : agent.attributes.driving >= 5)) {
      const spec = craft ? ATTRIBUTE_UNLOCKS.swarm_missiles.parameters : ATTRIBUTE_UNLOCKS.rocket_pods.parameters;
      const count = 'count' in spec ? spec.count : spec.projectiles;
      for (let i = 0; i < count; i++) this.launchMissile(agent, input.yaw + (i - (count - 1) / 2) * .05, input.pitch, 'swarm', spec.damage);
      s.abilityCooldowns.mounted = spec.cooldownSec;
    }
    const grab = !!(input.buttons & INPUT_FLAG_GRAB_THROW) && !(agent.prevButtons & INPUT_FLAG_GRAB_THROW);
    if (grab && craft && agent.attributes.flying >= 3) {
      if (this.winches.delete(agent.entityId)) return;
      const variant = craft.variantId ? VEHICLE_BY_ID.get(craft.variantId) : null;
      const limit = variant ? variant.winchKg : ATTRIBUTE_UNLOCKS.sky_crane.parameters.massKg;
      const attached = new Set(this.winches.values());
      const prop = [...this.sim.vehiclePropManager.props.values()].find(p => !attached.has(p.propId) && !p.holderEntityId && !p.isDetonated && p.massKg <= limit && distance(agent.position, p.position) < ATTRIBUTE_UNLOCKS.sky_crane.parameters.rangeM);
      if (prop) { this.winches.set(agent.entityId, prop.propId); prop.isThrownProjectile = true; prop.throwerEntityId = agent.entityId; }
    } else if (grab && !craft && agent.attributes.driving >= 4 && (s.abilityCooldowns.harpoon ?? 0) <= 0) {
      const target = this.enemies(agent, 35)[0];
      if (target) { target.legsCrippledTimer = 4; target.staggerTimer = 4; target.presentation.reaction = HitReaction.KNEE_DROP; target.presentation.timer = 4; s.abilityCooldowns.harpoon = 6; }
    }
  }
  public onSpire(agent: AgentPhysicsBody): void { if (ownsRelic(agent.unlockedRelics, 'RELIC_03')) agent.tier3.hoverSec = RELIC_REGISTRY[2].parameters.hoverSec; }
  public beginCounter(agent: AgentPhysicsBody): void {
    if (hasAttributeAbility(agent.attributes, 'bullet_deflect') && !agent.tier3.abilityCooldowns.deflect_recovery) {
      agent.tier3.abilityCooldowns.bullet_deflect = (220 + (agent.attributes.vigilante - 1) * 50 + agent.buildModifiers.parryWindowBonusMs) / 1000;
      agent.tier3.abilityCooldowns.deflect_recovery = TIER3_COMBAT.deflect.cooldownSec;
    }
    if (ownsRelic(agent.unlockedRelics, 'RELIC_04')) {
      const spec = RELIC_REGISTRY[3].parameters;
      this.hack(agent, spec.radiusM, spec.hackSec); agent.tier3.samDisabledSec = spec.samDisableSec;
    }
  }
  private launchMissile(agent: AgentPhysicsBody, yaw: number, pitch: number, kind: 'stinger' | 'swarm', damage: number): void {
    if (this.projectiles.length >= TIER3_RULES.maxActiveVolumes) return;
    const spec = TIER3_COMBAT[kind], d = direction(yaw, pitch);
    const target = this.enemies(agent, ATTRIBUTE_UNLOCKS.thermal_lock.parameters.rangeM).find(e => {
      const range = distance(agent.position, e.position);
      return ((e.position.x - agent.position.x) * d.x + (e.position.y - agent.position.y) * d.y + (e.position.z - agent.position.z) * d.z) / Math.max(.1, range) >= spec.coneCos;
    });
    const origin = { x: agent.position.x + d.x * 4, y: agent.position.y + 1.4 + d.y * 4, z: agent.position.z + d.z * 4 };
    const body = this.sim.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(origin.x, origin.y, origin.z).setGravityScale(0).setCcdEnabled(true));
    const collider = this.sim.world.createCollider(RAPIER.ColliderDesc.ball(TIER3_RULES.projectileRadiusM).setMass(TIER3_RULES.projectileMassKg), body);
    body.setLinvel({ x: d.x * spec.speedMps, y: d.y * spec.speedMps, z: d.z * spec.speedMps }, true);
    this.projectiles.push({ owner: agent.entityId, weaponId: 'EX_05', body, collider, fuse: spec.lifetimeSec, sticky: false, targetId: target?.enemyId, missile: kind, damage });
  }
  public onParry(agent: AgentPhysicsBody): void {
    const a = agent.attributes;
    if (hasAttributeAbility(a, 'system_hack') || ownsRelic(agent.unlockedRelics, 'RELIC_04')) this.hack(agent, 30, 30);
    if (hasAttributeAbility(a, 'disarm_counter')) for (const enemy of this.enemies(agent, 4.5)) { enemy.armsCrippledTimer = ATTRIBUTE_UNLOCKS.disarm_counter.parameters.durationSec; }
    if (ownsRelic(agent.unlockedRelics, 'RELIC_04')) {
      agent.tier3.samDisabledSec = RELIC_REGISTRY[3].parameters.samDisableSec;
      for (const ally of this.sim.agents.values()) if (distance(agent.position, ally.position) <= 30) ally.tier3.samDisabledSec = 10;
    }
    if (hasAttributeAbility(a, 'parry_revive')) for (const ally of this.sim.agents.values()) if (ally.hp <= 0 && distance(agent.position, ally.position) <= 45) {
      ally.hp = ally.maxHp * ATTRIBUTE_UNLOCKS.parry_revive.parameters.healthFraction; ally.spawnProtectionSec = 3;
    }
  }
  public fire(agent: AgentPhysicsBody, yaw: number, pitch: number, limb: EnemyLimbId, aiming = false): boolean {
    const s = agent.tier3, w = WEAPON_BY_ID.get(s.weaponId);
    if (!w) return false; // Legacy sidearm remains compatible with existing saves.
    if (!this.sim.tier2.authoritative || agent.hp <= 0 || !meetsRequirements(agent.attributes, w.requires) || s.cooldownSec > 0 || s.reloadSec > 0) return true;
    if (w.magazine && s.ammo < w.burst) { s.reloadSec = w.reloadSec; return true; }
    const shots = w.category === 'firearm' && aiming && hasAttributeAbility(agent.attributes, 'dual_limb_queue') ? Math.min(s.ammo, Math.max(w.burst, ATTRIBUTE_UNLOCKS.dual_limb_queue.parameters.limbs)) : w.burst;
    s.cooldownSec = w.cooldownSec; s.ammo = Math.max(0, s.ammo - shots); s.lastWeaponId = w.id;
    if (w.magazine && s.ammo === 0) s.reloadSec = w.reloadSec;
    if (w.category === 'firearm') {
      for (let i = 0; i < shots; i++) {
        const targetLimb = w.id === 'GN_10' ? i % 6 : hasAttributeAbility(agent.attributes, 'dual_limb_queue') && i % 2 ? (limb + 1) % 6 : limb;
        const event = this.sim.combatManager.resolveWeaponShot(agent, yaw, pitch, targetLimb, undefined, w.damage);
        if (event) { this.sim.pendingCombatEvents.push(event); }
      }
    } else if (w.category === 'melee') {
      const target = this.enemies(agent, Math.max(getStrengthParams(agent.attributes.strength).meleeWarpRangeM, w.movement.rangeM))[0];
      if (target) {
        this.damage(agent, target, w.damage * getStrengthParams(agent.attributes.strength).meleeBaseDamage / TIER3_RULES.meleeScale);
        if (hasAttributeAbility(agent.attributes, 'wall_splat')) { this.sim.combatManager.reactToHit(target, agent.position, true); }
        if (hasAttributeAbility(agent.attributes, 'shield_rip')) target.armor = Math.max(0, target.armor - ATTRIBUTE_UNLOCKS.shield_rip.parameters.armorDamage);
      }
    } else if (w.id === 'EX_05') {
      this.launchMissile(agent, yaw, pitch, 'stinger', w.damage);
    } else if (w.id === 'EX_08') {
      const d = direction(yaw, pitch), origin = { ...agent.position, y: agent.position.y + 1.4 };
      const hit = this.sim.world.castRay(new RAPIER.Ray(origin, d), TIER3_COMBAT.orbital.rangeM, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, agent.collider);
      const range = hit?.timeOfImpact ?? TIER3_COMBAT.orbital.rangeM;
      this.strikes.push({ owner: agent.entityId, position: { x: origin.x + d.x * range, y: origin.y + d.y * range, z: origin.z + d.z * range }, remaining: TIER3_COMBAT.orbital.delaySec });
    } else {
      if (this.projectiles.length < TIER3_RULES.maxActiveVolumes) {
        const d = direction(yaw, pitch), origin = { x: agent.position.x + d.x * .8, y: agent.position.y + 1.4 + d.y * .8, z: agent.position.z + d.z * .8 };
        const body = this.sim.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(origin.x, origin.y, origin.z).setCcdEnabled(true));
        const collider = this.sim.world.createCollider(RAPIER.ColliderDesc.ball(TIER3_RULES.projectileRadiusM).setMass(TIER3_RULES.projectileMassKg).setRestitution(.3), body);
        body.setLinvel({ x: d.x * TIER3_RULES.projectileSpeedMps, y: d.y * TIER3_RULES.projectileSpeedMps, z: d.z * TIER3_RULES.projectileSpeedMps }, true);
        this.projectiles.push({ owner: agent.entityId, weaponId: w.id, body, collider, fuse: TIER3_RULES.projectileFuseSec, sticky: agent.attributes.explosives >= 2 });
      }
    }
    if (w.id !== 'EX_08' && w.id !== 'EX_06') this.applyMovement(agent, w.movement, yaw, pitch);
    if (w.id === 'ML_03' || w.id === 'ML_04') { s.combatLayer = w.id === 'ML_03' ? 'katana' : 'pile_bunker'; s.combatLayerSec = w.movement.durationSec; }
    return true;
  }
  private detonate(agent: AgentPhysicsBody, weaponId: string, center: Vec3, damageOverride?: number): void {
    const w = WEAPON_BY_ID.get(weaponId)!;
      const explosive = getExplosivesParams(agent.attributes.explosives);
      const radiusM = weaponId === 'EX_08' ? TIER3_COMBAT.orbital.radiusM : explosive.blastRadiusMeters * agent.buildModifiers.blastRadiusMultiplier;
      this.sim.pendingCombatEvents.push(...this.sim.vehiclePropManager.triggerSphericalExplosion(agent, center, 1, { damage: damageOverride ?? w.damage, radiusM, impulseNs: explosive.impulseNs * agent.buildModifiers.blastImpulseMultiplier }));
      this.sim.tier2.airspace.damageInRadius(center, radiusM, damageOverride ?? w.damage);
      if (distance(agent.position, center) < radiusM && this.visible(agent, center)) agent.hp = Math.max(0, agent.hp - (damageOverride ?? w.damage) * (1 - explosive.selfDamageReduction));
      if (hasAttributeAbility(agent.attributes, 'sympathetic_chain')) for (const prop of this.sim.vehiclePropManager.props.values()) {
        if (!prop.isExplosive || prop.isDetonated || distance(prop.position, center) > 6) continue;
        prop.isDetonated = true; prop.respawnTimer = 20; prop.rigidBody.setEnabled(false);
        this.sim.pendingCombatEvents.push(...this.sim.vehiclePropManager.triggerSphericalExplosion(agent, prop.position, .5));
      }
      if (w.id === 'EX_06') for (const part of this.sim.tier2.architecture.values()) if (distance(part.spec.center, center) < 5) this.sim.tier2.damageArchitecture(part.spec.id, w.damage, 'shaped_charge', agent);
      if (hasAttributeAbility(agent.attributes, 'cluster_bomblets')) {
        const cluster = ATTRIBUTE_UNLOCKS.cluster_bomblets.parameters;
        for (let i = 0; i < cluster.count; i++) this.sim.pendingCombatEvents.push(...this.sim.vehiclePropManager.triggerSphericalExplosion(agent, { x: center.x + Math.cos(i * Math.PI * 2 / cluster.count) * cluster.radiusM, y: center.y, z: center.z + Math.sin(i * Math.PI * 2 / cluster.count) * cluster.radiusM }, 1, { damage: cluster.damage, radiusM: cluster.radiusM, impulseNs: explosive.impulseNs / cluster.count }));
      }
  }
  public applyMovement(agent: AgentPhysicsBody, m: MovementSynergy, yaw: number, pitch: number): void {
    const s = agent.tier3, d = direction(yaw, pitch); s.movementDirection = d;
    if (m.kind === 'none') return;
    if (['dash', 'shield', 'glide', 'brake'].includes(m.kind)) { s.movement = { ...m }; s.modeSec = m.durationSec; s.mode = m.kind === 'shield' ? 'ShieldSurfSlide' : m.kind === 'glide' ? 'WingsuitBankGlide' : 'AirDashBurst'; }
    if (m.kind === 'jump' || m.kind === 'lift') {
      agent.velocity.y = Math.sqrt(2 * Math.abs(WORLD_GRAVITY.y) * m.heightM); agent.grounded = false;
      // Cancel jump-ascent gravity scaling: these heights are ballistic, independent of Agility.
      s.movement = { ...m }; s.modeSec = agent.velocity.y / Math.abs(WORLD_GRAVITY.y); s.mode = 'JumpLaunch';
      if (m.kind === 'lift' && this.volumes.length < TIER3_RULES.maxActiveVolumes) this.volumes.push({ owner: agent.entityId, center: { ...agent.position }, radius: m.rangeM, height: m.heightM, remaining: m.durationSec, entered: new Set([agent.entityId]) });
      this.onXP?.(agent, 'rocket_jump');
    }
    if (m.kind === 'brake') agent.velocity.y *= m.gravityScale;
    if (m.kind === 'tether') { agent.grappleAnchor = { x: agent.position.x + d.x * m.rangeM, y: agent.position.y + 6, z: agent.position.z + d.z * m.rangeM }; agent.grappleLength = m.rangeM; agent.grappleActive = true; }
    if (m.kind === 'launch') for (const vehicle of this.sim.vehiclePropManager.vehicles.values()) if (distance(agent.position, vehicle.position) < m.rangeM && vehicle.chassisMassKg <= getStrengthParams(agent.attributes.strength).throwMassLimitKg) {
      vehicle.velocity = { x: d.x * m.speedMps, y: m.speedMps, z: d.z * m.speedMps };
    }
    if (m.kind === 'pin' || m.kind === 'uppercut') {
      const enemy = this.enemies(agent, m.rangeM)[0];
      if (enemy) { enemy.velocity = { x: d.x * m.speedMps, y: m.kind === 'uppercut' ? m.speedMps : 0, z: d.z * m.speedMps }; enemy.presentation.impulse = { ...enemy.velocity }; enemy.presentation.reaction = HitReaction.KNOCKBACK; enemy.presentation.timer = m.durationSec; if (m.kind === 'uppercut') enemy.tier3GravityScale = m.gravityScale; enemy.staggerTimer = m.durationSec; enemy.legsCrippledTimer = m.durationSec; }
    }
    if (m.kind === 'wave') this.blast(agent, m.rangeM, WEAPON_BY_ID.get(s.weaponId)?.damage ?? 40);
  }
  public activateSkill(agent: AgentPhysicsBody, id: string): string | null {
    const node = TIER3_SKILL_BY_ID.get(id), ability = node?.active, s = agent.tier3;
    if (!node || !ability || !agent.unlockedSkills.has(id) || !meetsRequirements(agent.attributes, node.requires)) return 'This active upgrade is not unlocked.';
    if (agent.hp <= 0 || (s.abilityCooldowns[id] ?? 0) > 0) return 'Ability is cooling down.';
    s.abilityCooldowns[id] = ability.cooldownSec;
    if (ability.kind === 'blast') this.blast(agent, ability.rangeM, ability.power);
    if (ability.kind === 'hack') this.hack(agent, ability.rangeM, ability.durationSec);
    if (ability.kind === 'pull') for (const e of this.enemies(agent, ability.rangeM)) {
      const d = Math.max(.1, distance(agent.position, e.position)); e.presentation.impulse = { x: (agent.position.x - e.position.x) / d * ability.power, y: 3, z: (agent.position.z - e.position.z) / d * ability.power }; e.staggerTimer = ability.durationSec;
    }
    if (ability.kind === 'shield') for (const ally of this.sim.agents.values()) if (ally.hp > 0 && distance(agent.position, ally.position) <= ability.rangeM) { ally.tier3.shield = Math.min(TIER3_RULES.shieldCap, ally.tier3.shield + ability.power); ally.tier3.shieldSec = ability.durationSec; }
    if (ability.kind === 'focus') s.focusSec = ability.durationSec * (ownsRelic(agent.unlockedRelics, 'RELIC_02') ? 2 : 1);
    if (ability.kind === 'dash' || ability.kind === 'lift') this.applyMovement(agent, { kind: ability.kind === 'lift' ? 'jump' : 'dash', speedMps: ability.power, heightM: ability.rangeM, rangeM: ability.rangeM, durationSec: ability.durationSec, gravityScale: 1 }, agent.facingYaw, 0);
    return null;
  }
  public activateAttribute(agent: AgentPhysicsBody, id: string): string | null {
    if (!Object.hasOwn(ATTRIBUTE_UNLOCKS, id) || !hasAttributeAbility(agent.attributes, id as AttributeAbility) || agent.hp <= 0) return 'Attribute ability is locked.';
    const s = agent.tier3;
    if ((s.abilityCooldowns[id] ?? 0) > 0) return 'Ability is cooling down.';
    if (id === 'airborne_focus' && !agent.grounded) { s.focusSec = TIER3_RULES.focusSec * (ownsRelic(agent.unlockedRelics, 'RELIC_02') ? 2 : 1); s.abilityCooldowns[id] = TIER3_RULES.focusCooldownSec; }
    else if (id === 'wingsuit' && !agent.grounded) { const spec = ATTRIBUTE_UNLOCKS.wingsuit.parameters; this.applyMovement(agent, { kind: 'glide', speedMps: spec.speedMps, heightM: 0, rangeM: 0, durationSec: 8, gravityScale: spec.gravityMultiplier }, agent.facingYaw, 0); }
    else if (id === 'hover_aim' && !agent.grounded && agent.jetpackFuelSec > 0) { s.mode = 'JetpackHoverAim'; s.modeSec = agent.jetpackFuelSec; }
    else if (id === 'seismic_crater' && !agent.grounded) { agent.groundSlamPending = true; agent.velocity.y = -30; s.mode = 'SuperCraterSlam'; s.modeSec = 3; }
    else if (id === 'jet_dash') { if (agent.jetpackFuelSec < .3) return 'Insufficient fuel.'; agent.jetpackFuelSec -= .3; this.applyMovement(agent, { kind: 'dash', speedMps: 28, heightM: 0, rangeM: 8.4, durationSec: .3, gravityScale: 0 }, agent.facingYaw, 0); s.abilityCooldowns[id] = 1; }
    else if (id === 'threat_scanner' || id === 'weakpoint_scan') { s.scanSec = 4; s.scannedEnemyIds = this.enemies(agent, 45, true).map(e => e.enemyId); s.abilityCooldowns[id] = 6; }
    else if (id === 'pet_pounce') {
      const pet = this.sim.cyberPetArenaManager.getPetForOwner(agent.entityId), spec = ATTRIBUTE_UNLOCKS.pet_pounce.parameters;
      const enemy = this.enemies(agent, spec.rangeM)[0];
      if (!pet || pet.hp <= 0 || pet.mode !== PetMode.FOLLOW || !enemy) return 'Aim near a visible enemy with your field companion.';
      const range = Math.max(.1, distance(pet.position, enemy.position));
      pet.velocity = { x: (enemy.position.x - pet.position.x) / range * spec.rangeM, y: 6, z: (enemy.position.z - pet.position.z) / range * spec.rangeM };
      this.damage(agent, enemy, spec.damage, EnemyLimbId.LEFT_LEG, 'pet_pounce'); s.abilityCooldowns[id] = PET_FIELD_REGISTRY[pet.species].cooldownSec;
    }
    else return 'Use this ability through its movement, weapon, vehicle or counter action.';
    return null;
  }
  public petAbility(agent: AgentPhysicsBody): string | null {
    const pet = [...this.sim.cyberPetArenaManager.pets.values()].find(p => p.ownerEntityId === agent.entityId);
    if (!pet || pet.mode !== PetMode.FOLLOW || pet.hp <= 0 || agent.hp <= 0) return 'A living field companion is required.';
    const spec = PET_FIELD_REGISTRY[pet.species], s = agent.tier3;
    if (!meetsRequirements(agent.attributes, spec.requires) || (s.abilityCooldowns[spec.id] ?? 0) > 0) return 'Companion ability is locked or cooling down.';
    s.abilityCooldowns[spec.id] = spec.cooldownSec;
    const enemy = this.enemies(agent, spec.rangeM)[0];
    if (enemy && spec.damage > 0) { this.damage(agent, enemy, spec.damage, EnemyLimbId.LEFT_LEG, 'pet_pounce'); enemy.legsCrippledTimer = spec.durationSec; enemy.tier3SlowMultiplier = spec.slowMultiplier; if (pet.species === 1) { enemy.presentation.reaction = HitReaction.KNEE_DROP; enemy.presentation.timer = spec.durationSec; enemy.presentation.impulse = { x: 0, y: 0, z: 0 }; } }
    if (spec.trackingRadiusM) { s.scanSec = spec.durationSec; s.scannedEnemyIds = this.enemies(agent, spec.trackingRadiusM, true).map(e => e.enemyId); s.trackedRelicIds = RELIC_REGISTRY.filter(r => !ownsRelic(agent.unlockedRelics, r.id) && distance(agent.position, r.position) < spec.trackingRadiusM).map(r => r.id); }
    if (pet.species === 2) { s.petAnchorSec = spec.durationSec; pet.fieldAnchor = { x: agent.position.x - Math.sin(agent.facingYaw) * 10, y: agent.position.y + 8, z: agent.position.z - Math.cos(agent.facingYaw) * 10 }; agent.grappleAnchor = { ...pet.position }; agent.grappleLength = distance(agent.position, agent.grappleAnchor); agent.grappleActive = true; agent.velocity.y = Math.max(agent.velocity.y, 6); }
    if (spec.shieldRadiusM) s.petShieldSec = spec.durationSec;
    if (spec.coverDamage) for (const part of this.sim.tier2.architecture.values()) if (distance(pet.position, part.spec.center) < spec.rangeM) this.sim.tier2.damageArchitecture(part.spec.id, spec.coverDamage, 'charged_melee', agent);
    if (spec.ventReachM) {
      const vent = PET_VENT_REGISTRY.find(v => !this.sim.tier2.architecture.get(v.doorId)?.state.broken && distance(pet.position, v.entrance) <= spec.ventReachM);
      if (vent) { pet.fieldPhaseSec = vent.phaseSec; this.ventPhases.set(agent.entityId, { petId: pet.petId, vent, start: { ...pet.position }, elapsed: 0 }); }
    }
    return null;
  }
  public spawnVehicle(agent: AgentPhysicsBody, id: string): string | null {
    const spec = VEHICLE_BY_ID.get(id);
    if (!spec || !meetsRequirements(agent.attributes, spec.requires) || !this.sim.tier2.canSwapChassis(agent)) return 'Use a cleared matching safe house with the required vehicle attribute level.';
    if ((agent.tier3.abilityCooldowns.spawn ?? 0) > 0) return 'Vehicle service is cooling down.';
    const house = SAFE_HOUSE_REGISTRY.find(h => (spec.kind === 'air' ? h.kind === 'ROOFTOP_PAD' : h.kind !== 'ROOFTOP_PAD') && this.sim.tier2.unlockedHouses.has(h.id) && distance(agent.position, h.center) < 12);
    if (!house) return 'Use a garage for ground vehicles or a landing pad for aircraft.';
    const vehicleId = spec.kind === 'air' ? 1000 + house.id : 900 + house.id;
    if (spec.kind === 'air') {
      const craft = this.sim.tier2.airspace.aircraft.get(vehicleId)!;
      if (craft.state.pilotId) return 'Vehicle is occupied.';
      this.sim.tier2.airspace.spawn(house.id); craft.collider.setMass(spec.massKg); craft.body.recomputeMassPropertiesFromColliders();
      craft.state.active = true; craft.body.setEnabled(true); craft.collider.setEnabled(true); craft.body.recomputeMassPropertiesFromColliders(); craft.body.setTranslation(house.spawn, true); craft.body.setLinvel({ x: 0, y: 0, z: 0 }, true); craft.variantId = id; craft.hp = spec.hp; craft.maxHp = spec.hp;
    } else {
      let vehicle = this.sim.vehiclePropManager.vehicles.get(vehicleId);
      if (vehicle?.driverEntityId) return 'Vehicle is occupied.';
      if (!vehicle) vehicle = this.sim.vehiclePropManager.spawnVehicle(vehicleId, spec.name, house.spawn, true);
      vehicle.variantId = id; vehicle.name = spec.name; vehicle.maxHp = spec.hp; vehicle.hp = spec.hp; vehicle.destroyed = false; vehicle.position = { ...house.spawn }; vehicle.chassisMassKg = spec.massKg;
    }
    this.vehicleVariants.set(vehicleId, id); agent.tier3.abilityCooldowns.spawn = TIER3_RULES.spawnCooldownSec;
    return null;
  }
  /** Called immediately before the swept capsule movement; impulses cannot tunnel through geometry. */
  public beforeMove(agent: AgentPhysicsBody, input: ClientInputPacket, dt: number): void {
    const s = agent.tier3;
    if (agent.grounded) { s.wallRunSec = 0; if (s.mode === 'WingsuitBankGlide' || s.mode === 'JetpackHoverAim') s.modeSec = 0; }
    if (agent.attributes.agility >= 4 && input.buttons & INPUT_FLAG_SPRINT) {
      const rail = this.sim.structures.find(r => r.material === 'ledge_trim' && Math.min(r.halfExtents.x, r.halfExtents.z) < .7 && Math.max(r.halfExtents.x, r.halfExtents.z) > 3 && Math.abs(agent.position.y - r.center.y - r.halfExtents.y) < .4 && Math.abs(agent.position.x - r.center.x) <= r.halfExtents.x + .3 && Math.abs(agent.position.z - r.center.z) <= r.halfExtents.z + .3);
      if (rail) { const d = direction(input.yaw); agent.velocity.x = rail.halfExtents.x > rail.halfExtents.z ? (Math.sign(d.x) || 1) * 22 : 0; agent.velocity.z = rail.halfExtents.z >= rail.halfExtents.x ? (Math.sign(d.z) || 1) * 22 : 0; agent.velocity.y = 0; }
    }
    if (s.modeSec > 0 && s.movement) {
      const m = s.movement;
      if (m.kind === 'dash' || m.kind === 'shield' || m.kind === 'glide') { agent.velocity.x = s.movementDirection.x * m.speedMps; agent.velocity.z = s.movementDirection.z * m.speedMps; if (m.kind === 'dash') agent.velocity.y = s.movementDirection.y * m.speedMps; }
      if (m.kind === 'jump' || m.kind === 'lift') { const ascentScale = 1 - (agent.attributes.agility - 1) / 4 * .32; if (agent.velocity.y > 0) agent.velocity.y += WORLD_GRAVITY.y * (1 - ascentScale) * dt; }
      if (m.kind === 'brake' || m.kind === 'glide') agent.velocity.y = Math.max(-2, agent.velocity.y * m.gravityScale);
    }
    if (!agent.grounded && s.modeSec > 0 && s.mode === 'WingsuitBankGlide') agent.velocity.y = Math.max(-3, agent.velocity.y);
    if (!agent.grounded && (s.hoverSec > 0 || s.modeSec > 0 && s.mode === 'JetpackHoverAim' && agent.jetpackFuelSec > 0)) { agent.velocity.y = 0; if (s.hoverSec <= 0) agent.jetpackFuelSec = Math.max(0, agent.jetpackFuelSec - dt); }
    if (!agent.grounded && input.buttons & INPUT_FLAG_SPRINT && agent.attributes.agility >= 2) {
      const forward = direction(input.yaw), side = { x: forward.z, y: 0, z: -forward.x };
      for (const sign of [-1, 1]) {
        const ray = new RAPIER.Ray({ ...agent.position, y: agent.position.y + 1 }, { x: side.x * sign, y: 0, z: side.z * sign });
        const hit = this.sim.world.castRayAndGetNormal(ray, TIER3_RULES.wallProbeM, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, agent.collider);
        if (!hit || Math.abs(hit.normal.y) > .2 || hit.collider.parent()?.isDynamic()) continue;
        if (input.buttons & INPUT_FLAG_JUMP && !(agent.prevButtons & INPUT_FLAG_JUMP) && !s.abilityCooldowns.wall_kick) { const spec = ATTRIBUTE_UNLOCKS.wall_kick.parameters; agent.velocity.x += hit.normal.x * spec.speedMps; agent.velocity.z += hit.normal.z * spec.speedMps; agent.velocity.y = spec.speedMps; s.abilityCooldowns.wall_kick = spec.cooldownSec; break; }
        if (agent.attributes.agility >= 3 && (s.wallRunSec < 3.5 || ownsRelic(agent.unlockedRelics, 'RELIC_03'))) {
          s.wallRunSec += dt; s.mode = sign < 0 ? 'WallRunLeft' : 'WallRunRight'; s.modeSec = .05;
          agent.velocity.x = forward.x * 14; agent.velocity.z = forward.z * 14;
          agent.velocity.y = ownsRelic(agent.unlockedRelics, 'RELIC_03') && input.buttons & INPUT_FLAG_JUMP ? 14 : 0;
        }
        break;
      }
    }
  }
  public landing(agent: AgentPhysicsBody, impactSpeed: number): void {
    if (this.sim.tier2.authoritative && impactSpeed < -TIER3_RULES.fallDamageThresholdMps && !agent.groundSlamPending && agent.tier3.mode !== 'SuperCraterSlam') {
      const reduction = hasAttributeAbility(agent.attributes, 'zero_terminal_fall') ? ATTRIBUTE_UNLOCKS.zero_terminal_fall.parameters.fallDamageMultiplier : 1;
      agent.hp = Math.max(0, agent.hp - (-impactSpeed - TIER3_RULES.fallDamageThresholdMps) * TIER3_RULES.fallDamagePerMps * reduction);
    }
    if (agent.attributes.agility >= 2 && impactSpeed < -7) { agent.tier3.mode = 'ParkourMomentumRoll'; agent.tier3.modeSec = .45; }
    if (agent.attributes.flying >= 5 && impactSpeed <= -26) this.blast(agent, ATTRIBUTE_UNLOCKS.dive_bomb.parameters.radiusM, ATTRIBUTE_UNLOCKS.dive_bomb.parameters.damage);
    if (agent.groundSlamPending && agent.attributes.strength >= 4) this.blast(agent, ATTRIBUTE_UNLOCKS.seismic_crater.parameters.radiusM, ATTRIBUTE_UNLOCKS.seismic_crater.parameters.damage);
  }
  public tick(dt: number): void {
    for (const [ownerId, phase] of this.ventPhases) {
      const owner = this.sim.agents.get(ownerId), pet = this.sim.cyberPetArenaManager.pets.get(phase.petId);
      if (!owner || owner.hp <= 0 || !pet || pet.hp <= 0 || pet.mode !== PetMode.FOLLOW) { if (pet) pet.fieldPhaseSec = 0; this.ventPhases.delete(ownerId); continue; }
      phase.elapsed += dt;
      const t = Math.min(1, phase.elapsed / phase.vent.phaseSec), from = t < .5 ? phase.start : phase.vent.entrance, to = t < .5 ? phase.vent.entrance : phase.vent.exit, blend = t < .5 ? t * 2 : (t - .5) * 2;
      pet.position = { x: from.x + (to.x - from.x) * blend, y: from.y + (to.y - from.y) * blend, z: from.z + (to.z - from.z) * blend };
      pet.velocity = { x: 0, y: 0, z: 0 }; pet.fieldPhaseSec = Math.max(0, phase.vent.phaseSec - phase.elapsed);
      if (t === 1) { this.sim.tier2.damageArchitecture(phase.vent.doorId, phase.vent.unlockDamage, 'pet_vent', owner); this.ventPhases.delete(ownerId); }
    }
    for (const [owner, propId] of this.winches) {
      const a = this.sim.agents.get(owner), prop = this.sim.vehiclePropManager.props.get(propId);
      const craft = a && this.sim.tier2.airspace.aircraft.get(a.mountedVehicleId);
      if (!a || a.hp <= 0 || !craft?.state.active || !prop || prop.isDetonated || prop.holderEntityId || distance(a.position, prop.position) > TIER3_COMBAT.winch.breakRangeM) { this.winches.delete(owner); continue; }
      const target = { ...craft.body.translation(), y: craft.body.translation().y - TIER3_COMBAT.winch.lengthM }, velocity = prop.rigidBody.linvel(), carrier = craft.body.linvel();
      const spring = TIER3_COMBAT.winch.springPerSec, damping = TIER3_COMBAT.winch.dampingPerSec;
      // Props use the existing swept kinematic solver. Feed its velocity, rather
      // than applying a rigid-body impulse that solver would overwrite.
      prop.velocity.x += ((target.x - prop.position.x) * spring + (carrier.x - prop.velocity.x) * damping) * dt;
      prop.velocity.y += ((target.y - prop.position.y) * spring + (carrier.y - prop.velocity.y) * damping - WORLD_GRAVITY.y) * dt;
      prop.velocity.z += ((target.z - prop.position.z) * spring + (carrier.z - prop.velocity.z) * damping) * dt;
    }
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const strike = this.strikes[i]; strike.remaining -= dt;
      const owner = this.sim.agents.get(strike.owner);
      if (!owner || owner.hp <= 0 || strike.remaining <= 0) { this.strikes.splice(i, 1); if (owner && owner.hp > 0) this.detonate(owner, 'EX_08', strike.position); }
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i], agent = this.sim.agents.get(p.owner); p.fuse -= dt;
      if (p.missile) {
        const spec = TIER3_COMBAT[p.missile], target = p.targetId && this.sim.combatManager.enemies.get(p.targetId);
        if (target && target.hp > 0) {
          const pos = p.body.translation(), delta = { x: target.position.x - pos.x, y: target.position.y + 1 - pos.y, z: target.position.z - pos.z }, len = Math.hypot(delta.x, delta.y, delta.z);
          if (len < spec.proximityM) p.fuse = 0;
          else { const old = p.body.linvel(), blend = Math.min(1, dt * spec.turnPerSec), v = { x: old.x * (1 - blend) + delta.x / len * spec.speedMps * blend, y: old.y * (1 - blend) + delta.y / len * spec.speedMps * blend, z: old.z * (1 - blend) + delta.z / len * spec.speedMps * blend }; p.body.setLinvel(v, true); }
        }
        this.sim.world.contactPairsWith(p.collider, other => { if (other.handle !== agent?.collider.handle) p.fuse = 0; });
      }
      if (!agent || agent.hp <= 0 || p.fuse <= 0) {
        const center = { ...p.body.translation() }; this.sim.world.removeRigidBody(p.body); this.projectiles.splice(i, 1);
        if (agent && agent.hp > 0) this.detonate(agent, p.weaponId, center, p.damage);
        continue;
      }
      if (p.sticky && p.body.isDynamic()) {
        let contact = false; this.sim.world.contactPairsWith(p.collider, other => { if (other.parent()?.isFixed()) contact = true; });
        if (contact) { p.body.setBodyType(RAPIER.RigidBodyType.Fixed, true); }
      }
    }
    for (const a of this.sim.agents.values()) {
      const s = a.tier3, previousReload = s.reloadSec;
      for (const key of ['reloadSec', 'cooldownSec', 'modeSec', 'shieldSec', 'focusSec', 'hoverSec', 'samDisabledSec', 'petShieldSec', 'petAnchorSec', 'scanSec', 'combatLayerSec'] as const) s[key] = Math.max(0, s[key] - dt);
      for (const key of Object.keys(s.abilityCooldowns)) { s.abilityCooldowns[key] = Math.max(0, s.abilityCooldowns[key] - dt); if (!s.abilityCooldowns[key]) delete s.abilityCooldowns[key]; }
      const pet = this.sim.cyberPetArenaManager.getPetForOwner(a.entityId);
      if (s.petAnchorSec > 0 && pet?.species === 2 && pet.hp > 0 && pet.mode === PetMode.FOLLOW) {
        a.grappleAnchor = { ...pet.position }; a.grappleLength = Math.max(2.2, distance(a.position, pet.position));
      } else if (pet?.fieldAnchor) { pet.fieldAnchor = undefined; a.grappleActive = false; }
      const w = WEAPON_BY_ID.get(s.weaponId);
      if (w && previousReload > 0 && s.reloadSec === 0) s.ammo = w.magazine;
      if (!s.modeSec) { s.mode = ''; s.movement = null; }
      if (!s.combatLayerSec) s.combatLayer = '';
      if (!s.shieldSec) s.shield = Math.max(0, s.shield - TIER3_RULES.shieldDecayPerSec * dt);
      if (!s.scanSec) { s.scannedEnemyIds = []; s.trackedRelicIds = []; }
      if (!this.sim.tier2.authoritative || a.hp <= 0) continue;
      if (a.attributes.agility >= 5 && Math.hypot(a.velocity.x, a.velocity.z) > 16 && (s.abilityCooldowns.wind_shear ?? 0) <= 0) { this.blast(a, 2, 20); s.abilityCooldowns.wind_shear = 1; }
      const t = a.telemetry;
      const current = { distance: Math.floor(t.totalDistanceMeters / 10), drive: Math.floor(t.vehiclesDrivenSeconds ?? 0), fly: Math.floor(t.airborneTimeSeconds ?? 0), jumps: t.jumpsExecuted, mantles: t.mantlesCompleted, throws: t.propsThrown ?? 0, districts: t.districtLoopsCompleted ?? 0, bounties: t.omegaBountiesCompleted ?? 0, raids: t.dreadnoughtRaidsCompleted ?? 0 };
      const prev = this.metrics.get(a.entityId) ?? current;
      const actions: Record<keyof typeof current, XPEvent> = { distance: 'run_10m', drive: 'drive_1s', fly: 'fly_1s', jumps: 'jump', mantles: 'mantle', throws: 'throw', districts: 'district_complete', bounties: 'bounty_complete', raids: 'raid_complete' };
      for (const key of Object.keys(current) as (keyof typeof current)[]) for (let i = prev[key]; i < Math.min(current[key], prev[key] + 10); i++) {
        if (key === 'distance' && (a.mountedVehicleId || !a.grounded)) continue;
        if (key === 'fly' && !a.jetpackActive && a.mountedVehicleId < 1000 && s.mode !== 'WingsuitBankGlide') continue;
        this.onXP?.(a, actions[key]);
      }
      this.metrics.set(a.entityId, current);
    }
    for (let i = this.volumes.length - 1; i >= 0; i--) {
      const volume = this.volumes[i]; volume.remaining -= dt;
      if (volume.remaining <= 0) { this.volumes.splice(i, 1); continue; }
      for (const a of this.sim.agents.values()) if (!volume.entered.has(a.entityId) && a.hp > 0 && distance(volume.center, a.position) <= volume.radius) {
        volume.entered.add(a.entityId); a.velocity.y = Math.sqrt(2 * Math.abs(WORLD_GRAVITY.y) * volume.height); a.grounded = false;
      }
    }
    for (const [id, h] of this.hacks) {
      const enemy = this.sim.combatManager.enemies.get(id), owner = this.sim.agents.get(h.owner); h.remaining -= dt; h.fireSec -= dt;
      if (!enemy || !owner || enemy.hp <= 0 || owner.hp <= 0 || h.remaining <= 0) { if (enemy) enemy.staggerTimer = 0; this.hacks.delete(id); continue; }
      enemy.staggerTimer = Math.max(enemy.staggerTimer, dt * 2);
      if (h.fireSec <= 0) { h.fireSec = 1; const target = this.enemies(owner, 30).find(e => distance(enemy.position, e.position) < 30); if (target) this.damage(owner, target, 32); }
    }
  }
}
