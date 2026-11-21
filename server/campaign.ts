import fs from 'node:fs';
import path from 'node:path';
import { CrackupAuthoritativeServer } from './gameServer.js';
import { DiagnosticJournal } from './diagnosticJournal.js';
import { serverDiagnostics } from './diagnostics.js';
import { diagnosticErrorCode } from '../shared/diagnostics/events.js';

// Separate server-local profile database. No implicit import from an offline or public account.
const directory = path.resolve(process.env.CAMPAIGN_DATA_DIR ?? 'data/campaign-coop');
const journal = new DiagnosticJournal(directory), diagnostics = serverDiagnostics('launcher', journal.runId, journal);
diagnostics.record('launcher.start', { mode: 'campaign' });
let server: CrackupAuthoritativeServer;
try {
  fs.mkdirSync(directory, { recursive: true });
  server = new CrackupAuthoritativeServer({ mode: 'campaign', port: Number(process.env.CAMPAIGN_PORT ?? 3222),
    bindAddress: process.env.CAMPAIGN_BIND ?? '127.0.0.1', dbPath: path.join(directory, 'campaigns.db'), diagnosticJournal: journal });
  const port = await server.start(); diagnostics.record('launcher.ready', { mode: 'campaign', port });
  console.log(`Campaign co-op: http://127.0.0.1:${port}. Choose Host or Join in the profile screen. Saves: ${directory}. Diagnostics: ${journal.directory}`);
} catch (error) {
  diagnostics.record('launcher.failed', { code: diagnosticErrorCode(error) }); await journal.close();
  console.error(`Campaign startup failed (${diagnosticErrorCode(error)}). Diagnostics: ${journal.directory}`); process.exit(1);
}
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => {
  if (closing) return;
  closing = true;
  void server.stop().then(async () => { server.physicsWorld.world.free(); diagnostics.record('launcher.stop'); await journal.close(); process.exit(0); })
    .catch(error => { closing = false; diagnostics.record('launcher.failed', { code: diagnosticErrorCode(error) }); console.error('Save failed; shutdown cancelled.'); });
});
