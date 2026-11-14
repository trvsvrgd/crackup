import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { CrackupAuthoritativeServer } from './gameServer.js';

const dataDir = process.env.SOLO_DATA_DIR || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share'), 'CRACKUP', 'solo');
fs.mkdirSync(dataDir, { recursive: true });
const port = Number(process.env.SOLO_PORT || 3219);
const server = new CrackupAuthoritativeServer({ mode: 'solo', port, dbPath: path.join(dataDir, 'campaigns.db') });
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
  if (closing) return;
  closing = true;
  try { await server.stop(); server.physicsWorld?.world.free(); process.exit(0); }
  catch (error) { closing = false; fs.appendFileSync(path.join(dataDir, 'launcher.log'), `${new Date().toISOString()} ${String(error)}\n`); }
}
try {
  const bound = await server.start();
  console.log(JSON.stringify({ mode: 'solo', url: `http://127.0.0.1:${bound}`, saveDirectory: dataDir }));
  openBrowser(`http://127.0.0.1:${bound}`);
  // The profile screen sends a loopback health heartbeat; closing the last tab releases the process.
  if (!noBrowser) setInterval(() => {
    if (server.getActiveAgentCount() === 0 && Date.now() - server.lastLocalActivityAt > 60000) void shutdown();
  }, 5000).unref();
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => void shutdown());
} catch (error: any) {
  if (error?.code === 'EADDRINUSE') {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(2000) });
      const health = await response.json() as any;
      if (health.product === 'crackup-protocol-eclipse' && health.mode === 'solo') {
        openBrowser(`http://127.0.0.1:${port}`);
        // start() created timers before attempting listen; terminate only this unused launcher process.
        server.db.close(); process.exit(0);
      }
    } catch { /* An unrelated local service must not be opened as the game. */ }
  }
  fs.appendFileSync(path.join(dataDir, 'launcher.log'), `${new Date().toISOString()} ${String(error)}\n`);
  console.error(`Unable to start local solo. Details: ${path.join(dataDir, 'launcher.log')}`);
  process.exit(1);
}
