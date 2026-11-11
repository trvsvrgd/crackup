import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { HumanoidRig } from '../client/animation/humanoidRig.js';
import { SkeletalAnimator } from '../client/animation/skeletalAnimator.js';
import { InkOutlinePass } from '../client/shaders/inkOutlinePass.js';
import { TacticalCommsOverlay } from '../client/narrative/tacticalComms.js';
import { AugmentChassisId } from '../shared/constants.js';
import { HitReaction, createCombatPresentation } from '../shared/combat/combatPresentation.js';

const result = { status: 'running', errors: [] as string[], rigs: 0, frames: 0, portrait: false, resized: false };
(window as any).__artVerification = result;
const error = console.error.bind(console);
console.error = (...args: unknown[]) => { result.errors.push(args.map(String).join(' ')); error(...args); };
const assert = (ok: unknown, message: string) => { if (!ok) throw new Error(message); };
async function verify() {
  const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(1280, 800); renderer.debug.checkShaderErrors = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; document.body.append(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x101e2c);
  scene.add(new THREE.HemisphereLight(0xd2eaff, 0x2a3e31, 3));
  const sun = new THREE.DirectionalLight(0xffdec0, 3); sun.position.set(3, 8, 5); scene.add(sun);
  const camera = new THREE.PerspectiveCamera(38, 1280 / 800, 0.1, 200); camera.position.set(13, 11, -18); camera.lookAt(0, 0.8, 0);
  const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
  const ink = new InkOutlinePass(scene, camera); composer.addPass(ink); composer.addPass(new OutputPass());
  const animators: SkeletalAnimator[] = [];
  for (const [i, style] of [0, 1, 2, 3, ...Object.values(AugmentChassisId)].entries()) {
    const rig = new HumanoidRig(style, typeof style === 'number'); rig.root.position.set((i % 3 - 1) * 4, 0, (Math.floor(i / 3) - 1) * 4);
    scene.add(rig.root); animators.push(new SkeletalAnimator(rig)); result.rigs++;
  }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x263747, roughness: 0.8 })); ground.rotation.x = -Math.PI / 2; scene.add(ground);
  const comms = new TacticalCommsOverlay(); comms.useProfile('BROWSER-VERIFIER'); comms.director.completed.clear();
  const context = { deployed: true, districtIndex: 0, vigilanteLevel: 1, whisperOrbs: 0, nonLethalBounties: 0, relaySabotage: false, citadelLoopStage: 1, bossDefeated: false };
  const reaction = createCombatPresentation(1, 0); reaction.reaction = HitReaction.FLINCH; reaction.flinchSec = 0.09; reaction.flashSec = 0.05; reaction.direction.z = 1;
  for (let frame = 0; frame < 24; frame++) {
    animators.forEach((a, i) => a.update(1 / 60, { speed: i % 2 ? 8 : 0, verticalSpeed: 0, aim: i === 4 ? 1 : 0, reaction: i === 0 ? reaction : undefined, state: i === 1 ? 'DropToKneeStagger' : i === 2 ? 'PairedCounter' : i === 3 ? 'CounterVictim' : undefined, pairedElapsed: 0.35 }));
    comms.update(context, 1 / 30); composer.render(); comms.renderPortrait(renderer); result.frames++;
  }
  result.portrait = document.getElementById('tactical-comms')?.style.display === 'block';
  assert(result.portrait, 'Comms portrait/subtitles were not displayed');
  renderer.setSize(960, 600); camera.aspect = 960 / 600; camera.updateProjectionMatrix(); composer.setSize(960, 600);
  composer.render(); comms.renderPortrait(renderer); result.resized = ink.target.width === 960;
  const readNormals = () => { const bytes = new Uint8Array(960 * 600 * 4); renderer.readRenderTargetPixels(ink.target, 0, 0, 960, 600, bytes); return bytes; };
  const before = readNormals();
  const invisibleDash = new THREE.Mesh(new THREE.TorusGeometry(2, 0.4, 8, 24), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }));
  invisibleDash.position.set(0, 2, -3); scene.add(invisibleDash); composer.render();
  const after = readNormals(); assert(before.every((value, index) => value === after[index]), 'Invisible effects contributed ghost ink geometry');
  assert(invisibleDash.visible, 'Ink pass failed to restore effect visibility'); scene.remove(invisibleDash); invisibleDash.geometry.dispose(); (invisibleDash.material as THREE.Material).dispose();
  const gl = renderer.getContext(); assert(gl.getError() === gl.NO_ERROR, 'WebGL error after rendering');
  assert(result.errors.length === 0, 'Three shader compilation errors'); assert(result.resized, 'Ink target did not resize');
  result.status = 'passed';
}
verify().catch(e => { result.status = 'failed'; result.errors.push(String(e)); }).finally(() => {
  const output = document.createElement('pre'); output.id = 'result'; output.textContent = JSON.stringify(result); document.body.append(output);
  void fetch('/verification-result', { method: 'POST', body: JSON.stringify(result) });
});
