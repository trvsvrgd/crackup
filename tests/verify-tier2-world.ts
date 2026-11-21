import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { WebSocket } from 'ws';
import { initRapierPhysics, SharedPhysicsWorld, RAPIER } from '../shared/physics/characterController.js';
import { AugmentChassisId, DEFAULT_ATTRIBUTES, DistrictId, EnemyCombatState, EnemyLimbId, FIXED_TIMESTEP as DT, INPUT_FLAG_AIM, INPUT_FLAG_DASH, INPUT_FLAG_FIRE, INPUT_FLAG_MELEE, INPUT_FLAG_JUMP, INPUT_FLAG_VEHICLE_INTERACT } from '../shared/constants.js';
import { ARCHITECTURE_PLACEMENTS, RADAR_NODE_SPECS, SAFE_HOUSE_REGISTRY, TIER2_DISTRICTS, VERTICAL_HAZARD_SPECS } from '../shared/content/worldSystemsRegistry.js';
import { decodeTier2, encodeTier2, TIER2_PACKET, type Tier2Snapshot } from '../shared/protocol/tier2Protocol.js';
import { decodeWorldSnapshot, type ClientInputPacket, type Vec3 } from '../shared/protocol/binaryProtocol.js';
import { CrackupAuthoritativeServer } from '../server/gameServer.js';
import { verifyTier2Objectives } from './tier2-objectives.js';
import { verifyTier2Integration } from './tier2-integration.js';

const started = performance.now(), passed: string[] = [];
const pass = (s: string) => { passed.push(s); console.log(`PASS: ${s}`); };
const close = (a: number, b: number, epsilon = 1e-4) => assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);
await initRapierPhysics();
const sim = new SharedPhysicsWorld(), tier = sim.tier2;
const agent = sim.createAgent(1, 'TIER2-QA', { x: 0, y: 0, z: 0 }, undefined, { ...DEFAULT_ATTRIBUTES });
const teleport = (p: Vec3) => { agent.position = { ...p }; agent.velocity = { x: 0, y: 0, z: 0 }; agent.collider.setEnabled(true); sim.syncAgentKinematicTransform(agent); sim.world.propagateModifiedBodyPositionsToColliders(); sim.world.updateSceneQueries(); };
const input = (buttons: number): ClientInputPacket => ({ seq: 1, dt: DT, moveX: 0, moveZ: 0, yaw: 0, pitch: 0, buttons });
try {
  assert.equal(SAFE_HOUSE_REGISTRY.length, 8);
  assert.ok(Object.isFrozen(VERTICAL_HAZARD_SPECS[0].center));
  for (const d of TIER2_DISTRICTS) assert.equal(SAFE_HOUSE_REGISTRY.filter(h => h.district === d.district).length, 2);
  for (const h of VERTICAL_HAZARD_SPECS.filter(h => h.kind === 'THERMAL_UPDRAFT' || h.kind === 'CANYON_CROSSWIND')) {
    teleport(h.center); agent.grounded = false;
    tier.applyHazards(agent, true, DT); close(agent.velocity.x, h.impulse.x); close(agent.velocity.y, h.impulse.y); close(agent.velocity.z, h.impulse.z);
    tier.applyHazards(agent, true, DT); close(agent.velocity.x, h.impulse.x); close(agent.velocity.y, h.impulse.y);
    teleport({ ...h.center, y: h.center.y + h.halfExtents.y + 3 }); tier.applyHazards(agent, true, DT); close(agent.velocity.x, 0); close(agent.velocity.y, 0);
  }
  const thermal = VERTICAL_HAZARD_SPECS.find(h => h.kind === 'THERMAL_UPDRAFT')!;
  teleport(thermal.center); tier.applyHazards(agent, false, DT); close(agent.velocity.y, 0);
  const vent = VERTICAL_HAZARD_SPECS.find(h => h.kind === 'TIMED_LOUVER')!;
  teleport(vent.center); const hp = agent.hp; tier.elapsed = 0; tier.applyHazards(agent, false, 1); close(agent.hp, hp - 40);
  tier.elapsed = 1.5; tier.applyHazards(agent, false, 1); close(agent.hp, hp - 40); tier.elapsed = 6; tier.applyHazards(agent, false, 1); close(agent.hp, hp - 80); agent.hp = agent.maxHp;
  pass('immutable district registry, exact 3D entry impulses, wingsuit gate, louver cycle and altitude exclusion');

  tier.airspace.spawn(1);
  const craft = tier.airspace.aircraft.get(1001)!;
  const flyTick = () => { tier.airspace.step(DT, tier.elapsed, sim.agents); sim.world.step(); tier.elapsed += DT; };
  for (const [index, district] of TIER2_DISTRICTS.entries()) {
    const p = { x: Math.sign(district.x) * 450, y: district.ceiling + 15, z: Math.sign(district.z) * 450 };
    craft.body.setTranslation(p, true); craft.body.setLinvel({ x: 0, y: 0, z: 0 }, true); craft.state.pilotId = agent.entityId; agent.mountedVehicleId = craft.state.id;
    craft.state.stallSec = craft.state.lockSec = craft.state.flareSec = craft.state.flareCooldownSec = 0; agent.lastDriveButtons = 0;
    for (let i = 0; i < 179; i++) flyTick(); assert.equal(craft.state.stallSec, 0); assert.ok(craft.state.lockSec > 2.9);
    flyTick(); close(craft.state.stallSec, 2.5); const velocity = craft.body.linvel().y; flyTick(); assert.ok(craft.body.linvel().y < velocity - 0.2, 'EMP removes gravity-compensating rotor lift');
    for (let i = 0; i < 149; i++) flyTick(); close(craft.state.stallSec, 0);
    const radar = RADAR_NODE_SPECS[index]; agent.grounded = false;
    assert.equal(tier.airspace.damageRadar(radar.id, 120, agent), 0, 'Aircraft cannot disable radar');
    agent.mountedVehicleId = 0; assert.equal(tier.airspace.damageRadar(radar.id, 120, agent), 0, 'Airborne attacker cannot disable radar');
    agent.grounded = true; assert.equal(tier.airspace.damageRadar(radar.id, 120, agent), 120);
    agent.mountedVehicleId = craft.state.id; craft.body.setTranslation(p, true); craft.state.stallSec = craft.state.lockSec = 0;
    for (let i = 0; i < 181; i++) flyTick(); assert.equal(craft.state.stallSec, 0); assert.equal(craft.state.lockSec, 0);
  }
  const node = tier.airspace.radar.get(200)!; node.hp = 120; node.collider.setEnabled(true);
  craft.body.setTranslation({ x: -450, y: 100, z: 450 }, true); craft.state.lockSec = 2.99;
  agent.attributes.flying = 3; agent.lastDriveButtons = INPUT_FLAG_DASH; flyTick(); assert.ok(craft.state.stallSec > 0, 'Lv 3 cannot flare');
  craft.state.stallSec = craft.state.lockSec = 0; agent.lastDriveButtons = 0; flyTick();
  agent.attributes.flying = 4; agent.lastDriveButtons = INPUT_FLAG_DASH; flyTick(); assert.ok(craft.state.flareSec > 0); assert.equal(craft.state.lockSec, 0);
  tier.airspace.liberated.add(DistrictId.NEON_DOCKS); craft.state.flareSec = 0;
  for (let i = 0; i < 181; i++) flyTick(); assert.equal(craft.state.lockSec, 0); tier.airspace.liberated.clear();
  pass('all four SAM ceilings: 3-second warning, 2.5-second physical lift stall, grounded radar destruction, liberation and Lv 4 flares');

  const radarHealth = [...tier.airspace.radar.values()].map(n => n.hp);
  for (const n of tier.airspace.radar.values()) n.hp = 120;
  const deniedAt = (position: Vec3) => {
    craft.body.setTranslation(position, true); craft.state.lockSec = craft.state.stallSec = craft.state.flareSec = 0;
    agent.lastDriveButtons = 0; tier.airspace.step(DT, 0, sim.agents); return craft.state.lockSec > 0;
  };
  for (const volume of VERTICAL_HAZARD_SPECS.filter(h => h.kind === 'SAM_CEILING')) {
    assert.ok(volume.extendsUpward); close(volume.periodSec, volume.phaseSec + volume.activeSec);
    assert.equal(deniedAt({ ...volume.center, y: volume.center.y - 0.01 }), false);
    assert.equal(deniedAt(volume.center), false);
    assert.equal(deniedAt({ ...volume.center, y: volume.center.y + 0.01 }), true);
    assert.equal(deniedAt({ ...volume.center, y: 2500 }), true, 'No artificial high-altitude escape cap');
    assert.equal(deniedAt({ x: Math.sign(volume.center.x) * 600.1, y: 2500, z: volume.center.z }), false);
  }
  assert.equal(deniedAt({ x: -0.01, y: 80, z: 300 }), true);
  assert.equal(deniedAt({ x: 0, y: 80, z: 300 }), false, 'District boundary uses the owning district ceiling');
  [...tier.airspace.radar.values()].forEach((n, i) => { n.hp = radarHealth[i]; });
  pass('Registry-driven Rapier SAM queries agree at all ceiling/footprint/district boundaries and above 2,000m');

  const canyon = VERTICAL_HAZARD_SPECS.find(h => h.kind === 'CANYON_CROSSWIND')!;
  const turbulence = (level: number) => {
    craft.body.setTranslation(canyon.center, true); craft.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true); craft.body.setLinvel({ x: 0, y: 0, z: 0 }, true); craft.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    sim.world.propagateModifiedBodyPositionsToColliders();
    agent.attributes.flying = level; agent.lastDriveButtons = 0; tier.airspace.step(DT, 2, sim.agents);
    return { x: craft.body.linvel().x, torque: craft.body.angvel().z };
  };
  const novice = turbulence(1), expert = turbulence(5); assert.ok(Math.abs(novice.x) > 0); close(novice.x, expert.x * 5); close(novice.torque, expert.torque * 5);
  agent.mountedVehicleId = 0; craft.state.pilotId = 0; craft.body.setEnabled(false); craft.state.active = false;
  pass('Rapier canyon overlap applies deterministic torque and drift scaled by 1 / Flying level');

  const wall = tier.architecture.get(10)!;
  teleport({ x: wall.spec.center.x, y: 32, z: wall.spec.center.z + 2 }); agent.grounded = true;
  assert.equal(tier.damageArchitecture(10, 1000, 'charged_melee', agent), 0);
  agent.attributes.strength = 3; assert.equal(tier.damageArchitecture(10, 1000, 'bullet', agent), 0);
  for (let i = 0; i < 46; i++) tier.processAttack(agent, input(INPUT_FLAG_MELEE), DT);
  assert.ok(wall.state.broken); assert.equal(wall.collider.isEnabled(), false);
  tier.step(180, sim.agents); assert.ok(wall.state.broken, 'nearby player delays regeneration');
  teleport({ ...wall.spec.center, y: wall.spec.center.y + 81 }); tier.step(DT, sim.agents); assert.equal(wall.state.broken, false, '3D distance permits regeneration'); assert.equal(wall.state.hp, 250); assert.ok(wall.collider.isEnabled());
  teleport({ x: wall.spec.center.x, y: 32, z: wall.spec.center.z + 2 }); agent.attributes.explosives = 1; agent.prevButtons = 0;
  tier.processAttack(agent, input(INPUT_FLAG_AIM | INPUT_FLAG_FIRE), DT); assert.equal(wall.state.broken, false);
  agent.attributes.explosives = 3; tier.processAttack(agent, input(INPUT_FLAG_AIM | INPUT_FLAG_FIRE), DT); assert.ok(wall.state.broken); assert.equal(tier.charges.get(agent.entityId), 2);
  const wall2 = tier.architecture.get(11)!; const p = wall2.spec.center;
  assert.equal(sim.vehiclePropManager.thrownArchitectureHit!(agent, { x: p.x, y: p.y, z: p.z + 4 }, { x: 0, y: 0, z: -5 }, { x: 0.5, y: 0.5, z: 0.5 }, 300), true); assert.ok(wall2.state.broken);
  const inputWall = tier.architecture.get(12)!;
  teleport({ x: inputWall.spec.center.x, y: 32, z: inputWall.spec.center.z + 2 }); agent.grounded = true; agent.prevButtons = 0;
  tier.processAttack(agent, input(0), DT);
  for (let i = 0; i < 55; i++) { sim.applyAgentInput(agent, input(INPUT_FLAG_MELEE)); sim.stepWorld(); }
  assert.ok(inputWall.state.broken, 'ordinary held player input breaches wall from its actual platform');
  pass('real attack rays and swept thrown props: Lv 1 rejection, Lv 3 charged melee/shaped charges, ammo, delayed 180s regeneration');

  const prop = tier.architecture.get(30)!;
  teleport({ x: prop.spec.anchor.x, y: prop.spec.anchor.y - 1.55, z: prop.spec.anchor.z + 7 });
  const target = sim.combatManager.spawnEnemy(64001, 'CRUSH-TARGET', { x: prop.spec.center.x, y: 0, z: prop.spec.center.z }, false, { maxHp: 1000, maxArmor: 0, disableAutoRespawn: true });
  const outside = sim.combatManager.spawnEnemy(64002, 'OUTSIDE-CRUSH', { x: prop.spec.center.x + 12, y: 0, z: prop.spec.center.z }, false, { maxHp: 1000, maxArmor: 0, disableAutoRespawn: true });
  sim.world.updateSceneQueries();
  for (let i = 0; i < 4 && !prop.state.broken; i++) sim.combatManager.resolveWeaponShot(agent, 0, 0, EnemyLimbId.TORSO);
  assert.ok(prop.state.broken, 'actual gunfire breaks anchor'); assert.equal(prop.body.bodyType(), RAPIER.RigidBodyType.Dynamic); close(prop.body.mass(), 1200, 0.01);
  const initialY = prop.body.translation().y, events = [] as typeof sim.pendingCombatEvents;
  for (let i = 0; i < 180 && !prop.state.impacted; i++) { sim.world.step(); tier.afterPhysics(sim.agents, events); }
  assert.ok(prop.body.translation().y < initialY - 5); assert.ok(prop.state.impacted, 'physical contact fires crush'); close(target.hp, 550); close(outside.hp, 1000);
  for (let i = 0; i < 60; i++) { sim.world.step(); tier.afterPhysics(sim.agents, events); } close(target.hp, 550, 0.001);
  assert.equal(events.filter(e => e.targetEnemyId === target.enemyId).length, 1);
  teleport({ ...prop.body.translation() }); tier.step(180, sim.agents); assert.ok(prop.state.broken);
  teleport({ x: 0, y: 500, z: 0 }); const bodyCount = sim.world.bodies.len(); tier.step(DT, sim.agents); assert.equal(prop.state.broken, false); assert.equal(prop.body.bodyType(), RAPIER.RigidBodyType.Fixed); close(prop.body.translation().y, initialY); assert.equal(sim.world.bodies.len(), bodyCount);
  pass('gunfire releases a 1,200kg body; actual contact applies exactly one 450HP / 5m crush; regeneration reuses bodies');

  const house = SAFE_HOUSE_REGISTRY[0]; teleport(house.center); agent.mountedVehicleId = 0;
  tier.step(DT, sim.agents); assert.equal(tier.unlockedHouses.has(house.id), false);
  for (const e of sim.combatManager.enemies.values()) if (Math.hypot(e.position.x - house.center.x, e.position.y - house.center.y, e.position.z - house.center.z) < 65) { e.hp = 0; e.combatState = EnemyCombatState.DEAD; }
  tier.step(DT, sim.agents); assert.ok(tier.unlockedHouses.has(house.id)); assert.ok(tier.interact(agent)); assert.equal(tier.charges.get(1), 3); assert.ok(sim.vehiclePropManager.vehicles.has(900));
  tier.stability[house.district] = 70; tier.skirmishes[0].cooldown = 0; tier.step(DT, sim.agents); assert.equal(tier.skirmishes[0].active, true); assert.equal(tier.skirmishes[0].kindIndex, 0);
  tier.step(91, sim.agents); assert.equal(tier.skirmishes[0].active, false);
  tier.stability[house.district] = 40; tier.skirmishes[0].cooldown = 0; tier.step(DT, sim.agents); assert.equal(tier.skirmishes[0].active, false);
  tier.stability[house.district] = 39.9999; tier.step(DT, sim.agents); assert.ok(tier.skirmishes[0].active); assert.ok(tier.skirmishes[0].kindIndex >= 2); assert.ok(sim.combatManager.enemies.has(63000));
  pass('physical local clear checks unlock facilities; stability boundaries activate real skirmish actors and bounded task lifetimes');

  // Exercise E / Space through the same shared input dispatch used by live clients.
  tier.airspace.spawn(1); const pad = SAFE_HOUSE_REGISTRY[1];
  craft.body.setTranslation(pad.spawn, true); craft.body.setLinvel({ x: 0, y: 0, z: 0 }, true); craft.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  teleport({ ...pad.spawn, x: pad.spawn.x + 3 }); agent.prevButtons = 0; agent.hp = agent.maxHp;
  sim.applyAgentInput(agent, input(INPUT_FLAG_VEHICLE_INTERACT)); assert.equal(agent.mountedVehicleId, craft.state.id);
  const startY = craft.body.translation().y;
  for (let i = 0; i < 60; i++) { sim.applyAgentInput(agent, input(INPUT_FLAG_JUMP)); sim.stepWorld(); }
  assert.ok(craft.body.translation().y > startY + 5, 'piloted rigidbody climbs under real rotor force');
  sim.applyAgentInput(agent, input(INPUT_FLAG_VEHICLE_INTERACT)); sim.stepWorld(); assert.equal(agent.mountedVehicleId, 0); assert.ok(agent.collider.isEnabled());
  pass('ordinary shared player input mounts, climbs and exits a colliding VTOL; pilot capsule restored');

  const packet = tier.snapshot(123), buffer = encodeTier2(packet), decoded = decodeTier2(buffer)!;
  assert.ok(decoded); assert.equal(decoded.serverTick, 123); assert.equal(decodeWorldSnapshot(buffer), null);
  assert.equal(decodeTier2(buffer.slice(0, -1)), null);
  const bad = buffer.slice(0); new DataView(bad).setFloat32(20 + 4, NaN, true); assert.equal(decodeTier2(bad), null);
  const wrongVersion = buffer.slice(0); new DataView(wrongVersion).setUint8(1, 255); assert.equal(decodeTier2(wrongVersion), null);
  const client = new SharedPhysicsWorld();
  try {
    client.tier2.authoritative = false; client.tier2.applySnapshot(decoded, client.agents);
    assert.equal(client.tier2.architecture.get(10)!.state.generation, wall.state.generation);
    assert.equal(client.tier2.airspace.radar.get(201)!.hp, 0);
    assert.deepEqual([...client.tier2.unlockedHouses], decoded.houses);
    assert.equal(client.tier2.damageArchitecture(10, 999, 'shaped_charge', agent), 0);
  } finally { client.world.free(); }
  pass('versioned binary snapshot, strict malformed-packet rejection, replica collider/radar/facility reconciliation');
} finally { sim.world.free(); }
for (const check of verifyTier2Objectives()) pass(check);
for (const check of verifyTier2Integration()) pass(check);

const server = new CrackupAuthoritativeServer({ port: 0, dbPath: ':memory:' }), sockets: WebSocket[] = [];
const peers: { id: number; packet: Tier2Snapshot | null; errors: string[] }[] = [];
const waitFor = async (test: () => boolean) => { const start = performance.now(); while (!test() && performance.now() - start < 5000) await new Promise(r => setTimeout(r, 15)); assert.ok(test(), 'live snapshot arrived'); };
try {
  const port = await server.start();
  for (let i = 0; i < 2; i++) {
    const peer = { id: 0, packet: null as Tier2Snapshot | null, errors: [] as string[] }; peers.push(peer);
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`); sockets.push(ws);
    ws.on('message', (data, binary) => {
      if (!binary) { const m = JSON.parse(data.toString()); if (m.type === 'AUTH_OK') peer.id = m.entityId; if (m.type === 'CONTROL_ERROR') peer.errors.push(m.error); return; }
      const b = data as Buffer;
      if (b[0] === TIER2_PACKET) peer.packet = decodeTier2(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
    });
    await once(ws, 'open'); ws.send(JSON.stringify({ type: 'AUTH', callsign: `TIER2-LIVE-${i}`, pin: '5791' })); await waitFor(() => peer.id > 0 && !!peer.packet);
  }
  const agent = server.physicsWorld.agents.get(peers[0].id)!; agent.attributes.strength = 3;
  server.physicsWorld.tier2.damageArchitecture(10, 250, 'charged_melee', agent);
  await waitFor(() => peers.every(p => p.packet?.architecture.find(a => a.id === 10)?.broken === true));
  assert.ok(peers.every(p => p.packet!.radar.length === 4 && p.packet!.aircraft.length === 4));
  pass('two authenticated WebSocket peers receive authoritative destruction and airspace state');

  const sim = server.physicsWorld, house = SAFE_HOUSE_REGISTRY[0], originalChassis = agent.augmentChassis;
  const requestSwap = () => sockets[0].send(JSON.stringify({ type: 'SELECT_CHASSIS', augmentChassis: AugmentChassisId.AERO_VALKYRIE, unlockedHouses: [0], position: house.center }));
  requestSwap(); await waitFor(() => peers[0].errors.length === 1); assert.equal(agent.augmentChassis, originalChassis);
  agent.spawnProtectionSec = 999; agent.position = { ...house.center }; sim.syncAgentKinematicTransform(agent); sim.world.propagateModifiedBodyPositionsToColliders(); sim.world.updateSceneQueries();
  requestSwap(); await waitFor(() => peers[0].errors.length === 2); assert.equal(agent.augmentChassis, originalChassis);
  sim.combatManager.removeEnemy(62000); sim.combatManager.removeEnemy(62001);
  await waitFor(() => sim.tier2.unlockedHouses.has(0)); requestSwap(); await waitFor(() => agent.augmentChassis === AugmentChassisId.AERO_VALKYRIE);
  assert.equal(server.db.getAgent('TIER2-LIVE-0')!.augmentChassis, AugmentChassisId.AERO_VALKYRIE);
  agent.position = { x: house.center.x + 25, y: 0.25, z: house.center.z }; sim.syncAgentKinematicTransform(agent); sim.world.propagateModifiedBodyPositionsToColliders(); sim.world.updateSceneQueries();
  sockets[0].send(JSON.stringify({ type: 'SELECT_CHASSIS', augmentChassis: originalChassis })); await waitFor(() => peers[0].errors.length === 3);
  assert.equal(agent.augmentChassis, AugmentChassisId.AERO_VALKYRIE);
  pass('Live chassis commands reject forged location/unlock claims and locked/outside sites; cleared-site swap persists');

  const skirmish = sim.tier2.skirmishes[0]; skirmish.cooldown = 0; skirmish.sequence = 0;
  sim.tier2.skirmishSystem.step(DT, sim.agents, { ...sim.tier2.stability, NEON_DOCKS: 39 });
  await waitFor(() => peers.every(p => p.packet!.skirmishes[0].active && p.packet!.skirmishes[0].kindIndex === 2));
  assert.ok(peers.every(p => p.packet!.skirmishes[0].maxObjectiveHp === 600 && p.packet!.skirmishes[0].outcome === 1));
  sockets[0].send(JSON.stringify({ type: 'TIER2_SNAPSHOT', skirmishes: [{ ...skirmish, objectiveHp: 0, outcome: 2 }] }));
  const tick = peers[0].packet!.serverTick; await waitFor(() => peers[0].packet!.serverTick > tick + 4);
  assert.equal(skirmish.objectiveHp, 600); assert.equal(skirmish.outcome, 1);
  pass('Two peers receive versioned objective health/stage/outcome; forged event completion is ignored');
} finally { for (const ws of sockets) ws.terminate(); await server.stop(); server.physicsWorld?.world.free(); }
mkdirSync('artifacts/evidence', { recursive: true });
writeFileSync('artifacts/evidence/tier2-verification.json', JSON.stringify({ passed: true, durationSec: (performance.now() - started) / 1000, checks: passed }, null, 2) + '\n');
console.log(`Tier 2 verification passed (${passed.length} groups).`);
