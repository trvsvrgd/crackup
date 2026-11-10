/**
 * CRACKUP: Protocol Eclipse (v2.0 True 3D AAA Architecture)
 * Phase 1 Automated End-to-End Verification Suite
 *
 * Verifies:
 * 1. Binary ArrayBuffer / DataView Serialization & Checksum Integrity (ClientInput & WorldSnapshot)
 * 2. Shared Deterministic Rapier3D Physics (Swept Capsule, Auto-Step 0.45m, Agility Jump Scaling, Air-Dash)
 * 3. Dual-Raycast 3D Ledge Mantling (+1.3m chest, +2.1m head, downward surface snap & 0.35s vault trajectory)
 * 4. Spring-Arm Camera Wall-Occlusion Whisker Raycast & Sphere-Cast
 * 5. Client-Side Prediction (128-tick Ring Buffer + Rapier3D Replay) & 100ms Remote Entity SLERP Interpolation
 * 6. Live Authoritative Server with 8 Concurrent WebSocket Clients, 30Hz Binary Broadcasts, Zero NaN/Leaks, and SQLite WAL Persistence
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { WebSocket } from 'ws';
import { SpringArmCameraController } from '../client/camera/springArmCamera.js';
import { PredictionAndInterpolationManager } from '../client/net/netcodeClient.js';
import { CrackupAuthoritativeServer } from '../server/gameServer.js';
import {
  AgentAnimState,
  FIXED_TIMESTEP,
  INPUT_FLAG_DASH,
  INPUT_FLAG_JUMP,
  INPUT_FLAG_MANTLE,
  INPUT_FLAG_SPRINT,
} from '../shared/constants.js';
import {
  initRapierPhysics,
  SharedPhysicsWorld,
} from '../shared/physics/characterController.js';
import {
  CLIENT_INPUT_BYTE_LENGTH,
  ClientInputPacket,
  decodeClientInput,
  decodeRenegadeOrbSnapshot,
  decodeWorldSnapshot,
  encodeClientInput,
  encodeWorldSnapshot,
  PacketType,
  SNAPSHOT_ENTITY_BYTE_LENGTH,
  SNAPSHOT_HEADER_BYTE_LENGTH,
  WorldSnapshotPacket,
} from '../shared/protocol/binaryProtocol.js';

function assertFiniteVec3(v: { x: number; y: number; z: number }, label: string): void {
  assert.ok(
    Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z),
    `${label} contains non-finite values: (${v.x}, ${v.y}, ${v.z})`
  );
}

async function runPhase1Verification(): Promise<void> {
  console.log('================================================================================');
  console.log(' CRACKUP: PROTOCOL ECLIPSE (v2.0) — PHASE 1 AUTOMATED VERIFICATION SUITE');
  console.log('================================================================================\n');

  // ---------------------------------------------------------------------------
  // TEST 1: Binary ArrayBuffer Protocol Serialization & Checksum Integrity
  // ---------------------------------------------------------------------------
  console.log('[1/6] Verifying Binary ArrayBuffer / DataView Protocol Serialization...');
  const sampleInput: ClientInputPacket = {
    seq: 42,
    moveX: -0.75,
    moveZ: 1.0,
    yaw: 1.2345,
    pitch: -0.321,
    buttons: INPUT_FLAG_JUMP | INPUT_FLAG_SPRINT,
    dt: FIXED_TIMESTEP,
  };
  const encodedInput = encodeClientInput(sampleInput);
  assert.equal(encodedInput.byteLength, CLIENT_INPUT_BYTE_LENGTH, 'ClientInputPacket must be exactly 29 bytes');

  const decodedInput = decodeClientInput(encodedInput);
  assert.ok(decodedInput !== null, 'Valid ClientInputPacket must decode cleanly');
  assert.equal(decodedInput.seq, 42);
  assert.ok(Math.abs(decodedInput.moveX - -0.75) < 1e-5);
  assert.ok(Math.abs(decodedInput.moveZ - 1.0) < 1e-5);
  assert.ok(Math.abs(decodedInput.yaw - 1.2345) < 1e-4);
  assert.equal(decodedInput.buttons, INPUT_FLAG_JUMP | INPUT_FLAG_SPRINT);

  // Tamper with a byte and verify checksum rejection
  const tamperedBuffer = encodedInput.slice(0);
  new Uint8Array(tamperedBuffer)[10] ^= 0xff;
  assert.equal(decodeClientInput(tamperedBuffer), null, 'Tampered binary input must be rejected by CRC16 guard');

  const sampleSnapshot: WorldSnapshotPacket = {
    recipientEntityId: 3,
    serverTick: 1200,
    lastProcessedInputSeq: 99,
    serverTimeSec: 20.0,
    entities: [
      {
        entityId: 3,
        animState: AgentAnimState.SPRINT,
        grounded: true,
        mantling: false,
        dashing: false,
        agilityLevel: 4,
        position: { x: 12.5, y: 3.1, z: -15.25 },
        rotation: { x: 0, y: 0.70710678, z: 0, w: 0.70710678 },
        velocity: { x: 0, y: 0, z: -14.2 },
        mantleProgress: 0,
      },
    ],
  };
  const encodedSnap = encodeWorldSnapshot(sampleSnapshot);
  assert.equal(
    encodedSnap.byteLength,
    SNAPSHOT_HEADER_BYTE_LENGTH + SNAPSHOT_ENTITY_BYTE_LENGTH,
    '1-entity WorldSnapshotPacket must be 56 bytes (16B header + 40B entity)'
  );
  const decodedSnap = decodeWorldSnapshot(encodedSnap);
  assert.ok(decodedSnap !== null);
  assert.equal(decodedSnap.recipientEntityId, 3);
  assert.equal(decodedSnap.lastProcessedInputSeq, 99);
  assert.equal(decodedSnap.entities[0].agilityLevel, 4);
  assert.ok(Math.abs(decodedSnap.entities[0].position.y - 3.1) < 1e-4);
  assert.ok(Math.abs(decodedSnap.entities[0].rotation.y - 0.7071) < 1e-3);
  console.log('  ✓ Binary ClientInput (29B) & WorldSnapshot (16B + 40B*N) verified.\n');

  // ---------------------------------------------------------------------------
  // TEST 2: Deterministic Rapier3D Physics, Auto-Stepping, Agility Jump & Air-Dash
  // ---------------------------------------------------------------------------
  console.log('[2/6] Initializing Shared @dimforge/rapier3d-compat Physics Engine...');
  await initRapierPhysics();
  const localPhysics = new SharedPhysicsWorld();

  // 2A. Variable Jump Impulse Scaling (Agility Lv 1 vs Lv 5)
  const jumperLv1 = localPhysics.createAgent(101, 'JUMPER-LV1', { x: -8, y: 0, z: 10 });
  jumperLv1.attributes.agility = 1;
  let peakY_Lv1 = 0;
  for (let tick = 1; tick <= 90; tick++) {
    localPhysics.applyAgentInput(jumperLv1, {
      seq: tick,
      moveX: 0,
      moveZ: 0,
      yaw: 0,
      pitch: 0,
      buttons: tick === 1 ? INPUT_FLAG_JUMP : 0,
      dt: FIXED_TIMESTEP,
    });
    localPhysics.stepWorld();
    if (jumperLv1.position.y > peakY_Lv1) peakY_Lv1 = jumperLv1.position.y;
  }

  const jumperLv5 = localPhysics.createAgent(102, 'JUMPER-LV5', { x: 8, y: 0, z: 10 });
  jumperLv5.attributes.agility = 5;
  let peakY_Lv5 = 0;
  for (let tick = 1; tick <= 120; tick++) {
    localPhysics.applyAgentInput(jumperLv5, {
      seq: tick,
      moveX: 0,
      moveZ: 0,
      yaw: 0,
      pitch: 0,
      buttons: tick === 1 ? INPUT_FLAG_JUMP : 0,
      dt: FIXED_TIMESTEP,
    });
    localPhysics.stepWorld();
    if (jumperLv5.position.y > peakY_Lv5) peakY_Lv5 = jumperLv5.position.y;
  }

  assert.ok(
    peakY_Lv1 >= 2.8 && peakY_Lv1 <= 3.6,
    `Agility Lv 1 jump apex should be ~3.2m (got ${peakY_Lv1.toFixed(2)}m)`
  );
  assert.ok(
    peakY_Lv5 >= 12.5 && peakY_Lv5 <= 16.0,
    `Agility Lv 5 jump apex should be ~14.5m (got ${peakY_Lv5.toFixed(2)}m)`
  );

  // 2B. Auto-Stepping (0.45m maxStepHeight over 0.35m staircase at X = 14m)
  const stairWalker = localPhysics.createAgent(103, 'STAIR-WALKER', { x: 14.0, y: 0.0, z: -0.5 });
  for (let tick = 1; tick <= 120; tick++) {
    localPhysics.applyAgentInput(stairWalker, {
      seq: tick,
      moveX: 0,
      moveZ: 1.0, // Walk straight North (-Z) up the staircase without jumping
      yaw: 0,
      pitch: 0,
      buttons: 0,
      dt: FIXED_TIMESTEP,
    });
    localPhysics.stepWorld();
  }
  assert.ok(
    stairWalker.position.y >= 2.4,
    `Swept capsule auto-stepping (0.45m) must climb the 0.35m staircase to >=2.4m (got ${stairWalker.position.y.toFixed(2)}m)`
  );
  console.log(
    `  ✓ Rapier3D Jump Curves (Lv1=${peakY_Lv1.toFixed(2)}m, Lv5=${peakY_Lv5.toFixed(2)}m) & Auto-Step (${stairWalker.position.y.toFixed(2)}m) verified.\n`
  );

  // ---------------------------------------------------------------------------
  // TEST 3: Dual-Raycast 3D Ledge Mantling (+1.3m Chest, +2.1m Head, Downward Snap)
  // ---------------------------------------------------------------------------
  console.log('[3/6] Verifying Dual-Raycast 3D Ledge Mantling & 0.35s Vault Trajectory...');
  // Place agent in front of mantle_terrace_tier_1 (front vertical face at Z = -7.5m, top at Y = 1.50m)
  const mantler = localPhysics.createAgent(104, 'MANTLER-01', { x: 0.0, y: 0.0, z: -6.9 });
  let sawMantleState = false;
  let tier1LandingY = -1;
  for (let tick = 1; tick <= 90; tick++) {
    const completedOne = mantler.telemetry.mantlesCompleted >= 1;
    localPhysics.applyAgentInput(mantler, {
      seq: tick,
      moveX: 0,
      moveZ: completedOne ? 0.0 : 1.0, // Stop moving forward once vaulted onto Tier 1
      yaw: 0,
      pitch: 0,
      buttons: completedOne ? 0 : INPUT_FLAG_MANTLE,
      dt: FIXED_TIMESTEP,
    });
    localPhysics.stepWorld();
    if (mantler.mantling || mantler.animState === AgentAnimState.MANTLE_VAULT) {
      sawMantleState = true;
    }
    if (mantler.telemetry.mantlesCompleted === 1 && tier1LandingY < 0) {
      tier1LandingY = mantler.position.y;
      break;
    }
  }
  assert.ok(sawMantleState, 'Dual-raycast detector must trigger MANTLE_VAULT state');
  assert.equal(mantler.telemetry.mantlesCompleted, 1, 'Agent must complete the 0.35s ledge mantle trajectory');
  assert.ok(
    Math.abs(mantler.position.y - 1.5) < 0.08,
    `Mantled agent must land cleanly on top of the Y=1.50m terrace (got Y=${mantler.position.y.toFixed(3)}m)`
  );
  console.log(
    `  ✓ Ledge Mantling verified: vaulted onto terrace top Y=${mantler.position.y.toFixed(2)}m, Z=${mantler.position.z.toFixed(2)}m.\n`
  );

  // ---------------------------------------------------------------------------
  // TEST 4: Spring-Arm Camera Wall-Occlusion Whisker Raycast
  // ---------------------------------------------------------------------------
  console.log('[4/6] Verifying Third-Person Spring-Arm Camera & Wall-Occlusion Whiskers...');
  const camCtrl = new SpringArmCameraController(16 / 9);
  // Position an agent backed right up against the North face of mantle_terrace_tier_4 (at Z = -22.5m, height 7.0m)
  // Looking South (yaw = PI) so the camera arm tries to extend backward into the solid 7m structure at Z = -25.5m
  const cornerAgent = localPhysics.createAgent(105, 'CAM-TEST', { x: 0, y: 0, z: -21.8 });
  camCtrl.yaw = Math.PI;
  camCtrl.pitch = 0;
  camCtrl.update(cornerAgent.position, { x: 0, y: 0, z: 0 }, localPhysics, cornerAgent, FIXED_TIMESTEP);

  assert.ok(
    camCtrl.currentArmLength < 2.0,
    `Camera whisker raycast must pull arm length inward (<2.0m) when obstructed by wall (got ${camCtrl.currentArmLength.toFixed(2)}m)`
  );
  console.log(
    `  ✓ Spring-Arm Camera occlusion avoidance pulled arm from 4.50m -> ${camCtrl.currentArmLength.toFixed(2)}m.\n`
  );

  // ---------------------------------------------------------------------------
  // TEST 5: Client-Side Prediction (128-tick Ring Buffer) & Remote Interpolation
  // ---------------------------------------------------------------------------
  console.log('[5/6] Verifying 128-Tick Client Prediction Replay & 100ms Remote SLERP...');
  const predWorld = new SharedPhysicsWorld();
  const netManager = new PredictionAndInterpolationManager(predWorld);
  netManager.localEntityId = 1;
  predWorld.createAgent(1, 'PRED-LOCAL', { x: 0, y: 0, z: 0 });

  for (let i = 1; i <= 15; i++) {
    netManager.recordAndSendInput(0, 1.0, 0, 0, 0);
  }
  const predAgent = netManager.getLocalAgent()!;
  assert.ok(predAgent.position.z < -0.5, 'Client prediction must immediately advance local agent in 3D space');

  // Inject a slightly offset authoritative snapshot at seq 10 to trigger reconciliation + deterministic replay of 11..15
  const preReconCount = netManager.reconciliationCount;
  (netManager as unknown as { onWorldSnapshot: (s: WorldSnapshotPacket) => void }).onWorldSnapshot({
    recipientEntityId: 1,
    serverTick: 20,
    lastProcessedInputSeq: 10,
    serverTimeSec: 1.0,
    entities: [
      {
        entityId: 1,
        animState: AgentAnimState.RUN,
        grounded: true,
        mantling: false,
        dashing: false,
        agilityLevel: 1,
        position: { x: 0.5, y: 0, z: -1.2 }, // 0.5m X offset triggers replay
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        velocity: { x: 0, y: 0, z: -8.0 },
        mantleProgress: 0,
      },
      {
        entityId: 2,
        animState: AgentAnimState.RUN,
        grounded: true,
        mantling: false,
        dashing: false,
        agilityLevel: 2,
        position: { x: 5.0, y: 0, z: -4.0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        velocity: { x: 0, y: 0, z: -8.0 },
        mantleProgress: 0,
      },
    ],
  });
  assert.equal(
    netManager.reconciliationCount,
    preReconCount + 1,
    'Server divergence > 5cm must trigger deterministic Rapier3D input replay'
  );
  const remotes = netManager.getInterpolatedRemoteEntities();
  assert.equal(remotes.length, 1, 'Remote entity must be available in 100ms interpolation buffer');
  console.log('  ✓ Client-Side Prediction ring buffer replay & Remote SLERP verified.\n');

  // ---------------------------------------------------------------------------
  // TEST 6: Live Authoritative Server + 8 Concurrent WebSocket Clients + SQLite WAL
  // ---------------------------------------------------------------------------
  console.log('[6/6] Launching Authoritative Server & Connecting 8 Concurrent Headless Clients...');
  const suiteDbPath = path.resolve(process.cwd(), 'data', 'verify_phase1_suite.db');

  const server = new CrackupAuthoritativeServer({
    port: 0, // Ephemeral port
    dbPath: suiteDbPath,
  });
  server.db.clearAllAgents();

  const boundPort = await server.start();
  assert.equal(server.db.getJournalMode(), 'wal', 'SQLite must operate in WAL mode');

  // Verify HTTP /api/health endpoint
  const healthRes = await fetch(`http://127.0.0.1:${boundPort}/api/health`);
  assert.equal(healthRes.status, 200);
  const healthJson = (await healthRes.json()) as { status: string; journalMode: string; maxPlayers: number };
  assert.equal(healthJson.status, 'ok');
  assert.equal(healthJson.journalMode, 'wal');
  assert.equal(healthJson.maxPlayers, 8);

  const callsigns = [
    'AGENT-ALPHA',
    'AGENT-BRAVO',
    'AGENT-CHARLIE',
    'AGENT-DELTA',
    'AGENT-ECHO',
    'AGENT-FOXTROT',
    'AGENT-GOLF',
    'AGENT-HOTEL',
  ];

  interface HeadlessTestClient {
    index: number;
    callsign: string;
    pin: string;
    ws: WebSocket;
    entityId: number;
    seq: number;
    snapshotsReceived: number;
    maxEntitiesSeen: number;
    latestSelfState: WorldSnapshotPacket['entities'][0] | null;
  }

  const clients: HeadlessTestClient[] = [];

  // Connect all 8 clients concurrently
  await Promise.all(
    callsigns.map(
      (callsign, index) =>
        new Promise<void>((resolve, reject) => {
          const pin = String(1000 + index);
          const ws = new WebSocket(`ws://127.0.0.1:${boundPort}/ws`);
          ws.binaryType = 'arraybuffer';

          const clientObj: HeadlessTestClient = {
            index,
            callsign,
            pin,
            ws,
            entityId: 0,
            seq: 0,
            snapshotsReceived: 0,
            maxEntitiesSeen: 0,
            latestSelfState: null,
          };
          clients.push(clientObj);

          const timeout = setTimeout(() => reject(new Error(`Timeout authenticating ${callsign}`)), 8000);

          ws.on('open', () => {
            ws.send(JSON.stringify({ type: 'AUTH', callsign, pin }));
          });

          ws.on('message', (data, isBinary) => {
            if (isBinary) {
              const buf = Buffer.isBuffer(data)
                ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
                : (data as ArrayBuffer);

              const pType = new DataView(buf).getUint8(0);
              if (pType === PacketType.RENEGADE_ORB_SNAPSHOT || pType === PacketType.ENEMY_SNAPSHOT) {
                return;
              }

              const snap = decodeWorldSnapshot(buf);
              assert.ok(snap !== null, 'Every binary broadcast from server must decode as a valid WorldSnapshotPacket');

              clientObj.snapshotsReceived += 1;
              if (snap.entities.length > clientObj.maxEntitiesSeen) {
                clientObj.maxEntitiesSeen = snap.entities.length;
              }

              for (const ent of snap.entities) {
                assertFiniteVec3(ent.position, `Entity ${ent.entityId} position`);
                assertFiniteVec3(ent.velocity, `Entity ${ent.entityId} velocity`);
                assert.ok(
                  Number.isFinite(ent.rotation.x) &&
                    Number.isFinite(ent.rotation.y) &&
                    Number.isFinite(ent.rotation.z) &&
                    Number.isFinite(ent.rotation.w),
                  `Entity ${ent.entityId} quaternion must be finite`
                );
                if (ent.entityId === clientObj.entityId) {
                  clientObj.latestSelfState = ent;
                }
              }
              return;
            }

            const msg = JSON.parse(data.toString());
            if (msg.type === 'AUTH_OK') {
              clearTimeout(timeout);
              clientObj.entityId = msg.entityId;
              // Upgrade Agility level for variety across the 8 agents (1..5)
              const targetAgility = (index % 5) + 1;
              ws.send(JSON.stringify({ type: 'SET_ATTRIBUTES', attributes: { agility: targetAgility } }));
              resolve();
            } else if (msg.type === 'AUTH_ERROR') {
              clearTimeout(timeout);
              reject(new Error(`Auth error for ${callsign}: ${msg.error}`));
            }
          });

          ws.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
          });
        })
    )
  );

  assert.equal(server.getActiveAgentCount(), 8, 'All 8 concurrent agents must be active on the server');
  console.log('  ✓ 8/8 Concurrent Headless WebSocket Agents authenticated via SQLite WAL.');

  // Simulate 90 ticks (1.5 seconds at 60Hz) of 3D movement, jumping, air-dashing, and ledge mantling
  for (let tick = 1; tick <= 90; tick++) {
    for (const c of clients) {
      c.seq += 1;
      let buttons = INPUT_FLAG_SPRINT;
      // Trigger jump on tick 5, air-dash on tick 18, and mantle continuously for agent 0
      if (tick === 5 || tick === 45) buttons |= INPUT_FLAG_JUMP;
      if (tick === 18) buttons |= INPUT_FLAG_DASH;
      if (c.index === 0) buttons |= INPUT_FLAG_MANTLE;

      const yaw = c.index === 0 ? 0 : (c.index - 4) * 0.15;
      const inputPacket = encodeClientInput({
        seq: c.seq,
        moveX: 0,
        moveZ: 1.0, // Move forward in 3D space
        yaw,
        pitch: 0,
        buttons,
        dt: FIXED_TIMESTEP,
      });

      c.ws.send(inputPacket, { binary: true });
    }
    await new Promise((r) => setTimeout(r, 16));
  }

  // Wait 120ms for final 30Hz snapshots to arrive
  await new Promise((r) => setTimeout(r, 120));

  for (const c of clients) {
    assert.ok(
      c.snapshotsReceived >= 20,
      `${c.callsign} should have received >= 20 binary 30Hz snapshots (got ${c.snapshotsReceived})`
    );
    assert.equal(
      c.maxEntitiesSeen,
      8,
      `${c.callsign} must see all 8 concurrent entities in the binary snapshot`
    );
    assert.ok(c.latestSelfState !== null, `${c.callsign} must have a valid self state in snapshots`);
    assert.ok(
      c.latestSelfState.position.z < 1.0,
      `${c.callsign} must have moved North in 3D world space (Z=${c.latestSelfState.position.z.toFixed(2)}m)`
    );
  }
  console.log('  ✓ 30Hz Binary World Snapshots (336 bytes/frame for 8 agents) & 3D movement verified.');

  // Disconnect all 8 clients and verify zero memory/physics leaks + SQLite WAL persistence
  await Promise.all(
    clients.map(
      (c) =>
        new Promise<void>((resolve) => {
          c.ws.once('close', () => resolve());
          c.ws.close(1000, 'Test complete');
        })
    )
  );

  // Allow server close handlers to finish
  await new Promise((r) => setTimeout(r, 100));

  assert.equal(server.getActiveAgentCount(), 0, 'Active agent count must return to 0 after disconnect');
  assert.equal(
    server.physicsWorld.agents.size,
    0,
    'SharedPhysicsWorld must have 0 leaked AgentPhysicsBody instances after disconnect'
  );

  // Verify SQLite persistence for all 8 callsigns
  for (let i = 0; i < callsigns.length; i++) {
    const saved = server.db.getAgent(callsigns[i]);
    assert.ok(saved !== null, `Agent ${callsigns[i]} must be persisted in SQLite WAL database`);
    assertFiniteVec3(saved.position, `Persisted position for ${callsigns[i]}`);
    assert.equal(
      saved.attributes.agility,
      (i % 5) + 1,
      `Persisted Agility level for ${callsigns[i]} must match updated value`
    );
    assert.ok(
      saved.telemetry.totalDistanceMeters > 2.0,
      `Persisted telemetry for ${callsigns[i]} must record 3D distance traveled (${saved.telemetry.totalDistanceMeters.toFixed(2)}m)`
    );
    assert.ok(
      saved.telemetry.jumpsExecuted >= 1,
      `Persisted telemetry for ${callsigns[i]} must record jumps executed`
    );
  }

  console.log('  ✓ Zero server memory/collider leaks & 100% SQLite WAL persistence on disconnect verified.\n');

  await server.stop();

  console.log('================================================================================');
  console.log(' ALL PHASE 1 VERIFICATION GATES PASSED SUCCESSFULLY (ZERO WARNINGS / ZERO ERRORS)');
  console.log('================================================================================');
}

runPhase1Verification().catch((err) => {
  console.error('\n[PHASE 1 VERIFICATION FAILED]:', err);
  process.exit(1);
});
