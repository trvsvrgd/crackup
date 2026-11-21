import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { readDiagnosticFile } from '../server/diagnosticJournal.js';
import { sanitizeDiagnosticEvent } from '../shared/diagnostics/events.js';

const evidence = 'artifacts/evidence/living-city';
const bytes = await fs.readFile(path.join(evidence, 'lc00-p003-browser.log'));
const browser = JSON.parse(bytes.toString(bytes[0] === 0xff ? 'utf16le' : 'utf8').replace(/^\uFEFF/, ''));
assert.equal(browser.result, 'passed');
const directory = 'output/solo/lc00-p003-browser/logs';
const entries = await fs.readdir(directory), events = [], summaries = [];
for (const name of entries) {
  if (/^events-[a-f0-9-]+-\d+\.jsonl$/.test(name)) {
    const parsed = await readDiagnosticFile(path.join(directory, name));
    assert.equal(parsed.invalid, 0); events.push(...parsed.events);
  } else if (/^session-[a-f0-9-]+\.json$/.test(name)) {
    const s = JSON.parse(await fs.readFile(path.join(directory, name), 'utf8'));
    summaries.push({ schemaVersion: s.schemaVersion, runId: s.runId, startedAt: s.startedAt, updatedAt: s.updatedAt,
      clean: s.clean, possibleMissingTail: s.possibleMissingTail, lastPersisted: s.lastPersisted, dropped: s.dropped, writeFailures: s.writeFailures });
  }
}
const health = await (await fetch('http://127.0.0.1:33521/api/health')).json() as any;
assert.equal(health.diagnostics.journal.available, true);
const current = health.diagnostics.serverRunId;
assert.ok(summaries.some(s => s.runId !== current && s.clean === false && s.lastPersisted));
assert.ok(events.some(e => e.component === 'server' && e.context.runId === current && e.name === 'server.ready'));
const clientRun = browser.report.diagnostics.runId;
assert.ok(events.some(e => e.component === 'client' && e.context.runId === clientRun && e.name === 'client.failure' && e.payload.frame0 === 'game.js:123:456'));
assert.ok(events.some(e => e.component === 'client' && e.context.runId === clientRun && e.name === 'client.start'));
for (const event of events) assert.ok(sanitizeDiagnosticEvent(event));
const serialized = events.map(e => JSON.stringify(e)).join('\n') + '\n';
for (const secret of ['PRIVATE-JOURNAL-SENTINEL', 'P003JOURNAL', '685421', 'private-host', 'C:\\Users\\']) assert.ok(!serialized.includes(secret));
await fs.writeFile(path.join(evidence, 'lc00-p003-persisted.jsonl'), serialized);
await fs.writeFile(path.join(evidence, 'lc00-p003-browser.json'), JSON.stringify(browser, null, 2) + '\n');
await fs.writeFile(path.join(evidence, 'lc00-p003-restart.json'), JSON.stringify({ result: 'passed', checkedAt: new Date().toISOString(),
  method: 'Actual BAT-launched solo process stopped after browser closure/zero Agents, then restarted against the same isolated root.',
  clientBuild: browser.clientBuild, currentRuntime: health.diagnostics, previousSummaries: summaries, persistedEvents: events.length,
  sourceDirectory: directory, assertions: ['Previous process events and unclean marker retained', 'New runtime writes to same configured root',
    'Real browser pre-authentication error history uploaded after local authentication', 'Sanitized files exclude profile, PIN, message, host and filesystem path sentinels'] }, null, 2) + '\n');
console.log(`PASS ${events.length} real persisted events across ${summaries.length} runtime sessions, including authenticated browser uploads.`);
