/**
 * CRACKUP: Protocol Eclipse (v2.0 True 3D AAA Architecture)
 * Phase 4 Automated Verification Suite:
 * 1. Raycast 4-Wheel Suspension Vehicles (springStiffness, damping, lateralTireFriction, Lv 1->5 topSpeed 28->55 m/s, Agency Interceptor Wall-Thruster Hop)
 * 2. Strength-Based 3D Dynamic Object Picking & Throwing (150kg -> 4000kg across 5 prop tiers) + Spherical Explosive Blast (Rapier3D Ball intersection + inverse-square falloff)
 * 3. 3D Grapple-Hook Physical Tether (45m raycast + pendulum swing constraint + reel-in tension forces)
 * 4. 5 Augment Chassis Classes & 20-Node Multi-Branch Skill Tree + Supersonic Dive-Bomb + SQLite WAL Persistence
 * 5. 4 Physical 3D Prototype Relics, 3D Radar Ping, 3.0s (180-tick) Chrono-Shift Rewind, & Binary VEHICLE_PROP_SNAPSHOT (0x05) Protocol
 */

import path from 'node:path';
import {
  AgentAnimState,
  AugmentChassisId,
  CHRONO_REWIND_TICKS,
  DEFAULT_ATTRIBUTES,
  DistrictId,
  DynamicPropType,
  FIXED_TIMESTEP,
  getDrivingParams,
  getExplosivesParams,
  getStrengthParams,
  INPUT_FLAG_GRAPPLE,
  INPUT_FLAG_JUMP,
  INPUT_FLAG_RELIC_REWIND,
  INPUT_FLAG_VEHICLE_INTERACT,
  PrototypeRelicId,
} from '../shared/constants.js';
import {
  initRapierPhysics,
  SharedPhysicsWorld,
} from '../shared/physics/characterController.js';
import { DYNAMIC_PROP_SPECS } from '../shared/physics/vehicleAndPropSystem.js';
import {
  AUGMENT_CHASSIS_CATALOG,
  checkAgentRelicIntersection,
  computeAgentBuildModifiers,
  computeNearestRelicRadarPing,
  PROTOTYPE_RELIC_SPECS,
  SKILL_TREE_NODES,
} from '../shared/progression/skillTreeSystem.js';
import {
  decodeVehiclePropSnapshot,
  encodeVehiclePropSnapshot,
  PacketType,
} from '../shared/protocol/binaryProtocol.js';
import { AgentDatabase } from '../server/db.js';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[PHASE 4 VERIFICATION FAILED] ${message}`);
  }
}

async function runPhase4Verification(): Promise<void> {
  console.log('================================================================================');
  console.log(' CRACKUP: PROTOCOL ECLIPSE — PHASE 4 AUTOMATED VERIFICATION SUITE');
  console.log('================================================================================');

  await initRapierPhysics();

  // ---------------------------------------------------------------------------
  // TEST 1: RAYCAST 4-WHEEL SUSPENSION VEHICLES & DRIVING CURVES (LV 1 -> LV 5)
  // ---------------------------------------------------------------------------
  console.log('\n[1/5] Verifying Raycast 4-Wheel Suspension Vehicles & Wall-Thruster Hops...');
  const drvLv1 = getDrivingParams(1);
  const drvLv3 = getDrivingParams(3);
  const drvLv4 = getDrivingParams(4);
  const drvLv5 = getDrivingParams(5);

  assert(
    drvLv1.topSpeedMps === 28 && drvLv5.topSpeedMps === 55,
    `Expected Driving topSpeedMps 28 m/s (Lv1) -> 55 m/s (Lv5), got ${drvLv1.topSpeedMps} -> ${drvLv5.topSpeedMps}`
  );
  assert(
    drvLv1.chassisMassKg === 1400 && drvLv5.chassisMassKg === 3200,
    `Expected Vehicle chassisMassKg 1400 kg (Lv1) -> 3200 kg (Lv5), got ${drvLv1.chassisMassKg} -> ${drvLv5.chassisMassKg}`
  );
  assert(
    drvLv5.springStiffness > drvLv1.springStiffness &&
      drvLv5.damping > drvLv1.damping &&
      drvLv5.lateralTireFriction > drvLv1.lateralTireFriction,
    'Expected suspension springStiffness, damping, and lateralTireFriction to scale up from Lv 1 to Lv 5'
  );
  assert(
    !drvLv1.unlockWallThrusterHop &&
      !drvLv3.unlockWallThrusterHop &&
      drvLv4.unlockWallThrusterHop &&
      drvLv5.unlockWallThrusterHop,
    'Expected Agency Interceptor vertical Wall-Thruster Hop to unlock at Driving Lv 4+'
  );

  const physicsWorld = new SharedPhysicsWorld();
  const interceptor = physicsWorld.vehiclePropManager.vehicles.get(1)!;
  assert(Boolean(interceptor && interceptor.isInterceptor), 'Expected Agency Interceptor #1 to exist');

  const agent = physicsWorld.createAgent(
    1,
    'VANGUARD-PHASE4',
    { x: interceptor.position.x, y: 0.95, z: interceptor.position.z + 1.5 },
    { x: 0, y: 0, z: 0, w: 1 },
    { ...DEFAULT_ATTRIBUTES }
  );

  // Mount Agency Interceptor (#1) via INPUT_FLAG_VEHICLE_INTERACT (E key)
  physicsWorld.applyAgentInput(agent, {
    seq: 1,
    moveX: 0,
    moveZ: 0,
    yaw: 0,
    pitch: 0,
    buttons: INPUT_FLAG_VEHICLE_INTERACT,
    dt: FIXED_TIMESTEP,
  });
  physicsWorld.stepWorld();

  assert(
    agent.mountedVehicleId === interceptor.vehicleId && interceptor.driverEntityId === agent.entityId,
    `Expected Agent to mount Agency Interceptor #1, got mountedVehicleId=${agent.mountedVehicleId}`
  );
  assert(
    agent.animState === AgentAnimState.DRIVING_VEHICLE,
    `Expected AgentAnimState.DRIVING_VEHICLE while mounted, got ${AgentAnimState[agent.animState]}`
  );

  const startVehicleX = interceptor.position.x;
  const startVehicleZ = interceptor.position.z;
  // Drive forward for 35 ticks at Driving Lv 1
  for (let tick = 2; tick <= 36; tick++) {
    physicsWorld.applyAgentInput(agent, {
      seq: tick,
      moveX: 0.25,
      moveZ: 1.0,
      yaw: 0,
      pitch: 0,
      buttons: 0,
      dt: FIXED_TIMESTEP,
    });
    physicsWorld.stepWorld();
  }

  const drivenDist = Math.hypot(
    interceptor.position.x - startVehicleX,
    interceptor.position.z - startVehicleZ
  );
  const wheelCompRatios = interceptor.wheels.map((w) => w.compressionRatio);
  const wheelCompSum = wheelCompRatios.reduce((a, b) => a + b, 0);
  assert(
    drivenDist > 2.5,
    `Expected 4-wheel suspension vehicle to accelerate across Neo-Veridia, moved ${drivenDist.toFixed(2)}m`
  );
  assert(
    wheelCompSum > 0,
    `Expected 4-wheel raycast suspension to register positive wheel compression ratios, got [${wheelCompRatios.join(', ')}]`
  );

  // Upgrade Agent Driving to Lv 5 and trigger Agency Interceptor Vertical Wall-Thruster Hop (Space)
  agent.attributes.driving = 5;
  const preHopY = interceptor.position.y;
  physicsWorld.applyAgentInput(agent, {
    seq: 37,
    moveX: 0,
    moveZ: 1.0,
    yaw: 0,
    pitch: 0,
    buttons: INPUT_FLAG_JUMP,
    dt: FIXED_TIMESTEP,
  });
  physicsWorld.stepWorld();

  assert(
    interceptor.wallThrusterActive && interceptor.velocity.y > 7.0,
    `Expected Agency Interceptor Wall-Thruster Hop at Driving Lv 5 to impart upward velocity > 7 m/s, got vy=${interceptor.velocity.y.toFixed(2)}`
  );

  for (let tick = 38; tick <= 48; tick++) {
    physicsWorld.applyAgentInput(agent, {
      seq: tick,
      moveX: 0,
      moveZ: 0.5,
      yaw: 0,
      pitch: 0,
      buttons: 0,
      dt: FIXED_TIMESTEP,
    });
    physicsWorld.stepWorld();
  }
  assert(
    interceptor.position.y > preHopY + 0.6,
    `Expected Wall-Thruster Hop to elevate vehicle chassis (preY=${preHopY.toFixed(2)}, postY=${interceptor.position.y.toFixed(2)})`
  );

  // Dismount vehicle with INPUT_FLAG_VEHICLE_INTERACT (E key)
  physicsWorld.applyAgentInput(agent, {
    seq: 49,
    moveX: 0,
    moveZ: 0,
    yaw: 0,
    pitch: 0,
    buttons: INPUT_FLAG_VEHICLE_INTERACT,
    dt: FIXED_TIMESTEP,
  });
  physicsWorld.stepWorld();
  assert(agent.mountedVehicleId === 0, 'Expected Agent to dismount vehicle cleanly (mountedVehicleId === 0)');

  console.log(
    `  ✓ 4-Wheel Suspension Vehicle verified: drivenDist=${drivenDist.toFixed(2)}m, wheelCompression=[${wheelCompRatios.map((c) => c.toFixed(2)).join(', ')}], Wall-Thruster Hop peak Y=${interceptor.position.y.toFixed(2)}m`
  );

  // ---------------------------------------------------------------------------
  // TEST 2: STRENGTH-BASED 3D PROP PICKING & THROWING (150KG -> 4000KG) + SPHERICAL EXPLOSIONS
  // ---------------------------------------------------------------------------
  console.log(
    '\n[2/5] Verifying Strength-Based 3D Prop Throwing (150kg -> 4000kg) & Spherical Blast Falloff...'
  );
  const strLv1 = getStrengthParams(1);
  const strLv3 = getStrengthParams(3);
  const strLv5 = getStrengthParams(5);

  assert(
    strLv1.throwMassLimitKg === 150 &&
      strLv3.throwMassLimitKg === 2075 &&
      strLv5.throwMassLimitKg === 4000,
    `Expected Strength throwMassLimitKg 150 -> 2075 -> 4000 kg, got ${strLv1.throwMassLimitKg}, ${strLv3.throwMassLimitKg}, ${strLv5.throwMassLimitKg}`
  );
  assert(
    DYNAMIC_PROP_SPECS[DynamicPropType.CRYO_BARREL].massKg === 85 &&
      DYNAMIC_PROP_SPECS[DynamicPropType.STEEL_DUMPSTER].massKg === 140 &&
      DYNAMIC_PROP_SPECS[DynamicPropType.CONCRETE_BARRIER].massKg === 850 &&
      DYNAMIC_PROP_SPECS[DynamicPropType.CARGO_CONTAINER].massKg === 2000 &&
      DYNAMIC_PROP_SPECS[DynamicPropType.APC_WRECK].massKg === 3400,
    'Expected 5 dynamic prop tiers (85kg, 140kg, 850kg, 2000kg, 3400kg)'
  );

  // Set neutral chassis modifier (PHANTOM_SHARPSHOOTER has 1.0x throwMassBonusMultiplier) to test pure Strength Lv 1..5 limits
  agent.augmentChassis = AugmentChassisId.PHANTOM_SHARPSHOOTER;
  agent.buildModifiers = computeAgentBuildModifiers(
    agent.augmentChassis,
    agent.unlockedSkills,
    agent.unlockedRelics
  );

  const apcProp = Array.from(physicsWorld.vehiclePropManager.props.values()).find(
    (p) => p.propType === DynamicPropType.APC_WRECK
  )!;
  const barrierProp = Array.from(physicsWorld.vehiclePropManager.props.values()).find(
    (p) => p.propType === DynamicPropType.CONCRETE_BARRIER
  )!;
  const dumpsterProp = Array.from(physicsWorld.vehiclePropManager.props.values()).find(
    (p) => p.propType === DynamicPropType.STEEL_DUMPSTER
  )!;

  // At Strength Lv 1 (max 150kg), attempting to lift 3400kg APC Wreck must fail with TOO_HEAVY
  agent.attributes.strength = 1;
  agent.position = { x: apcProp.position.x, y: 0.0, z: apcProp.position.z + 1.5 };
  physicsWorld.syncAgentKinematicTransform(agent);
  physicsWorld.world.step();

  const tryLiftApcLv1 = physicsWorld.vehiclePropManager.tryPickupOrThrowProp(agent, 0, 0.2);
  assert(
    tryLiftApcLv1.action === 'TOO_HEAVY',
    `Expected 3400kg APC Wreck to be TOO_HEAVY at Strength Lv 1 (150kg max), got ${tryLiftApcLv1.action}`
  );

  // At Strength Lv 1 (150kg max), lifting 140kg Steel Dumpster succeeds!
  agent.position = {
    x: dumpsterProp.position.x,
    y: 0.0,
    z: dumpsterProp.position.z + 1.5,
  };
  physicsWorld.syncAgentKinematicTransform(agent);
  physicsWorld.world.step();

  const tryLiftDumpsterLv1 = physicsWorld.vehiclePropManager.tryPickupOrThrowProp(agent, 0, 0.2);
  assert(
    tryLiftDumpsterLv1.action === 'PICKED_UP' && agent.heldPropId === dumpsterProp.propId,
    `Expected 140kg Steel Dumpster to be PICKED_UP at Strength Lv 1, got ${tryLiftDumpsterLv1.action}`
  );

  // Throw the 140kg Steel Dumpster
  const throwDumpster = physicsWorld.vehiclePropManager.tryPickupOrThrowProp(agent, 0, 0.25);
  assert(
    throwDumpster.action === 'THROWN' && agent.heldPropId === 0 && agent.telemetry.propsThrown === 1,
    'Expected second F-press to hurl the held 140kg Steel Dumpster'
  );

  // Upgrade Agent to Strength Lv 3 (2075kg max) -> can lift 850kg Concrete Barrier
  agent.attributes.strength = 3;
  agent.position = {
    x: barrierProp.position.x,
    y: 0.0,
    z: barrierProp.position.z + 1.5,
  };
  physicsWorld.syncAgentKinematicTransform(agent);
  physicsWorld.world.step();

  const tryLiftBarrierLv3 = physicsWorld.vehiclePropManager.tryPickupOrThrowProp(agent, 0, 0.2);
  assert(
    tryLiftBarrierLv3.action === 'PICKED_UP',
    `Expected 850kg Concrete Barrier to be PICKED_UP at Strength Lv 3, got ${tryLiftBarrierLv3.action}`
  );
  physicsWorld.vehiclePropManager.tryPickupOrThrowProp(agent, 0, 0.2);

  // Upgrade Agent to Strength Lv 5 (4000kg max) -> can lift and hurl the 3400kg APC Wreck!
  agent.attributes.strength = 5;
  agent.position = { x: apcProp.position.x, y: 0.0, z: apcProp.position.z + 1.6 };
  physicsWorld.syncAgentKinematicTransform(agent);
  physicsWorld.world.step();

  const tryLiftApcLv5 = physicsWorld.vehiclePropManager.tryPickupOrThrowProp(agent, 0, 0.25);
  assert(
    tryLiftApcLv5.action === 'PICKED_UP' && agent.heldPropId === apcProp.propId,
    `Expected 3400kg APC Wreck to be PICKED_UP at Strength Lv 5 (4000kg max), got ${tryLiftApcLv5.action}`
  );

  const throwApcLv5 = physicsWorld.vehiclePropManager.tryPickupOrThrowProp(agent, 0, 0.3);
  const apcVelMag = Math.hypot(apcProp.velocity.x, apcProp.velocity.y, apcProp.velocity.z);
  assert(
    throwApcLv5.action === 'THROWN' && apcVelMag > 10.0,
    `Expected thrown 3400kg APC Wreck to launch at >10 m/s, got ${apcVelMag.toFixed(2)} m/s`
  );

  // Now verify Rapier3D intersectionsWithShape(Ball(blastRadius)) spherical explosion & inverse-square falloff
  const expLv1 = getExplosivesParams(1);
  const expLv5 = getExplosivesParams(5);
  assert(
    expLv1.blastRadiusMeters === 4.5 && expLv5.blastRadiusMeters === 12.0,
    `Expected Explosives blastRadius 4.5m (Lv1) -> 12.0m (Lv5), got ${expLv1.blastRadiusMeters} -> ${expLv5.blastRadiusMeters}`
  );
  assert(
    expLv1.impulseNs === 18.0 && expLv5.impulseNs === 65.0,
    `Expected Explosives impulseNs 18 N*s (Lv1) -> 65 N*s (Lv5), got ${expLv1.impulseNs} -> ${expLv5.impulseNs}`
  );

  agent.attributes.explosives = 5;
  const blastCenter = { x: 0.0, y: 1.0, z: 22.0 };
  const innerEnemy = physicsWorld.combatManager.spawnEnemy(
    901,
    DistrictId.FOUNDRY_SLUMS,
    { x: 0.0, y: 0.0, z: 20.0 },
    false
  ); // 2.0m away
  const outerEnemy = physicsWorld.combatManager.spawnEnemy(
    902,
    DistrictId.FOUNDRY_SLUMS,
    { x: 0.0, y: 0.0, z: 14.5 },
    false
  ); // 7.5m away
  physicsWorld.world.step();

  const innerHpBefore = innerEnemy.hp;
  const outerHpBefore = outerEnemy.hp;

  const blastEvents = physicsWorld.vehiclePropManager.triggerSphericalExplosion(
    agent,
    blastCenter,
    1.0
  );

  const innerDamage = innerHpBefore - innerEnemy.hp;
  const outerDamage = outerHpBefore - outerEnemy.hp;

  assert(
    blastEvents.length >= 2,
    `Expected spherical Ball(12.0m) intersection to hit both inner and outer enemies, hit ${blastEvents.length}`
  );
  assert(
    innerDamage > outerDamage && outerDamage > 0,
    `Expected inverse-square falloff damage (inner 2.0m dmg=${innerDamage.toFixed(1)} > outer 7.5m dmg=${outerDamage.toFixed(1)} > 0)`
  );

  console.log(
    `  ✓ Strength 3D Prop Throwing & Spherical Blast verified: 3400kg APC thrown at ${apcVelMag.toFixed(1)} m/s, Ball(12.0m) innerDmg=${innerDamage.toFixed(1)} > outerDmg=${outerDamage.toFixed(1)}`
  );

  // ---------------------------------------------------------------------------
  // TEST 3: 3D GRAPPLE-HOOK PHYSICAL TETHER (45M RAYCAST + PENDULUM SWING)
  // ---------------------------------------------------------------------------
  console.log('\n[3/5] Verifying 45m 3D Grapple-Hook Physical Tether & Pendulum Swing...');
  // Place Agent facing mantle_terrace_tier_5 (center: 0, 5.0, -32.0; front face z = -28.5, height 0..10m)
  agent.position = { x: 0.0, y: 0.0, z: -2.0 };
  agent.velocity = { x: 0, y: 0, z: 0 };
  agent.grappleActive = false;
  agent.prevButtons = 0;
  physicsWorld.syncAgentKinematicTransform(agent);
  physicsWorld.world.step();

  // Pitch camera upward (+0.24 rad) facing North (yaw = 0 -> -Z) so the 45m raycast anchors onto mantle_terrace_tier_5 at y ~ 8.0m
  const grappleStartY = agent.position.y;
  for (let tick = 60; tick <= 95; tick++) {
    physicsWorld.applyAgentInput(agent, {
      seq: tick,
      moveX: 0.35,
      moveZ: 1.0,
      yaw: 0.0,
      pitch: 0.24,
      buttons: INPUT_FLAG_GRAPPLE,
      dt: FIXED_TIMESTEP,
    });
    physicsWorld.stepWorld();
    if (tick === 60) {
      assert(
        agent.grappleActive,
        'Expected 45m Grapple Tether raycast to anchor onto Neo-Veridia structure'
      );
      assert(
        agent.animState === AgentAnimState.GRAPPLE_SWING,
        `Expected AgentAnimState.GRAPPLE_SWING, got ${AgentAnimState[agent.animState]}`
      );
    }
  }

  assert(
    agent.position.y > grappleStartY + 1.5 && agent.position.z < -4.0,
    `Expected Grapple Tether reel-in tension + pendulum swing to pull Agent upward and forward (startY=${grappleStartY.toFixed(2)} -> endY=${agent.position.y.toFixed(2)}, z=${agent.position.z.toFixed(2)})`
  );
  assert(
    (agent.telemetry.grappleSwingsExecuted ?? 0) >= 1,
    `Expected agent.telemetry.grappleSwingsExecuted >= 1, got ${agent.telemetry.grappleSwingsExecuted}`
  );

  // Release grapple
  physicsWorld.applyAgentInput(agent, {
    seq: 96,
    moveX: 0,
    moveZ: 0,
    yaw: 0,
    pitch: 0,
    buttons: 0,
    dt: FIXED_TIMESTEP,
  });
  assert(!agent.grappleActive, 'Expected Grapple Tether to release when G key is released');

  console.log(
    `  ✓ 3D Grapple-Hook Tether verified: anchor=(${agent.grappleAnchor.x.toFixed(1)}, ${agent.grappleAnchor.y.toFixed(1)}, ${agent.grappleAnchor.z.toFixed(1)}), elevated Agent Y from ${grappleStartY.toFixed(2)}m -> ${agent.position.y.toFixed(2)}m`
  );

  // ---------------------------------------------------------------------------
  // TEST 4: 5 AUGMENT CHASSIS CLASSES, 20-NODE SKILL TREE, SUPERSONIC DIVE-BOMB & SQLITE WAL
  // ---------------------------------------------------------------------------
  console.log(
    '\n[4/5] Verifying 5 Augment Chassis, 20-Node Skill Tree, Supersonic Dive-Bomb & SQLite WAL...'
  );
  const chassisKeys = Object.keys(AUGMENT_CHASSIS_CATALOG) as AugmentChassisId[];
  assert(chassisKeys.length === 5, `Expected 5 Augment Chassis classes, got ${chassisKeys.length}`);
  assert(SKILL_TREE_NODES.length === 20, `Expected 20 Skill Tree nodes, got ${SKILL_TREE_NODES.length}`);

  for (const branch of chassisKeys) {
    const branchCount = SKILL_TREE_NODES.filter((n) => n.branch === branch).length;
    assert(branchCount === 4, `Expected 4 Skill Tree nodes for branch ${branch}, got ${branchCount}`);
  }

  // Unlock all 20 Skill Tree nodes and 4 Relics on the Agent and verify modifier aggregation
  const allSkillIds = SKILL_TREE_NODES.map((n) => n.id);
  const allRelicIds = PROTOTYPE_RELIC_SPECS.map((r) => r.id);
  agent.augmentChassis = AugmentChassisId.TITAN_JUGGERNAUT;
  agent.unlockedSkills = new Set(allSkillIds);
  agent.unlockedRelics = new Set(allRelicIds);

  const mods = computeAgentBuildModifiers(
    agent.augmentChassis,
    agent.unlockedSkills,
    agent.unlockedRelics
  );
  agent.buildModifiers = mods;

  assert(mods.unlockDiveBombShockwave, 'Expected aero_4_supersonic_divebomb to unlock dive-bomb');
  assert(mods.restoreAirDashOnCripple, 'Expected phantom_4_phase_ricochet to unlock restoreAirDashOnCripple');
  assert(mods.chronoRewindUnlocked, 'Expected CHRONO_SHIFT_ANCHOR to unlock 3.0s Chrono-Rewind');
  assert(
    mods.throwMassBonusMultiplier > 1.4 &&
      mods.lockOnRangeBonusM >= 15.0 &&
      mods.blastRadiusMultiplier > 1.2 &&
      mods.parryWindowBonusMs >= 120,
    'Expected all 5 skill branches to aggregate physics and combat modifiers cleanly'
  );

  // Test aero_4_supersonic_divebomb: drop Agent onto ground at vy <= -26 m/s near an enemy
  const diveTargetEnemy = physicsWorld.combatManager.spawnEnemy(
    905,
    DistrictId.FOUNDRY_SLUMS,
    { x: 10.0, y: 0.0, z: 16.0 },
    false
  );
  const enemyHpBeforeDive = diveTargetEnemy.hp;
  agent.position = { x: 8.5, y: 0.35, z: 16.0 };
  agent.grounded = false;
  agent.velocity = { x: 0, y: -28.5, z: 0 };
  physicsWorld.syncAgentKinematicTransform(agent);
  physicsWorld.world.step();

  for (let tick = 100; tick <= 106; tick++) {
    physicsWorld.applyAgentInput(agent, {
      seq: tick,
      moveX: 0,
      moveZ: 0,
      yaw: 0,
      pitch: 0,
      buttons: 0,
      dt: FIXED_TIMESTEP,
    });
    physicsWorld.stepWorld();
    if (agent.grounded) break;
  }

  assert(
    diveTargetEnemy.hp < enemyHpBeforeDive,
    `Expected Supersonic Dive-Bomb landing (vy <= -26 m/s) to trigger a 15m spherical shockwave damaging nearby enemy (${enemyHpBeforeDive} -> ${diveTargetEnemy.hp})`
  );

  // Verify SQLite WAL persistence of Augment Chassis, 20 Skill Tree nodes, and 4 Relics
  const tmpDbPath = path.resolve(process.cwd(), 'data', `verify_phase4_${Date.now()}.db`);
  const db = new AgentDatabase(tmpDbPath);
  const authRes = db.authenticateOrCreate('PHASE4-SQLITE', '4444');
  assert(authRes.ok && Boolean(authRes.record), 'Expected SQLite WAL agent creation to succeed');

  if (authRes.ok) {
    authRes.record.augmentChassis = AugmentChassisId.DEMOLITION_SAVANT;
    authRes.record.unlockedSkills = [...allSkillIds];
    authRes.record.unlockedRelics = [...allRelicIds];
    db.saveAgent(authRes.record);
  }

  const reloaded = db.authenticateOrCreate('PHASE4-SQLITE', '4444');
  assert(
    reloaded.ok &&
      reloaded.record.augmentChassis === AugmentChassisId.DEMOLITION_SAVANT &&
      reloaded.record.unlockedSkills.length === 20 &&
      reloaded.record.unlockedRelics.length === 4,
    'Expected SQLite WAL to persist augmentChassis, 20 unlockedSkills, and 4 unlockedRelics across sessions'
  );
  db.close();
  console.log(
    `  ✓ 5 Augment Chassis & 20 Skill Tree Nodes verified: Supersonic Dive-Bomb dealt ${enemyHpBeforeDive - diveTargetEnemy.hp} shockwave dmg, SQLite WAL persisted 20/20 skills & 4/4 relics`
  );

  // ---------------------------------------------------------------------------
  // TEST 5: 4 PROTOTYPE RELICS, 3D RADAR PING, 3.0S CHRONO-REWIND & BINARY SNAPSHOT (0x05)
  // ---------------------------------------------------------------------------
  console.log(
    '\n[5/5] Verifying 4 Prototype Relics, 3D Radar Ping, 3.0s (180-tick) Chrono-Shift Rewind & Binary Protocol 0x05...'
  );
  assert(
    PROTOTYPE_RELIC_SPECS.length === 4,
    `Expected 4 Physical 3D Prototype Relics, got ${PROTOTYPE_RELIC_SPECS.length}`
  );

  // Test 3D Relic Radar Ping before collecting all relics
  const partialRelics = new Set<string>();
  const radarPing = computeNearestRelicRadarPing({ x: 0, y: 1.0, z: 0 }, partialRelics);
  assert(
    radarPing !== null &&
      radarPing.distanceMeters > 10 &&
      Number.isFinite(radarPing.bearingYawRad) &&
      Number.isFinite(radarPing.elevationDeltaMeters),
    'Expected computeNearestRelicRadarPing to return 3D distance, bearingYawRad, and elevationDeltaMeters'
  );

  // Verify physical 3D collision with CHRONO_SHIFT_ANCHOR (0, 7.0, -20.0)
  const chronoSpec = PROTOTYPE_RELIC_SPECS.find(
    (r) => r.id === PrototypeRelicId.CHRONO_SHIFT_ANCHOR
  )!;
  const hitRelic = checkAgentRelicIntersection(
    { x: chronoSpec.position.x, y: chronoSpec.position.y - 0.95, z: chronoSpec.position.z },
    chronoSpec.position
  );
  assert(
    hitRelic === true,
    'Expected checkAgentRelicIntersection to detect physical 3D collision with CHRONO_SHIFT_ANCHOR'
  );

  // Verify 3.0-second (180-tick at 60Hz) Chrono-Shift Rewind (R Key)
  agent.chronoHistory.length = 0;
  agent.hp = 180;
  const originPos = { x: 12.0, y: 0.0, z: 12.0 };
  agent.position = { ...originPos };
  agent.velocity = { x: 0, y: 0, z: 0 };
  agent.prevButtons = 0;
  physicsWorld.syncAgentKinematicTransform(agent);
  physicsWorld.world.step();

  // Simulate 180 ticks (3.00 seconds at 60Hz) of running away
  for (let i = 0; i < CHRONO_REWIND_TICKS; i++) {
    const seq = 200 + i;
    physicsWorld.applyAgentInput(agent, {
      seq,
      moveX: 1.0,
      moveZ: -1.0,
      yaw: 0.5,
      pitch: 0,
      buttons: 0,
      dt: FIXED_TIMESTEP,
    });
    physicsWorld.stepWorld();
  }

  // Damage the agent at t = 3.0s
  agent.hp = 55;
  const displacedDist = Math.hypot(
    agent.position.x - originPos.x,
    agent.position.z - originPos.z
  );
  assert(
    displacedDist > 8.0,
    `Expected Agent to displace >8m over 180 ticks (3.0s), moved ${displacedDist.toFixed(2)}m`
  );

  // Press R (INPUT_FLAG_RELIC_REWIND) on tick 381
  physicsWorld.applyAgentInput(agent, {
    seq: 381,
    moveX: 0,
    moveZ: 0,
    yaw: 0,
    pitch: 0,
    buttons: INPUT_FLAG_RELIC_REWIND,
    dt: FIXED_TIMESTEP,
  });
  physicsWorld.stepWorld();

  const rewindErrorMeters = Math.hypot(
    agent.position.x - originPos.x,
    agent.position.y - originPos.y,
    agent.position.z - originPos.z
  );
  assert(
    rewindErrorMeters < 0.35 &&
      agent.hp === 180 &&
      (agent.telemetry.chronoRewindsExecuted ?? 0) >= 1,
    `Expected 3.0s Chrono-Shift Rewind to restore 180-tick-ago position (err=${rewindErrorMeters.toFixed(3)}m) and HP=${agent.hp}`
  );

  // Verify Binary PacketType.VEHICLE_PROP_SNAPSHOT (0x05) serialization round-trip
  const vehicleSnaps = physicsWorld.vehiclePropManager.toBinaryVehicleSnapshots();
  const propSnaps = physicsWorld.vehiclePropManager.toBinaryPropSnapshots();
  const encodedBuf = encodeVehiclePropSnapshot(381, vehicleSnaps, propSnaps);
  const expectedBytes = 4 + vehicleSnaps.length * 32 + propSnaps.length * 28;

  assert(
    encodedBuf.byteLength === expectedBytes,
    `Expected binary VEHICLE_PROP_SNAPSHOT byteLength=${expectedBytes}, got ${encodedBuf.byteLength}`
  );
  assert(
    new DataView(encodedBuf).getUint8(0) === PacketType.VEHICLE_PROP_SNAPSHOT,
    'Expected PacketType.VEHICLE_PROP_SNAPSHOT (0x05) header byte'
  );

  const decodedSnap = decodeVehiclePropSnapshot(encodedBuf);
  assert(
    decodedSnap !== null &&
      decodedSnap.serverTickLow8 === (381 & 0xff) &&
      decodedSnap.vehicles.length === vehicleSnaps.length &&
      decodedSnap.props.length === propSnaps.length,
    'Expected decoded VEHICLE_PROP_SNAPSHOT counts and serverTickLow8 to match exactly'
  );

  console.log(
    `  ✓ Prototype Relics, 3.0s Chrono-Rewind (err=${(rewindErrorMeters * 100).toFixed(1)}cm, HP restored to ${agent.hp}), & Binary Packet 0x05 (${encodedBuf.byteLength} bytes for ${vehicleSnaps.length} vehicles + ${propSnaps.length} props) verified!`
  );

  console.log('\n================================================================================');
  console.log(' PHASE 4 VERIFICATION COMPLETE — ALL 5/5 SUITES PASSED WITH ZERO ERRORS');
  console.log('================================================================================');
}

runPhase4Verification().catch((err) => {
  console.error(err);
  process.exit(1);
});
