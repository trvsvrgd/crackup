/**
 * CRACKUP: Protocol Eclipse (v2.0 True 3D AAA Architecture)
 * Authoritative Server Entrypoint
 */

import { CrackupAuthoritativeServer } from './gameServer.js';
import path from 'node:path';
import { DiagnosticJournal } from './diagnosticJournal.js';
import { serverDiagnostics } from './diagnostics.js';
import { diagnosticErrorCode } from '../shared/diagnostics/events.js';

const port = Number(process.env.PORT || 3000);
const journal = new DiagnosticJournal(process.env.DATA_DIR || path.resolve('data'));
const diagnostics = serverDiagnostics('launcher', journal.runId, journal);
diagnostics.record('launcher.start', { mode: 'shared' });
let server: CrackupAuthoritativeServer;
try {
  server = new CrackupAuthoritativeServer({ port, diagnosticJournal: journal });
  const boundPort = await server.start(); diagnostics.record('launcher.ready', { mode: 'shared', port: boundPort });
  console.log(`CRACKUP shared server: http://localhost:${boundPort}. Diagnostics: ${journal.directory}`);
} catch (error) {
  diagnostics.record('launcher.failed', { code: diagnosticErrorCode(error) }); await journal.close();
  console.error(`Shared startup failed (${diagnosticErrorCode(error)}). Diagnostics: ${journal.directory}`); process.exit(1);
}

let closing = false;
const shutdown = async () => {
  if (closing) return;
  closing = true;
  try {
  console.log('\n[CRACKUP v2.0] Flushing SQLite WAL state and shutting down...');
  await server.stop();
  diagnostics.record('launcher.stop'); await journal.close();
  process.exit(0);
  } catch (error) { closing = false; diagnostics.record('launcher.failed', { code: diagnosticErrorCode(error) }); console.error('Save failed; shutdown cancelled.'); }
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

