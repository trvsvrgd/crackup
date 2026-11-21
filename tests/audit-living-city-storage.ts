/** P001 controlled launcher/storage reproductions. Never opens a personal campaign store. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import WebSocket from 'ws';
import { AgentDatabase } from '../server/db.js';
import { CampaignStore } from '../server/campaignStore.js';

const evidence = path.resolve('artifacts/evidence/living-city');
const root = fs.mkdtempSync(path.resolve('output/solo/lc00-storage-'));
const startedAt = new Date().toISOString();
const children: ChildProcess[] = [];
const sockets: WebSocket[] = [];
const observations: object[] = [];
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const data = (label: string) => { const dir = path.join(root, label); fs.mkdirSync(dir); return dir; };
function seed(directory: string, partial = false, corrupt = false) {
  const db = new AgentDatabase(path.join(directory, 'campaigns.db'));
  try {
    const auth = db.authenticateOrCreate('LC00STORAGE', '647281'); assert.ok(auth.ok);
    const store = new CampaignStore(db); let campaign = store.loadOrCreate(auth.record.callsign);
    if (partial) { campaign.state.districts[0].terminal1Hacked = true; campaign = store.commit(campaign, auth.record, campaign.state); }
    if (corrupt) db.db.prepare('UPDATE solo_campaigns SET state_json = ?').run('{"version":999}');
    return { campaignId: campaign.id, revision: campaign.revision };
  } finally { db.close(); }
}
function launch(directory: string, port = 0) {
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/solo.ts', '--no-browser'], {
    cwd: process.cwd(), env: { ...process.env, SOLO_DATA_DIR: directory, SOLO_PORT: String(port) },
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  let stdout = '', stderr = '';
  child.stdout!.on('data', chunk => { stdout += String(chunk); });
  child.stderr!.on('data', chunk => { stderr += String(chunk); });
  let launchError: Error | null = null; child.on('error', error => { launchError = error; });
  return { child, get stdout() { return stdout; }, get stderr() { return stderr; }, get launchError() { return launchError; } };
}
async function until(predicate: () => boolean, label: string, ms = 15000) {
  const limit = Date.now() + ms;
  while (!predicate()) { if (Date.now() > limit) throw Error(`Timeout: ${label}`); await delay(30); }
}
async function ready(run: ReturnType<typeof launch>) {
  await until(() => /"url":/.test(run.stdout) || run.child.exitCode !== null || Boolean(run.launchError), 'launcher ready');
  if (run.launchError) throw run.launchError;
  const line = run.stdout.split(/\r?\n/).find(line => line.startsWith('{"mode":"solo"'));
  assert.ok(line, `No ready event; exit ${run.child.exitCode}: ${run.stderr.slice(0, 300)}`);
  return JSON.parse(line) as { url: string; mode: string };
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
}
async function login(url: string) {
  const ws = new WebSocket(url.replace('http:', 'ws:') + '/ws'); sockets.push(ws);
  const controls: any[] = [];
  ws.on('message', (bytes, binary) => { if (!binary) controls.push(JSON.parse(bytes.toString())); });
  await once(ws, 'open'); ws.send(JSON.stringify({ type: 'AUTH', callsign: 'LC00STORAGE', pin: '647281' }));
  await until(() => controls.some(m => m.type === 'AUTH_OK' || m.type === 'AUTH_ERROR'), 'authentication');
  if (controls.some(m => m.type === 'AUTH_OK')) await until(() => controls.some(m => m.type === 'SOLO_STATE'), 'save state');
  return { ws, controls, auth: controls.find(m => m.type === 'AUTH_OK' || m.type === 'AUTH_ERROR'),
    state: controls.find(m => m.type === 'SOLO_STATE') };
}
try {
  const aDir = data('source-a'), bDir = data('source-b');
  const aSeed = seed(aDir, true), bSeed = seed(bDir);
  const a = launch(aDir), aInfo = await ready(a);
  const first = await login(aInfo.url);
  assert.match(first.state.checkpoint, /relays 1\/2/);
  first.ws.close(); await once(first.ws, 'close');
  const other = launch(bDir, Number(new URL(aInfo.url).port));
  await until(() => other.child.exitCode !== null, 'second launcher exits');
  const health = await fetch(aInfo.url + '/api/health').then(r => r.json());
  observations.push({ id: 'S01-occupied-solo-port-different-store', source: 'controlled two-store fixture, real launcher processes',
    result: 'reproduced', secondLauncherExit: other.child.exitCode, secondLauncherReadyEvent: /"url":/.test(other.stdout),
    runningStoreRemainsA: health.activeAgents === 0 && health.registeredAccounts === 1,
    reason: 'EADDRINUSE reuse validates product/mode only; it does not compare intended save directory or build.',
    sourceACampaign: aSeed.campaignId, sourceBCampaign: bSeed.campaignId });
  assert.equal(other.child.exitCode, 0);
  await stop(a.child);
  const restarted = launch(aDir), restartedInfo = await ready(restarted);
  const resumed = await login(restartedInfo.url);
  assert.match(resumed.state.checkpoint, /relays 1\/2/);
  observations.push({ id: 'S02-partial-checkpoint-real-process-restart', fixture: 'one relay completion seeded through real CampaignStore transaction',
    result: 'retained', revision: resumed.state.revision, checkpoint: resumed.state.checkpoint, preservedCampaignId: aSeed.campaignId });
  resumed.ws.close(); await once(resumed.ws, 'close'); await stop(restarted.child);
  const b = launch(bDir), bInfo = await ready(b); const second = await login(bInfo.url);
  assert.match(second.state.checkpoint, /relays 0\/2/);
  observations.push({ id: 'S03-same-callsign-different-data-root', result: 'separate campaign confirmed', checkpoint: second.state.checkpoint,
    limitation: 'Intentional storage isolation; no current save-picker/discovery workflow explains the other source.' });
  second.ws.close(); await once(second.ws, 'close'); await stop(b.child);
  const corruptCampaignDir = data('unsupported-campaign'); seed(corruptCampaignDir, false, true);
  const corruptCampaign = launch(corruptCampaignDir), corruptInfo = await ready(corruptCampaign);
  const rejected = await login(corruptInfo.url);
  assert.equal(rejected.auth.type, 'AUTH_ERROR'); rejected.ws.close(); await once(rejected.ws, 'close');
  await stop(corruptCampaign.child);
  const preserved = new AgentDatabase(path.join(corruptCampaignDir, 'campaigns.db'));
  const raw = preserved.db.prepare('SELECT state_json FROM solo_campaigns').get() as { state_json: string }; preserved.close();
  assert.equal(raw.state_json, '{"version":999}');
  observations.push({ id: 'S04-unsupported-campaign-reentry', induced: true, result: 'refused without overwrite',
    message: rejected.auth.error, launcherLogCreated: fs.existsSync(path.join(corruptCampaignDir, 'launcher.log')),
    serverLoggedLoadFailure: /Unsupported|damaged|load/i.test(corruptCampaign.stderr),
    remainingGap: 'No detailed durable load-failure event or selectable backup recovery in this flow.' });
  const brokenDbDir = data('corrupt-database');
  fs.writeFileSync(path.join(brokenDbDir, 'campaigns.db'), 'Controlled P001 invalid SQLite file.');
  const broken = launch(brokenDbDir); await until(() => broken.child.exitCode !== null, 'corrupt database launcher exit');
  assert.notEqual(broken.child.exitCode, 0);
  observations.push({ id: 'S05-corrupt-database-startup', induced: true, result: 'process exits', exitCode: broken.child.exitCode,
    sqliteNotADatabase: /SQLITE_NOTADB|not a database/i.test(broken.stderr),
    launcherLogCreated: fs.existsSync(path.join(brokenDbDir, 'launcher.log')),
    reason: 'Database/server construction occurs before launcher try/catch; advertised launcher.log is absent for this failure.' });
  const report = { schemaVersion: 1, startedAt, finishedAt: new Date().toISOString(), result: 'baseline_captured',
    dataRoot: path.relative(process.cwd(), root).replaceAll('\\', '/'), observations,
    limits: ['All source data is synthetic and isolated.', 'Partial relay state is a fixture, not normal mission completion.',
      'Faults are deliberately induced, not proof of the cause of an owner-reported spontaneous crash.'] };
  fs.mkdirSync(evidence, { recursive: true });
  fs.writeFileSync(path.join(evidence, 'lc00-p001-storage.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  for (const ws of sockets) if (ws.readyState !== WebSocket.CLOSED) ws.terminate();
  await Promise.all(children.map(stop));
}
