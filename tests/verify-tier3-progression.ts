import assert from 'node:assert/strict';
import { once } from 'node:events';
import { writeFileSync } from 'node:fs';
import { WebSocket } from 'ws';
import { ATTRIBUTE_NAMES, ATTRIBUTE_UNLOCKS, PROGRESSION_XP_THRESHOLDS, attributeLevel, attributeParams, awardActionXP } from '../shared/content/progressionRegistry.js';
import { CHASSIS_REGISTRY, TIER3_SKILL_NODES } from '../shared/content/skillTreeRegistry.js';
import { WEAPON_REGISTRY, VEHICLE_REGISTRY, RELIC_REGISTRY, PET_FIELD_REGISTRY, PET_VENT_REGISTRY, meetsRequirements, ownsRelic } from '../shared/content/arsenalAndVehicleRegistry.js';
import { availableSkillPoints, skillUnlockError } from '../shared/progression/skillTreeSystem.js';
import { createTier3State, type TraversalMode } from '../shared/progression/tier3System.js';
import { AgentAnimState, DEFAULT_ATTRIBUTES, DEFAULT_ATTRIBUTE_XP, DynamicPropType, DreadnoughtPartId, EnemyLimbId, FIXED_TIMESTEP as DT, getAllAttributeParams, INPUT_FLAG_FIRE, INPUT_FLAG_GRAB_THROW, INPUT_FLAG_PARRY, WORLD_GRAVITY } from '../shared/constants.js';
import { initRapierPhysics, SharedPhysicsWorld } from '../shared/physics/characterController.js';
import { SAFE_HOUSE_REGISTRY } from '../shared/content/worldSystemsRegistry.js';
import { SkeletalAnimator } from '../client/animation/skeletalAnimator.js';
import { HumanoidRig } from '../client/animation/humanoidRig.js';
import { CrackupAuthoritativeServer } from '../server/gameServer.js';
import { AgentDatabase } from '../server/db.js';

const started = performance.now(), checks: string[] = [];
const pass = (name: string) => { checks.push(name); console.log(`PASS: ${name}`); };
const close = (a: number, b: number, tolerance = 1e-6) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
assert.deepEqual(PROGRESSION_XP_THRESHOLDS, [0, 1000, 3500, 8500, 18000]);
for (let lv = 1; lv <= 5; lv++) {
  assert.equal(attributeLevel(PROGRESSION_XP_THRESHOLDS[lv - 1]), lv);
  if (lv > 1) assert.equal(attributeLevel(PROGRESSION_XP_THRESHOLDS[lv - 1] - 1), lv - 1);
  const t = (lv - 1) / 4, attrs = Object.fromEntries(ATTRIBUTE_NAMES.map(k => [k, lv])) as unknown as typeof DEFAULT_ATTRIBUTES, params = getAllAttributeParams(attrs);
  for (const [stat, key, lo, hi] of [ ['agility', 'runSpeed', 8, 16.5], ['agility', 'jumpApexMeters', 3.2, 14.5], ['agility', 'ledgeGrabReach', .8, 1.8], ['strength', 'maxHp', 200, 600], ['strength', 'meleeBaseDamage', 35, 140], ['strength', 'throwMassLimitKg', 150, 4000], ['strength', 'meleeWarpRangeM', 4.5, 9.5], ['driving', 'topSpeedMps', 28, 55], ['driving', 'chassisMassKg', 1400, 3200], ['driving', 'gripMultiplier', 1, 2], ['shooting', 'spreadConeDeg', 4.2, .4], ['shooting', 'lockOnRangeMeters', 40, 110], ['shooting', 'vatsHitProbBonusPct', 0, 60], ['explosives', 'blastRadiusMeters', 4.5, 12], ['explosives', 'impulseNs', 18, 65], ['explosives', 'selfDamageReduction', 0, .9], ['flying', 'jetpackFuelSeconds', 3, 12], ['flying', 'maxUpwardAccelMps2', 12, 28], ['flying', 'vtolHandlingMultiplier', 1, 2.2], ['vigilante', 'auraRadiusMeters', 15, 45], ['vigilante', 'counterWindowMs', 220, 420] ] as const) close((params[stat] as unknown as Record<string, number>)[key], lo + t * (hi - lo));
}
assert.equal(attributeLevel(NaN), 1); assert.equal(attributeLevel(Infinity), 1);
assert.deepEqual([1, 2, 3, 4, 5].map(lv => attributeParams('agility', lv).maxAirDashes), [1, 2, 2, 3, 3]);
for (const action of ['vtol_strafe', 'parry', 'rocket_jump', 'vehicle_ram', 'pet_pounce'] as const) {
  const xp = { ...DEFAULT_ATTRIBUTE_XP }; awardActionXP(xp, action); const awards = Object.values(xp).filter(x => x > 0); assert.equal(awards.length, 2); assert.equal(awards[0], awards[1]);
}
const xp = { ...DEFAULT_ATTRIBUTE_XP }; awardActionXP(xp, 'vtol_strafe'); assert.equal(xp.flying, 20); assert.equal(xp.shooting, 20);
pass('All seven curves, every level boundary, finite inputs, dash rounding and conserved 50/50 XP');

assert.equal(CHASSIS_REGISTRY.length, 5); assert.equal(TIER3_SKILL_NODES.length, 42); assert.equal(new Set(TIER3_SKILL_NODES.map(n => n.id)).size, 42);
const maxXP = Object.fromEntries(ATTRIBUTE_NAMES.map(k => [k, 18000])) as typeof xp;
for (const path of ATTRIBUTE_NAMES) {
  const nodes = TIER3_SKILL_NODES.filter(n => n.path === path), unlocked = new Set<string>();
  assert.deepEqual(nodes.map(n => n.cost), [1, 1, 2, 3, 4]); assert.equal(nodes.reduce((n, s) => n + s.cost, 0), 11);
  assert.ok(skillUnlockError(nodes[4].id, maxXP, unlocked));
  for (const node of nodes) { assert.equal(skillUnlockError(node.id, maxXP, unlocked), null); unlocked.add(node.id); assert.ok(skillUnlockError(node.id, maxXP, unlocked)); }
  assert.equal(availableSkillPoints(maxXP, unlocked), 17);
}
for (const node of TIER3_SKILL_NODES.filter(n => n.path === 'bridge')) {
  assert.equal(node.cost, 2); assert.equal(Object.keys(node.requires).length, 2);
  for (const stat of Object.keys(node.requires) as (keyof typeof xp)[]) assert.ok(skillUnlockError(node.id, { ...maxXP, [stat]: 3499 }, new Set()));
  assert.equal(skillUnlockError(node.id, maxXP, new Set()), null);
}
assert.ok(skillUnlockError('strength_1', { ...DEFAULT_ATTRIBUTE_XP }, new Set()));
pass('42 nodes: 11-point branches, two-point bridges, level/predecessor/duplicate/insufficient-point checks');

assert.deepEqual([WEAPON_REGISTRY.length, RELIC_REGISTRY.length, VEHICLE_REGISTRY.length, PET_FIELD_REGISTRY.length], [28, 4, 15, 4]);
assert.deepEqual(['melee', 'firearm', 'explosive'].map(c => WEAPON_REGISTRY.filter(w => w.category === c).length), [10, 10, 8]);
assert.deepEqual(['ground', 'air'].map(c => VEHICLE_REGISTRY.filter(w => w.kind === c).length), [8, 7]);
for (const item of [...WEAPON_REGISTRY, ...VEHICLE_REGISTRY, ...PET_FIELD_REGISTRY]) {
  assert.ok(meetsRequirements(Object.fromEntries(ATTRIBUTE_NAMES.map(k => [k, 5])) as unknown as typeof DEFAULT_ATTRIBUTES, item.requires));
  for (const stat of Object.keys(item.requires)) assert.ok(!meetsRequirements({ ...DEFAULT_ATTRIBUTES, [stat]: NaN }, item.requires));
}
pass('28 weapons, four relics, 15 vehicles and four pet field definitions with finite equip validation');

await initRapierPhysics();
const sim = new SharedPhysicsWorld();
const agent = sim.createAgent(1, 'TIER3-PHYSICS', { x: 550, y: 30, z: 550 });
const high = Object.fromEntries(ATTRIBUTE_NAMES.map(k => [k, 5])) as unknown as typeof DEFAULT_ATTRIBUTES;
try {
  assert.ok(sim.tier3.equip(agent, 'ML_04')); assert.equal(agent.tier3.weaponId, '');
  agent.attributes = { ...high }; sim.recomputeAgentBuild(agent);
  for (const [id, expected] of [['GN_04', 7], ['EX_04', 18], ['EX_03', 35]] as const) {
    agent.tier3 = createTier3State(id); agent.velocity = { x: 0, y: 0, z: 0 }; agent.grounded = false;
    sim.tier3.fire(agent, 0, 0, EnemyLimbId.TORSO); close(agent.velocity.y ** 2 / (2 * Math.abs(WORLD_GRAVITY.y)), expected);
    const ammo = agent.tier3.ammo; sim.tier3.fire(agent, 0, 0, EnemyLimbId.TORSO); assert.equal(agent.tier3.ammo, ammo, 'Cooldown must reject repeat fire');
  }
  agent.tier3 = createTier3State('ML_04'); sim.tier3.fire(agent, 0, 0, EnemyLimbId.TORSO);
  sim.tier3.beforeMove(agent, { seq: 1, dt: DT, moveX: 0, moveZ: 0, yaw: 0, pitch: 0, buttons: 0 }, DT); close(Math.hypot(agent.velocity.x, agent.velocity.z), 30);
  agent.tier3 = createTier3State('ML_03'); sim.tier3.fire(agent, 0, 0, EnemyLimbId.TORSO); close(agent.tier3.movement!.speedMps * agent.tier3.modeSec, 8);
  agent.tier3 = createTier3State('ML_05'); sim.tier3.fire(agent, 0, 0, EnemyLimbId.TORSO); assert.equal(agent.tier3.mode, 'ShieldSurfSlide'); close(agent.tier3.movement!.speedMps, 22);
  pass('Real weapon executor: 7/18/35-m launches, 30 m/s intercept, 8-m slash, 22 m/s surf and repeat-fire rejection');
  agent.tier3 = createTier3State('GN_01'); agent.tier3.ammo = 1; sim.tier3.fire(agent, 0, 0, EnemyLimbId.TORSO); assert.equal(agent.tier3.ammo, 0); sim.tier3.tick(.1); assert.equal(agent.tier3.ammo, 0); sim.tier3.tick(2); assert.equal(agent.tier3.ammo, 12);
  pass('Magazine exhaustion requires the full reload interval');
  agent.unlockedRelics.add('RELIC_03'); sim.tier3.onSpire(agent); close(agent.tier3.hoverSec, 4); agent.velocity.y = -20; agent.grounded = false; sim.tier3.beforeMove(agent, { seq: 1, dt: DT, moveX: 0, moveZ: 0, yaw: 0, pitch: 0, buttons: 0 }, DT); close(agent.velocity.y, 0);
  const ally = sim.createAgent(2, 'TIER3-ALLY', { ...agent.position }); ally.hp = 0; agent.unlockedRelics.add('RELIC_04'); sim.tier3.onParry(agent); assert.equal(ally.hp, ally.maxHp * .5); close(agent.tier3.samDisabledSec, 10);
  agent.unlockedRelics.add('RELIC_02'); agent.grounded = false; assert.equal(sim.tier3.activateAttribute(agent, 'airborne_focus'), null); close(agent.tier3.focusSec, 6);
  for (const r of RELIC_REGISTRY) assert.ok(ownsRelic(new Set([r.legacyId]), r.id));
  pass('Relic legacy aliases, four-second zero gravity, doubled focus, parry SAM protection and co-op revive');
  ally.position = { x: 560, y: 30, z: 550 }; sim.syncAgentKinematicTransform(ally);
  agent.position = { x: 550, y: 30, z: 550 }; agent.hp = agent.maxHp; sim.syncAgentKinematicTransform(agent);
  for (const spec of PET_FIELD_REGISTRY) {
    agent.tier3.abilityCooldowns = {};
    const pet = sim.cyberPetArenaManager.adoptPet(agent, spec.species); pet.position = { ...agent.position };
    const enemy = sim.combatManager.spawnEnemy(64000 + spec.species, 'FIELD-TEST', { x: 550, y: 30, z: 545 }, false);
    sim.combatManager.syncEnemyBoneColliders(enemy); sim.world.propagateModifiedBodyPositionsToColliders(); sim.world.updateSceneQueries();
    assert.equal(sim.tier3.petAbility(agent), null, spec.id); assert.ok(sim.tier3.petAbility(agent), 'Pet cooldown cannot be bypassed');
    if (spec.damage) assert.ok(enemy.hp < enemy.maxHp, spec.id);
    if (spec.species === 0) assert.equal(enemy.tier3SlowMultiplier, .5);
    if (spec.species === 1) { assert.equal(enemy.legsCrippledTimer, 5); assert.ok(agent.tier3.scannedEnemyIds.includes(enemy.enemyId)); }
    if (spec.species === 2) { assert.ok(agent.grappleActive); assert.ok(pet.fieldAnchor!.y > agent.position.y); close(agent.grappleAnchor.y, pet.position.y); assert.ok(agent.tier3.scannedEnemyIds.includes(enemy.enemyId)); }
    if (spec.species === 3) assert.equal(agent.tier3.petShieldSec, 5);
    sim.combatManager.removeEnemy(enemy.enemyId);
  }
  agent.grappleActive = false;
  pass('All four live pet abilities: limb slow, leg pin/tracking, aerial anchor/scan, directional shield and cooldown');
  const raven = sim.cyberPetArenaManager.adoptPet(agent, 2); raven.position = { x: 550, y: 32, z: 545 }; agent.tier3.abilityCooldowns = {};
  assert.equal(sim.tier3.petAbility(agent), null); raven.position = { x: 552, y: 36, z: 543 }; sim.tier3.tick(DT);
  assert.deepEqual(agent.grappleAnchor, raven.position);
  sim.applyAgentInput(agent, { seq: 50, dt: DT, moveX: 0, moveZ: 0, yaw: 0, pitch: 0, buttons: 0 }); assert.ok(agent.grappleActive, 'No held G is required during the pet anchor ability');
  sim.tier3.tick(8); assert.equal(raven.fieldAnchor, undefined); assert.equal(agent.grappleActive, false);
  pass('Raven anchor tracks the actual moving pet, survives ordinary inputs and expires cleanly');
  agent.tier3 = createTier3State('GN_04'); agent.tier3.ammo = 0;
  sim.tier3.afterHit(agent, { type: 'WEAPON_HIT', attackerEntityId: 1, targetEnemyId: 0, damageDealt: 100, armorStripped: 0, isCrit: false, limbCrippled: true, shockwaveTriggered: false, shockwaveHits: 0, impactPoint: agent.position }, 80);
  assert.equal(agent.tier3.ammo, 3); assert.equal(ally.tier3.shield, 80);
  pass('Shooting Lv5 refills half a magazine and Crown overkill grants co-op overshield');
  for (const v of VEHICLE_REGISTRY) {
    const house = SAFE_HOUSE_REGISTRY.find(h => v.kind === 'air' ? h.kind === 'ROOFTOP_PAD' : h.kind !== 'ROOFTOP_PAD')!;
    sim.tier2.unlockedHouses.add(house.id); agent.position = { ...house.center }; sim.syncAgentKinematicTransform(agent); sim.world.propagateModifiedBodyPositionsToColliders(); sim.world.updateSceneQueries(); agent.tier3.abilityCooldowns.spawn = 0;
    assert.equal(sim.tier3.spawnVehicle(agent, v.id), null, v.id);
    const vehicleId = (v.kind === 'air' ? 1000 : 900) + house.id; assert.equal(sim.tier3.vehicleVariants.get(vehicleId), v.id);
    if (v.kind === 'air') { sim.world.step(); close(sim.tier2.airspace.aircraft.get(vehicleId)!.body.mass(), v.massKg, .01); }
    else close(sim.vehiclePropManager.vehicles.get(vehicleId)!.maxHp, v.hp);
  }
  pass('All 15 vehicles spawn through cleared-site services with registered masses/HP');
  agent.position = { x: 550, y: 1, z: 550 }; agent.mountedVehicleId = 0; agent.tier3 = createTier3State('EX_01');
  sim.syncAgentKinematicTransform(agent); const bodyCount = sim.world.bodies.len();
  sim.tier3.fire(agent, 0, .4, EnemyLimbId.TORSO); assert.equal(sim.tier3.projectiles.length, 1); assert.equal(sim.world.bodies.len(), bodyCount + 1);
  const projectile = sim.tier3.projectiles[0], initialY = projectile.body.translation().y;
  sim.world.step(); assert.ok(projectile.body.translation().y > initialY);
  sim.tier3.tick(2.1); assert.equal(sim.tier3.projectiles.length, 0); assert.equal(sim.world.bodies.len(), bodyCount);
  pass('Registered grenades use real moving Rapier bodies and fuse expiry removes their colliders');
  agent.position = { x: 550, y: 30, z: 550 }; agent.hp = agent.maxHp; agent.tier3 = createTier3State('EX_05');
  sim.syncAgentKinematicTransform(agent);
  const thermal = sim.combatManager.spawnEnemy(64500, 'THERMAL-TARGET', { x: 550, y: 30, z: 530 }, false);
  sim.combatManager.syncEnemyBoneColliders(thermal); sim.world.propagateModifiedBodyPositionsToColliders(); sim.world.updateSceneQueries();
  sim.tier3.fire(agent, 0, 0, EnemyLimbId.TORSO);
  assert.equal(sim.tier3.projectiles[0].targetId, thermal.enemyId);
  thermal.position.x += 8; sim.tier3.tick(.1); assert.ok(sim.tier3.projectiles[0].body.linvel().x > 0, 'Missile must steer after the target moves');
  sim.tier3.tick(5); assert.equal(sim.tier3.projectiles.length, 0); sim.combatManager.removeEnemy(thermal.enemyId);
  agent.tier3 = createTier3State('EX_08'); sim.tier3.fire(agent, 0, -.3, EnemyLimbId.TORSO);
  assert.equal(sim.tier3.strikes.length, 1); assert.equal(sim.tier3.projectiles.length, 0); sim.tier3.tick(2.01); assert.equal(sim.tier3.strikes.length, 0);
  pass('Stinger locks and steers toward a moving target; Orbital Painter designates a delayed impact instead of a grenade');

  const craft = [...sim.tier2.airspace.aircraft.values()][0]; craft.variantId = 'VH_A04'; craft.state.active = true; craft.state.pilotId = agent.entityId;
  craft.body.setTranslation(agent.position, true); craft.body.setLinvel({ x: 0, y: 0, z: 0 }, true); craft.hp = craft.maxHp = 1100;
  agent.mountedVehicleId = craft.state.id; agent.prevButtons = 0;
  const cargo = sim.vehiclePropManager.spawnDynamicProp(64501, DynamicPropType.APC_WRECK, { x: 550, y: 20, z: 550 });
  const grab = { seq: 80, dt: DT, moveX: 0, moveZ: 0, yaw: 0, pitch: 0, buttons: INPUT_FLAG_GRAB_THROW };
  sim.tier3.mountedInput(agent, grab); assert.equal(sim.tier3.winches.get(agent.entityId), cargo.propId);
  sim.tier3.tick(DT); assert.ok(cargo.velocity.y > 0); const cargoY = cargo.position.y;
  sim.vehiclePropManager.stepDynamicProps(sim.agents, DT, []); assert.ok(cargo.position.y > cargoY);
  sim.tier3.mountedInput(agent, grab); assert.equal(sim.tier3.winches.size, 0);
  cargo.massKg = 4001; sim.tier3.mountedInput(agent, grab); assert.equal(sim.tier3.winches.size, 0);
  sim.tier2.airspace.damageInRadius(agent.position, 10, 1200); assert.equal(craft.hp, 0); sim.tier2.airspace.step(DT, 0, sim.agents); assert.equal(agent.mountedVehicleId, 0);
  pass('Sky-Crane winch lifts actual cargo, releases on input, rejects over-4000kg loads; destroyed aircraft eject pilots');

  const vent = PET_VENT_REGISTRY[0], door = sim.tier2.architecture.get(vent.doorId)!;
  agent.position = { ...vent.entrance }; agent.tier3 = createTier3State(); const fox = sim.cyberPetArenaManager.adoptPet(agent, 0); fox.position = { ...vent.entrance };
  assert.equal(sim.tier3.petAbility(agent), null); assert.equal(door.state.broken, false);
  sim.tier3.tick(vent.phaseSec / 2); assert.equal(door.state.broken, false);
  sim.tier3.tick(vent.phaseSec / 2); assert.deepEqual(fox.position, vent.exit); assert.equal(door.state.broken, true); assert.equal(door.collider.isEnabled(), false);
  pass('Fox phases through a registered vent before unlocking the physical cache door collider');

  const boss = sim.dreadnoughtDirector; boss.deploy();
  agent.position = { ...boss.position, y: boss.position.y - 30 }; agent.hp = agent.maxHp; agent.spawnProtectionSec = 0; agent.tier3 = createTier3State();
  ally.position = { x: 550, y: 0, z: 550 }; sim.syncAgentKinematicTransform(agent);
  for (let i = 0; i < 179; i++) boss.step(sim.agents, DT, true);
  sim.applyAgentInput(agent, { seq: 90, dt: DT, moveX: 0, moveZ: 0, yaw: 0, pitch: 0, buttons: INPUT_FLAG_PARRY });
  assert.ok(agent.tier3.abilityCooldowns.bullet_deflect > 0);
  const turret = boss.parts.get(DreadnoughtPartId.FLAK_TURRET_PORT)!, turretHP = turret.hp, playerHP = agent.hp;
  boss.step(sim.agents, DT * 2, true); assert.ok(turret.hp < turretHP); assert.equal(agent.hp, playerHP);
  sim.tier3.tick(.7); boss.step(sim.agents, .21, true); assert.ok(agent.hp < playerHP);
  pass('Normal Q input opens a bounded bullet-deflect window; incoming flak returns damage and damages the player after expiry');
  agent.position = { ...boss.getPartWorldPosition(DreadnoughtPartId.FLAK_TURRET_PORT) }; agent.position.x -= 5;
  sim.tier3.beginCounter(agent); assert.ok(boss.turretOverrides.has(DreadnoughtPartId.FLAK_TURRET_PORT));
  const engineHP = boss.parts.get(DreadnoughtPartId.ENGINE_FL)!.hp;
  boss.step(sim.agents, .21, true); assert.ok(boss.parts.get(DreadnoughtPartId.ENGINE_FL)!.hp < engineHP);
  boss.step(sim.agents, 31, true); assert.equal(boss.turretOverrides.size, 0);
  pass('Key-Cipher overrides an actual Dreadnought turret, turns its fire against the ship and expires after 30 seconds');
  agent.hp = agent.maxHp; agent.groundSlamPending = false; agent.tier3 = createTier3State();
  agent.attributes.agility = 4; sim.tier3.landing(agent, -30); close(agent.hp, agent.maxHp - 24);
  agent.attributes.agility = 5; const safeHP = agent.hp; sim.tier3.landing(agent, -30); assert.equal(agent.hp, safeHP);
  agent.tier3 = createTier3State('GN_01'); sim.tier3.fire(agent, 0, 0, EnemyLimbId.TORSO, true); assert.equal(agent.tier3.ammo, 10);
  pass('Zero-Terminal Fall cancels severe landing damage at Lv5; aimed Lv4 shooting consumes two rounds for its dual-limb queue');
} finally { sim.world.free(); }

const rig = new HumanoidRig(0, true), animator = new SkeletalAnimator(rig);
const states: TraversalMode[] = ['JumpLaunch', 'AirDashBurst', 'WingsuitBankGlide', 'JetpackHoverAim', 'WallRunLeft', 'WallRunRight', 'GrapplePendulumSwing', 'ShieldSurfSlide', 'SuperCraterSlam', 'ParkourMomentumRoll'];
for (const state of states) { for (let i = 0; i < 20; i++) animator.update(DT, { speed: 12, verticalSpeed: -4, grounded: false, agilityLevel: 5, strengthLevel: 5, traversalMode: state }); assert.equal(animator.state, state); assert.ok(rig.skeleton.bones.every(b => b.quaternion.toArray().every(Number.isFinite))); }
animator.update(DT, { speed: 0, verticalSpeed: -12, grounded: false, animState: AgentAnimState.FALL });
for (let i = 0; i < 90; i++) animator.update(DT, { speed: 8, verticalSpeed: 0, grounded: true, agilityLevel: 2, animState: AgentAnimState.FALL });
assert.equal(animator.state, 'TacticalSprint', 'Stale FALL snapshot must not pin a grounded player');
const before = rig.bones.LeftThigh.rotation.x;
for (let i = 0; i < 10; i++) animator.update(DT, { speed: 8, verticalSpeed: 0, grounded: true, combatLayer: 'katana', recoil: 1 });
assert.ok(Math.abs(before - rig.bones.LeftThigh.rotation.x) > .05); rig.dispose();
pass('Ten distinct traversal poses, finite blending, grounded recovery and moving combat legs');

const db = new AgentDatabase(':memory:');
try {
  const result = db.authenticateOrCreate('TIER3-SAVE', '1234'); assert.ok(result.ok);
  result.record.tier3WeaponId = 'GN_04'; result.record.xp.shooting = 3500; result.record.unlockedSkills = ['shooting_1', 'shooting_2']; db.saveAgent(result.record);
  const read = db.getAgent('TIER3-SAVE')!; assert.equal(read.tier3WeaponId, 'GN_04'); assert.equal(read.xp.shooting, 3500); assert.deepEqual(read.unlockedSkills, ['shooting_1', 'shooting_2']);
  db.db.prepare('UPDATE agents SET xp_json = ?, strength_level = 3 WHERE callsign = ?').run(JSON.stringify({ ...DEFAULT_ATTRIBUTE_XP, strength: 250, agility: 175 }), 'TIER3-SAVE');
  db.db.exec('ALTER TABLE agents DROP COLUMN progression_version');
  const migration = db as unknown as { migrateTier3(): void }; migration.migrateTier3();
  const migrated = db.getAgent('TIER3-SAVE')!; assert.equal(migrated.xp.strength, 3500); assert.equal(migrated.xp.agility, 2250); assert.equal(migrated.attributes.strength, 3);
  migration.migrateTier3(); assert.deepEqual(db.getAgent('TIER3-SAVE')!.xp, migrated.xp, 'Migration must not multiply XP again on restart');
} finally { db.close(); }
pass('SQLite retains equipment/skills; versioned legacy XP migration preserves earned levels and is idempotent');

const server = new CrackupAuthoritativeServer({ port: 0, dbPath: ':memory:' }); const sockets: WebSocket[] = [];
const waitFor = async (predicate: () => boolean) => { const deadline = Date.now() + 6000; while (!predicate()) { assert.ok(Date.now() < deadline, 'Timed out waiting for authoritative state'); await new Promise(r => setTimeout(r, 20)); } };
try {
  const port = await server.start(); let id = 0; const messages: any[] = [];
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`); sockets.push(ws); ws.on('message', (data, binary) => { if (!binary) { const msg = JSON.parse(data.toString()); messages.push(msg); if (msg.type === 'AUTH_OK') id = msg.entityId; } });
  await once(ws, 'open'); ws.send(JSON.stringify({ type: 'AUTH', callsign: 'TIER3-LIVE', pin: '1234' })); await waitFor(() => id > 0);
  const body = server.physicsWorld.agents.get(id)!; body.spawnProtectionSec = 999;
  const send = (type: string, fields: object = {}) => ws.send(JSON.stringify({ type, ...fields }));
  send('TIER3_EQUIP', { id: 'ML_10', attributes: high }); await waitFor(() => messages.some(m => m.type === 'CONTROL_ERROR')); assert.equal(body.tier3.weaponId, '');
  send('TIER3_EQUIP', { id: 'GN_01' }); await waitFor(() => body.tier3.weaponId === 'GN_01'); assert.equal(server.db.getAgent('TIER3-LIVE')!.tier3WeaponId, 'GN_01');
  const errors = messages.filter(m => m.type === 'CONTROL_ERROR').length;
  send('UNLOCK_SKILL', { skillId: 'shooting_5', points: 999, xp: maxXP }); await waitFor(() => messages.filter(m => m.type === 'CONTROL_ERROR').length > errors); assert.ok(!body.unlockedSkills.has('shooting_5'));
  assert.ok(messages.some(m => m.type === 'PLAYER_STATE' && m.tier3?.weaponId === 'GN_01'));
  pass('Live WebSocket equip/unlock authority rejects forged levels/points and persists valid equipment');
} finally { for (const socket of sockets) socket.close(); await server.stop(); }
writeFileSync('artifacts/evidence/tier3-verification.json', JSON.stringify({ passed: true, durationSec: (performance.now() - started) / 1000, checks }, null, 2) + '\n');
console.log(`Tier 3: ${checks.length} groups passed.`);
