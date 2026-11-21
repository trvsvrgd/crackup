import * as THREE from 'three';
import { createResonanceSpire, animateResonanceSpire, ResonanceShatter } from '../client/entities/resonanceSpire.js';
import { SpatialOrbAudioEngine, createReversedResonanceChord } from '../client/audio/spatialGameAudio.js';
import { resolveSpireMemory } from '../shared/world/resonanceSpire.js';
import { RESONANCE_MEMORY_FRAGMENTS } from '../shared/content/worldLore.js';

const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x101c2b);
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 100); camera.position.set(5, 4.3, 8); camera.lookAt(0, 1.3, 0);
scene.add(new THREE.HemisphereLight(0xcceeff, 0x283340, 3));
const key = new THREE.DirectionalLight(0xffdfaa, 5); key.position.set(2, 7, 4); scene.add(key);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: 0x1c2936, roughness: 0.7 })); floor.rotation.x = -Math.PI / 2; scene.add(floor);
const spires = [0x00ffaa, 0xff2a85, 0xc87cff].map((color, i) => {
  const group = createResonanceSpire(new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.5, metalness: 0.55, roughness: 0.2 }));
  group.position.set((i - 1) * 2.5, 1.25, 0); scene.add(group); return group;
});
const shatter = new ResonanceShatter(scene), audio = new SpatialOrbAudioEngine();
const nav = document.createElement('nav'), title = document.createElement('h1'), caption = document.createElement('p');
title.textContent = 'Resonance Spires'; caption.textContent = 'Agility · Renegade · Whisper / 72 BPM';
nav.append(title, caption); document.body.append(nav);
const report = document.createElement('pre'); report.id = 'result'; document.body.append(report);
let last = performance.now(), elapsed = 0, firstRenderAfterStop = 0, collectionAt = 0;
function frame(now: number) {
  requestAnimationFrame(frame); const dt = Math.min(0.05, (now - last) / 1000); last = now; elapsed += dt;
  if (now < shatter.hitStopUntil) return;
  if (collectionAt && !firstRenderAfterStop) firstRenderAfterStop = now - collectionAt;
  for (const spire of spires) animateResonanceSpire(spire, elapsed, dt);
  shatter.update(dt); renderer.render(scene, camera);
}
requestAnimationFrame(frame);
function button(label: string, act: () => void) { const b = document.createElement('button'); b.textContent = label; b.onclick = act; nav.append(b); }
button('Act I — Filtered chord', () => { audio.unlockAndInit(); void audio.playResonanceMemory(resolveSpireMemory(1, 2)); caption.textContent = resolveSpireMemory(1, 2).transcript; });
button('Act II — Citizen memory', () => { audio.unlockAndInit(); void audio.playResonanceMemory(resolveSpireMemory(1, 3)); caption.textContent = resolveSpireMemory(1, 3).transcript; });
button('Collect spire', () => {
  audio.unlockAndInit(); void audio.playResonanceMemory(resolveSpireMemory(1, 3));
  collectionAt = performance.now(); firstRenderAfterStop = 0;
  shatter.collect(spires[1]!.position, collectionAt); spires[1]!.visible = false;
  caption.textContent = '12 ballistic shards · 40 ms presentation pause';
});
button('Verify browser audio and shatter', () => { void (async () => {
  const checks: string[] = [], check = (ok: boolean, name: string) => { if (!ok) throw new Error(name); checks.push(name); };
  try {
    const ctx = new OfflineAudioContext(1, 44100, 22050);
    const chord = createReversedResonanceChord(ctx).getChannelData(0);
    const energy = (a: Float32Array) => a.reduce((sum, n) => sum + n * n, 0) / a.length;
    check(energy(chord.slice(-2205)) > energy(chord.slice(0, 2205)) * 10, 'Reversed chord swells toward its end');
    for (const memory of RESONANCE_MEMORY_FRAGMENTS) {
      const response = await fetch(memory.audioUrl); check(response.ok, `${memory.id} served`);
      const decoded = await ctx.decodeAudioData(await response.arrayBuffer());
      check(Math.abs(decoded.duration - 2) < 0.001 && energy(decoded.getChannelData(0)) > 0.00001, `${memory.id} decodes to 2 seconds of non-silent speech`);
    }
    collectionAt = performance.now(); firstRenderAfterStop = 0; shatter.collect(spires[0]!.position, collectionAt);
    check(shatter.shards.length >= 12, 'Collection creates twelve shard bodies');
    await new Promise(r => setTimeout(r, 200)); check(firstRenderAfterStop >= 40, 'Renderer holds the frame for at least 40ms');
    await new Promise(r => setTimeout(r, 1800)); check(shatter.shards.length === 0, 'All ballistic shards expire');
    const result = { ok: true, checks, firstRenderAfterStopMs: firstRenderAfterStop, renderer: renderer.info.render };
    report.textContent = JSON.stringify(result, null, 2); await fetch('/result', { method: 'POST', body: JSON.stringify(result) });
  } catch (error) { report.textContent = String(error); await fetch('/result', { method: 'POST', body: JSON.stringify({ ok: false, error: String(error) }) }); }
})(); });
