/** P0 diagnostic, not a campaign acceptance test. Only uses a temporary database. */
import assert from 'node:assert/strict';
import { fork, execFileSync, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { CrackupAuthoritativeServer } from '../server/gameServer.js';
import { CyberPetSpecies, FIXED_TIMESTEP, INPUT_FLAG_OBJECTIVE_JETPACK } from '../shared/constants.js';
import { encodeClientInput } from '../shared/protocol/binaryProtocol.js';
import { DISTRICT_LOOP_SPECS } from '../shared/world/phase5Systems.js';
import type { PersistentAgentRecord } from '../server/db.js';

const spec = DISTRICT_LOOP_SPECS[0];
const callsign = 'P0-RESTART';
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate: () => boolean, label: string) {
  const deadline = Date.now() + 10000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, `Timed out: ${label}`);
    await delay(20);
  }
}
function profile(record: PersistentAgentRecord | null) {
  assert.ok(record);
  return {
    hp: record.hp, attributes: record.attributes, xp: record.xp,
    collectedOrbs: record.collectedOrbs, unlockedSkills: record.unlockedSkills,
    unlockedRelics: record.unlockedRelics, unlockedDistrictRewards: record.unlockedDistrictRewards,
    pet: record.pet,
  };
}

async function worker() {
  let server: CrackupAuthoritativeServer | undefined;
  process.on('message', async (message: any) => {
    try {
      let result: unknown;
      if (message.action === 'start') {
        assert.equal(typeof message.dbPath, 'string');
        server = new CrackupAuthoritativeServer({ port: 0, dbPath: message.dbPath });
        result = { port: await server.start(), pid: process.pid };
      } else {
        assert.ok(server);
        if (message.action === 'seed') {
          const auth = server.db.authenticateOrCreate(callsign, '654321', spec.stage1Terminals[0]);
          assert.ok(auth.ok);
          auth.record.hp = 87;
          auth.record.xp.agility = 100;
          auth.record.collectedOrbs = [1];
          auth.record.pet = { species: CyberPetSpecies.NEON_FOX, name: 'Audit Fox', derbyWins: 2, clashWins: 1 };
          server.db.saveAgent(auth.record);
          result = 'seeded temporary profile; inventory and currency are test fixtures';
        } else if (message.action === 'snapshot') {
          const loop = server.physicsWorld.phase5Director.districtLoops.get(spec.district)!;
          result = {
            pid: process.pid,
            district: { id: spec.district, stage: loop.currentStage, terminal1Hacked: loop.terminal1Hacked,
              terminal2Hacked: loop.terminal2Hacked, lieutenantDefeated: loop.lieutenantDefeated,
              kingpinDefeated: loop.kingpinDefeated },
            storedProfile: profile(server.db.getAgent(callsign)),
            liveProfiles: [...server.physicsWorld.agents.values()].map(agent => ({
              callsign: agent.callsign, hp: agent.hp, skills: [...agent.unlockedSkills],
              districtRewards: [...agent.unlockedDistrictRewards],
            })),
            integrity: server.db.db.pragma('quick_check', { simple: true }),
          };
        } else if (message.action === 'complete-fixture') {
          // Deliberately seeded completion, never represented as normal-input boss play.
          const director = server.physicsWorld.phase5Director;
          const loop = director.districtLoops.get(spec.district)!;
          const agent = [...server.physicsWorld.agents.values()].find(a => a.callsign === callsign)!;
          assert.ok(agent);
          director.completeDistrictLoop(loop, agent, server.physicsWorld.agents);
          result = 'completion fixture applied to isolated world';
        } else if (message.action === 'stop') {
          await server.stop();
          server.physicsWorld.world.free();
          process.send?.({ id: message.id, result: 'stopped' }, () => process.exit(0));
          return;
        } else throw new Error(`Unknown action ${message.action}`);
      }
      process.send?.({ id: message.id, result });
    } catch (error) {
      process.send?.({ id: message.id, error: String(error) });
    }
  });
}

type Worker = { child: ChildProcess; rpc: (action: string, extra?: object) => Promise<any> };
function startWorker(): Worker {
  const child = fork(fileURLToPath(import.meta.url), ['--worker'], {
    execArgv: ['--import', 'tsx'], stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true,
  });
  let serial = 0;
  let stderr = '';
  child.stderr?.on('data', chunk => { stderr = (stderr + String(chunk)).slice(-3000); });
  return { child, rpc: (action, extra = {}) => new Promise((resolve, reject) => {
    const id = ++serial;
    const clean = () => { clearTimeout(timer); child.off('message', onMessage); child.off('exit', onExit); child.off('error', onError); };
    const onMessage = (message: any) => {
      if (message.id !== id) return;
      clean();
      if (message.error) reject(new Error(message.error)); else resolve(message.result);
    };
    const onExit = () => { clean(); reject(new Error(`Audit worker exited during ${action}: ${stderr}`)); };
    const onError = (error: Error) => { clean(); reject(error); };
    const timer = setTimeout(() => { clean(); reject(new Error(`Audit worker timed out: ${action}`)); }, 15000);
    child.on('message', onMessage); child.once('exit', onExit); child.once('error', onError);
    child.send({ id, action, ...extra });
  }) };
}

async function main() {
  const startedAt = new Date().toISOString();
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'crackup-p0-restart-'));
  const dbPath = path.join(temp, 'isolated.db');
  const workers: Worker[] = [];
  const sockets: WebSocket[] = [];
  async function launch() {
    const worker = startWorker(); workers.push(worker);
    const runtime = await worker.rpc('start', { dbPath });
    return { ...worker, ...runtime };
  }
  async function stop(worker: Worker) {
    const exited = once(worker.child, 'exit');
    await worker.rpc('stop');
    await exited;
  }
  async function connect(port: number, name = callsign) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`); sockets.push(ws);
    const messages: any[] = [];
    ws.on('message', (data, binary) => { if (!binary) messages.push(JSON.parse(data.toString())); });
    await once(ws, 'open');
    ws.send(JSON.stringify({ type: 'AUTH', callsign: name, pin: '654321' }));
    await until(() => messages.some(m => m.type === 'AUTH_OK' || m.type === 'AUTH_ERROR'), 'authentication');
    const auth = messages.find(m => m.type === 'AUTH_OK');
    assert.ok(auth, 'Test profile must authenticate');
    return { ws, messages, auth };
  }
  async function disconnect(ws: WebSocket) {
    const closed = once(ws, 'close'); ws.close(); await closed;
    // Let the server process close and its synchronous persistence hook.
    await delay(50);
  }
  try {
    const first = await launch();
    await first.rpc('seed');
    const initial = await first.rpc('snapshot');
    const owner = await connect(first.port);
    owner.ws.send(JSON.stringify({ type: 'UNLOCK_SKILL', skillId: 'titan_1_kinetic_plating' }));
    await until(() => owner.messages.some(m => m.type === 'BUILD_UPDATED'), 'authoritative skill purchase');
    owner.ws.send(encodeClientInput({ seq: 1, moveX: 0, moveZ: 0, yaw: 0, pitch: 0,
      buttons: INPUT_FLAG_OBJECTIVE_JETPACK, dt: FIXED_TIMESTEP }));
    let partial = await first.rpc('snapshot');
    const deadline = Date.now() + 5000;
    while (!partial.district.terminal1Hacked && Date.now() < deadline) {
      await delay(30); partial = await first.rpc('snapshot');
    }
    assert.equal(partial.district.terminal1Hacked, true, 'Real input must hack the nearby terminal');
    await disconnect(owner.ws);
    const beforeReconnect = await first.rpc('snapshot');
    const reconnected = await connect(first.port);
    assert.deepEqual(profile(reconnected.auth.record), beforeReconnect.storedProfile);
    const afterReconnect = await first.rpc('snapshot');
    await disconnect(reconnected.ws);
    await stop(first);

    const second = await launch();
    assert.notEqual(first.pid, second.pid, 'Restart must use a new operating-system process');
    const afterPartialRestart = await second.rpc('snapshot');
    assert.deepEqual(afterPartialRestart.storedProfile, beforeReconnect.storedProfile,
      'Existing individual progression must survive a process restart');
    const resumed = await connect(second.port);
    const guest = await connect(second.port, 'P0-GUEST');
    await second.rpc('complete-fixture');
    const completion = await second.rpc('snapshot');
    assert.equal(completion.district.stage, 4);
    await disconnect(resumed.ws); await disconnect(guest.ws);
    const beforeCompletedRestart = await second.rpc('snapshot');
    await stop(second);

    const third = await launch();
    const afterCompletedRestart = await third.rpc('snapshot');
    assert.notEqual(second.pid, third.pid);
    assert.deepEqual(afterCompletedRestart.storedProfile, beforeCompletedRestart.storedProfile);
    assert.ok(afterCompletedRestart.storedProfile.unlockedDistrictRewards.includes(spec.rewardId));
    assert.equal(afterCompletedRestart.integrity, 'ok');
    await stop(third);

    const sourcePaths = ['package.json', 'package-lock.json', 'tests/audit-product-baseline.ts'];
    for (const dir of ['server', 'shared', 'client']) {
      for (const file of fs.readdirSync(dir, { recursive: true }) as string[]) {
        if (file.endsWith('.ts')) sourcePaths.push(`${dir}/${file.replaceAll('\\', '/')}`);
      }
    }
    const files = sourcePaths.sort().map(file => ({ path: file,
      sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') }));
    const partialSurvives = afterPartialRestart.district.terminal1Hacked === beforeReconnect.district.terminal1Hacked;
    const completedSurvives = afterCompletedRestart.district.stage === beforeCompletedRestart.district.stage;
    const report = {
      schemaVersion: 1, startedAt, finishedAt: new Date().toISOString(), result: 'audit_completed',
      method: 'Three real server processes; private temporary SQLite database. Seeded profile inventory/XP/position, actual WebSocket authentication/skill purchase/terminal input, reconnect, graceful shutdown/restart. District completion is an explicit server fixture, not a normal-play win.',
      environment: { node: process.version, platform: process.platform, architecture: process.arch },
      build: { head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        sourceDigest: crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex'), files },
      observations: { initial, beforeReconnect, afterReconnect, afterPartialRestart,
        completion, beforeCompletedRestart, afterCompletedRestart },
      checks: { profileReconnect: true, profileProcessRestart: true, districtRewardProcessRestart: true,
        sqliteQuickCheck: true, partialDistrictProcessRestart: partialSurvives, completedDistrictProcessRestart: completedSurvives },
      findings: [{ requirement: 'FR-SAVE-01', status: partialSurvives && completedSurvives ? 'In progress' : 'Needs work',
        detail: partialSurvives && completedSurvives ? 'Sample world states survived; full schema and campaign acceptance still required.'
          : 'Personal inventory/rewards survived, but owned district objective progress did not survive server process restart.' }],
      limits: ['No abrupt termination, disk-full, migration or backup restore qualification.',
        'No browser rendering, offline package, target-hardware performance or human playtest acceptance.',
        'Shared world state is observed directly; no claim of personal campaign isolation or guest-consent UI.',
        'An audit completing successfully does not mean the product requirements passed.'],
    };
    fs.mkdirSync('artifacts/evidence', { recursive: true });
    fs.writeFileSync('artifacts/evidence/p0-save-continuity.json', JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ result: report.result, checks: report.checks, findings: report.findings }, null, 2));
  } finally {
    for (const ws of sockets) if (ws.readyState !== WebSocket.CLOSED) ws.terminate();
    for (const { child } of workers) {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit'); child.kill(); await exited;
      }
    }
    const resolved = path.resolve(temp);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('crackup-p0-restart-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}

if (process.argv.includes('--worker')) await worker();
else await main();
