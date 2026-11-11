/** Phase 6 behavior, persistence, protocol and live authoritative WebSocket verification. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { AgentDatabase } from '../server/db.js';
import { CrackupAuthoritativeServer } from '../server/gameServer.js';
import {
  CyberPetSpecies, DreadnoughtPartId, DreadnoughtPhase, FIXED_TIMESTEP, INPUT_FLAG_FIRE,
  PET_DERBY_LAPS, PetArenaState, PetMode, SKYBOX_ARENA_BASE_Y,
} from '../shared/constants.js';
import { eulerToQuat, initRapierPhysics, RAPIER, SharedPhysicsWorld, type AgentPhysicsBody } from '../shared/physics/characterController.js';
import {
  decodePhase6Snapshot, encodePhase6Snapshot, PacketType, type Phase6SnapshotPacket, type Vec3,
} from '../shared/protocol/binaryProtocol.js';
import {
  buildSkyboxPetArenaStructures, CLASH_ARENA_CENTER, CyberPetArenaManager,
  DERBY_TRACK_NODES, type Phase6EventNotification,
} from '../shared/world/cyberPetArena.js';
import { ApexDreadnoughtDirector } from '../shared/world/dreadnoughtBoss.js';

const dt = FIXED_TIMESTEP;
const near = (actual: number, expected: number, tolerance = 0.001) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
function floor(world: RAPIER.World): void {
  world.createCollider(RAPIER.ColliderDesc.cuboid(1000, 1, 1000).setTranslation(0, -1, 0));
}
function skybox(world: RAPIER.World): void {
  for (const s of buildSkyboxPetArenaStructures()) {
    const desc = RAPIER.ColliderDesc.cuboid(s.halfExtents.x, s.halfExtents.y, s.halfExtents.z)
      .setTranslation(s.center.x, s.center.y, s.center.z);
    if (s.rotation) desc.setRotation(eulerToQuat(s.rotation.x, s.rotation.y, s.rotation.z));
    world.createCollider(desc);
  }
  world.step();
}
function aim(agent: AgentPhysicsBody, target: Vec3): { yaw: number; pitch: number } {
  const dx = target.x - agent.position.x, dy = target.y - agent.position.y - 1.55, dz = target.z - agent.position.z;
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}

async function run(): Promise<void> {
  await initRapierPhysics();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crackup-phase6-'));
  const shared = new SharedPhysicsWorld();
  const a = shared.createAgent(1, 'PHASE6-FOX', { x: 0, y: 0, z: 0 });
  const b = shared.createAgent(2, 'PHASE6-BEETLE', { x: 3, y: 0, z: 0 });
  const agents = new Map([[a.entityId, a], [b.entityId, b]]);
  const teleport = (agent: AgentPhysicsBody, pos: Vec3) => { agent.position = { ...pos }; };
  let winningStats = { species: CyberPetSpecies.NEON_FOX, name: 'Photon', derbyWins: 0, clashWins: 0 };
  try {
    console.log('[1/7] Companion boids, static whiskers, hover and leash');
    const world = new RAPIER.World({ x: 0, y: -24, z: 0 });
    try {
      floor(world);
      const events: Phase6EventNotification[] = [];
      const manager = new CyberPetArenaManager(world, events, teleport);
      const fox = manager.adoptPet(a, CyberPetSpecies.NEON_FOX, { name: 'Photon' });
      const drone = manager.adoptPet(b, CyberPetSpecies.AERO_RAVEN_DRONE);
      fox.position = { x: 10, y: 0, z: 0 };
      world.step();
      for (let i = 0; i < 180; i++) manager.step(agents);
      assert.ok(Math.hypot(fox.position.x - a.position.x, fox.position.z - a.position.z) < 6, 'Companion must seek owner');
      assert.ok(drone.position.y > b.position.y + 1, 'Raven must hover');
      assert.ok([fox.position.x, fox.position.y, drone.position.y].every(Number.isFinite));
      // Compare the identical pet state with and without a fixed wall on its desired heading.
      fox.position = { x: 0, y: 0, z: 0 }; fox.velocity = { x: 0, y: 0, z: 0 }; fox.orbitPhase = -dt * 0.9;
      drone.position = { x: 20, y: 2, z: 20 };
      manager.step(agents);
      const clearVelocity = fox.velocity.x;
      const wall = world.createCollider(RAPIER.ColliderDesc.cuboid(0.2, 2, 3).setTranslation(1, 2, 0));
      world.step();
      fox.position = { x: 0, y: 0, z: 0 }; fox.velocity = { x: 0, y: 0, z: 0 }; fox.orbitPhase = -dt * 0.9;
      manager.step(agents);
      assert.ok(fox.velocity.x < clearVelocity, 'Static obstacle whiskers must change steering away from wall');
      world.removeCollider(wall, true);
      fox.position = { x: 0, y: 0, z: 0 }; fox.velocity = { x: 0, y: 0, z: 0 }; fox.orbitPhase = -dt * 0.9;
      drone.position = { x: 0.3, y: 0, z: 0 }; drone.velocity = { x: 0, y: 0, z: 0 };
      world.step(); manager.step(agents);
      assert.ok(fox.velocity.x < clearVelocity, 'Neighbor separation must affect steering');
      fox.position.x = 100;
      manager.step(agents);
      assert.ok(Math.hypot(fox.position.x - a.position.x, fox.position.z - a.position.z) < 4, 'Leash must return runaway pet');
    } finally { world.free(); }

    console.log('[2/7] Physical two-lap derby, finish ordering, fall penalty and owner return');
    const raceWorld = new RAPIER.World({ x: 0, y: -24, z: 0 });
    try {
      skybox(raceWorld);
      const manager = new CyberPetArenaManager(raceWorld, [], teleport);
      a.position = { x: 0, y: 0, z: 0 }; b.position = { x: 3, y: 0, z: 0 };
      const fox = manager.adoptPet(a, CyberPetSpecies.NEON_FOX, { name: 'Photon' });
      const beetle = manager.adoptPet(b, CyberPetSpecies.TITAN_BEETLE);
      assert.ok(manager.joinDerby(a).ok && manager.joinDerby(b).ok);
      assert.equal(a.position.y, SKYBOX_ARENA_BASE_Y + 0.05);
      assert.equal(manager.joinClash(a).ok, false, 'Cannot join two arenas');
      for (let i = 0; i < 900 && manager.derby.state !== PetArenaState.ACTIVE; i++) manager.step(agents);
      assert.equal(manager.derby.state, PetArenaState.ACTIVE);
      // Exercise recovery independently, then restore the undamaged starting grid for a physical race.
      const start = { ...beetle.position };
      beetle.position.y = SKYBOX_ARENA_BASE_Y - 20;
      manager.step(agents);
      assert.ok(beetle.derbyStallTimer > 1 && beetle.position.y >= SKYBOX_ARENA_BASE_Y);
      beetle.position = start; beetle.velocity = { x: 0, y: 0, z: 0 }; beetle.derbyStallTimer = 0;
      for (let i = 0; i < 9200 && manager.derby.state === PetArenaState.ACTIVE; i++) manager.step(agents);
      assert.equal(manager.derby.state, PetArenaState.RESULTS);
      assert.ok(fox.derbyFinished && beetle.derbyFinished, `Both pets must finish physically: fox lap ${fox.derbyLap}, beetle lap ${beetle.derbyLap}`);
      assert.equal(fox.derbyLap, PET_DERBY_LAPS); assert.equal(beetle.derbyLap, PET_DERBY_LAPS);
      assert.equal(fox.derbyPlace, 1); assert.equal(beetle.derbyPlace, 2);
      assert.ok(fox.derbyFinishTimeSec < beetle.derbyFinishTimeSec);
      assert.equal(fox.derbyWins, 1); assert.equal(a.telemetry.petDerbyWins, 1);
      winningStats = manager.getPersistedStats(a.entityId)!;
      for (let i = 0; i < 610; i++) manager.step(agents);
      assert.equal(fox.mode, PetMode.FOLLOW); near(a.position.y, 0);
      assert.equal(manager.agentReturnPositions.size, 0);
    } finally { raceWorld.free(); }

    console.log('[3/7] Clash damage, escalating knockback, ring-out and single victory award');
    const clashWorld = new RAPIER.World({ x: 0, y: -24, z: 0 });
    try {
      skybox(clashWorld);
      const manager = new CyberPetArenaManager(clashWorld, [], teleport);
      const beetle = manager.adoptPet(a, CyberPetSpecies.TITAN_BEETLE);
      const fox = manager.adoptPet(b, CyberPetSpecies.NEON_FOX);
      assert.ok(manager.joinClash(a).ok && manager.joinClash(b).ok);
      for (let i = 0; i < 700 && manager.clash.state !== PetArenaState.ACTIVE; i++) manager.step(agents);
      assert.equal(manager.clash.state, PetArenaState.ACTIVE);
      const prepareStrike = (hp: number) => {
        beetle.position = { ...CLASH_ARENA_CENTER }; beetle.velocity = { x: 0, y: 0, z: 0 }; beetle.clashAttackCooldown = 0;
        fox.position = { x: CLASH_ARENA_CENTER.x + 1.5, y: CLASH_ARENA_CENTER.y, z: CLASH_ARENA_CENTER.z };
        fox.velocity = { x: 0, y: 0, z: 0 }; fox.hp = hp; fox.clashAttackCooldown = 10;
      };
      prepareStrike(fox.maxHp); manager.step(agents);
      const freshKnockback = fox.velocity.x;
      assert.ok(fox.hp < fox.maxHp && freshKnockback > 0 && fox.velocity.y > 0);
      prepareStrike(fox.maxHp * 0.5); manager.step(agents);
      assert.ok(fox.velocity.x > freshKnockback, 'Damage must increase knockback');
      fox.position = { x: CLASH_ARENA_CENTER.x + 25, y: SKYBOX_ARENA_BASE_Y - 7, z: CLASH_ARENA_CENTER.z };
      manager.step(agents);
      assert.ok(fox.clashEliminated); assert.equal(manager.clash.state, PetArenaState.RESULTS);
      assert.equal(manager.clash.winnerPetId, beetle.petId); assert.equal(beetle.clashWins, 1);
      for (let i = 0; i < 490; i++) manager.step(agents);
      assert.equal(beetle.clashWins, 1); assert.equal(beetle.mode, PetMode.FOLLOW); near(a.position.y, 0);
      winningStats.clashWins = beetle.clashWins;
    } finally { clashWorld.free(); }

    console.log('[4/7] Boss colliders, cover, phase gates, flak, lance and raid rewards');
    const bossWorld = new RAPIER.World({ x: 0, y: 0, z: 0 });
    try {
      const events: Phase6EventNotification[] = [];
      let adds = 0;
      const boss = new ApexDreadnoughtDirector(bossWorld, events, () => adds++);
      assert.equal(boss.parts.size, 7);
      assert.ok([...boss.parts.values()].every((p) => !p.collider.isEnabled()));
      boss.step(agents); assert.equal(boss.phase, DreadnoughtPhase.DORMANT);
      boss.step(agents, dt, true); assert.equal(boss.phase, DreadnoughtPhase.PHASE_1_SHIELDED);
      assert.equal(boss.deploy(), false);
      near(Math.hypot(boss.position.x + 90, boss.position.z + 90), 70); near(boss.position.y, 150);
      const engine = DreadnoughtPartId.ENGINE_FL;
      let target = boss.getPartWorldPosition(engine);
      a.hp = a.maxHp; b.hp = b.maxHp;
      a.position = { x: target.x + 25, y: target.y - 1.55, z: target.z };
      b.position = { x: 500, y: 0, z: 500 };
      bossWorld.step();
      const wall = bossWorld.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 3, 3)
        .setTranslation(target.x + 12, target.y, target.z));
      bossWorld.step();
      assert.equal(boss.resolveWeaponShot(a, aim(a, target).yaw, aim(a, target).pitch), false, 'Cover must block boss damage');
      assert.equal(boss.parts.get(engine)!.hp, 500);
      bossWorld.removeCollider(wall, true); bossWorld.step();
      assert.equal(boss.resolveWeaponShot(a, aim(a, target).yaw, aim(a, target).pitch), true);
      assert.ok(boss.parts.get(engine)!.hp < 500);
      assert.equal(boss.damagePart(a, DreadnoughtPartId.CORE_REACTOR, 5000), 0);
      assert.equal(boss.damagePart(a, engine, Number.NaN), 0);
      for (const id of [1, 2, 3]) boss.damagePart(a, id, 500);
      assert.equal(boss.phase, DreadnoughtPhase.PHASE_1_SHIELDED);
      boss.damagePart(b, 4, 500);
      assert.equal(boss.phase, DreadnoughtPhase.PHASE_2_CORE_EXPOSED); assert.equal(adds, 1);
      assert.ok([1, 2, 3, 4].every((id) => !boss.parts.get(id)!.collider.isEnabled()));
      assert.equal(boss.parts.get(5)!.hp, 350, 'Optional turrets are not needed to break shield');
      boss.damagePart(a, 0, 1080); assert.equal(boss.phase, DreadnoughtPhase.PHASE_2_CORE_EXPOSED, '40% exactly is not enraged');
      boss.damagePart(a, 0, 1); assert.equal(boss.phase, DreadnoughtPhase.PHASE_3_ENRAGED);
      // Follow an unobstructed target below the orbit to observe a complete charged lance cycle.
      let charged = false, fired = false;
      for (let i = 0; i < 400; i++) {
        a.hp = a.maxHp;
        a.position = { x: boss.position.x, y: boss.position.y - 30, z: boss.position.z };
        boss.step(agents); bossWorld.step();
        charged ||= boss.lanceChargeSec > 0; fired ||= boss.lanceActiveSec > 0;
      }
      assert.ok(charged && fired); assert.ok(boss.position.y < 150, 'Boss must descend after shield loss');
      // Disable optional flak and check a locked beam still damages targets independently.
      boss.damagePart(a, 5, 1000); boss.damagePart(a, 6, 1000);
      boss.lanceChargeSec = 0; boss.lanceActiveSec = 1;
      boss.lanceTarget = { ...a.position, y: a.position.y + 1 };
      const hp = a.hp;
      boss.step(agents);
      // Sweep can miss the target during part of the cycle, so sample a short interval.
      let lanceDamaged = a.hp < hp;
      for (let i = 0; i < 70; i++) { boss.step(agents); lanceDamaged ||= a.hp < hp; }
      assert.ok(lanceDamaged, 'Eclipse Lance must deal damage');
      a.hp = a.maxHp;
      const dealt = boss.damagePart(a, 0, 9999);
      assert.equal(dealt, 719); assert.equal(boss.phase, DreadnoughtPhase.DEFEATED);
      assert.equal(a.telemetry.dreadnoughtRaidsCompleted, 1); assert.equal(b.telemetry.dreadnoughtRaidsCompleted, 1);
      assert.equal(boss.damagePart(a, 0, 10), 0);
      assert.equal(events.filter((e) => e.type === 'DREADNOUGHT_DEFEATED').length, 1);
      assert.ok([...boss.parts.values()].every((p) => !p.collider.isEnabled()));
      boss.step(agents, 300); assert.equal(boss.phase, DreadnoughtPhase.DORMANT);
      boss.step(agents, dt, true); assert.equal(boss.parts.get(0)!.hp, 1800);
      // With both flak emplacements active, low HP crosses zero exactly once.
      a.hp = 1; a.position = { x: boss.position.x, y: boss.position.y - 30, z: boss.position.z };
      const oldDowns = a.telemetry.agentDowns || 0;
      for (let i = 0; i < 200; i++) { boss.step(agents); bossWorld.step(); }
      assert.equal(a.hp, 0); assert.equal(a.telemetry.agentDowns, oldDowns + 1);
    } finally { bossWorld.free(); }

    console.log('[5/7] SQLite WAL, upgrade migration, pet and telemetry reopen');
    const dbPath = path.join(tempDir, 'migration.db');
    let db = new AgentDatabase(dbPath);
    try {
      const auth = db.authenticateOrCreate('PHASE6-PERSIST', '1234'); assert.ok(auth.ok);
      auth.record.telemetry = { ...a.telemetry };
      auth.record.collectedOrbs = [1, 2]; auth.record.unlockedSkills = ['legacy-skill'];
      db.saveAgent(auth.record);
      // Recreate the Phase 5 schema by dropping only the new column before reopening.
      db.db.exec('ALTER TABLE agents DROP COLUMN pet_json');
    } finally { db.close(); }
    db = new AgentDatabase(dbPath);
    try {
      assert.equal(db.getJournalMode(), 'wal');
      const migrated = db.getAgent('PHASE6-PERSIST')!;
      assert.equal(migrated.pet, null); assert.deepEqual(migrated.collectedOrbs, [1, 2]);
      migrated.pet = winningStats; db.saveAgent(migrated);
    } finally { db.close(); }
    db = new AgentDatabase(dbPath);
    try {
      const saved = db.getAgent('PHASE6-PERSIST')!;
      assert.deepEqual(saved.pet, winningStats);
      assert.equal(saved.telemetry.dreadnoughtRaidsCompleted, 1);
      assert.ok(saved.telemetry.dreadnoughtDamageDealt! >= 3300);
      assert.equal(saved.telemetry.agentDowns, a.telemetry.agentDowns);
      assert.deepEqual(saved.unlockedSkills, ['legacy-skill']);
      db.db.prepare('UPDATE agents SET pet_json = ?').run('{bad json');
      assert.equal(db.getAgent('PHASE6-PERSIST')!.pet, null);
    } finally { db.close(); }

    console.log('[6/7] Packet 0x07 round trip, offsets and malformed packet rejection');
    const petManager = shared.cyberPetArenaManager;
    a.hp = a.maxHp; b.hp = b.maxHp; a.position = { x: 0, y: 0, z: 0 }; b.position = { x: 3, y: 0, z: 0 };
    petManager.adoptPet(a, CyberPetSpecies.NEON_FOX); petManager.adoptPet(b, CyberPetSpecies.TITAN_BEETLE);
    assert.ok(petManager.joinDerby(a).ok); assert.ok(petManager.joinClash(b).ok);
    const packet = encodePhase6Snapshot(0xf1234567, petManager.toBinaryPetStates(), petManager.toBinaryArenaHeader(),
      petManager.toBinaryDerbyRacers(), petManager.toBinaryClashFighters(), shared.dreadnoughtDirector.toBinarySnapshot());
    assert.equal(new Uint8Array(packet)[0], PacketType.PHASE6_SNAPSHOT);
    const decoded = decodePhase6Snapshot(packet)!;
    assert.ok(decoded); assert.equal(decoded.serverTick, 0xf1234567);
    assert.equal(decoded.pets.length, 2); assert.equal(decoded.racers.length, 1); assert.equal(decoded.fighters.length, 1);
    near(decoded.pets[0]!.position.y, SKYBOX_ARENA_BASE_Y + 0.05);
    const expectedBoss = shared.dreadnoughtDirector.toBinarySnapshot();
    assert.deepEqual(decoded.dreadnought, { ...expectedBoss, yaw: Math.fround(expectedBoss.yaw) });
    const wrapped = Buffer.concat([Buffer.alloc(13), Buffer.from(packet), Buffer.alloc(7)]);
    assert.deepEqual(decodePhase6Snapshot(wrapped.buffer, wrapped.byteOffset + 13, packet.byteLength), decoded);
    for (let i = 0; i < packet.byteLength; i++) assert.equal(decodePhase6Snapshot(packet.slice(0, i)), null);
    assert.equal(decodePhase6Snapshot(packet, -1), null); assert.equal(decodePhase6Snapshot(packet, 0, packet.byteLength + 1), null);
    assert.equal(decodePhase6Snapshot(packet, 0, Number.NaN), null);
    for (const [offset, value] of [[0, 6], [1, 2], [2, 9], [5, 6], [72, 99]] as const) {
      const corrupt = packet.slice(0); new DataView(corrupt).setUint8(offset, value);
      assert.equal(decodePhase6Snapshot(corrupt), null, `Invalid byte at ${offset} must be rejected`);
    }
    const nanPacket = packet.slice(0); new DataView(nanPacket).setFloat32(32, Number.NaN, true);
    assert.equal(decodePhase6Snapshot(nanPacket), null);
    assert.ok(shared.structures.some((s) => s.id === 'skybox_clash_arena_platform'));
    shared.removeAgent(a.entityId); shared.removeAgent(b.entityId);
    assert.equal(petManager.pets.size, 0); assert.equal(petManager.agentReturnPositions.size, 0);

    console.log('[7/7] Live control validation, 30Hz snapshots, disconnect cleanup and reconnect');
    await verifyServer(path.join(tempDir, 'server.db'));
    console.log('ALL 7/7 PHASE 6 VERIFICATION SUITES PASSED.');
  } finally {
    shared.world.free();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function verifyServer(dbPath: string): Promise<void> {
  const server = new CrackupAuthoritativeServer({ port: 0, dbPath });
  const sockets: WebSocket[] = [];
  try {
    const port = await server.start();
    const connect = async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      sockets.push(ws);
      const messages: any[] = [];
      const snapshots: Phase6SnapshotPacket[] = [];
      ws.on('message', (data, binary) => {
        if (binary) {
          const bytes = data as Buffer;
          if (bytes[0] === 7) {
            const snapshot = decodePhase6Snapshot(bytes.buffer, bytes.byteOffset, bytes.byteLength);
            assert.ok(snapshot, 'Live 0x07 packets must decode'); snapshots.push(snapshot);
          }
        } else messages.push(JSON.parse(data.toString()));
      });
      await once(ws, 'open');
      const waitFor = async (predicate: () => boolean, label: string) => {
        const deadline = Date.now() + 5000;
        while (!predicate()) {
          assert.ok(Date.now() < deadline, `Timed out: ${label}`);
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      };
      const control = async (type: string, extra = {}) => {
        const index = messages.length;
        ws.send(JSON.stringify({ type, ...extra }));
        await waitFor(() => messages.slice(index).some((m) => m.type === 'PHASE6_CONTROL_RESULT' && m.requestType === type), type);
        return messages.slice(index).find((m) => m.type === 'PHASE6_CONTROL_RESULT' && m.requestType === type);
      };
      ws.send(JSON.stringify({ type: 'AUTH', callsign: 'PHASE6-LIVE', pin: '1234' }));
      await waitFor(() => messages.some((m) => m.type === 'AUTH_OK'), 'authentication');
      return { ws, messages, snapshots, waitFor, control, auth: messages.find((m) => m.type === 'AUTH_OK') };
    };
    const first = await connect();
    assert.equal((await first.control('PET_DERBY_JOIN')).ok, false);
    assert.equal((await first.control('PET_ADOPT', { species: 99 })).ok, false);
    assert.equal((await first.control('PET_ADOPT', { species: CyberPetSpecies.GRID_HOUND, name: 'Circuit' })).ok, true);
    assert.equal((await first.control('PET_DERBY_JOIN')).ok, true);
    assert.equal((await first.control('PET_ADOPT', { species: 0 })).ok, false);
    assert.equal((await first.control('PET_CLASH_JOIN')).ok, false);
    assert.equal((await first.control('PET_DERBY_LEAVE')).ok, true);
    assert.equal((await first.control('PET_CLASH_JOIN')).ok, true);
    assert.equal((await first.control('PET_CLASH_LEAVE')).ok, true);
    const pet = server.physicsWorld.cyberPetArenaManager.getPetForOwner(first.auth.entityId)!;
    pet.derbyWins = 2; pet.clashWins = 3;
    assert.equal((await first.control('PET_DERBY_JOIN')).ok, true);
    const startCount = first.snapshots.length;
    await first.waitFor(() => first.snapshots.length >= startCount + 6, 'six 30Hz snapshots');
    const frames = first.snapshots.slice(startCount, startCount + 6);
    for (let i = 1; i < frames.length; i++) assert.equal(frames[i]!.serverTick - frames[i - 1]!.serverTick, 2);
    assert.equal(frames[5]!.pets[0]!.mode, PetMode.DERBY);
    const agent = server.physicsWorld.agents.get(first.auth.entityId)!;
    // Fire through the normal authoritative controller into an unobstructed engine hitbox.
    const boss = server.physicsWorld.dreadnoughtDirector;
    boss.deploy();
    const target = boss.getPartWorldPosition(DreadnoughtPartId.ENGINE_FL);
    agent.position = { x: target.x + 25, y: target.y - 1.55, z: target.z };
    server.physicsWorld.syncAgentKinematicTransform(agent); server.physicsWorld.world.step();
    const look = aim(agent, target);
    server.physicsWorld.applyAgentInput(agent, { seq: 999, moveX: 0, moveZ: 0, ...look, buttons: INPUT_FLAG_FIRE, dt });
    assert.ok(boss.parts.get(DreadnoughtPartId.ENGINE_FL)!.hp < 500, 'Controller fire must route boss hits');
    first.ws.close(); await once(first.ws, 'close');
    await first.waitFor(() => server.getActiveAgentCount() === 0, 'disconnect cleanup');
    assert.equal(server.physicsWorld.cyberPetArenaManager.pets.size, 0);
    assert.equal(server.physicsWorld.cyberPetArenaManager.agentReturnPositions.size, 0);
    assert.ok(server.db.getAgent('PHASE6-LIVE')!.position.y < 10, 'Arena spectators must persist their return position');
    const second = await connect();
    assert.deepEqual(second.auth.record.pet, { species: CyberPetSpecies.GRID_HOUND, name: 'Circuit', derbyWins: 2, clashWins: 3 });
    assert.equal(server.physicsWorld.cyberPetArenaManager.getPetForOwner(second.auth.entityId)!.name, 'Circuit');
    second.ws.close(); await once(second.ws, 'close');
    await second.waitFor(() => server.getActiveAgentCount() === 0, 'reconnect cleanup');
  } finally {
    for (const ws of sockets) if (ws.readyState !== WebSocket.CLOSED) ws.terminate();
    await server.stop();
    server.physicsWorld?.world.free();
  }
}

run().catch((error) => { console.error('[PHASE 6 VERIFICATION FAILED]', error); process.exitCode = 1; });
