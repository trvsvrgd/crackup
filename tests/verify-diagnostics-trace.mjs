// Read captured real browser/launcher evidence; never inspect a save database.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root = 'artifacts/evidence/living-city/';
function read(name) {
  const bytes = fs.readFileSync(root + name);
  return (bytes[0] === 0xff && bytes[1] === 0xfe ? bytes.toString('utf16le') : bytes.toString('utf8')).replace(/^\uFEFF/, '');
}
const browser = JSON.parse(read('lc00-p002-browser.log'));
const observedFailure = JSON.parse(read('lc00-p002-browser-slow-connection.log'));
const server = read('lc00-p002-launcher.log').split(/\r?\n/).flatMap(line => {
  try { const event = JSON.parse(line); return event.schemaVersion === 1 && event.context && event.name ? [event] : []; }
  catch { return []; }
});
assert.equal(browser.result, 'diagnostic_capture_passed');
assert.equal(browser.returnedToProfileSelection, true);
const client = browser.report.diagnostics.events;
const authenticated = client.find(e => e.name === 'connection.authenticated');
assert.ok(authenticated);
const context = authenticated.context;
assert.ok(server.some(e => e.component === 'launcher' && e.name === 'launcher.start' && e.context.runId === context.serverRunId));
assert.ok(server.some(e => e.name === 'connection.authenticated' && e.context.connectionId === context.connectionId && e.context.clientRunId === context.runId));
const saved = client.findLast(e => e.name === 'save.committed'); assert.ok(saved);
const related = server.filter(e => e.context.saveAttemptId === saved.context.saveAttemptId);
assert.ok(related.some(e => e.name === 'save.requested'));
assert.ok(related.some(e => e.name === 'save.committed' && e.payload.revision === saved.payload.revision));
assert.ok(server.some(e => e.name === 'connection.closed' && e.context.connectionId === context.connectionId && e.payload.closeCode === 1000));
assert.equal(observedFailure.returnedToProfileSelection, false);
const close = observedFailure.recoveryReport.diagnostics.events.find(e => e.name === 'connection.closed');
assert.equal(close.payload.code, 'CONNECTION_TOO_SLOW');
assert.ok(server.some(e => e.name === 'connection.closed' && e.context.connectionId === close.context.connectionId && e.payload.code === close.payload.code));
const unique = new Map();
for (const event of [...server, ...client, ...observedFailure.recoveryReport.diagnostics.events])
  unique.set(`${event.component}:${event.context.runId}:${event.sequence}`, event);
const events = [...unique.values()].sort((a, b) => a.at.localeCompare(b.at));
const serialized = events.map(e => JSON.stringify(e)).join('\n') + '\n';
for (const forbidden of ['LC00DIAGNOSTIC', '647281', 'saveDirectory', 'C:\\Users\\', 'http://127.0.0.1']) assert.ok(!serialized.includes(forbidden));
fs.writeFileSync(root + 'lc00-p002-trace.jsonl', serialized);
fs.writeFileSync(root + 'lc00-p002-browser.json', JSON.stringify(browser, null, 2) + '\n');
fs.writeFileSync(root + 'lc00-p002-slow-connection.json', JSON.stringify(observedFailure, null, 2) + '\n');
fs.writeFileSync(root + 'lc00-p002-trace-validation.json', JSON.stringify({ result: 'passed', checkedAt: new Date().toISOString(),
  method: 'Join actual BAT launch, browser authentication, save revision/attempt and disconnect; also join earlier failed journey.',
  events: events.length, clientBuild: browser.report.build, serverBuild: context.serverBuild, contentBuild: context.contentBuild,
  successfulJourney: browser.gameplayJourney, earlierJourney: observedFailure.gameplayJourney,
  knownOpenDefect: 'LC-BUG-007: slow-connection close 4008 prevents Save and leave; root queue growth unprofiled.' }, null, 2) + '\n');
console.log(`PASS ${events.length} sanitized events: launcher/server/client auth, save commit and disconnect joined; earlier gameplay failure retained.`);
