import { EnemyArchetype } from "../shared/combat/combatPresentation.js";
import * as THREE from "three";
import {
  CombatEffects,
  EFFECT_POOL_LIMITS,
} from "../client/animation/combatEffects.js";
import {
  SpatialOrbAudioEngine,
  AUDIO_LIMITS,
  createCueBuffer,
  type AudioCue,
} from "../client/audio/spatialGameAudio.js";
import {
  EffectKind,
  effectSpec,
  type EffectEvent,
} from "../shared/protocol/presentationProtocol.js";
import { NeoVeridiaSceneEnvironment } from "../client/world/cityBuilder.js";
import { HumanoidRig } from "../client/animation/humanoidRig.js";
import { SkeletalAnimator } from "../client/animation/skeletalAnimator.js";
import { VehicleBuilder } from "../client/builders/VehicleBuilder.js";
import { AugmentChassisId } from "../shared/constants.js";
import { generateNeoVeridiaOrbs } from "../shared/world/orbSystem.js";
import { productionAssets } from "../client/assets/productionAssets.js";
import type { VehicleBinarySnapshotState } from "../shared/protocol/binaryProtocol.js";

const result = {
  status: "running",
  checkedAt: new Date().toISOString(),
  errors: [] as string[],
  warnings: [] as string[],
  stressSeconds: 120,
  poolLimits: EFFECT_POOL_LIMITS,
  maxActive: {} as Record<string, number>,
  renderCalls: 0,
  renderTriangles: 0,
  cleanup: false,
  audio: {
    status: "waiting for gesture",
    limits: AUDIO_LIMITS,
    hrtfLeft: [] as number[],
    hrtfRight: [] as number[],
    peak: 0,
    voiceBound: false,
    priorityProtected: false,
    naturalCleanup: false,
    muted: false,
    disconnect: false,
    disposed: false,
  },
  hardwareFpsCertified: false,
};
(window as any).__stage5Verification = result;
const error = console.error.bind(console),
  warn = console.warn.bind(console);
console.error = (...a) => {
  result.errors.push(a.map(String).join(" "));
  error(...a);
};
console.warn = (...a) => {
  result.warnings.push(a.map(String).join(" "));
  warn(...a);
};
const check = (v: unknown, m: string) => {
  if (!v) throw new Error(m);
};
const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
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
const camera = new THREE.PerspectiveCamera(52, 1280 / 720, 0.15, 18000),
  city = new NeoVeridiaSceneEnvironment(renderer, camera);
city.resize(1280, 720);
city.vista.autoCycle = false;
city.vista.setNight(0.55);
camera.position.set(-8, 5, 14);
camera.lookAt(0, 1, 0);
const effects = new CombatEffects();
city.scene.add(effects.root);
let audio = new SpatialOrbAudioEngine();
const armor = new HumanoidRig(AugmentChassisId.TITAN_JUGGERNAUT),
  victim = new HumanoidRig(EnemyArchetype.STREET_ENFORCER);
armor.root.position.set(-1.5, 0, 2);
victim.root.position.set(-1.5, 0, 0.85);
victim.root.rotation.y = Math.PI;
city.scene.add(armor.root, victim.root);
const animator = new SkeletalAnimator(armor),
  victimAnimator = new SkeletalAnimator(victim);
const car = new VehicleBuilder().build(false);
car.root.position.set(4, 0.9, 0);
city.scene.add(car.root);
car.materials.forEach((m) => city.prepareArtMaterial(m));
const previewVehicle: VehicleBinarySnapshotState = {
  vehicleId: 1,
  driverEntityId: 1,
  isInterceptor: false,
  wallThrusterActive: false,
  wheelGroundedMask: 15,
  position: car.root.position,
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  speedMps: 4,
  steerAngleRad: 0,
  wheelCompressionRatio: [0.5, 0.5, 0.5, 0.5],
};
const previewVehicles = [previewVehicle];
const noOrbs: ReturnType<typeof generateNeoVeridiaOrbs> = [];
const noCollectedOrbs = new Set<number>();
const nav = document.createElement("nav"),
  caption = document.createElement("footer");
document.body.append(nav, caption);
let running = false,
  time = 0,
  last = performance.now(),
  sequence = 0,
  preview = "combat",
  nextBurst = 0;
const event = (
  kind: EffectKind,
  overrides: Partial<EffectEvent> = {},
): EffectEvent => ({
  ...effectSpec(
    kind,
    { x: -1.5, y: 1, z: 0.85 },
    {
      origin: { x: -1.5, y: 1.4, z: 2 },
      normal: { x: 0, y: 0, z: 1 },
      flags: 1,
      radius: 6,
    },
  ),
  id: ++sequence,
  tick: sequence,
  ...overrides,
});
function emit(e: EffectEvent) {
  effects.emit(e, camera.position);
  audio.playEffect(e);
}
function burst() {
  emit(event(EffectKind.SHOT));
  emit(
    event(EffectKind.HIT, { point: { x: 1, y: 1, z: 1 }, limb: 2, flags: 2 }),
  );
  emit(event(EffectKind.BLAST, { point: { x: 5, y: 1, z: -6 }, radius: 4 }));
}
function draw(dt: number) {
  time += dt;
  audio.update(
    camera,
    armor.root.position,
    noOrbs,
    noCollectedOrbs,
    preview === "drive" ? previewVehicles : [],
  );
  if (preview === "combat" && time > nextBurst) {
    nextBurst = time + 0.55;
    burst();
  }
  if (preview === "counter") {
    const elapsed = time % 0.95;
    animator.update(dt, {
      speed: 0,
      verticalSpeed: 0,
      state: "PairedCounter",
      pairedElapsed: elapsed,
    });
    victimAnimator.update(dt, {
      speed: 0,
      verticalSpeed: 0,
      state: "CounterVictim",
      pairedElapsed: elapsed,
    });
    if (elapsed >= 0.48 && elapsed - dt < 0.48) emit(event(EffectKind.COUNTER));
  }
  if (preview === "drive") {
    car.root.position.z = 4 - ((time * 4) % 12);
    for (const x of [3.4, 4.6])
      emit(
        event(EffectKind.SKID, {
          origin: { x, y: 0.025, z: car.root.position.z + 0.08 },
          point: { x, y: 0.025, z: car.root.position.z - 0.08 },
          normal: { x: 0, y: 1, z: 0 },
        }),
      );
  }
  effects.update(dt);
  city.render();
  caption.textContent = `STAGE 5 // ${preview.toUpperCase()} // four fixed effect batches\n${audio.diagnostics.state === "running" ? "HRTF audio enabled" : "Click Enable audio for positional sound"} · synthesized game cues · geometry and audio pools bounded`;
}
for (const [label, mode] of [
  ["Firefight", "combat"],
  ["Counter contact", "counter"],
  ["Driving / skid marks", "drive"],
] as const) {
  const b = document.createElement("button");
  b.textContent = label;
  b.onclick = () => {
    preview = mode;
    time = 0;
    effects.reset();
  };
  nav.append(b);
}
const enable = document.createElement("button");
enable.textContent = "Enable audio / verify";
enable.disabled = true;
nav.append(enable);
const mute = document.createElement("button");
mute.textContent = "Mute";
let muted = false;
mute.onclick = () => {
  muted = !muted;
  audio.setMuted(muted);
  mute.textContent = muted ? "Unmute" : "Mute";
};
nav.append(mute);
async function report() {
  await fetch("/verification-result", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(result),
  });
}
async function verify() {
  await productionAssets.load(renderer);
  productionAssets.applyEnvironment(renderer, city.scene);
  city.applyProductionMaterials();
  for (let tick = 0; tick < 7200; tick++) {
    if (tick % 6 === 0)
      for (let kind = 0; kind < 8; kind++)
        effects.emit(
          event(kind, {
            point: { x: (tick % 20) - 10, y: 1, z: -2 },
            normal: { x: 0, y: 1, z: 0 },
          }),
        );
    effects.update(1 / 60);
    if (tick % 24 === 0) {
      await frame();
      renderer.info.reset();
      city.render();
      for (const [kind, state] of Object.entries(effects.stats)) {
        result.maxActive[kind] = Math.max(
          result.maxActive[kind] ?? 0,
          state.active,
        );
        check(state.active <= state.capacity, `${kind} pool bound`);
      }
    }
  }
  effects.reset();
  burst();
  effects.update(0.02);
  renderer.info.reset();
  city.render();
  const withFX = { ...renderer.info.render };
  effects.root.visible = false;
  renderer.info.reset();
  city.render();
  result.renderCalls = withFX.calls - renderer.info.render.calls;
  result.renderTriangles = withFX.triangles - renderer.info.render.triangles;
  effects.root.visible = true;
  check(
    result.renderCalls <= 4,
    "At most four effect draw batches through full postprocessing",
  );
  const before = { ...renderer.info.memory };
  for (let i = 0; i < 3; i++) {
    const pool = new CombatEffects();
    city.scene.add(pool.root);
    pool.emit(event(EffectKind.BLAST));
    pool.update(0.1);
    city.render();
    pool.dispose();
    city.render();
  }
  result.cleanup = renderer.info.memory.geometries === before.geometries;
  check(result.cleanup, "GPU geometry returns to baseline");
  check(!result.errors.length, "No shader/renderer errors");
  result.status = "visual passed; audio pending";
  running = true;
  enable.disabled = false;
  await report();
}
async function verifyAudio() {
  enable.disabled = true;
  running = false;
  audio.unlockAndInit();
  await frame();
  await frame();
  check(
    audio.diagnostics.state === "running",
    "User gesture resumes the actual AudioContext",
  );
  for (let i = 0; i < 80; i++)
    audio.play(i % 2 ? "shot" : "counter", { x: i % 2 ? -3 : 3, y: 1, z: 0 });
  check(audio.diagnostics.oneShots <= 16, "Voice stealing caps active sources");
  result.audio.voiceBound = true;
  audio.setMuted(true);
  check(audio.diagnostics.oneShots === 0, "Mute clears active sources");
  result.audio.muted = true;
  audio.setMuted(false);
  for (let i = 0; i < AUDIO_LIMITS.oneShots; i++)
    audio.play("counter", { x: 0, y: 1, z: -3 });
  check(
    !audio.play("step", { x: 0, y: 0, z: -3 }),
    "Footsteps do not steal counter voices",
  );
  result.audio.priorityProtected = true;
  audio.play("blast", { x: 0, y: 1, z: -3 });
  await new Promise((resolve) => setTimeout(resolve, 1100));
  check(
    audio.diagnostics.oneShots === 0,
    "Completed buffers release every transient source naturally",
  );
  result.audio.naturalCleanup = true;
  const orbs = generateNeoVeridiaOrbs()
    .slice(0, 12)
    .map((o, i) => ({ ...o, position: { x: i, y: 0, z: 0 } }));
  const vehicles: VehicleBinarySnapshotState[] = Array.from(
    { length: 8 },
    (_, i) => ({
      vehicleId: i + 1,
      driverEntityId: i + 1,
      isInterceptor: false,
      wallThrusterActive: false,
      wheelGroundedMask: 15,
      position: { x: i + 2, y: 0, z: 1 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      speedMps: 20,
      steerAngleRad: 0.3,
      wheelCompressionRatio: [0.5, 0.5, 0.5, 0.5],
    }),
  );
  audio.update(camera, { x: 0, y: 0, z: 0 }, orbs, new Set(), vehicles);
  check(
    audio.diagnostics.orbVoices === 6 &&
      audio.diagnostics.engines === 4 &&
      audio.diagnostics.channels === 26,
    "Nearest loops bounded",
  );
  audio.setActive(false);
  check(
    audio.diagnostics.engines === 0 && audio.diagnostics.orbVoices === 0,
    "Disconnect silences all persistent channels",
  );
  result.audio.disconnect = true;
  audio.setActive(true);
  for (const side of [-1, 1]) {
    const ctx = new OfflineAudioContext(2, 24000, 48000),
      source = ctx.createBufferSource(),
      panner = ctx.createPanner();
    source.buffer = createCueBuffer(ctx, "shot");
    panner.panningModel = "HRTF";
    panner.positionX.value = side * 5;
    panner.positionZ.value = -3;
    source.connect(panner);
    panner.connect(ctx.destination);
    source.start();
    const output = await ctx.startRendering();
    const energy = [0, 1].map((c) => {
      const data = output.getChannelData(c);
      return Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length);
    });
    if (side < 0) result.audio.hrtfLeft = energy;
    else result.audio.hrtfRight = energy;
  }
  check(
    result.audio.hrtfLeft[0] > result.audio.hrtfLeft[1] * 1.1 &&
      result.audio.hrtfRight[1] > result.audio.hrtfRight[0] * 1.1,
    "Actual HRTF left/right energy responds to source position",
  );
  const offline = new OfflineAudioContext(2, 48000 * 6, 48000);
  const cues: AudioCue[] = ["shot", "counter", "blast", "step", "skid", "orb"];
  cues.forEach((kind, i) => {
    const s = offline.createBufferSource(),
      p = offline.createPanner();
    s.buffer = createCueBuffer(offline, kind);
    p.panningModel = "HRTF";
    p.positionX.value = i % 2 ? 3 : -3;
    p.positionZ.value = -3;
    s.connect(p);
    p.connect(offline.destination);
    s.start(i);
  });
  const recording = await offline.startRendering(),
    pcm = new ArrayBuffer(44 + recording.length * 4),
    v = new DataView(pcm);
  const text = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(offset + i, s.charCodeAt(i));
  };
  text(0, "RIFF");
  v.setUint32(4, pcm.byteLength - 8, true);
  text(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 2, true);
  v.setUint32(24, 48000, true);
  v.setUint32(28, 192000, true);
  v.setUint16(32, 4, true);
  v.setUint16(34, 16, true);
  text(36, "data");
  v.setUint32(40, pcm.byteLength - 44, true);
  for (let i = 0; i < recording.length; i++)
    for (let c = 0; c < 2; c++) {
      const sample = recording.getChannelData(c)[i];
      result.audio.peak = Math.max(result.audio.peak, Math.abs(sample));
      v.setInt16(
        44 + (i * 2 + c) * 2,
        Math.max(-32767, Math.min(32767, sample * 32767)),
        true,
      );
    }
  check(
    result.audio.peak > 0.01 && result.audio.peak < 1,
    "Audible finite waveform with no clipping",
  );
  await fetch("/audio-sample", { method: "POST", body: pcm });
  await audio.dispose();
  check(
    audio.diagnostics.channels === 0 && audio.diagnostics.state === "closed",
    "AudioContext and all sources released",
  );
  result.audio.disposed = true;
  result.audio.status = "passed";
  result.status = "passed";
  enable.textContent = "Enable preview audio";
  audio = new SpatialOrbAudioEngine();
  enable.onclick = () => audio.unlockAndInit();
  enable.disabled = false;
  running = true;
  await report();
}
enable.onclick = () =>
  void verifyAudio().catch((e) => {
    result.status = "failed";
    result.errors.push(String(e));
    void report();
  });
void verify().catch((e) => {
  result.status = "failed";
  result.errors.push(String(e));
  caption.textContent = String(e);
  void report();
});
renderer.setAnimationLoop(() => {
  const now = performance.now(),
    dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (running) draw(dt);
});
