import assert from "node:assert/strict";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { WebSocket } from "ws";
import { CrackupAuthoritativeServer } from "../server/gameServer.js";
import { AgentDatabase } from "../server/db.js";
import {
  SharedPhysicsWorld,
  initRapierPhysics,
} from "../shared/physics/characterController.js";
import {
  EnemyCombatState,
  FIXED_TIMESTEP,
  INPUT_FLAG_RELIC_REWIND,
  INPUT_FLAG_FIRE,
} from "../shared/constants.js";
import { encodeClientInput } from "../shared/protocol/binaryProtocol.js";
import { DISTRICT_LOOP_SPECS } from "../shared/world/phase5Systems.js";
import { SKILL_TREE_NODES } from "../shared/progression/skillTreeSystem.js";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, `Timed out: ${label}`);
    await delay(10);
  }
}

async function main(): Promise<void> {
  await initRapierPhysics();
  console.log(
    "[1/6] Real enemy damage, downed input lock, relic ownership and district completion",
  );
  const world = new SharedPhysicsWorld();
  try {
    for (const id of [...world.combatManager.enemies.keys()])
      world.combatManager.removeEnemy(id);
    const agent = world.createAgent(1, "ALPHA", { x: 0, y: 0, z: 8 });
    const enemy = world.combatManager.spawnEnemy(
      90,
      "DAMAGE-TEST",
      { x: 0, y: 0, z: 10 },
      false,
    );
    // Exercise the natural chase → windup → sweep path, not only a forced hit.
    enemy.position.z = 11.05;
    enemy.combatState = EnemyCombatState.CHASE;
    for (let tick = 0; tick < 90; tick++)
      world.combatManager.stepEnemies([agent], FIXED_TIMESTEP);
    assert.ok(
      agent.hp < agent.maxHp,
      "Enemies must approach within their own strike range before winding up",
    );
    agent.hp = agent.maxHp;
    enemy.position.z = 10;
    enemy.combatState = EnemyCombatState.WINDUP;
    enemy.stateTimer = 0.001;
    world.combatManager.stepEnemies([agent], FIXED_TIMESTEP);
    assert.ok(
      agent.hp < agent.maxHp,
      "Normal enemies must actually damage agents",
    );
    agent.hp = 1;
    enemy.combatState = EnemyCombatState.WINDUP;
    enemy.stateTimer = 0.001;
    world.combatManager.stepEnemies([agent], FIXED_TIMESTEP);
    assert.equal(agent.hp, 0);
    assert.equal(agent.telemetry.agentDowns, 1);
    const start = { ...agent.position };
    world.applyAgentInput(agent, {
      seq: 1,
      moveX: 1,
      moveZ: 1,
      yaw: 0,
      pitch: 0,
      buttons: INPUT_FLAG_FIRE,
      dt: FIXED_TIMESTEP,
    });
    assert.deepEqual(
      agent.position,
      start,
      "Downed players cannot move or fight",
    );
    agent.hp = agent.maxHp;
    agent.chronoHistory.push({
      tick: 0,
      position: { x: 50, y: 0, z: 50 },
      velocity: { x: 0, y: 0, z: 0 },
      rotation: agent.rotation,
      facingYaw: 0,
      hp: agent.maxHp,
    });
    world.applyAgentInput(agent, {
      seq: 2,
      moveX: 0,
      moveZ: 0,
      yaw: 0,
      pitch: 0,
      buttons: INPUT_FLAG_RELIC_REWIND,
      dt: FIXED_TIMESTEP,
    });
    assert.equal(
      agent.telemetry.chronoRewindsExecuted || 0,
      0,
      "History alone must not unlock rewind",
    );
    const spec = DISTRICT_LOOP_SPECS[0];
    const loop = world.phase5Director.districtLoops.get(spec.district)!;
    world.phase5Director.advanceDistrictLoopToStage2(loop);
    world.phase5Director.advanceDistrictLoopToStage3(loop);
    agent.position = { ...spec.coreOverridePos };
    world.phase5Director.tryInteractObjectiveOrRevive(agent, world.agents);
    assert.equal(
      loop.currentStage,
      3,
      "A live kingpin must block the override",
    );
    const kingpin = world.combatManager.enemies.get(spec.kingpinEnemyId)!;
    kingpin.hp = 0;
    kingpin.combatState = EnemyCombatState.DEAD;
    world.phase5Director.stepPhase5Systems(world.agents, FIXED_TIMESTEP);
    assert.equal(
      loop.currentStage,
      3,
      "Defeating a kingpin should expose the override",
    );
    world.phase5Director.tryInteractObjectiveOrRevive(agent, world.agents);
    assert.equal(loop.currentStage, 4);
    assert.ok(agent.unlockedDistrictRewards.has(spec.rewardId));
  } finally {
    world.world.free();
  }

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "crackup-alpha-"));
  const sockets: WebSocket[] = [];
  const server = new CrackupAuthoritativeServer({
    port: 0,
    dbPath: path.join(temp, "live.db"),
  });
  try {
    console.log(
      "[2/6] Salted PIN storage, legacy migration and health persistence",
    );
    const db = new AgentDatabase(path.join(temp, "auth.db"));
    try {
      const a = db.authenticateOrCreate("HASH-A", "1234"),
        b = db.authenticateOrCreate("HASH-B", "1234");
      assert.ok(a.ok && b.ok);
      const rows = db.db
        .prepare("SELECT pin_hash FROM agents ORDER BY callsign")
        .all() as { pin_hash: string }[];
      assert.ok(rows.every((row) => row.pin_hash.startsWith("scrypt$")));
      assert.notEqual(rows[0].pin_hash, rows[1].pin_hash);
      const legacy = crypto
        .createHash("sha256")
        .update("CRACKUP_V2_SALT:HASH-A:1234")
        .digest("hex");
      db.db
        .prepare("UPDATE agents SET pin_hash = ? WHERE callsign = ?")
        .run(legacy, "HASH-A");
      assert.equal(db.authenticateOrCreate("HASH-A", "9999").ok, false);
      assert.equal(db.authenticateOrCreate("HASH-A", "1234").ok, true);
      assert.match(
        (
          db.db
            .prepare("SELECT pin_hash FROM agents WHERE callsign = ?")
            .get("HASH-A") as any
        ).pin_hash,
        /^scrypt\$/,
      );
      a.record.hp = 0;
      db.saveAgent(a.record);
      assert.equal(db.getAgent("HASH-A")!.hp, 0);
    } finally {
      db.close();
    }

    const port = await server.start();
    async function connect(callsign: string) {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      sockets.push(ws);
      const messages: any[] = [];
      ws.on("message", (data, binary) => {
        if (!binary) messages.push(JSON.parse(data.toString()));
      });
      await once(ws, "open");
      ws.send(JSON.stringify({ type: "AUTH", callsign, pin: "1234" }));
      await until(() => messages.some((m) => m.type === "AUTH_OK"), "login");
      const auth = messages.find((m) => m.type === "AUTH_OK");
      const control = async (
        type: string,
        fields: Record<string, unknown>,
        response: string,
      ) => {
        const from = messages.length;
        ws.send(JSON.stringify({ ...fields, type }));
        await until(
          () => messages.slice(from).some((m) => m.type === response),
          response,
        );
        return messages.slice(from).find((m) => m.type === response);
      };
      return { ws, messages, auth, control };
    }

    console.log(
      "[3/6] Progression forgery rejected, skill cost and branch prerequisites enforced",
    );
    const seeded = server.db.authenticateOrCreate("EARNED", "1234", {
      x: -100,
      y: 0,
      z: 100,
    });
    assert.ok(seeded.ok);
    seeded.record.xp.agility = 100;
    server.db.saveAgent(seeded.record);
    const client = await connect("EARNED");
    const agent = server.physicsWorld.agents.get(client.auth.entityId)!;
    const oldAttributes = { ...agent.attributes };
    await client.control(
      "SET_ATTRIBUTES",
      { attributes: { agility: 5, shooting: 5 } },
      "CONTROL_ERROR",
    );
    assert.deepEqual(agent.attributes, oldAttributes);
    await client.control(
      "SET_BUILD",
      {
        unlockedSkills: SKILL_TREE_NODES.map((s) => s.id),
        unlockedRelics: ["CHRONO_SHIFT_ANCHOR"],
      },
      "CONTROL_ERROR",
    );
    assert.equal(agent.unlockedSkills.size, 0);
    assert.equal(agent.unlockedRelics.size, 0);
    await client.control(
      "UNLOCK_SKILL",
      { skillId: "titan_2_hydraulic_grip" },
      "CONTROL_ERROR",
    );
    await client.control(
      "UNLOCK_SKILL",
      { skillId: "titan_1_kinetic_plating" },
      "BUILD_UPDATED",
    );
    assert.equal(agent.unlockedSkills.size, 1);
    await client.control(
      "UNLOCK_SKILL",
      { skillId: "phantom_1_neural_stabilizer" },
      "CONTROL_ERROR",
    );
    assert.equal(
      agent.unlockedSkills.size,
      1,
      "A spent point cannot be spent again",
    );
    const count = server.getActiveAgentCount();
    client.ws.send(
      JSON.stringify({ type: "AUTH", callsign: "SECOND", pin: "1234" }),
    );
    await delay(50);
    assert.equal(
      server.getActiveAgentCount(),
      count,
      "Re-authentication on a socket cannot leak agents",
    );

    console.log(
      "[4/6] Authoritative health, timed recovery, saved skills and reconnect",
    );
    agent.hp = 0;
    await until(
      () =>
        client.messages.some((m) => m.type === "PLAYER_STATE" && m.hp === 0),
      "health sync",
    );
    client.ws.send(JSON.stringify({ type: "RESPAWN" }));
    await delay(80);
    assert.equal(
      server.physicsWorld.agents.get(agent.entityId)!.hp,
      0,
      "Recovery delay enforced",
    );
    // Keep this integration check quick; the server's clock still validates the deadline.
    (server as any).clientsByEntityId.get(agent.entityId).downedAt =
      Date.now() - 3100;
    await client.control("RESPAWN", {}, "RESPAWNED");
    const recovered = server.physicsWorld.agents.get(agent.entityId)!;
    assert.equal(recovered.hp, recovered.maxHp);
    assert.ok(recovered.spawnProtectionSec > 0);
    assert.equal(recovered.unlockedSkills.size, 1);
    recovered.hp = 57;
    client.ws.close();
    await once(client.ws, "close");
    await until(() => server.getActiveAgentCount() === 0, "cleanup");
    const reconnect = await connect("EARNED");
    assert.equal(
      reconnect.auth.record.hp,
      57,
      "Reconnecting must not heal the agent",
    );
    assert.equal(
      server.physicsWorld.agents.get(reconnect.auth.entityId)!.hp,
      57,
    );

    console.log(
      "[5/6] Duplicate inputs ignored, stale movement stopped, floods bounded",
    );
    const mover = server.physicsWorld.agents.get(reconnect.auth.entityId)!;
    mover.position = { x: -100, y: 0, z: 100 };
    server.physicsWorld.syncAgentKinematicTransform(mover);
    const input = encodeClientInput({
      seq: 1,
      moveX: 1,
      moveZ: 0,
      yaw: 0,
      pitch: 0,
      buttons: 0,
      dt: FIXED_TIMESTEP,
    });
    reconnect.ws.send(input);
    await delay(350);
    assert.equal(mover.lastProcessedInputSeq, 1);
    const stopped = { ...mover.position };
    reconnect.ws.send(input);
    await delay(350);
    assert.ok(
      Math.hypot(mover.position.x - stopped.x, mover.position.z - stopped.z) <
        0.1,
      "Replayed packets must not extend movement",
    );

    console.log("[6/6] Cross-origin upgrades and oversized frames rejected");
    const blocked = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
      origin: "https://untrusted.example",
    });
    sockets.push(blocked);
    const error = await new Promise<Error>((resolve) =>
      blocked.once("error", resolve),
    );
    assert.match(error.message, /403/);
    const oversized = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    sockets.push(oversized);
    await once(oversized, "open");
    oversized.send("x".repeat(17000));
    const [code] = await once(oversized, "close");
    assert.equal(code, 1009);
    const flood = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    sockets.push(flood);
    await once(flood, "open");
    for (let i = 0; i < 25; i++) flood.send("{}");
    const [floodCode] = await once(flood, "close");
    assert.equal(floodCode, 4008);
  } finally {
    for (const ws of sockets)
      if (ws.readyState !== WebSocket.CLOSED) ws.terminate();
    await server.stop();
    server.physicsWorld?.world.free();
    const resolved = path.resolve(temp);
    assert.ok(
      resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) &&
        path.basename(resolved).startsWith("crackup-alpha-"),
    );
    fs.rmSync(resolved, { recursive: true, force: true });
  }
  console.log("ALL 6/6 ALPHA VERIFICATION SUITES PASSED.");
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
