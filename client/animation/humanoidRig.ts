import * as THREE from 'three';
import { AugmentChassisId } from '../../shared/constants.js';
import { EnemyArchetype, WARDEN_RIG_SCALE } from '../../shared/combat/combatPresentation.js';
import { createFactionMaterials } from '../shaders/factionPalette.js';
import { productionAssets } from '../assets/productionAssets.js';

export const JOINT_LAYOUT = {
  Pelvis: ['', 0, 0.94, 0], Spine: ['Pelvis', 0, 0.12, 0], Chest: ['Spine', 0, 0.22, 0], Neck: ['Chest', 0, 0.25, 0], Head: ['Neck', 0, 0.12, 0],
  LeftClavicle: ['Chest', -0.17, 0.16, 0], LeftUpperArm: ['LeftClavicle', -0.13, 0, 0], LeftForearm: ['LeftUpperArm', 0, -0.28, 0], LeftHand: ['LeftForearm', 0, -0.25, 0],
  RightClavicle: ['Chest', 0.17, 0.16, 0], RightUpperArm: ['RightClavicle', 0.13, 0, 0], RightForearm: ['RightUpperArm', 0, -0.28, 0], RightHand: ['RightForearm', 0, -0.25, 0],
  LeftThigh: ['Pelvis', -0.13, -0.04, 0], LeftCalf: ['LeftThigh', 0, -0.43, 0], LeftFoot: ['LeftCalf', 0, -0.4, -0.05],
  RightThigh: ['Pelvis', 0.13, -0.04, 0], RightCalf: ['RightThigh', 0, -0.43, 0], RightFoot: ['RightCalf', 0, -0.4, -0.05],
} as const;
export type JointName = keyof typeof JOINT_LAYOUT;
export type RigStyle = AugmentChassisId | EnemyArchetype;

/** A prop hierarchy shared by hand sockets and authoritative disarm debris. Forward = -Z. */
export function createRigFirearm(heavy = false): THREE.Group {
  const g = new THREE.Group(); g.name = 'SocketFirearm';
  const m = createFactionMaterials('aegis');
  const part = (name: string, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geo, mat); mesh.name = name; mesh.position.set(x, y, z); mesh.castShadow = true; g.add(mesh); return mesh;
  };
  part('Receiver', new THREE.BoxGeometry(0.11, 0.14, heavy ? 0.5 : 0.32), m.joint, 0, 0, -0.1);
  const barrel = part('BarrelShroud', new THREE.CylinderGeometry(0.035, 0.045, 0.3, 8), m.armor, 0, 0.02, -0.4); barrel.rotation.x = Math.PI / 2;
  part('Magazine', new THREE.BoxGeometry(0.07, 0.18, 0.09), m.joint, 0, -0.12, -0.1).rotation.x = -0.2;
  part('Optic', new THREE.TorusGeometry(0.045, 0.012, 4, 8), m.trim, 0, 0.11, -0.13);
  part('ChargeStrip', new THREE.BoxGeometry(0.012, 0.025, 0.23), m.trim, 0.06, 0.025, -0.13);
  const muzzle = new THREE.Object3D(); muzzle.name = 'MuzzleFlashEmitter'; muzzle.position.set(0, 0.02, -0.57); g.add(muzzle);
  return g;
}
export class HumanoidRig {
  public readonly root = new THREE.Group();
  public readonly bones = {} as Record<JointName, THREE.Bone>;
  public readonly skeleton: THREE.Skeleton;
  public readonly materials;
  public readonly weapon: THREE.Group;
  constructor(public readonly style: RigStyle, enemy = false) {
    const faction = enemy && (style === EnemyArchetype.STREET_ENFORCER || style === EnemyArchetype.CYBER_RONIN) ? 'syndicate' : !enemy && style === AugmentChassisId.PHANTOM_SHARPSHOOTER ? 'resistance' : 'aegis';
    this.materials = createFactionMaterials(faction);
    productionAssets.applyMaterial(this.materials.joint, 'carbon_fiber', [2, 2]);
    for (const [name, [parent, x, y, z]] of Object.entries(JOINT_LAYOUT)) {
      const bone = new THREE.Bone(); bone.name = name; bone.position.set(x, y, z); this.bones[name as JointName] = bone;
      (parent ? this.bones[parent as JointName] : this.root).add(bone);
    }
    this.skeleton = new THREE.Skeleton(Object.values(this.bones));
    this.root.updateMatrixWorld(true); this.skeleton.calculateInverses();
    const plate = (joint: JointName, name: string, w: number, h: number, d: number, y = 0, z = 0, material = this.materials.armor) => {
      // Bevelled extruded armor, not cuboid limb placeholders.
      const shape = new THREE.Shape(), c = Math.min(w, h) * 0.18;
      shape.moveTo(-w / 2 + c, -h / 2); shape.lineTo(w / 2 - c, -h / 2); shape.lineTo(w / 2, -h / 2 + c);
      shape.lineTo(w / 2, h / 2 - c); shape.lineTo(w / 2 - c, h / 2); shape.lineTo(-w / 2 + c, h / 2);
      shape.lineTo(-w / 2, h / 2 - c); shape.lineTo(-w / 2, -h / 2 + c); shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.012, bevelSegments: 1, steps: 1 });
      geo.translate(0, 0, -d / 2);
      const mesh = new THREE.Mesh(geo, material); mesh.name = name; mesh.position.set(0, y, z); mesh.castShadow = mesh.receiveShadow = true; this.bones[joint].add(mesh); return mesh;
    };
    plate('Pelvis', 'HipCage', 0.36, 0.18, 0.25, 0, 0, this.materials.joint);
    plate('Spine', 'AbdominalSegments', 0.29, 0.2, 0.21);
    plate('Chest', 'ChestCarapace', 0.44, 0.32, 0.28, 0.02);
    plate('Chest', 'ChestTelemetry', 0.28, 0.04, 0.025, 0.1, -0.16, this.materials.trim);
    plate('Spine', 'DorsalNeuralRail', 0.07, 0.34, 0.03, 0.13, 0.15, this.materials.trim);
    plate('Neck', 'Collar', 0.17, 0.1, 0.17, 0, 0, this.materials.joint);
    plate('Head', 'Helmet', 0.24, 0.25, 0.25, 0.09);
    plate('Head', 'OpticVisor', 0.23, 0.055, 0.035, 0.11, -0.14, this.materials.trim);
    for (const side of ['Left', 'Right'] as const) {
      plate(`${side}UpperArm`, `${side}BicepArmor`, 0.14, 0.23, 0.16, -0.12);
      plate(`${side}Forearm`, `${side}Bracer`, 0.14, 0.21, 0.17, -0.11, 0, this.materials.joint);
      plate(`${side}Hand`, `${side}Gauntlet`, 0.12, 0.12, 0.14, -0.035);
      plate(`${side}Thigh`, `${side}ThighPlate`, 0.18, 0.34, 0.22, -0.2);
      plate(`${side}Calf`, `${side}ShinGuard`, 0.15, 0.33, 0.18, -0.18, 0, this.materials.joint);
      plate(`${side}Foot`, `${side}Boot`, 0.17, 0.11, 0.28, 0, -0.04);
      plate(`${side}Foot`, `${side}BootTelemetry`, 0.17, 0.025, 0.18, 0, -0.1, this.materials.trim);
    }
    const heavy = style === EnemyArchetype.AEGIS_SHOCK_TROOPER || style === EnemyArchetype.SECTOR_WARDEN || style === AugmentChassisId.TITAN_JUGGERNAUT;
    if (heavy) for (const side of ['Left', 'Right'] as const) plate(`${side}Clavicle`, `${side}Pauldron`, 0.32, 0.22, 0.35);
    if (style === EnemyArchetype.AEGIS_SHOCK_TROOPER) plate('LeftForearm', 'RiotShield', 0.5, 0.8, 0.1, -0.15, -0.17);
    if (style === EnemyArchetype.CYBER_RONIN || style === AugmentChassisId.PHANTOM_SHARPSHOOTER) {
      for (const x of [-0.15, 0.15]) { const blade = plate('Chest', 'DorsalPlasmaBlade', 0.045, 0.9, 0.07, 0.05, 0.24, this.materials.trim); blade.position.x = x; blade.rotation.z = x * 2; }
    }
    if (style === EnemyArchetype.SECTOR_WARDEN) {
      this.root.scale.setScalar(WARDEN_RIG_SCALE);
      for (const side of ['Left', 'Right'] as const) {
        plate(`${side}Clavicle`, `${side}RocketPod`, 0.22, 0.3, 0.42, 0.16);
        plate(`${side}Calf`, `${side}HydraulicPiston`, 0.05, 0.38, 0.05, -0.17, 0.13, this.materials.trim);
      }
    }
    if (style === AugmentChassisId.AERO_VALKYRIE) {
      for (const x of [-0.35, 0.35]) { const wing = plate('Chest', 'FlightVane', 0.22, 0.65, 0.08, 0.02, 0.22); wing.position.x = x; wing.rotation.z = x; }
    }
    if (style === AugmentChassisId.DEMOLITION_SAVANT) {
      for (const x of [-0.15, 0, 0.15]) { const cell = plate('Pelvis', 'ExplosiveCell', 0.1, 0.17, 0.1, 0.04, -0.2, this.materials.trim); cell.position.x = x; }
    }
    if (style === AugmentChassisId.PACK_VANGUARD) {
      plate('Chest', 'TriageBackpack', 0.34, 0.45, 0.2, 0, 0.25);
      plate('LeftClavicle', 'SquadBeacon', 0.045, 0.42, 0.045, 0.28, 0.12, this.materials.trim);
    }
    this.weapon = createRigFirearm(heavy); this.bones.RightHand.add(this.weapon);
    this.root.userData.entityKind = enemy ? 'enemy' : 'agent';
    this.root.userData.silhouette = style;
  }
  public dispose(): void {
    const materials = new Set<THREE.Material>();
    this.root.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m)); } });
    materials.forEach(m => { if (m instanceof THREE.MeshStandardMaterial) productionAssets.releaseMaterial(m); m.dispose(); }); this.skeleton.dispose();
  }
}
