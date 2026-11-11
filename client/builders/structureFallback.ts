import * as THREE from 'three';
import type { WorldBoxStructure } from '../../shared/world/neoVeridiaBlock.js';

/** Existing collider-sized modules remain the source of geometry. Details stay inside their bounds;
 * new parkour ledges and their colliders belong to the subsequent ArchBuilder stage. */
export function buildStructureFallback(s: WorldBoxStructure, surface: THREE.MeshStandardMaterial, trim: THREE.Material): THREE.Group {
  const root = new THREE.Group(); root.name = s.id; root.userData.entityKind = 'structure';
  const w = s.halfExtents.x * 2, h = s.halfExtents.y * 2, d = s.halfExtents.z * 2;
  const shell = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), surface); shell.name = 'StructuralShell'; root.add(shell);
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x364755, metalness: 0.65, roughness: 0.5 });
  const corners = new THREE.InstancedMesh(new THREE.BoxGeometry(Math.min(0.55, w * 0.06), h, Math.min(0.55, d * 0.06)), trimMat, 4);
  corners.name = 'CornerColumns'; const matrix = new THREE.Matrix4(); let index = 0;
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    matrix.makeTranslation(x * (w / 2 - Math.min(0.275, w * 0.03)), 0, z * (d / 2 - Math.min(0.275, d * 0.03))); corners.setMatrixAt(index++, matrix);
  }
  root.add(corners);
  if (w >= 8 && d >= 8 && h >= 6) {
    const rows = Math.max(1, Math.floor((h - 2) / 3.6)), colsX = Math.max(1, Math.floor((w - 2) / 2.4)), colsZ = Math.max(1, Math.floor((d - 2) / 2.4));
    const windows = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0x1e536b, emissive: 0x1b5c75, emissiveIntensity: 0.5, metalness: 0.65, roughness: 0.25, side: THREE.DoubleSide }), rows * (colsX + colsZ) * 2);
    windows.name = 'RecessedWindowBays'; const pose = new THREE.Object3D(); index = 0;
    for (let row = 0; row < rows; row++) for (let face = 0; face < 4; face++) {
      const cols = face < 2 ? colsX : colsZ, span = face < 2 ? w : d;
      for (let col = 0; col < cols; col++) {
        const horizontal = (col + 0.5) * (span - 2) / cols - (span - 2) / 2, y = (row + 0.5) * (h - 2) / rows - (h - 2) / 2;
        pose.position.set(face < 2 ? horizontal : (face === 2 ? 1 : -1) * (w / 2 + 0.005), y, face < 2 ? (face === 0 ? 1 : -1) * (d / 2 + 0.005) : horizontal);
        pose.rotation.y = face < 2 ? 0 : Math.PI / 2; pose.scale.set((span - 2) / cols * 0.67, (h - 2) / rows * 0.55, 1); pose.updateMatrix(); windows.setMatrixAt(index++, pose.matrix);
        windows.setColorAt(index - 1, new THREE.Color((row * 7 + col * 13 + face) % 5 === 0 ? 0x243a4b : 0x9bc4d0));
      }
    }
    root.add(windows);
    if (s.id.includes('podium')) {
      const awning = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.2, Math.min(d * 0.15, 2)), trimMat); awning.position.set(0, -h * 0.1, -d / 2); root.add(awning);
      const entrance = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(3, w * 0.25), Math.min(3, h * 0.5)), trim); entrance.position.set(0, -h / 2 + Math.min(1.5, h * 0.25), -d / 2 - 0.01); root.add(entrance);
    }
  } else {
    // Industrial modules receive contrasting endcaps and a powered service strip.
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, Math.min(h * 0.12, 0.2), d * 0.92), trimMat); cap.position.y = h * 0.4; root.add(cap);
  }
  const strip = new THREE.Mesh(new THREE.BoxGeometry(Math.min(0.12, w * 0.08), h * 0.7, 0.04), trim);
  strip.name = 'PoweredServiceStrip'; strip.position.set(w * 0.37, 0, -d / 2 - 0.025); root.add(strip);
  root.traverse(o => { if (o instanceof THREE.Mesh) o.castShadow = o.receiveShadow = true; });
  root.position.set(s.center.x, s.center.y, s.center.z); if (s.rotation) root.rotation.set(s.rotation.x, s.rotation.y, s.rotation.z);
  return root;
}

export function assertMultipartEntity(root: THREE.Object3D): void {
  let meshes = 0; const materials = new Set<THREE.Material>();
  root.traverse(o => { if (o instanceof THREE.Mesh) { meshes++; (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m)); } });
  if (meshes < 3 || materials.size < 2) throw new Error(`${root.name || 'Entity'}: requires distinct multipart geometry and materials`);
}
