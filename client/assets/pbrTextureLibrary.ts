import * as THREE from "three";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";

export type PBRMaps = {
  diffuse: string;
  roughness: string;
  normal: string;
  metalness?: string;
  emissive?: string;
};
type TextureSet = Record<string, THREE.Texture>;
const slots = {
  diffuse: "map",
  roughness: "roughnessMap",
  normal: "normalMap",
  metalness: "metalnessMap",
  emissive: "emissiveMap",
} as const;
const styles = [
  "concrete_layers_02",
  "asphalt_02",
  "corrugated_iron_02",
  "carbon_fiber",
];

/** Deterministic, explicitly procedural fallback. Real packs replace complete sets atomically. */
export function makeFallbackPBR(name: string, size = 128): TextureSet {
  const maps: TextureSet = {},
    metal = /iron|metal|carbon/.test(name),
    asphalt = name.includes("asphalt"),
    carbon = name.includes("carbon");
  for (const channel of Object.keys(slots)) {
    const bytes = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4,
          noise =
            ((Math.imul(x + 17, 374761393) ^ Math.imul(y + 43, 668265263)) >>>
              13) %
            23;
        const weave = ((x >> 3) + (y >> 3)) % 2,
          brushed = Math.sin((y * Math.PI) / 4);
        const value = carbon
          ? 29 + weave * 17 + noise / 3
          : asphalt
            ? 52 + noise
            : metal
              ? 135 + noise + brushed * 12
              : 150 + noise;
        if (channel === "normal") {
          bytes[i] = 128;
          bytes[i + 1] = 128 + (metal ? brushed * 10 : noise / 3 - 3);
          bytes[i + 2] = 255;
        } else {
          const v =
            channel === "diffuse"
              ? value
              : channel === "roughness"
                ? metal
                  ? 130
                  : 225
                : channel === "metalness"
                  ? metal
                    ? 230
                    : 0
                  : 0;
          bytes[i] = bytes[i + 1] = bytes[i + 2] = v;
        }
        bytes[i + 3] = 255;
      }
    const texture = new THREE.DataTexture(bytes, size, size);
    texture.name = `procedural:${name}:${channel}`;
    texture.colorSpace =
      channel === "diffuse" || channel === "emissive"
        ? THREE.SRGBColorSpace
        : THREE.NoColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    maps[channel] = texture;
  }
  return maps;
}

export class PBRTextureLibrary {
  public readonly textures = new Map<string, TextureSet>();
  public readonly materialFailures = new Map<string, string>();
  public readonly materialSources = new Map<
    string,
    "procedural" | "external"
  >();
  private readonly bindings = new Map<
    THREE.MeshStandardMaterial,
    {
      name: string;
      repeat: [number, number];
      baseMetalness: number;
      cleanup: () => void;
    }
  >();
  private readonly versions = new Map<string, number>();
  private readonly imageLoader = new THREE.TextureLoader();
  private ktx: KTX2Loader | null = null;
  private anisotropy = 1;
  private disposed = false;
  constructor() {
    for (const name of styles) {
      this.textures.set(name, makeFallbackPBR(name));
      this.materialSources.set(name, "procedural");
    }
  }
  public configureTextures(renderer: THREE.WebGLRenderer): void {
    this.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.ktx ??= new KTX2Loader()
      .setTranscoderPath("/assets/transcoders/")
      .setWorkerLimit(2)
      .detectSupport(renderer);
  }
  public async replaceMaterialPack(
    name: string,
    urls: PBRMaps,
    load?: (url: string) => Promise<THREE.Texture>,
  ): Promise<boolean> {
    if (this.disposed) return false;
    const revision = (this.versions.get(name) ?? 0) + 1;
    this.versions.set(name, revision);
    const maps: TextureSet = {};
    try {
      if (!urls.diffuse || !urls.normal || !urls.roughness)
        throw new Error(
          "A PBR pack requires diffuse, normal and roughness maps",
        );
      for (const [channel, url] of Object.entries(urls)) {
        if (
          !(channel in slots) ||
          typeof url !== "string" ||
          !/\.(?:png|jpe?g|webp|ktx2)(?:[?#]|$)/i.test(url)
        )
          throw new Error(`Unsupported PBR map: ${channel}`);
        const texture = load
          ? await load(url)
          : /\.ktx2(?:[?#]|$)/i.test(url)
            ? await this.loadKTX(url)
            : await this.imageLoader.loadAsync(url);
        maps[channel] = texture;
        const { width, height } = texture.image ?? {};
        if (!(width > 0 && height > 0 && width <= 16384 && height <= 16384))
          throw new Error(`Invalid texture dimensions: ${channel}`);
        texture.colorSpace =
          channel === "diffuse" || channel === "emissive"
            ? THREE.SRGBColorSpace
            : THREE.NoColorSpace;
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.anisotropy = this.anisotropy;
        texture.needsUpdate = true;
      }
      if (this.disposed || this.versions.get(name) !== revision) {
        Object.values(maps).forEach((t) => t.dispose());
        return false;
      }
      const previous = this.textures.get(name);
      this.textures.set(name, maps);
      for (const [material, binding] of this.bindings)
        if (binding.name === name)
          this.assign(material, maps, binding.repeat, binding.baseMetalness);
      Object.values(previous ?? {}).forEach((t) => t.dispose());
      this.materialSources.set(name, "external");
      this.materialFailures.delete(name);
      return true;
    } catch (error) {
      Object.values(maps).forEach((t) => t.dispose());
      if (this.versions.get(name) === revision)
        this.materialFailures.set(name, String(error));
      return false;
    }
  }
  private loadKTX(url: string): Promise<THREE.CompressedTexture> {
    if (!this.ktx)
      throw new Error("Configure the renderer before loading KTX2");
    return this.ktx.loadAsync(url);
  }
  public applyMaterial(
    material: THREE.MeshStandardMaterial,
    name: string,
    repeat: [number, number] = [1, 1],
  ): boolean {
    const maps = this.textures.get(name);
    if (!maps) return false;
    const previous = this.bindings.get(material);
    if (
      previous?.name === name &&
      previous.repeat.every((v, i) => v === repeat[i])
    )
      return true;
    const baseMetalness = previous?.baseMetalness ?? material.metalness;
    this.releaseMaterial(material);
    this.assign(material, maps, repeat, baseMetalness);
    const cleanup = () => this.releaseMaterial(material);
    material.addEventListener("dispose", cleanup);
    this.bindings.set(material, {
      name,
      repeat: [...repeat],
      baseMetalness,
      cleanup,
    });
    return true;
  }
  private assign(
    material: THREE.MeshStandardMaterial,
    maps: TextureSet,
    repeat: [number, number],
    baseMetalness: number,
  ): void {
    // Each material owns its clones; shared source images remain owned by this library.
    for (const [channel, slot] of Object.entries(slots)) {
      if (this.bindings.has(material)) material[slot]?.dispose();
      const texture = maps[channel]?.clone() ?? null;
      if (texture) {
        texture.repeat.set(...repeat);
        texture.needsUpdate = true;
      }
      material[slot] = texture;
    }
    material.roughness = 1;
    material.metalness = maps.metalness ? 1 : baseMetalness;
    material.needsUpdate = true;
  }
  public releaseMaterial(material: THREE.MeshStandardMaterial): void {
    const binding = this.bindings.get(material);
    if (!binding) return;
    for (const slot of Object.values(slots)) {
      material[slot]?.dispose();
      material[slot] = null;
    }
    material.removeEventListener("dispose", binding.cleanup);
    this.bindings.delete(material);
  }
  public disposeTextures(): void {
    this.disposed = true;
    for (const material of this.bindings.keys()) this.releaseMaterial(material);
    for (const [name, maps] of this.textures) {
      this.versions.set(name, (this.versions.get(name) ?? 0) + 1);
      Object.values(maps).forEach((t) => t.dispose());
    }
    this.textures.clear();
    this.ktx?.dispose();
    this.ktx = null;
  }
}
