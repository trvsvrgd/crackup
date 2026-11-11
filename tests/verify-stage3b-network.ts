import assert from 'node:assert/strict';
import { once } from 'node:events';
import RAPIER from '@dimforge/rapier3d-compat';
import { WebSocket } from 'ws';
import { CrackupAuthoritativeServer } from '../server/gameServer.js';
import { encodeClientInput } from '../shared/protocol/binaryProtocol.js';
import { decodeVehicleDamage, type VehicleDamagePacket } from '../shared/protocol/vehicleDamageProtocol.js';
import { INPUT_FLAG_FIRE } from '../shared/constants.js';

const server = new CrackupAuthoritativeServer({ port: 0, dbPath: ':memory:' }), clients: WebSocket[] = [], received: VehicleDamagePacket[][] = [];
const waitFor = async (test: () => boolean, reason: string) => {
  const start = performance.now(); while (!test() && performance.now() - start < 4000) await new Promise(r => setTimeout(r, 10)); assert.ok(test(), reason);
};
try {
  const port = await server.start();
  const connect = async () => {
    const index = clients.length, packets: VehicleDamagePacket[] = []; received.push(packets);
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`); clients.push(ws); let authenticated = false;
    ws.on('message', (data, binary) => {
      if (binary) { const bytes = data as Buffer, packet = decodeVehicleDamage(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength); if (packet) packets.push(packet); }
      else if (JSON.parse(data.toString()).type === 'AUTH_OK') authenticated = true;
    });
    await once(ws, 'open'); ws.send(JSON.stringify({ type: 'AUTH', callsign: `STAGE3B-${index}`, pin: '2468' }));
    await waitFor(() => authenticated && packets.length > 0, 'Observer authenticates and receives 0x09'); return ws;
  };
  const shooter = await connect(); await connect();
  const sim = server.physicsWorld, manager = sim.vehiclePropManager, agent = [...sim.agents.values()][0];
  const floor = sim.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(1000, -0.5, 1000));
  sim.world.createCollider(RAPIER.ColliderDesc.cuboid(30, 0.5, 30), floor);
  const car = manager.spawnVehicle(250, 'NETWORK-TEST', { x: 1000, y: 0.95, z: 1000 }, true);
  agent.position = { x: 1000, y: 0, z: 1006 }; sim.syncAgentKinematicTransform(agent); sim.world.step();
  shooter.send(encodeClientInput({ seq: 1, moveX: 0, moveZ: 0, yaw: 0, pitch: 0, buttons: INPUT_FLAG_FIRE, dt: 1 / 60 }));
  await waitFor(() => car.hp < 1000, 'Real client fire input damages vehicle authoritatively');
  manager.damageVehicle(car.vehicleId, car.hp - 499, car.position, agent.entityId);
  await waitFor(() => received.every(list => list.some(p => p.vehicles.some(v => v.vehicleId === 250 && v.hp === 499 && v.detachedMask === 1) && p.debris.some(d => d.vehicleId === 250 && d.panelId === 0))), 'Hood threshold reaches both observers');
  manager.damageVehicle(car.vehicleId, 250, car.position, agent.entityId);
  await waitFor(() => received.every(list => list.some(p => p.vehicles.some(v => v.vehicleId === 250 && v.hp === 249 && v.detachedMask === 15) && p.debris.filter(d => d.vehicleId === 250).length === 4)), 'Second threshold reaches both observers exactly once');
  const ids = [...manager.vehicleDebris.keys()]; manager.damageVehicle(250, 1, car.position); assert.deepEqual([...manager.vehicleDebris.keys()], ids);
  await connect();
  await waitFor(() => received[2].some(p => p.vehicles.some(v => v.vehicleId === 250 && v.detachedMask === 15) && p.debris.filter(d => d.vehicleId === 250).length === 4), 'Late joiner receives already-detached panels and their bodies');
  const common = () => received[0].find(p => received.slice(1).every(list => list.some(q => q.serverTick === p.serverTick)) && p.debris.filter(d => d.vehicleId === 250).length === 4);
  await waitFor(() => !!common(), 'Common server tick exists');
  const shared = common()!;
  for (const list of received.slice(1)) assert.deepEqual(list.find(p => p.serverTick === shared.serverTick), shared, 'Every observer sees identical body transforms for the same tick');
  const before = car.hp; shooter.send(JSON.stringify({ type: 'VEHICLE_DAMAGE', vehicleId: 250, damage: 10000, hp: 0, detachedMask: 0 }));
  await new Promise(r => setTimeout(r, 100)); assert.equal(car.hp, before, 'Client cannot forge damage or reattach panels');
  for (const d of manager.vehicleDebris.values()) d.state.ageSec = 12;
  await waitFor(() => received.every(list => list.some(p => p.serverTick > shared.serverTick && p.vehicles.some(v => v.vehicleId === 250 && v.detachedMask === 15) && !p.debris.some(d => d.vehicleId === 250))), 'Expired debris disappears while detached state persists');
  const generation = car.generation; manager.damageVehicle(250, 1000, car.position); car.respawnSec = 0.02;
  await waitFor(() => received.every(list => list.some(p => p.vehicles.some(v => v.vehicleId === 250 && v.generation === generation + 1 && v.hp === 1000 && v.detachedMask === 0))), 'Fresh generation resets panels for all observers');
  console.log('Stage 3B network passed: actual client shot, both thresholds, identical debris transforms, late join, forged-message rejection, expiry and respawn across three WebSocket clients.');
} finally { clients.forEach(ws => ws.terminate()); await server.stop(); }
