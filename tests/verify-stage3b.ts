import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SharedPhysicsWorld, initRapierPhysics } from '../shared/physics/characterController.js';
import { FIXED_TIMESTEP as DT, DynamicPropType, WEAPON_BASE_DAMAGE, AgentAnimState } from '../shared/constants.js';
import { encodeVehicleDamage, decodeVehicleDamage } from '../shared/protocol/vehicleDamageProtocol.js';
import { VEHICLE_PANELS, VehiclePanelId, MAX_VEHICLE_DEBRIS, VEHICLE_DEBRIS_LIFETIME_SEC, VEHICLE_RESPAWN_SEC, rotateVehicleVector } from '../shared/vehicles/vehicleDefinition.js';
import { VehicleBuilder } from '../client/builders/VehicleBuilder.js';
import { productionAssets } from '../client/assets/productionAssets.js';
import { ClientVehiclePropRenderer } from '../client/entities/vehicleAndPropMesh.js';
import { SkeletalAnimator } from '../client/animation/skeletalAnimator.js';
import { HumanoidRig } from '../client/animation/humanoidRig.js';
import { HitReaction } from '../shared/combat/combatPresentation.js';

await initRapierPhysics();
const sim = new SharedPhysicsWorld(), manager = sim.vehiclePropManager;
const floor = sim.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(1000, -0.5, 1000));
sim.world.createCollider(RAPIER.ColliderDesc.cuboid(200, 0.5, 200), floor);
for (const id of [...sim.combatManager.enemies.keys()]) sim.combatManager.removeEnemy(id);
const agent = sim.createAgent(550, 'VEHICLE-TEST', { x: 1000, y: 0, z: 1004 });
const car = manager.spawnVehicle(50, 'TEST', { x: 1000, y: 1, z: 1000 }, true, Math.PI / 3);
const origin = { x: 1000, y: 1, z: 1005 };
const bodies = sim.world.bodies.len(), colliders = sim.world.colliders.len();
manager.damageVehicle(50, 500, origin); assert.equal(car.detachedMask, 0, 'Exactly 50% retains hood');
manager.damageVehicle(50, 1, origin); assert.equal(car.detachedMask, 1);
const hood = [...manager.vehicleDebris.values()][0], offset = rotateVehicleVector(VEHICLE_PANELS[0].position, car.rotation);
assert.ok(Math.hypot(hood.body.translation().x - car.position.x - offset.x, hood.body.translation().z - car.position.z - offset.z) < 0.001);
assert.ok(hood.body.isDynamic() && hood.body.isCcdEnabled()); assert.ok(Math.abs(hood.body.mass() - VEHICLE_PANELS[0].massKg) < 0.01);
manager.damageVehicle(50, 249, origin); assert.equal(car.hp, 250); assert.equal(car.detachedMask, 1, 'Exactly 25% retains doors');
manager.damageVehicle(50, 1, origin); assert.equal(car.detachedMask, 15); assert.equal(manager.vehicleDebris.size, 4);
manager.damageVehicle(50, 1, origin); assert.equal(manager.vehicleDebris.size, 4, 'Panels detach once');
const y = hood.body.translation().y; for (let i = 0; i < 30; i++) sim.world.step(); assert.notEqual(hood.body.translation().y, y);
for (let i = 0; i < 360; i++) sim.world.step();
for (const d of manager.vehicleDebris.values()) assert.ok(d.body.translation().y > -0.15, 'Dynamic panels collide with floor');
const snapshot = manager.toVehicleDamagePacket(123), bytes = encodeVehicleDamage(snapshot), decoded = decodeVehicleDamage(bytes)!;
assert.equal(bytes.byteLength, 12 + snapshot.vehicles.length * 24 + snapshot.debris.length * 56);
assert.deepEqual(decoded.vehicles, snapshot.vehicles.map(v => ({ ...v, hp: Math.fround(v.hp), wheelAngle: Math.fround(v.wheelAngle) })));
const padded = new Uint8Array(bytes.byteLength + 11); padded.set(new Uint8Array(bytes), 7); assert.ok(decodeVehicleDamage(padded.buffer, 7, bytes.byteLength));
assert.equal(decodeVehicleDamage(bytes, -1), null); assert.equal(decodeVehicleDamage(bytes, 0.5), null);
for (let n = 0; n < bytes.byteLength; n++) assert.equal(decodeVehicleDamage(bytes.slice(0, n)), null);
for (const [offset, value, size] of [[1, 2, 1], [6, 1, 2], [24, 16, 1], [25, 8, 1], [26, 1, 2]] as const) {
  const bad = bytes.slice(0), view = new DataView(bad); if (size === 1) view.setUint8(offset, value); else view.setUint16(offset, value, true); assert.equal(decodeVehicleDamage(bad), null);
}
const badFloat = bytes.slice(0); new DataView(badFloat).setFloat32(16, NaN, true); assert.equal(decodeVehicleDamage(badFloat), null);
assert.throws(() => encodeVehicleDamage({ ...snapshot, vehicles: [...snapshot.vehicles, snapshot.vehicles[0]] }));
assert.throws(() => encodeVehicleDamage({ ...snapshot, debris: [{ ...snapshot.debris[0], generation: 65535 }] }));
assert.throws(() => encodeVehicleDamage({ ...snapshot, debris: [snapshot.debris[0], snapshot.debris[0]] }));
assert.throws(() => encodeVehicleDamage({ ...snapshot, debris: [{ ...snapshot.debris[0], rotation: { x: 0, y: 0, z: 0, w: 0 } }] }));
const client = new SharedPhysicsWorld(); client.vehiclePropManager.authoritativeDamage = false;
client.vehiclePropManager.spawnVehicle(50, 'CLIENT', car.position, true);
client.vehiclePropManager.applyVehicleDamageSnapshot(decoded); assert.equal(client.vehiclePropManager.vehicleDebris.size, 4);
assert.equal(client.vehiclePropManager.damageVehicle(50, 1000, origin), null);
assert.ok([...client.vehiclePropManager.vehicleDebris.values()].every(d => d.body.isKinematic()));
client.vehiclePropManager.applyVehicleDamageSnapshot({ ...decoded, debris: [] }); assert.equal(client.vehiclePropManager.vehicleDebris.size, 0);
client.vehiclePropManager.vehicles.get(50)!.driverEntityId = 999;
client.vehiclePropManager.stepVehicles(new Map(), DT, []); assert.equal(client.vehiclePropManager.vehicles.get(50)!.driverEntityId, 999, 'Remote driver occupancy survives local prediction');
client.world.free();
for (let i = 0; i < Math.ceil(VEHICLE_DEBRIS_LIFETIME_SEC / DT) + 1; i++) manager.stepVehicles(sim.agents, DT, []);
assert.equal(manager.vehicleDebris.size, 0); assert.equal(car.detachedMask, 15, 'Expired debris cannot restore attached panels');
assert.equal(sim.world.bodies.len(), bodies); assert.equal(sim.world.colliders.len(), colliders);
agent.position = { ...car.position }; assert.equal(manager.toggleVehicleMount(agent)?.vehicleId, 50);
const generation = car.generation;
manager.damageVehicle(50, 5000, origin); assert.equal(car.hp, 0); assert.equal(agent.mountedVehicleId, 0); assert.equal(car.driverEntityId, 0);
assert.equal(manager.toggleVehicleMount(agent), null, 'Wreck cannot mount');
for (let i = 0; i < Math.ceil(VEHICLE_RESPAWN_SEC / DT) + 1; i++) manager.stepVehicles(sim.agents, DT, []);
assert.equal(car.hp, 1000); assert.equal(car.detachedMask, 0); assert.equal(car.generation, generation + 1);
assert.equal(manager.vehicleDebris.size, 0);

// Actual combat ray includes the raised canopy, respects fixed cover and the nearest enemy.
const rayCar = manager.spawnVehicle(51, 'RAY', { x: 1040, y: 0.95, z: 1000 }, true);
agent.position = { x: 1040, y: 0, z: 1006 }; sim.syncAgentKinematicTransform(agent); sim.world.step();
const hit = sim.combatManager.resolveWeaponShot(agent, 0, 0); assert.equal(hit?.type, 'VEHICLE_HIT'); assert.equal(hit?.targetVehicleId, 51); assert.equal(rayCar.hp, 1000 - WEAPON_BASE_DAMAGE);
const wall = sim.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(1040, 1.5, 1004));
sim.world.createCollider(RAPIER.ColliderDesc.cuboid(3, 1.5, 0.15), wall); sim.world.step();
const coveredHp = rayCar.hp; sim.combatManager.resolveWeaponShot(agent, 0, 0); assert.equal(rayCar.hp, coveredHp); sim.world.removeRigidBody(wall); sim.world.step();
const enemy = sim.combatManager.spawnEnemy(551, 'BEHIND-CAR', { x: 1040, y: 0, z: 995 }, false, { maxHp: 2000, maxArmor: 0 }); sim.world.step();
const enemyHp = enemy.hp; assert.equal(sim.combatManager.resolveWeaponShot(agent, 0, 0)?.type, 'VEHICLE_HIT'); assert.equal(enemy.hp, enemyHp);
enemy.position.z = 1004; sim.combatManager.syncEnemyBoneColliders(enemy); sim.world.step();
assert.equal(sim.combatManager.resolveWeaponShot(agent, 0, 0)?.type, 'WEAPON_HIT'); sim.combatManager.removeEnemy(enemy.enemyId);
agent.mountedVehicleId = 51; const ownHp = rayCar.hp; sim.combatManager.resolveWeaponShot(agent, 0, 0); assert.equal(rayCar.hp, ownHp); agent.mountedVehicleId = 0;
const splat = sim.combatManager.spawnEnemy(552, 'VEHICLE-SPLAT', { x: 1040, y: 0, z: 1003.5 }, false, { maxHp: 2000 });
sim.combatManager.reactToHit(splat, agent.position, true);
for (let i = 0; i < 12; i++) { sim.combatManager.stepEnemies([agent], DT); sim.world.step(); }
assert.equal(splat.presentation.reaction, HitReaction.WALL_SPLAT, 'Vehicle sensors are physical walls for enemy knockback'); sim.combatManager.removeEnemy(552);
// Explosions deduplicate the chassis/canopy and retain distance falloff and static cover.
const near = manager.spawnVehicle(52, 'BLAST-NEAR', { x: 1082, y: 1, z: 1000 }, true);
agent.attributes.explosives = 5;
const far = manager.spawnVehicle(53, 'BLAST-FAR', { x: 1086, y: 1, z: 1000 }, false);
sim.world.step();
const blasts = manager.triggerSphericalExplosion(agent, { x: 1080, y: 1, z: 1000 });
assert.equal(blasts.filter(e => e.targetVehicleId === 52).length, 1); assert.ok(near.hp < far.hp && far.hp < 1000);
const blastWall = sim.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(1081, 1, 1000));
sim.world.createCollider(RAPIER.ColliderDesc.cuboid(0.1, 2, 3), blastWall); sim.world.step();
const protectedHp = near.hp; manager.triggerSphericalExplosion(agent, { x: 1080, y: 1, z: 1000 }); assert.equal(near.hp, protectedHp);
// Hurled nonexplosive prop damages once.
const target = manager.spawnVehicle(54, 'PROP', { x: 1120, y: 1, z: 1000 }, true);
const prop = manager.spawnDynamicProp(500, DynamicPropType.STEEL_DUMPSTER, { x: 1120, y: 1, z: 1003 });
prop.isThrownProjectile = true; prop.throwerEntityId = agent.entityId; prop.velocity = { x: 0, y: 0, z: -50 }; sim.world.step();
const events: any[] = []; for (let i = 0; i < 12; i++) { manager.stepDynamicProps(sim.agents, DT, events); sim.world.step(); }
assert.equal(events.filter(e => e.targetVehicleId === 54).length, 1); assert.ok(target.hp < 1000);
// Fast wall collision and cooldown.
const bumper = manager.spawnVehicle(55, 'BUMPER', { x: 1160, y: 1, z: 1000 }, true);
const bumperWall = sim.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(1160, 1, 997.3));
sim.world.createCollider(RAPIER.ColliderDesc.cuboid(4, 2, 0.15), bumperWall); sim.world.step();
bumper.velocity.z = -30; manager.stepVehicles(sim.agents, DT, events); assert.ok(bumper.hp < 1000);
const bumperHp = bumper.hp; bumper.velocity.z = -30; manager.stepVehicles(sim.agents, DT, events); assert.equal(bumper.hp, bumperHp);
for (let i = 0; i < 18; i++) { manager.spawnVehicle(100 + i, 'CAP', { x: 900 + i * 4, y: 1, z: 1100 }, true); manager.damageVehicle(100 + i, 1000, origin); }
assert.equal(manager.vehicleDebris.size, MAX_VEHICLE_DEBRIS, 'Oldest debris evicted at global cap');
sim.world.free();

const builder = new VehicleBuilder(), model = builder.build(true), neighbor = builder.build(false);
assert.equal(model.source, 'procedural'); assert.equal(model.wheels.length, 4); assert.equal(model.panels.size, 4);
for (const name of ['SculptedChassis', 'AngledWindshield', 'CabinRoof', 'FullWidthTailLightBar', 'WheelWellFL']) assert.ok(model.root.getObjectByName(name), name);
const sample = { vehicleId: 1, driverEntityId: 0, isInterceptor: true, position: { x: 0, y: 1, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, speedMps: 12, steerAngleRad: 0.3, wheelCompressionRatio: [0, 0.25, 0.5, 1] as [number, number, number, number], wheelGroundedMask: 15, wallThrusterActive: true };
const damage = { vehicleId: 1, generation: 1, hp: 240, maxHp: 1000, detachedMask: 15, destroyed: false, braking: true, respawnSec: 0, wheelAngle: 0 };
model.updateVehicle(sample, damage, 1 / 60);
assert.equal(model.wheels[0].steering.rotation.y, 0.3); assert.equal(model.wheels[2].steering.rotation.y, 0);
assert.ok(model.wheels[3].suspension.position.y > model.wheels[0].suspension.position.y);
assert.ok(model.wheels.every(w => w.axle.rotation.x > 0 && w.steering.getObjectByName('StationaryBrakeCaliper')?.parent === w.steering));
assert.ok([...model.panels.values()].every(p => !p.visible)); assert.equal(model.thruster.visible, true);
model.updateVehicle(sample, { ...damage, hp: 0, destroyed: true }, DT); assert.ok(model.root.getObjectByName('ScorchedChassis')?.visible); assert.equal(model.thruster.visible, false);
model.updateVehicle(sample, { ...damage, hp: 1000, detachedMask: 0, generation: 2 }, DT); assert.ok([...model.panels.values()].every(p => p.visible));
// A valid optional model uses the same animation and detach anchors; invalid replacement stays procedural.
model.root.position.set(0, 0, 0); model.root.quaternion.identity(); model.updateVehicle({ ...sample, position: { x: 0, y: 0, z: 0 }, speedMps: 0, wallThrusterActive: false }, undefined, 0);
for (const wheel of model.wheels) { wheel.steering.rotation.set(0, 0, 0); wheel.axle.rotation.set(0, 0, 0); }
productionAssets.models.set('vehicle:interceptor', { scene: model.root, animations: [] } as unknown as GLTF);
const imported = builder.build(true); assert.equal(imported.source, 'gltf');
imported.updateVehicle(sample, damage, DT); const importedPanel = builder.buildDetachedPanel(VehiclePanelId.LEFT_DOOR, true, imported);
assert.equal(importedPanel.source, 'gltf'); assert.ok(importedPanel.root.children[0].visible); imported.dispose(); importedPanel.dispose();
productionAssets.models.set('vehicle:interceptor', { scene: new THREE.Group(), animations: [] } as unknown as GLTF);
const invalid = builder.build(true); assert.equal(invalid.source, 'procedural'); assert.equal(builder.attachModel(invalid, true), false);
productionAssets.models.delete('vehicle:interceptor'); invalid.dispose(); model.dispose(); assert.ok(builder.resources.size > 0); neighbor.dispose(); assert.equal(builder.resources.size, 0);
const renderer = new ClientVehiclePropRenderer(); renderer.updateFromSnapshots([sample], [], new Set(), false, origin, origin, 1, { serverTick: 0, vehicles: [damage], debris: [] }); renderer.dispose(); renderer.dispose(); assert.equal(renderer.rootGroup.children.length, 0);
const rig = new HumanoidRig(0), animator = new SkeletalAnimator(rig); for (let i = 0; i < 20; i++) animator.update(DT, { speed: 12, verticalSpeed: 0, animState: AgentAnimState.DRIVING_VEHICLE });
assert.equal(animator.state, 'DrivingSeated'); assert.ok(rig.bones.Pelvis.position.y < 0.35); assert.equal(rig.weapon.visible, false); rig.dispose();
console.log('Stage 3B passed: strict thresholds, one-time panels, CCD/floor motion, lifetime/cap, ejection/respawn, roof/cover/enemy rays, blast/prop/impact damage, protocol validation, prediction proxies, mesh animation/model fallback and disposal.');
