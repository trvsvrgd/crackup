import * as THREE from 'three';
import { AgentAnimState, AugmentChassisId } from '../../shared/constants.js';
import type { Quat4, Vec3 } from '../../shared/protocol/binaryProtocol.js';
import type { CombatEventResult } from '../../shared/combat/enemyRigSystem.js';
import { HumanoidRig } from '../animation/humanoidRig.js';
import { SkeletalAnimator, type AnimationInput } from '../animation/skeletalAnimator.js';

export class ArticulatedAgentRig {
  public readonly root = new THREE.Group();
  public humanoid: HumanoidRig;
  public animator: SkeletalAnimator;
  public readonly dashTrailMesh: THREE.Mesh;
  public readonly windShearGroup = new THREE.Group();
  private label: THREE.Sprite | null = null;
  private callsign = '';
  private actionSec = 0;
  private combo = 1;
  private recoil = 0;
  private shotPoseSec = 0;
  private shotPitch = 0;
  private disposed = false;
  constructor(callsign: string, local: boolean) {
    this.root.name = `AgentRig_${callsign}`;
    this.humanoid = new HumanoidRig(AugmentChassisId.TITAN_JUGGERNAUT); this.animator = new SkeletalAnimator(this.humanoid); this.root.add(this.humanoid.root);
    const trail = new THREE.MeshBasicMaterial({ color: local ? 0x00f0ff : 0xff2a85, transparent: true, opacity: 0, depthWrite: false });
    this.dashTrailMesh = new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.035, 8, 24), trail); this.dashTrailMesh.position.set(0, 1, 0.35); this.root.add(this.dashTrailMesh);
    for (const side of [-1, 1]) {
      const shear = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 1.35), trail.clone()); shear.rotation.x = Math.PI / 2;
      shear.position.set(side * 0.32, 1.25, 0.75); this.windShearGroup.add(shear);
    }
    this.root.add(this.windShearGroup);
    // Genuine Mixamo motion is retargeted by SkeletalAnimator onto this visible class rig.
    // No hidden per-player GLB clone or second skin is allocated.
    this.setCallsign(callsign, local);
  }
  public setChassis(chassis: AugmentChassisId): void {
    if (this.humanoid.style === chassis) return;
    this.root.remove(this.humanoid.root); this.humanoid.dispose();
    this.humanoid = new HumanoidRig(chassis); this.animator = new SkeletalAnimator(this.humanoid); this.root.add(this.humanoid.root);
  }
  public setCallsign(callsign: string, local: boolean): void {
    if (local || this.callsign === callsign || typeof document === 'undefined') return;
    this.callsign = callsign;
    if (this.label) { this.root.remove(this.label); this.label.material.map?.dispose(); this.label.material.dispose(); }
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d'); if (ctx) { ctx.fillStyle = '#08131ccc'; ctx.fillRect(0, 0, 256, 64); ctx.fillStyle = '#ecf7ff'; ctx.font = 'bold 24px monospace'; ctx.textAlign = 'center'; ctx.fillText(callsign, 128, 40); }
    this.label = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
    this.label.position.y = 2.2; this.label.scale.set(1.4, 0.35, 1); this.root.add(this.label);
  }
  public showShot(pitch: number): void { this.recoil = 1; this.shotPoseSec = .16; this.shotPitch = pitch; }
  public combat(event: CombatEventResult): void {
    if (event.type === 'MELEE_HIT') { this.combo = event.comboStep ?? 1; this.actionSec = 0.28; }
    if (event.type === 'WEAPON_HIT' || event.type === 'WEAPON_MISS' || event.type === 'VEHICLE_HIT' || event.type === 'RELAY_VENT_HIT') this.recoil = 1;
  }
  public update(position: Vec3, rotation: Quat4, velocity: Vec3, animState: AgentAnimState, mantleProgress: number, dt: number, agilityLevel = 1, options: Partial<AnimationInput> = {}): void {
    this.root.position.set(position.x, position.y, position.z); this.root.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
    this.shotPoseSec = Math.max(0, this.shotPoseSec - dt);
    this.actionSec = Math.max(0, this.actionSec - dt); this.recoil = Math.max(0, this.recoil - dt * 10);
    const dashMaterial = this.dashTrailMesh.material as THREE.MeshBasicMaterial;
    dashMaterial.opacity = animState === AgentAnimState.AIR_DASH ? 0.85 : Math.max(0, dashMaterial.opacity - dt * 4);
    const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
    for (const o of this.windShearGroup.children as THREE.Mesh[]) (o.material as THREE.MeshBasicMaterial).opacity = speed > 8.5 ? Math.min(0.75, (speed - 8.5) / 14 * (0.35 + agilityLevel * 0.08)) : 0;
    this.windShearGroup.scale.z = 0.6 + (agilityLevel - 1) * 0.3 + Math.min(1.5, speed * 0.06);
    this.animator.update(dt, { speed: Math.hypot(velocity.x, velocity.z), verticalSpeed: velocity.y, velocityX: velocity.x, velocityZ: velocity.z, agilityLevel, facingYaw: Math.atan2(2 * (rotation.w * rotation.y + rotation.x * rotation.z), 1 - 2 * (rotation.y * rotation.y + rotation.z * rotation.z)), animState: this.actionSec > 0 ? AgentAnimState.MELEE_STRIKE : animState, mantleProgress, combo: this.combo, recoil: this.recoil, ...options, aim: Math.max(options.aim ?? 0, this.shotPoseSec > 0 ? 1 : 0), aimPitch: options.aimPitch ?? this.shotPitch });
  }
  public dispose(): void {
    if (this.disposed) return; this.disposed = true; this.humanoid.dispose();
    this.label?.material.map?.dispose(); this.label?.material.dispose();
    for (const mesh of [this.dashTrailMesh, ...this.windShearGroup.children as THREE.Mesh[]]) { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); }
  }
}
