import assert from "node:assert/strict";
import { once } from "node:events";
import { writeFileSync } from "node:fs";
import { WebSocket } from "ws";
import { CrackupAuthoritativeServer } from "../server/gameServer.js";
import {
  decodeEffects,
  encodeEffects,
  effectSpec,
  EffectKind,
  type EffectPacket,
} from "../shared/protocol/presentationProtocol.js";
import { encodeClientInput } from "../shared/protocol/binaryProtocol.js";
import { INPUT_FLAG_FIRE } from "../shared/constants.js";
import { RAPIER } from "../shared/physics/characterController.js";
import { PresentationQueue } from "../client/animation/presentationQueue.js";

const server = new CrackupAuthoritativeServer({ port: 0, dbPath: ":memory:" }),
  clients: WebSocket[] = [],
  received: EffectPacket[][] = [];
const waitFor = async (test: () => boolean, message: string) => {
  const start = performance.now();
  while (!test() && performance.now() - start < 5000)
    await new Promise((r) => setTimeout(r, 10));
  assert.ok(test(), message);
};
try {
  const port = await server.start();
  const emptySessionTarget = 65530;
  server.physicsWorld.effects.emit(
    effectSpec(
      EffectKind.BLAST,
      { x: 0, y: 1, z: 0 },
      { target: emptySessionTarget },
    ),
  );
  const beforeEmptyTick = server.physicsWorld.tickCount;
  await waitFor(
    () => server.physicsWorld.tickCount >= beforeEmptyTick + 3,
    "Empty server advances",
  );
  assert.equal(
    server.physicsWorld.effects.drain().length,
    0,
    "An empty session retains no transient effects",
  );
  const connect = async () => {
    const list: EffectPacket[] = [],
      index = clients.length;
    received.push(list);
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    clients.push(ws);
    let auth = false;
    ws.on("message", (data, binary) => {
      if (binary) {
        const b = data as Buffer,
          p = decodeEffects(
            b.buffer.slice(
              b.byteOffset,
              b.byteOffset + b.byteLength,
            ) as ArrayBuffer,
          );
        if (p) list.push(p);
      } else if (JSON.parse(data.toString()).type === "AUTH_OK") auth = true;
    });
    await once(ws, "open");
    ws.send(
      JSON.stringify({
        type: "AUTH",
        callsign: `FX-NET-${index}`,
        pin: "2468",
      }),
    );
    await waitFor(() => auth, "Authenticated effect observer");
    return ws;
  };
  const shooter = await connect();
  await connect();
  assert.ok(
    received.every((list) =>
      list.every((p) => p.events.every((e) => e.target !== emptySessionTarget)),
    ),
    "First join never receives an empty-session event",
  );
  const sim = server.physicsWorld;
  for (const id of [...sim.combatManager.enemies.keys()])
    sim.combatManager.removeEnemy(id);
  const floor = sim.world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(800, -1, 800),
  );
  sim.world.createCollider(RAPIER.ColliderDesc.cuboid(50, 1, 50), floor);
  const agent = [...sim.agents.values()][0];
  agent.position = { x: 800, y: 0, z: 800 };
  sim.syncAgentKinematicTransform(agent);
  const enemy = sim.combatManager.spawnEnemy(
    5300,
    "FX-TARGET",
    { x: 800, y: 0, z: 790 },
    false,
    { maxHp: 2000 },
  );
  sim.combatManager.syncEnemyBoneColliders(enemy);
  sim.world.step();
  shooter.send(
    encodeClientInput({
      seq: 1,
      moveX: 0,
      moveZ: 0,
      yaw: 0,
      pitch: 0,
      buttons: INPUT_FLAG_FIRE,
      dt: 1 / 60,
    }),
  );
  await waitFor(
    () =>
      received.every((list) =>
        list.some((p) => p.events.some((e) => e.kind === EffectKind.SHOT)),
      ),
    "Real fire reaches all observers",
  );
  const event = received[0]
    .flatMap((p) => p.events)
    .find((e) => e.kind === EffectKind.SHOT)!;
  assert.deepEqual(
    received[1].flatMap((p) => p.events).find((e) => e.id === event.id),
    event,
    "Origin, normal, limb, tick and ID are identical",
  );
  assert.ok(event.flags & 1);
  assert.ok(enemy.hp < 2000);
  const before = enemy.hp;
  shooter.send(
    encodeEffects({
      tick: 0,
      events: [
        {
          ...effectSpec(EffectKind.BLAST, enemy.position),
          id: 0xf0f0f0f0,
          tick: 0,
        },
      ],
    }),
  );
  shooter.send(
    JSON.stringify({
      type: "PRESENTATION_EVENT",
      id: 0xf0f0f0f0,
      damage: 99999,
    }),
  );
  await new Promise((r) => setTimeout(r, 90));
  assert.equal(enemy.hp, before);
  assert.ok(
    received.every((list) =>
      list.every((p) => p.events.every((e) => e.id !== 0xf0f0f0f0)),
    ),
    "Forged client effects are never relayed",
  );
  await connect();
  await new Promise((r) => setTimeout(r, 100));
  assert.ok(
    !received[2].flatMap((p) => p.events).some((e) => e.id === event.id),
    "Late join does not replay previous shots",
  );
  shooter.send(
    encodeClientInput({
      seq: 2,
      moveX: 0,
      moveZ: 0,
      yaw: 0,
      pitch: 0,
      buttons: 0,
      dt: 1 / 60,
    }),
  );
  await new Promise((r) => setTimeout(r, 30));
  shooter.send(
    encodeClientInput({
      seq: 3,
      moveX: 0,
      moveZ: 0,
      yaw: 0,
      pitch: 0,
      buttons: INPUT_FLAG_FIRE,
      dt: 1 / 60,
    }),
  );
  await waitFor(
    () =>
      received[2].some((p) => p.events.some((e) => e.kind === EffectKind.SHOT)),
    "Late join sees new shots",
  );
  const packet = received[2].find((p) =>
      p.events.some((e) => e.kind === EffectKind.SHOT),
    )!,
    queue = new PresentationQueue();
  let cues = 0;
  queue.receive(packet, 0.15);
  queue.receive(packet, 0.15);
  queue.update(0.15, () => cues++);
  assert.equal(
    cues,
    packet.events.length,
    "150ms delayed/duplicated batch plays once",
  );
  queue.reset();
  queue.receive(packet, 1);
  queue.reset();
  queue.update(1, () => cues++);
  assert.equal(cues, packet.events.length, "Disconnect clears scheduled cues");
  writeFileSync(
    "output/playwright/stage5-network.json",
    JSON.stringify(
      {
        status: "passed",
        checkedAt: new Date().toISOString(),
        observers: 3,
        identicalAuthoritativeEvents: true,
        forgedEventsRejected: true,
        lateJoinNoReplay: true,
        emptySessionNoReplay: true,
        duplicateDelayedPacketOnce: true,
      },
      null,
      2,
    ),
  );
  console.log(
    "Stage 5 network passed: real input, three observers, identical authoritative effects, forged packets rejected, late join, delayed duplicate and disconnect cleanup.",
  );
} finally {
  clients.forEach((ws) => ws.terminate());
  await server.stop();
}
