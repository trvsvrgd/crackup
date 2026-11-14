import * as THREE from 'three';
import { productionAssets } from '../client/assets/productionAssets.js';
import { WeaponBuilder, weaponBuilder } from '../client/builders/WeaponBuilder.js';
import { HumanoidRig, JOINT_LAYOUT, type JointName } from '../client/animation/humanoidRig.js';
import { SkeletalAnimator, type SkeletalState } from '../client/animation/skeletalAnimator.js';
import { createMotionSample, getMixamoMotion } from '../client/animation/mixamoMotion.js';
import { AugmentChassisId } from '../shared/constants.js';
import { NeoVeridiaSceneEnvironment } from '../client/world/cityBuilder.js';
import { ClientPhase5WorldRenderer } from '../client/entities/phase5WorldMesh.js';
import { VehicleBuilder } from '../client/builders/VehicleBuilder.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { InkOutlinePass } from '../client/shaders/inkOutlinePass.js';

const result = { status: 'running', checkedAt: new Date().toISOString(), errors: [] as string[], warnings: [] as string[], clips: 0, skinMotion: false, runtimeRetarget: false, cleanup: false,
  isolated: [] as { variant: number; calls: number; triangles: number }[], city: [] as { view: string; weapons: boolean; calls: number; triangles: number; cpuSubmitMs: number }[],
  pipeline: [] as { sharedNormals: boolean; calls: number; triangles: number; cpuSubmitMs: number }[], pixelMeanDifference: 0, invisibleEffectsExcluded: false,
  budgets: { weaponCalls: 2, weaponTriangles: 1200, cityWeaponCallIncrease: 160, cityWeaponTriangleIncrease: 16000 }, hardwareFpsCertified: false };
(window as any).__stage3dVerification = result;
const error = console.error.bind(console), warn = console.warn.bind(console);
console.error = (...args: unknown[]) => { result.errors.push(args.map(String).join(' ')); error(...args); };
console.warn = (...args: unknown[]) => { result.warnings.push(args.map(String).join(' ')); warn(...args); };
const check = (ok: unknown, message: string) => { if (!ok) throw new Error(message); };
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(1280, 720); renderer.setPixelRatio(1); renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.info.autoReset = false; document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x182b40);
scene.add(new THREE.HemisphereLight(0xc5eaff, 0x55505b, 2.3)); const sun = new THREE.DirectionalLight(0xffdfbd, 3); sun.position.set(-3, 8, -5); scene.add(sun);
const camera = new THREE.PerspectiveCamera(42, 1280 / 720, 0.05, 1600);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ color: 0x203b4d, roughness: 0.9 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.03; scene.add(ground);
const grid = new THREE.GridHelper(30, 30, 0x467184, 0x29475a); grid.position.y = -0.02; scene.add(grid);
const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera)); composer.addPass(new InkOutlinePass(scene, camera)); composer.addPass(new OutputPass());
const nav = document.createElement('nav'), caption = document.createElement('footer'); document.body.append(nav, caption);
caption.textContent = 'Loading real production assets and checking the motion library…';
const builder = new WeaponBuilder(), weapons = [0, 1, 2].map(v => builder.build(v));
weapons.forEach((w, i) => { w.root.position.set((i - 1) * 1.1, 0.9, 0); w.root.rotation.set(0, 0.9, 0.12); scene.add(w.root); });
const armor = new HumanoidRig(AugmentChassisId.PHANTOM_SHARPSHOOTER), animator = new SkeletalAnimator(armor); scene.add(armor.root);
let mode = 'weapons', clipName = 'armada', seconds = 0, paused = false, running = true, source: ReturnType<typeof productionAssets.createCharacter>, sourceMixer: THREE.AnimationMixer;
let sourceHips: THREE.Object3D | undefined;
let pose: SkeletalState = 'IdleBreathing', city: NeoVeridiaSceneEnvironment | null = null, cityRelays: ClientPhase5WorldRenderer | null = null;
const cityActors: HumanoidRig[] = [], cityVehicleBuilder = new VehicleBuilder(), cityVehicles: ReturnType<VehicleBuilder['build']>[] = [];
const sample = createMotionSample();
function show(next: string) {
  mode = next; seconds = 0; paused = false;
  weapons.forEach(w => w.root.visible = next === 'weapons'); armor.root.visible = next === 'motion' || next === 'pose'; if (source) source.scene.visible = next === 'motion';
  camera.position.set(next === 'weapons' ? 2.1 : 4, next === 'weapons' ? 2 : 2.4, next === 'weapons' ? -3.4 : -6.2); camera.lookAt(0, next === 'weapons' ? 0.85 : 0.95, 0);
  armor.root.position.set(next === 'motion' ? -1.25 : 0, 0, 0);
  if (next === 'city') { camera.position.set(58, 36, 60); camera.lookAt(0, 5, 0); }
}
function selectMotion(name: string) {
  clipName = name; show('motion'); sourceMixer.stopAllAction();
  const clip = source!.animations.find(c => c.name === name)!; const action = sourceMixer.clipAction(clip); action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play();
}
function draw(dt: number) {
  if (!paused) seconds += dt;
  if (mode === 'city' && city) { cityRelays?.updateFromSnapshot(null, [], [], { x: 0, y: 0, z: 0 }, 8, seconds); city.render(); caption.textContent = 'STAGE 3 CITY // 18 buildings · 8 relays · 4 vehicles · 8 armored agents\nControlled render check; minimum-hardware FPS qualification remains open.'; return; }
  if (mode === 'motion') {
    const motion = getMixamoMotion(productionAssets.characters.get('capoeira_ybot'), clipName)!;
    const t = paused ? Math.min(seconds, motion.duration) : seconds % motion.duration; motion.sample(t, sample);
    for (const n of Object.keys(JOINT_LAYOUT) as JointName[]) armor.bones[n].quaternion.copy(sample.rotations[n]);
    armor.bones.Pelvis.position.set(0, sample.pelvisY, 0); armor.weapon.visible = false;
    sourceMixer.setTime(t);
    // Compare poses in place so source root travel cannot cross over the armor display.
    if (sourceHips) { sourceHips.position.x = 0; sourceHips.position.z = 0; }
    source!.scene.updateMatrixWorld(true);
    caption.textContent = `CAPOEIRA // ${clipName} // ${t.toFixed(2)} / ${motion.duration.toFixed(2)}s\nArmored game rig (19 joints) | Y Bot source — in-place comparison\n39 genuine clips available; Armada is currently used by the third melee strike.`;
  } else if (mode === 'pose') {
    animator.update(paused ? 0 : dt, { speed: pose === 'Walk' ? 4 : 0, verticalSpeed: 0, state: pose, aim: pose === 'Walk' ? 1 : 0, pairedElapsed: seconds % 0.65 });
    caption.textContent = `GAME POSE // ${pose} // ${animator.activeMotion ? `Mixamo ${animator.activeMotion}` : 'procedural'}\nGrip stays attached; muzzle uses the same -Z convention in equipment and debris.`;
  } else caption.textContent = 'WEAPON BUILDER // Carbine · Marksman · Heavy\nReceivers, optics, magazines, shrouds, charge strips and muzzle brakes · two material batches each';
  composer.render();
}
async function verify() {
  await productionAssets.load(renderer);
  source = productionAssets.createCharacter('capoeira_ybot'); check(source, 'Real Capoeira model loaded');
  source!.scene.rotation.y = Math.PI; source!.scene.position.x = 1.25; scene.add(source!.scene); source!.scene.visible = false; sourceMixer = new THREE.AnimationMixer(source!.scene);
  sourceHips = source!.scene.getObjectByName('mixamorigHips') ?? source!.scene.getObjectByName('mixamorig:Hips');
  for (const [i, weapon] of weapons.entries()) {
    const isolatedScene = new THREE.Scene(); isolatedScene.add(weapon.root); const isolatedCamera = new THREE.PerspectiveCamera(40, 1, 0.01, 20); isolatedCamera.position.set(0, 1.5, -5); isolatedCamera.lookAt(weapon.root.position);
    renderer.info.reset(); renderer.render(isolatedScene, isolatedCamera);
    result.isolated.push({ variant: i, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles });
    check(renderer.info.render.calls <= result.budgets.weaponCalls && renderer.info.render.triangles <= result.budgets.weaponTriangles, 'Weapon render budget'); scene.add(weapon.root);
  }
  const bone = source!.scene.getObjectByName('mixamorigRightFoot') ?? source!.scene.getObjectByName('mixamorig:RightFoot'); check(bone, 'Y Bot foot exists');
  for (const clip of source!.animations) {
    selectMotion(clip.name); const start = bone!.getWorldPosition(new THREE.Vector3());
    for (const fraction of [0, 0.25, 0.5, 0.75, 0.99]) { paused = true; seconds = clip.duration * fraction; await frame(); draw(0); }
    check(bone!.matrixWorld.elements.every(Number.isFinite), `${clip.name}: finite source skeleton`);
    for (const b of armor.skeleton.bones) check(b.matrixWorld.elements.every(Number.isFinite), `${clip.name}: finite armor skeleton`);
    if (bone!.getWorldPosition(new THREE.Vector3()).distanceTo(start) > 0.05) result.skinMotion = true;
    result.clips++;
  }
  paused = false; show('pose'); pose = 'MeleeCombo3_SpinningKick';
  for (let i = 0; i < 10; i++) draw(1 / 60); result.runtimeRetarget = animator.activeMotion === 'armada'; check(result.runtimeRetarget, 'Game animator uses real Armada');
  city = new NeoVeridiaSceneEnvironment(renderer, camera); cityRelays = new ClientPhase5WorldRenderer(city.scene, m => city!.prepareArtMaterial(m));
  for (let i = 0; i < 8; i++) {
    const rig = new HumanoidRig(Object.values(AugmentChassisId)[i % 5]); rig.root.position.set((i % 4) * 1.5 - 2, 0, Math.floor(i / 4) * 2 + 5); city.scene.add(rig.root); cityActors.push(rig);
    new SkeletalAnimator(rig).update(0.1, { speed: 0, verticalSpeed: 0 });
    rig.root.traverse(o => { if (o instanceof THREE.Mesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => city!.prepareArtMaterial(m)); });
  }
  for (let i = 0; i < 4; i++) { const vehicle = cityVehicleBuilder.build(i % 2 === 0); vehicle.root.position.set(i * 4 - 6, 1, -3); city.scene.add(vehicle.root); vehicle.materials.forEach(m => city!.prepareArtMaterial(m)); cityVehicles.push(vehicle); }
  camera.position.set(58, 36, 60); camera.lookAt(0, 5, 0);
  const pixels: Uint8Array[] = [], gl = renderer.getContext();
  for (const reuse of [false, true]) {
    city.ssaoPass.reuseShadows = reuse; city.inkPass.sharedNormals = reuse ? city.ssaoPass.normalRenderTarget : null;
    const samples: number[] = [];
    for (let i = 0; i < 12; i++) { await frame(); renderer.info.reset(); const start = performance.now(); city.render(); if (i > 3) samples.push(performance.now() - start); }
    const bytes = new Uint8Array(1280 * 720 * 4); gl.readPixels(0, 0, 1280, 720, gl.RGBA, gl.UNSIGNED_BYTE, bytes); pixels.push(bytes);
    samples.sort((a, b) => a - b); result.pipeline.push({ sharedNormals: reuse, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, cpuSubmitMs: samples[Math.floor(samples.length / 2)] });
  }
  result.pixelMeanDifference = pixels[0].reduce((sum, value, i) => sum + Math.abs(value - pixels[1][i]), 0) / pixels[0].length;
  check(result.pipeline[1].calls < result.pipeline[0].calls * 0.7, 'Normal/shadow reuse must eliminate redundant scene rendering');
  check(result.pixelMeanDifference < 3, 'Shared normal target preserves rendered appearance');
  const ghost = new THREE.Mesh(new THREE.TorusGeometry(2, 0.3, 8, 24), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 })); ghost.position.set(0, 2, 0); city.scene.add(ghost);
  city.ssaoPass.render(renderer, city.composer.writeBuffer, city.composer.readBuffer, 0, false);
  const normalTarget = city.ssaoPass.normalRenderTarget, normalPixels = new Uint16Array(normalTarget.width * normalTarget.height * 4);
  renderer.readRenderTargetPixels(normalTarget, 0, 0, normalTarget.width, normalTarget.height, normalPixels);
  ghost.removeFromParent(); city.ssaoPass.render(renderer, city.composer.writeBuffer, city.composer.readBuffer, 0, false);
  const withoutGhost = new Uint16Array(normalPixels.length); renderer.readRenderTargetPixels(normalTarget, 0, 0, normalTarget.width, normalTarget.height, withoutGhost);
  result.invisibleEffectsExcluded = ghost.visible && normalPixels.every((v, i) => v === withoutGhost[i]);
  check(result.invisibleEffectsExcluded, 'Transparent effects must not create SSAO/ink ghosts'); ghost.geometry.dispose(); (ghost.material as THREE.Material).dispose();
  city.ssaoPass.enabled = false; city.render(); check(city.inkPass.sharedNormals === null, 'Disabled SSAO uses standalone ink normals');
  city.ssaoPass.enabled = true; city.render(); check(city.inkPass.sharedNormals === city.ssaoPass.normalRenderTarget, 'Enabled SSAO restores shared normals');
  for (const [view, position, lookAt] of [['roof', [58, 36, 60], [0, 5, 0]], ['street', [12, 5, 17], [0, 1, 0]]] as [string, number[], number[]][]) {
    camera.position.fromArray(position); camera.lookAt(new THREE.Vector3().fromArray(lookAt));
    for (const enabled of [false, true]) {
      cityActors.forEach(a => a.weapon.visible = enabled); const times = [];
      for (let i = 0; i < 12; i++) { await frame(); renderer.info.reset(); const start = performance.now(); cityRelays.updateFromSnapshot(null, [], [], { x: 0, y: 0, z: 0 }, 8, i / 60); city.render(); if (i > 3) times.push(performance.now() - start); }
      times.sort((a, b) => a - b); result.city.push({ view, weapons: enabled, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, cpuSubmitMs: times[Math.floor(times.length / 2)] });
    }
    const [before, after] = result.city.slice(-2); check(after.calls - before.calls <= result.budgets.cityWeaponCallIncrease && after.triangles - before.triangles <= result.budgets.cityWeaponTriangleIncrease, 'Combined city weapon overhead');
  }
  const resources = weaponBuilder.resources.size, memoryBefore = renderer.info.memory.geometries;
  for (let i = 0; i < 5; i++) { const temporary = new HumanoidRig(AugmentChassisId.TITAN_JUGGERNAUT); scene.add(temporary.root); renderer.render(scene, camera); temporary.dispose(); temporary.root.removeFromParent(); }
  result.cleanup = weaponBuilder.resources.size === resources && renderer.info.memory.geometries <= memoryBefore; check(result.cleanup, 'Repeated rigs release GPU geometry and references');
  check(result.errors.length === 0 && result.warnings.length === 0, 'Zero loader/shader warnings or errors'); check(renderer.getContext().getError() === 0, 'WebGL error');
  for (const label of ['Weapons', 'Motion library', 'City']) { const b = document.createElement('button'); b.textContent = label; b.onclick = () => label === 'Motion library' ? selectMotion(clipName) : show(label.toLowerCase()); nav.append(b); }
  const select = document.createElement('select'); select.ariaLabel = 'Capoeira motion'; for (const clip of source!.animations) { const o = document.createElement('option'); o.value = o.text = clip.name; select.add(o); } select.value = 'armada'; select.onchange = () => selectMotion(select.value); nav.append(select);
  for (const state of ['Walk', 'MeleeCombo1_Jab', 'MeleeCombo2_Cross', 'MeleeCombo3_SpinningKick', 'PairedCounter', 'WeaponDropRecoil'] as SkeletalState[]) { const b = document.createElement('button'); b.textContent = state; b.onclick = () => { show('pose'); pose = state; }; nav.append(b); }
  const pause = document.createElement('button'); pause.textContent = 'Pause / Play'; pause.onclick = () => paused = !paused; nav.append(pause);
  (window as any).__artQa = { selectMotion, show, pauseAt: (t: number) => { seconds = t; paused = true; draw(0); }, setPose: (state: SkeletalState) => { pose = state; paused = false; show('pose'); } };
  clipName = 'armada'; result.status = 'passed'; show('weapons'); draw(0); await fetch('/verification-result', { method: 'POST', body: JSON.stringify(result) });
  let previous = performance.now(); const animate = () => { if (!running) return; const now = performance.now(); renderer.info.reset(); draw(Math.min(0.05, (now - previous) / 1000)); previous = now; requestAnimationFrame(animate); }; requestAnimationFrame(animate);
}
window.addEventListener('pagehide', () => { running = false; sourceMixer?.stopAllAction(); armor.dispose(); weapons.forEach(w => w.dispose()); cityActors.forEach(r => r.dispose()); cityVehicles.forEach(v => v.dispose()); cityRelays?.dispose(); city?.dispose(); composer.dispose(); renderer.dispose(); });
void verify().catch(async e => { result.status = 'failed'; result.errors.push(String(e)); caption.textContent = String(e); await fetch('/verification-result', { method: 'POST', body: JSON.stringify(result) }); });
