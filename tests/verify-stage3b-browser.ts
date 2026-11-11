import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { InkOutlinePass } from '../client/shaders/inkOutlinePass.js';
import { ClientVehiclePropRenderer } from '../client/entities/vehicleAndPropMesh.js';
import { VehicleBuilder } from '../client/builders/VehicleBuilder.js';
import { EnemyCombatManager } from '../shared/combat/enemyRigSystem.js';
import { VehicleAndPropManager } from '../shared/physics/vehicleAndPropSystem.js';
import { createBaselineVehicleMesh } from './helpers/baselineVehicleMesh.js';

const result = { status: 'running', errors: [] as string[], measurements: [] as { mode: string; calls: number; triangles: number; cpuSubmitMs: number }[], motion: false, cleanup: false };
(window as any).__vehicleVerification = result;
const error = console.error.bind(console); console.error = (...args: unknown[]) => { result.errors.push(args.map(String).join(' ')); error(...args); };
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(1280, 720); renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.debug.checkShaderErrors = true; renderer.info.autoReset = false; document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x152333);
scene.add(new THREE.HemisphereLight(0xc6eaff, 0x483d30, 2.4)); const sun = new THREE.DirectionalLight(0xffd9b3, 3); sun.position.set(-8, 16, -8); scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(50, 50), new THREE.MeshStandardMaterial({ color: 0x273443, roughness: 0.9 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.01; scene.add(ground);
const grid = new THREE.GridHelper(50, 50, 0x396276, 0x2b4250); grid.position.y = 0.005; scene.add(grid);
const camera = new THREE.PerspectiveCamera(45, 1280 / 720, 0.1, 200); camera.position.set(6, 3.8, -7); camera.lookAt(0, 0.8, 0);
const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera)); composer.addPass(new InkOutlinePass(scene, camera)); composer.addPass(new OutputPass());
await RAPIER.init();
const world = new RAPIER.World({ x: 0, y: -24, z: 0 }), combat = new EnemyCombatManager(world), manager = new VehicleAndPropManager(world, combat);
const floor = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0)); world.createCollider(RAPIER.ColliderDesc.cuboid(25, 0.5, 25), floor);
const vehicles = new ClientVehiclePropRenderer(); scene.add(vehicles.rootGroup);
vehicles.rootGroup.clear(); // Isolate vehicles from the renderer's unrelated relic beacons.
const baseline = createBaselineVehicleMesh(true).group; baseline.position.y = 1; scene.add(baseline); baseline.visible = false;
const nav = document.createElement('nav'); nav.style.cssText = 'position:fixed;left:20px;top:20px;display:flex;gap:8px'; document.body.append(nav);
const caption = document.createElement('div'); caption.style.cssText = 'position:fixed;left:25px;bottom:25px;color:#dbf4ff;font:17px monospace'; document.body.append(caption);
let mode = 'Healthy', time = 0, driving = false, running = true;
function select(next: string) {
  mode = next; driving = next === 'Driving'; baseline.visible = next === 'Baseline'; vehicles.rootGroup.visible = !baseline.visible;
  const car = manager.spawnVehicle(1, 'BROWSER', { x: 0, y: 1, z: 0 }, true);
  if (['Hood off', 'Panels off', 'Wreck'].includes(next)) manager.damageVehicle(1, next === 'Hood off' ? 501 : next === 'Panels off' ? 751 : 1000, { x: 0, y: 1, z: 5 });
  caption.textContent = `AGENCY INTERCEPTOR // ${next.toUpperCase()} // 4 INDEPENDENT WHEELS`;
  if (next === 'Rear view') camera.position.set(5.5, 3, 7); else if (next === 'Side view') camera.position.set(7, 2.5, 0.5); else camera.position.set(6, 3.8, -7);
  camera.lookAt(0, 0.8, 0); update(0);
}
for (const label of ['Healthy', 'Hood off', 'Panels off', 'Wreck', 'Driving', 'Rear view', 'Side view', 'Respawn', 'Baseline']) {
  const button = document.createElement('button'); button.textContent = label; button.onclick = () => select(label); nav.append(button);
}
function update(dt: number) {
  time += dt; manager.stepVehicles(new Map(), dt, []); world.step();
  const snapshots = manager.toBinaryVehicleSnapshots();
  if (driving) for (const snapshot of snapshots) { snapshot.speedMps = 12; snapshot.steerAngleRad = Math.sin(time * 1.4) * 0.35; snapshot.wheelCompressionRatio = [0.3 + Math.sin(time * 3) * 0.2, 0.4, 0.4, 0.5 + Math.cos(time * 3) * 0.2]; }
  vehicles.updateFromSnapshots(snapshots, [], new Set(), false, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, time, manager.toVehicleDamagePacket(Math.floor(time * 60)));
}
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
const check = (test: boolean, message: string) => { if (!test) throw new Error(message); };
async function verify() {
  for (const label of ['Baseline', 'Healthy', 'Panels off', 'Wreck', 'Driving']) {
    select(label); const times: number[] = [];
    for (let i = 0; i < 24; i++) { await frame(); update(1 / 60); renderer.info.reset(); const start = performance.now(); composer.render(); if (i > 5) times.push(performance.now() - start); }
    times.sort((a, b) => a - b); result.measurements.push({ mode: label, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, cpuSubmitMs: times[Math.floor(times.length / 2)] });
    check(renderer.info.render.calls <= 120 && renderer.info.render.triangles <= 12000, `${label} exceeds isolated vehicle render budget`);
  }
  const wheel = vehicles.rootGroup.getObjectByName('AxleFL')!, before = wheel.rotation.x;
  update(1 / 30); check(wheel.rotation.x !== before, 'Driving wheel must spin');
  select('Panels off'); const debris = [...manager.vehicleDebris.values()][0], y = debris.body.translation().y;
  for (let i = 0; i < 30; i++) update(1 / 60); check(debris.body.translation().y !== y, 'Rendered panel state must use real body motion'); result.motion = true;
  select('Healthy');
  for (const [i, x, z] of [[2, -4, 0], [3, 0, 6], [4, -4, 6]]) manager.spawnVehicle(i, 'FLEET', { x, y: 1, z }, i !== 3);
  camera.position.set(12, 10, -13); camera.lookAt(-2, 0.8, 2.5); update(1 / 60); renderer.info.reset(); const fleetStart = performance.now(); composer.render();
  result.measurements.push({ mode: 'Four vehicles', calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, cpuSubmitMs: performance.now() - fleetStart });
  check(renderer.info.render.calls <= 450 && renderer.info.render.triangles <= 45000, 'Four-vehicle render budget');
  for (const id of [2, 3, 4]) { const car = manager.vehicles.get(id)!; world.removeRigidBody(car.rigidBody); for (const collider of car.damageColliders) manager.colliderHandleToVehicleId.delete(collider.handle); manager.vehicles.delete(id); }
  const builder = new VehicleBuilder(), temp = builder.build(true); scene.add(temp.root); composer.render(); temp.dispose(); check(builder.resources.size === 0, 'Vehicle resources released');
  const tracked = new ClientVehiclePropRenderer(); scene.add(tracked.rootGroup); tracked.updateFromSnapshots(manager.toBinaryVehicleSnapshots(), [], new Set(), false, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, time, manager.toVehicleDamagePacket(10)); composer.render(); tracked.dispose(); check(tracked.rootGroup.children.length === 0, 'Renderer cleanup'); result.cleanup = true;
  select('Healthy'); composer.render(); check(result.errors.length === 0, 'No shader/WebGL errors'); result.status = 'passed';
  await fetch('/verification-result', { method: 'POST', body: JSON.stringify(result) });
  const animate = async () => { if (!running) return; await frame(); update(1 / 60); renderer.info.reset(); composer.render(); void animate(); }; void animate();
}
window.addEventListener('pagehide', () => { running = false; vehicles.dispose(); world.free(); composer.dispose(); renderer.dispose(); });
void verify().catch(async e => { result.status = 'failed'; result.errors.push(String(e)); await fetch('/verification-result', { method: 'POST', body: JSON.stringify(result) }); });
