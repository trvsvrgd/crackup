import assert from 'node:assert/strict';
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SharedPhysicsWorld, initRapierPhysics, RAPIER } from '../shared/physics/characterController.js';
import { RelaySystem } from '../shared/world/relaySystem.js';
import { RelayMode, createRelayPlan, getRelayPlans, relayBaseVertices, RELAY_REBOOT_SEC } from '../shared/world/relayDefinition.js';
import { buildNeoVeridiaSector01 } from '../shared/world/neoVeridiaBlock.js';
import { generateNeoVeridiaOrbs } from '../shared/world/orbSystem.js';
import { DISTRICT_LOOP_SPECS } from '../shared/world/phase5Systems.js';
import { encodeRelays, decodeRelays } from '../shared/protocol/relayProtocol.js';
import { EnemyCombatManager } from '../shared/combat/enemyRigSystem.js';
import { FIXED_TIMESTEP as DT, EnemyCombatState, INPUT_FLAG_OBJECTIVE_JETPACK } from '../shared/constants.js';
import { RelayBuilder } from '../client/builders/RelayBuilder.js';
import { productionAssets } from '../client/assets/productionAssets.js';
import { ClientPhase5WorldRenderer } from '../client/entities/phase5WorldMesh.js';
import { VehicleAndPropManager } from '../shared/physics/vehicleAndPropSystem.js';

await initRapierPhysics();
const sim = new SharedPhysicsWorld(), relay = sim.relaySystem, plans = relay.plans, agent = sim.createAgent(555, 'RELAY-TEST', { x: 0, y: 0, z: 0 });
assert.equal(plans.length, 8); assert.deepEqual(getRelayPlans(buildNeoVeridiaSector01()), plans);
const origin = { x: 0, y: 1, z: 0 }, builder = new RelayBuilder();
const ventHandles = new Set(relay.ventColliders.keys());
const solidHandles = new Set<number>();
sim.world.forEachCollider(c => { if (c.parent()?.translation() && plans.some(p => c.parent()!.translation().x === p.origin.x && c.parent()!.translation().z === p.origin.z) && !c.isSensor()) solidHandles.add(c.handle); });
for (const plan of plans) {
  const built = builder.build(plan);
  assert.equal(built.source, 'procedural'); assert.equal(built.dishes.length, 3); assert.equal(built.vents.length, 3); assert.deepEqual(built.baseHull, relayBaseVertices(plan.towerOffset));
  assert.ok(built.root.getObjectByName('TwelveMeterLattice')); assert.ok(built.root.getObjectByName('BunkerHazardStriping')); assert.ok(built.root.getObjectByName('HolographicDisplay'));
  assert.deepEqual(built.anchors.get('Terminal')!.position.toArray(), [0, 0, 0]);
  const lattice = built.root.getObjectByName('TwelveMeterLattice') as THREE.InstancedMesh, matrix = new THREE.Matrix4(), pose = new THREE.Object3D();
  for (const [i, b] of plan.boxes.entries()) {
    lattice.getMatrixAt(i, matrix); pose.position.set(b.center.x, b.center.y, b.center.z); pose.rotation.set(b.rotation!.x, 0, b.rotation!.z); pose.scale.set(b.halfExtents.x * 2, b.halfExtents.y * 2, b.halfExtents.z * 2); pose.updateMatrix();
    matrix.elements.forEach((n, j) => assert.ok(Math.abs(n - pose.matrix.elements[j]) < 1e-5, 'Visible structural transforms use shared collision descriptors'));
  }
  for (const orb of generateNeoVeridiaOrbs()) assert.ok(!plan.boxes.some(b => Math.abs(orb.position.x - plan.origin.x - b.center.x) < b.halfExtents.x + 0.8 && Math.abs(orb.position.y - plan.origin.y - b.center.y) < b.halfExtents.y + 0.8 && Math.abs(orb.position.z - plan.origin.z - b.center.z) < b.halfExtents.z + 0.8), 'New relay does not obstruct any saved orb');
  const direction = { x: plan.origin.x, y: 0, z: plan.origin.z }, length = Math.hypot(direction.x, direction.z);
  assert.ok(sim.world.castShape({ x: 0, y: 0.95, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, { x: direction.x / length, y: 0, z: direction.z / length }, new RAPIER.Capsule(0.55, 0.38), 0, length, false, undefined, undefined, undefined, undefined, c => solidHandles.has(c.handle)) === null, 'Plaza-to-console approach stays clear of relay solids');
  // A real ray stops at the visible octagonal bunker.
  const center = { x: plan.origin.x + plan.towerOffset.x, y: 0.8, z: plan.origin.z + plan.towerOffset.z };
  const hit = sim.world.castRay(new RAPIER.Ray({ x: center.x + 4, y: center.y, z: center.z }, { x: -1, y: 0, z: 0 }), 4, true, undefined, undefined, undefined, undefined, c => solidHandles.has(c.handle));
  assert.ok(hit && Math.abs(hit.timeOfImpact - 2.2) < 0.01);
  const initial = built.dishes[0].rotation.y, healthy = relay.states.get(plan.relayId)!;
  built.updateRelay(DT, healthy, 1); assert.notEqual(built.dishes[0].rotation.y, initial);
  const stopped = { ...healthy, mode: RelayMode.SHUTDOWN, heat: 1, rebootSec: 8, ventHp: [0, 0, 0] as [number, number, number] }, before = built.dishes[0].rotation.y;
  built.updateRelay(DT, stopped, 2); assert.equal(built.dishes[0].rotation.y, before); assert.equal(built.vents[0].getObjectByName('VentLouvers')!.visible, false);
  assert.equal(built.vents[0].getObjectByName('VentExposedCoil')!.visible, true);
  built.updateRelay(DT, healthy, 3); assert.equal(built.vents[0].getObjectByName('VentLouvers')!.visible, true); built.dispose();
}
assert.equal(builder.resources.size, 0);
const state = relay.states.get(1)!;
assert.equal(relay.damageVent(1, 0, NaN, origin), null); assert.equal(relay.damageVent(1, 3, 20, origin), null);
relay.damageVent(1, 0, 119, origin); assert.equal(state.ventHp[0], 1); relay.step(DT); assert.equal(state.heat, 0);
relay.damageVent(1, 0, 1, origin); assert.equal(state.mode, RelayMode.OVERHEATING); assert.equal(relay.damageVent(1, 0, 100, origin), null);
for (let i = 0; i < 60; i++) relay.step(DT); assert.ok(Math.abs(state.heat - 0.04) < 1e-6);
relay.damageVent(1, 1, 999, origin); relay.damageVent(1, 2, 999, origin);
for (let i = 0; i < 241; i++) relay.step(DT); assert.equal(state.mode, RelayMode.SHUTDOWN);
assert.equal(sim.phase5Director.districtLoops.get(DISTRICT_LOOP_SPECS[0].district)!.currentStage, 1, 'Overheat cannot skip hacking');
const generation = state.generation;
for (let i = 0; i < Math.ceil(RELAY_REBOOT_SEC / DT) + 1; i++) relay.step(DT);
assert.equal(state.mode, RelayMode.ONLINE); assert.equal(state.generation, generation + 1); assert.deepEqual(state.ventHp, [120, 120, 120]);

// Independent simple world: actual weapon ray, static cover, nearest vehicle/vent ordering and blast routing.
const world = new RAPIER.World({ x: 0, y: -24, z: 0 }), combat = new EnemyCombatManager(world), local = createRelayPlan(30, 0, 0, { x: 900, y: 0, z: 900 }, { x: 0, y: 0, z: 0 });
const system = new RelaySystem(world, combat, [local], () => false);
const eye = { x: 900, y: 0.95, z: 894 };
agent.position = { x: eye.x, y: eye.y - 1.55, z: eye.z }; world.step();
const shot = combat.resolveWeaponShot(agent, Math.PI, 0); assert.equal(shot?.type, 'RELAY_VENT_HIT'); assert.equal(shot?.targetVentId, 2);
assert.equal(system.states.get(30)!.ventHp[2], 78);
const vehicleManager = new VehicleAndPropManager(world, combat), car = vehicleManager.spawnVehicle(100, 'RAY-COVER', { x: 900, y: 1, z: 896.4 }, true);
world.step(); const nearest = combat.resolveWeaponShot(agent, Math.PI, 0);
assert.equal(nearest?.type, 'VEHICLE_HIT'); assert.equal(car.hp, 958); assert.equal(system.states.get(30)!.ventHp[2], 78, 'A nearer car absorbs the shot before a vent');
world.removeRigidBody(car.rigidBody); combat.weaponObstacleProbes.delete('vehicle'); world.step();
const cover = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(900, 1, 896));
world.createCollider(RAPIER.ColliderDesc.cuboid(3, 2, 0.1), cover); world.step(); combat.resolveWeaponShot(agent, Math.PI, 0); assert.equal(system.states.get(30)!.ventHp[2], 78);
world.removeRigidBody(cover); world.step();
const blast = system.applyBlast(agent, { x: 900, y: 1, z: 896 }, 1); assert.ok(blast.some(e => e.targetVentId === 2));
assert.ok(!blast.some(e => e.targetVentId === 0), 'Bunker occludes the far-side vent from this blast');
system.authoritative = false; const saved = system.snapshot(5); assert.equal(system.damageVent(30, 0, 999, origin), null);
system.applySnapshot({ serverTick: 6, relays: [{ ...saved.relays[0], heat: 0.5 }] }); assert.equal(system.states.get(30)!.heat, 0.5);
system.dispose(); assert.equal(world.bodies.len(), 0); assert.equal(world.colliders.len(), 0); assert.equal(combat.weaponObstacleProbes.has('relay'), false); world.free();

const packet = relay.snapshot(77), bytes = encodeRelays(packet); assert.equal(bytes.byteLength, 8 + 8 * 28); assert.deepEqual(decodeRelays(bytes), packet);
for (let i = 0; i < bytes.byteLength; i++) assert.equal(decodeRelays(bytes.slice(0, i)), null);
const padded = new Uint8Array(bytes.byteLength + 10); padded.set(new Uint8Array(bytes), 4); assert.ok(decodeRelays(padded.buffer, 4, bytes.byteLength));
assert.equal(decodeRelays(bytes, -1), null); assert.equal(decodeRelays(bytes, 0.5), null);
for (const [offset, value] of [[1, 9], [12, 4], [13, 2], [14, 1]]) { const bad = bytes.slice(0); new DataView(bad).setUint8(offset, value); assert.equal(decodeRelays(bad), null); }
const nan = bytes.slice(0); new DataView(nan).setFloat32(16, NaN, true); assert.equal(decodeRelays(nan), null);
assert.throws(() => encodeRelays({ ...packet, relays: [packet.relays[0], packet.relays[0]] }));
assert.throws(() => encodeRelays({ ...packet, relays: [{ ...packet.relays[0], hacked: true }] }));
assert.throws(() => encodeRelays({ ...packet, relays: [{ ...packet.relays[0], ventHp: [0, 120, 120] }] }), 'An online relay cannot claim an intact cooling system with a destroyed vent');
assert.throws(() => encodeRelays({ ...packet, relays: [{ ...packet.relays[0], mode: RelayMode.SHUTDOWN, heat: 0.9, rebootSec: 8, ventHp: [0, 120, 120] }] }));
// Hack B first: exact individual flags must remain independent of the legacy hacked-count approximation.
let sequence = 1;
const interact = (p: { x: number; y: number; z: number }) => {
  agent.position = { ...p }; agent.hp = agent.maxHp; agent.spawnProtectionSec = 1000; sim.syncAgentKinematicTransform(agent);
  for (const buttons of [0, INPUT_FLAG_OBJECTIVE_JETPACK]) { sim.applyAgentInput(agent, { seq: sequence++, moveX: 0, moveZ: 0, yaw: 0, pitch: 0, buttons, dt: DT }); sim.stepWorld(); }
};
interact(DISTRICT_LOOP_SPECS[0].stage1Terminals[1]);
assert.equal(relay.states.get(1)!.hacked, false); assert.equal(relay.states.get(2)!.hacked, true);
for (const spec of DISTRICT_LOOP_SPECS) {
  const loop = sim.phase5Director.districtLoops.get(spec.district)!;
  interact(spec.stage1Terminals[0]); interact(spec.stage1Terminals[1]); assert.equal(loop.currentStage, 2);
  sim.combatManager.enemies.get(spec.lieutenantEnemyId)!.combatState = EnemyCombatState.DEAD; sim.phase5Director.stepPhase5Systems(sim.agents, DT); assert.equal(loop.currentStage, 3);
  interact(spec.coreOverridePos); assert.equal(loop.currentStage, 3, 'Living kingpin still blocks core override');
  sim.combatManager.enemies.get(spec.kingpinEnemyId)!.combatState = EnemyCombatState.DEAD; interact(spec.coreOverridePos); assert.equal(loop.currentStage, 4);
}
// Optional-model activation and fallback; one clone cannot release its neighbors' shared resources.
const source = builder.build(plans[0]); source.root.position.set(0, 0, 0);
productionAssets.models.set('relay:district-0', { scene: source.root, animations: [] } as unknown as GLTF);
const imported = builder.build(plans[0]); assert.equal(imported.source, 'gltf');
imported.updateRelay(DT, { ...packet.relays[0], ventHp: [0, 120, 120] }, 3); assert.equal(imported.vents[0].getObjectByName('VentLouvers')!.visible, false); imported.dispose();
productionAssets.models.set('relay:district-0', { scene: new THREE.Group(), animations: [] } as unknown as GLTF);
const invalid = builder.build(plans[0]); assert.equal(invalid.source, 'procedural'); assert.equal(builder.attachModel(invalid), false);
productionAssets.models.delete('relay:district-0'); invalid.dispose(); source.dispose(); assert.equal(builder.resources.size, 0);
const scene = new THREE.Scene(), renderer = new ClientPhase5WorldRenderer(scene);
renderer.updateFromSnapshot(null, [], [], origin, 8, 1, relay.snapshot(200)); renderer.dispose(); renderer.dispose(); assert.equal(scene.children.length, 0);
assert.equal(relay.ventColliders.size, ventHandles.size); sim.world.free();
console.log('Stage 3C passed: 8 relays, shared octagon/lattice colliders, clear mission/orb approaches, vent damage/heat/shutdown/reboot, rays/cover/blast, packet validation, prediction, all four district loops, animation, GLTF fallback and resource cleanup.');
