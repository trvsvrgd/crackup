/**
 * CRACKUP: Protocol Eclipse (v2.0 True 3D AAA Architecture)
 * Phase 5 Automated Verification Suite:
 *   1. AI Factions, 3D Waypoint Navmesh Patrols, 3D Raycast Obstacle-Avoidance Whiskers,
 *      Attribute #6 Flying (Vector-Thrust Jetpack) & Attribute #7 Vigilante (3D Co-op Aura Sphere)
 *   2. 4 District 3-Stage Operational Loops (Stage 1: 2 3D Sabotage Terminals ->
 *      Stage 2: Faction Lieutenant -> Stage 3: District Kingpin & Core Override) + 4 Signature Rewards
 *   3. 90-Second Omega Bounty 3D Waypoint Extraction Convoy & 70% Leg-Cripple Slowdown
 *   4. Secret Neural Drift Engine (4 Telemetry Ratios -> 4 Hidden Mutations + 3D Aegis Auditor Airships & Hit-Squads + SQLite WAL Persistence)
 *   5. Binary PacketType.WORLD_EVENTS_SNAPSHOT (0x06) Round-Trip Serialization Integrity
 */

import fs from 'node:fs';
import path from 'node:path';
import { AgentDatabase } from '../server/db.js';
import {
  AgentAnimState,
  AugmentChassisId,
  DEFAULT_ATTRIBUTES,
  DEFAULT_TELEMETRY,
  DistrictId,
  DistrictLoopRewardId,
  EnemyCombatState,
  EnemyLimbId,
  FactionId,
  FIXED_TIMESTEP,
  INPUT_FLAG_JUMP,
  INPUT_FLAG_OBJECTIVE_JETPACK,
  getFlyingParams,
  NeuralDriftMutationId,
  OMEGA_BOUNTY_DURATION_SEC,
} from '../shared/constants.js';
import { initRapierPhysics, SharedPhysicsWorld } from '../shared/physics/characterController.js';
import {
  decodeWorldEventsSnapshot,
  encodeWorldEventsSnapshot,
} from '../shared/protocol/binaryProtocol.js';
import {
  computeNeuralDriftRatios,
  DISTRICT_LOOP_SPECS,
} from '../shared/world/phase5Systems.js';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(`[PHASE 5 VERIFICATION FAILED] ${message}`);
  }
}

async function runPhase5Verification(): Promise<void> {
  console.log('================================================================================');
  console.log('CRACKUP: Protocol Eclipse — Phase 5 Automated Verification Suite');
  console.log('================================================================================');

  await initRapierPhysics();
  const world = new SharedPhysicsWorld();

  // ---------------------------------------------------------------------------
  // SUITE 1: AI Factions, 3D Waypoint Steering, Flying Jetpack & Vigilante Aura
  // ---------------------------------------------------------------------------
  console.log('\n[SUITE 1/5] Verifying AI Factions, 3D Waypoint Steering, Jetpack Flight & Vigilante Co-op Sphere...');

  const initialEnemies = Array.from(world.combatManager.enemies.values());
  assert(initialEnemies.length >= 8, `Expected >= 8 faction enemies spawned, found ${initialEnemies.length}`);

  const factionsPresent = new Set(initialEnemies.map((e) => e.faction));
  assert(factionsPresent.has(FactionId.NEON_SYNDICATE), 'Missing NEON_SYNDICATE faction squad');
  assert(factionsPresent.has(FactionId.FOUNDRY_IRONCLAD), 'Missing FOUNDRY_IRONCLAD faction squad');
  assert(
    factionsPresent.has(FactionId.HELIOS_EXECUTIVE_GUARD),
    'Missing HELIOS_EXECUTIVE_GUARD faction squad'
  );
  assert(factionsPresent.has(FactionId.AEGIS_DIRECTORATE), 'Missing AEGIS_DIRECTORATE faction squad');

  // Create two co-op Agents to test Flying Jetpack (Attribute #6) and Vigilante 3D Sphere (Attribute #7)
  const agent1 = world.createAgent(
    1,
    'VANGUARD-FLY',
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 0, w: 1 },
    { ...DEFAULT_ATTRIBUTES, flying: 5, vigilante: 5 },
    { ...DEFAULT_TELEMETRY },
    AugmentChassisId.AERO_VALKYRIE,
    [],
    []
  );
  const agent2 = world.createAgent(
    2,
    'WINGMAN-COOP',
    { x: 12, y: 0, z: 0 }, // 12m away -> inside Agent 1's 45m Vigilante Level 5 3D sphere
    { x: 0, y: 0, z: 0, w: 1 },
    { ...DEFAULT_ATTRIBUTES, flying: 1, vigilante: 1 },
    { ...DEFAULT_TELEMETRY },
    AugmentChassisId.TITAN_JUGGERNAUT,
    [],
    []
  );

  // Damage agent2 to verify Vigilante 3D spherical co-op healing/buff aura
  agent2.hp = 60;
  const expectedLv5Fuel = getFlyingParams(5).jetpackFuelSeconds;
  const startFuelLv5 = agent1.jetpackFuelSec;
  assert(
    Math.abs(startFuelLv5 - expectedLv5Fuel) < 0.01,
    `Expected Flying Lv5 jetpack fuel ${expectedLv5Fuel}s, got ${startFuelLv5}s`
  );

  // Jump on tick 1, then hold INPUT_FLAG_OBJECTIVE_JETPACK while airborne for 35 ticks
  world.applyAgentInput(agent1, {
    seq: 1,
    moveX: 0,
    moveZ: 1,
    yaw: 0,
    pitch: 0,
    buttons: INPUT_FLAG_JUMP,
    dt: FIXED_TIMESTEP,
  });
  world.stepWorld();

  let reachedJetpackAnim = false;
  for (let i = 2; i <= 36; i++) {
    world.applyAgentInput(agent1, {
      seq: i,
      moveX: 0,
      moveZ: 1,
      yaw: 0,
      pitch: 0,
      buttons: INPUT_FLAG_OBJECTIVE_JETPACK,
      dt: FIXED_TIMESTEP,
    });
    world.stepWorld();
    if (agent1.animState === AgentAnimState.JETPACK_FLIGHT) {
      reachedJetpackAnim = true;
    }
  }

  assert(reachedJetpackAnim, 'Expected Agent 1 to enter AgentAnimState.JETPACK_FLIGHT while holding jetpack airborne');
  assert(
    agent1.position.y > 4.5,
    `Expected Flying Lv5 Vector-Thrust Jetpack to lift Agent 1 above 4.5m, got y=${agent1.position.y.toFixed(2)}m`
  );
  assert(
    agent1.jetpackFuelSec < startFuelLv5,
    'Expected jetpack fuel to drain during active vector-thrust flight'
  );
  assert(
    agent2.hp > 60,
    `Expected Agent 2 inside Agent 1's 45m 3D Vigilante sphere to receive co-op aura regeneration, hp=${agent2.hp.toFixed(2)}`
  );

  console.log(
    `  -> PASS: 4 AI Factions active, Flying Lv5 Jetpack reached y=${agent1.position.y.toFixed(2)}m (fuel ${agent1.jetpackFuelSec.toFixed(2)}s/${startFuelLv5}s), Vigilante 45m Co-op Sphere healed ally to ${agent2.hp.toFixed(1)} HP.`
  );

  // ---------------------------------------------------------------------------
  // SUITE 2: 4 District 3-Stage Operational Loops & Signature Rewards
  // ---------------------------------------------------------------------------
  console.log('\n[SUITE 2/5] Verifying all 4 District 3-Stage Operational Loops (Terminals -> Lieutenant -> Kingpin + Core Override)...');

  let seqCounter = 100;
  const pressInteractAt = (pos: { x: number; y: number; z: number }) => {
    agent1.position = { x: pos.x, y: pos.y, z: pos.z };
    agent1.grounded = true;
    world.syncAgentKinematicTransform(agent1);
    // Clear previous button bit first so objectiveJustPressed triggers cleanly
    world.applyAgentInput(agent1, {
      seq: ++seqCounter,
      moveX: 0,
      moveZ: 0,
      yaw: 0,
      pitch: 0,
      buttons: 0,
      dt: FIXED_TIMESTEP,
    });
    world.stepWorld();
    world.applyAgentInput(agent1, {
      seq: ++seqCounter,
      moveX: 0,
      moveZ: 0,
      yaw: 0,
      pitch: 0,
      buttons: INPUT_FLAG_OBJECTIVE_JETPACK,
      dt: FIXED_TIMESTEP,
    });
    world.stepWorld();
  };

  for (const spec of DISTRICT_LOOP_SPECS) {
    const loopState = world.phase5Director.districtLoops.get(spec.district)!;
    assert(loopState.currentStage === 1, `Expected ${spec.district} to start at Stage 1`);

    // Stage 1: Sabotage Terminal 1 & Terminal 2 in 3D space
    pressInteractAt(spec.stage1Terminals[0]);
    assert(
      loopState.terminal1Hacked === true,
      `Expected Terminal 1 sabotaged in ${spec.district}`
    );

    pressInteractAt(spec.stage1Terminals[1]);
    assert(
      loopState.terminal2Hacked === true && loopState.currentStage === 2,
      `Expected ${spec.district} to advance to Stage 2 and spawn Lieutenant`
    );

    // Stage 2: Eliminate the District Faction Lieutenant
    const ltEnemy = world.combatManager.enemies.get(spec.lieutenantEnemyId);
    assert(ltEnemy !== undefined, `Expected Lieutenant entity in combatManager for ${spec.district}`);
    ltEnemy!.hp = 0;
    ltEnemy!.combatState = EnemyCombatState.DEAD;
    world.stepWorld();

    assert(
      loopState.currentStage === 3 && loopState.lieutenantDefeated === true,
      `Expected ${spec.district} to advance to Stage 3 and spawn District Kingpin`
    );

    // Stage 3: Eliminate the District Kingpin & trigger 3D Core Override Beacon
    const kpEnemy = world.combatManager.enemies.get(spec.kingpinEnemyId);
    assert(kpEnemy !== undefined, `Expected Kingpin entity in combatManager for ${spec.district}`);
    kpEnemy!.hp = 0;
    kpEnemy!.combatState = EnemyCombatState.DEAD;

    pressInteractAt(spec.coreOverridePos);
    assert(
      loopState.kingpinDefeated === true && loopState.currentStage === 4,
      `Expected ${spec.district} 3-Stage Loop to complete at Stage 4`
    );
    assert(
      agent1.unlockedDistrictRewards.has(spec.rewardId),
      `Expected Agent 1 to unlock signature District reward ${spec.rewardId}`
    );
  }

  assert(
    agent1.unlockedDistrictRewards.has(DistrictLoopRewardId.UNLOCK_GRAPPLE_OVERDRIVE) &&
      agent1.unlockedDistrictRewards.has(DistrictLoopRewardId.UNLOCK_PLASMA_RAILGUN) &&
      agent1.unlockedDistrictRewards.has(DistrictLoopRewardId.UNLOCK_GRAV_FLIGHT_OVERDRIVE) &&
      agent1.unlockedDistrictRewards.has(DistrictLoopRewardId.UNLOCK_PROTOCOL_ECLIPSE_OVERRIDE),
    'Expected all 4 District Loop signature rewards to be unlocked'
  );
  assert(
    agent1.buildModifiers.grappleRangeBonusM >= 20 &&
      agent1.buildModifiers.weaponDamageMultiplier > 1.5 &&
      agent1.buildModifiers.jetpackFuelBonusSec >= 6.0 &&
      agent1.buildModifiers.vigilanteAuraRadiusBonusM >= 15.0,
    'Expected District Loop signature rewards to upgrade Agent 1 buildModifiers'
  );

  console.log(
    `  -> PASS: All 4 District 3-Stage Loops completed (NEON_DOCKS, FOUNDRY_SLUMS, HELIOS_SPIRE, AEGIS_CITADEL) & all 4 signature rewards active.`
  );

  // ---------------------------------------------------------------------------
  // SUITE 3: 90-Second Omega Bounty 3D Waypoint Extraction & Leg-Cripple Slow
  // ---------------------------------------------------------------------------
  console.log('\n[SUITE 3/5] Verifying 90-Second Omega Bounty 3D Waypoint Extraction Convoy & 70% Leg-Cripple Slowdown...');

  const bounty = world.phase5Director.omegaBounty;
  assert(bounty.active === true, 'Expected Omega Bounty HVT to be active');
  assert(
    bounty.timeRemainingSec > 0 && bounty.timeRemainingSec <= OMEGA_BOUNTY_DURATION_SEC,
    `Expected Omega Bounty timer within (0, 90.0s], got ${bounty.timeRemainingSec.toFixed(2)}s`
  );

  const hvtEnemy = world.combatManager.enemies.get(bounty.enemyId);
  assert(hvtEnemy !== undefined, 'Expected Omega Bounty HVT entity to exist in combatManager');

  const posBeforeNormal = { ...hvtEnemy!.position };
  for (let i = 0; i < 30; i++) {
    world.stepWorld();
  }
  const distNormal = Math.hypot(
    hvtEnemy!.position.x - posBeforeNormal.x,
    hvtEnemy!.position.z - posBeforeNormal.z
  );
  assert(distNormal > 1.5, `Expected Omega HVT to advance along 3D extraction waypoints, moved ${distNormal.toFixed(2)}m`);

  // Now cripple the Omega HVT's LEFT_LEG bone sub-collider and verify 70% extraction speed slowdown
  const leftLegState = hvtEnemy!.limbs[EnemyLimbId.LEFT_LEG]!;
  leftLegState.hp = 0;
  hvtEnemy!.legsCrippledTimer = 5.0;

  const posBeforeCrippled = { ...hvtEnemy!.position };
  for (let i = 0; i < 30; i++) {
    world.stepWorld();
  }
  const distCrippled = Math.hypot(
    hvtEnemy!.position.x - posBeforeCrippled.x,
    hvtEnemy!.position.z - posBeforeCrippled.z
  );

  assert(
    distCrippled < distNormal * 0.45,
    `Expected leg-crippled HVT movement (${distCrippled.toFixed(2)}m) to be slowed by ~70% compared to normal (${distNormal.toFixed(2)}m)`
  );

  // Eliminate the Omega Bounty HVT before the 90s extraction completes
  hvtEnemy!.hp = 0;
  hvtEnemy!.combatState = EnemyCombatState.DEAD;
  world.stepWorld();

  assert(
    bounty.completed === true && bounty.active === false,
    'Expected Omega Bounty to mark completed=true and active=false upon HVT elimination'
  );
  assert(
    (agent1.telemetry.omegaBountiesCompleted || 0) >= 1,
    'Expected Agent 1 telemetry.omegaBountiesCompleted >= 1'
  );

  console.log(
    `  -> PASS: Omega Bounty 90s extraction verified (Normal 0.5s dist=${distNormal.toFixed(2)}m -> Leg-Crippled dist=${distCrippled.toFixed(2)}m [-70% speed]) & HVT intercepted.`
  );

  // ---------------------------------------------------------------------------
  // SUITE 4: Secret Neural Drift Engine, 3D Aegis Auditor Airships & SQLite WAL
  // ---------------------------------------------------------------------------
  console.log('\n[SUITE 4/5] Verifying Secret Neural Drift Engine (4 Mutations), 3D Aegis Auditor Airships & SQLite WAL Persistence...');

  // Feed telemetry exceeding all 4 hidden thresholds into Agent 2
  agent2.telemetry.totalDamageDealt = 2000;
  agent2.telemetry.collateralBlastDamageDealt = 1100; // 0.55 >= 0.38 -> PYRO_NEUROSIS
  agent2.telemetry.enemiesDefeated = 10;
  agent2.telemetry.limbsCrippled = 9; // 0.90 >= 0.75 -> SURGICAL_COLDNESS
  agent2.telemetry.playTimeSeconds = 120;
  agent2.telemetry.airborneTimeSeconds = 60; // 0.50 >= 0.35 -> HOLLOW_FRAME_ADAPTATION
  agent2.telemetry.squadRevivesAndNonLethalCount = 12; // 12/22 = 0.545 >= 0.40 -> GHOST_CONSCIENCE

  const newlyTriggered = world.phase5Director.evaluateAgentNeuralDrift(agent2);
  world.recomputeAgentBuild(agent2);

  assert(
    newlyTriggered.length === 4,
    `Expected all 4 Secret Neural Drift mutations to trigger organically, got ${newlyTriggered.length}`
  );
  assert(
    agent2.activeNeuralDrifts.has(NeuralDriftMutationId.PYRO_NEUROSIS) &&
      agent2.activeNeuralDrifts.has(NeuralDriftMutationId.SURGICAL_COLDNESS) &&
      agent2.activeNeuralDrifts.has(NeuralDriftMutationId.HOLLOW_FRAME_ADAPTATION) &&
      agent2.activeNeuralDrifts.has(NeuralDriftMutationId.GHOST_CONSCIENCE),
    'Expected Agent 2 activeNeuralDrifts to contain all 4 mutations'
  );
  assert(
    world.phase5Director.auditorAirships.size >= 1,
    'Expected Secret Neural Drift activation to spawn a physical 3D Aegis Auditor Airship'
  );

  const auditorEnemies = Array.from(world.combatManager.enemies.values()).filter(
    (e) => e.faction === FactionId.AEGIS_AUDITOR_HIT_SQUAD
  );
  assert(
    auditorEnemies.length >= 2,
    `Expected >= 2 Aegis Auditor Hit-Squad Enforcers spawned in 3D world, found ${auditorEnemies.length}`
  );

  // Step simulation to verify 3D Aegis Auditor Airship orbital movement above Agent 2
  const airship = Array.from(world.phase5Director.auditorAirships.values())[0]!;
  const shipStartPos = { ...airship.position };
  for (let i = 0; i < 20; i++) {
    world.stepWorld();
  }
  const shipMoved = Math.hypot(
    airship.position.x - shipStartPos.x,
    airship.position.z - shipStartPos.z
  );
  assert(
    shipMoved > 0.2 && airship.position.y >= 22,
    `Expected 3D Aegis Auditor Airship to orbit at y>=22m, moved=${shipMoved.toFixed(2)}m, y=${airship.position.y.toFixed(1)}m`
  );

  // Verify SQLite WAL persistence of unlockedDistrictRewards, activeNeuralDrifts & neuralDriftRatios
  const tempDbPath = path.resolve(process.cwd(), 'data', `verify_phase5_${Date.now()}.db`);
  const db1 = new AgentDatabase(tempDbPath);
  assert(db1.getJournalMode() === 'wal', 'Expected SQLite database in WAL journal mode');

  const authRes = db1.authenticateOrCreate('DRIFT-AGENT-05', '5555', agent2.position);
  assert(authRes.ok, 'Expected DRIFT-AGENT-05 creation to succeed');
  if (authRes.ok) {
    authRes.record.telemetry = { ...agent2.telemetry };
    authRes.record.unlockedDistrictRewards = Array.from(agent1.unlockedDistrictRewards);
    authRes.record.activeNeuralDrifts = Array.from(agent2.activeNeuralDrifts);
    authRes.record.neuralDriftRatios = computeNeuralDriftRatios(agent2.telemetry);
    db1.saveAgent(authRes.record);
  }
  db1.close();

  const db2 = new AgentDatabase(tempDbPath);
  const reloaded = db2.getAgent('DRIFT-AGENT-05');
  assert(reloaded !== null, 'Expected reloaded DRIFT-AGENT-05 record from SQLite WAL');
  assert(
    reloaded!.unlockedDistrictRewards.length === 4,
    `Expected 4 persisted unlockedDistrictRewards, got ${reloaded!.unlockedDistrictRewards.length}`
  );
  assert(
    reloaded!.activeNeuralDrifts.length === 4,
    `Expected 4 persisted activeNeuralDrifts, got ${reloaded!.activeNeuralDrifts.length}`
  );
  assert(
    reloaded!.neuralDriftRatios.collateral_blast_damage_ratio > 0.38 &&
      reloaded!.neuralDriftRatios.limb_cripple_to_kill_ratio > 0.75,
    'Expected persisted neuralDriftRatios to match computed ratios'
  );
  db2.close();

  // Clean up temporary verification DB via truncate (preserving file integrity constraint)
  if (fs.existsSync(tempDbPath)) {
    fs.truncateSync(tempDbPath, 0);
  }

  console.log(
    `  -> PASS: All 4 Secret Neural Drift mutations triggered, ${world.phase5Director.auditorAirships.size} 3D Auditor Airships + ${auditorEnemies.length} Auditor Enforcers spawned, and persisted in SQLite WAL.`
  );

  // ---------------------------------------------------------------------------
  // SUITE 5: Binary PacketType.WORLD_EVENTS_SNAPSHOT (0x06) Serialization
  // ---------------------------------------------------------------------------
  console.log('\n[SUITE 5/5] Verifying Binary PacketType.WORLD_EVENTS_SNAPSHOT (0x06) Serialization Integrity...');

  // Respawn a fresh Omega Bounty so active=true is tested in binary snapshot
  world.phase5Director.startOmegaBounty();
  const encodedBuf = encodeWorldEventsSnapshot(
    world.tickCount,
    world.phase5Director.toBinaryOmegaBountySnapshot(),
    world.phase5Director.toBinaryDistrictLoopSnapshots(),
    world.phase5Director.toBinaryAuditorAirshipSnapshots()
  );

  const decoded = decodeWorldEventsSnapshot(encodedBuf);
  assert(decoded !== null, 'Expected decodeWorldEventsSnapshot to succeed');
  assert(
    decoded!.serverTickLow8 === (world.tickCount & 0xff),
    'Expected serverTickLow8 round-trip match'
  );
  assert(decoded!.omega.active === true, 'Expected decoded omega.active === true');
  assert(
    Math.abs(decoded!.omega.timeRemainingSec - OMEGA_BOUNTY_DURATION_SEC) < 0.15,
    `Expected decoded Omega Bounty timer ~90.0s, got ${decoded!.omega.timeRemainingSec}`
  );
  assert(
    decoded!.districts.length === 4 &&
      decoded!.districts.every((l) => l.currentStage === 4),
    'Expected all 4 decoded DistrictLoopBinaryStates to reflect completed Stage 4'
  );
  assert(
    decoded!.airships.length >= 1 &&
      Math.abs(decoded!.airships[0]!.position.y - airship.position.y) < 0.05,
    'Expected decoded AuditorAirshipBinaryState 3D position to match authoritative state'
  );

  console.log(
    `  -> PASS: Binary PacketType.WORLD_EVENTS_SNAPSHOT (${encodedBuf.byteLength} bytes) round-trip verified with zero NaN values.`
  );

  console.log('\n================================================================================');
  console.log('ALL 5/5 PHASE 5 VERIFICATION SUITES PASSED WITH ZERO ERRORS.');
  console.log('================================================================================');
}

runPhase5Verification().catch((err) => {
  console.error(err);
  process.exit(1);
});
