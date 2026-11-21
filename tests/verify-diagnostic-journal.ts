import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fork } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { DiagnosticJournal, JOURNAL_DEFAULTS, readDiagnosticFile } from '../server/diagnosticJournal.js';
import { DiagnosticRecorder, newDiagnosticId, type DiagnosticEvent } from '../shared/diagnostics/events.js';
import { BrowserJournal, BROWSER_JOURNAL_KEY } from '../client/diagnostics/browserJournal.js';
import { CrackupAuthoritativeServer } from '../server/gameServer.js';
import { diagnosticIdentity } from '../server/diagnostics.js';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const seed = new DiagnosticRecorder('client'); seed.record('client.start');
const event = (sequence: number, name: DiagnosticEvent['name'] = 'client.ready'): DiagnosticEvent => ({ ...seed.snapshot().events[0], sequence, name,
  severity: name === 'client.failure' ? 'error' : 'info', context: { runId: seed.runId }, payload: { revision: sequence } });
async function contents(directory: string) {
  return Promise.all((await fs.readdir(directory)).map(async name => ({ name, bytes: (await fs.stat(path.join(directory, name))).size })));
}
if (process.argv.includes('--worker')) {
  const journal = new DiagnosticJournal(process.argv.at(-1)!);
  const recorder = new DiagnosticRecorder('server', { runId: journal.runId }, e => journal.enqueue(e));
  recorder.record('server.ready'); await journal.flush(); process.send?.({ ready: true, runId: journal.runId });
  setInterval(() => {}, 1000);
} else {
  const startedAt = new Date().toISOString(), checks: string[] = [];
  const pass = (name: string) => { checks.push(name); console.log(`PASS ${name}`); };
  await fs.mkdir('output/solo', { recursive: true });
  const root = await fs.mkdtemp(path.resolve('output/solo/lc00-p003-'));

  const rotation = new DiagnosticJournal(path.join(root, 'rotation'), { totalBytes: 48000, fileBytes: 4096, reserveBytes: 0 });
  assert.ok(JOURNAL_DEFAULTS.totalBytes + 2_000_000 <= 100_000_000);
  await fs.mkdir(path.join(root, 'rotation', 'reports'), { recursive: true });
  await fs.writeFile(path.join(root, 'rotation', 'reports', 'user-export.json'), 'preserve report');
  await fs.writeFile(path.join(root, 'rotation', 'campaigns.db'), 'preserve save');
  rotation.enqueue(event(1, 'client.failure'));
  for (let i = 2; i <= 2000; i++) rotation.enqueue(event(i));
  assert.ok(rotation.status().dropped > 0);
  assert.ok(rotation.status().queued <= 512 && rotation.status().queueBytes <= 1_000_000);
  assert.equal(await rotation.flush(5000), true); await rotation.close();
  const files = await contents(rotation.directory);
  for (const file of files.filter(f => f.name.endsWith('.jsonl'))) {
    for (const e of (await readDiagnosticFile(path.join(rotation.directory, file.name))).events)
      if (e.name.startsWith('journal.')) assert.equal(e.component, 'journal', 'Writer lifecycle must not collide with launcher sequence numbers');
  }
  assert.ok(files.filter(f => f.name.endsWith('.jsonl')).length > 1);
  assert.ok(files.filter(f => f.name.endsWith('.jsonl')).every(f => f.bytes <= 4096));
  assert.ok(files.reduce((n, f) => n + f.bytes, 0) <= 48000);
  assert.equal(JSON.parse(await fs.readFile(path.join(rotation.directory, 'latest-error.json'), 'utf8')).name, 'client.failure');
  assert.equal(await fs.readFile(path.join(root, 'rotation', 'reports', 'user-export.json'), 'utf8'), 'preserve report');
  assert.equal(await fs.readFile(path.join(root, 'rotation', 'campaigns.db'), 'utf8'), 'preserve save');
  const old = path.join(rotation.directory, `events-${newDiagnosticId()}-1.jsonl`);
  await fs.writeFile(old, JSON.stringify(event(1)) + '\n'); await fs.utimes(old, new Date(0), new Date(0));
  const restarted = new DiagnosticJournal(path.join(root, 'rotation'), { totalBytes: 48000, fileBytes: 4096, reserveBytes: 0 });
  assert.equal(await restarted.flush(), true); await restarted.close();
  await assert.rejects(fs.stat(old), { code: 'ENOENT' });
  pass('Actual JSONL rotation, total budget, bounded backlog, reserved latest error, retention and untouched saves/exports');

  const torn = path.join(root, 'torn.jsonl');
  await fs.writeFile(torn, JSON.stringify(event(1)) + '\n' + 'x'.repeat(20000) + '\n' + JSON.stringify(event(2)) + '\n{"schemaVersion":');
  const read = await readDiagnosticFile(torn);
  assert.deepEqual(read.events.map(e => e.sequence), [1, 2]); assert.equal(read.invalid, 2); assert.equal(read.possibleMissingTail, true);
  pass('Streaming reader bounds malformed lines and preserves complete events around a torn tail');

  const crashRoot = path.join(root, 'crash');
  const otherCwd = path.join(root, 'unrelated-working-directory'); await fs.mkdir(otherCwd);
  const child = fork(fileURLToPath(import.meta.url), ['--worker', crashRoot], { cwd: otherCwd,
    execArgv: ['--import', pathToFileURL(path.resolve('node_modules/tsx/dist/loader.mjs')).href], windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  try {
    const ready = await Promise.race([once(child, 'message'), delay(15000).then(() => { throw Error('worker timeout'); })]);
    assert.equal((ready[0] as any).ready, true);
    const exit = once(child, 'exit'); child.kill('SIGKILL'); await exit;
    const summaryFile = path.join(crashRoot, 'logs', `session-${(ready[0] as any).runId}.json`);
    const summary = JSON.parse(await fs.readFile(summaryFile, 'utf8'));
    assert.equal(summary.clean, false); assert.ok(summary.lastPersisted);
    const after = new DiagnosticJournal(crashRoot);
    assert.equal(await after.flush(), true); await after.close();
    assert.equal((await fs.readFile(summaryFile, 'utf8')), JSON.stringify(summary) + '\n');
    const previous = (await contents(after.directory)).filter(f => f.name.startsWith(`events-${summary.runId}`));
    assert.ok(previous.length); assert.ok((await readDiagnosticFile(path.join(after.directory, previous[0].name))).events.some(e => e.name === 'server.ready'));
  } finally { if (child.exitCode === null && child.signalCode === null) child.kill(); }
  pass('Actual child process kill/restart from unrelated cwd preserves configured-root events, unclean marker and dead writer recovery');

  const denied = new DiagnosticJournal(path.join(root, 'denied'), {}, { ...fs, open: async () => { throw Object.assign(Error('private-password'), { code: 'EACCES' }); } } as typeof fs);
  assert.equal(await denied.flush(), false); assert.equal(denied.status().lastError, 'EACCES'); await denied.close();
  const full = new DiagnosticJournal(path.join(root, 'full'), {}, { ...fs, appendFile: async () => { throw Object.assign(Error('private-password'), { code: 'ENOSPC' }); } } as typeof fs);
  assert.equal(await full.flush(), false); assert.equal(full.status().lastError, 'ENOSPC');
  assert.ok(!JSON.stringify(full.status()).includes('private-password'));
  const noSpace = new DiagnosticJournal(path.join(root, 'reserve'), {}, { ...fs, statfs: async () => ({ bavail: 0, bsize: 4096 }) } as unknown as typeof fs);
  assert.equal(await noSpace.flush(), false); assert.equal(noSpace.status().lastError, 'ENOSPC'); await noSpace.close();
  const invalidRoot = path.join(root, 'blocked-path'); await fs.mkdir(invalidRoot); await fs.writeFile(path.join(invalidRoot, 'logs'), 'not a directory');
  const blocked = new DiagnosticJournal(invalidRoot); assert.equal(await blocked.flush(), false); await blocked.close();
  pass('Injected EACCES/ENOSPC and free-space exhaustion plus actual blocked log path fail safely with sanitized status');

  const server = new CrackupAuthoritativeServer({ mode: 'solo', port: 0, dbPath: path.join(root, 'full', 'campaigns.db'), diagnosticJournal: full });
  const sockets: WebSocket[] = [];
  try {
    const port = await server.start();
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`); sockets.push(ws);
    const messages: any[] = []; ws.on('message', (raw, binary) => { if (!binary) messages.push(JSON.parse(raw.toString())); });
    await once(ws, 'open');
    ws.send(JSON.stringify({ type: 'AUTH', callsign: 'JOURNALQA', pin: '685421', diagnostics: { clientRunId: seed.runId } }));
    async function until(predicate: () => boolean) { for (let i = 0; i < 500 && !predicate(); i++) await delay(20); assert.ok(predicate()); }
    await until(() => messages.some(m => m.type === 'AUTH_OK'));
    const before = messages.filter(m => m.type === 'SOLO_STATE').at(-1)?.revision ?? 0;
    ws.send(JSON.stringify({ type: 'SOLO_SAVE' }));
    await until(() => messages.some(m => m.type === 'SOLO_STATE' && m.revision > before && !m.saveError));
    ws.send(JSON.stringify({ type: 'DIAGNOSTICS_BATCH', id: newDiagnosticId(), events: [event(9)] }));
    await until(() => messages.some(m => m.type === 'DIAGNOSTICS_ACK'));
    assert.equal(messages.find(m => m.type === 'DIAGNOSTICS_ACK').durable, false);
    assert.equal(server.soloSaveError, false);
  } finally { sockets.forEach(s => s.terminate()); await server.stop(); server.physicsWorld.world.free(); await full.close(); }
  pass('Actual authenticated SQLite save commits while journal disk writes fail; client receives no false durable receipt');

  const ownedRoot = path.join(root, 'ownership'), owner = new DiagnosticJournal(ownedRoot);
  assert.equal(await owner.flush(), true);
  const contender = new DiagnosticJournal(ownedRoot); assert.equal(await contender.flush(), false); await contender.close();
  owner.enqueue(event(2)); assert.equal(await owner.flush(), true); await owner.close();
  pass('Concurrent writer cannot steal live ownership or corrupt the combined retention budget');

  let release: (() => void) | undefined;
  const slow = new DiagnosticJournal(path.join(root, 'slow'), {}, { ...fs, appendFile: async (...args: Parameters<typeof fs.appendFile>) => {
    await new Promise<void>(resolve => { release = resolve; }); return fs.appendFile(...args);
  } } as typeof fs);
  const timed = performance.now(); assert.equal(await slow.flush(40), false); assert.ok(performance.now() - timed < 1000);
  for (let i = 0; i < 1000; i++) slow.enqueue(event(i + 1));
  assert.ok(slow.status().queued <= 512 && slow.status().dropped > 0);
  // Release each deliberately stalled append, then clean up only this journal.
  const unblock = setInterval(() => release?.(), 1);
  await slow.flush(10000); await slow.close(); clearInterval(unblock);
  pass('Stalled filesystem call cannot create an unbounded shutdown wait or in-memory backlog');

  const admission = new CrackupAuthoritativeServer({ mode: 'solo', port: 0, dbPath: path.join(root, 'admission', 'campaigns.db') });
  let socket: WebSocket | undefined;
  try {
    const port = await admission.start(); socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const messages: any[] = []; socket.on('message', (raw, binary) => { if (!binary) messages.push(JSON.parse(raw.toString())); });
    await once(socket, 'open');
    socket.send(JSON.stringify({ type: 'DIAGNOSTICS_BATCH', id: newDiagnosticId(), events: [event(9001)] }));
    await delay(100); assert.equal(messages.filter(m => m.type === 'DIAGNOSTICS_ACK').length, 0);
    socket.send(JSON.stringify({ type: 'AUTH', callsign: 'UPLOADQA', pin: '685421', diagnostics: { clientRunId: seed.runId } }));
    for (let i = 0; i < 200 && !messages.some(m => m.type === 'AUTH_OK'); i++) await delay(20);
    const auth = messages.find(m => m.type === 'AUTH_OK'); assert.ok(auth);
    socket.send(JSON.stringify({ type: 'DIAGNOSTICS_BATCH', id: newDiagnosticId(), events: [{ ...event(9002), context: { runId: newDiagnosticId() } }] }));
    socket.send(JSON.stringify({ type: 'DIAGNOSTICS_BATCH', id: newDiagnosticId(), events: Array.from({ length: 17 }, () => event(9003)) }));
    await delay(100); assert.equal(messages.filter(m => m.type === 'DIAGNOSTICS_ACK').length, 0);
    const id = newDiagnosticId();
    socket.send(JSON.stringify({ type: 'DIAGNOSTICS_BATCH', id, events: [{ ...event(9004), context: { runId: seed.runId, agentRef: 'f'.repeat(32) }, payload: { pin: 'PRIVATE-UPLOAD-SENTINEL' } }] }));
    socket.send(JSON.stringify({ type: 'DIAGNOSTICS_BATCH', id: newDiagnosticId(), events: [event(9005)] }));
    for (let i = 0; i < 200 && !messages.some(m => m.type === 'DIAGNOSTICS_ACK'); i++) await delay(20);
    assert.deepEqual(messages.filter(m => m.type === 'DIAGNOSTICS_ACK'), [{ type: 'DIAGNOSTICS_ACK', id, durable: true }]);
    const captured = [];
    for (const file of await contents(admission.diagnosticJournal.directory)) if (file.name.endsWith('.jsonl')) captured.push(...(await readDiagnosticFile(path.join(admission.diagnosticJournal.directory, file.name))).events);
    const uploaded = captured.filter(e => e.component === 'client');
    assert.deepEqual(uploaded.map(e => e.sequence), [9004]);
    assert.equal(uploaded[0].context.agentRef, auth.diagnostics.agentRef);
    assert.ok(!JSON.stringify(uploaded).includes('PRIVATE-UPLOAD-SENTINEL'));
  } finally { socket?.terminate(); await admission.stop(); admission.physicsWorld.world.free(); }
  pass('Real upload boundary rejects unauthenticated/other-lifetime/oversized/flood batches and overwrites forged identity');

  const memory = new Map<string, string>();
  const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value); } };
  const browser = new BrowserJournal(seed.runId, () => storage);
  for (let i = 1; i <= 2100; i++) browser.append({ ...event(i), payload: { code: 'runtime-error', privateToken: 'secret' } });
  assert.equal(browser.persist(), true); browser.close(false);
  assert.ok(memory.get(BROWSER_JOURNAL_KEY)!.length * 2 <= 2_000_000);
  assert.ok(browser.snapshot().events.length <= 2000 && browser.snapshot().dropped > 0);
  assert.ok(!memory.get(BROWSER_JOURNAL_KEY)!.includes('secret'));
  for (let i = 0; i < 8; i++) {
    const next = new BrowserJournal(newDiagnosticId(), () => storage);
    assert.ok(next.snapshot().events.some(e => e.context.runId === seed.runId)); next.close();
  }
  const reload = new BrowserJournal(newDiagnosticId(), () => storage);
  assert.equal(reload.snapshot().sessions.find(s => s.runId === seed.runId)?.clean, false); reload.close();
  const quota = new BrowserJournal(newDiagnosticId(), () => ({ getItem: () => null, setItem: () => { throw Object.assign(Error(), { name: 'QuotaExceededError' }); } }));
  quota.append({ ...event(1), context: { runId: quota.runId } }); assert.equal(quota.persist(), false);
  assert.equal(quota.snapshot().events.length, 1); assert.equal(quota.snapshot().sessions[0].lastPersistedSequence, 0); quota.close();
  const unavailable = new BrowserJournal(newDiagnosticId(), () => { throw Error('blocked storage'); });
  assert.equal(unavailable.persist(), false); unavailable.close();
  memory.set(BROWSER_JOURNAL_KEY, '{broken'); const malformed = new BrowserJournal(newDiagnosticId(), () => storage);
  assert.ok(malformed.snapshot().malformed > 0); malformed.close();
  pass('Browser event/byte limits, eight reloads, previous unclean session, allowlisting and quota/unavailable/malformed fallback');

  await fs.mkdir('artifacts/evidence/living-city', { recursive: true });
  await fs.writeFile(process.env.JOURNAL_REPORT || 'artifacts/evidence/living-city/lc00-p003-journal.json', JSON.stringify({ result: 'passed', startedAt, finishedAt: new Date().toISOString(),
    builds: diagnosticIdentity(), defaults: JOURNAL_DEFAULTS, checks, fixtures: path.relative(process.cwd(), root).replaceAll('\\', '/'),
    limitations: ['EACCES/ENOSPC are deterministic filesystem-boundary injections, not an exhausted host disk or real ACL change.', 'Browser storage unit adapters supplement the separate real Chromium reload/offline verification.'] }, null, 2) + '\n');
}
