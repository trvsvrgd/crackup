import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { ModelKind } from '../builders/builderContract.js';

type Maps = { diffuse: string; roughness: string; normal: string; metalness?: string };
interface Manifest {
  environment: { url: string };
  materials: Record<string, { maps: Maps }>;
  characters: Record<string, { url: string }>;
  models?: Partial<Record<ModelKind, Record<string, { url: string; requiredAnchors?: string[] }>>>;
}

/** Shared immutable templates; each avatar receives an independent skeleton/mixer. */
export class ProductionAssetManager {
  public readonly textures = new Map<string, Record<string, THREE.Texture>>();
  public readonly characters = new Map<string, GLTF>();
  public readonly models = new Map<string, GLTF>();
  public readonly modelFailures = new Map<string, string>();
  public environment: THREE.DataTexture | null = null;
  private environmentTarget: THREE.WebGLRenderTarget | null = null;
  private readonly materialMaps = new WeakMap<THREE.Material, string>();
  private readonly loader = new THREE.TextureLoader();
  private anisotropy = 1;

  public async load(renderer: THREE.WebGLRenderer): Promise<void> {
    const response = await fetch('/assets/manifest.json');
    if (!response.ok) throw new Error(`Asset manifest: HTTP ${response.status}; run npm run assets:fetch`);
    const manifest = await response.json() as Manifest;
    this.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    // Stage 2: real HDR environment, decoded by the same Three.js loader as production.
    this.environment = await new RGBELoader().loadAsync(manifest.environment.url);
    this.environment.mapping = THREE.EquirectangularReflectionMapping;
    // Stage 3: PBR maps. Keep scalar and normal maps in linear color space.
    for (const [name, material] of Object.entries(manifest.materials)) {
      const maps: Record<string, THREE.Texture> = {};
      try {
        for (const [channel, url] of Object.entries(material.maps)) {
          const texture = await this.loader.loadAsync(url);
          texture.colorSpace = channel === 'diffuse' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
          texture.anisotropy = this.anisotropy;
          maps[channel] = texture;
        }
      } catch (error) { Object.values(maps).forEach((texture) => texture.dispose()); throw error; }
      this.textures.set(name, maps);
    }
    // Stage 4: skinned humanoid templates and their genuine animation clips.
    const loader = new GLTFLoader();
    for (const [name, model] of Object.entries(manifest.characters)) {
      const gltf = await loader.loadAsync(model.url);
      let skinned = 0;
      gltf.scene.traverse((object) => { if ((object as THREE.SkinnedMesh).isSkinnedMesh) skinned++; });
      if (!skinned || !gltf.animations.length) throw new Error(`${name}: missing SkinnedMesh or animation clips`);
      this.characters.set(name, gltf);
    }
    await this.loadModels(manifest.models ?? {});
    console.info('[Production assets]', { materials: this.textures.size, characters: [...this.characters.keys()] });
  }

  /** Optional entity packs fail independently; a missing model always leaves its procedural builder usable. */
  public async loadModels(models: NonNullable<Manifest['models']>, loader: Pick<GLTFLoader, 'loadAsync'> = new GLTFLoader()): Promise<void> {
    const required: Record<ModelKind, string[]> = {
      building: ['Entrance', 'RoofEntry', 'Helipad'], vehicle: ['WheelFL', 'WheelFR', 'WheelRL', 'WheelRR'], relay: ['Terminal', 'CoolingVent'], weapon: ['Grip', 'MuzzleFlashEmitter'],
    };
    for (const [kind, entries] of Object.entries(models) as [ModelKind, Record<string, { url: string; requiredAnchors?: string[] }>][]) {
      if (!(kind in required)) continue;
      for (const [name, spec] of Object.entries(entries)) {
        const key = `${kind}:${name}`;
        let candidate: GLTF | null = null;
        try {
          const model = await loader.loadAsync(spec.url);
          candidate = model;
          model.scene.updateMatrixWorld(true);
          const bounds = new THREE.Box3().setFromObject(model.scene), size = bounds.getSize(new THREE.Vector3());
          let meshCount = 0; model.scene.traverse(o => { if ((o as THREE.Mesh).isMesh) meshCount++; });
          if (!meshCount || bounds.isEmpty() || ![...bounds.min, ...bounds.max].every(Number.isFinite) || size.length() === 0) throw new Error('Missing or invalid model geometry');
          for (const anchor of [...required[kind], ...spec.requiredAnchors ?? []]) if (!model.scene.getObjectByName(anchor)) throw new Error(`Missing anchor: ${anchor}`);
          this.models.set(key, model); this.modelFailures.delete(key);
        } catch (error) {
          if (candidate) {
            const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
            candidate.scene.traverse(o => { if (o instanceof THREE.Mesh) { geometries.add(o.geometry); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m)); } });
            for (const material of materials) { for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value); material.dispose(); }
            geometries.forEach(g => g.dispose()); textures.forEach(t => t.dispose());
          }
          this.models.delete(key); this.modelFailures.set(key, String(error));
        }
      }
    }
  }

  public createModel(kind: ModelKind, name: string): { scene: THREE.Object3D; animations: THREE.AnimationClip[] } | null {
    const template = this.models.get(`${kind}:${name}`); if (!template) return null;
    return this.cloneTemplate(template);
  }

  public applyEnvironment(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void {
    if (!this.environment) return;
    const generator = new THREE.PMREMGenerator(renderer);
    try {
      this.environmentTarget?.dispose();
      this.environmentTarget = generator.fromEquirectangular(this.environment);
      scene.environment = this.environmentTarget.texture;
      scene.environmentIntensity = 0.55;
      scene.background = this.environment;
      scene.backgroundIntensity = 0.35;
      scene.backgroundBlurriness = 0.08;
    } finally { generator.dispose(); }
  }

  public applyMaterial(material: THREE.MeshStandardMaterial, name: string, repeat: [number, number] = [1, 1]): boolean {
    const maps = this.textures.get(name);
    if (!maps) return false;
    if (this.materialMaps.get(material) === name) return true;
    this.releaseMaterial(material);
    const copy = (channel: string) => {
      const texture = maps[channel]?.clone();
      if (texture) { texture.repeat.set(...repeat); texture.needsUpdate = true; }
      return texture ?? null;
    };
    material.map = copy('diffuse');
    material.roughnessMap = copy('roughness');
    material.normalMap = copy('normal');
    material.metalnessMap = copy('metalness');
    material.roughness = 1;
    if (material.metalnessMap) material.metalness = 1;
    material.needsUpdate = true;
    this.materialMaps.set(material, name);
    return true;
  }

  public releaseMaterial(material: THREE.MeshStandardMaterial): void {
    if (!this.materialMaps.has(material)) return;
    for (const texture of [material.map, material.roughnessMap, material.normalMap, material.metalnessMap]) texture?.dispose();
    this.materialMaps.delete(material);
  }

  public createCharacter(name = 'Soldier'): { scene: THREE.Object3D; animations: THREE.AnimationClip[] } | null {
    const template = this.characters.get(name);
    if (!template) return null;
    return this.cloneTemplate(template);
  }

  private cloneTemplate(template: GLTF): { scene: THREE.Object3D; animations: THREE.AnimationClip[] } {
    const scene = clone(template.scene);
    // Clone render resources too: disposing one player must not break another.
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry = mesh.geometry.clone();
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((material) => material.clone()) : mesh.material.clone();
      mesh.castShadow = mesh.receiveShadow = true;
    });
    return { scene, animations: template.animations };
  }
}

export const productionAssets = new ProductionAssetManager();
