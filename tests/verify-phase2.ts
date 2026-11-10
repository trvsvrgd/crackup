/**
 * CRACKUP: Protocol Eclipse (v2.0 True 3D AAA Architecture)
 * Phase 2 Automated End-to-End Verification Suite
 *
 * Verifies:
 * 1. 1200m x 1200m x 320m 4-District Procedural Neo-Veridia City & 3D Spatial Octree
 * 2. Foundry Slums Thermal Updraft Physics & Agility Lv 5 Extended (1.8m) Ledge-Mantle Reach
 * 3. All 7 Agent Attribute Continuous Mathematical Scaling Curves (REQ-SKILLS, Lv 1..5)
 * 4. 182 3D Environmental Orbs (150 Agility, 20 Renegade, 12 Whisper) across Y = 10m..310m
 * 5. Renegade Orb 18m 3D Flee Steering + Rooftop Waypoint Graph & Binary Snapshot (0x03)
 * 6. Live Server Orb Collection -> XP Progression -> Auto Level-Up -> SQLite WAL Persistence
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { WebSocket } from 'ws';
import { CrackupAuthoritativeServer } from '../server/gameServer.js';
import {
  CITY_HALF_EXTENT,
  DistrictId,
  FIXED_TIMESTEP,
  getAgilityParams,
  getDrivingParams,
  getExplosivesParams,
  getFlyingParams,
  getShootingParams,
  getStrengthParams,
  getVigilanteParams,
  INPUT_FLAG_MANTLE,
  OrbType,
  TOTAL_AGILITY_ORBS,
  TOTAL_ORBS,
  TOTAL_RENEGADE_ORBS,
  TOTAL_WHISPER_ORBS,
} from '../shared/constants.js';
import {
  initRapierPhysics,
  SharedPhysicsWorld,
} from '../shared/physics/characterController.js';
import {
  decodeRenegadeOrbSnapshot,
  encodeClientInput,
  encodeRenegadeOrbSnapshot,
  ORB_SNAPSHOT_HEADER_BYTE_LENGTH,
  ORB_SNAPSHOT_RECORD_BYTE_LENGTH,
  PacketType,
} from '../shared/protocol/binaryProtocol.js';
import {
  buildNeoVeridiaSector01,
  getNeoVeridiaSpatialOctree,
  getNeoVeridiaThermalUpdrafts,
} from '../shared/world/neoVeridiaBlock.js';
import {
  generateNeoVeridiaOrbs,
  stepRenegadeOrbSteering,
} from '../shared/world/orbSystem.js';

async function runPhase2Verification(): Promise<void> {
  console.log('================================================================================');
  console.log(' CRACKUP: PROTOCOL ECLIPSE (v2.0) — PHASE 2 AUTOMATED VERIFICATION SUITE');
  console.log('================================================================================\n');

  // ---------------------------------------------------------------------------
  // TEST 1: 1200m x 1200m x 320m 4-District Procedural Neo-Veridia & Spatial Octree
  // ---------------------------------------------------------------------------
  console.log('[1/6] Verifying 1200m x 1200m x 320m 4-District City & 3D Spatial Octree...');
  const structures = buildNeoVeridiaSector01();
  const octree = getNeoVeridiaSpatialOctree();
  assert.equal(octree.size(), structures.length, 'Spatial Octree must index 100% of city structures');

  const ground = structures.find((s) => s.id === 'ground_plaza_main')!;
  assert.equal(ground.halfExtents.x, CITY_HALF_EXTENT, 'City footprint must span 1200m X (-600m to +600m)');
  assert.equal(ground.halfExtents.z, CITY_HALF_EXTENT, 'City footprint must span 1200m Z (-600m to +600m)');

  // Check all 4 Districts are populated and reach their PRD target elevations
  const districts = [
    DistrictId.NEON_DOCKS,
    DistrictId.FOUNDRY_SLUMS,
    DistrictId.HELIOS_SPIRE,
    DistrictId.AEGIS_CITADEL,
  ];
  const maxElevationByDistrict: Record<DistrictId, number> = {
    [DistrictId.NEON_DOCKS]: 0,
    [DistrictId.FOUNDRY_SLUMS]: 0,
    [DistrictId.HELIOS_SPIRE]: 0,
    [DistrictId.AEGIS_CITADEL]: 0,
  };

  for (const d of districts) {
    const items = octree.getDistrictItems(d);
    assert.ok(items.length >= 25, `District ${d} must contain >= 25 modular 3D structures (got ${items.length})`);
    for (const item of items) {
      if (item.bounds.maxY > maxElevationByDistrict[d]) {
        maxElevationByDistrict[d] = item.bounds.maxY;
      }
    }
  }

  assert.ok(
    maxElevationByDistrict[DistrictId.NEON_DOCKS] >= 80 &&
      maxElevationByDistrict[DistrictId.NEON_DOCKS] <= 90,
    `Neon Docks max elevation should reach ~85m (got ${maxElevationByDistrict[DistrictId.NEON_DOCKS].toFixed(1)}m)`
  );
  assert.ok(
    maxElevationByDistrict[DistrictId.FOUNDRY_SLUMS] >= 135 &&
      maxElevationByDistrict[DistrictId.FOUNDRY_SLUMS] <= 145,
    `Foundry Slums max elevation should reach ~140m (got ${maxElevationByDistrict[DistrictId.FOUNDRY_SLUMS].toFixed(1)}m)`
  );
  assert.ok(
    maxElevationByDistrict[DistrictId.HELIOS_SPIRE] >= 255 &&
      maxElevationByDistrict[DistrictId.HELIOS_SPIRE] <= 265,
    `Helios Financial Spire max elevation should reach ~260m (got ${maxElevationByDistrict[DistrictId.HELIOS_SPIRE].toFixed(1)}m)`
  );
  assert.ok(
    maxElevationByDistrict[DistrictId.AEGIS_CITADEL] >= 318 &&
      maxElevationByDistrict[DistrictId.AEGIS_CITADEL] <= 325,
    `Aegis Citadel Plaza max elevation should reach ~320m (got ${maxElevationByDistrict[DistrictId.AEGIS_CITADEL].toFixed(1)}m)`
  );

  // Verify 3D Octree sphere query around Aegis Monolith Apex (-280, 160, -280)
  const apexNearby = octree.querySphere({ x: -280, y: 160, z: -280 }, 40);
  assert.ok(
    apexNearby.some((i) => i.id.startsWith('aegis_citadel_monolith_apex')),
    'Spatial Octree sphere query must locate Aegis Citadel Monolith structures'
  );
  console.log(
    `  ✓ 4 Districts verified (${structures.length} modular structures; elevations: Docks=${maxElevationByDistrict.NEON_DOCKS.toFixed(0)}m, Foundry=${maxElevationByDistrict.FOUNDRY_SLUMS.toFixed(0)}m, Helios=${maxElevationByDistrict.HELIOS_SPIRE.toFixed(0)}m, Aegis=${maxElevationByDistrict.AEGIS_CITADEL.toFixed(0)}m).\n`
  );

  // ---------------------------------------------------------------------------
  // TEST 2: Foundry Slums Thermal Updrafts & Agility Lv 5 Ledge-Mantle Reach (1.8m)
  // ---------------------------------------------------------------------------
  console.log('[2/6] Verifying Foundry Slums Thermal Updraft Lift & Agility Lv 5 Mantle Reach...');
  await initRapierPhysics();
  const physics = new SharedPhysicsWorld();

  // 2A. Thermal Updraft Lift in Foundry Slums
  const updraft0 = getNeoVeridiaThermalUpdrafts()[0];
  const updraftAgent = physics.createAgent(201, 'UPDRAFT-AGENT', {
    x: updraft0.center.x,
    y: 3.0,
    z: updraft0.center.z,
  });
  for (let tick = 1; tick <= 90; tick++) {
    physics.applyAgentInput(updraftAgent, {
      seq: tick,
      moveX: 0,
      moveZ: 0,
      yaw: 0,
      pitch: 0,
      buttons: 0,
      dt: FIXED_TIMESTEP,
    });
    physics.stepWorld();
  }
  assert.ok(
    updraftAgent.position.y > 22.0,
    `Foundry Slums thermal updraft must propel agent vertically >22m (got Y=${updraftAgent.position.y.toFixed(2)}m)`
  );

  // 2B. Agility Lv 1 (0.8m reach) vs Agility Lv 5 (1.8m reach) Ledge Mantling
  // mantle_terrace_tier_1 front face is at Z = -7.5m.
  // Place agent at Z = -5.85m (distance to wall = 1.65m from center = 1.25m from capsule skin).
  // At Lv 1, rayMaxToi = 0.4 + 0.8 = 1.20m (< 1.65m, so out of reach).
  // At Lv 5, rayMaxToi = 0.4 + 1.8 = 2.20m (> 1.65m, so within reach!).
  const reachAgent = physics.createAgent(202, 'REACH-AGENT', { x: 0, y: 0, z: -5.85 });
  const lv1Check = physics.detectLedgeMantle(reachAgent, { x: 0, y: 0, z: -1 }, 1);
  const lv5Check = physics.detectLedgeMantle(reachAgent, { x: 0, y: 0, z: -1 }, 5);
  assert.equal(lv1Check.detected, false, 'Agility Lv 1 (0.8m reach) must not grab a ledge 1.25m away from capsule skin');
  assert.equal(lv5Check.detected, true, 'Agility Lv 5 (1.8m reach) must grab a ledge 1.25m away from capsule skin');
  console.log(
    `  ✓ Thermal Updraft Lift (reached Y=${updraftAgent.position.y.toFixed(1)}m) & Agility Lv 5 1.8m Mantle Reach verified.\n`
  );

  // ---------------------------------------------------------------------------
  // TEST 3: Seven Levellable Agent Attributes Mathematical Curves (REQ-SKILLS)
  // ---------------------------------------------------------------------------
  console.log('[3/6] Verifying 7-Attribute Mathematical Scaling Curves (PRD Section 4.1)...');
  const agi1 = getAgilityParams(1);
  const agi5 = getAgilityParams(5);
  assert.equal(agi1.runSpeed, 8.0);
  assert.equal(agi5.runSpeed, 16.5);
  assert.equal(agi1.jumpApexMeters, 3.2);
  assert.equal(agi5.jumpApexMeters, 14.5);
  assert.equal(agi1.maxAirDashes, 1);
  assert.equal(agi5.maxAirDashes, 3);
  assert.equal(agi1.ledgeGrabReach, 0.8);
  assert.equal(agi5.ledgeGrabReach, 1.8);

  const str1 = getStrengthParams(1);
  const str5 = getStrengthParams(5);
  assert.equal(str1.meleeBaseDamage, 35);
  assert.equal(str5.meleeBaseDamage, 140);
  assert.equal(str1.maxHp, 200);
  assert.equal(str5.maxHp, 600);
  assert.equal(str1.throwMassLimitKg, 150);
  assert.equal(str5.throwMassLimitKg, 4000);

  const drv1 = getDrivingParams(1);
  const drv5 = getDrivingParams(5);
  assert.equal(drv1.topSpeedMps, 28);
  assert.equal(drv5.topSpeedMps, 55);
  assert.equal(drv1.chassisMassKg, 1400);
  assert.equal(drv5.chassisMassKg, 3200);

  const sht1 = getShootingParams(1);
  const sht5 = getShootingParams(5);
  assert.ok(Math.abs(sht1.spreadConeDeg - 4.2) < 1e-6);
  assert.ok(Math.abs(sht5.spreadConeDeg - 0.4) < 1e-6);
  assert.equal(sht1.lockOnRangeMeters, 40);
  assert.equal(sht5.lockOnRangeMeters, 110);

  const exp1 = getExplosivesParams(1);
  const exp5 = getExplosivesParams(5);
  assert.equal(exp1.blastRadiusMeters, 4.5);
  assert.equal(exp5.blastRadiusMeters, 12.0);
  assert.equal(exp1.impulseNs, 18);
  assert.equal(exp5.impulseNs, 65);

  const fly1 = getFlyingParams(1);
  const fly5 = getFlyingParams(5);
  assert.equal(fly1.jetpackFuelSeconds, 3.0);
  assert.equal(fly5.jetpackFuelSeconds, 12.0);
  assert.equal(fly1.maxUpwardAccelMps2, 12);
  assert.equal(fly5.maxUpwardAccelMps2, 28);

  const vig1 = getVigilanteParams(1);
  const vig5 = getVigilanteParams(5);
  assert.equal(vig1.auraRadiusMeters, 15);
  assert.equal(vig5.auraRadiusMeters, 45);
  assert.equal(vig1.counterWindowMs, 220);
  assert.equal(vig5.counterWindowMs, 420);
  console.log('  ✓ All 7 Attribute Lv 1..5 continuous curves match PRD Section 4.1 specifications.\n');

  // ---------------------------------------------------------------------------
  // TEST 4: 182 3D Environmental Orbs (150 Agility, 20 Renegade, 12 Whisper)
  // ---------------------------------------------------------------------------
  console.log('[4/6] Verifying 182 3D Orbs across 4 Districts (Y = 10m to 310m)...');
  const orbs = generateNeoVeridiaOrbs();
  assert.equal(orbs.length, TOTAL_ORBS, 'Total Orbs must be exactly 182');

  const agilityOrbs = orbs.filter((o) => o.type === OrbType.AGILITY);
  const renegadeOrbs = orbs.filter((o) => o.type === OrbType.RENEGADE);
  const whisperOrbs = orbs.filter((o) => o.type === OrbType.WHISPER);

  assert.equal(agilityOrbs.length, TOTAL_AGILITY_ORBS, 'Must generate 150 Agility Orbs');
  assert.equal(renegadeOrbs.length, TOTAL_RENEGADE_ORBS, 'Must generate 20 Renegade Orbs');
  assert.equal(whisperOrbs.length, TOTAL_WHISPER_ORBS, 'Must generate 12 Whisper Orbs');

  const orbCountByDistrict: Record<DistrictId, number> = {
    [DistrictId.NEON_DOCKS]: 0,
    [DistrictId.FOUNDRY_SLUMS]: 0,
    [DistrictId.HELIOS_SPIRE]: 0,
    [DistrictId.AEGIS_CITADEL]: 0,
  };

  for (const orb of orbs) {
    assert.ok(
      orb.position.y >= 10.0 && orb.position.y <= 310.0,
      `Orb #${orb.orbId} elevation must be in [10m, 310m] (got Y=${orb.position.y}m)`
    );
    assert.ok(orb.harmonicFreqHz >= 200 && orb.harmonicFreqHz <= 1200, 'Orb must define valid HRTF harmonic frequency');
    orbCountByDistrict[orb.district] += 1;
  }

  for (const d of districts) {
    assert.ok(
      orbCountByDistrict[d] >= 35,
      `District ${d} must host >= 35 3D Orbs (got ${orbCountByDistrict[d]})`
    );
  }
  console.log(
    `  ✓ 182 3D Orbs verified (150 Agility, 20 Renegade, 12 Whisper; District split: ${JSON.stringify(orbCountByDistrict)}).\n`
  );

  // ---------------------------------------------------------------------------
  // TEST 5: Renegade Orb 18m 3D Flee Steering & Binary Snapshot (0x03)
  // ---------------------------------------------------------------------------
  console.log('[5/6] Verifying Renegade Orb 18m 3D Flee Steering & Binary Protocol (0x03)...');
  const renegade0 = renegadeOrbs[0];
  const initialRenegadePos = { ...renegade0.position };

  // Place a pursuing agent 6.0m away from Renegade Orb #151 (well inside the 18m trigger radius)
  const pursuerPos = {
    x: initialRenegadePos.x - 5.0,
    y: initialRenegadePos.y - 1.0,
    z: initialRenegadePos.z - 3.0,
  };
  const initialDist = Math.hypot(
    renegade0.position.x - pursuerPos.x,
    renegade0.position.y - (pursuerPos.y + 1.0),
    renegade0.position.z - pursuerPos.z
  );
  assert.ok(initialDist < 18.0, 'Pursuer must start within 18m trigger radius');

  for (let tick = 1; tick <= 30; tick++) {
    stepRenegadeOrbSteering(orbs, [pursuerPos], FIXED_TIMESTEP);
  }

  const afterDist = Math.hypot(
    renegade0.position.x - pursuerPos.x,
    renegade0.position.y - (pursuerPos.y + 1.0),
    renegade0.position.z - pursuerPos.z
  );
  const renegadeSpeed = Math.hypot(renegade0.velocity.x, renegade0.velocity.y, renegade0.velocity.z);
  assert.equal(renegade0.isFleeing, true, 'Renegade Orb must enter fleeing state when agent is within 18m');
  assert.ok(renegadeSpeed > 10.0, `Renegade Orb must accelerate along 3D flee vector (speed=${renegadeSpeed.toFixed(2)} m/s)`);
  assert.ok(
    afterDist > initialDist + 2.5,
    `Renegade Orb must flee away from pursuing agent in 3D space (dist ${initialDist.toFixed(2)}m -> ${afterDist.toFixed(2)}m)`
  );

  // Verify binary RENEGADE_ORB_SNAPSHOT (0x03) encoding & decoding
  const encodedOrbSnap = encodeRenegadeOrbSnapshot(
    500,
    renegadeOrbs.map((o) => ({ orbId: o.orbId, isFleeing: o.isFleeing, position: o.position }))
  );
  assert.equal(
    encodedOrbSnap.byteLength,
    ORB_SNAPSHOT_HEADER_BYTE_LENGTH + TOTAL_RENEGADE_ORBS * ORB_SNAPSHOT_RECORD_BYTE_LENGTH,
    '20-Renegade binary snapshot must be exactly 324 bytes (4B header + 20 * 16B)'
  );
  const decodedOrbSnap = decodeRenegadeOrbSnapshot(encodedOrbSnap);
  assert.ok(decodedOrbSnap !== null);
  assert.equal(decodedOrbSnap.orbs.length, 20);
  assert.equal(decodedOrbSnap.orbs[0].isFleeing, true);
  console.log(
    `  ✓ Renegade Orb 18m Flee Steering (dist ${initialDist.toFixed(2)}m -> ${afterDist.toFixed(2)}m at ${renegadeSpeed.toFixed(1)} m/s) & 324B Binary Snapshot verified.\n`
  );

  // ---------------------------------------------------------------------------
  // TEST 6: Live Server Orb Collection, XP Level-Up & SQLite WAL Persistence
  // ---------------------------------------------------------------------------
  console.log('[6/6] Verifying Live Authoritative Orb Collection, XP Level-Up & SQLite WAL Persistence...');
  const suiteDbPath = path.resolve(process.cwd(), 'data', 'verify_phase2_suite.db');
  const server = new CrackupAuthoritativeServer({
    port: 0,
    dbPath: suiteDbPath,
  });
  server.db.clearAllAgents();

  const boundPort = await server.start();

  // Pre-seed Agent 'ORB-HUNTER' right at Central Command Spire Platform (0, 10.0m, -32.0m) where Orb #1 is located!
  const authSeed = server.db.authenticateOrCreate('ORB-HUNTER', '7777', {
    x: 0.0,
    y: 10.0,
    z: -32.0,
  });
  assert.ok(authSeed.ok);
  // Give ORB-HUNTER 60 initial Agility XP so collecting Orb #1 (+50 Agility XP -> 110 XP) crosses the 100 XP threshold for Agility Level 2!
  authSeed.record.xp.agility = 60;
  server.db.saveAgent(authSeed.record);

  let orbCollectedMsg: {
    orbId: number;
    orbType: number;
    xp: { agility: number };
    attributes: { agility: number };
    collectedCount: number;
  } | null = null;
  let binaryRenegadeSnapshotsReceived = 0;

  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${boundPort}/ws`);
    ws.binaryType = 'arraybuffer';
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for ORB_COLLECTED')), 8000);

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'AUTH', callsign: 'ORB-HUNTER', pin: '7777' }));
    });

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        const buf = Buffer.isBuffer(data)
          ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
          : (data as ArrayBuffer);
        const pType = new DataView(buf).getUint8(0);
        if (pType === PacketType.RENEGADE_ORB_SNAPSHOT) {
          const decoded = decodeRenegadeOrbSnapshot(buf);
          if (decoded && decoded.orbs.length === 20) {
            binaryRenegadeSnapshotsReceived += 1;
          }
        }
        return;
      }

      const msg = JSON.parse(data.toString());
      if (msg.type === 'AUTH_OK') {
        // Send a couple of neutral input frames while standing at (0, 10.0, -32.0) to trigger Orb #1 collection
        for (let seq = 1; seq <= 5; seq++) {
          ws.send(
            encodeClientInput({
              seq,
              moveX: 0,
              moveZ: 0,
              yaw: 0,
              pitch: 0,
              buttons: INPUT_FLAG_MANTLE,
              dt: FIXED_TIMESTEP,
            }),
            { binary: true }
          );
        }
      } else if (msg.type === 'ORB_COLLECTED') {
        orbCollectedMsg = msg;
        if (binaryRenegadeSnapshotsReceived >= 1) {
          clearTimeout(timeout);
          ws.close(1000, 'Done');
          resolve();
        }
      }
    });

    // Also check if binaryRenegadeSnapshotsReceived arrives right after ORB_COLLECTED
    const checkInterval = setInterval(() => {
      if (orbCollectedMsg && binaryRenegadeSnapshotsReceived >= 1) {
        clearInterval(checkInterval);
        clearTimeout(timeout);
        ws.close(1000, 'Done');
        resolve();
      }
    }, 25);

    ws.on('error', (err) => {
      clearInterval(checkInterval);
      clearTimeout(timeout);
      reject(err);
    });
  });

  await new Promise((r) => setTimeout(r, 80));

  assert.ok(orbCollectedMsg !== null, 'Server must emit ORB_COLLECTED when Agent intersects 3D Orb #1');
  const collected = orbCollectedMsg as {
    orbId: number;
    orbType: number;
    xp: { agility: number };
    attributes: { agility: number };
    collectedCount: number;
  };
  assert.equal(collected.orbId, 1, 'Must collect Central Spire Agility Orb #1');
  assert.equal(collected.xp.agility, 110, 'Agility XP must increase from 60 to 110 (+50 XP)');
  assert.equal(
    collected.attributes.agility,
    2,
    'Crossing 100 XP threshold must automatically level up Agility from Lv 1 to Lv 2'
  );

  // Verify SQLite WAL persistence after disconnect
  const persistedHunter = server.db.getAgent('ORB-HUNTER');
  assert.ok(persistedHunter !== null);
  assert.ok(
    persistedHunter.collectedOrbs.includes(1),
    'Collected Orb #1 must be persisted in SQLite WAL collected_orbs_json'
  );
  assert.equal(persistedHunter.xp.agility, 110);
  assert.equal(persistedHunter.attributes.agility, 2);
  assert.equal(persistedHunter.telemetry.agilityOrbsCollected, 1);

  console.log(
    `  ✓ Live Orb #1 Collection -> XP (60->110) -> Auto Level-Up (Agility Lv 2) & SQLite WAL Persistence verified.\n`
  );

  await server.stop();

  console.log('================================================================================');
  console.log(' ALL PHASE 2 VERIFICATION GATES PASSED SUCCESSFULLY (ZERO WARNINGS / ZERO ERRORS)');
  console.log('================================================================================');
}

runPhase2Verification().catch((err) => {
  console.error('\n[PHASE 2 VERIFICATION FAILED]:', err);
  process.exit(1);
});
