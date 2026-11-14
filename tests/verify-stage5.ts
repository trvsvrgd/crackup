import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  EffectKind,
  effectSpec,
  encodeEffects,
  decodeEffects,
  COUNTER_CONTACT_SEC,
  type EffectEvent,
} from "../shared/protocol/presentationProtocol.js";
import { PresentationEventBus } from "../shared/combat/presentationEvents.js";
import { PresentationQueue } from "../client/animation/presentationQueue.js";
import {
  CombatEffects,
  EFFECT_POOL_LIMITS,
} from "../client/animation/combatEffects.js";
import {
  initRapierPhysics,
  SharedPhysicsWorld,
  RAPIER,
} from "../shared/physics/characterController.js";
import { EnemyLimbId, EnemyCombatState } from "../shared/constants.js";

const point = { x: 0, y: 1, z: 0 },
  bus = new PresentationEventBus(() => 1234);
for (let kind = 0; kind < 8; kind++)
  bus.emit(
    effectSpec(kind, point, {
      actor: 4,
      target: 5,
      flags: kind === EffectKind.SHOT ? 1 : 0,
      delay: kind === EffectKind.COUNTER ? COUNTER_CONTACT_SEC : 0,
    }),
  );
const events = bus.drain(),
  encoded = encodeEffects({ tick: 1234, events }),
  decoded = decodeEffects(encoded)!;
assert.equal(decoded.events.length, 8);
assert.equal(encoded.byteLength, 8 + 8 * 64);
for (let i = 0; i < encoded.byteLength; i++)
  assert.equal(
    decodeEffects(encoded.slice(0, i)),
    null,
    "Every truncation fails",
  );
for (const [offset, value] of [
  [1, 9],
  [16, 9],
  [17, 8],
  [18, 255],
  [68, 1],
]) {
  const bad = encoded.slice(0);
  new DataView(bad).setUint8(offset, value);
  assert.equal(decodeEffects(bad), null);
}
const bad = encoded.slice(0);
new DataView(bad).setFloat32(24, NaN, true);
assert.equal(decodeEffects(bad), null);
for (let i = 0; i < 300; i++) bus.emit(effectSpec(EffectKind.FOOTSTEP, point));
assert.equal(bus.drain().length, 256);
assert.equal(bus.dropped, 44);
bus.enabled = false;
bus.emit(effectSpec(EffectKind.BLAST, point));
assert.equal(
  bus.drain().length,
  0,
  "Prediction must not emit authoritative cues",
);
const queue = new PresentationQueue(),
  played: EffectEvent[] = [];
queue.receive(decoded, 1);
queue.receive(decoded, 1);
queue.update(1, (e) => played.push(e));
assert.equal(played.length, 7);
assert.equal(queue.duplicates, 8);
queue.update(1.2, (e) => played.push(e));
assert.equal(played.length, 7);
queue.update(
  1.49,
  (e) => played.push(e),
  () => COUNTER_CONTACT_SEC,
);
assert.equal(played.length, 8);
queue.receive({ tick: 5000, events: [{ ...events[0], id: 999 }] }, 2);
assert.equal(queue.size, 0, "Stale events expire");
queue.reset();
queue.receive(decoded, 2);
queue.update(4, (e) => played.push(e));
assert.equal(queue.size, 0);
assert.equal(
  played.length,
  8,
  "Hidden/resumed frame does not release a stale burst",
);
for (let i = 0; i < 1000; i++)
  queue.receive({ tick: 1234, events: [{ ...events[0], id: i + 1000 }] }, 5);
assert.equal(queue.size, 256);
queue.reset();

const effects = new CombatEffects();
for (let tick = 0; tick < 120 * 60; tick++) {
  if (tick % 6 === 0)
    for (const e of events) effects.emit({ ...e, id: tick + e.id });
  effects.update(1 / 60);
}
for (const [kind, limit] of Object.entries(EFFECT_POOL_LIMITS))
  assert.ok(
    effects.stats[kind as keyof typeof EFFECT_POOL_LIMITS].active <= limit,
  );
assert.equal(
  effects.root.children.length,
  4,
  "Scene object count remains fixed after two-minute stress",
);
effects.reset();
assert.ok(Object.values(effects.stats).every((s) => s.active === 0));
effects.dispose();

await initRapierPhysics();
const world = new SharedPhysicsWorld();
try {
  for (const id of [...world.combatManager.enemies.keys()])
    world.combatManager.removeEnemy(id);
  const agent = world.createAgent(5001, "FX", { x: 800, y: 0, z: 800 });
  const body = world.world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(800, 2, 790),
  );
  world.world.createCollider(RAPIER.ColliderDesc.cuboid(5, 3, 0.3), body);
  world.world.step();
  const shot = world.combatManager.resolveWeaponShot(agent, 0, 0)!;
  assert.equal(shot.type, "WEAPON_MISS");
  assert.equal(shot.surfaceHit, true);
  assert.ok(shot.impactNormal!.z > 0.9);
  assert.ok(shot.impactPoint.z > 790);
  world.effects.fromCombat(shot);
  assert.equal(
    world.effects.drain().filter((e) => e.kind === EffectKind.SHOT).length,
    1,
  );
  const enemy = world.combatManager.spawnEnemy(
    5101,
    "TARGET",
    { x: 800, y: 0, z: 795 },
    false,
  );
  world.combatManager.syncEnemyBoneColliders(enemy);
  world.world.step();
  const hit = world.combatManager.resolveWeaponShot(
    agent,
    0,
    0,
    EnemyLimbId.TORSO,
    enemy.enemyId,
  )!;
  assert.equal(hit.type, "WEAPON_HIT");
  assert.ok(hit.shotOrigin && hit.impactNormal);
  assert.equal(hit.limbId, EnemyLimbId.TORSO);
  agent.position = { x: 800, y: 0, z: 796.5 };
  world.syncAgentKinematicTransform(agent);
  enemy.combatState = EnemyCombatState.WINDUP;
  enemy.stateTimer = 0.5;
  world.world.step();
  agent.attributes.strength = 3;
  const counter = world.combatManager.executeCounterParry(agent)!;
  assert.equal(counter.type, "PARRY_TAKEDOWN");
  world.effects.fromCombat(counter);
  const contact = world.effects
    .drain()
    .find((e) => e.kind === EffectKind.COUNTER)!;
  assert.equal(contact.delay, COUNTER_CONTACT_SEC);
  assert.equal(contact.flags & 4, 4);
  world.effects.drain();
  world.vehiclePropManager.triggerSphericalExplosion(agent, {
    x: 900,
    y: 0,
    z: 900,
  });
  assert.equal(
    world.effects.drain().filter((e) => e.kind === EffectKind.BLAST).length,
    1,
    "Empty-space blast still has exactly one visual origin",
  );
  agent.grounded = true;
  agent.position = { x: 850, y: 0, z: 850 };
  world.effects.footsteps([agent]);
  for (let i = 0; i < 40; i++) {
    agent.position.x += 0.1;
    world.effects.footsteps([agent]);
  }
  assert.equal(
    world.effects.drain().filter((e) => e.kind === EffectKind.FOOTSTEP).length,
    2,
  );
  agent.grounded = false;
  agent.position.x += 0.5;
  world.effects.footsteps([agent]);
  assert.equal(world.effects.drain().length, 0, "No airborne footsteps");
  const floor = world.world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(900, -1, 900),
  );
  world.world.createCollider(RAPIER.ColliderDesc.cuboid(80, 1, 80), floor);
  const car = [...world.vehiclePropManager.vehicles.values()][0];
  car.position = { x: 900, y: 0.88, z: 900 };
  car.yaw = 0;
  car.velocity = { x: 0, y: 0, z: -20 };
  car.forwardSpeedMps = 20;
  car.driverEntityId = agent.entityId;
  agent.mountedVehicleId = car.vehicleId;
  agent.lastDriveThrottle = 0;
  agent.lastDriveSteer = 0;
  car.rigidBody.setTranslation(car.position, true);
  world.world.step();
  const skids: EffectEvent[] = [];
  for (let i = 0; i < 60; i++) {
    world.vehiclePropManager.stepVehicles(world.agents, 1 / 60, []);
    world.world.step();
    skids.push(
      ...world.effects.drain().filter((e) => e.kind === EffectKind.SKID),
    );
  }
  assert.ok(skids.length >= 2, "Grounded rear wheels produce braking marks");
  assert.ok(
    skids.every((e) => e.normal.y > 0.9 && Math.abs(e.point.y - 0.025) < 0.01),
    "Skid contact points sit on the actual road",
  );
} finally {
  world.world.free();
}
mkdirSync("output/playwright", { recursive: true });
writeFileSync(
  "output/playwright/stage5-verification.json",
  JSON.stringify(
    {
      status: "passed",
      checkedAt: new Date().toISOString(),
      packetKinds: 8,
      recordBytes: 64,
      stressSeconds: 120,
      poolLimits: EFFECT_POOL_LIMITS,
      dedup: true,
      staleAndReconnect: true,
      geometryNormals: true,
      oneBlastPerOrigin: true,
    },
    null,
    2,
  ),
);
console.log(
  "Stage 5 passed: validated effects protocol, authoritative origins/normals, delayed contact, duplicate/stale rejection, prediction suppression, footsteps and bounded two-minute effect pools.",
);
