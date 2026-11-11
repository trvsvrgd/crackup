import * as THREE from 'three';
import { AgentAnimState } from '../../shared/constants.js';
import { HitReaction, EnemyArchetype, type CombatPresentation } from '../../shared/combat/combatPresentation.js';
import { HumanoidRig, JOINT_LAYOUT, type JointName } from './humanoidRig.js';

export type SkeletalState = 'IdleBreathing' | 'DrivingSeated' | 'Walk' | 'TacticalSprint' | 'AirborneRise' | 'AirborneApex' | 'FallLoop' | 'HardLandingRoll' | 'LedgeHang' | 'LedgeMantleClimb' | 'AirDash' | 'MeleeCombo1_Jab' | 'MeleeCombo2_Cross' | 'MeleeCombo3_SpinningKick' | 'AirborneGroundSlam' | 'DropToKneeStagger' | 'WeaponDropRecoil' | 'WallSplatStun' | 'PairedCounter' | 'CounterVictim' | 'KnockbackTumble' | 'BlindStagger' | 'Windup';
export interface AnimationInput {
  speed: number; verticalSpeed: number; animState?: AgentAnimState; aim?: number; aimPitch?: number;
  combo?: number; mantleProgress?: number; reaction?: CombatPresentation; pairedElapsed?: number;
  state?: SkeletalState; recoil?: number;
}
type Pose = Record<JointName, THREE.Euler>;
const newPose = () => Object.fromEntries(Object.keys(JOINT_LAYOUT).map(n => [n, new THREE.Euler()])) as Pose;

/** Fixed 60 Hz pose simulation with cross-fades sampled from the outgoing pose, including interrupted transitions. */
export class SkeletalAnimator {
  public state: SkeletalState = 'IdleBreathing';
  public ticks = 0;
  private accumulator = 0;
  private phase = 0;
  private age = 0;
  private blend = 1;
  private previous = newPose();
  private pose = newPose();
  private from = newPose();
  private previousVertical = 0;
  constructor(public readonly rig: HumanoidRig) {}
  private choose(input: AnimationInput): SkeletalState {
    const r = input.reaction;
    if (r?.reaction === HitReaction.PAIRED_COUNTER && r.timer > 0) return 'CounterVictim';
    if (r?.reaction === HitReaction.WALL_SPLAT && r.timer > 0) return 'WallSplatStun';
    if (r?.reaction === HitReaction.KNEE_DROP && r.timer > 0) return 'DropToKneeStagger';
    if (r?.reaction === HitReaction.DISARM && r.timer > 0) return 'WeaponDropRecoil';
    if (r?.reaction === HitReaction.KNOCKBACK && r.timer > 0) return 'KnockbackTumble';
    if (input.state) return input.state;
    switch (input.animState) {
      case AgentAnimState.DRIVING_VEHICLE: return 'DrivingSeated';
      case AgentAnimState.PARRY_TAKEDOWN: return 'PairedCounter';
      case AgentAnimState.MELEE_STRIKE: return input.combo === 3 ? 'MeleeCombo3_SpinningKick' : input.combo === 2 ? 'MeleeCombo2_Cross' : 'MeleeCombo1_Jab';
      case AgentAnimState.GROUND_SLAM: return 'AirborneGroundSlam';
      case AgentAnimState.MANTLE_VAULT: return (input.mantleProgress ?? 0) < 0.12 ? 'LedgeHang' : 'LedgeMantleClimb';
      case AgentAnimState.AIR_DASH: return 'AirDash';
      case AgentAnimState.JUMP_ASCEND: return Math.abs(input.verticalSpeed) < 0.8 ? 'AirborneApex' : 'AirborneRise';
      case AgentAnimState.FALL: return Math.abs(input.verticalSpeed) < 0.8 ? 'AirborneApex' : 'FallLoop';
    }
    if (this.previousVertical < -7 && Math.abs(input.verticalSpeed) < 0.2) return 'HardLandingRoll';
    if (this.state === 'HardLandingRoll' && this.age < 0.45) return this.state;
    return input.speed > 6 ? 'TacticalSprint' : input.speed > 0.25 ? 'Walk' : 'IdleBreathing';
  }
  public update(dt: number, input: AnimationInput): void {
    this.accumulator += Math.max(0, Math.min(0.25, dt));
    while (this.accumulator + 1e-9 >= 1 / 60) {
      this.accumulator -= 1 / 60; this.ticks++; this.phase += 1 / 60;
      const next = this.choose(input);
      if (next !== this.state) {
        for (const n of Object.keys(JOINT_LAYOUT) as JointName[]) this.from[n].copy(this.pose[n]);
        this.state = next; this.blend = 0; this.age = 0;
      }
      this.age += 1 / 60; this.blend = Math.min(1, this.blend + 1 / (60 * 0.14));
      const target = this.sample(input), t = this.blend * this.blend * (3 - 2 * this.blend);
      for (const n of Object.keys(JOINT_LAYOUT) as JointName[]) {
        this.previous[n].copy(this.pose[n]);
        this.pose[n].set(THREE.MathUtils.lerp(this.from[n].x, target[n].x, t), THREE.MathUtils.lerp(this.from[n].y, target[n].y, t), THREE.MathUtils.lerp(this.from[n].z, target[n].z, t));
      }
      this.previousVertical = input.verticalSpeed;
    }
    // Interpolate fixed-step poses for displays faster than 60 Hz.
    const alpha = Math.max(0, this.accumulator * 60);
    for (const n of Object.keys(JOINT_LAYOUT) as JointName[]) {
      const a = new THREE.Quaternion().setFromEuler(this.previous[n]), b = new THREE.Quaternion().setFromEuler(this.pose[n]);
      this.rig.bones[n].quaternion.copy(a.slerp(b, alpha));
    }
    const down = ['DropToKneeStagger', 'WallSplatStun', 'CounterVictim'].includes(this.state) ? 0.37 : 0;
    this.rig.bones.Pelvis.position.y = (this.state === 'DrivingSeated' ? 0.30 : 0.94) - down + Math.sin(this.phase * 2.4) * 0.01;
    this.rig.weapon.visible = this.state !== 'DrivingSeated' && !input.reaction?.weaponDropped;
    const flash = (input.reaction?.flashSec ?? 0) > 0;
    this.rig.materials.armor.emissive.setHex(flash ? 0xffffff : 0);
    this.rig.materials.armor.emissiveIntensity = flash ? 0.15 : 0;
    this.rig.materials.armor.userData.eclipseHitFlash.value = flash ? 1 : 0;
  }
  private sample(input: AnimationInput): Pose {
    const p = newPose(), s = Math.sin(this.phase * (5 + input.speed)), a = Math.min(1.1, 0.3 + input.speed * 0.05);
    p.LeftForearm.x = p.RightForearm.x = -0.35;
    p.Chest.x = 0.03 + Math.sin(this.phase * 2.4) * 0.015;
    if (this.state === 'DrivingSeated') { p.LeftThigh.x = p.RightThigh.x = -1.25; p.LeftCalf.x = p.RightCalf.x = 1.35; p.LeftUpperArm.x = p.RightUpperArm.x = -1.1; p.LeftForearm.x = p.RightForearm.x = -0.65; }
    if (this.state === 'Walk' || this.state === 'TacticalSprint') {
      p.LeftThigh.x = s * a; p.RightThigh.x = -s * a;
      p.LeftCalf.x = Math.max(0.08, -s * a); p.RightCalf.x = Math.max(0.08, s * a);
      p.LeftUpperArm.x = -s * a * 0.65; p.RightUpperArm.x = s * a * 0.65;
      p.Chest.x = this.state === 'TacticalSprint' ? 0.24 : 0.08; p.Spine.y = -s * 0.13;
      if (this.rig.style === EnemyArchetype.CYBER_RONIN) { p.Chest.x += 0.35; p.LeftCalf.x += 0.3; p.RightCalf.x += 0.3; }
    }
    if (['AirborneRise', 'AirborneApex', 'FallLoop', 'AirDash'].includes(this.state)) {
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
    if (this.state === 'HardLandingRoll') { p.Pelvis.x = Math.sin(this.age / 0.45 * Math.PI) * 2; p.LeftThigh.x = p.RightThigh.x = -1.3; p.LeftCalf.x = p.RightCalf.x = 1.8; }
    if (this.state === 'DropToKneeStagger') { p.LeftThigh.x = -1.4; p.LeftCalf.x = 1.9; p.RightCalf.x = 1.7; p.Chest.x = 0.5; }
    if (this.state === 'WeaponDropRecoil') { p.RightUpperArm.z = -1.2; p.RightForearm.x = -1.5; p.Chest.z = 0.25; }
    if (this.state === 'KnockbackTumble') { p.Chest.x = -0.7; p.LeftUpperArm.z = 0.8; p.RightUpperArm.z = -0.8; p.LeftThigh.x = p.RightThigh.x = -0.5; p.LeftCalf.x = p.RightCalf.x = 1; }
    if (this.state === 'BlindStagger') { p.Chest.x = 0.35; p.Head.z = Math.sin(this.phase * 8) * 0.3; p.LeftUpperArm.x = -1; }
    if (this.state === 'Windup') { p.Chest.x = -0.2; p.RightUpperArm.x = -2.1; p.RightForearm.x = -1.2; p.Spine.y = 0.3; }
    if (this.state === 'WallSplatStun') { p.Chest.x = 0.8; p.Head.x = 0.45; p.LeftCalf.x = p.RightCalf.x = 1.2; p.LeftUpperArm.z = 0.5; p.RightUpperArm.z = -0.5; }
    if (this.state === 'PairedCounter' || this.state === 'CounterVictim') {
      const t = Math.min(1, (input.pairedElapsed ?? input.reaction?.pairedElapsed ?? this.age) / 0.65), deflect = Math.sin(t * Math.PI), slam = Math.max(0, (t - 0.45) / 0.55);
      if (this.state === 'PairedCounter') { p.LeftUpperArm.x = -1.5 * deflect; p.RightUpperArm.x = -1.8 * slam; p.Spine.y = -0.7 * deflect; p.RightThigh.x = -0.7 * slam; }
      else { p.RightUpperArm.z = -1.8 * deflect; p.Chest.x = slam * 1.3; p.Head.x = slam * 0.6; p.LeftCalf.x = p.RightCalf.x = slam * 1.8; }
    }
    // Upper body aim and recoil are layered without replacing leg locomotion.
    const aim = input.aim ?? 0;
    p.Spine.y += aim * -0.15; p.Chest.x += aim * (input.aimPitch ?? 0);
    p.RightUpperArm.x += aim * -1.25; p.LeftUpperArm.x += aim * -0.95;
    p.RightForearm.x += aim * -0.45; p.Chest.x -= (input.recoil ?? 0) * 0.18;
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
