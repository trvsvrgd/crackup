import * as THREE from 'three';
import { EnemyCombatState, EnemyLimbId, LIMB_COLLIDER_SPECS, PARRY_SHOCKWAVE_RADIUS_M, AgentAnimState } from '../../shared/constants.js';
import { computeBoneWorldPosition, type VatsLimbEvaluation } from '../../shared/combat/enemyRigSystem.js';
import { EnemyArchetype, HitReaction, WARDEN_RIG_SCALE, type CombatPresentation } from '../../shared/combat/combatPresentation.js';
import type { EnemyBinarySnapshotState, Vec3 } from '../../shared/protocol/binaryProtocol.js';
import { HumanoidRig } from '../animation/humanoidRig.js';
import { SkeletalAnimator } from '../animation/skeletalAnimator.js';

export class ArticulatedEnemyRigMesh {
  public readonly root = new THREE.Group();
  public readonly humanoid: HumanoidRig;
  public readonly animator: SkeletalAnimator;
  public readonly vatsWireframeBoxes = {} as Record<EnemyLimbId, THREE.LineSegments>;
  private readonly windupArc: THREE.Mesh;
  private readonly shield: THREE.Mesh;
  private readonly splat: THREE.Mesh;
  private phase = 0;
  private lastPosition: Vec3 | null = null;
  private lastSplat = false;
  private speed = 0;
  constructor(public readonly enemyId: number, public readonly isElite: boolean, archetype = isElite ? EnemyArchetype.CYBER_RONIN : EnemyArchetype.STREET_ENFORCER) {
    this.root.name = `EnemyRig_${enemyId}`; this.humanoid = new HumanoidRig(archetype, true); this.animator = new SkeletalAnimator(this.humanoid); this.root.add(this.humanoid.root);
    for (const limb of [0, 1, 2, 3, 4, 5] as EnemyLimbId[]) {
      const s = LIMB_COLLIDER_SPECS[limb], geo = new THREE.BoxGeometry(s.radius * 2.36, (s.halfHeight + s.radius) * 2.24, s.radius * 2.36);
      const wire = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x40ffac })); geo.dispose();
      wire.visible = false; this.vatsWireframeBoxes[limb] = wire; this.root.add(wire);
      if (archetype === EnemyArchetype.SECTOR_WARDEN) wire.scale.setScalar(WARDEN_RIG_SCALE);
    }
    this.windupArc = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.04, 8, 24, Math.PI * 1.25), new THREE.MeshBasicMaterial({ color: 0xffaa00 }));
    this.windupArc.rotation.x = Math.PI / 2; this.windupArc.position.y = 2.2; this.root.add(this.windupArc);
    this.shield = new THREE.Mesh(new THREE.IcosahedronGeometry(1.18, 1), new THREE.MeshBasicMaterial({ color: 0xff1144, wireframe: true, transparent: true, opacity: 0.65 }));
    this.shield.position.y = 1.05; this.root.add(this.shield);
    this.splat = new THREE.Mesh(new THREE.RingGeometry(0.14, 0.65, 12), new THREE.MeshBasicMaterial({ color: 0x18232b, side: THREE.DoubleSide, transparent: true, opacity: 0.7, depthWrite: false })); this.splat.visible = false;
  }
  public update(state: EnemyBinarySnapshotState, vats: boolean, selected: EnemyLimbId, evaluations: VatsLimbEvaluation[] | null, dt: number, reaction?: CombatPresentation): void {
    this.phase += dt; this.root.visible = state.combatState !== EnemyCombatState.DEAD || (reaction?.timer ?? 0) > 0;
    this.root.position.set(state.position.x, state.position.y, state.position.z); this.root.rotation.y = state.yaw;
    if (this.lastPosition && dt > 0) { const measured = Math.hypot(state.position.x - this.lastPosition.x, state.position.z - this.lastPosition.z) / dt; this.speed += (measured - this.speed) * Math.min(1, dt * 8); }
    this.lastPosition = { ...state.position };
    const windup = state.combatState === EnemyCombatState.WINDUP; this.windupArc.visible = windup; this.windupArc.rotation.z = this.phase * 6;
    this.shield.visible = state.combatState === EnemyCombatState.COUNTER_STANCE;
    this.animator.update(dt, { speed: this.speed, verticalSpeed: 0, reaction, aim: windup ? 0.6 : 0,
      state: windup ? 'Windup' : state.combatState === EnemyCombatState.STAGGER_BLIND ? 'BlindStagger' : undefined,
      animState: state.combatState === EnemyCombatState.ACTIVE_SWEEP ? AgentAnimState.MELEE_STRIKE : undefined });
    if (windup && !reaction?.flashSec) { this.humanoid.materials.armor.emissive.setHex(0xff9900); this.humanoid.materials.armor.emissiveIntensity = 0.65; }
    const splatted = reaction?.reaction === HitReaction.WALL_SPLAT && reaction.timer > 0;
    if (splatted && !this.lastSplat) {
      this.root.parent?.add(this.splat); this.splat.position.set(state.position.x + reaction.direction.x * 0.32, state.position.y + 1, state.position.z + reaction.direction.z * 0.32);
      this.splat.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(-reaction.direction.x, 0, -reaction.direction.z));
    }
    this.splat.visible = splatted; this.lastSplat = splatted; this.root.updateMatrixWorld(true);
    for (const limb of [0, 1, 2, 3, 4, 5] as EnemyLimbId[]) {
      const world = computeBoneWorldPosition(state.position, state.yaw, state.combatState, this.phase, limb, reaction);
      const wire = this.vatsWireframeBoxes[limb]; wire.position.copy(this.root.worldToLocal(new THREE.Vector3(world.x, world.y, world.z))); wire.visible = vats;
      const evaluation = evaluations?.find(e => e.limbId === limb);
      (wire.material as THREE.LineBasicMaterial).color.setHex(evaluation?.occluded ? 0xff2244 : selected === limb ? 0x00f0ff : 0x40ffac);
    }
  }
  public dispose(): void {
    this.humanoid.dispose(); this.splat.removeFromParent();
    for (const mesh of [this.windupArc, this.shield, this.splat, ...Object.values(this.vatsWireframeBoxes)]) { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); }
  }
}
export class KineticShockwaveEffect {
  public readonly mesh: THREE.Mesh; private timer = 1;
  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.Mesh(new THREE.RingGeometry(0.3, 1, 48), new THREE.MeshBasicMaterial({ color: 0x00f0ff, side: THREE.DoubleSide, transparent: true, opacity: 0 }));
    this.mesh.rotation.x = Math.PI / 2; this.mesh.visible = false; scene.add(this.mesh);
  }
  public trigger(origin: Vec3): void { this.timer = 0; this.mesh.visible = true; this.mesh.position.set(origin.x, origin.y + 0.18, origin.z); }
  public update(dt: number): void { this.timer += dt; const t = Math.min(1, this.timer / 0.45); this.mesh.visible = t < 1;
    this.mesh.scale.setScalar(0.3 + t * PARRY_SHOCKWAVE_RADIUS_M); (this.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.9; }
}
