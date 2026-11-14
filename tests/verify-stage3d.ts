import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { WeaponBuilder, weaponBuilder } from '../client/builders/WeaponBuilder.js';
import { productionAssets } from '../client/assets/productionAssets.js';
import { HumanoidRig, JOINT_LAYOUT } from '../client/animation/humanoidRig.js';
import { SkeletalAnimator, type SkeletalState } from '../client/animation/skeletalAnimator.js';
import { createMotionSample, getMixamoMotion } from '../client/animation/mixamoMotion.js';
import { CombatDebrisRenderer } from '../client/animation/combatDebris.js';
import { WeaponVariant, weaponForStyle } from '../shared/combat/weaponPresentation.js';
import { decodeCombatPresentation, encodeCombatPresentation, createCombatPresentation, EnemyArchetype, HitReaction, WARDEN_RIG_SCALE } from '../shared/combat/combatPresentation.js';
import { AugmentChassisId, AgentAnimState, EnemyLimbId } from '../shared/constants.js';
import { initRapierPhysics, SharedPhysicsWorld } from '../shared/physics/characterController.js';

const builder = new WeaponBuilder(), p = new THREE.Vector3(), d = new THREE.Vector3();
const variants = [WeaponVariant.CARBINE, WeaponVariant.MARKSMAN, WeaponVariant.HEAVY];
for (const variant of variants) {
  const first = builder.build(variant), survivor = builder.build(variant);
  assert.equal(first.source, 'procedural');
  for (const part of ['Receiver', 'UpperReceiver', 'PistolGrip', 'Stock', 'BarrelShroud', 'Optic', 'Magazine', 'MuzzleBrake', 'ChargeStrip-1', 'Grip', 'MuzzleFlashEmitter']) assert.ok(first.root.getObjectByName(part), part);
  let meshes = 0; first.root.traverse(o => { if (o instanceof THREE.Mesh) meshes++; }); assert.equal(meshes, 2, 'Two material batches per weapon');
  first.muzzleTransform(p, d); assert.ok(p.z < -0.5 && d.distanceTo(new THREE.Vector3(0, 0, -1)) < 1e-7);
  const geometries = new Set<THREE.BufferGeometry>(); survivor.root.traverse(o => { if (o instanceof THREE.Mesh) geometries.add(o.geometry); });
  let disposed = 0; geometries.forEach(g => g.addEventListener('dispose', () => disposed++));
  first.dispose(); first.dispose(); assert.equal(disposed, 0, 'Live neighbor retains pooled geometry');
  survivor.dispose(); assert.equal(disposed, geometries.size); assert.equal(builder.resources.size, 0);
}
// Exercise imported orientation normalization and malformed-model fallbacks with local test geometry.
const source = builder.build(WeaponVariant.CARBINE); source.root.position.set(2, 3, -1); source.root.rotation.y = 0.8;
productionAssets.models.set('weapon:carbine', { scene: source.root, animations: [] } as unknown as GLTF);
const imported = builder.build(); assert.equal(imported.source, 'gltf'); imported.muzzleTransform(p, d);
assert.ok(imported.grip.getWorldPosition(new THREE.Vector3()).length() < 1e-6 && d.z < -0.999);
const stillAlive = builder.build(); imported.dispose(); stillAlive.muzzleTransform(p, d); assert.ok(Number.isFinite(p.z)); stillAlive.dispose();
source.muzzle.rotation.y = Math.PI;
const invalid = builder.build(); assert.equal(invalid.source, 'procedural'); invalid.dispose();
productionAssets.models.delete('weapon:carbine'); source.dispose();
assert.equal(builder.resources.size, 0);
// One malformed candidate must not disable another kind of optional asset.
await productionAssets.loadModels({ weapon: { broken: { url: '/unavailable.glb' } } }, { loadAsync: async () => { throw new Error('Expected test failure'); } });
assert.ok(productionAssets.modelFailures.has('weapon:broken'));

const binary = await readFile('public/assets/models/characters/capoeira_ybot.glb');
const gltf = await new GLTFLoader().parseAsync(binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer, '');
assert.equal(gltf.animations.length, 39); productionAssets.characters.set('capoeira_ybot', gltf);
const sample = createMotionSample(), clips: { name: string; duration: number; frames: number }[] = [];
for (const clip of gltf.animations) {
  const motion = getMixamoMotion(gltf, clip.name); assert.ok(motion, clip.name);
  for (let i = 0; i <= 10; i++) {
    motion.sample(motion.duration * i / 10, sample);
    assert.ok(Number.isFinite(sample.pelvisY) && sample.pelvisY > -0.2 && sample.pelvisY < 3, `${clip.name}: hip height`);
    for (const q of Object.values(sample.rotations)) assert.ok(Math.abs(q.length() - 1) < 1e-5 && q.toArray().every(Number.isFinite));
  }
  assert.equal(getMixamoMotion(gltf, clip.name), motion, 'Retargeted motions share immutable samples');
  clips.push({ name: clip.name, duration: motion.duration, frames: motion.frames });
}
const states: SkeletalState[] = ['IdleBreathing', 'Walk', 'TacticalSprint', 'AirborneRise', 'LedgeMantleClimb', 'MeleeCombo1_Jab', 'MeleeCombo2_Cross', 'MeleeCombo3_SpinningKick', 'PairedCounter', 'CounterVictim', 'WeaponDropRecoil', 'DrivingSeated'];
for (const style of [...Object.values(AugmentChassisId), ...[0, 1, 2, 3]]) {
  const rig = new HumanoidRig(style, typeof style === 'number'), anim = new SkeletalAnimator(rig);
  assert.equal(rig.equipment.variant, weaponForStyle(style));
  for (const state of states) {
    for (let i = 0; i < 18; i++) {
      anim.update(1 / 60, { speed: 7, verticalSpeed: 0, state, pairedElapsed: i / 30 }); rig.root.updateMatrixWorld(true);
      assert.ok(rig.equipment.grip.getWorldPosition(p).distanceTo(rig.bones.RightHand.getWorldPosition(new THREE.Vector3())) < 1e-6, `${style}/${state}: grip remains in hand`);
      rig.equipment.muzzleTransform(p, d); assert.ok([...p, ...d].every(Number.isFinite));
    }
    if (state === 'MeleeCombo3_SpinningKick') assert.equal(anim.activeMotion, 'armada');
  }
  for (const pitch of [-0.5, 0, 0.5]) {
    for (let i = 0; i < 20; i++) anim.update(1 / 60, { speed: 4, verticalSpeed: 0, state: 'Walk', aim: 1, aimPitch: pitch });
    rig.equipment.muzzleTransform(p, d);
    assert.ok(d.distanceTo(new THREE.Vector3(0, Math.sin(pitch), -Math.cos(pitch))) < 1e-5, 'Barrel follows aim without moving palm');
  }
  const reaction = createCombatPresentation(1, EnemyArchetype.STREET_ENFORCER); reaction.weaponDropped = true; reaction.reaction = HitReaction.DISARM; reaction.timer = 0.4;
  anim.update(1 / 60, { speed: 0, verticalSpeed: 0, reaction }); assert.equal(rig.weapon.visible, false);
  rig.dispose();
}
const originalRoot = new THREE.Vector3(14, 0, -2), rig = new HumanoidRig(AugmentChassisId.PHANTOM_SHARPSHOOTER), animator = new SkeletalAnimator(rig);
rig.root.position.copy(originalRoot);
for (let i = 0; i < 16; i++) animator.update(1 / 60, { speed: 0, verticalSpeed: 0, animState: AgentAnimState.MELEE_STRIKE, combo: 3 });
assert.deepEqual(rig.root.position, originalRoot, 'Motion cannot move the authoritative agent root');
assert.equal(animator.activeMotion, 'armada');
const kickAt = (hz: number) => {
  const rig = new HumanoidRig(AugmentChassisId.PHANTOM_SHARPSHOOTER), anim = new SkeletalAnimator(rig);
  for (let i = 0; i < hz / 5; i++) anim.update(1 / hz, { speed: 0, verticalSpeed: 0, animState: AgentAnimState.MELEE_STRIKE, combo: 3 });
  const pose = rig.bones.LeftThigh.quaternion.toArray(); rig.dispose(); return pose;
};
assert.deepEqual(kickAt(60), kickAt(120), 'Retargeted kick remains deterministic across render rates');
productionAssets.characters.delete('capoeira_ybot');
animator.update(1 / 60, { speed: 0, verticalSpeed: 0, animState: AgentAnimState.MELEE_STRIKE, combo: 3 }); assert.equal(animator.activeMotion, null);
rig.dispose(); assert.equal(weaponBuilder.resources.size, 0);

await initRapierPhysics(); const sim = new SharedPhysicsWorld();
const agent = sim.createAgent(600, 'WEAPON-QA', { x: 900, y: 0, z: 902 }); agent.spawnProtectionSec = 0;
const enemy = sim.combatManager.spawnEnemy(601, 'WARDEN-QA', { x: 900, y: 0, z: 900 }, false, { maxHp: 5000, maxArmor: 0 }); enemy.presentation.archetype = EnemyArchetype.SECTOR_WARDEN;
sim.combatManager.applyLimbDamage(agent, enemy, EnemyLimbId.RIGHT_ARM, 2200);
const drops = sim.combatManager.getDroppedWeaponStates(); assert.equal(drops[0].variant, WeaponVariant.HEAVY); assert.equal(drops[0].scale, WARDEN_RIG_SCALE);
const packet = encodeCombatPresentation(55, [], drops), decoded = decodeCombatPresentation(packet)!;
assert.equal(packet.byteLength, 8 + drops.length * 40); assert.equal(decoded.drops[0].variant, WeaponVariant.HEAVY); assert.equal(decoded.drops[0].scale, Math.fround(WARDEN_RIG_SCALE));
for (let n = 0; n < packet.byteLength; n++) assert.equal(decodeCombatPresentation(packet.slice(0, n)), null);
for (const field of ['variant', 'scale', 'quaternion'] as const) {
  const broken = packet.slice(0), v = new DataView(broken);
  if (field === 'variant') v.setUint8(40, 255); else v.setFloat32(field === 'scale' ? 44 : 36, NaN, true);
  assert.equal(decodeCombatPresentation(broken), null);
}
const legacy = new ArrayBuffer(40), v = new DataView(legacy); v.setUint8(0, 8); v.setUint8(1, 1); v.setUint16(4, 1, true); v.setUint32(8, 42, true); v.setFloat32(36, 1, true);
assert.equal(decodeCombatPresentation(legacy)?.drops[0].variant, WeaponVariant.CARBINE, 'Accept legacy v1 drop packets');
const debris = new CombatDebrisRenderer(); debris.update(decoded.drops); assert.equal(debris.root.children[0].userData.weaponVariant, WeaponVariant.HEAVY);
assert.equal(debris.root.children[0].scale.x, Math.fround(WARDEN_RIG_SCALE)); debris.dispose(); debris.dispose(); assert.equal(weaponBuilder.resources.size, 0); sim.world.free();
await mkdir('output/playwright', { recursive: true });
await writeFile('output/playwright/stage3d-verification.json', JSON.stringify({ status: 'passed', checkedAt: new Date().toISOString(), variants: 3, poses: states.length, silhouettes: 9, clips, rootMotion: 'XZ remains authoritative', networkVersion: 2, legacyVersionAccepted: 1 }, null, 2));
console.log('Stage 3D passed: three batched weapons, all sockets/aim/reactions, valid and invalid imports, pooled cleanup, scaled disarms, v1/v2 packet validation and 39 genuine Mixamo clips retargeted onto 19 joints.');
