import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import * as THREE from 'three';
import { FACTION_REGISTRY, DISTRICT_LORE_REGISTRY, CITIZEN_DOORWAY_REGISTRY, RESONANCE_MEMORY_FRAGMENTS, PET_PROVENANCE_REGISTRY, RESONANCE_SPIRE_RULES, isLoreCoordinate } from '../shared/content/worldLore.js';
import { buildNeoVeridiaSector01 } from '../shared/world/neoVeridiaBlock.js';
import { CHARACTER_REGISTRY, GESTALT_ECHO_REGISTRY, PLAYABLE_GESTALTS, resolveGestaltEcho } from '../shared/content/characterRegistry.js';
import { CAMPAIGN_GRAPH, PREPARATION_REGISTRY, EQUIPMENT_REGISTRY, ENDING_REGISTRY, MICRO_ACTION_REGISTRY, DEFAULT_MICRO_TELEMETRY, DEFAULT_GRID_STABILITY, evaluateMissionGates, resolveCampaignEnding, normalizeGrid } from '../shared/content/campaignGraph.js';
import { DEFAULT_ATTRIBUTES, DistrictId, CyberPetSpecies, PetMode, getAgilityParams } from '../shared/constants.js';
import { initRapierPhysics, SharedPhysicsWorld, RAPIER } from '../shared/physics/characterController.js';
import { checkAgentOrbIntersection } from '../shared/world/orbSystem.js';
import { applySpireTraversal, resolveSpireMemory } from '../shared/world/resonanceSpire.js';
import { CyberPetArenaManager, type Phase6EventNotification } from '../shared/world/cyberPetArena.js';
import { AgentDatabase } from '../server/db.js';
import { CrackupAuthoritativeServer } from '../server/gameServer.js';
import { createResonanceSpire, animateResonanceSpire, ResonanceShatter } from '../client/entities/resonanceSpire.js';

const ids = new Set<string>();
function registry(records: readonly { readonly id: string }[]) {
  assert.ok(Object.isFrozen(records));
  for (const record of records) {
    assert.match(record.id, /^[A-Z][A-Z0-9_]*$/);
    assert.ok(!ids.has(record.id), `Duplicate ID: ${record.id}`); ids.add(record.id);
    const walk = (value: unknown) => {
      if (!value || typeof value !== 'object') return;
      assert.ok(Object.isFrozen(value), `${record.id} contains mutable data`);
      if ('x' in value && 'y' in value && 'z' in value) assert.ok(isLoreCoordinate(value), `${record.id} out of bounds`);
      for (const child of Object.values(value)) walk(child);
    };
    walk(record);
    assert.equal(Reflect.set(record, 'id', 'MUTATED'), false);
  }
}
function verifyRegistries(): void {
  // Object.values creates a new view; freeze that view before checking record immutability.
  for (const records of [Object.freeze(Object.values(FACTION_REGISTRY)), DISTRICT_LORE_REGISTRY, RESONANCE_MEMORY_FRAGMENTS, CHARACTER_REGISTRY, GESTALT_ECHO_REGISTRY, PLAYABLE_GESTALTS, CAMPAIGN_GRAPH, PREPARATION_REGISTRY, EQUIPMENT_REGISTRY, Object.freeze(Object.values(ENDING_REGISTRY)), Object.freeze(Object.values(MICRO_ACTION_REGISTRY))]) registry(records);
  for (const d of DISTRICT_LORE_REGISTRY) registry(d.ruins);
  registry(CITIZEN_DOORWAY_REGISTRY);
  const structures = buildNeoVeridiaSector01();
  for (const door of CITIZEN_DOORWAY_REGISTRY) {
    assert.ok(RESONANCE_MEMORY_FRAGMENTS.some(c => c.citizenId === door.citizenId));
    assert.ok(!structures.some(b => !b.isSensorOnly && Math.abs(b.center.x - door.approach.x) < b.halfExtents.x + 0.5 && Math.abs(b.center.z - door.approach.z) < b.halfExtents.z + 0.5 && b.center.y - b.halfExtents.y < 1 && b.center.y + b.halfExtents.y > 0.3), `${door.id} approach must have physical clearance`);
  }
  assert.equal(RESONANCE_MEMORY_FRAGMENTS.length, 30);
  assert.equal(new Set(RESONANCE_MEMORY_FRAGMENTS.map(c => c.citizenId)).size, 30);
  assert.equal(new Set(RESONANCE_MEMORY_FRAGMENTS.map(c => c.transcript)).size, 30);
  assert.equal(CHARACTER_REGISTRY.filter(c => c.role === 'KINGPIN').length, 4);
  assert.equal(CHARACTER_REGISTRY.filter(c => c.role === 'LIEUTENANT').length, 4);
  assert.equal(CHARACTER_REGISTRY.filter(c => c.role === 'PUBLIC_SERVANT').length, 4);
  assert.deepEqual([...new Set(GESTALT_ECHO_REGISTRY.map(e => e.attribute))].sort(), Object.keys(DEFAULT_ATTRIBUTES).sort());
  assert.equal(PLAYABLE_GESTALTS.length, 8);
  for (const agent of PLAYABLE_GESTALTS) assert.equal(agent.echoIds.length, 7);
  const completed = new Set<string>();
  for (const mission of CAMPAIGN_GRAPH) {
    for (const prerequisite of mission.prerequisites) assert.ok(completed.has(prerequisite), 'Graph must be acyclic and ordered');
    assert.ok(mission.prepObjectiveIds.every(id => PREPARATION_REGISTRY.some(p => p.id === id)));
    assert.ok(mission.gates.every(g => Number.isFinite(g.minimum) && g.minimum >= 0));
    completed.add(mission.id);
  }
  assert.equal(completed.size, 24);
  for (const d of DISTRICT_LORE_REGISTRY) assert.equal(CAMPAIGN_GRAPH.filter(m => m.district === d.id).length, 6);
  for (const c of CHARACTER_REGISTRY) {
    assert.ok(FACTION_REGISTRY[c.factionId]); assert.ok(c.publicBio !== c.trueBio);
    const trigger = c.twistTriggerCondition;
    if (trigger.kind === 'MISSION') assert.ok(completed.has(trigger.id));
    if (trigger.kind === 'PREPARATION') assert.ok(PREPARATION_REGISTRY.some(p => p.id === trigger.id));
  }
  assert.equal(evaluateMissionGates(CAMPAIGN_GRAPH[0]!, { ...DEFAULT_ATTRIBUTES }, {}, new Set()).allowed, true);
  assert.ok(evaluateMissionGates(CAMPAIGN_GRAPH[0]!, { ...DEFAULT_ATTRIBUTES }, {}, new Set()).warnings.length > 0);
  assert.equal(evaluateMissionGates(CAMPAIGN_GRAPH[23]!, { ...DEFAULT_ATTRIBUTES }, {}, completed).allowed, false);
  const maxAttributes = { agility: 5, strength: 5, driving: 5, shooting: 5, explosives: 5, flying: 5, vigilante: 5 };
  const equipment = Object.fromEntries(EQUIPMENT_REGISTRY.map(e => [e.id, 3]));
  assert.equal(evaluateMissionGates(CAMPAIGN_GRAPH[23]!, maxAttributes, equipment, completed).allowed, true);
  assert.equal(evaluateMissionGates(CAMPAIGN_GRAPH[0]!, { ...DEFAULT_ATTRIBUTES, agility: NaN }, {}, new Set()).allowed, false);
  assert.equal(resolveGestaltEcho({ airborne_time_ratio: 0.9, collateral_blast_damage_ratio: 0.2, limb_cripple_to_kill_ratio: 0, squad_revive_and_nonlethal_ratio: 0 })?.attribute, 'flying');
  assert.equal(resolveGestaltEcho({ airborne_time_ratio: 0, collateral_blast_damage_ratio: 0.9, limb_cripple_to_kill_ratio: 0, squad_revive_and_nonlethal_ratio: 0 })?.attribute, 'explosives');
  const manifest = JSON.parse(fs.readFileSync('public/assets/audio/lore/manifest.json', 'utf8'));
  for (const memory of RESONANCE_MEMORY_FRAGMENTS) {
    assert.equal(memory.durationMs, 2000); assert.equal(memory.unlockWhispers, 3);
    const wav = fs.readFileSync(path.join('public', memory.audioUrl));
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.readUInt32LE(40) / wav.readUInt32LE(28), 2);
    assert.ok(wav.subarray(44).some(v => v !== 0), 'Audio cannot be silent');
    assert.equal(crypto.createHash('sha256').update(wav).digest('hex'), manifest.entries.find((m: { id: string }) => m.id === memory.id).sha256);
  }
}

function verifyEndings(): void {
  const neutral = { ...DEFAULT_MICRO_TELEMETRY }, grid = normalizeGrid();
  assert.equal(resolveCampaignEnding(neutral, grid, 0), 'VANCE_COMPROMISE');
  assert.equal(resolveCampaignEnding({ ...neutral, citizensSpared: 1 }, grid, 50), 'ASCENDANT_GESTALT');
  assert.equal(resolveCampaignEnding(neutral, grid, -50), 'APEX_USURPER');
  assert.equal(resolveCampaignEnding({ ...neutral, coerciveActions: 8 }, grid, 0), 'APEX_USURPER');
  assert.equal(resolveCampaignEnding({ ...neutral, purgeActions: 3 }, grid, 0), 'VOSS_PURGE');
  assert.equal(resolveCampaignEnding(neutral, { ...grid, NEON_DOCKS: 34.99 }, 0), 'VOSS_PURGE');
  assert.equal(resolveCampaignEnding(neutral, { ...grid, NEON_DOCKS: 35 }, 0), 'VANCE_COMPROMISE');
  assert.equal(resolveCampaignEnding({ ...neutral, citizensSpared: 3 }, { ...grid, HELIOS_SPIRE: 69.99 }, 50), 'VANCE_COMPROMISE');
  assert.equal(resolveCampaignEnding({ ...neutral, citizensSpared: 3 }, { ...grid, HELIOS_SPIRE: 70 }, 50), 'ASCENDANT_GESTALT');
  assert.equal(resolveCampaignEnding({ ...neutral, citizensSpared: 3 }, grid, 49.99), 'VANCE_COMPROMISE');
  assert.equal(resolveCampaignEnding(neutral, grid, NaN), 'VANCE_COMPROMISE');
  assert.equal(resolveCampaignEnding({ ...neutral, coerciveActions: 30 }, { ...grid, NEON_DOCKS: 0 }, 90), 'APEX_USURPER', 'Domination wins explicit precedence');
  for (let i = 0; i < 100; i++) assert.equal(resolveCampaignEnding(neutral, grid, 0), 'VANCE_COMPROMISE');
}

async function verifyRuntime(temp: string): Promise<void> {
  await initRapierPhysics();
  const physics = new SharedPhysicsWorld();
  const floorWorld = new RAPIER.World({ x: 0, y: -24, z: 0 });
  try {
    const agent = physics.createAgent(1, 'LORE-AGENT', { x: 0, y: 20, z: 0 });
    agent.velocity.y = -2; agent.jetpackFuelSec = 0; agent.airDashesRemaining = 0;
    agent.attributes.agility = 5; physics.recomputeAgentBuild(agent);
    applySpireTraversal(agent);
    assert.equal(agent.velocity.y, 4.5); assert.equal(agent.grounded, false);
    assert.equal(agent.jetpackFuelSec, agent.maxJetpackFuelSec);
    assert.equal(agent.airDashesRemaining, getAgilityParams(5).maxAirDashes + agent.buildModifiers.bonusAirDashes);
    const y = agent.position.y;
    physics.applyAgentInput(agent, { seq: 1, moveX: 0, moveZ: 0, yaw: 0, pitch: 0, buttons: 0, dt: 1 / 60 });
    assert.ok(agent.position.y > y, 'Boost must actually move the capsule');
    assert.equal(checkAgentOrbIntersection({ x: 0, y: 0, z: 0 }, { x: 3, y: 0.95, z: 0 }), true);
    assert.equal(checkAgentOrbIntersection({ x: 0, y: 0, z: 0 }, { x: 3.001, y: 0.95, z: 0 }), false);
    assert.equal(resolveSpireMemory(1, 2).filtered, true);
    assert.equal(resolveSpireMemory(1, 3).transcript, RESONANCE_MEMORY_FRAGMENTS[0]!.transcript);
    assert.equal(resolveSpireMemory(1, 3).filtered, false);
    const mesh = createResonanceSpire(new THREE.MeshStandardMaterial());
    assert.equal(mesh.children.length, 4);
    assert.equal(mesh.children.filter(c => c instanceof THREE.Mesh && c.geometry.type === 'TorusGeometry').length, 2);
    animateResonanceSpire(mesh, 0.1, 0.1);
    assert.ok(mesh.children[1]!.rotation.y > 0 && mesh.children[2]!.rotation.y < 0);
    const pulse = mesh.children[0]!.scale.y;
    animateResonanceSpire(mesh, 0.1 + 60 / 72, 0);
    assert.ok(Math.abs(mesh.children[0]!.scale.y - pulse) < 1e-10);
    const scene = new THREE.Scene(), shatter = new ResonanceShatter(scene);
    shatter.collect({ x: 0, y: 20, z: 0 }, 100);
    assert.equal(shatter.hitStopUntil, 140); assert.equal(shatter.shards.length, 12);
    const shardY = shatter.shards[0]!.mesh.position.y;
    shatter.update(0.05); assert.notEqual(shatter.shards[0]!.mesh.position.y, shardY);
    for (let i = 0; i < 30; i++) shatter.update(0.05);
    assert.equal(shatter.shards.length, 0); assert.equal(scene.children.length, 0); shatter.dispose();

    for (let seed = 0; seed < 100; seed++) {
      const a = PET_PROVENANCE_REGISTRY.generate(seed), b = PET_PROVENANCE_REGISTRY.generate(seed);
      assert.deepEqual(a, b); assert.ok(isLoreCoordinate(a.dormantMemoryTriggerCoords));
      assert.ok(RESONANCE_MEMORY_FRAGMENTS.some(c => c.citizenId === a.originCitizenId));
    }
    floorWorld.createCollider(RAPIER.ColliderDesc.cuboid(1000, 1, 1000).setTranslation(0, -1, 0)); floorWorld.step();
    const notifications: Phase6EventNotification[] = [];
    const pets = new CyberPetArenaManager(floorWorld, notifications, (a, p) => { a.position = { ...p }; });
    const pet = pets.adoptPet(agent, CyberPetSpecies.NEON_FOX);
    const door = pet.dormantMemoryTriggerCoords;
    agent.position = { ...door };
    pet.position = { ...door, x: door.x + 12.01 }; pet.velocity = { x: 0, y: 0, z: 0 };
    pets.step(new Map([[agent.entityId, agent]])); assert.equal(pet.provenanceDiscovered, false);
    pet.position = { ...door, y: door.y + 12.01 }; pet.velocity = { x: 0, y: 0, z: 0 };
    pets.step(new Map([[agent.entityId, agent]])); assert.equal(pet.provenanceDiscovered, false, 'Vertical distance matters');
    pet.position = { ...door, x: door.x + 12 }; pet.velocity = { x: 0, y: 0, z: 0 };
    pets.step(new Map([[agent.entityId, agent]]));
    assert.equal(pet.mode, PetMode.FOLLOW); assert.equal(pet.provenanceDiscovered, true);
    assert.deepEqual(pet.steeringTarget, door); assert.ok(pet.velocity.x < 0, 'Pet must steer toward doorway');
    for (let i = 0; i < 20; i++) pets.step(new Map([[agent.entityId, agent]]));
    assert.equal(notifications.filter(n => n.type === 'PET_PROVENANCE_DISCOVERED').length, 1);
    const savedPet = pets.getPersistedStats(agent.entityId)!;
    pets.removePetForOwner(agent.entityId); agent.entityId = 99;
    const restored = pets.adoptPet(agent, savedPet.species, savedPet);
    assert.equal(restored.originCitizenId, savedPet.originCitizenId);
    assert.equal(restored.provenanceDiscovered, true);
    const arenaPet = pets.adoptPet(agent, CyberPetSpecies.GRID_HOUND);
    arenaPet.position = { ...arenaPet.dormantMemoryTriggerCoords };
    pets.joinDerby(agent); pets.step(new Map([[agent.entityId, agent]]));
    assert.equal(arenaPet.provenanceDiscovered, false, 'Arena mode cannot trigger provenance');

    const dbPath = path.join(temp, 'lore.db');
    let db = new AgentDatabase(dbPath);
    try {
      const auth = db.authenticateOrCreate('LORE-SAVE', '1234'); assert.ok(auth.ok);
      auth.record.pet = savedPet; db.saveAgent(auth.record);
      assert.equal(db.getJournalMode(), 'wal');
      // Emulate a pre-Tier 1 schema and pet; reopen twice to exercise idempotency.
      db.db.prepare('UPDATE agents SET pet_json = ?').run(JSON.stringify({ species: 0, name: 'Legacy', derbyWins: 2, clashWins: 1 }));
      db.db.exec('ALTER TABLE agents DROP COLUMN municipal_grid_json; ALTER TABLE agents DROP COLUMN gestalt_resonance; ALTER TABLE agents DROP COLUMN micro_action_json; DROP TABLE lore_micro_actions;');
      db.close(); db = new AgentDatabase(dbPath);
      const migrated = db.getAgent('LORE-SAVE')!; assert.ok(migrated.pet?.originCitizenId);
      assert.deepEqual(migrated.municipalGridStability, DEFAULT_GRID_STABILITY);
      const origin = migrated.pet!.originCitizenId;
      migrated.pet = savedPet;
      migrated.pendingLoreActions = [{ id: 'memory:1', kind: 'RECOVER_MEMORY', district: DistrictId.NEON_DOCKS }, { id: 'prep:1', kind: 'PRESERVE_INFRASTRUCTURE', district: DistrictId.NEON_DOCKS }];
      db.saveAgent(migrated); db.saveAgent(migrated);
      assert.equal(db.getAgent('LORE-SAVE')!.gestaltResonance, 5);
      assert.equal(db.getAgent('LORE-SAVE')!.municipalGridStability!.NEON_DOCKS, 90);
      assert.equal((db.db.prepare('SELECT count(*) AS n FROM lore_micro_actions').get() as { n: number }).n, 2);
      migrated.pendingLoreActions.push({ id: 'bad', kind: 'BAD' as never, district: DistrictId.NEON_DOCKS });
      assert.throws(() => db.saveAgent(migrated));
      assert.equal((db.db.prepare('SELECT count(*) AS n FROM lore_micro_actions').get() as { n: number }).n, 2, 'Failed action must roll back ledger');
      db.close(); db = new AgentDatabase(dbPath);
      const reopened = db.getAgent('LORE-SAVE')!;
      assert.deepEqual(reopened.pet, savedPet); assert.equal(reopened.gestaltResonance, 5);
      assert.ok(origin); assert.equal(db.getJournalMode(), 'wal');
      reopened.gestaltResonance = 500; reopened.municipalGridStability!.NEON_DOCKS = -500;
      db.saveAgent(reopened); assert.equal(db.getAgent('LORE-SAVE')!.gestaltResonance, 100);
      assert.equal(db.getAgent('LORE-SAVE')!.municipalGridStability!.NEON_DOCKS, 0);
    } finally { db.close(); }
  } finally { floorWorld.free(); physics.world.free(); }
}

async function verifyLiveCollection(temp: string): Promise<void> {
  const server = new CrackupAuthoritativeServer({ port: 0, dbPath: path.join(temp, 'live.db') });
  let ws: WebSocket | undefined;
  const waitFor = async (fn: () => boolean) => {
    const end = Date.now() + 6000;
    while (!fn()) { assert.ok(Date.now() < end, 'Live lore event timed out'); await new Promise(r => setTimeout(r, 10)); }
  };
  try {
    const seed = server.db.authenticateOrCreate('LORE-LIVE', '1234', { x: 0, y: 10, z: -32 }); assert.ok(seed.ok);
    seed.record.telemetry.whisperOrbsCollected = 2; server.db.saveAgent(seed.record);
    const port = await server.start();
    ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const messages: any[] = [];
    ws.on('message', (data, binary) => { if (!binary) messages.push(JSON.parse(data.toString())); });
    await once(ws, 'open'); ws.send(JSON.stringify({ type: 'AUTH', callsign: 'LORE-LIVE', pin: '1234' }));
    await waitFor(() => messages.some(m => m.type === 'ORB_COLLECTED'));
    const first = messages.find(m => m.type === 'ORB_COLLECTED');
    assert.equal(first.orbId, 1); assert.equal(first.resonance.filtered, true);
    assert.ok(first.traversal.velocityY >= 6); assert.ok(first.traversal.fuel > 0); assert.ok(first.traversal.dashes > 0);
    const auth = messages.find(m => m.type === 'AUTH_OK');
    const agent = server.physicsWorld.agents.get(auth.entityId)!;
    const whisper = server.orbs.find(o => o.type === 2)!;
    agent.position = { ...whisper.position, y: whisper.position.y - 0.95 }; agent.velocity = { x: 0, y: 0, z: 0 };
    agent.jetpackFuelSec = 0; agent.airDashesRemaining = 0; server.physicsWorld.syncAgentKinematicTransform(agent);
    await waitFor(() => messages.some(m => m.type === 'ORB_COLLECTED' && m.orbId === whisper.orbId));
    const unlocked = messages.find(m => m.type === 'ORB_COLLECTED' && m.orbId === whisper.orbId);
    assert.equal(unlocked.resonance.filtered, false);
    assert.equal(unlocked.resonance.transcript, resolveSpireMemory(whisper.orbId, 3).transcript);
    assert.equal(unlocked.traversal.fuel, agent.maxJetpackFuelSec);
    assert.ok(server.db.getAgent('LORE-LIVE')!.gestaltResonance! > 0);
    agent.position = { ...whisper.position, y: whisper.position.y - 0.95 }; agent.velocity = { x: 0, y: 0, z: 0 };
    server.physicsWorld.syncAgentKinematicTransform(agent); server.tickAuthoritativeSimulation();
    await new Promise(r => setTimeout(r, 40));
    assert.equal(messages.filter(m => m.type === 'ORB_COLLECTED' && m.orbId === whisper.orbId).length, 1);
    const pet = server.physicsWorld.cyberPetArenaManager.adoptPet(agent, CyberPetSpecies.NEON_FOX);
    const doorway = pet.dormantMemoryTriggerCoords;
    agent.position = { ...doorway, x: doorway.x + 4 }; agent.velocity = { x: 0, y: 0, z: 0 };
    pet.position = { ...doorway, x: doorway.x + 5 }; server.physicsWorld.syncAgentKinematicTransform(agent);
    await waitFor(() => messages.some(m => m.type === 'PHASE6_EVENT' && m.notification.type === 'PET_PROVENANCE_DISCOVERED'));
    assert.equal(server.db.getAgent('LORE-LIVE')!.pet!.originCitizenId, pet.originCitizenId);
    assert.equal(server.db.getAgent('LORE-LIVE')!.pet!.provenanceDiscovered, true);
    await waitFor(() => messages.some(m => m.type === 'PLAYER_STATE' && m.lore?.pet?.provenanceDiscovered));
    const relay = server.physicsWorld.relaySystem.plans[0]!;
    const before = server.db.getAgent('LORE-LIVE')!;
    for (let vent = 0; vent < 3; vent++) {
      const event = server.physicsWorld.relaySystem.damageVent(relay.relayId, vent, 999, relay.origin, agent.entityId);
      assert.ok(event); server.physicsWorld.pendingCombatEvents.push(event);
    }
    await waitFor(() => (server.db.getAgent('LORE-LIVE')!.microActionTelemetry?.purgeActions ?? 0) === 1);
    const after = server.db.getAgent('LORE-LIVE')!;
    assert.equal(after.municipalGridStability!.NEON_DOCKS, before.municipalGridStability!.NEON_DOCKS - 20);
    assert.equal(after.gestaltResonance, before.gestaltResonance! - 8);
    assert.equal((server.db.db.prepare("SELECT count(*) AS n FROM lore_micro_actions WHERE kind = 'PURGE_RELAY'").get() as { n: number }).n, 1);
  } finally {
    ws?.terminate(); await server.stop(); server.physicsWorld?.world.free();
  }
}

const started = Date.now(), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'crackup-tier1-lore-'));
try {
  verifyRegistries(); console.log('PASS: immutable registries, coordinates, 24-mission graph, 30 voiced memories');
  verifyEndings(); console.log('PASS: four deterministic endings, boundaries and precedence');
  await verifyRuntime(temp); console.log('PASS: capsule impulse, refill, mesh pulse, shards, pet steering, WAL migration and ledger');
  await verifyLiveCollection(temp); console.log('PASS: authoritative WebSocket collection, Act II transition and one-shot rewards');
  console.log(`Tier 1 lore verification passed in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
