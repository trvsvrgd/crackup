import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WEAPON_PROFILES, WeaponVariant } from '../../shared/combat/weaponPresentation.js';
import { productionAssets } from '../assets/productionAssets.js';
import { stylizePBR } from '../shaders/factionPalette.js';
import { BuilderResourcePool, type BuilderResult } from './builderContract.js';

export interface WeaponBuildResult extends BuilderResult {
  variant: WeaponVariant;
  grip: THREE.Object3D;
  muzzle: THREE.Object3D;
  /** World-space position and -Z forward, for muzzle effects without a second origin convention. */
  muzzleTransform(position: THREE.Vector3, direction: THREE.Vector3): void;
}

/** Metres, +Y up, -Z forward. Root is the palm/grip pivot for equipment AND debris. */
export class WeaponBuilder {
  public readonly resources = new BuilderResourcePool();
  public build(variant = WeaponVariant.CARBINE): WeaponBuildResult {
    const profile = WEAPON_PROFILES[variant];
    if (!profile) throw new Error(`Unknown weapon variant: ${variant}`);
    const scope = this.resources.scope(), root = new THREE.Group();
    root.name = `Weapon_${profile.key}`; root.userData.entityKind = 'weapon'; root.userData.weaponVariant = variant;
    const materials = new Set<THREE.Material>(), anchors = new Map<string, THREE.Object3D>();
    let source: 'procedural' | 'gltf' = 'procedural', imported: THREE.Object3D | null = null;
    const candidate = productionAssets.createModel('weapon', profile.key);
    if (candidate) {
      const scene = candidate.scene, grip = scene.getObjectByName('Grip'), muzzle = scene.getObjectByName('MuzzleFlashEmitter');
      const disposeCandidate = () => {
        const geometries = new Set<THREE.BufferGeometry>(), mats = new Set<THREE.Material>();
        scene.traverse(o => { if (o instanceof THREE.Mesh) { geometries.add(o.geometry); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => mats.add(m)); } });
        geometries.forEach(g => g.dispose()); mats.forEach(m => m.dispose());
      };
      if (grip && muzzle) {
        scene.updateMatrixWorld(true);
        // Normalize the authored grip, including rotated/offset imported roots.
        const correction = new THREE.Group(); correction.applyMatrix4(grip.matrixWorld.clone().invert()); correction.add(scene); correction.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(correction), size = bounds.getSize(new THREE.Vector3());
        const p = muzzle.getWorldPosition(new THREE.Vector3());
        const d = new THREE.Vector3(0, 0, -1).applyQuaternion(muzzle.getWorldQuaternion(new THREE.Quaternion()));
        let skinned = false; scene.traverse(o => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned = true; });
        const gripScale = grip.getWorldScale(new THREE.Vector3());
        if (!skinned && candidate.animations.length === 0 && [...bounds.min, ...bounds.max, ...gripScale].every(Number.isFinite) &&
          size.z > 0.2 && size.z < 1.6 && size.x < 0.6 && size.y < 0.7 &&
          gripScale.distanceTo(new THREE.Vector3(1, 1, 1)) < 0.001 && p.z < -0.2 && p.z > -1.4 && Math.abs(p.x) < 0.04 && Math.abs(p.y - 0.06) < 0.12 && d.dot(new THREE.Vector3(0, 0, -1)) > 0.995) {
          imported = correction; root.add(correction); source = 'gltf'; anchors.set('Grip', grip); anchors.set('MuzzleFlashEmitter', muzzle);
        } else disposeCandidate();
      } else disposeCandidate();
    }
    if (!imported) {
      const material = (key: string, color: number, emissive = false) => scope.get(`weapon:material:${key}`, () => stylizePBR(new THREE.MeshStandardMaterial({ color, metalness: 0.65, roughness: 0.4, emissive: emissive ? color : 0, emissiveIntensity: emissive ? 1.5 : 0 })));
      const steel = material('steel', 0x243744), ceramic = material('ceramic', 0xa8bdcd), gripMat = material('grip', 0x111c25), trim = material(profile.key, profile.color, true);
      const cube = scope.get('weapon:cube', () => new THREE.BoxGeometry(1, 1, 1));
      const cylinder = scope.get('weapon:cylinder', () => new THREE.CylinderGeometry(1, 1, 1, 6));
      const add = (name: string, geometry: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number], scale: [number, number, number]) => {
        const mesh = new THREE.Mesh(geometry, mat); mesh.name = name; mesh.position.set(...pos); mesh.scale.set(...scale); mesh.castShadow = mesh.receiveShadow = true; root.add(mesh); return mesh;
      };
      const box = (name: string, mat: THREE.Material, p: [number, number, number], s: [number, number, number]) => add(name, cube, mat, p, s);
      box('Receiver', steel, [0, 0.06, -0.11], [profile.width, 0.14, profile.receiver]);
      box('UpperReceiver', ceramic, [0, 0.13, -0.12], [profile.width * 0.8, 0.035, profile.receiver * 0.9]);
      box('PistolGrip', gripMat, [0, -0.06, 0], [0.065, 0.18, 0.08]).rotation.x = -0.16;
      box('TriggerGuard', steel, [0, -0.015, -0.07], [0.028, 0.025, 0.13]);
      box('Stock', ceramic, [0, 0.045, 0.13], [profile.width * 0.7, 0.12, profile.stock]);
      const barrelCenter = profile.muzzleZ + profile.barrel / 2 + 0.025;
      add('BarrelShroud', cylinder, steel, [0, 0.06, barrelCenter], [variant === WeaponVariant.HEAVY ? 0.055 : 0.032, profile.barrel, variant === WeaponVariant.HEAVY ? 0.055 : 0.032]).rotation.x = Math.PI / 2;
      box('Foregrip', ceramic, [0, -0.015, barrelCenter + 0.05], [profile.width * 0.9, 0.08, profile.barrel * 0.65]);
      box('MuzzleBrake', steel, [0, 0.06, profile.muzzleZ + 0.025], [profile.width * 0.6, 0.065, 0.05]);
      if (variant === WeaponVariant.HEAVY) add('Magazine', cylinder, gripMat, [0, -0.11, -0.12], [0.1, 0.19, 0.1]).rotation.z = Math.PI / 2;
      else box('Magazine', gripMat, [0, -0.11, -0.14], [0.065, variant === WeaponVariant.MARKSMAN ? 0.14 : 0.2, 0.1]).rotation.x = -0.2;
      if (variant === WeaponVariant.MARKSMAN) {
        add('Optic', cylinder, steel, [0, 0.22, -0.12], [0.038, 0.22, 0.038]).rotation.x = Math.PI / 2;
        add('OpticLens', cylinder, trim, [0, 0.22, -0.235], [0.028, 0.006, 0.028]).rotation.x = Math.PI / 2;
      } else add('Optic', scope.get('weapon:optic-ring', () => new THREE.TorusGeometry(0.035, 0.009, 3, 8)), trim, [0, 0.205, -0.13], [1, 1, 1]);
      for (const side of [-1, 1]) box(`ChargeStrip${side}`, trim, [side * (profile.width / 2 + 0.003), 0.075, -0.12], [0.009, 0.02, profile.receiver * 0.72]);
      for (const [name, p] of [['Grip', [0, 0, 0]], ['MuzzleFlashEmitter', [0, 0.06, profile.muzzleZ]], ['SupportGrip', [0, -0.045, barrelCenter + 0.05]]] as [string, [number, number, number]][]) {
        const anchor = new THREE.Object3D(); anchor.name = name; anchor.position.set(...p); root.add(anchor); anchors.set(name, anchor);
      }
      // Two material batches: vertex-colored body and emissive trim. Shadow/outline passes
      // multiply each draw; retaining separate steel/ceramic/grip draws is unnecessarily costly.
      const bodyMaterial = material('vertex-body', 0xffffff); bodyMaterial.vertexColors = true;
      const batches = new Map<THREE.Material, THREE.Mesh[]>();
      for (const child of [...root.children]) if (child instanceof THREE.Mesh) {
        const mat = child.material === trim ? trim : bodyMaterial, batch = batches.get(mat) ?? []; batch.push(child); batches.set(mat, batch);
      }
      for (const [index, [mat, meshes]] of [...batches].entries()) {
        const geometry = scope.get(`weapon:batch:${variant}:${index}`, () => {
          const parts = meshes.map(m => {
            m.updateMatrix(); const geometry = m.geometry.clone().applyMatrix4(m.matrix), color = (m.material as THREE.MeshStandardMaterial).color;
            const colors = new Float32Array(geometry.getAttribute('position').count * 3);
            for (let i = 0; i < colors.length; i += 3) { colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b; }
            geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); return geometry;
          });
          const merged = mergeGeometries(parts, false); parts.forEach(g => g.dispose());
          if (!merged) throw new Error('Weapon geometry batching failed'); return merged;
        });
        for (const mesh of meshes) { const part = new THREE.Object3D(); part.name = mesh.name; part.position.copy(mesh.position); part.quaternion.copy(mesh.quaternion); part.scale.copy(mesh.scale); root.remove(mesh); root.add(part); }
        const mesh = new THREE.Mesh(geometry, mat); mesh.name = `WeaponMaterialBatch${index}`; mesh.castShadow = mesh.receiveShadow = true; root.add(mesh);
      }
    }
    root.traverse(o => { if (o instanceof THREE.Mesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m)); });
    const grip = anchors.get('Grip')!, muzzle = anchors.get('MuzzleFlashEmitter')!, q = new THREE.Quaternion();
    let disposed = false;
    return { root, variant, source, grip, muzzle, anchors, materials, animatedParts: new Map(), collisions: [], update: () => {},
      muzzleTransform: (position, direction) => { root.updateWorldMatrix(true, true); muzzle.getWorldPosition(position); direction.set(0, 0, -1).applyQuaternion(muzzle.getWorldQuaternion(q)).normalize(); },
      dispose: () => {
        if (disposed) return; disposed = true; root.removeFromParent();
        if (imported) { const geometries = new Set<THREE.BufferGeometry>(); imported.traverse(o => { if (o instanceof THREE.Mesh) geometries.add(o.geometry); }); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); }
        scope.dispose(); root.clear();
      },
    };
  }
}
export const weaponBuilder = new WeaponBuilder();
