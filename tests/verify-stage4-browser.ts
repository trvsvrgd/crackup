import * as THREE from "three";
import { productionAssets } from "../client/assets/productionAssets.js";
import { NeoVeridiaSceneEnvironment } from "../client/world/cityBuilder.js";
import { triplanarPBR } from "../client/shaders/worldSurface.js";
import { BayVista } from "../client/world/bayVista.js";
const result = {
  status: "running",
  checkedAt: new Date().toISOString(),
  errors: [] as string[],
  warnings: [] as string[],
  views: [] as any[],
  webp: false,
  ktx2: false,
  invalidPackRetained: false,
  worldScalePixelError: 0,
  cleanup: false,
  hardwareFpsCertified: false,
  budgets: { vistaCalls: 120, vistaTriangles: 250000 },
};
(window as any).__stage4Verification = result;
const error = console.error.bind(console),
  warn = console.warn.bind(console);
console.error = (...args) => {
  result.errors.push(args.map(String).join(" "));
  error(...args);
};
console.warn = (...args) => {
  result.warnings.push(args.map(String).join(" "));
  warn(...args);
};
const check = (v: unknown, message: string) => {
  if (!v) throw new Error(message);
};
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  preserveDrawingBuffer: true,
});
renderer.setSize(1280, 720);
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.info.autoReset = false;
document.body.append(renderer.domElement);
const camera = new THREE.PerspectiveCamera(62, 1280 / 720, 0.15, 18000),
  city = new NeoVeridiaSceneEnvironment(renderer, camera);
city.resize(1280, 720);
city.vista.autoCycle = false;
const views = [
  { name: "Street", position: [-160, 18, -580], target: [-160, 90, -1700] },
  { name: "Roof", position: [-720, 300, 650], target: [100, 50, -900] },
  { name: "Bridge", position: [-270, 110, -1500], target: [-160, 160, -2650] },
  { name: "Coast", position: [-1450, 135, 1200], target: [0, 30, -700] },
  { name: "Night", position: [-720, 300, 650], target: [100, 50, -900] },
  { name: "City", position: [58, 36, 60], target: [0, 5, 0] },
];
const nav = document.createElement("nav"),
  caption = document.createElement("footer");
document.body.append(nav, caption);
let active = 0,
  ready = false;
function select(index: number) {
  active = index;
  const view = views[index];
  camera.position.fromArray(view.position);
  camera.lookAt(new THREE.Vector3().fromArray(view.target));
  city.vista.setNight(index === 4 ? 1 : 0.15);
  caption.textContent = `${view.name.toUpperCase()} // 10 km bay · two suspension bridges · distant headlands\nPowered by Poly Haven | Capoeira animation integration retained`;
  (window as any).__stage4View = index;
}
for (let i = 0; i < views.length; i++) {
  const button = document.createElement("button");
  button.textContent = views[i].name;
  button.onclick = () => select(i);
  nav.append(button);
}
const frame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
async function verify() {
  select(0);
  city.render();
  check(!result.errors.length, "Procedural fallback shaders compile");
  await productionAssets.load(renderer);
  productionAssets.applyEnvironment(renderer, city.scene);
  city.applyProductionMaterials();
  const original = (await (await fetch("/assets/manifest.json")).json())
    .materials.concrete_layers_02.maps;
  result.webp = await productionAssets.replaceMaterialPack(
    "concrete_layers_02",
    { ...original, diffuse: "/fixtures/concrete.webp" },
  );
  check(result.webp, "Real albedo WebP decode");
  select(5);
  city.render();
  result.ktx2 = await productionAssets.replaceMaterialPack(
    "concrete_layers_02",
    { ...original, diffuse: "/fixtures/2d_etc1s.ktx2" },
  );
  check(result.ktx2, "Official Three.js Basis KTX2 decode");
  city.render();
  const previous = productionAssets.textures.get("concrete_layers_02");
  result.invalidPackRetained =
    !(await productionAssets.replaceMaterialPack("concrete_layers_02", {
      ...original,
      diffuse: "/fixtures/corrupt.ktx2",
    })) && productionAssets.textures.get("concrete_layers_02") === previous;
  check(
    result.invalidPackRetained,
    "Corrupt pack retains last valid texture set",
  );
  await productionAssets.replaceMaterialPack("concrete_layers_02", original);
  // Equivalent world surfaces with baked vs instance scale must sample identical maps.
  const scaleScene = new THREE.Scene();
  scaleScene.add(new THREE.HemisphereLight(0xffffff, 0x394453, 2));
  const scaleCamera = new THREE.OrthographicCamera(-1.2, 1.2, 16, -16, 0.1, 50);
  scaleCamera.position.set(0, 0, 10);
  const scaleMaterial = new THREE.MeshStandardMaterial();
  productionAssets.applyMaterial(scaleMaterial, "concrete_layers_02");
  triplanarPBR(scaleMaterial, 4);
  const baked = new THREE.Mesh(
    new THREE.BoxGeometry(2, 30, 0.2),
    scaleMaterial,
  );
  const instanced = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    scaleMaterial,
    1,
  );
  instanced.setMatrixAt(0, new THREE.Matrix4().makeScale(2, 30, 0.2));
  const target = new THREE.WebGLRenderTarget(128, 256),
    captures: Uint8Array[] = [];
  for (const object of [baked, instanced]) {
    scaleScene.add(object);
    renderer.setRenderTarget(target);
    renderer.render(scaleScene, scaleCamera);
    const pixels = new Uint8Array(128 * 256 * 4);
    renderer.readRenderTargetPixels(target, 0, 0, 128, 256, pixels);
    captures.push(pixels);
    scaleScene.remove(object);
  }
  result.worldScalePixelError =
    captures[0].reduce((sum, v, i) => sum + Math.abs(v - captures[1][i]), 0) /
    captures[0].length;
  check(
    result.worldScalePixelError < 0.1,
    "World scale must be independent of tall instance UV stretching",
  );
  renderer.setRenderTarget(null);
  target.dispose();
  baked.geometry.dispose();
  instanced.geometry.dispose();
  scaleMaterial.dispose();
  for (let i = 0; i < views.length; i++) {
    select(i);
    const samples: any[] = [];
    for (const visible of [false, true]) {
      city.vista.root.visible = visible;
      const times: number[] = [];
      for (let frameIndex = 0; frameIndex < 5; frameIndex++) {
        await frame();
        renderer.info.reset();
        const start = performance.now();
        city.render();
        if (frameIndex > 1) times.push(performance.now() - start);
      }
      times.sort((a, b) => a - b);
      samples.push({
        vista: visible,
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        cpuSubmitMs: times[1],
      });
    }
    check(
      samples[1].calls - samples[0].calls <= result.budgets.vistaCalls,
      `${views[i].name} draw budget`,
    );
    check(
      samples[1].triangles - samples[0].triangles <=
        result.budgets.vistaTriangles,
      `${views[i].name} triangle budget`,
    );
    result.views.push({ view: views[i].name, samples });
  }
  // Exercise the separate ink normal pass with SSAO disabled (quality degradation path).
  city.ssaoPass.enabled = false;
  city.render();
  city.ssaoPass.enabled = true;
  city.render();
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2));
  const before = { ...renderer.info.memory };
  for (let i = 0; i < 3; i++) {
    const vista = new BayVista();
    scene.add(vista.root);
    vista.update(0.02, camera);
    renderer.render(scene, camera);
    vista.dispose();
    renderer.render(scene, camera);
  }
  result.cleanup =
    renderer.info.memory.geometries === before.geometries &&
    renderer.info.memory.textures === before.textures;
  check(
    result.cleanup,
    `Vista resource leak ${JSON.stringify(before)} -> ${JSON.stringify(renderer.info.memory)}`,
  );
  check(!result.errors.length, "No rendering/shader errors");
  result.status = "passed";
  select(1);
  ready = true;
}
void verify()
  .catch((e) => {
    result.status = "failed";
    result.errors.push(String(e));
    caption.textContent = String(e);
  })
  .finally(async () => {
    await fetch("/verification-result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result),
    });
  });
renderer.setAnimationLoop(() => {
  if (ready) city.render();
});
