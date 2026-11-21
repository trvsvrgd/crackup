import * as THREE from 'three';
import { RESONANCE_SPIRE_RULES } from '../../shared/content/worldLore.js';
import type { Vec3 } from '../../shared/protocol/binaryProtocol.js';

const brass = new THREE.MeshStandardMaterial({ color: 0xb58a40, metalness: 0.88, roughness: 0.27 });
const tetherGeometry = new THREE.CylinderGeometry(0.035, 0.11, 1.25, 6);
const ringGeometry = new THREE.TorusGeometry(0.78, 0.045, 8, 24);
function crystallineRibbon(): THREE.BufferGeometry {
  const vertices: number[] = [];
  const point = (step: number, corner: number): [number, number, number] => {
    const t = step / 16, angle = t * Math.PI * 2.5;
    const width = 0.4 * Math.sin(Math.PI * t) + 0.01;
    const u = (corner < 2 ? -1 : 1) * width, v = (corner === 0 || corner === 3 ? -1 : 1) * 0.045;
    return [Math.cos(angle) * u - Math.sin(angle) * v, t - 0.5, Math.sin(angle) * u + Math.cos(angle) * v];
  };
  for (let i = 0; i < 16; i++) for (let side = 0; side < 4; side++) {
    const a = point(i, side), b = point(i, (side + 1) % 4), c = point(i + 1, side), d = point(i + 1, (side + 1) % 4);
    vertices.push(...a, ...c, ...b, ...b, ...c, ...d);
  }
  const geometry = new THREE.BufferGeometry(); geometry.name = 'CrystallineMemoryRibbon';
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.computeVertexNormals();
  return geometry;
}
const ribbonGeometry = crystallineRibbon();
export function createResonanceSpire(material: THREE.MeshStandardMaterial): THREE.Group {
  const group = new THREE.Group(); group.name = 'ResonanceSpire';
  const ribbon = new THREE.Mesh(ribbonGeometry, material); ribbon.name = 'MemoryRibbon'; ribbon.scale.set(0.45, 1.35, 0.65);
  const outer = new THREE.Mesh(ringGeometry, brass); outer.name = 'OuterGyroscope'; outer.rotation.x = Math.PI / 3;
  const inner = new THREE.Mesh(ringGeometry, brass); inner.name = 'InnerGyroscope'; inner.scale.setScalar(0.82); inner.rotation.z = Math.PI / 3;
  const tether = new THREE.Mesh(tetherGeometry, brass); tether.name = 'LightningRodTether'; tether.position.y = -0.625;
  group.add(ribbon, outer, inner, tether);
  return group;
}
export function animateResonanceSpire(group: THREE.Group, elapsed: number, dt: number): void {
  group.children[1]!.rotation.y += dt * 2.2;
  group.children[2]!.rotation.y -= dt * 2.2;
  const pulse = 1 + 0.12 * Math.sin(elapsed * Math.PI * 2 * RESONANCE_SPIRE_RULES.bpm / 60);
  group.children[0]!.scale.set(0.45 * pulse, 1.35 * pulse, 0.65 * pulse);
  group.children[0]!.rotation.y += dt;
}
interface Shard { mesh: THREE.Mesh; velocity: THREE.Vector3; age: number; floor: number }
/** Ballistic debris with gravity, floor bounce and finite lifetime; no gameplay colliders. */
export class ResonanceShatter {
  public readonly shards: Shard[] = [];
  public hitStopUntil = 0;
  private readonly geometry = new THREE.TetrahedronGeometry(0.09);
  private readonly material = new THREE.MeshStandardMaterial({ color: 0xc8ffff, emissive: 0x438899, metalness: 0.5, roughness: 0.15 });
  constructor(private readonly scene: THREE.Scene) {}
  collect(position: Vec3, nowMs: number): void {
    this.hitStopUntil = nowMs + RESONANCE_SPIRE_RULES.hitStopMs;
    for (let i = 0; i < RESONANCE_SPIRE_RULES.shardCount; i++) {
      const angle = i * Math.PI * 2 / RESONANCE_SPIRE_RULES.shardCount;
      const mesh = new THREE.Mesh(this.geometry, this.material); mesh.position.copy(position); this.scene.add(mesh);
      this.shards.push({ mesh, velocity: new THREE.Vector3(Math.cos(angle) * (2 + i % 3), 3 + i % 4, Math.sin(angle) * (2 + i % 3)), age: 0, floor: position.y - 1.25 });
    }
  }
  update(dt: number): void {
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i]!; s.age += dt; s.velocity.y -= 24 * dt; s.mesh.position.addScaledVector(s.velocity, dt);
      if (s.mesh.position.y < s.floor) { s.mesh.position.y = s.floor; s.velocity.y = Math.abs(s.velocity.y) * 0.35; s.velocity.x *= 0.65; s.velocity.z *= 0.65; }
      s.mesh.rotation.x += dt * 4; s.mesh.rotation.z += dt * 3; s.mesh.scale.setScalar(Math.max(0, 1 - s.age / 1.2));
      if (s.age >= 1.2) { this.scene.remove(s.mesh); this.shards.splice(i, 1); }
    }
  }
  reset(): void { for (const s of this.shards) this.scene.remove(s.mesh); this.shards.length = 0; this.hitStopUntil = 0; }
  dispose(): void { this.reset(); this.geometry.dispose(); this.material.dispose(); }
}
