import type { TraversalMode } from '../../shared/progression/tier3System.js';
import { COUNTER_CONTACT_SEC, PAIRED_DURATION_SEC } from '../../shared/protocol/presentationProtocol.js';
import * as THREE from 'three';
import { AgentAnimState } from '../../shared/constants.js';
import { HitReaction, EnemyArchetype, type CombatPresentation } from '../../shared/combat/combatPresentation.js';
import { HumanoidRig, JOINT_LAYOUT, type JointName } from './humanoidRig.js';
import { createMotionSample, getMixamoMotion } from './mixamoMotion.js';
import { productionAssets } from '../assets/productionAssets.js';

export type SkeletalState = Exclude<TraversalMode, ''> | 'IdleBreathing' | 'DrivingSeated' | 'Walk' | 'TacticalSprint' | 'AirborneRise' | 'AirborneApex' | 'FallLoop' | 'HardLandingRoll' | 'LedgeHang' | 'LedgeMantleClimb' | 'AirDash' | 'MeleeCombo1_Jab' | 'MeleeCombo2_Cross' | 'MeleeCombo3_SpinningKick' | 'AirborneGroundSlam' | 'DropToKneeStagger' | 'WeaponDropRecoil' | 'WallSplatStun' | 'PairedCounter' | 'CounterVictim' | 'KnockbackTumble' | 'BlindStagger' | 'Windup';
export interface AnimationInput {
  speed: number; verticalSpeed: number; animState?: AgentAnimState; aim?: number; aimPitch?: number;
  combo?: number; mantleProgress?: number; reaction?: CombatPresentation; pairedElapsed?: number;
  state?: SkeletalState; recoil?: number; grounded?: boolean; agilityLevel?: number; strengthLevel?: number;
  traversalMode?: TraversalMode; velocityX?: number; velocityZ?: number; facingYaw?: number;
  combatLayer?: '' | 'katana' | 'pile_bunker';
}
type Pose = Record<JointName, THREE.Euler>;
const newPose = () => Object.fromEntries(Object.keys(JOINT_LAYOUT).map(n => [n, new THREE.Euler()])) as Pose;
const JOINT_NAMES = Object.keys(JOINT_LAYOUT) as JointName[];

/** Fixed 60 Hz pose simulation with cross-fades sampled from the outgoing pose, including interrupted transitions. */
export class SkeletalAnimator {
  public state: SkeletalState = 'IdleBreathing';
  public ticks = 0;
  private accumulator = 0;
  private phase = 0;
  private gaitPhase = 0;
  private age = 0;
  private blend = 1;
  private previous = newPose();
  private pose = newPose();
  private from = newPose();
  private readonly targetPose = newPose();
  private readonly rotationA = new THREE.Quaternion();
  private readonly rotationB = new THREE.Quaternion();
  private readonly pitchRotation = new THREE.Quaternion();
  private readonly pitchAxis = new THREE.Vector3(1, 0, 0);
  private previousVertical = 0;
  private previousGrounded = true;
  private previousYaw = 0;
  private bank = 0;
  private readonly motionSample = createMotionSample();
  private readonly blendedMotion = createMotionSample();
  private readonly previousMotion = createMotionSample();
  private motionWeight = 0;
  private previousMotionWeight = 0;
  private readonly handWorld = new THREE.Quaternion();
  private readonly aimWorld = new THREE.Quaternion();
  public activeMotion: string | null = null;
  constructor(public readonly rig: HumanoidRig) {}
  private choose(input: AnimationInput): SkeletalState {
    const r = input.reaction;
    if (r?.reaction === HitReaction.PAIRED_COUNTER && r.timer > 0) return 'CounterVictim';
    if (r?.reaction === HitReaction.WALL_SPLAT && r.timer > 0) return 'WallSplatStun';
    if (r?.reaction === HitReaction.KNEE_DROP && r.timer > 0) return 'DropToKneeStagger';
    if (r?.reaction === HitReaction.DISARM && r.timer > 0) return 'WeaponDropRecoil';
    if (r?.reaction === HitReaction.KNOCKBACK && r.timer > 0) return 'KnockbackTumble';
    if (input.state) return input.state;
    if (input.traversalMode && (input.traversalMode !== 'SuperCraterSlam' || (input.strengthLevel ?? 1) >= 4) && (input.traversalMode !== 'ParkourMomentumRoll' || (input.agilityLevel ?? 1) >= 2)) return input.traversalMode;
    // Ground contact outranks stale aerial snapshot labels. Landing has a bounded lifetime.
    if (input.grounded === true && !this.previousGrounded && this.previousVertical < -7 && (input.agilityLevel ?? 1) >= 2) return 'ParkourMomentumRoll';
    if (input.grounded === true && this.state === 'ParkourMomentumRoll' && this.age < .45) return this.state;
    if (input.grounded === true && [AgentAnimState.FALL, AgentAnimState.JUMP_ASCEND, AgentAnimState.AIR_DASH, AgentAnimState.JETPACK_FLIGHT].includes(input.animState!)) return input.speed > 6 ? 'TacticalSprint' : input.speed > .25 ? 'Walk' : 'IdleBreathing';
    switch (input.animState) {
      case AgentAnimState.DRIVING_VEHICLE: return 'DrivingSeated';
      case AgentAnimState.PARRY_TAKEDOWN: return 'PairedCounter';
      case AgentAnimState.MELEE_STRIKE: return input.combo === 3 ? 'MeleeCombo3_SpinningKick' : input.combo === 2 ? 'MeleeCombo2_Cross' : 'MeleeCombo1_Jab';
      case AgentAnimState.GROUND_SLAM: return 'AirborneGroundSlam';
      case AgentAnimState.MANTLE_VAULT: return (input.mantleProgress ?? 0) < 0.12 ? 'LedgeHang' : 'LedgeMantleClimb';
      case AgentAnimState.AIR_DASH: return input.grounded !== undefined ? 'AirDashBurst' : 'AirDash';
      case AgentAnimState.GRAPPLE_SWING: return 'GrapplePendulumSwing';
      case AgentAnimState.JETPACK_FLIGHT: return 'JetpackHoverAim';
      case AgentAnimState.JUMP_ASCEND: if (input.grounded === false && input.verticalSpeed > .8) return 'JumpLaunch'; return Math.abs(input.verticalSpeed) < 0.8 ? 'AirborneApex' : 'AirborneRise';
      case AgentAnimState.FALL: return Math.abs(input.verticalSpeed) < 0.8 ? 'AirborneApex' : 'FallLoop';
    }
    if (this.previousVertical < -7 && Math.abs(input.verticalSpeed) < 0.2) return 'HardLandingRoll';
    if (this.state === 'HardLandingRoll' && this.age < 0.45) return this.state;
    return input.speed > 6 ? 'TacticalSprint' : input.speed > 0.25 ? 'Walk' : 'IdleBreathing';
  }
  public update(dt: number, input: AnimationInput): void {
    if (!Number.isFinite(dt)) return;
    this.accumulator += Math.max(0, Math.min(0.25, dt));
    while (this.accumulator + 1e-9 >= 1 / 60) {
      this.accumulator -= 1 / 60; this.ticks++; this.phase += 1 / 60;
      // Integrate cadence so acceleration cannot rewind or jump the foot cycle.
      this.gaitPhase = (this.gaitPhase + (5 + Math.max(0, input.speed)) / 60) % (Math.PI * 2);
      const next = this.choose(input);
      if (next !== this.state) {
        for (const n of JOINT_NAMES) this.from[n].copy(this.pose[n]);
        this.state = next; this.blend = 0; this.age = 0;
      }
      this.age += 1 / 60; this.blend = Math.min(1, this.blend + 1 / (60 * 0.14));
      const target = this.sample(input), t = this.blend * this.blend * (3 - 2 * this.blend);
      for (const n of JOINT_NAMES) {
        this.previous[n].copy(this.pose[n]);
        this.pose[n].set(THREE.MathUtils.lerp(this.from[n].x, target[n].x, t), THREE.MathUtils.lerp(this.from[n].y, target[n].y, t), THREE.MathUtils.lerp(this.from[n].z, target[n].z, t));
      }
      this.previousVertical = input.verticalSpeed;
      this.previousGrounded = input.grounded ?? Math.abs(input.verticalSpeed) < .2;
      const yaw = input.facingYaw ?? this.previousYaw;
      const turn = Math.atan2(Math.sin(yaw - this.previousYaw), Math.cos(yaw - this.previousYaw));
      const targetBank = THREE.MathUtils.clamp(-turn * 12 * Math.min(1, input.speed / 8), -Math.PI / 10, Math.PI / 10);
      this.bank += (targetBank - this.bank) * .2; this.previousYaw = yaw;
      this.previousMotionWeight = this.motionWeight;
      for (const n of JOINT_NAMES) this.previousMotion.rotations[n].copy(this.blendedMotion.rotations[n]);
      this.previousMotion.pelvisY = this.blendedMotion.pelvisY;
      const motion = this.state === 'MeleeCombo3_SpinningKick' ? getMixamoMotion(productionAssets.characters.get('capoeira_ybot'), 'armada') : null;
      this.activeMotion = motion?.name ?? null;
      this.motionWeight = THREE.MathUtils.clamp(this.motionWeight + (motion ? 1 : -1) / (60 * 0.07), 0, 1);
      if (motion) {
        // Preserve the existing 0.28-second presentation window and authoritative damage cadence.
        // This source take starts with ginga footwork. Use its actual kick/recovery
        // interval, rather than compressing the whole 1.6s take into a single hit.
        motion.sample(THREE.MathUtils.lerp(1.05, Math.min(1.5, motion.duration), Math.min(1, this.age / 0.28)), this.motionSample);
        for (const n of JOINT_NAMES) this.blendedMotion.rotations[n].copy(this.motionSample.rotations[n]);
        this.blendedMotion.pelvisY = this.motionSample.pelvisY;
      }
    }
    // Interpolate fixed-step poses for displays faster than 60 Hz.
    const alpha = Math.max(0, this.accumulator * 60);
    for (const n of JOINT_NAMES) {
      const a = this.rotationA.setFromEuler(this.previous[n]), b = this.rotationB.setFromEuler(this.pose[n]);
      this.rig.bones[n].quaternion.copy(a.slerp(b, alpha));
      const weight = THREE.MathUtils.lerp(this.previousMotionWeight, this.motionWeight, alpha);
      if (weight > 0) {
        a.copy(this.previousMotion.rotations[n]).slerp(this.blendedMotion.rotations[n], alpha);
        this.rig.bones[n].quaternion.slerp(a, weight);
      }
    }
    const down = ['DropToKneeStagger', 'WallSplatStun', 'CounterVictim'].includes(this.state) ? 0.37 : 0;
    this.rig.bones.Pelvis.position.y = (this.state === 'DrivingSeated' ? 0.30 : 0.94) - down + Math.sin(this.phase * 2.4) * 0.01;
    this.rig.bones.Pelvis.position.y = THREE.MathUtils.lerp(this.rig.bones.Pelvis.position.y,
      THREE.MathUtils.lerp(this.previousMotion.pelvisY, this.blendedMotion.pelvisY, alpha), THREE.MathUtils.lerp(this.previousMotionWeight, this.motionWeight, alpha));
    this.rig.weapon.rotation.set(-Math.PI / 2, 0, 0);
    // The palm remains attached in every pose; aim aligns the barrel to the agent's forward/pitch.
    const aim = THREE.MathUtils.clamp(input.aim ?? 0, 0, 1);
    if (aim > 0 && !this.state.startsWith('Melee') && this.state !== 'PairedCounter' && this.state !== 'CounterVictim') {
      this.rig.root.updateWorldMatrix(true, true);
      this.rig.bones.RightHand.getWorldQuaternion(this.handWorld).invert();
      this.rig.root.getWorldQuaternion(this.aimWorld);
      this.aimWorld.multiply(this.pitchRotation.setFromAxisAngle(this.pitchAxis, input.aimPitch ?? 0));
      this.rig.weapon.quaternion.slerp(this.handWorld.multiply(this.aimWorld), aim);
    }
    this.rig.weapon.visible = this.state !== 'DrivingSeated' && !input.reaction?.weaponDropped;
    const flash = (input.reaction?.flashSec ?? 0) > 0;
    this.rig.materials.armor.emissive.setHex(flash ? 0xffffff : 0);
    this.rig.materials.armor.emissiveIntensity = flash ? 0.15 : 0;
    this.rig.materials.armor.userData.eclipseHitFlash.value = flash ? 1 : 0;
  }
  private sample(input: AnimationInput): Pose {
    const p = this.targetPose, s = Math.sin(this.gaitPhase), a = Math.min(1.1, 0.3 + input.speed * 0.05);
    for (const n of JOINT_NAMES) p[n].set(0, 0, 0);
    p.LeftForearm.x = p.RightForearm.x = -0.35;
    p.Chest.x = 0.03 + Math.sin(this.phase * 2.4) * 0.015;
    if (this.state === 'DrivingSeated') { p.LeftThigh.x = p.RightThigh.x = -1.25; p.LeftCalf.x = p.RightCalf.x = 1.35; p.LeftUpperArm.x = p.RightUpperArm.x = -1.1; p.LeftForearm.x = p.RightForearm.x = -0.65; }
    const movingCombat = input.speed > .25 && input.grounded === true && (this.state.startsWith('Melee') || this.state === 'PairedCounter');
    if (this.state === 'Walk' || this.state === 'TacticalSprint' || movingCombat) {
      p.LeftThigh.x = s * a; p.RightThigh.x = -s * a;
      p.LeftCalf.x = Math.max(0.08, -s * a); p.RightCalf.x = Math.max(0.08, s * a);
      p.LeftUpperArm.x = -s * a * 0.65; p.RightUpperArm.x = s * a * 0.65;
      p.Chest.x = this.state === 'TacticalSprint' ? 0.24 : 0.08; p.Spine.y = -s * 0.13;
      if (this.rig.style === EnemyArchetype.CYBER_RONIN) { p.Chest.x += 0.35; p.LeftCalf.x += 0.3; p.RightCalf.x += 0.3; }
    }
    if (['AirborneRise', 'AirborneApex', 'FallLoop', 'AirDash', 'JumpLaunch', 'AirDashBurst'].includes(this.state)) {
      p.LeftThigh.x = -0.8; p.LeftCalf.x = 1.2; p.RightThigh.x = -0.3; p.RightCalf.x = 0.6;
      p.LeftUpperArm.x = -0.7; p.RightUpperArm.x = -0.4; p.Chest.x = this.state === 'AirDash' ? 0.6 : 0.12;
    }
    if (this.state === 'LedgeHang' || this.state === 'LedgeMantleClimb') {
      const reach = Math.sin((input.mantleProgress ?? 0) * Math.PI);
      p.LeftUpperArm.x = p.RightUpperArm.x = -2.5 + (input.mantleProgress ?? 0);
      p.LeftForearm.x = p.RightForearm.x = -reach; p.LeftThigh.x = -reach; p.LeftCalf.x = reach * 1.5; p.Chest.x = reach * 0.5;
    }
    const strike = Math.sin(Math.min(1, this.age / 0.28) * Math.PI);
    if (this.state === 'MeleeCombo1_Jab') { p.RightUpperArm.x = -1.6 * strike; p.Chest.y = -0.4 * strike; }
    if (this.state === 'MeleeCombo2_Cross') { p.LeftUpperArm.x = -1.7 * strike; p.Chest.y = 0.7 * strike; }
    if (this.state === 'MeleeCombo3_SpinningKick') { p.Pelvis.y = Math.PI * strike; p.RightThigh.x = -1.8 * strike; p.RightCalf.x = 0.15; }
    if (this.state === 'AirborneGroundSlam') { p.LeftUpperArm.x = p.RightUpperArm.x = -2.5; p.LeftThigh.x = -1; p.RightThigh.x = -1; p.LeftCalf.x = p.RightCalf.x = 1.2; }
    if (this.state === 'HardLandingRoll' || this.state === 'ParkourMomentumRoll') { p.Pelvis.x = Math.sin(this.age / 0.45 * Math.PI) * 2; p.LeftThigh.x = p.RightThigh.x = -1.3; p.LeftCalf.x = p.RightCalf.x = 1.8; }
    if (this.state === 'DropToKneeStagger') { p.LeftThigh.x = -1.4; p.LeftCalf.x = 1.9; p.RightCalf.x = 1.7; p.Chest.x = 0.5; }
    if (this.state === 'WeaponDropRecoil') { p.RightUpperArm.z = -1.2; p.RightForearm.x = -1.5; p.Chest.z = 0.25; }
    if (this.state === 'KnockbackTumble') { p.Chest.x = -0.7; p.LeftUpperArm.z = 0.8; p.RightUpperArm.z = -0.8; p.LeftThigh.x = p.RightThigh.x = -0.5; p.LeftCalf.x = p.RightCalf.x = 1; }
    if (this.state === 'BlindStagger') { p.Chest.x = 0.35; p.Head.z = Math.sin(this.phase * 8) * 0.3; p.LeftUpperArm.x = -1; }
    if (this.state === 'Windup') { p.Chest.x = -0.2; p.RightUpperArm.x = -2.1; p.RightForearm.x = -1.2; p.Spine.y = 0.3; }
    if (this.state === 'WallSplatStun') { p.Chest.x = 0.8; p.Head.x = 0.45; p.LeftCalf.x = p.RightCalf.x = 1.2; p.LeftUpperArm.z = 0.5; p.RightUpperArm.z = -0.5; }
    if (this.state === 'PairedCounter' || this.state === 'CounterVictim') {
      const elapsed = input.pairedElapsed ?? input.reaction?.pairedElapsed ?? this.age, t = Math.min(1, elapsed / PAIRED_DURATION_SEC), deflect = Math.sin(t * Math.PI), slam = Math.max(0, Math.min(1, (elapsed - .16) / (COUNTER_CONTACT_SEC - .16)));
      if (this.state === 'PairedCounter') { p.LeftUpperArm.x = -1.5 * deflect; p.RightUpperArm.x = 1.6 * slam; p.RightForearm.x = .5 * slam; p.Spine.y = -0.7 * deflect; p.RightThigh.x = -0.7 * slam; }
      else { p.RightUpperArm.z = -1.8 * deflect; p.Chest.x = slam * 1.3; p.Head.x = slam * 0.6; p.LeftCalf.x = p.RightCalf.x = slam * 1.8; }
    }
    p.Spine.z += this.bank;
    if (this.state === 'WingsuitBankGlide') {
      p.Chest.x = .8 + Math.atan2(-input.verticalSpeed, Math.max(1, input.speed)) * .5;
      p.LeftUpperArm.z = 1.4; p.RightUpperArm.z = -1.4; p.LeftThigh.x = p.RightThigh.x = .25;
      const side = (input.velocityX ?? 0) * Math.cos(input.facingYaw ?? 0) - (input.velocityZ ?? 0) * Math.sin(input.facingYaw ?? 0);
      p.Spine.z = THREE.MathUtils.clamp(-side / 30, -Math.PI / 10, Math.PI / 10);
    }
    if (this.state === 'JetpackHoverAim') { p.LeftThigh.x = -.25; p.RightThigh.x = -.45; p.LeftCalf.x = .5; p.RightCalf.x = .7; p.Chest.x = .12; }
    if (this.state === 'WallRunLeft' || this.state === 'WallRunRight') { const side = this.state === 'WallRunLeft' ? 1 : -1; p.Pelvis.z = side * .35; p.LeftThigh.x = s * .8; p.RightThigh.x = -s * .8; p.LeftCalf.x = Math.max(.1, -s); p.RightCalf.x = Math.max(.1, s); p.LeftUpperArm.z = side * .8; p.RightUpperArm.z = side * .8; }
    if (this.state === 'GrapplePendulumSwing') { p.RightUpperArm.x = -2.7; p.LeftUpperArm.x = -1.8; p.Chest.x = Math.atan2(input.verticalSpeed, Math.max(1, input.speed)) * .5; p.LeftThigh.x = -.6; p.RightThigh.x = -.8; p.LeftCalf.x = p.RightCalf.x = .8; }
    if (this.state === 'ShieldSurfSlide') { p.Pelvis.y = .6; p.LeftThigh.x = -1; p.RightThigh.x = -.4; p.LeftCalf.x = 1.4; p.RightCalf.x = .6; p.Chest.x = .35; }
    if (this.state === 'SuperCraterSlam') { p.LeftUpperArm.x = p.RightUpperArm.x = -2.5; p.LeftThigh.x = p.RightThigh.x = -1; p.LeftCalf.x = p.RightCalf.x = 1.3; p.Chest.x = .5; }
    if (input.combatLayer === 'katana') { p.RightUpperArm.x -= 1.6; p.RightUpperArm.z -= .8; p.Chest.y += .5; }
    if (input.combatLayer === 'pile_bunker') { p.RightUpperArm.x -= 1.7; p.LeftUpperArm.x -= .8; p.Chest.x += .4; }
    if (movingCombat) { p.LeftThigh.x = s * a; p.RightThigh.x = -s * a; p.LeftCalf.x = Math.max(.08, -s * a); p.RightCalf.x = Math.max(.08, s * a); }
    // Upper body aim and recoil are layered without replacing leg locomotion.
    const aim = input.aim ?? 0;
    p.Spine.y += aim * -0.15; p.Chest.x += aim * (input.aimPitch ?? 0);
    // +X raises the downward-pointing arm toward game-forward (-Z).
    p.RightUpperArm.x = THREE.MathUtils.lerp(p.RightUpperArm.x, 1.05, aim); p.LeftUpperArm.x = THREE.MathUtils.lerp(p.LeftUpperArm.x, 1.1, aim);
    p.RightForearm.x = THREE.MathUtils.lerp(p.RightForearm.x, 0.5, aim); p.Chest.x -= (input.recoil ?? 0) * 0.18;
    const r = input.reaction;
    if (r && r.flinchSec > 0) {
      const force = Math.sin(Math.min(1, r.flinchSec / 0.18) * Math.PI) * 0.4;
      const yaw = this.rig.root.parent?.rotation.y ?? 0;
      const localX = r.direction.x * Math.cos(yaw) - r.direction.z * Math.sin(yaw);
      const localZ = r.direction.x * Math.sin(yaw) + r.direction.z * Math.cos(yaw);
      p.Chest.x += localZ * force; p.Spine.z -= localX * force; p.Head.x += localZ * force * 0.7;
    }
    return p;
  }
}
