import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { CrackupAuthoritativeServer } from '../server/gameServer.js';
import { decodeCombatPresentation, HitReaction, EnemyArchetype, WARDEN_RIG_SCALE } from '../shared/combat/combatPresentation.js';
import { WeaponVariant } from '../shared/combat/weaponPresentation.js';
import { EnemyLimbId } from '../shared/constants.js';

const server = new CrackupAuthoritativeServer({ port: 0, dbPath: ':memory:' });
const clients: WebSocket[] = [];
const waitFor = async (test: () => boolean, message: string) => {
  const start = performance.now(); while (!test() && performance.now() - start < 3000) await new Promise(r => setTimeout(r, 10));
  assert.ok(test(), message);
};
try {
  const port = await server.start();
  const snapshots: ReturnType<typeof decodeCombatPresentation>[][] = [[], [], []];
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
  await waitFor(() => snapshots.slice(0, 2).every(list => list.length > 0), 'Every observer must receive packet 0x08');
  const physics = server.physicsWorld, agent = [...physics.agents.values()][0];
  const enemy = physics.combatManager.spawnEnemy(400, 'NETWORK-REACTION', { x: 900, y: 0, z: 900 }, false, { maxHp: 5000 });
  enemy.presentation.archetype = EnemyArchetype.SECTOR_WARDEN;
  agent.position = { x: 900, y: 0, z: 902 };
  const event = physics.combatManager.applyLimbDamage(agent, enemy, EnemyLimbId.RIGHT_ARM, 2200);
  physics.pendingCombatEvents.push(event);
  await waitFor(() => snapshots.slice(0, 2).every(list => list.some(p => p?.states.some(s => s.enemyId === 400 && s.weaponDropped && s.reaction === HitReaction.DISARM) && p.drops.some(d => d.variant === WeaponVariant.HEAVY && d.scale === Math.fround(WARDEN_RIG_SCALE)))),
    'Disarm reaction and dynamic gun must replicate to both clients');
  const late = new WebSocket(`ws://127.0.0.1:${port}/ws`); clients.push(late);
  late.on('message', (data, binary) => {
    if (!binary) return; const bytes = data as Buffer;
    const packet = decodeCombatPresentation(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer); if (packet) snapshots[2].push(packet);
  });
  await once(late, 'open'); late.send(JSON.stringify({ type: 'AUTH', callsign: 'STAGE3D-LATE', pin: '2468' }));
  await waitFor(() => snapshots[2].some(p => p?.drops.some(d => d.variant === WeaponVariant.HEAVY && d.scale === Math.fround(WARDEN_RIG_SCALE))), 'Late join retains dropped weapon variant and scale');
  physics.removeAgent(agent.entityId); assert.equal(physics.combatManager.isPaired(agent), false);
  console.log('Stage 2/3D network passed: authoritative reactions, scaled heavy disarms and v2 presentation broadcast to two observers and a late joiner.');
} finally {
  clients.forEach(ws => ws.terminate()); await server.stop();
}
