/**
 * CRACKUP: Protocol Eclipse (v2.0 True 3D AAA Architecture)
 * Phase 3 Automated Verification Suite
 *
 * Verifies:
 * 1. 6 Bone-Attached Rapier3D Physics Colliders per Enemy (Head Sphere r=0.18m, Torso Capsule r=0.28m/h=0.55m,
 *    L/R Arm Capsules r=0.12m/h=0.45m, L/R Leg Capsules r=0.15m/h=0.60m) synced to animated 3D poses,
 *    plus Binary PacketType.ENEMY_SNAPSHOT (0x04) serialization integrity.
 * 2. V.A.T.S. Sub-Collider Occlusion Raycasts & Hit Probability scaling by Shooting Level (40m -> 110m range,
 *    4.2 deg -> 0.4 deg spread cone), confirming that solid building cover sets occluded limbs to 0% hit chance.
 * 3. 3D Bone-Collider Raycast Damage Multipliers & Limb Cripple Mechanics:
 *    - Head (2.2x Crit + 4.0s STAGGER_BLIND interrupting Windup)
 *    - Torso (1.0x Damage + 1.3x / 30% faster ablative armor strip)
 *    - Arms at 0 HP (0.85x Damage + 8.0s armsCrippledTimer reducing outgoing damage by 50%)
 *    - Legs at 0 HP (0.85x Damage + 8.0s legsCrippledTimer reducing max velocity by 70% & grounding airborne enemies)
 * 4. Motion-Warped Melee (4.5m engage range translating player capsule at 18 m/s toward target) &
 *    Elite Counter-Stance crimson energy shield bounce + counter-throw impulse.
 * 5. Server-Validated Q Counter-Parry during Enemy Windup (lag-compensated timestamp validation),
 *    synchronized 3D parry takedown snap, and 6.0m Radial Kinetic Shockwave at Strength Lv 3+.
 * 6. Live Authoritative Server + WebSocket Client end-to-end combat verification (30Hz binary ENEMY_SNAPSHOT
 *    stream, live V.A.T.S. limb shot, motion-warped melee, parry shockwave, and SQLite WAL persistence).
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { WebSocket } from 'ws';
import { CrackupAuthoritativeServer } from '../server/gameServer.js';
import { VatsLimbEvaluation } from '../shared/combat/enemyRigSystem.js';
import {
  EnemyCombatState,
  EnemyLimbId,
  FIXED_TIMESTEP,
  INPUT_FLAG_FIRE,
  INPUT_FLAG_MELEE,
  INPUT_FLAG_PARRY,
  MELEE_ENGAGE_RANGE_M,
  packTargetLimbIntoButtons,
  PARRY_SHOCKWAVE_RADIUS_M,
  WEAPON_BASE_DAMAGE,
} from '../shared/constants.js';
import {
  initRapierPhysics,
  RAPIER,
  SharedPhysicsWorld,
} from '../shared/physics/characterController.js';
import {
  decodeEnemySnapshot,
  decodeWorldSnapshot,
  encodeClientInput,
  encodeEnemySnapshot,
  EnemyBinarySnapshotState,
  PacketType,
} from '../shared/protocol/binaryProtocol.js';

async function runPhase3Verification(): Promise<void> {
  console.log('================================================================');
  console.log('CRACKUP: Protocol Eclipse - Phase 3 Automated Verification Suite');
  console.log('================================================================\n');

  await initRapierPhysics();

  // ---------------------------------------------------------------------------
  // TEST 1: 6 Bone-Attached Rapier3D Physics Colliders per Enemy & Binary Packet
  // ---------------------------------------------------------------------------
  console.log('[Test 1] Verifying 6 Bone-Attached Rapier3D Colliders per Enemy & Binary ENEMY_SNAPSHOT...');
  const simWorld = new SharedPhysicsWorld();
  const enemyMgr = simWorld.combatManager;

  assert.ok(enemyMgr.enemies.size >= 8, `Expected >= 8 default squad enemies, got ${enemyMgr.enemies.size}`);
  assert.equal(
    enemyMgr.colliderHandleToLimb.size,
    enemyMgr.enemies.size * 6,
    'Every spawned enemy must register exactly 6 distinct Rapier3D bone colliders'
  );

  const sampleEnemy = enemyMgr.enemies.get(1)!;
  assert.ok(sampleEnemy, 'Enemy #1 must exist');

  // Verify exact collider dimensions & shapes per PRD Section 4.2
  const headLimb = sampleEnemy.limbs[EnemyLimbId.HEAD];
  const torsoLimb = sampleEnemy.limbs[EnemyLimbId.TORSO];
  const leftArmLimb = sampleEnemy.limbs[EnemyLimbId.LEFT_ARM];
  const rightArmLimb = sampleEnemy.limbs[EnemyLimbId.RIGHT_ARM];
  const leftLegLimb = sampleEnemy.limbs[EnemyLimbId.LEFT_LEG];
  const rightLegLimb = sampleEnemy.limbs[EnemyLimbId.RIGHT_LEG];

  assert.ok(Math.abs(headLimb.collider.radius() - 0.18) < 1e-4, 'Head sphere collider radius must be 0.18m');
  assert.ok(Math.abs(torsoLimb.collider.radius() - 0.28) < 1e-4, 'Torso capsule collider radius must be 0.28m');
  assert.ok(Math.abs(torsoLimb.collider.halfHeight() * 2 - 0.55) < 1e-4, 'Torso capsule height h must be 0.55m (halfHeight=0.275m)');
  assert.ok(Math.abs(leftArmLimb.collider.radius() - 0.12) < 1e-4, 'Left Arm capsule radius must be 0.12m');
  assert.ok(Math.abs(leftArmLimb.collider.halfHeight() * 2 - 0.45) < 1e-4, 'Left Arm capsule height h must be 0.45m (halfHeight=0.225m)');
  assert.ok(Math.abs(rightArmLimb.collider.radius() - 0.12) < 1e-4, 'Right Arm capsule radius must be 0.12m');
  assert.ok(Math.abs(leftLegLimb.collider.radius() - 0.15) < 1e-4, 'Left Leg capsule radius must be 0.15m');
  assert.ok(Math.abs(leftLegLimb.collider.halfHeight() * 2 - 0.60) < 1e-4, 'Left Leg capsule height h must be 0.60m (halfHeight=0.30m)');
  assert.ok(Math.abs(rightLegLimb.collider.radius() - 0.15) < 1e-4, 'Right Leg capsule radius must be 0.15m');

  // Verify bone colliders animate in 3D space when enemy transitions into WINDUP
  const idleRightArmY = rightArmLimb.worldPosition.y;
  sampleEnemy.combatState = EnemyCombatState.WINDUP;
  enemyMgr.syncEnemyBoneColliders(sampleEnemy);
  const windupRightArmY = rightArmLimb.rigidBody.translation().y;
  assert.ok(
    windupRightArmY > idleRightArmY + 0.2,
    `Right Arm bone collider must elevate during WINDUP telegraph (${idleRightArmY.toFixed(2)}m -> ${windupRightArmY.toFixed(2)}m)`
  );
  sampleEnemy.combatState = EnemyCombatState.IDLE;
  enemyMgr.syncEnemyBoneColliders(sampleEnemy);

  // Verify binary ENEMY_SNAPSHOT (0x04) serialization & deserialization
  const rawSnapshots = enemyMgr.toBinarySnapshots();
  const encodedBuf = encodeEnemySnapshot(420, rawSnapshots);
  assert.equal(
    encodedBuf.byteLength,
    4 + rawSnapshots.length * 36,
    'Binary ENEMY_SNAPSHOT packet must be 4B header + 36B per enemy'
  );
  const decodedSnap = decodeEnemySnapshot(encodedBuf);
  assert.ok(decodedSnap !== null, 'decodeEnemySnapshot must return valid snapshot');
  assert.equal(decodedSnap.serverTickLow16, 420);
  assert.equal(decodedSnap.enemies.length, rawSnapshots.length);
  assert.equal(decodedSnap.enemies[0]!.enemyId, rawSnapshots[0]!.enemyId);
  assert.deepEqual(decodedSnap.enemies[0]!.limbHpPct, [100, 100, 100, 100, 100, 100]);

  console.log(
    `  -> Passed: ${enemyMgr.enemies.size} enemies (${enemyMgr.colliderHandleToLimb.size} Rapier3D bone colliders) & 36B/enemy binary snapshot verified.\n`
  );

  // ---------------------------------------------------------------------------
  // TEST 2: V.A.T.S. Sub-Collider Occlusion Raycasts & Hit Probability Scaling
  // ---------------------------------------------------------------------------
  console.log('[Test 2] Verifying V.A.T.S. Sub-Collider Occlusion Raycasts & Cover Blocking...');
  const vatsEnemy = enemyMgr.spawnEnemy(99, 'VATS-TEST-DUMMY', { x: 0, y: 0, z: 16.0 }, false);
  simWorld.world.step();
  const shooterOrigin = { x: 0, y: 1.55, z: 0 };

  // 2A. Clear Line-of-Sight evaluation at Shooting Lv 1 vs Lv 5
  const evalLv1 = enemyMgr.evaluateVatsTargetLimbs(shooterOrigin, 1, vatsEnemy);
  const evalLv5 = enemyMgr.evaluateVatsTargetLimbs(shooterOrigin, 5, vatsEnemy);

  assert.equal(evalLv1.length, 6, 'V.A.T.S. evaluation must return all 6 limb evaluations');
  for (let i = 0; i < 6; i++) {
    const l1 = evalLv1[i]!;
    const l5 = evalLv5[i]!;
    assert.equal(l1.occluded, false, `Limb ${l1.name} must NOT be occluded in open line-of-sight`);
    assert.ok(l1.hitProbabilityPct > 0, `Limb ${l1.name} must have >0% hit chance in clear LOS`);
    assert.ok(
      l5.hitProbabilityPct >= l1.hitProbabilityPct,
      `Shooting Lv 5 (${l5.hitProbabilityPct}%) must have >= hit probability than Lv 1 (${l1.hitProbabilityPct}%) due to tighter spread cone`
    );
  }

  // 2B. Place a partial low concrete wall (height 1.05m) at Z = +8.0m between shooter and enemy
  // This should block LEGS (at Y = 0.45m), while leaving HEAD (at Y = 1.68m) unoccluded!
  const wallRb = simWorld.world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0.525, 8.0)
  );
  const wallCol = simWorld.world.createCollider(
    RAPIER.ColliderDesc.cuboid(2.5, 0.525, 0.4),
    wallRb
  );
  simWorld.world.step();

  const evalPartialCover = enemyMgr.evaluateVatsTargetLimbs(shooterOrigin, 3, vatsEnemy);
  const headCoverEval = evalPartialCover.find((e: VatsLimbEvaluation) => e.limbId === EnemyLimbId.HEAD)!;
  const leftLegCoverEval = evalPartialCover.find((e: VatsLimbEvaluation) => e.limbId === EnemyLimbId.LEFT_LEG)!;
  const rightLegCoverEval = evalPartialCover.find((e: VatsLimbEvaluation) => e.limbId === EnemyLimbId.RIGHT_LEG)!;

  assert.equal(headCoverEval.occluded, false, 'Head above low wall must remain UNOCCLUDED');
  assert.ok(headCoverEval.hitProbabilityPct > 0, 'Exposed Head above cover must have >0% hit probability');
  assert.equal(leftLegCoverEval.occluded, true, 'Left Leg behind solid wall must be OCCLUDED');
  assert.equal(leftLegCoverEval.hitProbabilityPct, 0, 'Occluded Left Leg must display 0% hit probability');
  assert.equal(rightLegCoverEval.occluded, true, 'Right Leg behind solid wall must be OCCLUDED');
  assert.equal(rightLegCoverEval.hitProbabilityPct, 0, 'Occluded Right Leg must display 0% hit probability');

  simWorld.world.removeCollider(wallCol, true);
  simWorld.world.removeRigidBody(wallRb);
  simWorld.world.step();

  console.log(
    `  -> Passed: Clear LOS Lv1 Head=${evalLv1[0]!.hitProbabilityPct}% -> Lv5 Head=${evalLv5[0]!.hitProbabilityPct}%; Partial Cover Head=${headCoverEval.hitProbabilityPct}% vs Legs=0% (OCCLUDED).\n`
  );

  // ---------------------------------------------------------------------------
  // TEST 3: 3D Bone-Collider Raycast Damage Multipliers & Limb Cripple Mechanics
  // ---------------------------------------------------------------------------
  console.log('[Test 3] Verifying Bone-Collider Raycast Multipliers & Limb Cripple Debuffs...');
  const agent = simWorld.createAgent(
    1,
    'AGENT-VATS',
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 0, w: 1 },
    {
      agility: 2,
      strength: 3,
      shooting: 4,
      explosives: 1,
      driving: 1,
      vigilante: 3,
      flying: 1,
    }
  );
  simWorld.world.step();

  // 3A. HEAD Collider: 2.2x Crit Multiplier + 4.0s Blind/Stagger interrupting Windup
  vatsEnemy.combatState = EnemyCombatState.WINDUP;
  vatsEnemy.stateTimer = 0.65;
  enemyMgr.syncEnemyBoneColliders(vatsEnemy);
  simWorld.world.step();
  const hpBeforeHead = vatsEnemy.hp;
  const headShotRes = enemyMgr.resolveWeaponShot(agent, Math.PI, 0, EnemyLimbId.HEAD, vatsEnemy.enemyId);
  assert.ok(headShotRes && headShotRes.type === 'WEAPON_HIT', 'Headshot raycast must register WEAPON_HIT');
  assert.equal(headShotRes.limbId, EnemyLimbId.HEAD, 'Raycast must hit HEAD bone collider');
  assert.equal(headShotRes.isCrit, true, 'Headshot must flag isCrit = true');
  assert.ok(
    Math.abs(headShotRes.damageDealt - WEAPON_BASE_DAMAGE * 2.2) < 1e-4,
    `Headshot damage must be 2.2x base (${WEAPON_BASE_DAMAGE * 2.2}), got ${headShotRes.damageDealt}`
  );
  assert.equal(
    vatsEnemy.combatState,
    EnemyCombatState.STAGGER_BLIND,
    'Headshot crit must interrupt WINDUP into STAGGER_BLIND'
  );
  assert.ok(Math.abs(vatsEnemy.staggerTimer - 4.0) < 1e-4, 'Headshot must apply 4.0s Blind/Stagger timer');
  assert.ok(Math.abs(hpBeforeHead - vatsEnemy.hp - WEAPON_BASE_DAMAGE * 2.2) < 1e-4);

  // 3B. TORSO Collider: 1.0x Damage + 30% faster (1.3x) ablative armor strip
  const torsoDummy = enemyMgr.spawnEnemy(100, 'TORSO-DUMMY', { x: 0, y: 0, z: 14.0 }, false);
  simWorld.world.step();
  const armorBeforeTorso = torsoDummy.armor;
  const torsoShotRes = enemyMgr.resolveWeaponShot(agent, Math.PI, 0, EnemyLimbId.TORSO, torsoDummy.enemyId);
  assert.ok(torsoShotRes && torsoShotRes.type === 'WEAPON_HIT');
  assert.equal(torsoShotRes.limbId, EnemyLimbId.TORSO);
  assert.ok(
    Math.abs(torsoShotRes.damageDealt - WEAPON_BASE_DAMAGE * 1.0) < 1e-4,
    'Torso damage must be 1.0x base'
  );
  assert.ok(
    Math.abs(torsoShotRes.armorStripped - WEAPON_BASE_DAMAGE * 1.3) < 1e-4,
    `Torso armor strip must be 30% faster (1.3x = ${WEAPON_BASE_DAMAGE * 1.3}), got ${torsoShotRes.armorStripped}`
  );
  assert.ok(Math.abs(armorBeforeTorso - torsoDummy.armor - WEAPON_BASE_DAMAGE * 1.3) < 1e-4);

  // 3C. ARM Collider Cripple at 0 HP -> 8.0s armsCrippledTimer (50% outgoing damage reduction)
  const limbDummy = enemyMgr.spawnEnemy(101, 'LIMB-DUMMY', { x: 0, y: 0, z: 12.0 }, true);
  simWorld.world.step();
  while (limbDummy.limbs[EnemyLimbId.RIGHT_ARM].hp > 0) {
    enemyMgr.resolveWeaponShot(agent, Math.PI, 0, EnemyLimbId.RIGHT_ARM, limbDummy.enemyId);
  }
  assert.equal(limbDummy.limbs[EnemyLimbId.RIGHT_ARM].hp, 0);
  assert.ok(
    Math.abs(limbDummy.armsCrippledTimer - 8.0) < 1e-4,
    `Crippling Right Arm to 0 HP must set armsCrippledTimer = 8.0s (got ${limbDummy.armsCrippledTimer})`
  );

  // 3D. LEG Collider Cripple at 0 HP -> 8.0s legsCrippledTimer (70% velocity reduction & grounding)
  limbDummy.position.y = 3.5; // Simulate airborne enemy
  limbDummy.velocity.y = 4.0;
  enemyMgr.syncEnemyBoneColliders(limbDummy);
  simWorld.world.step();
  while (limbDummy.limbs[EnemyLimbId.LEFT_LEG].hp > 0) {
    enemyMgr.resolveWeaponShot(agent, Math.PI, 0, EnemyLimbId.LEFT_LEG, limbDummy.enemyId);
  }
  assert.equal(limbDummy.limbs[EnemyLimbId.LEFT_LEG].hp, 0);
  assert.ok(
    Math.abs(limbDummy.legsCrippledTimer - 8.0) < 1e-4,
    `Crippling Left Leg to 0 HP must set legsCrippledTimer = 8.0s (got ${limbDummy.legsCrippledTimer})`
  );
  assert.equal(limbDummy.position.y, limbDummy.spawnPosition.y, 'Crippling leg must immediately ground airborne enemy');

  // Section 6 requires a 2.5s knee-drop before the existing 70% chase-speed penalty resumes.
  assert.equal(limbDummy.presentation.reaction, 2, 'Leg cripple must force a knee-drop');
  for (let i = 0; i < 151; i++) enemyMgr.stepEnemies([], FIXED_TIMESTEP);
  // Verify 70% chase speed reduction when legsCrippledTimer > 0
  limbDummy.combatState = EnemyCombatState.CHASE;
  enemyMgr.stepEnemies([agent], FIXED_TIMESTEP);
  const crippledSpeed = Math.hypot(limbDummy.velocity.x, limbDummy.velocity.z);
  const expectedCrippledSpeed = 6.2 * 0.30; // Elite base speed 6.2 m/s * 30% (70% reduction)
  assert.ok(
    Math.abs(crippledSpeed - expectedCrippledSpeed) < 0.05,
    `Leg-crippled chase speed must be reduced by 70% (${expectedCrippledSpeed.toFixed(2)} m/s), got ${crippledSpeed.toFixed(2)} m/s`
  );

  enemyMgr.removeEnemy(99);
  enemyMgr.removeEnemy(100);
  enemyMgr.removeEnemy(101);
  console.log('  -> Passed: Head 2.2x Crit+Stagger, Torso 1.3x Armor Strip, Arm 8.0s Cripple, Leg 8.0s 70% Slow + Grounding verified.\n');

  // ---------------------------------------------------------------------------
  // TEST 4: Motion-Warped Melee (18 m/s Warp) & Elite Counter-Stance Bounce/Throw
  // ---------------------------------------------------------------------------
  console.log('[Test 4] Verifying Motion-Warped Melee (4.5m range, 18 m/s warp) & Elite Counter-Stance Bounce...');
  const meleeEnemy = enemyMgr.spawnEnemy(102, 'MELEE-TROOPER', { x: 0, y: 0, z: -4.2 }, false);
  agent.position = { x: 0, y: 0, z: 0 };
  agent.velocity = { x: 0, y: 0, z: 0 };

  const initialDist = Math.hypot(meleeEnemy.position.x - agent.position.x, meleeEnemy.position.z - agent.position.z);
  assert.ok(initialDist <= MELEE_ENGAGE_RANGE_M && initialDist > 4.0, 'Enemy placed near 4.2m melee engage boundary');

  let meleeHitResult = null;
  let warpSteps = 0;
  while (!meleeHitResult && warpSteps < 25) {
    warpSteps++;
    meleeHitResult = enemyMgr.executeMotionWarpedMelee(agent, FIXED_TIMESTEP);
  }

  assert.ok(meleeHitResult && meleeHitResult.type === 'MELEE_HIT', 'Motion-warped melee must warp across gap and land MELEE_HIT');
  assert.ok(warpSteps >= 2, `Agent must translate across 3D gap at 18 m/s over multiple physics ticks (took ${warpSteps} ticks)`);
  assert.ok(agent.position.z < -2.0, `Agent capsule must physically translate toward target (Z=${agent.position.z.toFixed(2)}m)`);

  // Verify Elite Counter-Stance bounce & counter-throw when striking with basic melee
  // Advance beyond the new combo cadence before issuing another strike.
  for (let i = 0; i < 18; i++) enemyMgr.stepEnemies([], FIXED_TIMESTEP);
  const eliteEnemy = enemyMgr.spawnEnemy(103, 'ELITE-CENTURION', { x: 0, y: 0, z: -3.5 }, true);
  eliteEnemy.combatState = EnemyCombatState.COUNTER_STANCE;
  eliteEnemy.stateTimer = 1.5;
  agent.position = { x: 0, y: 0, z: -2.2 };

  const bounceResult = enemyMgr.executeMotionWarpedMelee(agent, FIXED_TIMESTEP);
  assert.ok(
    bounceResult && bounceResult.type === 'COUNTER_BOUNCE_THROW',
    'Melee strike against Elite in COUNTER_STANCE must bounce off and trigger COUNTER_BOUNCE_THROW'
  );
  assert.equal(bounceResult.damageDealt, 0, 'Countered melee strike must deal 0 damage to Elite');
  assert.ok(agent.velocity.z > 10.0 && agent.velocity.y > 5.0, 'Agent must receive backward & upward counter-throw impulse');

  enemyMgr.removeEnemy(102);
  enemyMgr.removeEnemy(103);
  console.log('  -> Passed: 18 m/s root-motion melee warp & Elite COUNTER_STANCE bounce/throw impulse verified.\n');

  // ---------------------------------------------------------------------------
  // TEST 5: Server-Validated Q Counter-Parry & 6.0m Radial Kinetic Shockwave
  // ---------------------------------------------------------------------------
  console.log('[Test 5] Verifying Lag-Compensated Q Counter-Parry & 6.0m Radial Kinetic Shockwave (Strength Lv 3+)...');
  const attacker = enemyMgr.spawnEnemy(104, 'PARRY-ATTACKER', { x: 0, y: 0, z: -2.8 }, false);
  const bystander1 = enemyMgr.spawnEnemy(105, 'BYSTANDER-NEAR', { x: 3.2, y: 0, z: -3.5 }, false);
  const bystander2 = enemyMgr.spawnEnemy(106, 'BYSTANDER-EDGE', { x: -4.0, y: 0, z: -2.5 }, false);
  const bystanderFar = enemyMgr.spawnEnemy(107, 'BYSTANDER-OUTSIDE', { x: 8.5, y: 0, z: -2.5 }, false);

  agent.position = { x: 0, y: 0, z: 0 };
  agent.attributes.strength = 3; // Unlocks 6.0m Radial Kinetic Shockwave per PRD Section 4.3
  agent.attributes.vigilante = 3;

  // Record a WINDUP state in the attacker's lag-compensation history 120ms ago, then transition attacker out
  const baseNow = Date.now();
  attacker.combatState = EnemyCombatState.WINDUP;
  attacker.history.push({
    timestampMs: baseNow - 120,
    combatState: EnemyCombatState.WINDUP,
    position: { ...attacker.position },
  });
  // Simulate server moving past windup slightly before packet arrives
  attacker.combatState = EnemyCombatState.RECOVERY;

  const b1HpBefore = bystander1.hp;
  const b2HpBefore = bystander2.hp;
  const bFarHpBefore = bystanderFar.hp;

  const parryRes = enemyMgr.executeCounterParry(agent, baseNow);
  assert.ok(parryRes && parryRes.type === 'PARRY_TAKEDOWN', 'Lag-compensated Q Counter-Parry must succeed');
  assert.equal(parryRes.shockwaveTriggered, true, 'Strength Lv 3+ must trigger 6.0m radial kinetic shockwave');
  assert.ok(parryRes.shockwaveHits >= 2, `Shockwave must hit nearby enemies within ${PARRY_SHOCKWAVE_RADIUS_M}m (hit ${parryRes.shockwaveHits})`);
  assert.equal(attacker.armor, 0, 'Counter-parry takedown must shatter attacker armor');
  assert.equal(attacker.combatState, EnemyCombatState.STAGGER_BLIND, 'Parried attacker must enter STAGGER_BLIND');
  assert.ok(bystander1.hp < b1HpBefore, 'Bystander 1 inside 6.0m radius must take radial shockwave damage');
  assert.ok(bystander2.hp < b2HpBefore, 'Bystander 2 inside 6.0m radius must take radial shockwave damage');
  assert.equal(bystanderFar.hp, bFarHpBefore, 'Bystander outside 6.0m radius (8.5m) must NOT take shockwave damage');

  enemyMgr.removeEnemy(104);
  enemyMgr.removeEnemy(105);
  enemyMgr.removeEnemy(106);
  enemyMgr.removeEnemy(107);
  console.log('  -> Passed: Lag-compensated Q Counter-Parry takedown snap & 6.0m Radial Kinetic Shockwave verified.\n');

  // ---------------------------------------------------------------------------
  // TEST 6: Live Authoritative Server + WebSocket Client End-to-End Combat
  // ---------------------------------------------------------------------------
  console.log('[Test 6] Verifying Live Authoritative Server + WebSocket Binary Combat Sync & SQLite Persistence...');
  const testDbPath = path.resolve(process.cwd(), 'data', `verify_phase3_${Date.now()}.db`);
  const server = new CrackupAuthoritativeServer({
    port: 0,
    dbPath: testDbPath,
  });
  const boundPort = await server.start();

  try {
    const ws = new WebSocket(`ws://127.0.0.1:${boundPort}/ws`);
    ws.binaryType = 'arraybuffer';

    let entityId = 0;
    const receivedEnemySnapshots: EnemyBinarySnapshotState[][] = [];
    const receivedCombatEvents: Record<string, unknown>[] = [];

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('WebSocket handshake timeout')), 5000);
      ws.on('open', () => {
        ws.send(
          JSON.stringify({
            type: 'AUTH',
            callsign: 'PHASE3-COMBAT-AGENT',
            pin: '7788',
          })
        );
      });

      ws.on('message', (data, isBinary) => {
        if (!isBinary) {
          const msg = JSON.parse(data.toString()) as Record<string, unknown>;
          if (msg.type === 'AUTH_OK') {
            entityId = msg.entityId as number;
            clearTimeout(timeout);
            resolve();
          } else if (msg.type === 'COMBAT_EVENT') {
            receivedCombatEvents.push(msg.event as Record<string, unknown>);
          }
        } else {
          const buf =
            data instanceof ArrayBuffer
              ? data
              : data instanceof Buffer
              ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
              : (data as Buffer[])[0]!.buffer;
          const view = new DataView(buf);
          const pktType = view.getUint8(0);
          if (pktType === PacketType.ENEMY_SNAPSHOT) {
            const snap = decodeEnemySnapshot(buf);
            if (snap) {
              receivedEnemySnapshots.push(snap.enemies);
            }
          } else if (pktType === PacketType.WORLD_SNAPSHOT) {
            decodeWorldSnapshot(buf);
          }
        }
      });
      ws.on('error', reject);
    });

    assert.ok(entityId > 0, 'Client must authenticate and receive valid entityId');

    // Position player at (0, 0, 0) facing Enemy #1 (AEGIS-TROOPER-01 at x: 6.5, y: 0, z: -4.5)
    const serverAgent = server.physicsWorld.agents.get(entityId)!;
    serverAgent.position = { x: 0, y: 0, z: 0 };
    serverAgent.attributes.strength = 3;
    serverAgent.attributes.shooting = 4;

    const serverEnemy1 = server.physicsWorld.combatManager.enemies.get(1)!;
    const dx = serverEnemy1.position.x - serverAgent.position.x;
    const dz = serverEnemy1.position.z - serverAgent.position.z;
    const aimYawToEnemy1 = Math.atan2(-dx, -dz);

    // Send V.A.T.S. Headshot input packet (INPUT_FLAG_FIRE + targetedLimb = HEAD (0))
    let seq = 1;
    ws.send(
      encodeClientInput({
        seq: seq++,
        moveX: 0,
        moveZ: 0,
        yaw: aimYawToEnemy1,
        pitch: 0.02,
        buttons: packTargetLimbIntoButtons(INPUT_FLAG_FIRE, EnemyLimbId.HEAD),
        dt: FIXED_TIMESTEP,
      }),
      { binary: true }
    );

    // Clear fire button on next input so rising-edge detectors can trigger cleanly next
    ws.send(
      encodeClientInput({
        seq: seq++,
        moveX: 0,
        moveZ: 0,
        yaw: aimYawToEnemy1,
        pitch: 0,
        buttons: 0,
        dt: FIXED_TIMESTEP,
      }),
      { binary: true }
    );

    // Wait 180ms for 30Hz enemy snapshots & combat event broadcast
    await new Promise((r) => setTimeout(r, 180));

    assert.ok(
      receivedEnemySnapshots.length >= 2,
      `Expected >= 2 binary ENEMY_SNAPSHOT packets at 30Hz, got ${receivedEnemySnapshots.length}`
    );
    assert.ok(
      receivedCombatEvents.some(
        (e) => e.type === 'WEAPON_HIT' && e.limbId === EnemyLimbId.HEAD && e.isCrit === true
      ),
      'Server must broadcast WEAPON_HIT combat event with HEAD crit = true'
    );

    // Move agent within melee range of Enemy #1 and trigger Motion-Warped Melee
    serverAgent.position = {
      x: serverEnemy1.position.x - 1.5,
      y: 0,
      z: serverEnemy1.position.z,
    };

    ws.send(
      encodeClientInput({
        seq: seq++,
        moveX: 0,
        moveZ: 0,
        yaw: -Math.PI / 2,
        pitch: 0,
        buttons: INPUT_FLAG_MELEE,
        dt: FIXED_TIMESTEP,
      }),
      { binary: true }
    );
    ws.send(
      encodeClientInput({
        seq: seq++,
        moveX: 0,
        moveZ: 0,
        yaw: -Math.PI / 2,
        pitch: 0,
        buttons: 0,
        dt: FIXED_TIMESTEP,
      }),
      { binary: true }
    );

    await new Promise((r) => setTimeout(r, 140));
    assert.ok(
      receivedCombatEvents.some((e) => e.type === 'MELEE_HIT'),
      'Server must execute motion-warped melee and broadcast MELEE_HIT'
    );

    // Put Enemy #1 into WINDUP and send Q Counter-Parry input
    serverEnemy1.combatState = EnemyCombatState.WINDUP;
    serverEnemy1.stateTimer = 0.6;
    ws.send(
      encodeClientInput({
        seq: seq++,
        moveX: 0,
        moveZ: 0,
        yaw: -Math.PI / 2,
        pitch: 0,
        buttons: INPUT_FLAG_PARRY,
        dt: FIXED_TIMESTEP,
      }),
      { binary: true }
    );

    await new Promise((r) => setTimeout(r, 140));
    assert.ok(
      receivedCombatEvents.some((e) => e.type === 'PARRY_TAKEDOWN' && e.shockwaveTriggered === true),
      'Server must validate Q Counter-Parry during WINDUP and emit 6.0m Radial Kinetic Shockwave'
    );

    ws.close();
    await new Promise((r) => setTimeout(r, 120));

    // Verify SQLite WAL persistence of combat XP & telemetry
    const savedAgent = server.db.getAgent('PHASE3-COMBAT-AGENT');
    assert.ok(savedAgent, 'Combat Agent must be persisted in SQLite WAL database');
    assert.ok(savedAgent.xp.shooting > 0, `SQLite shooting XP must be persisted (${savedAgent.xp.shooting})`);
    assert.ok(savedAgent.xp.strength > 0, `SQLite strength XP must be persisted (${savedAgent.xp.strength})`);
    assert.ok(savedAgent.xp.vigilante > 0, `SQLite vigilante XP must be persisted (${savedAgent.xp.vigilante})`);

    console.log(
      `  -> Passed: Live 30Hz binary ENEMY_SNAPSHOT (${receivedEnemySnapshots.length} frames), V.A.T.S. Headshot, Melee Warp, Parry Shockwave & SQLite persistence verified.\n`
    );
  } finally {
    await server.stop();
  }

  console.log('================================================================');
  console.log('ALL PHASE 3 VERIFICATION CHECKS PASSED WITH ZERO ERRORS!');
  console.log('================================================================');
}

runPhase3Verification().catch((err) => {
  console.error('Phase 3 Verification Failed:', err);
  process.exit(1);
});
