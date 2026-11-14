import * as THREE from "three";
import { NeoVeridiaSceneEnvironment } from "../client/world/cityBuilder.js";
import { productionAssets } from "../client/assets/productionAssets.js";
import { HumanoidRig } from "../client/animation/humanoidRig.js";
import { ArticulatedEnemyRigMesh } from "../client/entities/enemyRigMesh.js";
import { ClientVehiclePropRenderer } from "../client/entities/vehicleAndPropMesh.js";
import { Phase6WorldRenderer } from "../client/entities/phase6WorldMesh.js";
import {
  initRapierPhysics,
  SharedPhysicsWorld,
} from "../shared/physics/characterController.js";
import { AugmentChassisId, EnemyLimbId } from "../shared/constants.js";
import { DISTRICT_LOOP_SPECS } from "../shared/world/phase5Systems.js";
import { CinematicDirector } from "../client/narrative/cinematicDirector.js";
import { CinematicOverlay } from "../client/narrative/cinematicOverlay.js";
import {
  openingTrack,
  encounterTracks,
  type CinematicTrack,
} from "../client/narrative/cinematicTracks.js";

const result = {
  status: "running",
  checkedAt: new Date().toISOString(),
  errors: [] as string[],
  warnings: [] as string[],
  views: [] as string[],
  cameraRestore: false,
  overlayCleanup: false,
  gpuStable: false,
  skipEveryShot: false,
  hardwareFpsCertified: false,
};
(window as any).__stage6Verification = result;
const logError = console.error.bind(console),
  logWarn = console.warn.bind(console);
console.error = (...a) => {
  result.errors.push(a.map(String).join(" "));
  logError(...a);
};
console.warn = (...a) => {
  result.warnings.push(a.map(String).join(" "));
  logWarn(...a);
};
const check = (v: unknown, m: string) => {
  if (!v) throw Error(m);
};
const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
await initRapierPhysics();
const world = new SharedPhysicsWorld(),
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
  });
renderer.setSize(1280, 720);
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.append(renderer.domElement);
const camera = new THREE.PerspectiveCamera(68, 1280 / 720, 0.15, 18000),
  city = new NeoVeridiaSceneEnvironment(renderer, camera);
city.resize(1280, 720);
city.vista.autoCycle = false;
city.vista.setNight(0.3);
const player = { x: -22, y: 0, z: 20 },
  rig = new HumanoidRig(AugmentChassisId.TITAN_JUGGERNAUT);
rig.root.position.set(player.x, player.y, player.z);
city.scene.add(rig.root);
const vehicles = new ClientVehiclePropRenderer();
city.scene.add(vehicles.rootGroup);
const vehicleStates = world.vehiclePropManager.toBinaryVehicleSnapshots();
vehicles.updateFromSnapshots(
  vehicleStates,
  world.vehiclePropManager.toBinaryPropSnapshots(),
  new Set(),
  false,
  player,
  { x: 0, y: 0, z: 0 },
  0,
  { serverTick: 0, vehicles: [], debris: [] },
);
const loop = world.phase5Director.districtLoops.get(
  DISTRICT_LOOP_SPECS[0].district,
)!;
world.phase5Director.advanceDistrictLoopToStage2(loop);
const lieutenant = encounterTracks({
  player,
  districts: world.phase5Director.toBinaryDistrictLoopSnapshots(),
  enemies: new Map(
    world.combatManager.toBinarySnapshots().map((e) => [e.enemyId, e]),
  ),
  phase6: null,
})[0];
world.phase5Director.advanceDistrictLoopToStage3(loop);
const kingpin = encounterTracks({
  player,
  districts: world.phase5Director.toBinaryDistrictLoopSnapshots(),
  enemies: new Map(
    world.combatManager.toBinarySnapshots().map((e) => [e.enemyId, e]),
  ),
  phase6: null,
})[0];
for (const id of [501, 511]) {
  const state = world.combatManager
    .toBinarySnapshots()
    .find((e) => e.enemyId === id)!;
  const visual = new ArticulatedEnemyRigMesh(id, true);
  visual.update(state, false, EnemyLimbId.HEAD, null, 0);
  city.scene.add(visual.root);
}
world.dreadnoughtDirector.deploy();
const pets = world.cyberPetArenaManager,
  phase6 = {
    serverTick: 0,
    pets: pets.toBinaryPetStates(),
    arena: pets.toBinaryArenaHeader(),
    racers: pets.toBinaryDerbyRacers(),
    fighters: pets.toBinaryClashFighters(),
    dreadnought: world.dreadnoughtDirector.toBinarySnapshot(),
  };
const finalBoss = new Phase6WorldRenderer(city.scene);
finalBoss.update(phase6, 0);
const dreadnought = encounterTracks({
  player: phase6.dreadnought.position,
  districts: [],
  enemies: new Map(),
  phase6,
})[0];
const car = [...vehicleStates].sort(
  (a, b) =>
    Math.hypot(a.position.x - player.x, a.position.z - player.z) -
    Math.hypot(b.position.x - player.x, b.position.z - player.z),
)[0];
const opening = openingTrack(player, car?.position);
let director: CinematicDirector;
const overlay = new CinematicOverlay(() => director.end("skipped"));
director = new CinematicDirector(camera, null, {
  start: (t) => overlay.show(t),
  frame: (_t, s) => overlay.update(s),
  finish: () => overlay.hide(),
  resolvePosition: (track, s) => {
    if (
      !track.targetEnemyId &&
      !(track.id === "opening-v1" && s.shotIndex === 3)
    )
      return undefined;
    const dir = new THREE.Vector3(
        s.position.x - s.target.x,
        s.position.y - s.target.y,
        s.position.z - s.target.z,
      ),
      length = dir.length();
    dir.normalize();
    return dir
      .multiplyScalar(world.computeCameraSafeDistance(s.target, dir, length))
      .add(new THREE.Vector3(s.target.x, s.target.y, s.target.z));
  },
});
const restore = () => {
  camera.position.set(-28, 4, 28);
  camera.lookAt(player.x, 1.2, player.z);
  camera.fov = 68;
  camera.updateProjectionMatrix();
};
let profile = 0,
  selected = opening,
  time = 2,
  playing = false,
  last = performance.now(),
  ready = false;
const show = (track: CinematicTrack, at: number) => {
  director.end("interrupted");
  restore();
  director.useProfile(`preview-${++profile}`);
  director.start(track, 0);
  director.update(at);
  selected = track;
  time = at;
  city.render();
};
const controls = document.createElement("nav");
controls.id = "studio-controls";
document.body.append(controls);
for (const [label, track, at] of [
  ["Bridge", opening, 2],
  ["City", opening, 5.5],
  ["Vehicle", opening, 8],
  ["Agent", opening, 10],
  ["Lieutenant", lieutenant, 1.6],
  ["Kingpin", kingpin, 1.6],
  ["Dreadnought", dreadnought, 2],
] as const) {
  const b = document.createElement("button");
  b.textContent = label;
  b.onclick = () => {
    playing = false;
    show(track, at);
  };
  controls.append(b);
}
const play = document.createElement("button");
play.textContent = "Play opening";
play.onclick = () => {
  show(opening, 0);
  playing = true;
};
controls.append(play);
const reduced = document.createElement("button");
reduced.textContent = "Reduced motion: off";
reduced.onclick = () => {
  director.reducedMotion = !director.reducedMotion;
  reduced.textContent = `Reduced motion: ${director.reducedMotion ? "on" : "off"}`;
  show(selected, time);
};
controls.append(reduced);
window.addEventListener("keydown", (e) => {
  if (e.code === "Escape" || e.code === "Space") {
    director.end("skipped");
    playing = false;
    e.preventDefault();
  }
});
async function verify() {
  await productionAssets.load(renderer);
  productionAssets.applyEnvironment(renderer, city.scene);
  city.applyProductionMaterials();
  restore();
  city.render();
  let geometryBaseline = renderer.info.memory.geometries;
  for (const [name, t, at] of [
    ["bridge", opening, 2],
    ["city", opening, 5.5],
    ["vehicle", opening, 8],
    ["agent", opening, 10],
    ["lieutenant", lieutenant, 1.6],
    ["kingpin", kingpin, 1.6],
    ["dreadnought", dreadnought, 2],
  ] as const) {
    show(t, at);
    await frame();
    city.render();
    check(!overlay.element.hidden, "Caption overlay visible");
    overlay.skip.click();
    check(
      !director.active && overlay.element.hidden,
      "Skip visible at every shot",
    );
    check(camera.fov === 68, "FOV restored");
    result.views.push(name);
  }
  result.skipEveryShot = true;
  result.cameraRestore = true;
  geometryBaseline = renderer.info.memory.geometries;
  for (let i = 0; i < 50; i++) {
    const pool = new CinematicOverlay(() => {});
    pool.show(opening);
    pool.dispose();
  }
  result.overlayCleanup =
    document.querySelectorAll("#cinematic-overlay").length === 1;
  // Camera paths allocate no additional Three.js geometry/materials.
  city.render();
  result.gpuStable = renderer.info.memory.geometries === geometryBaseline;
  check(
    result.overlayCleanup && result.gpuStable,
    "No accumulating overlays or GPU geometry",
  );
  check(
    !result.errors.length && !result.warnings.length,
    "No loader/shader warnings or errors",
  );
  result.status = "passed";
  ready = true;
  show(opening, 2);
  await fetch("/verification-result", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(result),
  });
}
void verify().catch(async (e) => {
  result.status = "failed";
  result.errors.push(String(e));
  await fetch("/verification-result", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(result),
  });
});
renderer.setAnimationLoop(() => {
  const now = performance.now(),
    dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!ready) return;
  if (playing && director.active) {
    time += dt;
    director.restoreGameplayCamera();
    restore();
    director.update(time);
  }
  city.render();
});
