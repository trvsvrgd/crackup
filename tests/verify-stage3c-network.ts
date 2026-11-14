import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { CrackupAuthoritativeServer } from '../server/gameServer.js';
import { decodeRelays, encodeRelays, type RelayPacket } from '../shared/protocol/relayProtocol.js';
import { encodeClientInput } from '../shared/protocol/binaryProtocol.js';
import { INPUT_FLAG_FIRE, INPUT_FLAG_OBJECTIVE_JETPACK } from '../shared/constants.js';
import { RelayMode } from '../shared/world/relayDefinition.js';
import { DISTRICT_LOOP_SPECS } from '../shared/world/phase5Systems.js';

const server = new CrackupAuthoritativeServer({ port: 0, dbPath: ':memory:' }), clients: WebSocket[] = [], received: RelayPacket[][] = [];
const waitFor = async (test: () => boolean, message: string) => { const start = performance.now(); while (!test() && performance.now() - start < 4000) await new Promise(r => setTimeout(r, 10)); assert.ok(test(), message); };
try {
  const port = await server.start();
  const connect = async () => {
    const packets: RelayPacket[] = [], index = clients.length; received.push(packets);
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`); clients.push(ws); let authenticated = false;
    ws.on('message', (data, binary) => {
      if (binary) { const b = data as Buffer, packet = decodeRelays(b.buffer, b.byteOffset, b.byteLength); if (packet) packets.push(packet); }
      else if (JSON.parse(data.toString()).type === 'AUTH_OK') authenticated = true;
    });
    await once(ws, 'open'); ws.send(JSON.stringify({ type: 'AUTH', callsign: `RELAY-NET-${index}`, pin: '2468' })); await waitFor(() => authenticated && packets.length > 0, 'Auth and packet 0x0a reach observer'); return ws;
  };
  const shooter = await connect(); await connect();
  const sim = server.physicsWorld, system = sim.relaySystem, plan = system.plans[0], state = system.states.get(plan.relayId)!;
  for (const id of [...sim.combatManager.enemies.keys()]) sim.combatManager.removeEnemy(id);
  const agent = [...sim.agents.values()][0], vent = plan.vents[0], position = { x: plan.origin.x + vent.center.x, y: plan.origin.y + vent.center.y, z: plan.origin.z + vent.center.z };
  agent.position = { x: position.x - 4, y: 0, z: position.z }; sim.syncAgentKinematicTransform(agent); sim.world.step();
  const input = (seq: number, buttons: number, yaw = 0, pitch = 0) => shooter.send(encodeClientInput({ seq, moveX: 0, moveZ: 0, yaw, pitch, buttons, dt: 1 / 60 }));
  input(1, INPUT_FLAG_FIRE, -Math.PI / 2, Math.atan2(position.y - 1.55, 4));
  await waitFor(() => state.ventHp[0] < 120, 'Actual fire input hits visible vent');
  system.damageVent(plan.relayId, 0, 999, position, agent.entityId);
  await waitFor(() => received.every(list => list.some(p => p.relays.some(s => s.relayId === plan.relayId && s.ventHp[0] === 0 && s.mode === RelayMode.OVERHEATING))), 'Vent break and heating replicate to both observers');
  system.damageVent(plan.relayId, 1, 999, position); system.damageVent(plan.relayId, 2, 999, position); state.heat = 0.999;
  await waitFor(() => state.mode === RelayMode.SHUTDOWN, 'All vents destroyed causes shutdown');
  await connect();
  await waitFor(() => received.every(list => list.some(p => p.relays.some(s => s.relayId === plan.relayId && s.mode === RelayMode.SHUTDOWN && s.ventHp.every(hp => hp === 0)))), 'Late joiner sees authoritative shutdown and each broken vent');
  const common = () => received[0].find(p => p.relays.some(s => s.relayId === plan.relayId && s.mode === RelayMode.SHUTDOWN) && received.slice(1).every(list => list.some(q => q.serverTick === p.serverTick)));
  await waitFor(() => !!common(), 'Common server tick exists'); const shared = common()!;
  for (const list of received.slice(1)) assert.deepEqual(list.find(p => p.serverTick === shared.serverTick), shared, 'All observers receive identical vent heat/HP/reboot data');
  shooter.send(JSON.stringify({ type: 'RELAY_DAMAGE', relayId: 1, hacked: true, generation: 500 }));
  shooter.send(encodeRelays({ serverTick: 0, relays: [{ ...state, generation: 500, mode: RelayMode.HACKED, hacked: true, rebootSec: 0 }] }));
  await new Promise(r => setTimeout(r, 80)); assert.equal(state.hacked, false); assert.notEqual(state.generation, 500);
  agent.position = { ...DISTRICT_LOOP_SPECS[0].stage1Terminals[1] }; sim.syncAgentKinematicTransform(agent); input(2, INPUT_FLAG_OBJECTIVE_JETPACK);
  await waitFor(() => received.every(list => list.some(p => p.relays.find(s => s.relayId === 2)?.hacked && !p.relays.find(s => s.relayId === 1)?.hacked)), 'Hacking terminal B does not falsely mark A hacked');
  const generation = state.generation; state.rebootSec = 0.02;
  await waitFor(() => received.every(list => list.some(p => p.relays.some(s => s.relayId === 1 && s.generation === generation + 1 && s.ventHp.every(hp => hp === 120) && s.mode === RelayMode.ONLINE))), 'Reboot generation repairs all vents for every observer');
  input(3, 0); await new Promise(r => setTimeout(r, 40));
  agent.position = { ...DISTRICT_LOOP_SPECS[0].stage1Terminals[0] }; sim.syncAgentKinematicTransform(agent); input(4, INPUT_FLAG_OBJECTIVE_JETPACK);
  await waitFor(() => system.states.get(1)!.hacked, 'Normal objective interaction still works after vent reboot');
  assert.equal(sim.phase5Director.districtLoops.get(DISTRICT_LOOP_SPECS[0].district)!.currentStage, 2);
  console.log('Stage 3C network passed: client fire, independent vent HP, heat/shutdown, three observers, late join, identical ticks, forged state rejection, B-first hacking and automatic reboot without mission bypass.');
} finally { clients.forEach(ws => ws.terminate()); await server.stop(); }
