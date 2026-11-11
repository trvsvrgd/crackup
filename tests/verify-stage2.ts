import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AgentAnimState, AugmentChassisId, EnemyCombatState, EnemyLimbId, FIXED_TIMESTEP, INPUT_FLAG_MELEE } from '../shared/constants.js';
import { initRapierPhysics, RAPIER, SharedPhysicsWorld } from '../shared/physics/characterController.js';
import { createCombatPresentation, decodeCombatPresentation, encodeCombatPresentation, EnemyArchetype, HitReaction } from '../shared/combat/combatPresentation.js';
import { HumanoidRig, JOINT_LAYOUT } from '../client/animation/humanoidRig.js';
import { SkeletalAnimator, type SkeletalState } from '../client/animation/skeletalAnimator.js';
import { buildStructureFallback, assertMultipartEntity } from '../client/builders/structureFallback.js';
import { buildNeoVeridiaSector01 } from '../shared/world/neoVeridiaBlock.js';
import { ClientVehiclePropRenderer } from '../client/entities/vehicleAndPropMesh.js';

for (const style of [...Object.values(AugmentChassisId), 0, 1, 2, 3]) {
  const rig = new HumanoidRig(style, typeof style === 'number');
  assert.ok(rig.skeleton.bones.length >= 19); assert.equal(rig.bones.RightHand.children.includes(rig.weapon), true);
  assert.equal(rig.bones.Head.parent, rig.bones.Neck); assert.equal(rig.bones.LeftFoot.parent, rig.bones.LeftCalf);
  let count = 0; rig.root.traverse(o => { if (o instanceof THREE.Mesh) count++; }); assert.ok(count >= 25);
  const animation = new SkeletalAnimator(rig);
  const states: SkeletalState[] = ['IdleBreathing', 'Walk', 'TacticalSprint', 'AirborneRise', 'AirborneApex', 'FallLoop', 'HardLandingRoll', 'LedgeHang', 'LedgeMantleClimb', 'MeleeCombo1_Jab', 'MeleeCombo2_Cross', 'MeleeCombo3_SpinningKick', 'AirborneGroundSlam', 'DropToKneeStagger', 'WeaponDropRecoil', 'WallSplatStun', 'PairedCounter', 'CounterVictim'];
  for (const state of states) {
    for (let i = 0; i < 20; i++) animation.update(1 / 120, { speed: 7, verticalSpeed: 0, state, aim: 0.4, pairedElapsed: 0.3 });
    rig.root.updateMatrixWorld(true); assert.equal(animation.state, state);
    for (const bone of rig.skeleton.bones) assert.ok(bone.matrixWorld.elements.every(Number.isFinite));
  }
  rig.dispose();
}
const deterministic = (hz: number) => {
  const rig = new HumanoidRig(0, true), animator = new SkeletalAnimator(rig);
  for (let i = 0; i < hz; i++) animator.update(1 / hz, { speed: 8, verticalSpeed: 0 });
  const result = { ticks: animator.ticks, rotation: rig.bones.LeftThigh.rotation.x }; rig.dispose(); return result;
};
const a = deterministic(60), b = deterministic(120); assert.equal(a.ticks, 60); assert.deepEqual(a, b);
const fallback = new HumanoidRig(0, true), aimAnimator = new SkeletalAnimator(fallback);
for (let i = 0; i < 20; i++) aimAnimator.update(1 / 60, { speed: 4, verticalSpeed: 0, aim: 1 });
assert.ok(fallback.bones.RightUpperArm.rotation.x < -0.7); fallback.dispose();

await initRapierPhysics();
const sim = new SharedPhysicsWorld(), manager = sim.combatManager;
const vehicles = new ClientVehiclePropRenderer();
vehicles.updateFromSnapshots(sim.vehiclePropManager.toBinaryVehicleSnapshots(), sim.vehiclePropManager.toBinaryPropSnapshots(), new Set(), false, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 0);
const richRoots = vehicles.rootGroup.children.filter(c => c.userData.entityKind);
assert.ok(richRoots.length >= 12); richRoots.forEach(assertMultipartEntity);
const architectureMaterial = new THREE.MeshStandardMaterial(), architectureTrim = new THREE.MeshStandardMaterial({ emissive: 0x26bbff });
for (const s of buildNeoVeridiaSector01().filter(s => (s.halfExtents.y > 1 || s.material === 'shipping_container') && !s.isSensorOnly && !['harbor_water', 'plaza_asphalt', 'forcefield_energy'].includes(s.material))) {
  const root = buildStructureFallback(s, architectureMaterial, architectureTrim); assertMultipartEntity(root);
  const ownedMaterials = new Set<THREE.Material>();
  root.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); if (o.material !== architectureMaterial && o.material !== architectureTrim) ownedMaterials.add(o.material as THREE.Material); } }); ownedMaterials.forEach(m => m.dispose());
}
architectureMaterial.dispose(); architectureTrim.dispose();
for (const id of [...manager.enemies.keys()]) manager.removeEnemy(id);
const ground = sim.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(900, -0.5, 900));
sim.world.createCollider(RAPIER.ColliderDesc.cuboid(40, 0.5, 40), ground);
const agent = sim.createAgent(500, 'STAGE2', { x: 900, y: 0, z: 901.2 }); agent.spawnProtectionSec = 0; agent.attributes.strength = 3;
const enemy = manager.spawnEnemy(501, 'REACTION', { x: 900, y: 0, z: 900 }, false, { maxHp: 2000, maxArmor: 0 });
sim.world.step();
manager.applyLimbDamage(agent, enemy, EnemyLimbId.TORSO, 5);
assert.equal(enemy.presentation.reaction, HitReaction.FLINCH); assert.equal(enemy.presentation.flinchSec, 0.18); assert.equal(enemy.presentation.flashSec, 0.06);
assert.ok(Math.hypot(enemy.presentation.impulse.x, enemy.presentation.impulse.z) > 0);
manager.applyLimbDamage(agent, enemy, EnemyLimbId.LEFT_LEG, 1000);
assert.equal(enemy.presentation.reaction, HitReaction.KNEE_DROP); assert.equal(enemy.presentation.timer, 2.5);
const kneePos = { ...enemy.position };
for (let i = 0; i < 120; i++) manager.stepEnemies([agent], FIXED_TIMESTEP);
assert.equal(enemy.position.x, kneePos.x); assert.equal(enemy.position.z, kneePos.z); assert.ok(enemy.presentation.timer > 0.49);
manager.applyLimbDamage(agent, enemy, EnemyLimbId.RIGHT_ARM, 1000);
assert.equal(enemy.presentation.reaction, HitReaction.DISARM); assert.ok(enemy.presentation.weaponDropped); assert.equal(manager.getDroppedWeaponStates().length, 1);
const dropBefore = manager.getDroppedWeaponStates()[0].position.y;
for (let i = 0; i < 15; i++) sim.world.step();
assert.notEqual(manager.getDroppedWeaponStates()[0].position.y, dropBefore, 'Dropped gun is an actual dynamic body');

const wall = sim.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(900, 2, 897));
sim.world.createCollider(RAPIER.ColliderDesc.cuboid(5, 2, 0.2), wall); sim.world.step();
enemy.position = { x: 900, y: 0, z: 898 }; enemy.hp = 1000; enemy.combatState = EnemyCombatState.IDLE;
manager.reactToHit(enemy, agent.position, true); assert.equal(Math.hypot(enemy.presentation.impulse.x, enemy.presentation.impulse.z), 14);
const hpBefore = enemy.hp;
for (let i = 0; i < 10; i++) { manager.stepEnemies([agent], FIXED_TIMESTEP); sim.world.step(); }
assert.equal(enemy.presentation.reaction, HitReaction.WALL_SPLAT); assert.equal(enemy.hp, hpBefore - 35); assert.ok(enemy.position.z > 897.5);
assert.ok(enemy.presentation.timer > 1.65);

enemy.position = { x: 905, y: 0, z: 905 }; enemy.hp = 2000; enemy.combatState = EnemyCombatState.WINDUP;
enemy.presentation = createCombatPresentation(enemy.enemyId, EnemyArchetype.STREET_ENFORCER);
agent.position = { x: 905, y: 0, z: 906.5 }; sim.syncAgentKinematicTransform(agent); sim.world.step();
const parry = manager.executeCounterParry(agent); assert.equal(parry?.type, 'PARRY_TAKEDOWN');
assert.equal(enemy.presentation.timer, 0.65); assert.equal(enemy.presentation.pairedAgentId, agent.entityId);
assert.equal(manager.executeCounterParry(agent), null, 'No repeated paired counter');
const locked = { ...agent.position };
for (let i = 0; i < 30; i++) {
  sim.applyAgentInput(agent, { seq: i, moveX: 1, moveZ: 1, yaw: 2, pitch: 0, buttons: 0, dt: FIXED_TIMESTEP }); manager.stepEnemies([agent], FIXED_TIMESTEP);
  assert.deepEqual(agent.position, locked, 'Input cannot break paired animation');
}
for (let i = 0; i < 10; i++) manager.stepEnemies([agent], FIXED_TIMESTEP);
assert.equal(manager.isPaired(agent), false); assert.equal(enemy.presentation.pairedAgentId, 0);

enemy.position = { x: 915, y: 0, z: 915 }; enemy.hp = 2000; enemy.presentation = createCombatPresentation(enemy.enemyId, 0); enemy.combatState = EnemyCombatState.IDLE;
agent.position = { x: 915, y: 0, z: 916.2 };
const first = manager.executeMotionWarpedMelee(agent, FIXED_TIMESTEP); assert.equal(first?.comboStep, 1);
assert.equal(manager.executeMotionWarpedMelee(agent, FIXED_TIMESTEP), null, 'Held melee cannot damage every tick');
for (let i = 0; i < 18; i++) manager.stepEnemies([], FIXED_TIMESTEP);
assert.equal(manager.executeMotionWarpedMelee(agent, FIXED_TIMESTEP)?.comboStep, 2);
for (let i = 0; i < 18; i++) manager.stepEnemies([], FIXED_TIMESTEP);
assert.equal(manager.executeMotionWarpedMelee(agent, FIXED_TIMESTEP)?.comboStep, 3);
assert.ok(Math.abs(Math.hypot(enemy.presentation.impulse.x, enemy.presentation.impulse.z) - 14) < 1e-6);

agent.position = { x: 925, y: 5, z: 925 }; agent.grounded = false; sim.syncAgentKinematicTransform(agent);
sim.world.step();
sim.applyAgentInput(agent, { seq: 100, moveX: 0, moveZ: 0, yaw: 0, pitch: 0, buttons: INPUT_FLAG_MELEE, dt: FIXED_TIMESTEP });
assert.equal(agent.animState, AgentAnimState.GROUND_SLAM); assert.ok(agent.groundSlamPending);
for (let i = 0; i < 90 && agent.groundSlamPending; i++) {
  sim.applyAgentInput(agent, { seq: 101 + i, moveX: 0, moveZ: 0, yaw: 0, pitch: 0, buttons: 0, dt: FIXED_TIMESTEP }); sim.world.step();
}
assert.equal(agent.groundSlamPending, false, 'Slam resolves on landing after the button is released');
const bounty = sim.phase5Director.startOmegaBounty();
manager.applyLimbDamage(agent, bounty, EnemyLimbId.LEFT_LEG, bounty.maxHp * 0.42);
manager.applyLimbDamage(agent, bounty, EnemyLimbId.RIGHT_LEG, bounty.maxHp * 0.42);
assert.ok(bounty.hp > 0); assert.equal(bounty.capturedByEntityId, agent.entityId);
sim.phase5Director.stepPhase5Systems(sim.agents, FIXED_TIMESTEP);
assert.equal(agent.telemetry.nonLethalBountiesCompleted, 1);

const states = manager.getPresentationStates(), drops = manager.getDroppedWeaponStates();
const packet = encodeCombatPresentation(123, states, drops), decoded = decodeCombatPresentation(packet)!;
assert.equal(decoded.states[0].enemyId, enemy.enemyId); assert.equal(decoded.drops.length, drops.length);
assert.equal(decodeCombatPresentation(packet.slice(0, -1)), null);
const invalid = packet.slice(0); new DataView(invalid).setFloat32(16, NaN, true); assert.equal(decodeCombatPresentation(invalid), null);
sim.world.free();
console.log(`Stage 2 passed: ${Object.keys(JOINT_LAYOUT).length} joints, 9 silhouettes, animation/cross-fades, 60 Hz determinism, aim, flinch/flash, knee drop, disarm, 14m/s wall splat, paired lock, 3-hit cadence, ground slam, non-lethal capture, packets and multipart entities.`);
