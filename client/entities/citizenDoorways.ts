import * as THREE from 'three';
import { CITIZEN_DOORWAY_REGISTRY } from '../../shared/content/worldLore.js';

/** Sealed residential entrances attached to existing collidable building facades. */
export function buildCitizenDoorways(): THREE.Group {
  const root = new THREE.Group(); root.name = 'CitizenDoorways';
  const frame = new THREE.MeshStandardMaterial({ color: 0x576575, metalness: 0.65, roughness: 0.4 });
  const door = new THREE.MeshStandardMaterial({ color: 0x233138, metalness: 0.35, roughness: 0.7 });
  const plaque = new THREE.MeshStandardMaterial({ color: 0xa98d59, metalness: 0.8, roughness: 0.3 });
  const panel = new THREE.BoxGeometry(1.15, 2.25, 0.05);
  const post = new THREE.BoxGeometry(0.1, 2.4, 0.12);
  const lintel = new THREE.BoxGeometry(1.4, 0.12, 0.12);
  const badge = new THREE.BoxGeometry(0.28, 0.12, 0.04);
  const handle = new THREE.BoxGeometry(0.04, 0.22, 0.08);
  for (const entry of CITIZEN_DOORWAY_REGISTRY) {
    const group = new THREE.Group(); group.name = entry.id; group.position.copy(entry.coords);
    const leaf = new THREE.Mesh(panel, door); leaf.position.y = 1.125;
    const left = new THREE.Mesh(post, frame); left.position.set(-0.65, 1.2, 0);
    const right = new THREE.Mesh(post, frame); right.position.set(0.65, 1.2, 0);
    const top = new THREE.Mesh(lintel, frame); top.position.y = 2.4;
    const plate = new THREE.Mesh(badge, plaque); plate.position.set(0, 1.85, 0.06);
    const latch = new THREE.Mesh(handle, plaque); latch.position.set(0.42, 1, 0.08);
    group.add(leaf, left, right, top, plate, latch); root.add(group);
  }
  return root;
}
