import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import * as THREE from "three";
import {
  CinematicDirector,
  type CinematicEnd,
} from "../client/narrative/cinematicDirector.js";
import {
  openingTrack,
  sampleTrack,
  encounterTracks,
  OPENING_ID,
} from "../client/narrative/cinematicTracks.js";
import {
  StoryDirector,
  STORY_BEATS,
  type StoryContext,
} from "../shared/narrative/storyBible.js";
import {
  initRapierPhysics,
  SharedPhysicsWorld,
} from "../shared/physics/characterController.js";
import {
  DEFAULT_ATTRIBUTES,
  DreadnoughtPhase,
  EnemyLimbId,
  INPUT_FLAG_OBJECTIVE_JETPACK,
} from "../shared/constants.js";
import { DISTRICT_LOOP_SPECS } from "../shared/world/phase5Systems.js";
import type { Phase6SnapshotPacket } from "../shared/protocol/binaryProtocol.js";

const storageMap = new Map<string, string>(),
  storage = {
    getItem: (k: string) => storageMap.get(k) ?? null,
    setItem: (k: string, v: string) => {
      storageMap.set(k, v);
    },
  };
const track = openingTrack({ x: -22, y: 0, z: 20 }, { x: -24, y: 1, z: 24 });
assert.equal(
  track.cues[0].line.text,
  STORY_BEATS[0].nodes[0].text,
  "Opening uses the actual story bible",
);
assert.equal(track.shots.length, 4);
for (let t = 0; t < track.duration; t += 1 / 120) {
  const sample = sampleTrack(track, t);
  assert.ok(Object.values(sample.position).every(Number.isFinite));
  assert.ok(
    sample.fov >= 40 &&
      sample.fov <= 60 &&
      sample.fade >= 0 &&
      sample.fade <= 1,
  );
}
assert.deepEqual(
  sampleTrack(track, 1, true).position,
  sampleTrack(track, 3, true).position,
  "Reduced motion holds each shot",
);
for (const reason of [
  "completed",
  "skipped",
  "damage",
  "death",
  "disconnected",
  "hidden",
  "interrupted",
] as CinematicEnd[]) {
  const camera = new THREE.PerspectiveCamera(68, 16 / 9, 0.15, 18000);
  camera.position.set(4, 3, 7);
  camera.lookAt(0, 1, 0);
  let finishes = 0;
  const director = new CinematicDirector(camera, storage, {
    finish: () => finishes++,
  });
  director.useProfile(`TEST-${reason}`);
  assert.equal(director.start(track, 100), true);
  assert.equal(director.start(track, 100), false, "No nested camera ownership");
  director.restoreGameplayCamera();
  camera.position.set(12, 4, 10);
  camera.lookAt(9, 1, 1);
  camera.fov = 73;
  const pos = camera.position.clone(),
    rot = camera.quaternion.clone();
  director.update(reason === "completed" ? 112 : 102);
  if (reason !== "completed") {
    assert.notDeepEqual(camera.position.toArray(), pos.toArray());
    director.end(reason);
  }
  assert.equal(director.active, false);
  assert.equal(camera.fov, 73);
  assert.ok(camera.position.distanceTo(pos) < 1e-8);
  assert.ok(camera.quaternion.angleTo(rot) < 1e-6);
  director.end(reason);
  assert.equal(finishes, 1, "Cleanup exactly once");
  assert.equal(director.start(track, 120), false, "No replay in session");
  const reconnect = new CinematicDirector(camera, storage);
  reconnect.useProfile(`TEST-${reason}`);
  assert.equal(
    reconnect.seen(OPENING_ID),
    true,
    "Seen/skip/interruption survives reconnect",
  );
  reconnect.useProfile(`OTHER-${reason}`);
  assert.equal(reconnect.seen(OPENING_ID), false, "Profiles stay independent");
}
const brokenStorage = new CinematicDirector(new THREE.PerspectiveCamera(), {
  getItem: () => {
    throw Error("blocked");
  },
  setItem: () => {
    throw Error("quota");
  },
});
brokenStorage.useProfile("PRIVATE");
assert.ok(brokenStorage.start(track, 0));
brokenStorage.end("skipped");

// Scripted three-act integration route. Teleports and direct damage calls accelerate QA;
// this checks progression/story/camera dependencies, not uncoached playability or balance.
await initRapierPhysics();
const world = new SharedPhysicsWorld();
const route: string[] = [];
try {
  const agent = world.createAgent(
    1,
    "STORY-QA",
    { x: -20, y: 0, z: 20 },
    { x: 0, y: 0, z: 0, w: 1 },
    { ...DEFAULT_ATTRIBUTES },
  );
  agent.spawnProtectionSec = 1000;
  const story = new StoryDirector();
  const context: StoryContext = {
    deployed: true,
    districtIndex: 0,
    vigilanteLevel: 1,
    whisperOrbs: 0,
    nonLethalBounties: 0,
    relaySabotage: false,
    citadelLoopStage: 1,
    bossDefeated: false,
  };
  const tell = () => {
    let count = 0;
    while (story.update(context)) {
      const id = story.beat!.id;
      while (story.node) {
        story.advance();
        assert.ok(count++ < 60);
      }
      route.push(id);
    }
  };
  tell();
  assert.ok(story.completed.has("deployment"));
  let seq = 0;
  const interact = (p: { x: number; y: number; z: number }) => {
    agent.position = { ...p };
    agent.grounded = true;
    world.syncAgentKinematicTransform(agent);
    for (const buttons of [0, INPUT_FLAG_OBJECTIVE_JETPACK]) {
      world.applyAgentInput(agent, {
        seq: ++seq,
        moveX: 0,
        moveZ: 0,
        yaw: 0,
        pitch: 0,
        buttons,
        dt: 1 / 60,
      });
      world.stepWorld();
    }
  };
  const source = () => ({
    player: agent.position,
    districts: world.phase5Director.toBinaryDistrictLoopSnapshots(),
    enemies: new Map(
      world.combatManager.toBinarySnapshots().map((e) => [e.enemyId, e]),
    ),
    phase6: null,
  });
  let bossIntros = 0;
  assert.deepEqual(
    encounterTracks(source()),
    [],
    "No invented bosses before authoritative mission stage",
  );
  for (const [index, spec] of DISTRICT_LOOP_SPECS.entries()) {
    context.districtIndex = index;
    for (const p of spec.stage1Terminals) interact(p);
    assert.equal(
      world.phase5Director.districtLoops.get(spec.district)!.currentStage,
      2,
    );
    for (const id of [spec.lieutenantEnemyId, spec.kingpinEnemyId]) {
      const enemy = world.combatManager.enemies.get(id)!;
      assert.ok(enemy);
      agent.position = { ...enemy.position };
      assert.ok(
        encounterTracks(source()).some((t) => t.targetEnemyId === id),
        "Real encounter maps to introduction",
      );
      bossIntros++;
      let damageCalls = 0;
      while (enemy.hp > 0) {
        world.combatManager.applyLimbDamage(
          agent,
          enemy,
          EnemyLimbId.TORSO,
          45,
        );
        assert.ok(damageCalls++ < 100);
      }
      world.stepWorld();
      assert.ok(
        !encounterTracks(source()).some((t) => t.targetEnemyId === id),
        "Dead entity cannot introduce",
      );
    }
    interact(spec.coreOverridePos);
    assert.equal(
      world.phase5Director.districtLoops.get(spec.district)!.currentStage,
      4,
    );
    assert.ok(agent.unlockedDistrictRewards.has(spec.rewardId));
    context.relaySabotage = true;
    if (index === 0) tell();
    if (index === 1) {
      context.whisperOrbs = 3;
      tell();
      assert.ok(story.completed.has("revelation"));
    }
    if (index === 3) {
      context.citadelLoopStage = 4;
      tell();
      assert.ok(story.completed.has("killswitch"));
    }
  }
  const boss = world.dreadnoughtDirector;
  world.stepWorld();
  assert.equal(boss.phase, DreadnoughtPhase.PHASE_1_SHIELDED);
  const phase6 = {
    dreadnought: boss.toBinarySnapshot(),
  } as Phase6SnapshotPacket;
  const finalTracks = encounterTracks({
    ...source(),
    player: { ...boss.position },
    phase6,
  });
  assert.ok(finalTracks.some((t) => t.id === "dreadnought-v1"));
  assert.equal(
    boss.damagePart(agent, 0, 100),
    0,
    "Intro cannot bypass core shield",
  );
  for (const part of [1, 2, 3, 4])
    for (let i = 0; i < 10; i++) boss.damagePart(agent, part, 50);
  assert.equal(boss.phase, DreadnoughtPhase.PHASE_2_CORE_EXPOSED);
  for (let i = 0; i < 36; i++) boss.damagePart(agent, 0, 50);
  assert.equal(boss.phase, DreadnoughtPhase.DEFEATED);
  context.bossDefeated = true;
  tell();
  assert.ok(story.completed.has("dawn"));
  assert.equal(story.update(context), null, "No repeat finale");
  assert.equal(bossIntros, 8);
} finally {
  world.world.free();
}
mkdirSync("output/playwright", { recursive: true });
writeFileSync(
  "output/playwright/stage6-verification.json",
  JSON.stringify(
    {
      status: "passed",
      checkedAt: new Date().toISOString(),
      openingShots: 4,
      endReasons: 7,
      cameraRestoration: true,
      perProfileHistory: true,
      reducedMotion: true,
      scriptedThreeActRoute: route,
      districtBossIntros: 8,
      uncoachedPlaythrough: false,
    },
    null,
    2,
  ),
);
console.log(
  "Stage 6 passed: camera/FOV restoration on seven exits, profile persistence, reduced motion, eight authoritative boss introductions and scripted three-act progression through the Dreadnought finale.",
);
