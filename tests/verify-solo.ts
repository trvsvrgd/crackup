import { CampaignStorage } from '../client/narrative/campaignStorage.js';
import { StoryDirector } from '../shared/narrative/storyBible.js';
import { newCampaignPresentation, parseCampaignPresentation, campaignRecap } from '../shared/campaign/presentation.js';
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
import { newSoloCampaign, parseSoloCampaign, SOLO_RESUME_POSITION } from '../shared/campaign/soloCampaign.js';
import { DISTRICT_LOOP_SPECS } from '../shared/world/phase5Systems.js';
import { DreadnoughtPhase, EnemyCombatState, FIXED_TIMESTEP, INPUT_FLAG_OBJECTIVE_JETPACK } from '../shared/constants.js';
import { encodeClientInput, decodeWorldEventsSnapshot } from '../shared/protocol/binaryProtocol.js';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check: () => boolean, label: string) {
  const end = Date.now() + 10000;
  while (!check()) { assert.ok(Date.now() < end, `Timeout: ${label}`); await delay(20); }
}
const failTrigger = `CREATE TRIGGER fail_solo BEFORE UPDATE ON solo_campaigns BEGIN SELECT RAISE(ABORT, 'injected disk failure'); END;`;

async function worker() {
  let server: CrackupAuthoritativeServer;
  process.on('message', async (msg: any) => {
    try {
      let value: any;
      if (msg.action === 'start') {
        server = new CrackupAuthoritativeServer({ port: 0, mode: 'solo', dbPath: msg.dbPath });
        value = { port: await server.start(), pid: process.pid, address: server.httpServer.address() };
      } else if (msg.action === 'state') {
        value = { world: captureSoloWorld(server.physicsWorld), tick: server.physicsWorld.tickCount,
          paused: server.soloPaused, error: server.soloSaveError, clients: server.getActiveAgentCount(),
          rows: server.db.db.prepare('SELECT owner, revision, state_json FROM solo_campaigns ORDER BY owner').all(),
          receipts: server.db.db.prepare('SELECT * FROM solo_reward_receipts').all(),
          profiles: server.db.db.prepare('SELECT callsign, hp, telemetry_json, unlocked_district_rewards_json FROM agents ORDER BY callsign').all() };
      } else if (msg.action === 'fixture') {
        // Explicit scenario setup; never claimed to be a normal-player campaign win.
        const agent = [...server.physicsWorld.agents.values()][0]; assert.ok(agent);
        const director = server.physicsWorld.phase5Director, loop = director.districtLoops.get(DISTRICT_LOOP_SPECS[0].district)!;
        if (msg.kind === 'relay') {
          agent.position = { ...DISTRICT_LOOP_SPECS[0].stage1Terminals[msg.terminal ?? 0] };
          server.physicsWorld.syncAgentKinematicTransform(agent);
        } else if (msg.kind === 'kingpin-dead') {
          loop.terminal1Hacked = loop.terminal2Hacked = true;
          director.advanceDistrictLoopToStage2(loop); director.advanceDistrictLoopToStage3(loop);
          const boss = server.physicsWorld.combatManager.enemies.get(loop.spec.kingpinEnemyId)!;
          boss.hp = 0; boss.combatState = EnemyCombatState.DEAD; loop.kingpinDefeated = true;
        } else if (msg.kind === 'core') {
          agent.position = { ...loop.spec.coreOverridePos }; server.physicsWorld.syncAgentKinematicTransform(agent);
        } else if (msg.kind === 'ending') {
          for (const item of director.districtLoops.values()) {
            item.terminal1Hacked = item.terminal2Hacked = true;
            director.advanceDistrictLoopToStage2(item); director.advanceDistrictLoopToStage3(item);
            director.completeDistrictLoop(item, agent, server.physicsWorld.agents);
          }
          server.physicsWorld.dreadnoughtDirector.phase = DreadnoughtPhase.DEFEATED;
          server.physicsWorld.dreadnoughtDirector.respawnTimerSec = 0;
        }
        value = true;
      } else if (msg.action === 'fail') { server.db.db.exec(failTrigger); value = true; }
      else if (msg.action === 'repair') { server.db.db.exec('DROP TRIGGER fail_solo'); value = true; }
      else if (msg.action === 'stop') {
        await server.stop(); server.physicsWorld.world.free();
        process.send?.({ id: msg.id, value: true }, () => process.exit(0)); return;
      } else throw new Error('Unknown fixture command');
      process.send?.({ id: msg.id, value });
    } catch (error) { process.send?.({ id: msg.id, error: String(error) }); }
  });
}

async function main() {
  const startedAt = new Date().toISOString();
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'crackup-solo-'));
  const children: ChildProcess[] = [], sockets: WebSocket[] = [];
  const checks: string[] = [];
  const pass = (name: string) => { checks.push(name); console.log(`PASS ${name}`); };
  async function launch() {
    const child = fork(fileURLToPath(import.meta.url), ['--worker'], { execArgv: ['--import', 'tsx'], windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    children.push(child);
    let serial = 0, stderr = ''; child.stderr?.on('data', chunk => { stderr += String(chunk); });
    function rpc(action: string, extra: object = {}): Promise<any> {
      return new Promise((resolve, reject) => {
        const id = ++serial;
        const cleanup = () => { clearTimeout(timer); child.off('message', message); child.off('exit', exited); child.off('error', error); };
        const message = (msg: any) => { if (msg.id !== id) return; cleanup(); msg.error ? reject(new Error(msg.error)) : resolve(msg.value); };
        const exited = () => { cleanup(); reject(new Error(`Worker exited: ${stderr}`)); };
        const error = (err: Error) => { cleanup(); reject(err); };
        const timer = setTimeout(() => { cleanup(); reject(new Error(`Worker timeout: ${action}`)); }, 15000);
        child.on('message', message); child.once('exit', exited); child.once('error', error); child.send({ id, action, ...extra });
      });
    }
    const info = await rpc('start', { dbPath: path.join(temp, 'live.db') });
    return { child, rpc, ...info };
  }
  async function connect(port: number, callsign = 'SOLO-A', expectError = false) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`); sockets.push(ws);
    const messages: any[] = [], snapshots: any[] = [];
    ws.on('message', (raw, binary) => {
      if (!binary) messages.push(JSON.parse(raw.toString()));
      else {
        const buffer = Buffer.from(raw as Buffer);
        const snapshot = decodeWorldEventsSnapshot(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
        if (snapshot) snapshots.push(snapshot);
      }
    });
    await once(ws, 'open'); ws.send(JSON.stringify({ type: 'AUTH', callsign, pin: '987654' }));
    await until(() => messages.some(m => m.type === (expectError ? 'AUTH_ERROR' : 'AUTH_OK')), 'login');
    let seq = 0;
    return { ws, messages, snapshots, auth: messages.find(m => m.type === 'AUTH_OK'),
      input() { ws.send(encodeClientInput({ seq: ++seq, moveX: 0, moveZ: 0, yaw: 0, pitch: 0, buttons: INPUT_FLAG_OBJECTIVE_JETPACK, dt: FIXED_TIMESTEP })); },
      async control(type: string, fields: object = {}, response = 'SOLO_STATE') {
        const from = messages.length; ws.send(JSON.stringify({ type, ...fields }));
        await until(() => messages.slice(from).some(m => m.type === response), type);
        return messages.slice(from).find(m => m.type === response);
      } };
  }
  async function stop(server: Awaited<ReturnType<typeof launch>>, crash = false) {
    const exited = once(server.child, 'exit');
    if (crash) server.child.kill('SIGKILL'); else await server.rpc('stop');
    await exited;
  }
  try {
    const context = { deployed: true, districtIndex: 0, vigilanteLevel: 1, whisperOrbs: 0, nonLethalBounties: 0, relaySabotage: false, citadelLoopStage: 1, bossDefeated: false };
    const story = new StoryDirector(); story.update(context); story.advance(); story.advance(1);
    const presentation = newCampaignPresentation(); presentation.story = { ...story.snapshot(), heard: [0, 15] };
    presentation.cinematics['opening-v1'] = 'skipped'; presentation.settings.sensitivity = 7;
    presentation.settings.quality = 'performance'; presentation.settings.cinematicIntros = false;
    const resumedStory = new StoryDirector(); resumedStory.restore(presentation.story);
    assert.equal(resumedStory.node?.id, 'move'); assert.equal(resumedStory.choices[0].index, 1);
    resumedStory.advance(); assert.ok(resumedStory.completed.has('deployment'));
    assert.match(campaignRecap(presentation), /Understood. Moving/); assert.doesNotMatch(campaignRecap(presentation), /Dampener|harvest|Revocation/);
    assert.throws(() => parseCampaignPresentation({ ...presentation, districts: [] }));
    assert.throws(() => parseCampaignPresentation({ ...presentation, settings: { ...presentation.settings, sensitivity: Infinity } }));
    assert.throws(() => parseCampaignPresentation({ ...presentation, story: { ...presentation.story, active: { beat: 'dawn', node: 'silence' } } }));
    const legacy = new Map<string, string>([
      ['crackup:story:v1:LEGACY', JSON.stringify({ completed: ['deployment', 'unknown'], heard: [0, 0, -1] })],
      ['crackup:cinematics:v1:LEGACY', '{"opening-v1":"skipped","bogus":"completed"}'],
      ['crackup.settings', '{"sensitivity":"8","quality":"performance","bloom":false}']]);
    const published: any[] = [];
    const storage = new CampaignStorage({ getItem: k => legacy.get(k) ?? null, setItem: (k, v) => { legacy.set(k, v); } }, p => published.push(p));
    storage.useCampaign('LEGACY', true, null);
    assert.deepEqual(published[0].story.completed, ['deployment']); assert.deepEqual(published[0].story.heard, [0]);
    assert.equal(published[0].settings.sensitivity, 8); assert.deepEqual(published[0].story.choices, []);
    const savedPresentation = structuredClone(published[0]); legacy.clear();
    storage.useCampaign('LEGACY', true, savedPresentation); assert.equal(published.length, 1);
    assert.equal(JSON.parse(storage.getItem('crackup.settings')!).sensitivity, 8);
    storage.setItem('crackup.audioMuted', 'true'); assert.equal(published[1].settings.audioMuted, true);
    storage.suspend(); storage.setItem('crackup.cinematicIntros', 'false'); assert.equal(published.length, 2);
    storage.useCampaign('OTHER', true, newCampaignPresentation()); assert.equal(storage.getItem('crackup.audioMuted'), 'false');
    storage.useCampaign('SHARED', false, null); storage.setItem('crackup.audioMuted', 'true'); assert.equal(legacy.get('crackup.audioMuted'), 'true');
    const unavailable = new CampaignStorage({ getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } }, () => {});
    unavailable.useCampaign('BLOCKED', true, null); assert.equal(unavailable.getItem('crackup.cinematicIntros'), 'true');
    pass('Dialogue branch/node round-trip, spoiler-limited recap, bounded schema and one-time browser import with storage loss/profile isolation');
    const db = new AgentDatabase(path.join(temp, 'schema.db'));
    try {
      const a = db.authenticateOrCreate('LEGACY', '987654'); assert.ok(a.ok);
      a.record.hp = 91; db.saveAgent(a.record);
      const store = new CampaignStore(db);
      let campaign = store.loadOrCreate('LEGACY');
      assert.equal(db.getAgent('LEGACY')!.hp, 91);
      assert.deepEqual(campaign.state, newSoloCampaign());
      const v1 = { version: 1, districts: campaign.state.districts, dreadnoughtDefeated: false };
      v1.districts[0].terminal1Hacked = true;
      db.db.prepare('UPDATE solo_campaigns SET state_json = ?').run(JSON.stringify(v1));
      campaign = store.loadOrCreate('LEGACY');
      assert.equal(campaign.state.version, 2); assert.equal(campaign.state.presentation, null);
      assert.equal(campaign.state.districts[0].terminal1Hacked, true);
      assert.equal(JSON.parse((db.db.prepare('SELECT state_json FROM solo_campaigns').get() as any).state_json).version, 1);
      campaign = store.commit(campaign, a.record, { ...campaign.state, presentation });
      assert.equal(JSON.parse((db.db.prepare('SELECT state_json FROM solo_campaigns').get() as any).state_json).version, 2);
      assert.deepEqual(store.loadOrCreate('LEGACY').state.presentation, presentation);
      db.db.exec(failTrigger); a.record.hp = 12;
      assert.throws(() => store.commit(campaign, a.record, campaign.state));
      assert.equal(db.getAgent('LEGACY')!.hp, 91);
      assert.equal(store.loadOrCreate('LEGACY').revision, campaign.revision);
      db.db.exec('DROP TRIGGER fail_solo');
      const complete = newSoloCampaign();
      complete.districts[0] = { ...complete.districts[0], stage: 4, terminal1Hacked: true, terminal2Hacked: true, kingpinDefeated: true };
      db.db.exec(`CREATE TRIGGER fail_receipt BEFORE INSERT ON solo_reward_receipts BEGIN SELECT RAISE(ABORT, 'injected receipt failure'); END;`);
      assert.throws(() => store.commit(campaign, { ...a.record, unlockedDistrictRewards: [DISTRICT_LOOP_SPECS[0].rewardId] }, complete));
      assert.equal(db.getAgent('LEGACY')!.hp, 91);
      assert.equal(store.loadOrCreate('LEGACY').state.districts[0].stage, 1);
      assert.equal((db.db.prepare('SELECT COUNT(*) AS n FROM solo_reward_receipts').get() as any).n, 0);
      db.db.exec('DROP TRIGGER fail_receipt');
      assert.throws(() => store.commit(campaign, { ...a.record, callsign: 'OTHER' }, campaign.state));
      const damaged = JSON.stringify({ ...campaign.state, presentation: { ...presentation, settings: { ...presentation.settings, sensitivity: 99 } } });
      db.db.prepare('UPDATE solo_campaigns SET state_json = ?').run(damaged);
      assert.throws(() => store.loadOrCreate('LEGACY'));
      assert.equal((db.db.prepare('SELECT state_json FROM solo_campaigns').get() as any).state_json, damaged);
      assert.throws(() => parseSoloCampaign({ ...newSoloCampaign(), version: 99 }));
      db.db.prepare('UPDATE solo_campaigns SET state_json = ?').run('{"version":99}');
      assert.throws(() => store.loadOrCreate('LEGACY'));
      assert.equal((db.db.prepare('SELECT state_json FROM solo_campaigns').get() as any).state_json, '{"version":99}');
      pass('Existing-profile migration, transaction rollback, owner guard and unknown-version preservation');
    } finally { db.close(); }

    let server = await launch();
    assert.equal(server.address.address, '127.0.0.1');
    assert.equal((await fetch(`http://127.0.0.1:${server.port}/api/health`, { headers: { origin: 'https://untrusted.example' } })).status, 403);
    assert.equal((await fetch(`http://127.0.0.1:${server.port}/api/agent/SOLO-A`)).status, 404);
    let a = await connect(server.port);
    assert.equal(a.auth.mode, 'solo'); assert.deepEqual(a.auth.record.position, SOLO_RESUME_POSITION);
    const rejected = await connect(server.port, 'SOLO-B', true); rejected.ws.close();
    pass('Loopback-only listener, blocked cross-origin API and concurrent profile isolation');

    await a.control('SOLO_PAUSE', { paused: true });
    const paused = await server.rpc('state'); a.input(); await delay(200);
    assert.equal((await server.rpc('state')).tick, paused.tick);
    await a.control('SOLO_PAUSE', { paused: false }); await delay(100);
    assert.ok((await server.rpc('state')).tick > paused.tick);
    pass('Authoritative pause freezes ticks and rejects queued gameplay input');
    await a.control('SOLO_PRESENTATION', { presentation });
    let savedRow = JSON.parse((await server.rpc('state')).rows[0].state_json);
    assert.deepEqual(savedRow.presentation, presentation);
    const invalid = await a.control('SOLO_PRESENTATION', { presentation: { ...presentation, dreadnoughtDefeated: true } }, 'SOLO_PRESENTATION_ERROR');
    assert.match(invalid.error, /Invalid/);
    assert.equal((await server.rpc('state')).world.dreadnoughtDefeated, false);
    assert.deepEqual(JSON.parse((await server.rpc('state')).rows[0].state_json).presentation, presentation);
    pass('Authenticated presentation persists; injected world fields rejected without changing saved data');

    await server.rpc('fixture', { kind: 'relay' }); a.input();
    await until(() => a.snapshots.some(s => s.districts.some((d: any) => d.districtIndex === 0 && d.terminalsHacked === 1)), 'replicated relay checkpoint');
    const partial = await server.rpc('state'); assert.equal(partial.world.districts[0].terminal1Hacked, true);
    await stop(server, true); // Actual abrupt process termination after the acknowledged checkpoint.
    server = await launch(); a = await connect(server.port);
    assert.equal((await server.rpc('state')).world.districts[0].terminal1Hacked, true);
    assert.deepEqual(a.auth.presentation, presentation);
    pass('Story, choices, settings and cinematic history survive an abrupt process death alongside the relay');
    pass('Partial relay checkpoint survives abrupt process death and real client reauthentication');

    await server.rpc('fixture', { kind: 'relay', terminal: 1 }); a.input();
    await until(() => a.snapshots.some(s => s.districts.some((d: any) => d.districtIndex === 0 && d.currentStage === 2)), 'lieutenant checkpoint');
    await stop(server); server = await launch(); a = await connect(server.port);
    assert.equal((await server.rpc('state')).world.districts[0].stage, 2);
    pass('Both relay flags and active lieutenant checkpoint survive process restart');

    await server.rpc('fixture', { kind: 'kingpin-dead' });
    await a.control('SOLO_SAVE'); await stop(server);
    server = await launch(); a = await connect(server.port);
    let state = await server.rpc('state'); assert.equal(state.world.districts[0].stage, 3); assert.equal(state.world.districts[0].kingpinDefeated, true);
    await server.rpc('fixture', { kind: 'core' }); a.input();
    await until(() => a.messages.some(m => m.type === 'PHASE5_EVENT' && m.notification.type === 'DISTRICT_LOOP_COMPLETED'), 'core override after restored dead boss');
    await a.control('SOLO_SAVE');
    state = await server.rpc('state'); assert.equal(state.world.districts[0].stage, 4); assert.equal(state.receipts.length, 1);
    await stop(server);
    server = await launch(); a = await connect(server.port);
    state = await server.rpc('state'); assert.equal(state.world.districts[0].stage, 4); assert.equal(state.receipts.length, 1);
    await server.rpc('fixture', { kind: 'core' }); a.input(); await a.control('SOLO_SAVE');
    assert.equal((await server.rpc('state')).receipts.length, 1);
    pass('Defeated kingpin resumes into usable override; completed district and reward receipt survive without replay');

    await a.control('SOLO_LEAVE', {}, 'SOLO_LEFT');
    const b = await connect(server.port, 'SOLO-B');
    assert.equal(b.auth.presentation, null);
    assert.equal((await server.rpc('state')).world.districts[0].stage, 1);
    assert.deepEqual(b.auth.record.unlockedDistrictRewards, []);
    await b.control('SOLO_LEAVE', {}, 'SOLO_LEFT'); a = await connect(server.port);
    assert.equal((await server.rpc('state')).world.districts[0].stage, 4);
    assert.deepEqual(a.auth.presentation, presentation);
    pass('Sequential local profile switching keeps campaign ownership and rewards separate');

    await server.rpc('fail');
    const changed = structuredClone(presentation); changed.settings.audioMuted = true;
    const failed = await a.control('SOLO_PRESENTATION', { presentation: changed }); assert.equal(failed.saveError, true);
    const frozen = await server.rpc('state');
    assert.equal(JSON.parse(frozen.rows.find((r: any) => r.owner === 'SOLO-A').state_json).presentation.settings.audioMuted, false); await delay(100);
    assert.equal((await server.rpc('state')).tick, frozen.tick);
    a.ws.send(JSON.stringify({ type: 'SOLO_LEAVE' })); await delay(100);
    assert.equal((await server.rpc('state')).clients, 1);
    await server.rpc('repair');
    assert.equal((await a.control('SOLO_SAVE')).saveError, false);
    assert.deepEqual(JSON.parse((await server.rpc('state')).rows.find((r: any) => r.owner === 'SOLO-A').state_json).presentation, changed);
    pass('Save failure pauses play and prevents leaving; retry succeeds after storage recovery');

    await a.control('SOLO_PAUSE', { paused: false });
    await server.rpc('fixture', { kind: 'ending' }); await a.control('SOLO_SAVE'); await stop(server);
    server = await launch(); a = await connect(server.port); await delay(120);
    state = await server.rpc('state'); assert.equal(state.world.dreadnoughtDefeated, true); assert.equal(state.receipts.length, 5);
    pass('Final campaign outcome persists without redeploying the shared-server raid');
    await stop(server);

    fs.mkdirSync('artifacts/evidence', { recursive: true });
    fs.writeFileSync(process.env.SOLO_REPORT ?? 'artifacts/evidence/p1-solo-verification.json', JSON.stringify({ startedAt, finishedAt: new Date().toISOString(),
      result: 'passed', checks, finalState: state.world, method: 'Real child server processes, SQLite transaction fault injection, actual WebSocket authentication/control/input and packet-aware objective snapshots. Positions and boss states are explicit test fixtures.',
      limits: ['Existing district campaign only; no claim of the future 24 authored missions.', 'No human playtest, hardware qualification or full storage fault matrix.', 'Portable launcher/browser verification recorded separately.'] }, null, 2) + '\n');
  } finally {
    for (const ws of sockets) if (ws.readyState !== WebSocket.CLOSED) ws.terminate();
    for (const child of children) if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit'); child.kill(); await exited;
    }
    const resolved = path.resolve(temp);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('crackup-solo-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}
if (process.argv.includes('--worker')) await worker(); else await main();
