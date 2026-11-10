/**
 * CRACKUP: Protocol Eclipse (v2.0 True 3D AAA Architecture)
 * Articulated 3D Agent Mesh Hierarchy & Procedural Locomotion Animator
 * Hierarchy: Root (foot origin) -> Pelvis -> Torso, Head/Visor, Upper/Lower Arms, Upper/Lower Legs
 */

import * as THREE from 'three';
import { AgentAnimState } from '../../shared/constants.js';
import { Quat4, Vec3 } from '../../shared/protocol/binaryProtocol.js';

export class ArticulatedAgentRig {
  public readonly root: THREE.Group;
  public readonly pelvisPivot: THREE.Group;
  public readonly torsoPivot: THREE.Group;
  public readonly headPivot: THREE.Group;

  // Articulated Upper & Lower Arm Joints
  public readonly leftShoulderPivot: THREE.Group;
  public readonly leftElbowPivot: THREE.Group;
  public readonly rightShoulderPivot: THREE.Group;
  public readonly rightElbowPivot: THREE.Group;

  // Articulated Upper & Lower Leg Joints
  public readonly leftHipPivot: THREE.Group;
  public readonly leftKneePivot: THREE.Group;
  public readonly rightHipPivot: THREE.Group;
  public readonly rightKneePivot: THREE.Group;

  // Visual effects (Air-dash & Agility level wind-shear trails)
  public readonly dashTrailMesh: THREE.Mesh;
  public readonly windShearGroup: THREE.Group;
  private labelSprite: THREE.Sprite | null = null;
  private currentCallsign = '';
  private walkCyclePhase = 0;
  private idleTime = 0;

  constructor(callsign: string, isLocalPlayer: boolean) {
    this.root = new THREE.Group();
    this.root.name = `AgentRig_${callsign}`;

    const primaryColor = isLocalPlayer ? 0x00f0ff : 0xff2a85;
    const armorMat = new THREE.MeshStandardMaterial({
      color: 0x161b26,
      roughness: 0.35,
      metalness: 0.75,
    });
    const jointMat = new THREE.MeshStandardMaterial({
      color: 0x263042,
      roughness: 0.5,
      metalness: 0.6,
    });
    const neonMat = new THREE.MeshStandardMaterial({
      color: primaryColor,
      emissive: primaryColor,
      emissiveIntensity: 2.4,
      roughness: 0.2,
      metalness: 0.8,
    });

    // 1. Pelvis Pivot (at Y = 0.92m from foot origin)
    this.pelvisPivot = new THREE.Group();
    this.pelvisPivot.position.set(0, 0.92, 0);
    this.root.add(this.pelvisPivot);

    const pelvisMesh = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 0.24), jointMat);
    pelvisMesh.castShadow = true;
    pelvisMesh.receiveShadow = true;
    this.pelvisPivot.add(pelvisMesh);

    // 2. Torso Pivot (parented to Pelvis)
    this.torsoPivot = new THREE.Group();
    this.torsoPivot.position.set(0, 0.08, 0);
    this.pelvisPivot.add(this.torsoPivot);

    const chestMesh = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.52, 0.28), armorMat);
    chestMesh.position.set(0, 0.26, 0);
    chestMesh.castShadow = true;
    chestMesh.receiveShadow = true;
    this.torsoPivot.add(chestMesh);

    // Cybernetic Spine Core Strip on Back (visible to Third-Person Camera)
    const spineCore = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.42, 0.04), neonMat);
    spineCore.position.set(0, 0.27, 0.15);
    this.torsoPivot.add(spineCore);

    // Chest Emblem Strip on Front
    const chestEmblem = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.03), neonMat);
    chestEmblem.position.set(0, 0.36, -0.145);
    this.torsoPivot.add(chestEmblem);

    // 3. Head Pivot (parented to Torso at Y = +0.54m -> ~1.54m above ground)
    this.headPivot = new THREE.Group();
    this.headPivot.position.set(0, 0.54, 0);
    this.torsoPivot.add(this.headPivot);

    const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.26, 0.26), armorMat);
    headMesh.position.set(0, 0.14, 0);
    headMesh.castShadow = true;
    this.headPivot.add(headMesh);

    // Glowing Tactical Visor facing -Z (Forward)
    const visorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.07, 0.04), neonMat);
    visorMesh.position.set(0, 0.16, -0.125);
    this.headPivot.add(visorMesh);

    // 4. Left & Right Articulated Arms (Upper Arm + Elbow Pivot + Lower Forearm)
    this.leftShoulderPivot = new THREE.Group();
    this.leftShoulderPivot.position.set(-0.29, 0.46, 0);
    this.torsoPivot.add(this.leftShoulderPivot);

    const leftUpperArm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.28, 0.13), armorMat);
    leftUpperArm.position.set(0, -0.12, 0);
    leftUpperArm.castShadow = true;
    this.leftShoulderPivot.add(leftUpperArm);

    this.leftElbowPivot = new THREE.Group();
    this.leftElbowPivot.position.set(0, -0.26, 0);
    this.leftShoulderPivot.add(this.leftElbowPivot);

    const leftLowerArm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.26, 0.11), jointMat);
    leftLowerArm.position.set(0, -0.12, 0);
    leftLowerArm.castShadow = true;
    this.leftElbowPivot.add(leftLowerArm);

    this.rightShoulderPivot = new THREE.Group();
    this.rightShoulderPivot.position.set(0.29, 0.46, 0);
    this.torsoPivot.add(this.rightShoulderPivot);

    const rightUpperArm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.28, 0.13), armorMat);
    rightUpperArm.position.set(0, -0.12, 0);
    rightUpperArm.castShadow = true;
    this.rightShoulderPivot.add(rightUpperArm);

    this.rightElbowPivot = new THREE.Group();
    this.rightElbowPivot.position.set(0, -0.26, 0);
    this.rightShoulderPivot.add(this.rightElbowPivot);

    const rightLowerArm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.26, 0.11), jointMat);
    rightLowerArm.position.set(0, -0.12, 0);
    rightLowerArm.castShadow = true;
    this.rightElbowPivot.add(rightLowerArm);

    // 5. Left & Right Articulated Legs (Hip Pivot + Upper Leg + Knee Pivot + Lower Leg)
    this.leftHipPivot = new THREE.Group();
    this.leftHipPivot.position.set(-0.12, -0.04, 0);
    this.pelvisPivot.add(this.leftHipPivot);

    const leftUpperLeg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.44, 0.16), armorMat);
    leftUpperLeg.position.set(0, -0.22, 0);
    leftUpperLeg.castShadow = true;
    this.leftHipPivot.add(leftUpperLeg);

    this.leftKneePivot = new THREE.Group();
    this.leftKneePivot.position.set(0, -0.44, 0);
    this.leftHipPivot.add(this.leftKneePivot);

    const leftLowerLeg = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.44, 0.15), jointMat);
    leftLowerLeg.position.set(0, -0.22, 0);
    leftLowerLeg.castShadow = true;
    this.leftKneePivot.add(leftLowerLeg);

    const leftBootTrim = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.20), neonMat);
    leftBootTrim.position.set(0, -0.42, -0.02);
    this.leftKneePivot.add(leftBootTrim);

    this.rightHipPivot = new THREE.Group();
    this.rightHipPivot.position.set(0.12, -0.04, 0);
    this.pelvisPivot.add(this.rightHipPivot);

    const rightUpperLeg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.44, 0.16), armorMat);
    rightUpperLeg.position.set(0, -0.22, 0);
    rightUpperLeg.castShadow = true;
    this.rightHipPivot.add(rightUpperLeg);

    this.rightKneePivot = new THREE.Group();
    this.rightKneePivot.position.set(0, -0.44, 0);
    this.rightHipPivot.add(this.rightKneePivot);

    const rightLowerLeg = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.44, 0.15), jointMat);
    rightLowerLeg.position.set(0, -0.22, 0);
    rightLowerLeg.castShadow = true;
    this.rightKneePivot.add(rightLowerLeg);

    const rightBootTrim = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.20), neonMat);
    rightBootTrim.position.set(0, -0.42, -0.02);
    this.rightKneePivot.add(rightBootTrim);

    // 6. Air-Dash Kinetic Wake Ring
    const dashGeo = new THREE.TorusGeometry(0.65, 0.035, 8, 24);
    const dashMat = new THREE.MeshBasicMaterial({
      color: primaryColor,
      transparent: true,
      opacity: 0.0,
    });
    this.dashTrailMesh = new THREE.Mesh(dashGeo, dashMat);
    this.dashTrailMesh.position.set(0, 1.0, 0.35);
    this.root.add(this.dashTrailMesh);

    // 7. Procedural Wind-Shear Trail Meshes (PRD Section 4.1.1 Agility Evolution)
    this.windShearGroup = new THREE.Group();
    const shearGeo = new THREE.BoxGeometry(0.035, 0.08, 1.35);
    const shearMat = new THREE.MeshBasicMaterial({
      color: primaryColor,
      transparent: true,
      opacity: 0.0,
    });
    const leftShear = new THREE.Mesh(shearGeo, shearMat);
    leftShear.position.set(-0.32, 1.25, 0.75);
    const rightShear = new THREE.Mesh(shearGeo, shearMat);
    rightShear.position.set(0.32, 1.25, 0.75);
    this.windShearGroup.add(leftShear, rightShear);
    this.root.add(this.windShearGroup);

    this.setCallsign(callsign, isLocalPlayer);
  }

  public setCallsign(callsign: string, isLocalPlayer: boolean): void {
    if (this.currentCallsign === callsign && this.labelSprite) return;
    this.currentCallsign = callsign;

    if (this.labelSprite) {
      this.root.remove(this.labelSprite);
      this.labelSprite.material.map?.dispose();
      this.labelSprite.material.dispose();
    }

    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 256, 64);
      ctx.fillStyle = 'rgba(8, 12, 22, 0.78)';
      ctx.strokeStyle = isLocalPlayer ? '#00f0ff' : '#ff2a85';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(8, 10, 240, 44, 8);
      ctx.fill();
      ctx.stroke();

      ctx.font = 'bold 24px "Segoe UI", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isLocalPlayer ? '#00f0ff' : '#ffffff';
      ctx.fillText(callsign, 128, 33);
    }

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    this.labelSprite = new THREE.Sprite(mat);
    this.labelSprite.position.set(0, 2.22, 0);
    this.labelSprite.scale.set(1.4, 0.35, 1);
    this.root.add(this.labelSprite);
  }

  /**
   * Updates the 3D world transform and drives procedural skeletal locomotion animation
   */
  public update(
    position: Vec3,
    rotation: Quat4,
    velocity: Vec3,
    animState: AgentAnimState,
    mantleProgress: number,
    dt: number,
    agilityLevel = 1
  ): void {
    this.root.position.set(position.x, position.y, position.z);
    this.root.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);

    const horizontalSpeed = Math.hypot(velocity.x, velocity.z);
    const speed3D = Math.hypot(velocity.x, velocity.y, velocity.z);
    this.idleTime += dt;

    // Reset base pelvis offset
    this.pelvisPivot.position.set(0, 0.92, 0);
    this.torsoPivot.rotation.set(0, 0, 0);
    this.headPivot.rotation.set(0, 0, 0);

    const dashMat = this.dashTrailMesh.material as THREE.MeshBasicMaterial;
    dashMat.opacity = animState === AgentAnimState.AIR_DASH ? 0.85 : Math.max(0, dashMat.opacity - dt * 4);

    // Update Procedural Wind-Shear Trails based on 3D speed & Agility Level
    const firstShear = this.windShearGroup.children[0] as THREE.Mesh | undefined;
    if (firstShear) {
      const shearMat = firstShear.material as THREE.MeshBasicMaterial;
      const targetShearOpacity =
        speed3D > 8.5 ? Math.min(0.75, ((speed3D - 8.5) / 14.0) * (0.35 + agilityLevel * 0.08)) : 0.0;
      shearMat.opacity += (targetShearOpacity - shearMat.opacity) * Math.min(1.0, dt * 10.0);
      const scaleZ = 0.6 + (agilityLevel - 1) * 0.3 + Math.min(1.5, speed3D * 0.06);
      this.windShearGroup.scale.set(1, 1, scaleZ);
    }

    if (animState === AgentAnimState.MANTLE_VAULT) {
      // Procedural 0.35s Ledge-Grab & Vault Pose
      const p = Math.max(0, Math.min(1, mantleProgress));
      const reachPhase = Math.sin(p * Math.PI);
      this.torsoPivot.rotation.x = 0.45 * reachPhase;
      this.leftShoulderPivot.rotation.x = -2.2 * (1 - p * 0.6);
      this.rightShoulderPivot.rotation.x = -2.2 * (1 - p * 0.6);
      this.leftElbowPivot.rotation.x = -0.8 * reachPhase;
      this.rightElbowPivot.rotation.x = -0.8 * reachPhase;

      this.leftHipPivot.rotation.x = -1.1 * reachPhase;
      this.leftKneePivot.rotation.x = 1.4 * reachPhase;
      this.rightHipPivot.rotation.x = -0.6 * reachPhase;
      this.rightKneePivot.rotation.x = 0.9 * reachPhase;
      return;
    }

    if (animState === AgentAnimState.AIR_DASH) {
      // Aerodynamic horizontal air-dash lunge
      this.torsoPivot.rotation.x = 0.55;
      this.leftShoulderPivot.rotation.x = 0.85;
      this.rightShoulderPivot.rotation.x = 0.85;
      this.leftElbowPivot.rotation.x = -0.35;
      this.rightElbowPivot.rotation.x = -0.35;
      this.leftHipPivot.rotation.x = -0.7;
      this.leftKneePivot.rotation.x = 1.1;
      this.rightHipPivot.rotation.x = 0.45;
      this.rightKneePivot.rotation.x = 0.4;
      return;
    }

    if (animState === AgentAnimState.JUMP_ASCEND || animState === AgentAnimState.FALL) {
      // Airborne athletic tuck
      const isAscending = animState === AgentAnimState.JUMP_ASCEND;
      this.torsoPivot.rotation.x = isAscending ? 0.15 : -0.1;
      this.leftShoulderPivot.rotation.x = isAscending ? -0.9 : -0.45;
      this.rightShoulderPivot.rotation.x = isAscending ? -0.4 : -0.85;
      this.leftElbowPivot.rotation.x = -0.65;
      this.rightElbowPivot.rotation.x = -0.65;

      this.leftHipPivot.rotation.x = -0.85;
      this.leftKneePivot.rotation.x = 1.25;
      this.rightHipPivot.rotation.x = -0.35;
      this.rightKneePivot.rotation.x = 0.65;
      return;
    }

    if (horizontalSpeed > 0.35) {
      // Run / Sprint Procedural Locomotion Cycle
      const freq = Math.min(18.0, 5.5 + horizontalSpeed * 0.72);
      this.walkCyclePhase += dt * freq;
      const amp = Math.min(1.15, 0.35 + horizontalSpeed * 0.055);

      const s = Math.sin(this.walkCyclePhase);
      const c = Math.cos(this.walkCyclePhase);

      // Vertical pelvis bounce at double stride frequency
      this.pelvisPivot.position.y = 0.92 + Math.abs(c) * 0.055;
      this.torsoPivot.rotation.x = Math.min(0.32, horizontalSpeed * 0.022);
      this.torsoPivot.rotation.y = -s * 0.14;

      // Opposite arm & leg swing with natural knee & elbow flex
      this.leftHipPivot.rotation.x = s * amp;
      this.rightHipPivot.rotation.x = -s * amp;

      this.leftKneePivot.rotation.x = Math.max(0.08, -s * amp * 1.15);
      this.rightKneePivot.rotation.x = Math.max(0.08, s * amp * 1.15);

      this.leftShoulderPivot.rotation.x = -s * amp * 0.85;
      this.rightShoulderPivot.rotation.x = s * amp * 0.85;
      this.leftElbowPivot.rotation.x = -0.45 - Math.max(0, -s) * 0.45;
      this.rightElbowPivot.rotation.x = -0.45 - Math.max(0, s) * 0.45;
    } else {
      // Combat-Ready Idle Breathing Pose
      const breath = Math.sin(this.idleTime * 2.4);
      this.pelvisPivot.position.y = 0.92 + breath * 0.012;
      this.torsoPivot.rotation.x = 0.03 + breath * 0.015;

      this.leftShoulderPivot.rotation.x = 0.08;
      this.rightShoulderPivot.rotation.x = -0.08;
      this.leftElbowPivot.rotation.x = -0.32;
      this.rightElbowPivot.rotation.x = -0.38;

      this.leftHipPivot.rotation.x = -0.05;
      this.leftKneePivot.rotation.x = 0.10;
      this.rightHipPivot.rotation.x = 0.05;
      this.rightKneePivot.rotation.x = 0.08;
    }
  }

  public dispose(): void {
    this.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
  }
}

