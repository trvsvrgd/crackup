import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DiagnosticRecorder, newDiagnosticId } from '../shared/diagnostics/events.js';
import { DiagnosticReports } from '../server/diagnosticReports.js';
import { BugReportRecorder } from '../client/diagnostics/bugReport.js';
import { buildSelectedReport } from '../client/diagnostics/reportExport.js';
import { CrackupAuthoritativeServer } from '../server/gameServer.js';
import { diagnosticIdentity } from '../server/diagnostics.js';

const startedAt = new Date().toISOString(), checks: string[] = [];
const pass = (label: string) => { checks.push(label); console.log(`PASS ${label}`); };
await fs.mkdir('output/solo', { recursive: true });
const root = await fs.mkdtemp(path.resolve('output/solo/lc00-p004-'));
const directory = path.join(root, 'solo', 'logs'); await fs.mkdir(directory, { recursive: true });
const runId = newDiagnosticId(), now = new Date().toISOString();
const recorder = new DiagnosticRecorder('server', { runId, serverBuild: 'server-0123456789abcdef' });
recorder.record('server.ready'); const seed = recorder.snapshot().events[0];
const make = (sequence: number) => ({ ...seed, sequence, context: { ...seed.context, campaignRef: 'a'.repeat(32), pin: 'PRIVATE-EXPORT-SENTINEL' },
  name: sequence === 1500 ? 'save.committed' : sequence === 1499 ? 'save.failed' : 'server.ready', payload: { revision: 42, message: 'PRIVATE-EXPORT-SENTINEL' } });
await fs.writeFile(path.join(directory, `session-${runId}.json`), JSON.stringify({ schemaVersion: 1, runId, startedAt: now, updatedAt: now,
  clean: false, possibleMissingTail: true, dropped: 5, writeFailures: 1, privateProfile: 'PRIVATE-EXPORT-SENTINEL', lastPersisted: { runId, component: 'server', sequence: 1500, at: now } }));
for (let segment = 1; segment <= 3; segment++) await fs.writeFile(path.join(directory, `events-${runId}-${segment}.jsonl`),
  Array.from({ length: 500 }, (_, i) => JSON.stringify(make((segment - 1) * 500 + i + 1))).join('\n') + '\n');
await fs.appendFile(path.join(directory, `events-${runId}-3.jsonl`), '{"torn":');
const reports = new DiagnosticReports(directory, newDiagnosticId());
const catalogue = await reports.catalogue(); assert.equal(catalogue.sessions[0].id, runId);
assert.equal(catalogue.localFolder, directory);
const detail = await reports.detail(runId); assert.ok(detail);
assert.equal(detail.events.length, 512); assert.equal(detail.invalidLines, 1); assert.equal(detail.omittedFiles, 1);
assert.ok(detail.truncatedEvents > 0);
assert.ok(!JSON.stringify(detail).includes('PRIVATE-EXPORT-SENTINEL'));
pass('Real large-session file retrieval is bounded, retains valid rows and explicitly counts omitted/torn history');

const browser = new BugReportRecorder('client-0123456789abcdef');
const base = browser.report('client-0123456789abcdef', '', { saveRevision: 999 });
const selected = buildSelectedReport(base, { kind: 'runtime', id: runId }, { steps: 'Steps', expected: 'Expected', actual: 'Actual' }, detail);
assert.equal(selected.lastGoodSave?.revision, 42); assert.equal(selected.laterSaveFailure, false);
assert.equal(selected.session, null, 'Previous session must not inherit current page state');
assert.equal(selected.notes, 'Steps'); assert.equal(selected.expected, 'Expected'); assert.equal(selected.actual, 'Actual');
assert.ok(selected.completeness.warnings.includes('runtime-not-confirmed-clean'));
assert.ok(selected.completeness.warnings.includes('runtime-history-truncated'));
assert.ok(selected.completeness.warnings.includes('runtime-history-malformed'));
assert.ok(!JSON.stringify(selected).includes(directory)); assert.ok(!JSON.stringify(selected).includes('PRIVATE-EXPORT-SENTINEL'));
const large = buildSelectedReport(base, { kind: 'runtime', id: runId }, { steps: '🧭'.repeat(100000), expected: 'é'.repeat(100000), actual: 'a'.repeat(100000) }, detail);
assert.ok(Buffer.byteLength(JSON.stringify(large, null, 2)) <= 2_000_000); assert.ok(large.diagnostics.events.length <= 512);
const missing = buildSelectedReport(base, { kind: 'runtime', id: newDiagnosticId() }, { steps: '', expected: '', actual: '' }, detail, true);
assert.equal(missing.selectedSession.runtime, null); assert.equal(missing.lastGoodSave, null);
assert.ok(missing.completeness.warnings.includes('selected-runtime-unavailable'));
for (let i = 0; i < 50; i++) browser.timeline.record('client.failure', { code: 'runtime-error' });
const suppressed = buildSelectedReport(browser.report('client-0123456789abcdef', ''), {kind:'browser', id:browser.timeline.runId}, {steps:'',expected:'',actual:''});
assert.ok(suppressed.diagnostics.suppressed! > 0 && suppressed.completeness.warnings.includes('events-rate-suppressed'), 'Unflushed suppression counters survive report export');
browser.journal.close();
pass('Selected export excludes paths/private fields, separates old/current state, preserves recorded commit and bounds Unicode notes');

const startup = { ...seed, name: 'launcher.failed', component: 'launcher', severity: 'error', context: { runId: newDiagnosticId() }, payload: { code: 'LAUNCHER_BUILD' } };
await fs.writeFile(path.join(directory, 'bootstrap.json'), JSON.stringify(startup));
const startupDetail = await reports.detail(startup.context.runId);
assert.equal(startupDetail?.session.kind, 'bootstrap'); assert.equal(startupDetail?.events[0].payload.code, 'LAUNCHER_BUILD');
await fs.writeFile(path.join(directory, `session-${newDiagnosticId()}.json`), '{not-json');
assert.equal((await reports.catalogue()).unavailableEntries, 1);
assert.equal(await reports.detail('../campaigns.db'), null);
const blocked = path.join(root, 'blocked'); await fs.writeFile(blocked, 'not a directory');
await assert.rejects(new DiagnosticReports(blocked, newDiagnosticId()).catalogue());
pass('Startup failure is selectable; malformed/unavailable storage and path traversal fail safely');

for (const mode of ['solo', 'campaign', 'shared'] as const) {
  const server = new CrackupAuthoritativeServer({ mode, bindAddress: '127.0.0.1', port: 0, dbPath: path.join(root, mode, 'campaigns.db') });
  try {
    const port = await server.start(), url = `http://127.0.0.1:${port}/api/diagnostics`;
    await server.diagnosticJournal.flush();
    const result = await fetch(url + '/sessions');
    if (mode !== 'solo') { assert.equal(result.status, 404); assert.ok(!(await result.text()).includes(root)); continue; }
    assert.equal(result.status, 200); const data = await result.json() as any;
    assert.ok(data.sessions.some((s: any) => s.id === runId), 'Previous session reachable before authentication');
    const previous = await fetch(url + `/session/${runId}`); assert.equal(previous.status, 200);
    assert.ok(!JSON.stringify(await previous.json()).includes('PRIVATE-EXPORT-SENTINEL'));
    assert.equal((await fetch(url + '/sessions', { headers: { Origin: 'https://untrusted.invalid' } })).status, 403);
    assert.equal((await fetch(url + '/sessions', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 404);
    assert.equal((await fetch(url + '/sessions', { method: 'POST' })).status, 405);
    assert.equal((await fetch(url + '/session/not-a-uuid')).status, 404);
    const statuses = [];
    for (let i = 0; i < 32; i++) statuses.push((await fetch(url + '/sessions')).status);
    assert.ok(statuses.includes(429));
  } finally { await server.stop(); server.physicsWorld.world.free(); }
}
pass('Actual local-solo HTTP reports work before login; hosted/shared, cross-origin, cross-site, write, invalid-ID and flood requests are rejected');

await fs.writeFile(process.env.REPORTS_REPORT || 'output/solo/report-export-result.json', JSON.stringify({ result: 'passed', startedAt, finishedAt: new Date().toISOString(),
  builds: diagnosticIdentity(), checks, method: 'Isolated real log files and HTTP servers; labeled synthetic large/torn session fixtures. No personal saves.',
  sample: selected }, null, 2) + '\n');
