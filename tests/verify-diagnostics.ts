import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import { DiagnosticRecorder, EVENT_NAMES, diagnosticErrorCode, diagnosticCloseCode, newDiagnosticId, type DiagnosticEvent } from '../shared/diagnostics/events.js';
import { BugReportRecorder } from '../client/diagnostics/bugReport.js';
import { CrackupAuthoritativeServer } from '../server/gameServer.js';
import { diagnosticIdentity } from '../server/diagnostics.js';

const startedAt = new Date().toISOString();
const checks: string[] = [], traces: DiagnosticEvent[] = [];
const pass = (label: string) => { checks.push(label); console.log(`PASS ${label}`); };
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check: () => boolean, label: string) {
  const deadline = Date.now() + 12000;
  while (!check()) { assert.ok(Date.now() < deadline, `Timeout: ${label}`); await delay(20); }
}
const sentinel = 'private-sentinel';
const clientBuild = 'client-0123456789abcdef'; // Deliberate fixture build, not browser qualification.
const error = Object.assign(new TypeError(`pin=${sentinel} invite=${sentinel} C:\\Users\\${sentinel}\\save.db`), { code: sentinel });
error.stack = `TypeError: ${sentinel}\n at save (https://${sentinel}/game.js:12:34)\n at local (C:\\Users\\${sentinel}\\source.ts:7:8)`;
const report = new BugReportRecorder(clientBuild);
report.record('runtime-error', error);
assert.equal(diagnosticErrorCode(error), 'TYPE_ERROR');
assert.equal(diagnosticCloseCode(error.message), 'UNKNOWN');
assert.equal(diagnosticCloseCode('Message rate exceeded'), 'MESSAGE_RATE_EXCEEDED');
assert.equal(diagnosticCloseCode('Connection too slow'), 'CONNECTION_TOO_SLOW');
const hostile = Object.defineProperty(new Error(), 'code', { get() { throw error; } });
assert.equal(diagnosticErrorCode(hostile), 'UNKNOWN');
report.timeline.record('save.failed', { code: diagnosticErrorCode(error), pin: sentinel, message: error.message, durationMs: Infinity },
  { connectionId: sentinel, clientBuild: `https://${sentinel}` });
const exported = report.report(clientBuild, '');
assert.deepEqual(exported.events[0].frames, ['game.js:12:34']);
assert.ok(!JSON.stringify(exported).includes(sentinel));
assert.equal(exported.diagnostics.events.at(-1)!.payload.durationMs, undefined);
pass('Credential-bearing errors retain only category and shipped bundle offsets');

const bounded = new DiagnosticRecorder('client', { clientBuild }, event => { event.context.clientBuild = undefined; throw error; });
for (let i = 0; i < 1000; i++) bounded.record('client.failure', { code: 'runtime-error' });
assert.equal(bounded.snapshot().events.length, 10);
assert.equal(bounded.snapshot().suppressed, 990);
assert.equal(bounded.snapshot().sinkFailures, 10);
await delay(1050);
bounded.record('client.failure');
assert.equal(bounded.snapshot().events.at(-1)!.suppressedBefore, 990);
for (const name of EVENT_NAMES) for (let i = 0; i < 10; i++) bounded.record(name);
await delay(1050);
for (const name of EVENT_NAMES) bounded.record(name);
assert.equal(bounded.snapshot().events.length, 256);
const snapshot = bounded.snapshot(); snapshot.events[0].context.clientBuild = sentinel;
assert.equal(bounded.snapshot().events[0].context.clientBuild, clientBuild);
pass('Flood suppression, rollover counts, 256-event bound and throwing/mutating sink isolation');

fs.mkdirSync('output/solo', { recursive: true });
const directory = fs.mkdtempSync(path.resolve('output/solo/lc00-p002-'));
for (const mode of ['solo', 'campaign', 'shared'] as const) {
  const events: DiagnosticEvent[] = [];
  const diagnostics = new DiagnosticRecorder('server', diagnosticIdentity(), e => events.push(e));
  const server = new CrackupAuthoritativeServer({ mode, port: 0, dbPath: path.join(directory, `${mode}.db`), diagnostics });
  const sockets: WebSocket[] = [];
  const clientRunId = newDiagnosticId();
  const callsign = 'PRIVATE-SENTINEL';
  try {
    const port = await server.start();
    async function connect() {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`); sockets.push(ws);
      const messages: any[] = [];
      ws.on('message', (raw, binary) => { if (!binary) messages.push(JSON.parse(raw.toString())); });
      await once(ws, 'open');
      ws.send(JSON.stringify({ type: 'AUTH', callsign, pin: '654321', campaignRole: 'host',
        diagnostics: { clientRunId, clientBuild, pin: sentinel, message: error.message } }));
      await until(() => messages.some(m => m.type === 'AUTH_OK'), 'authenticate');
      return { ws, messages, auth: messages.find(m => m.type === 'AUTH_OK') };
    }
    let client = await connect();
    const first = client.auth.diagnostics;
    assert.equal(first.clientRunId, clientRunId); assert.equal(first.serverRunId, diagnostics.runId);
    assert.match(first.agentRef, /^[a-f0-9]{32}$/);
    const health = await (await fetch(`http://127.0.0.1:${port}/api/health`)).json() as any;
    assert.equal(health.diagnostics.serverBuild, diagnosticIdentity().serverBuild);
    if (mode !== 'shared') {
      const stateType = mode === 'solo' ? 'SOLO_STATE' : 'CAMPAIGN_STATE';
      const command = mode === 'solo' ? 'SOLO_SAVE' : 'CAMPAIGN_SAVE';
      async function save(fails: boolean) {
        const from = client.messages.length;
        client.ws.send(JSON.stringify({ type: command }));
        await until(() => client.messages.slice(from).some(m => m.type === stateType), command);
        const ack = client.messages.slice(from).find(m => m.type === stateType);
        assert.equal(ack.saveError, fails);
        const correlated = events.filter(e => e.context.saveAttemptId === ack.diagnostics.saveAttemptId);
        assert.ok(correlated.some(e => e.name === 'save.requested'));
        const result = correlated.find(e => e.name === (fails ? 'save.failed' : 'save.committed'));
        assert.ok(result); assert.equal(result.context.campaignRef, first.campaignRef);
        if (!fails) assert.equal(result.payload.revision, ack.revision);
        return ack;
      }
      const good = await save(false);
      server.db.db.exec(`CREATE TRIGGER diagnostic_failure BEFORE UPDATE ON solo_campaigns BEGIN SELECT RAISE(ABORT, '${sentinel} pin=654321'); END;`);
      const failed = await save(true);
      assert.equal(failed.revision, good.revision); assert.equal(failed.paused, true);
      server.db.db.exec('DROP TRIGGER diagnostic_failure');
      const recovered = await save(false); assert.ok(recovered.revision > failed.revision);
      assert.notEqual(recovered.diagnostics.saveAttemptId, failed.diagnostics.saveAttemptId);
    }
    const closed = once(client.ws, 'close'); client.ws.close(1000); await closed;
    await until(() => server.getActiveAgentCount() === 0, 'disconnect cleanup');
    client = await connect();
    assert.notEqual(client.auth.diagnostics.connectionId, first.connectionId);
    assert.equal(client.auth.diagnostics.agentRef, first.agentRef);
    assert.equal(client.auth.diagnostics.clientRunId, first.clientRunId);
    assert.equal(server.getActiveAgentCount(), 1);
    assert.ok(events.some(e => e.name === 'connection.closed' && e.context.connectionId === first.connectionId));
    if (mode === 'shared') assert.ok(events.some(e => e.name === 'save.committed'));
    assert.ok(!JSON.stringify(events).toLowerCase().includes(sentinel));
    assert.ok(!JSON.stringify(events).includes('654321'));
    pass(`${mode}: actual socket auth/save/disconnect/reconnect correlation${mode === 'shared' ? '' : ', transaction failure and retry'}`);
  } finally {
    server.db.db.exec('DROP TRIGGER IF EXISTS diagnostic_failure');
    for (const socket of sockets) socket.terminate();
    await server.stop(); server.physicsWorld.world.free();
    traces.push(...events);
  }
}

const corrupt = path.join(directory, 'corrupt'); fs.mkdirSync(corrupt);
fs.writeFileSync(path.join(corrupt, 'campaigns.db'), `${sentinel} invalid sqlite`);
const child = spawn(process.execPath, ['--import', 'tsx', 'server/solo.ts', '--no-browser'], {
  env: { ...process.env, SOLO_DATA_DIR: corrupt, SOLO_PORT: '0', DIAGNOSTIC_STDOUT: '1' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
});
let stdout = ''; child.stdout.on('data', chunk => { stdout += String(chunk); }); child.stderr.resume();
const timeout = setTimeout(() => child.kill(), 15000);
const [exitCode] = await once(child, 'exit'); clearTimeout(timeout);
assert.equal(exitCode, 1);
const startup = stdout.split(/\r?\n/).filter(line => line.startsWith('{')).map(line => JSON.parse(line)) as DiagnosticEvent[];
for (const name of ['launcher.start', 'server.failed', 'launcher.failed']) assert.ok(startup.some(e => e.name === name));
assert.equal(new Set(startup.map(e => e.context.runId)).size, 1);
const persisted = JSON.parse(fs.readFileSync(path.join(corrupt, 'logs', 'latest-error.json'), 'utf8').trim());
assert.equal(persisted.name, 'launcher.failed'); assert.equal(persisted.payload.code, 'SQLITE_NOTADB');
assert.ok(!JSON.stringify(startup).includes(sentinel));
assert.equal(fs.readFileSync(path.join(corrupt, 'campaigns.db'), 'utf8'), `${sentinel} invalid sqlite`);
traces.push(...startup);
pass('Actual launcher catches corrupt-database constructor failure, preserves bytes and writes sanitized correlated event');

fs.mkdirSync('artifacts/evidence/living-city', { recursive: true });
fs.writeFileSync(process.env.DIAGNOSTICS_REPORT ?? 'artifacts/evidence/living-city/lc00-p002-diagnostics.json', JSON.stringify({ startedAt, finishedAt: new Date().toISOString(),
  result: 'passed', method: 'Automated real SQLite/WebSocket/launcher boundaries with isolated synthetic profiles; not a human playtest.',
  builds: diagnosticIdentity(), checks, traces }, null, 2) + '\n');
