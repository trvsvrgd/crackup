import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import * as THREE from "three";
import { WebSocket } from "ws";
import { CrackupAuthoritativeServer } from "../server/gameServer.js";
import {
  decodeWorldSnapshot,
  decodeWorldEventsSnapshot,
  decodeEnemySnapshot,
  encodeClientInput,
  type DistrictLoopBinaryState,
  type EnemyBinarySnapshotState,
} from "../shared/protocol/binaryProtocol.js";
import { RAPIER } from "../shared/physics/characterController.js";
import { CinematicDirector } from "../client/narrative/cinematicDirector.js";
import {
  openingTrack,
  encounterTracks,
} from "../client/narrative/cinematicTracks.js";
import { DISTRICT_LOOP_SPECS } from "../shared/world/phase5Systems.js";

const server = new CrackupAuthoritativeServer({ port: 0, dbPath: ":memory:" }),
  sockets: WebSocket[] = [];
const waitFor = async (test: () => boolean, message: string) => {
  const start = performance.now();
  while (!test() && performance.now() - start < 5000)
    await new Promise((r) => setTimeout(r, 10));
  assert.ok(test(), message);
};
const peers: Array<{
  id: number;
  ticks: number[];
  districts: DistrictLoopBinaryState[];
  enemies: Map<number, EnemyBinarySnapshotState>;
}> = [];
let inputTimer: ReturnType<typeof setInterval> | undefined;
try {
  const port = await server.start();
  for (let index = 0; index < 3; index++) {
    const state = {
      id: 0,
      ticks: [] as number[],
      districts: [] as DistrictLoopBinaryState[],
      enemies: new Map<number, EnemyBinarySnapshotState>(),
    };
    peers.push(state);
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    sockets.push(ws);
    ws.on("message", (data, binary) => {
      if (!binary) {
        const msg = JSON.parse(data.toString());
        if (msg.type === "AUTH_OK") state.id = msg.entityId;
        return;
      }
      const b = data as Buffer,
        array = b.buffer.slice(
          b.byteOffset,
          b.byteOffset + b.byteLength,
        ) as ArrayBuffer;
      if (b[0] === 2) {
        const p = decodeWorldSnapshot(array);
        if (p) state.ticks.push(p.serverTick);
      } else if (b[0] === 6) {
        const p = decodeWorldEventsSnapshot(array);
        if (p) state.districts = p.districts;
      } else if (b[0] === 4) {
        const p = decodeEnemySnapshot(array);
        if (p) state.enemies = new Map(p.enemies.map((e) => [e.enemyId, e]));
      }
    });
    await once(ws, "open");
    ws.send(
      JSON.stringify({
        type: "AUTH",
        callsign: `CINEMA-QA-${index}`,
        pin: "5791",
      }),
    );
    await waitFor(() => state.id > 0, "Authenticated co-op peer");
  }
  const sim = server.physicsWorld;
  sim.world.createCollider(
    RAPIER.ColliderDesc.cuboid(80, 1, 80).setTranslation(800, -1, 800),
  );
  for (const [i, p] of peers.entries()) {
    const a = sim.agents.get(p.id)!;
    a.position = { x: 800 + i * 8, y: 0, z: 800 };
    sim.syncAgentKinematicTransform(a);
  }
  const camera = new THREE.PerspectiveCamera(68),
    director = new CinematicDirector(camera);
  director.useProfile("VIEWER");
  director.start(
    openingTrack(sim.agents.get(peers[0].id)!.position),
    performance.now() / 1000,
  );
  const before = sim.tickCount,
    startX = sim.agents.get(peers[1].id)!.position.x;
  let seq = 0;
  inputTimer = setInterval(() => {
    for (let i = 0; i < 3; i++)
      sockets[i].send(
        encodeClientInput({
          seq: ++seq,
          moveX: i === 1 ? 1 : 0,
          moveZ: 0,
          yaw: 0,
          pitch: 0,
          buttons: 0,
          dt: 1 / 60,
        }),
      );
    director.restoreGameplayCamera();
    camera.position.set(0, 2, 4);
    director.update(performance.now() / 1000);
  }, 17);
  await waitFor(
    () => sim.tickCount - before > 65,
    "Authoritative clock continues during cinematic",
  );
  assert.equal(director.active, true);
  assert.ok(
    sim.agents.get(peers[1].id)!.position.x > startX + 1,
    "Other player moves while viewer watches",
  );
  assert.ok(
    peers.every((p) => p.ticks.length > 15),
    "All observers keep receiving snapshots",
  );
  director.end("skipped");
  assert.equal(camera.fov, 68);
  clearInterval(inputTimer);
  inputTimer = undefined;
  const loop = sim.phase5Director.districtLoops.get(
    DISTRICT_LOOP_SPECS[0].district,
  )!;
  sockets[0].send(
    JSON.stringify({ type: "CINEMATIC_START", enemyId: 501, stage: 2 }),
  );
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(
    loop.currentStage,
    1,
    "Client cinematic message has no gameplay authority",
  );
  sim.phase5Director.advanceDistrictLoopToStage2(loop);
  await waitFor(
    () =>
      peers.every((p) =>
        encounterTracks({
          player: DISTRICT_LOOP_SPECS[0].lieutenantSpawnPos,
          districts: p.districts,
          enemies: p.enemies,
          phase6: null,
        }).some((t) => t.targetEnemyId === 501),
      ),
    "All peers derive introduction from actual server stage and enemy snapshots",
  );
  sockets[0].close();
  await once(sockets[0], "close");
  const afterDisconnect = sim.tickCount;
  await waitFor(
    () => sim.tickCount > afterDisconnect + 8,
    "One viewer disconnect does not stop co-op",
  );
  mkdirSync("output/playwright", { recursive: true });
  writeFileSync(
    "output/playwright/stage6-network.json",
    JSON.stringify(
      {
        status: "passed",
        checkedAt: new Date().toISOString(),
        clients: 3,
        ticksDuringIntro: sim.tickCount - before,
        peerMovement: true,
        allObserversReceiving: true,
        clientCinematicAuthority: false,
        realServerBossTrigger: true,
        peerDisconnectContinues: true,
      },
      null,
      2,
    ),
  );
  console.log(
    "Stage 6 network passed: three live peers, continuing ticks/input/snapshots during playback, actual server boss triggers, forged cinematic message ignored and one-peer disconnect isolation.",
  );
} finally {
  if (inputTimer) clearInterval(inputTimer);
  sockets.forEach((s) => s.terminate());
  await server.stop();
}
