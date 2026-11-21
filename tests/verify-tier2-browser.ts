import * as THREE from 'three';
import { initRapierPhysics, SharedPhysicsWorld } from '../shared/physics/characterController.js';
import { Tier2WorldRenderer } from '../client/entities/tier2WorldMesh.js';
import { buildTier2Structures } from '../shared/content/worldSystemsRegistry.js';
import { DEFAULT_ATTRIBUTES, EnemyCombatState } from '../shared/constants.js';

await initRapierPhysics();
const sim = new SharedPhysicsWorld();
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x102031);
scene.add(new THREE.HemisphereLight(0xdef6ff, 0x334454, 3)); const sun = new THREE.DirectionalLight(0xffedd4, 4); sun.position.set(-500, 180, 170); scene.add(sun);
const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 1000);
for (const s of buildTier2Structures()) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(s.halfExtents.x * 2, s.halfExtents.y * 2, s.halfExtents.z * 2), new THREE.MeshStandardMaterial({ color: s.material === 'helios_glass' ? 0x335b75 : 0x57616b, roughness: 0.6, metalness: 0.2 })); mesh.position.copy(s.center); scene.add(mesh);
}
const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshStandardMaterial({ color: 0x222e38, roughness: 0.9 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.01; scene.add(ground);
const view = new Tier2WorldRenderer(scene);
const agent = sim.createAgent(1, 'TIER2-VISUAL', { x: -550, y: 32, z: 78 }, undefined, { ...DEFAULT_ATTRIBUTES, strength: 3, explosives: 3 });
agent.grounded = true;
const nav = document.createElement('nav'); document.body.append(nav);
const title = document.createElement('h1'); title.textContent = 'Tier 2 · Neon Docks facility'; nav.append(title);
const caption = document.createElement('p'); caption.textContent = 'Production meshes and Rapier bodies · diagnostic scene'; nav.append(caption);
const report = document.createElement('pre'); report.id = 'result'; document.body.append(report);
let mode: 'facility' | 'flight' | 'event' = 'facility', frame = 0;
const facilityCamera = () => { mode = 'facility'; camera.position.set(-500, 67, 155); camera.lookAt(-550, 28, 82); };
facilityCamera();
function button(label: string, action: () => void) { const b = document.createElement('button'); b.textContent = label; b.onclick = action; nav.append(b); }
button('Facility overview', facilityCamera);
button('Breach wall and drop signs', () => {
  sim.tier2.damageArchitecture(10, 250, 'charged_melee', agent);
  for (const id of [30, 31, 32]) sim.tier2.damageArchitecture(id, 80, 'bullet', agent);
});
button('Fly above SAM ceiling', () => {
  sim.tier2.airspace.spawn(1); const a = sim.tier2.airspace.aircraft.get(1001)!;
  a.body.setTranslation({ x: -550, y: 100, z: 90 }, true); a.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  a.state.pilotId = 1; agent.mountedVehicleId = 1001; agent.collider.setEnabled(false); mode = 'flight';
});
function startObjective(kind: number) {
  const s = sim.tier2.skirmishes[0];
  if (s.active) { s.elapsed = 90; sim.tier2.skirmishSystem.step(1 / 60, sim.agents, sim.tier2.stability); }
  for (const a of sim.tier2.airspace.aircraft.values()) a.state.pilotId = 0;
  agent.mountedVehicleId = 0; agent.collider.setEnabled(true); agent.hp = agent.maxHp; agent.position = { x: -550, y: 0.25, z: 116 };
  sim.syncAgentKinematicTransform(agent); sim.world.propagateModifiedBodyPositionsToColliders(); sim.world.updateSceneQueries();
  sim.tier2.stability.NEON_DOCKS = kind < 2 ? 70 : 39; s.sequence = kind < 2 ? kind : kind - 2; s.cooldown = 0;
  sim.tier2.skirmishSystem.step(1 / 60, sim.agents, sim.tier2.stability); mode = 'event';
}
['Escort', 'Repair', 'Armored robbery', 'Clinic siege', 'Ambush'].forEach((label, i) => button(label, () => startObjective(i)));
button('Verify renderer and physics', () => { void (async () => {
  try {
    const checks: string[] = [], check = (ok: boolean, name: string) => { if (!ok) throw new Error(name); checks.push(name); };
    agent.mountedVehicleId = 0; agent.grounded = true;
    sim.tier2.damageArchitecture(10, 250, 'charged_melee', agent); sim.tier2.damageArchitecture(30, 80, 'bullet', agent);
    for (let i = 0; i < 180; i++) { sim.world.step(); sim.tier2.afterPhysics(sim.agents, sim.pendingCombatEvents); }
    check(sim.tier2.architecture.get(10)!.state.broken, 'Breach removes real wall collider');
    check(sim.tier2.architecture.get(30)!.state.impacted, 'Suspended body reaches physical impact');
    for (const e of sim.combatManager.enemies.values()) if (e.enemyId >= 62000 && e.enemyId < 63000) { e.hp = 0; e.combatState = EnemyCombatState.DEAD; }
    sim.tier2.step(1 / 60, sim.agents); check(sim.tier2.unlockedHouses.size === 8, 'All eight sites reconcile cleared defenders');
    view.update(sim.tier2.snapshot(1), agent, 0); renderer.render(scene, camera);
    check(renderer.info.render.triangles > 0, 'Production geometry renders through WebGL');
    for (let kind = 0; kind < 5; kind++) {
      startObjective(kind); view.update(sim.tier2.snapshot(kind), agent, 0); renderer.render(scene, camera);
      check(sim.tier2.skirmishes[0].active && sim.tier2.skirmishes[0].kindIndex === kind, `Distinct objective ${kind} renders from live simulation state`);
    }
    const count = renderer.info.memory.geometries;
    for (let i = 0; i < 120; i++) { view.update(sim.tier2.snapshot(i), agent, i / 60); renderer.render(scene, camera); }
    check(renderer.info.memory.geometries === count, 'Snapshot updates reuse geometry');
    const result = { ok: true, checks, geometries: count, triangles: renderer.info.render.triangles };
    report.textContent = JSON.stringify(result, null, 2); await fetch('/result', { method: 'POST', body: JSON.stringify(result) });
  } catch (error) { report.textContent = String(error); await fetch('/result', { method: 'POST', body: JSON.stringify({ ok: false, error: String(error) }) }); }
})(); });
let last = performance.now(), accumulator = 0;
function animate(now: number) {
  requestAnimationFrame(animate); accumulator += Math.min(0.05, (now - last) / 1000); last = now;
  while (accumulator >= 1 / 60) { sim.tier2.step(1 / 60, sim.agents); sim.world.step(); sim.tier2.afterPhysics(sim.agents, sim.pendingCombatEvents); accumulator -= 1 / 60; frame++; }
  if (mode === 'flight') { const p = sim.tier2.airspace.aircraft.get(1001)!.body.translation(); camera.position.set(p.x + 12, p.y + 7, p.z + 15); camera.lookAt(p.x, p.y, p.z); }
  if (mode === 'event') { const p = sim.tier2.skirmishes[0].position; camera.position.set(p.x + 10, p.y + 6, p.z + 13); camera.lookAt(p.x, p.y, p.z); }
  view.update(sim.tier2.snapshot(frame), agent, now / 1000); renderer.render(scene, camera);
}
requestAnimationFrame(animate);
