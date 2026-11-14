import * as THREE from 'three';
import type { WorldBoxStructure } from '../../shared/world/neoVeridiaBlock.js';

export type ModelKind = 'building' | 'vehicle' | 'relay' | 'weapon';
export interface BuilderResult {
  root: THREE.Group;
  anchors: ReadonlyMap<string, THREE.Object3D>;
  animatedParts: ReadonlyMap<string, THREE.Object3D>;
  materials: ReadonlySet<THREE.Material>;
  collisions: readonly WorldBoxStructure[];
  source: 'procedural' | 'gltf';
  update(dt: number, cameraPosition?: THREE.Vector3): void;
  dispose(): void;
}

/** Each building takes one reference per resource; disposing a neighbor cannot invalidate it. */
export class BuilderResourcePool {
  private readonly entries = new Map<string, { value: THREE.BufferGeometry | THREE.Material | THREE.Texture; refs: number }>();
  public scope(): BuilderResourceScope { return new BuilderResourceScope(this); }
  public acquire<T extends THREE.BufferGeometry | THREE.Material | THREE.Texture>(key: string, create: () => T): T {
    let entry = this.entries.get(key);
    if (!entry) { entry = { value: create(), refs: 0 }; this.entries.set(key, entry); }
    entry.refs++; return entry.value as T;
  }
  public release(key: string): void {
    const entry = this.entries.get(key); if (!entry) return;
    if (--entry.refs === 0) { entry.value.dispose(); this.entries.delete(key); }
  }
  public get size(): number { return this.entries.size; }
}
export class BuilderResourceScope {
  private readonly owned = new Map<string, THREE.BufferGeometry | THREE.Material | THREE.Texture>();
  private disposed = false;
  constructor(private readonly pool: BuilderResourcePool) {}
  public get<T extends THREE.BufferGeometry | THREE.Material | THREE.Texture>(key: string, create: () => T): T {
    if (this.disposed) throw new Error('Builder resource scope has been disposed');
    if (!this.owned.has(key)) this.owned.set(key, this.pool.acquire(key, create));
    return this.owned.get(key) as T;
  }
  public dispose(): void {
    if (this.disposed) return; this.disposed = true;
    for (const key of this.owned.keys()) this.pool.release(key); this.owned.clear();
  }
}
