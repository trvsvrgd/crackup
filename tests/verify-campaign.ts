import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fork, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { CrackupAuthoritativeServer } from '../server/gameServer.js';
import { AgentDatabase } from '../server/db.js';
import { CampaignStore } from '../server/campaignStore.js';
import { captureSoloWorld } from '../server/soloWorldCheckpoint.js';
import { newCampaignPresentation } from '../shared/campaign/presentation.js';
import { DISTRICT_LOOP_SPECS } from '../shared/world/phase5Systems.js';
import { EnemyCombatState, FIXED_TIMESTEP, INPUT_FLAG_OBJECTIVE_JETPACK } from '../shared/constants.js';
import { encodeClientInput, decodeWorldEventsSnapshot } from '../shared/protocol/binaryProtocol.js';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check: () => boolean, label: string) {
  const end = Date.now() + 10000;
  while (!check()) { assert.ok(Date.now() < end, `Timeout: ${label}`); await delay(20); }
}
async function worker() {
  let server: CrackupAuthoritativeServer;
  process.on('message', async (m: any) => {
    try {
      let value: any;
      if (m.action === 'start') {
        server = new CrackupAuthoritativeServer({ mode: m.mode ?? 'campaign', port: 0, dbPath: m.dbPath });
        value = { port: await server.start() };
      } else if (m.action === 'state') {
        value = { tick: server.physicsWorld.tickCount, world: captureSoloWorld(server.physicsWorld),
          clients: server.getActiveAgentCount(), error: server.soloSaveError,
          campaigns: server.db.db.prepare('SELECT owner, revision, state_json FROM solo_campaigns ORDER BY owner').all(),
          visits: server.db.db.prepare('SELECT guest, presentation_json FROM campaign_guest_visits ORDER BY guest').all(),
          rewards: server.db.db.prepare('SELECT * FROM character_reward_receipts ORDER BY callsign, reward_id').all(),
          worldReceipts: server.db.db.prepare('SELECT * FROM solo_reward_receipts').all(),
          profiles: server.db.db.prepare('SELECT callsign, unlocked_district_rewards_json FROM agents ORDER BY callsign').all() };
      } else if (m.action === 'ready-core') {
        const loop = server.physicsWorld.phase5Director.districtLoops.get(DISTRICT_LOOP_SPECS[0].district)!;
        loop.terminal1Hacked = loop.terminal2Hacked = true;
        server.physicsWorld.phase5Director.advanceDistrictLoopToStage2(loop);
        server.physicsWorld.phase5Director.advanceDistrictLoopToStage3(loop);
        const boss = server.physicsWorld.combatManager.enemies.get(loop.spec.kingpinEnemyId)!;
        boss.hp = 0; boss.combatState = EnemyCombatState.DEAD; loop.kingpinDefeated = true;
        server.physicsWorld.phase5Director.pendingNotifications.length = 0;
        const agent = [...server.physicsWorld.agents.values()].find(a => a.callsign === m.callsign)!;
        agent.position = { ...loop.spec.coreOverridePos }; server.physicsWorld.syncAgentKinematicTransform(agent);
        value = true;
      } else if (m.action === 'fail') {
        server.db.db.exec("CREATE TRIGGER fail_guest BEFORE UPDATE ON agents WHEN NEW.callsign = 'GUEST' BEGIN SELECT RAISE(ABORT, 'injected guest write failure'); END;"); value = true;
      } else if (m.action === 'repair') { server.db.db.exec('DROP TRIGGER fail_guest'); value = true; }
      else if (m.action === 'stop') {
        await server.stop(); server.physicsWorld.world.free();
        process.send?.({ id: m.id, value: true }, () => process.exit(0)); return;
      } else throw Error('Unknown fixture');
      process.send?.({ id: m.id, value });
    } catch (error) { process.send?.({ id: m.id, error: String(error) }); }
  });
}
async function main() {
  const startedAt = new Date().toISOString(), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'crackup-party-'));
  const dbPath = path.join(temp, 'campaigns.db'), children: ChildProcess[] = [], sockets: WebSocket[] = [];
  const checks: string[] = [], pass = (name: string) => { checks.push(name); console.log(`PASS ${name}`); };
  async function launch(mode = 'campaign') {
    const child = fork(fileURLToPath(import.meta.url), ['--worker'], { execArgv: ['--import', 'tsx'], windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    children.push(child); let serial = 0, stderr = ''; child.stderr?.on('data', chunk => { stderr += String(chunk); });
    function rpc(action: string, extra: object = {}): Promise<any> {
      return new Promise((resolve, reject) => {
        const id = ++serial;
        const cleanup = () => { clearTimeout(timer); child.off('message', message); child.off('exit', exited); };
        const message = (m: any) => { if (m.id !== id) return; cleanup(); m.error ? reject(Error(m.error)) : resolve(m.value); };
        const exited = () => { cleanup(); reject(Error(stderr || 'Worker exited')); };
        const timer = setTimeout(() => { cleanup(); reject(Error(`Timeout: ${action}`)); }, 15000);
        child.on('message', message); child.once('exit', exited); child.send({ id, action, ...extra });
      });
    }
    return { child, rpc, ...await rpc('start', { dbPath, mode }) };
  }
  async function connect(port: number, callsign: string, role = 'host', inviteCode = '', campaignOwner = 'HOST', expectError = false) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`); sockets.push(ws);
    const messages: any[] = [], snapshots: any[] = [];
    ws.on('message', (raw, binary) => {
      if (!binary) messages.push(JSON.parse(raw.toString()));
      else { const b = Buffer.from(raw as Buffer); const s = decodeWorldEventsSnapshot(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); if (s) snapshots.push(s); }
    });
    await once(ws, 'open'); ws.send(JSON.stringify({ type: 'AUTH', callsign, pin: '987654', campaignRole: role, inviteCode, campaignOwner }));
    await until(() => messages.some(m => m.type === (expectError ? 'AUTH_ERROR' : 'AUTH_OK')), `login ${callsign}`);
    if (!expectError) await until(() => messages.some(m => m.type === 'CAMPAIGN_STATE' || m.type === 'SOLO_STATE'), 'campaign ready');
    let seq = 0;
    return { ws, messages, snapshots, auth: messages.find(m => m.type === 'AUTH_OK'),
      latest: () => messages.filter(m => m.type === 'CAMPAIGN_STATE').at(-1),
      input() { ws.send(encodeClientInput({ seq: ++seq, moveX: 0, moveZ: 0, yaw: 0, pitch: 0, buttons: INPUT_FLAG_OBJECTIVE_JETPACK, dt: FIXED_TIMESTEP })); },
      async control(type: string, fields: object = {}, response = 'CAMPAIGN_STATE') {
        const from = messages.length; ws.send(JSON.stringify({ type, ...fields }));
        await until(() => messages.slice(from).some(m => m.type === response), type);
        return messages.slice(from).find(m => m.type === response);
      } };
  }
  async function stop(server: Awaited<ReturnType<typeof launch>>, crash = false) {
    const exited = once(server.child, 'exit'); if (crash) server.child.kill('SIGKILL'); else await server.rpc('stop'); await exited;
  }
  try {
    const db = new AgentDatabase(dbPath), store = new CampaignStore(db);
    const guest = db.authenticateOrCreate('GUEST', '987654'); assert.ok(guest.ok);
    let own = store.loadOrCreate('GUEST');
    own.state.districts[1] = { ...own.state.districts[1], stage: 2, terminal1Hacked: true, terminal2Hacked: true };
    own.state.presentation = newCampaignPresentation(); own.state.presentation.story.completed = ['deployment']; own.state.presentation.settings.sensitivity = 9;
    own = store.commit(own, guest.record, own.state);
    const ownRaw = JSON.stringify(own.state); db.close();

    let server = await launch();
    let rejected = await connect(server.port, 'BAD-GUEST', 'guest', 'bad', 'HOST', true); rejected.ws.close();
    let host = await connect(server.port, 'HOST'); let invite = host.latest().inviteCode; assert.ok(invite.length >= 12);
    const hostPresentation = newCampaignPresentation(); hostPresentation.story.active = { beat: 'deployment', node: 'dispatch' };
    await host.control('CAMPAIGN_PRESENTATION', { presentation: hostPresentation });
    rejected = await connect(server.port, 'OTHER', 'host', '', 'OTHER', true); rejected.ws.close();
    rejected = await connect(server.port, 'WRONG-CODE', 'guest', 'bad', 'HOST', true); rejected.ws.close();
    assert.equal((await fetch(`http://127.0.0.1:${server.port}/api/agent/HOST`)).status, 404);
    assert.equal((await fetch(`http://127.0.0.1:${server.port}/api/health`, { headers: { origin: 'https://untrusted.example' } })).status, 403);
    let visitor = await connect(server.port, 'GUEST', 'guest', invite);
    assert.equal(visitor.latest().inviteCode, undefined); assert.equal(visitor.latest().role, 'guest');
    assert.equal(visitor.auth.presentation.settings.sensitivity, 9);
    assert.equal((await server.rpc('state')).world.districts[1].stage, 1);
    pass('Explicit host/guest admission, private invite, single owner and unequal-progress join isolation');

    const visit = structuredClone(visitor.auth.presentation);
    visit.story.active.node = 'move'; visit.story.choices = [{ beat: 'deployment', node: 'dispatch', index: 1 }]; visit.settings.sensitivity = 6;
    await visitor.control('CAMPAIGN_PRESENTATION', { presentation: visit });
    let state = await server.rpc('state');
    assert.equal(state.campaigns.find((r: any) => r.owner === 'GUEST').state_json, ownRaw);
    assert.deepEqual(JSON.parse(state.campaigns.find((r: any) => r.owner === 'HOST').state_json).presentation, hostPresentation);
    const beforeTick = state.tick; await visitor.control('SOLO_PAUSE', { paused: true }); await delay(100);
    assert.ok((await server.rpc('state')).tick > beforeTick);
    await visitor.control('CAMPAIGN_LEAVE', {}, 'CAMPAIGN_LEFT');
    visitor = await connect(server.port, 'GUEST', 'guest', invite);
    assert.deepEqual(visitor.auth.presentation, visit);
    pass('Guest visit story/settings persist separately; solo pause commands cannot pause co-op');

    host.ws.terminate(); await until(() => visitor.latest().paused, 'host suspension');
    state = await server.rpc('state'); visitor.input(); await delay(120);
    assert.equal((await server.rpc('state')).tick, state.tick);
    host = await connect(server.port, 'HOST'); assert.equal(host.latest().inviteCode, invite);
    await until(() => !visitor.latest().paused, 'host recovery');
    await delay(100); assert.ok((await server.rpc('state')).tick > state.tick);
    pass('Host disconnect freezes guest simulation/input; authenticated owner reconnect resumes same party');

    await server.rpc('ready-core', { callsign: 'GUEST' }); await host.control('CAMPAIGN_SAVE');
    const beforeFailure = await server.rpc('state'); await server.rpc('fail'); visitor.input();
    await until(() => host.latest().saveError, 'atomic save failure');
    state = await server.rpc('state');
    assert.deepEqual(state.campaigns, beforeFailure.campaigns); assert.deepEqual(state.profiles, beforeFailure.profiles);
    assert.equal(state.rewards.length, 0); assert.equal(state.world.districts[0].stage, 4);
    const from = visitor.messages.length; visitor.ws.send(JSON.stringify({ type: 'CAMPAIGN_LEAVE' })); await delay(100);
    assert.equal(visitor.messages.slice(from).some(m => m.type === 'CAMPAIGN_LEFT'), false);
    visitor.ws.terminate(); await delay(80);
    assert.equal((await server.rpc('state')).clients, 2); // Pending failed save retains the disconnected participant.
    await server.rpc('repair'); await host.control('CAMPAIGN_SAVE');
    assert.equal((await server.rpc('state')).clients, 1); // Successful retry releases the departed client.
    assert.equal(host.latest().saveError, false);
    state = await server.rpc('state'); assert.equal(state.rewards.length, 2); assert.equal(state.worldReceipts.length, 1);
    assert.equal(state.campaigns.find((r: any) => r.owner === 'GUEST').state_json, ownRaw);
    pass('Guest-triggered completion commits all characters and host world atomically; failed guest write rolls everything back and retry grants once');

    await stop(server, true); server = await launch();
    rejected = await connect(server.port, 'GUEST', 'guest', invite, 'HOST', true); rejected.ws.close();
    host = await connect(server.port, 'HOST'); const previousInvite = invite; invite = host.latest().inviteCode; assert.notEqual(invite, previousInvite);
    rejected = await connect(server.port, 'EXPIRED', 'guest', previousInvite, 'HOST', true); rejected.ws.close();
    visitor = await connect(server.port, 'GUEST', 'guest', invite);
    assert.deepEqual(visitor.auth.presentation, visit);
    state = await server.rpc('state'); assert.equal(state.world.districts[0].stage, 4); assert.equal(state.rewards.length, 2);
    assert.equal(state.campaigns.find((r: any) => r.owner === 'GUEST').state_json, ownRaw);
    pass('Actual process death/restart preserves host completion, both reward receipts, guest visit and untouched guest world');

    const late = [];
    for (let i = 2; i < 8; i++) {
      late.push(await connect(server.port, `ALLY-${i}`, 'guest', invite));
      if (i === 3 || i === 7) assert.equal(host.latest().members.length, i + 1);
    }
    assert.equal((await server.rpc('state')).clients, 8);
    rejected = await connect(server.port, 'NINTH', 'guest', invite, 'HOST', true); rejected.ws.close();
    for (const member of late) assert.deepEqual(member.auth.record.unlockedDistrictRewards, []);
    state = await server.rpc('state'); assert.equal(state.rewards.length, 2);
    await host.control('CAMPAIGN_SAVE'); assert.equal((await server.rpc('state')).rewards.length, 2);
    pass('Two/four/eight-player rosters, capacity limit and late-join policy; no retroactive or repeated unique rewards');

    await host.control('CAMPAIGN_LEAVE', {}, 'CAMPAIGN_LEFT');
    await until(() => visitor.messages.some(m => m.type === 'CAMPAIGN_LEFT'), 'party end');
    assert.equal((await server.rpc('state')).clients, 0);
    const newHost = await connect(server.port, 'GUEST');
    state = await server.rpc('state'); assert.equal(state.world.districts[0].stage, 1); assert.equal(state.world.districts[1].stage, 2);
    assert.equal(newHost.auth.presentation.settings.sensitivity, 9); assert.equal(newHost.auth.record.unlockedDistrictRewards.length, 1);
    await server.rpc('ready-core', { callsign: 'GUEST' }); newHost.input();
    await until(() => newHost.snapshots.some(s => s.districts[0].currentStage === 4), 'second world completion');
    await newHost.control('CAMPAIGN_SAVE');
    state = await server.rpc('state'); assert.equal(state.rewards.filter((r: any) => r.callsign === 'GUEST').length, 1);
    pass('Host ends the whole party; former guest hosts their own checkpoint/settings and cannot duplicate technology earned in another world');
    await stop(server);

    server = await launch('solo');
    const solo = await connect(server.port, 'GUEST');
    assert.equal(solo.auth.mode, 'solo'); assert.equal(solo.auth.presentation.settings.sensitivity, 9);
    assert.equal((await server.rpc('state')).world.districts[1].stage, 2);
    pass('Owned campaign remains readable by offline solo on the same explicitly supplied database');
    await stop(server);
    fs.writeFileSync('artifacts/evidence/p1-campaign-verification.json', JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), result: 'passed', checks,
      method: 'Real child processes and authenticated WebSocket clients (2/4/8 players), actual H input at a fixture-prepared core, SQLite guest-write fault injection, abrupt process death and restart.',
      limits: ['Combat prerequisites are explicit fixtures, not human mission completion.', 'No real WAN, latency/loss, UI, target-hardware, matchmaking or identity-provider qualification.'], finalState: state }, null, 2) + '\n');
  } finally {
    sockets.forEach(ws => ws.terminate());
    for (const child of children) if (child.exitCode === null && child.signalCode === null) { const done = once(child, 'exit'); child.kill(); await done; }
    const resolved = path.resolve(temp);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('crackup-party-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}
if (process.argv.includes('--worker')) await worker(); else await main();
