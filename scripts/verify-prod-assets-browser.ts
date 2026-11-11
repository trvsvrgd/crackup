import * as THREE from 'three';
import { productionAssets } from '../client/assets/productionAssets.js';
import { ArticulatedAgentRig } from '../client/entities/agentMesh.js';
import { AgentAnimState } from '../shared/constants.js';

const assert = (value: unknown, message: string) => { if (!value) throw new Error(message); };
const result: { status: string; textures: unknown[]; characters: unknown[]; errors: string[]; warnings: string[]; rendered?: boolean } = { status: 'running', textures: [], characters: [], errors: [], warnings: [] };
(window as any).__assetVerification = result;
const originalError = console.error.bind(console);
console.error = (...args: unknown[]) => { result.errors.push(args.map(String).join(' ')); originalError(...args); };
const originalWarn = console.warn.bind(console);
console.warn = (...args: unknown[]) => { result.warnings.push(args.map(String).join(' ')); originalWarn(...args); };

async function verify() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(640, 480);
  renderer.debug.checkShaderErrors = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  document.body.appendChild(renderer.domElement);
  await productionAssets.load(renderer);
  assert(productionAssets.environment?.image.width === 2048, 'HDR did not decode at 2K');
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 2));
  productionAssets.applyEnvironment(renderer, scene);
  const camera = new THREE.PerspectiveCamera(40, 640 / 480, 0.1, 100);
  camera.position.set(4, 3, 8);
  camera.lookAt(0, 1, 0);
  let index = 0;
  for (const [name, maps] of productionAssets.textures) {
    for (const [channel, texture] of Object.entries(maps)) {
      const image = texture.image;
      assert(image.naturalWidth === 2048 && image.naturalHeight === 2048, `${name}/${channel}: not 2K`);
      assert(texture.colorSpace === (channel === 'diffuse' ? THREE.SRGBColorSpace : THREE.NoColorSpace), `${name}/${channel}: wrong color space`);
    }
    const material = new THREE.MeshStandardMaterial({ metalness: name.includes('iron') ? 1 : 0.1 });
    assert(productionAssets.applyMaterial(material, name), `${name}: could not apply PBR maps`);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), material);
    mesh.position.set(index++ - 1.5, 0.4, 2);
    scene.add(mesh);
    result.textures.push({ name, maps: Object.keys(maps), resolution: [2048, 2048] });
  }
  index = 0;
  for (const [name, template] of productionAssets.characters) {
    const first = productionAssets.createCharacter(name)!;
    const second = productionAssets.createCharacter(name)!;
    const meshesA: THREE.SkinnedMesh[] = [], meshesB: THREE.SkinnedMesh[] = [];
    first.scene.traverse((node) => { if ((node as THREE.SkinnedMesh).isSkinnedMesh) meshesA.push(node as THREE.SkinnedMesh); });
    second.scene.traverse((node) => { if ((node as THREE.SkinnedMesh).isSkinnedMesh) meshesB.push(node as THREE.SkinnedMesh); });
    assert(meshesA.length && meshesA.length === meshesB.length, `${name}: no skinned meshes`);
    for (const [i, a] of meshesA.entries()) assert(a.skeleton !== meshesB[i].skeleton && a.skeleton.bones[0] !== meshesB[i].skeleton.bones[0], `${name}: shared skeleton`);
    const mixer = new THREE.AnimationMixer(first.scene);
    for (const clip of first.animations) {
      const action = mixer.clipAction(clip).play();
      mixer.update(Math.min(0.3, clip.duration / 2));
      first.scene.updateMatrixWorld(true);
      for (const mesh of meshesA) for (const bone of mesh.skeleton.bones) assert(bone.matrixWorld.elements.every(Number.isFinite), `${name}/${clip.name}: nonfinite bone transform`);
      action.stop();
    }
    const idle = first.animations.find((clip) => clip.name.toLowerCase() === 'idle')!;
    mixer.clipAction(idle).play(); mixer.update(0.1);
    first.scene.position.x = index++ * 2 - 1;
    scene.add(first.scene);
    result.characters.push({ name, skinnedMeshes: meshesA.length, joints: new Set(meshesA.flatMap((mesh) => mesh.skeleton.bones)).size, clips: template.animations.map((clip) => clip.name), independentSkeletons: true });
  }
  // Disposal of one live avatar must not corrupt another avatar's resources.
  const disposed = new ArticulatedAgentRig('DISPOSED', true);
  const survivor = new ArticulatedAgentRig('SURVIVOR', true);
  survivor.root.updateMatrixWorld(true);
  const importedBounds = new THREE.Box3().setFromObject(survivor.root.getObjectByName('ProductionHumanoid')!);
  const importedHeight = importedBounds.max.y - importedBounds.min.y;
  assert(importedHeight > 1.5 && importedHeight < 2.2, `Production avatar has incorrect height: ${importedHeight}`);
  disposed.dispose();
  survivor.update({ x: 0, y: 0, z: -2 }, { x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: 0, z: 0 }, AgentAnimState.IDLE, 0, 0.1);
  scene.add(survivor.root);
  await renderer.compileAsync(scene, camera);
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  assert(gl.getError() === gl.NO_ERROR, 'WebGL reports a render error');
  assert(result.errors.length === 0 && result.warnings.length === 0, 'Three.js emitted loader/render errors or warnings');
  result.rendered = true;
  result.status = 'passed';
}
verify().catch((error) => { result.status = 'failed'; result.errors.push(String(error)); console.error(error); }).finally(async () => {
  document.getElementById('result')!.textContent = JSON.stringify(result, null, 2);
  await fetch('/verification-result', { method: 'POST', body: JSON.stringify(result), headers: { 'Content-Type': 'application/json' } });
});
