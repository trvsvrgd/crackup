import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { buildNeoVeridiaSector01 } from '../shared/world/neoVeridiaBlock.js';
import { getArchitecturePlans } from '../shared/world/architecture.js';
import { ArchBuilder } from '../client/builders/ArchBuilder.js';
import { buildStructureFallback } from '../client/builders/structureFallback.js';
import { InkOutlinePass } from '../client/shaders/inkOutlinePass.js';
import { NeoVeridiaSceneEnvironment } from '../client/world/cityBuilder.js';

const result = { status: 'running', errors: [] as string[], measurements: [] as { id: string; mode: string; calls: number; triangles: number; cpuSubmitMs: number; geometries: number; textures: number }[], city: [] as { mode: string; calls: number; triangles: number; geometries: number; buildings: number }[] };
(window as any).__architectureVerification = result;
const originalError = console.error.bind(console);
console.error = (...args: unknown[]) => { result.errors.push(args.map(String).join(' ')); originalError(...args); };
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(1280, 720); renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.debug.checkShaderErrors = true;
document.body.append(renderer.domElement); renderer.info.autoReset = false;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x182536);
scene.add(new THREE.HemisphereLight(0xccedff, 0x383029, 2.1));
const sun = new THREE.DirectionalLight(0xffd3a9, 3); sun.position.set(-50, 100, -70); scene.add(sun);
const camera = new THREE.PerspectiveCamera(45, 1280 / 720, 0.1, 1600);
const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera)); composer.addPass(new InkOutlinePass(scene, camera)); composer.addPass(new OutputPass());
const plans = getArchitecturePlans(buildNeoVeridiaSector01(), 'representatives'), builder = new ArchBuilder();
const prototypes = plans.map(p => builder.build(p));
const materials = new Map<string, THREE.MeshStandardMaterial>();
const materialFor = (key: string) => {
  if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color: key === 'helios_glass' ? 0x1a304d : 0x454f60, metalness: 0.45, roughness: 0.6 })); return materials.get(key)!;
};
const neon = new THREE.MeshStandardMaterial({ color: 0x32deff, emissive: 0x32deff, emissiveIntensity: 1 });
const baselines = plans.map(plan => {
  const root = new THREE.Group();
  for (const s of plan.members) {
    let mesh: THREE.Object3D;
    if (s.halfExtents.y > 1 || s.material === 'shipping_container') mesh = buildStructureFallback(s, materialFor(s.material), neon);
    else { mesh = new THREE.Mesh(new THREE.BoxGeometry(s.halfExtents.x * 2, s.halfExtents.y * 2, s.halfExtents.z * 2), materialFor(s.material)); mesh.position.set(s.center.x, s.center.y, s.center.z); }
    mesh.position.x -= plan.origin.x; mesh.position.z -= plan.origin.z; root.add(mesh);
  }
  return root;
});
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x1b2935, roughness: 0.9 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; scene.add(ground);
let active: THREE.Object3D | null = null, activeIndex = 0;
const controls = document.createElement('nav'); controls.style.cssText = 'position:fixed;left:24px;top:20px;display:flex;gap:8px;z-index:3'; document.body.append(controls);
const caption = document.createElement('div'); caption.id = 'caption'; caption.style.cssText = 'position:fixed;left:30px;bottom:30px;color:#d8f4ff;font:16px monospace'; document.body.append(caption);
function select(index: number, mode = 'prototype', closeup = false) {
  if (active) scene.remove(active); activeIndex = index;
  active = mode === 'baseline' ? baselines[index] : prototypes[index].root; active.position.set(0, 0, 0); scene.add(active);
  const p = plans[index], d = closeup ? Math.max(15, p.lowerHalfWidth * 2.2) : p.height * 1.3;
  camera.position.set(d * 0.75, closeup ? p.podiumHeight + 9 : p.height * 0.62, -d * 1.15);
  camera.lookAt(0, closeup ? p.podiumHeight + 7 : p.height * 0.5, 0);
  caption.textContent = `${p.sign} // ${mode.toUpperCase()} // ${closeup ? 'FACADE DETAIL' : 'DISTRICT SILHOUETTE'}`;
  renderer.info.reset(); composer.render();
}
for (const [i, plan] of plans.entries()) {
  const button = document.createElement('button'); button.textContent = plan.sign; button.onclick = () => select(i); controls.append(button);
}
for (const [label, action] of [['Facade detail', () => select(activeIndex, 'prototype', true)], ['Baseline', () => select(activeIndex, 'baseline')], ['Prototype', () => select(activeIndex)]] as const) {
  const button = document.createElement('button'); button.textContent = label; button.onclick = action; controls.append(button);
}
const roofButton = document.createElement('button'); roofButton.textContent = 'Rooftop detail'; roofButton.onclick = () => {
  select(activeIndex); const p = plans[activeIndex], radius = p.upperHalfWidth;
  camera.position.set(radius * 2.8, p.height + radius * 2, -radius * 2.8); camera.lookAt(0, p.height, 0); composer.render(); caption.textContent = `${p.sign} // ROOFTOP DETAIL`;
}; controls.append(roofButton);
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
async function verify() {
  for (const [i, plan] of plans.entries()) for (const mode of ['baseline', 'prototype']) {
    select(i, mode); const times: number[] = [];
    for (let n = 0; n < 18; n++) {
      prototypes[i].update(1 / 60, camera.position.clone().add(new THREE.Vector3(plan.origin.x, 0, plan.origin.z)));
      await frame(); renderer.info.reset(); const start = performance.now(); composer.render(); if (n > 4) times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    result.measurements.push({ id: plan.id, mode, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, cpuSubmitMs: times[Math.floor(times.length / 2)], geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures });
  }
  for (const plan of plans) {
    const baseline = result.measurements.find(m => m.id === plan.id && m.mode === 'baseline')!, prototype = result.measurements.find(m => m.id === plan.id && m.mode === 'prototype')!;
    if (prototype.calls > baseline.calls * 1.25 + 80 || prototype.triangles > baseline.triangles * 2 + 15000) throw new Error(`${plan.id}: architecture exceeds representative rendering budget`);
  }
  // Compile/render the actual game pipeline too: CSM must not overwrite the room shader hooks.
  for (const mode of ['none', 'citywide'] as const) {
    const environment = new NeoVeridiaSceneEnvironment(renderer, camera, [], mode);
    camera.position.set(145, 70, -190); camera.lookAt(115, 40, -115);
    for (let i = 0; i < 3; i++) { renderer.info.reset(); environment.render(); await frame(); }
    result.city.push({ mode, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries,
      buildings: environment.scene.getObjectByName('NeoVeridia_4Districts')?.children.filter(c => c.userData.entityKind === 'building').length ?? 0 });
    environment.dispose();
  }
  if (result.city[1].calls > result.city[0].calls * 1.15 || result.city[1].triangles > result.city[0].triangles * 2.5) throw new Error('Citywide rendering exceeds baseline budget');
  const gl = renderer.getContext(); if (gl.getError() !== gl.NO_ERROR || result.errors.length) throw new Error('Architecture browser render or shader error');
  result.status = 'passed'; select(2);
}
verify().catch(e => { result.status = 'failed'; result.errors.push(String(e)); }).finally(() => {
  const output = document.createElement('pre'); output.id = 'result'; output.style.cssText = 'font:11px monospace;white-space:pre-wrap;color:white'; output.textContent = JSON.stringify(result, null, 2); document.body.append(output);
  void fetch('/verification-result', { method: 'POST', body: JSON.stringify(result) });
});
