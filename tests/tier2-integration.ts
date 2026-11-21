import assert from 'node:assert/strict';
import { SharedPhysicsWorld } from '../shared/physics/characterController.js';
import { DEFAULT_ATTRIBUTES, DynamicPropType, FIXED_TIMESTEP as DT, INPUT_FLAG_FIRE, INPUT_FLAG_GRAB_THROW, INPUT_FLAG_OBJECTIVE_JETPACK } from '../shared/constants.js';
import { RADAR_NODE_SPECS, SAFE_HOUSE_REGISTRY } from '../shared/content/worldSystemsRegistry.js';
import type { Vec3 } from '../shared/protocol/binaryProtocol.js';

/** Exercise services and attacks through ordinary player input and the full world tick. */
export function verifyTier2Integration(): string[] {
  const sim = new SharedPhysicsWorld(), passed: string[] = [];
  const a = sim.createAgent(1, 'TIER2-INPUT', { x: 0, y: 0, z: 0 }, undefined, { ...DEFAULT_ATTRIBUTES, strength: 3 });
  let seq = 0;
  const step = (buttons = 0, yaw = 0, pitch = 0) => {
    sim.applyAgentInput(a, { seq: ++seq, dt: DT, moveX: 0, moveZ: 0, yaw, pitch, buttons }); sim.stepWorld();
  };
  const place = (p: Vec3) => {
    a.position = { ...p }; a.velocity = { x: 0, y: 0, z: 0 }; a.prevButtons = 0; a.grounded = false;
    a.mantling = a.grappleActive = a.jetpackActive = false;
    sim.syncAgentKinematicTransform(a); sim.world.propagateModifiedBodyPositionsToColliders(); sim.world.updateSceneQueries();
    for (let i = 0; i < 12; i++) step();
    assert.ok(a.grounded, `Authored support beneath ${JSON.stringify(p)}`);
  };
  try {
    for (const id of [...sim.combatManager.enemies.keys()]) sim.combatManager.removeEnemy(id);
    for (const house of SAFE_HOUSE_REGISTRY) {
      place({ ...house.center, y: house.kind === 'ROOFTOP_PAD' ? house.center.y - 1 : 0.2 });
      sim.tier2.charges.set(a.entityId, 0); a.hp = a.maxHp - 50;
      step(INPUT_FLAG_OBJECTIVE_JETPACK);
      assert.equal(sim.tier2.charges.get(a.entityId), 3, `Facility ${house.id} resupplies via H`);
      assert.equal(a.hp, a.maxHp);
      if (house.kind === 'ROOFTOP_PAD') assert.ok(sim.tier2.airspace.aircraft.get(1000 + house.id)!.state.active);
      else assert.ok(sim.vehiclePropManager.vehicles.has(900 + house.id));
    }
    passed.push('Normal H input resupplies and spawns the correct vehicle at all eight physically supported facilities');

    for (const spec of RADAR_NODE_SPECS) {
      place({ x: spec.center.x + 4, y: spec.center.y - 1, z: spec.center.z });
      for (let i = 0; i < 10 && sim.tier2.airspace.radar.get(spec.id)!.hp > 0; i++) {
        step(INPUT_FLAG_FIRE, Math.PI / 2); step(0, Math.PI / 2);
      }
      assert.equal(sim.tier2.airspace.radar.get(spec.id)!.hp, 0, `Normal on-foot gunfire disables radar ${spec.id}`);
    }
    passed.push('Normal on-foot gunfire destroys all four rooftop radar nodes from their actual landing platforms');

    const wall = sim.tier2.architecture.get(10)!;
    place({ x: wall.spec.center.x, y: 32, z: wall.spec.center.z + 3 });
    const prop = sim.vehiclePropManager.spawnDynamicProp(65000, DynamicPropType.CARGO_CONTAINER,
      { x: a.position.x, y: a.position.y + 1, z: a.position.z + 1 });
    sim.world.updateSceneQueries(); step(INPUT_FLAG_GRAB_THROW); assert.equal(a.heldPropId, prop.propId);
    step(); step(INPUT_FLAG_GRAB_THROW); assert.equal(a.heldPropId, 0);
    for (let i = 0; i < 60 && !wall.state.broken; i++) step();
    assert.ok(wall.state.broken, `Actual Strength Lv 3 cargo throw breaches wall; remaining HP ${wall.state.hp}`);
    passed.push('Normal pickup/throw input breaches a 250 HP wall with an actual Strength Lv 3 cargo projectile');
    return passed;
  } finally { sim.world.free(); }
}
