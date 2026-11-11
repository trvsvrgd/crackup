import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { CrackupAuthoritativeServer } from '../server/gameServer.js';
import { decodeCombatPresentation, HitReaction } from '../shared/combat/combatPresentation.js';
import { EnemyLimbId } from '../shared/constants.js';

const server = new CrackupAuthoritativeServer({ port: 0, dbPath: ':memory:' });
const clients: WebSocket[] = [];
const waitFor = async (test: () => boolean, message: string) => {
  const start = performance.now(); while (!test() && performance.now() - start < 3000) await new Promise(r => setTimeout(r, 10));
  assert.ok(test(), message);
};
try {
  const port = await server.start();
  const snapshots: ReturnType<typeof decodeCombatPresentation>[][] = [[], []];
  for (let i = 0; i < 2; i++) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`); clients.push(ws);
    let authenticated = false;
    ws.on('message', (data, binary) => {
      if (binary) {
        const bytes = data as Buffer, buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        const packet = decodeCombatPresentation(buffer); if (packet) snapshots[i].push(packet);
      } else if (JSON.parse(data.toString()).type === 'AUTH_OK') authenticated = true;
    });
    await once(ws, 'open'); ws.send(JSON.stringify({ type: 'AUTH', callsign: `STAGE2-NET-${i}`, pin: '2468' }));
    await waitFor(() => authenticated, 'Live authentication failed');
  }
  await waitFor(() => snapshots.every(list => list.length > 0), 'Every observer must receive packet 0x08');
  const physics = server.physicsWorld, agent = [...physics.agents.values()][0];
  const enemy = physics.combatManager.spawnEnemy(400, 'NETWORK-REACTION', { x: 900, y: 0, z: 900 }, false, { maxHp: 5000 });
  agent.position = { x: 900, y: 0, z: 902 };
  const event = physics.combatManager.applyLimbDamage(agent, enemy, EnemyLimbId.RIGHT_ARM, 2200);
  physics.pendingCombatEvents.push(event);
  await waitFor(() => snapshots.every(list => list.some(p => p?.states.some(s => s.enemyId === 400 && s.weaponDropped && s.reaction === HitReaction.DISARM) && p.drops.length > 0)),
    'Disarm reaction and dynamic gun must replicate to both clients');
  physics.removeAgent(agent.entityId); assert.equal(physics.combatManager.isPaired(agent), false);
  console.log('Stage 2 network passed: authoritative reactions and physical disarms broadcast to two live WebSocket observers.');
} finally {
  clients.forEach(ws => ws.terminate()); await server.stop();
}
