import assert from 'node:assert/strict';
import { SharedPhysicsWorld, RAPIER } from '../shared/physics/characterController.js';
import { AugmentChassisId, EnemyCombatState, FIXED_TIMESTEP as DT, INPUT_FLAG_OBJECTIVE_JETPACK } from '../shared/constants.js';
import { SAFE_HOUSE_REGISTRY, TIER2_DISTRICTS } from '../shared/content/worldSystemsRegistry.js';
import { SkirmishOutcome } from '../shared/world/skirmishSystem.js';
import type { Vec3 } from '../shared/protocol/binaryProtocol.js';

export function verifyTier2Objectives(): string[] {
  const sim = new SharedPhysicsWorld(), system = sim.tier2.skirmishSystem, s = system.states[0], d = TIER2_DISTRICTS[0];
  const agent = sim.createAgent(1, 'OBJECTIVES-QA', { x: d.x, y: 0.25, z: d.z + 43 });
  const passed: string[] = [];
  const place = (p: Vec3) => { agent.position = { ...p }; sim.syncAgentKinematicTransform(agent); sim.world.propagateModifiedBodyPositionsToColliders(); sim.world.updateSceneQueries(); };
  const near = () => place({ x: s.position.x + 2.4, y: s.position.y - (s.kindIndex === 2 ? 1.2 : s.kindIndex === 3 ? 1.5 : s.kindIndex === 0 ? 0.9 : 1), z: s.position.z });
  const step = (seconds: number, follow = false) => {
    for (let i = 0; i < Math.ceil(seconds / DT); i++) {
      const wasActive = s.active;
      if (follow) near(); system.step(DT, sim.agents, sim.tier2.stability); sim.world.step();
      if (wasActive && !s.active) break;
    }
  };
  const killActors = () => { for (let j = 0; j < 8; j++) { const e = sim.combatManager.enemies.get(system.actorId(0, j)); if (e) { e.hp = 0; e.combatState = EnemyCombatState.DEAD; } } };
  const begin = (kind: number, far = false) => {
    if (s.active) step(91);
    agent.hp = agent.maxHp; agent.prevButtons = 0;
    // Choose the next deterministic table entry; all spawning and physics remain production paths.
    s.sequence = kind < 2 ? kind : kind - 2; s.cooldown = 0;
    sim.tier2.stability[d.district] = kind < 2 ? 70 : 39;
    place({ x: d.x, y: 0.25, z: d.z + (far ? 65 : 43) }); step(DT);
    assert.equal(s.kindIndex, kind); assert.ok(s.active);
  };
  const shootObjective = () => {
    place({ x: s.position.x, y: s.position.y - 1.55, z: s.position.z + 7 });
    for (let i = 0; i < 100 && s.objectiveHp > 0; i++) sim.combatManager.resolveWeaponShot(agent, 0, 0);
    assert.equal(s.objectiveHp, 0, 'Real weapon probe reaches physical objective');
  };
  try {
    const original = agent.augmentChassis, house = SAFE_HOUSE_REGISTRY[0]; place(house.center);
    assert.equal(sim.tier2.swapChassis(agent, AugmentChassisId.AERO_VALKYRIE), false);
    sim.tier2.unlockedHouses.add(house.id); assert.ok(sim.tier2.swapChassis(agent, AugmentChassisId.AERO_VALKYRIE));
    place({ ...house.center, y: house.center.y + 15 }); assert.equal(sim.tier2.swapChassis(agent, original), false);
    place(house.center); agent.mountedVehicleId = 1001; assert.equal(sim.tier2.swapChassis(agent, original), false); agent.mountedVehicleId = 0;
    agent.hp = 0; assert.equal(sim.tier2.swapChassis(agent, original), false); agent.hp = agent.maxHp;
    passed.push('Safe-house chassis service rejects locked, out-of-volume, mounted and downed Agents');
    for (const id of [...sim.combatManager.enemies.keys()]) sim.combatManager.removeEnemy(id);

    begin(0); const startX = s.position.x;
    place({ ...s.position, y: s.position.y + 25 }); step(1); assert.equal(s.position.x, startX, 'Escort requires physical accompaniment');
    const barrier = sim.world.createCollider(RAPIER.ColliderDesc.cuboid(0.2, 2, 4).setTranslation(startX + 3, 2, s.position.z)); sim.world.updateSceneQueries();
    step(4, true); assert.ok(s.position.x - startX < 3, 'Civilian does not pass through solid obstruction');
    sim.world.removeCollider(barrier, true); sim.world.updateSceneQueries();
    for (let i = 0; i < 1500 && s.active; i++) step(DT, true);
    assert.equal(s.outcome, SkirmishOutcome.SUCCEEDED, `Escorted citizen reaches supported destination: ${JSON.stringify(s)}`);
    passed.push('Escort stops without nearby accompaniment, respects swept obstacles and completes at its destination');

    begin(1); near(); step(1); assert.equal(s.objectiveHp, 25, 'Proximity alone does not repair');
    agent.prevButtons = INPUT_FLAG_OBJECTIVE_JETPACK;
    const repairBarrier = sim.world.createCollider(RAPIER.ColliderDesc.cuboid(0.1, 2, 2).setTranslation(s.position.x + 1.3, s.position.y, s.position.z)); sim.world.updateSceneQueries();
    step(1, true); assert.equal(s.objectiveHp, 25, 'Repair cannot channel through cover');
    sim.world.removeCollider(repairBarrier, true); sim.world.updateSceneQueries(); step(10.1, true);
    assert.equal(s.outcome, SkirmishOutcome.SUCCEEDED); assert.equal(s.objectiveHp, 100);
    begin(1); shootObjective(); step(DT); assert.equal(s.outcome, SkirmishOutcome.FAILED);
    passed.push('Repair requires held interaction and clear 3D reach; restored equipment succeeds, destroyed equipment fails');

    begin(2); killActors(); place({ ...s.position, y: 0.25, z: s.position.z + 6 }); agent.prevButtons = INPUT_FLAG_OBJECTIVE_JETPACK; step(1); assert.ok(s.active, 'Killing crew alone does not recover stolen cargo');
    assert.ok(Math.abs(s.position.x - d.x) > 1, 'Armored van physically advances toward extraction');
    shootObjective(); step(DT); const stoppedX = s.position.x; step(1); assert.equal(s.position.x, stoppedX);
    agent.prevButtons = INPUT_FLAG_OBJECTIVE_JETPACK; step(3.1, true); assert.equal(s.outcome, SkirmishOutcome.SUCCEEDED);
    begin(2, true); step(16); assert.equal(s.outcome, SkirmishOutcome.FAILED, 'Unstopped van escapes with cargo');
    passed.push('Robbery moves an armored van, requires disabling it and recovering cargo, and fails on extraction');

    begin(3); const clinicHp = s.objectiveHp;
    const cover = sim.world.createCollider(RAPIER.ColliderDesc.cuboid(20, 3, 0.2).setTranslation(d.x, 3, d.z + 45)); sim.world.updateSceneQueries();
    step(1); assert.equal(s.objectiveHp, clinicHp, 'Solid cover blocks siege fire');
    sim.world.removeCollider(cover, true); sim.world.updateSceneQueries(); step(1); assert.ok(s.objectiveHp < clinicHp, 'Real attackers damage clinic through clear firing lanes');
    step(45); assert.equal(s.outcome, SkirmishOutcome.FAILED, 'Unprotected clinic falls');
    begin(3); killActors(); step(15); assert.equal(s.stage, 1); assert.ok(sim.combatManager.enemies.has(system.actorId(0, 4)));
    killActors(); step(15); assert.equal(s.stage, 2); assert.ok(sim.combatManager.enemies.has(system.actorId(0, 6)));
    killActors(); step(15.1); assert.equal(s.outcome, SkirmishOutcome.SUCCEEDED); assert.ok(s.objectiveHp > 0);
    passed.push('Clinic siege has health, occluded hostile fire, timed reinforcements, defense victory and destruction failure');

    begin(4, true); assert.equal(s.stage, 0); assert.equal(sim.combatManager.enemies.has(system.actorId(0, 0)), false);
    place({ ...s.position, y: s.position.y + 25 }); step(1); assert.equal(s.stage, 0);
    near(); step(DT); assert.equal(s.stage, 1); assert.equal(s.targetEntityId, agent.entityId); killActors(); step(1); assert.ok(s.active);
    step(5.1); assert.equal(s.stage, 2); assert.ok(sim.combatManager.enemies.has(system.actorId(0, 3)));
    killActors(); step(DT); assert.equal(s.outcome, SkirmishOutcome.SUCCEEDED);
    begin(4); near(); step(DT); agent.hp = 0; step(DT); assert.equal(s.outcome, SkirmishOutcome.FAILED); agent.hp = agent.maxHp;
    passed.push('Ambush waits for 3D trigger entry, tracks its live target, sends a flanking wave and fails on target loss');
    assert.equal([...sim.combatManager.enemies.keys()].filter(id => id >= 63000 && id < 63100).length, 0);
    const bodies = sim.world.bodies.len();
    for (let i = 0; i < 5; i++) { begin(3); step(91); }
    assert.equal(sim.world.bodies.len(), bodies, 'Repeated objectives reuse bodies and remove every spawned actor');
    passed.push('Repeated event cycles clean up all spawned actors without growing the Rapier body count');
    return passed;
  } finally { sim.world.free(); }
}
