import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { CrackupAuthoritativeServer } from './gameServer.js';
import { serverDiagnostics } from './diagnostics.js';
import { diagnosticErrorCode } from '../shared/diagnostics/events.js';
import { DiagnosticJournal } from './diagnosticJournal.js';

const dataDir = process.env.SOLO_DATA_DIR || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share'), 'CRACKUP', 'solo');
const port = Number(process.env.SOLO_PORT || 3219);
const journal = new DiagnosticJournal(dataDir);
const diagnostics = serverDiagnostics('launcher', journal.runId, journal);
diagnostics.record('launcher.start', { mode: 'solo', port });
let server: CrackupAuthoritativeServer | undefined;
const noBrowser = process.argv.includes('--no-browser');
function openBrowser(url: string) {
  if (noBrowser) return;
  if (process.platform !== 'win32') { console.log(`Open ${url}`); return; }
  // URL is generated from a numeric loopback port, never user-provided shell text.
  spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Start-Process '${url}'`],
    { windowsHide: true, stdio: 'ignore' }).on('error', error => console.error(error));
}
let closing = false;
async function shutdown() {
  if (closing || !server) return;
  closing = true;
  try { await server.stop(); server.physicsWorld?.world.free(); diagnostics.record('launcher.stop'); await journal.close(); process.exit(0); }
  catch (error) { closing = false; logFailure(error); }
}
function logFailure(error: unknown) {
  diagnostics.record('launcher.failed', { code: diagnosticErrorCode(error) });
  // Startup failure still reaches the terminal if storage is inaccessible; no arbitrary error text.
  console.error(JSON.stringify(diagnostics.snapshot().events.at(-1)));
}
try {
  fs.mkdirSync(dataDir, { recursive: true });
  server = new CrackupAuthoritativeServer({ mode: 'solo', port, dbPath: path.join(dataDir, 'campaigns.db'),
    diagnosticJournal: journal });
  const bound = await server.start();
  diagnostics.record('launcher.ready', { mode: 'solo', port: bound });
  console.log(JSON.stringify({ mode: 'solo', url: `http://127.0.0.1:${bound}`, saveDirectory: dataDir }));
  openBrowser(`http://127.0.0.1:${bound}`);
  // The profile screen sends a loopback health heartbeat; closing the last tab releases the process.
  if (!noBrowser) setInterval(() => {
    if (server && server.getActiveAgentCount() === 0 && Date.now() - server.lastLocalActivityAt > 60000) void shutdown();
  }, 5000).unref();
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => void shutdown());
} catch (error: any) {
  if (error?.code === 'EADDRINUSE') {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(2000) });
      const health = await response.json() as any;
      if (health.product === 'crackup-protocol-eclipse' && health.mode === 'solo') {
        diagnostics.record('launcher.reused', { port }, { serverRunId: health.diagnostics?.serverRunId });
        openBrowser(`http://127.0.0.1:${port}`);
        // start() created timers before attempting listen; terminate only this unused launcher process.
        server?.db.close(); await journal.close(); process.exit(0);
      }
    } catch { /* An unrelated local service must not be opened as the game. */ }
  }
  logFailure(error);
  await journal.close();
  console.error(`Unable to start local solo. Diagnostics: ${journal.directory}`);
  process.exit(1);
}
