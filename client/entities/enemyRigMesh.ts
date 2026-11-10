/**
 * CRACKUP: Protocol Eclipse (v2.0 True 3D AAA Architecture)
 * 3D Articulated Enemy Rig, 6 V.A.T.S. World-Space Wireframe Limb Bounding Boxes,
 * Amber Windup Telegraph Arc, Crimson Elite Counter-Shield & 6.0m Parry Shockwave Ring
 */

import * as THREE from 'three';
import {
  EnemyCombatState,
  EnemyLimbId,
  LIMB_COLLIDER_SPECS,
  PARRY_SHOCKWAVE_RADIUS_M,
} from '../../shared/constants.js';
import {
  computeBoneWorldPosition,
  VatsLimbEvaluation,
} from '../../shared/combat/enemyRigSystem.js';
import { EnemyBinarySnapshotState, Vec3 } from '../../shared/protocol/binaryProtocol.js';

const ALL_LIMB_IDS: EnemyLimbId[] = [
  EnemyLimbId.HEAD,
  EnemyLimbId.TORSO,
  EnemyLimbId.LEFT_ARM,
  EnemyLimbId.RIGHT_ARM,
  EnemyLimbId.LEFT_LEG,
  EnemyLimbId.RIGHT_LEG,
];

export class ArticulatedEnemyRigMesh {
  public readonly root: THREE.Group;
  public readonly boneMeshes: Record<EnemyLimbId, THREE.Mesh>;
  public readonly vatsWireframeBoxes: Record<EnemyLimbId, THREE.LineSegments>;
  public readonly windupArcMesh: THREE.Mesh;
  public readonly counterShieldMesh: THREE.Mesh;

  private readonly armorMat: THREE.MeshStandardMaterial;
  private animPhase = 0;

  constructor(public readonly enemyId: number, public readonly isElite: boolean) {
    this.root = new THREE.Group();
    this.root.name = `EnemyRig_${enemyId}`;

    this.armorMat = new THREE.MeshStandardMaterial({
      color: isElite ? 0x2c1424 : 0x1d2432,
      emissive: isElite ? 0x3a0818 : 0x08101c,
      emissiveIntensity: 0.6,
      roughness: 0.35,
      metalness: 0.78,
    });

    this.boneMeshes = {} as Record<EnemyLimbId, THREE.Mesh>;
    this.vatsWireframeBoxes = {} as Record<EnemyLimbId, THREE.LineSegments>;

    // Build 6 articulated bone meshes + 6 world-space V.A.T.S. wireframe bounding boxes
    for (const limbId of ALL_LIMB_IDS) {
      const spec = LIMB_COLLIDER_SPECS[limbId];
      const w = spec.radius * 2;
      const h = (spec.halfHeight + spec.radius) * 2;
      const d = spec.radius * 2;

      const meshGeo =
        spec.shape === 'sphere'
          ? new THREE.SphereGeometry(spec.radius, 12, 12)
          : new THREE.BoxGeometry(w * 0.88, h * 0.92, d * 0.88);

      const mesh = new THREE.Mesh(meshGeo, this.armorMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.boneMeshes[limbId] = mesh;
      this.root.add(mesh);

      // 3D World-Space V.A.T.S. Sub-Collider Wireframe Bounding Box (PRD Section 4.2)
      const boxGeo = new THREE.BoxGeometry(w * 1.18, h * 1.12, d * 1.18);
      const edgesGeo = new THREE.EdgesGeometry(boxGeo);
      const wireMat = new THREE.LineBasicMaterial({
        color: 0x00ff88,
        transparent: true,
        opacity: 0.92,
      });
      const wireBox = new THREE.LineSegments(edgesGeo, wireMat);
      wireBox.visible = false;
      this.vatsWireframeBoxes[limbId] = wireBox;
      this.root.add(wireBox);
    }

    // Overhead Amber Telegraph Arc Indicator for Enemy WINDUP (PRD Section 4.3)
    const arcGeo = new THREE.TorusGeometry(0.62, 0.045, 8, 24, Math.PI * 1.25);
    const arcMat = new THREE.MeshBasicMaterial({
      color: 0xffaa00,
      transparent: true,
      opacity: 0.0,
    });
    this.windupArcMesh = new THREE.Mesh(arcGeo, arcMat);
    this.windupArcMesh.rotation.x = Math.PI * 0.5;
    this.windupArcMesh.position.set(0, 2.25, 0);
    this.root.add(this.windupArcMesh);

    // Elite Crimson Counter-Stance Energy Shield Mesh (PRD Section 4.3)
    const shieldGeo = new THREE.IcosahedronGeometry(1.18, 1);
    const shieldMat = new THREE.MeshStandardMaterial({
      color: 0xff1144,
      emissive: 0xff0033,
      emissiveIntensity: 2.8,
      wireframe: true,
      transparent: true,
      opacity: 0.0,
    });
    this.counterShieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
    this.counterShieldMesh.position.set(0, 1.1, 0);
    this.root.add(this.counterShieldMesh);
  }

  public update(
    state: EnemyBinarySnapshotState,
    isVatsActive: boolean,
    selectedLimbId: EnemyLimbId,
    vatsEvaluations: VatsLimbEvaluation[] | null,
    dt: number
  ): void {
    this.animPhase += dt;

    if (state.combatState === EnemyCombatState.DEAD) {
      this.root.visible = false;
      return;
    }
    this.root.visible = true;

    // 1. Update Amber 3D Shader Rim-Light & Overhead Arc Indicator during WINDUP
    const arcMat = this.windupArcMesh.material as THREE.MeshBasicMaterial;
    if (state.combatState === EnemyCombatState.WINDUP) {
      this.armorMat.emissive.setHex(0xff9900);
      this.armorMat.emissiveIntensity = 2.2;
      arcMat.opacity = 0.95;
      this.windupArcMesh.position.set(state.position.x, state.position.y + 2.25, state.position.z);
      this.windupArcMesh.rotation.z = this.animPhase * 6.0;
    } else if (state.combatState === EnemyCombatState.STAGGER_BLIND) {
      this.armorMat.emissive.setHex(0x00ccff);
      this.armorMat.emissiveIntensity = 1.6;
      arcMat.opacity = 0.0;
    } else {
      this.armorMat.emissive.setHex(this.isElite ? 0x3a0818 : 0x08101c);
      this.armorMat.emissiveIntensity = 0.6;
      arcMat.opacity = 0.0;
    }

    // 2. Update Elite Crimson Energy Shield during COUNTER_STANCE
    const shieldMat = this.counterShieldMesh.material as THREE.MeshStandardMaterial;
    if (state.combatState === EnemyCombatState.COUNTER_STANCE) {
      shieldMat.opacity = 0.78;
      this.counterShieldMesh.position.set(
        state.position.x,
        state.position.y + 1.05,
        state.position.z
      );
      this.counterShieldMesh.rotation.y += dt * 3.5;
    } else {
      shieldMat.opacity = 0.0;
    }

    // 3. Position all 6 Bone Colliders & 3D World-Space V.A.T.S. Wireframe Bounding Boxes
    for (const limbId of ALL_LIMB_IDS) {
      const worldPos = computeBoneWorldPosition(
        state.position,
        state.yaw,
        state.combatState,
        this.animPhase,
        limbId
      );

      const mesh = this.boneMeshes[limbId];
      mesh.position.set(worldPos.x, worldPos.y, worldPos.z);
      mesh.rotation.set(0, state.yaw, 0);

      const wireBox = this.vatsWireframeBoxes[limbId];
      wireBox.position.set(worldPos.x, worldPos.y, worldPos.z);
      wireBox.rotation.set(0, state.yaw, 0);

      if (isVatsActive && vatsEvaluations) {
        wireBox.visible = true;
        const evalEntry = vatsEvaluations.find((e) => e.limbId === limbId);
        const wireMat = wireBox.material as THREE.LineBasicMaterial;
        if (evalEntry?.occluded) {
          wireMat.color.setHex(0xff2244); // Blocked by cover -> 0% hit probability
          wireMat.opacity = 0.45;
        } else if (limbId === selectedLimbId) {
          wireMat.color.setHex(0x00f0ff); // Targeted bone collider
          wireMat.opacity = 1.0;
        } else {
          wireMat.color.setHex(0x00ff88); // Clear line-of-sight bone collider
          wireMat.opacity = 0.75;
        }
      } else {
        wireBox.visible = false;
      }
    }
  }
}

/**
 * 3D Radial Kinetic Shockwave Visualizer (6.0m radius on Strength Lv 3+ Q Counter-Parry)
 */
export class KineticShockwaveEffect {
  public readonly mesh: THREE.Mesh;
  private timer = 0;
  private active = false;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.RingGeometry(0.3, 1.0, 32);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.0,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.rotation.x = Math.PI * 0.5;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  public trigger(origin: Vec3): void {
    this.active = true;
    this.timer = 0;
    this.mesh.visible = true;
    this.mesh.position.set(origin.x, origin.y + 0.18, origin.z);
    this.mesh.scale.set(0.2, 0.2, 1);
    (this.mesh.material as THREE.MeshBasicMaterial).opacity = 0.92;
  }

  public update(dt: number): void {
    if (!this.active) return;
    this.timer += dt;
    const duration = 0.45;
    const t = Math.min(1.0, this.timer / duration);
    const radius = 0.3 + t * PARRY_SHOCKWAVE_RADIUS_M;
    this.mesh.scale.set(radius, radius, 1);
    (this.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.9;
    if (t >= 1.0) {
      this.active = false;
      this.mesh.visible = false;
    }
  }
}
