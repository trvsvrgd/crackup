import * as THREE from 'three';
import { CSM } from 'three/examples/jsm/csm/CSM.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { InkOutlinePass } from '../client/shaders/inkOutlinePass.js';
import { RelayBuilder } from '../client/builders/RelayBuilder.js';
import { RelayMode, getRelayPlans } from '../shared/world/relayDefinition.js';
import { buildNeoVeridiaSector01 } from '../shared/world/neoVeridiaBlock.js';
import type { RelayState } from '../shared/protocol/relayProtocol.js';
import { createBaselineRelayMesh } from './helpers/baselineRelayMesh.js';
import { NeoVeridiaSceneEnvironment } from '../client/world/cityBuilder.js';
import { ClientPhase5WorldRenderer } from '../client/entities/phase5WorldMesh.js';

const result = { status: 'running', errors: [] as string[], motion: false, states: false, cleanup: false, measurements: [] as { district: number; mode: string; calls: number; triangles: number; cpuSubmitMs: number }[], city: [] as { mode: string; calls: number; triangles: number }[] };
(window as any).__relayVerification = result;
const originalError = console.error.bind(console); console.error = (...args: unknown[]) => { result.errors.push(args.map(String).join(' ')); originalError(...args); };
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(1280, 720); renderer.setPixelRatio(1); renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.debug.checkShaderErrors = true; renderer.info.autoReset = false; document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x172c40); scene.add(new THREE.HemisphereLight(0xc1e5ff, 0x4b3a2b, 2.1));
const camera = new THREE.PerspectiveCamera(45, 1280 / 720, 0.1, 1200);
const csm = new CSM({ camera, parent: scene, maxFar: 120, cascades: 3, mode: 'practical', shadowMapSize: 1024, lightDirection: new THREE.Vector3(-0.5, -1, -0.4).normalize(), lightIntensity: 2.4 });
const prepared = new WeakSet<THREE.Material>();
const prepare = (material: THREE.Material) => {
  if (!(material instanceof THREE.MeshStandardMaterial) || prepared.has(material)) return;
  const custom = material.onBeforeCompile; csm.setupMaterial(material); const shadows = material.onBeforeCompile;
  material.onBeforeCompile = (shader, render) => { shadows.call(material, shader, render); custom.call(material, shader, render); }; prepared.add(material);
};
const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera)); composer.addPass(new InkOutlinePass(scene, camera)); composer.addPass(new OutputPass());
const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({ color: 0x263848, roughness: 0.9 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; prepare(ground.material); scene.add(ground);
const builder = new RelayBuilder(), plans = getRelayPlans(buildNeoVeridiaSector01()).filter(p => p.terminalIndex === 0).map(p => ({ ...p, origin: { x: 0, y: 0, z: 0 } }));
const prototypes = plans.map(p => builder.build(p)), baselines = plans.map(() => createBaselineRelayMesh({ x: 0, y: 0, z: 0 }, 0x25dcef));
prototypes.forEach(p => { scene.add(p.root); p.materials.forEach(prepare); p.root.visible = false; }); baselines.forEach(p => { scene.add(p); p.visible = false; p.traverse(o => { if (o instanceof THREE.Mesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(prepare); }); });
let activeIndex = 0, mode = 'prototype', time = 0, running = true, city: NeoVeridiaSceneEnvironment | null = null, cityRelays: ClientPhase5WorldRenderer | null = null;
const healthy = (): RelayState => ({ relayId: 1, generation: 1, mode: RelayMode.ONLINE, hacked: false, heat: 0, rebootSec: 0, ventHp: [120, 120, 120] });
let state = healthy();
const caption = document.createElement('div'); caption.style.cssText = 'position:fixed;bottom:24px;left:24px;color:#e0f6ff;font:17px monospace'; document.body.append(caption);
const nav = document.createElement('nav'); nav.style.cssText = 'position:fixed;top:20px;left:20px;display:flex;gap:7px'; document.body.append(nav);
function select(index: number, nextMode = 'prototype', closeup = false) {
  activeIndex = index; mode = nextMode;
  prototypes.forEach((p, i) => p.root.visible = mode === 'prototype' && i === index); baselines.forEach((p, i) => p.visible = mode === 'baseline' && i === index);
  const o = plans[index].towerOffset; camera.position.set(closeup ? 3 : o.x / 2 + 18, closeup ? 2.4 : 9, closeup ? 4 : 20); camera.lookAt(closeup ? 0 : o.x / 2, closeup ? 1 : 6.5, 0); csm.update();
  caption.textContent = `DISTRICT ${index + 1} // ${nextMode.toUpperCase()} // ${RelayMode[state.mode]} // HEAT ${Math.round(state.heat * 100)}%`;
}
for (const [i, name] of ['Neon Docks', 'Foundry', 'Helios', 'Aegis'].entries()) { const b = document.createElement('button'); b.textContent = name; b.onclick = () => select(i); nav.append(b); }
for (const [label, action] of [
  ['Online', () => { state = healthy(); select(activeIndex); }],
  ['Broken vent', () => { state = { ...healthy(), ventHp: [0, 120, 120], heat: 0.35, mode: RelayMode.OVERHEATING }; select(activeIndex); }],
  ['Shutdown', () => { state = { ...healthy(), ventHp: [0, 0, 0], heat: 1, rebootSec: 8, mode: RelayMode.SHUTDOWN }; select(activeIndex); }],
  ['Hacked', () => { state = { ...healthy(), hacked: true, mode: RelayMode.HACKED }; select(activeIndex); }],
  ['Console', () => select(activeIndex, 'prototype', true)], ['Baseline', () => select(activeIndex, 'baseline')],
  ['City', () => { mode = 'city'; camera.position.set(58, 36, 60); camera.lookAt(0, 5, 0); caption.textContent = 'NEO-VERIDIA // EIGHT RELAYS // LIVE CSM / SSAO / SOBEL'; }],
] as [string, () => void][]) { const b = document.createElement('button'); b.textContent = label; b.onclick = action; nav.append(b); }
function draw(dt: number) {
  time += dt;
  if (mode === 'city' && city) { cityRelays?.updateFromSnapshot(null, [], [], { x: 0, y: 0, z: 0 }, 8, time); city.render(); return; }
  prototypes[activeIndex].updateRelay(dt, state, time, camera.position); csm.update(); composer.render();
}
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
const check = (ok: boolean, text: string) => { if (!ok) throw new Error(text); };
async function verify() {
  for (let i = 0; i < 4; i++) for (const label of ['baseline', 'prototype']) {
    select(i, label); const samples: number[] = [];
    for (let n = 0; n < 18; n++) { await frame(); renderer.info.reset(); const start = performance.now(); draw(1 / 60); if (n > 4) samples.push(performance.now() - start); }
    samples.sort((a, b) => a - b); result.measurements.push({ district: i, mode: label, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, cpuSubmitMs: samples[Math.floor(samples.length / 2)] });
    check(renderer.info.render.calls <= 240 && renderer.info.render.triangles <= 50000, 'Isolated relay render budget');
  }
  const active = prototypes[activeIndex], angle = active.dishes[0].rotation.y; draw(1 / 60); check(active.dishes[0].rotation.y !== angle, 'Dish scans while online'); result.motion = true;
  state = { ...healthy(), mode: RelayMode.SHUTDOWN, ventHp: [0, 0, 0], heat: 1, rebootSec: 8 }; const stopped = active.dishes[0].rotation.y; draw(1 / 60);
  check(active.dishes[0].rotation.y === stopped && !active.vents[0].getObjectByName('VentLouvers')!.visible && active.vents[0].getObjectByName('VentExposedCoil')!.visible, 'Shutdown parks dishes and opens destroyed vents'); result.states = true;
  state = healthy();
  city = new NeoVeridiaSceneEnvironment(renderer, camera); cityRelays = new ClientPhase5WorldRenderer(city.scene, material => city!.prepareArtMaterial(material));
  const roots = cityRelays.root.children.filter(o => o.userData.entityKind === 'relay');
  const oldRelays = new THREE.Group(); city.scene.add(oldRelays);
  for (const p of getRelayPlans(buildNeoVeridiaSector01())) oldRelays.add(createBaselineRelayMesh(p.origin, 0x25dcef));
  camera.position.set(58, 36, 60); camera.lookAt(0, 5, 0);
  for (const label of ['baseline', 'prototype']) {
    roots.forEach(r => r.visible = label === 'prototype'); oldRelays.visible = label === 'baseline';
    for (let n = 0; n < 12; n++) { await frame(); cityRelays.updateFromSnapshot(null, [], [], { x: 0, y: 0, z: 0 }, 8, time); roots.forEach(r => r.visible = label === 'prototype'); renderer.info.reset(); city.render(); }
    result.city.push({ mode: label, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles });
  }
  const before = result.city[0], after = result.city[1];
  check(after.calls <= before.calls + 1200 && after.triangles <= before.triangles + 250000, 'Eight-relay city render budget');
  oldRelays.visible = false;
  const tempBuilder = new RelayBuilder(), temp = tempBuilder.build(plans[0]); scene.add(temp.root); draw(0); temp.dispose(); check(tempBuilder.resources.size === 0, 'Temporary builder released resources'); result.cleanup = true;
  check(result.errors.length === 0, 'Zero shader errors through CSM/Sobel/city pipeline'); result.status = 'passed'; select(0);
  await fetch('/verification-result', { method: 'POST', body: JSON.stringify(result) });
  const animate = async () => { if (!running) return; await frame(); renderer.info.reset(); draw(1 / 60); void animate(); }; void animate();
}
window.addEventListener('pagehide', () => { running = false; cityRelays?.dispose(); city?.dispose(); prototypes.forEach(p => p.dispose()); csm.dispose(); composer.dispose(); renderer.dispose(); });
void verify().catch(async e => { result.status = 'failed'; result.errors.push(String(e)); await fetch('/verification-result', { method: 'POST', body: JSON.stringify(result) }); });
