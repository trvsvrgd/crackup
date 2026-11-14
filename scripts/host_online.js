/**
 * CRACKUP: Protocol Eclipse — Cross-Country Internet Host & Tunnel Launcher
 * Starts the authoritative 8-Player WebSocket Server AND opens a zero-config
 * HTTPS/WSS Public Internet Tunnel (using Windows built-in OpenSSH -> localhost.run / Pinggy)
 * so up to 8 friends across the country can join immediately in their browsers!
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CrackupAuthoritativeServer } from '../dist/server/gameServer.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const server = new CrackupAuthoritativeServer();
let tunnel = null;

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const TUNNEL_URL_FILE = path.join(DATA_DIR, 'public_url.txt');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
// Clear stale tunnel file on boot
try {
  if (fs.existsSync(TUNNEL_URL_FILE)) fs.writeFileSync(TUNNEL_URL_FILE, '', 'utf8');
} catch (_) {}

function savePublicUrl(url) {
  try {
    fs.writeFileSync(TUNNEL_URL_FILE, url.trim(), 'utf8');
  } catch (_) {}
}

function startSshTunnel(provider = 'localhost.run') {
  console.log(`🌐 Establishing secure cross-country HTTPS/WSS tunnel via ${provider}...`);
  const sshArgs =
    provider === 'localhost.run'
      ? [
          '-o', 'StrictHostKeyChecking=no',
          '-o', 'UserKnownHostsFile=/dev/null',
          '-o', 'ServerAliveInterval=30',
          '-R', `80:127.0.0.1:${PORT}`,
          'nokey@localhost.run'
        ]
      : [
          '-p', '443',
          '-o', 'StrictHostKeyChecking=no',
          '-o', 'UserKnownHostsFile=/dev/null',
          '-o', 'ServerAliveInterval=30',
          '-R0:127.0.0.1:' + PORT,
          'a.pinggy.io'
        ];

  const proc = spawn('ssh', sshArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
  tunnel = proc;
  let foundUrl = false;

  const inspectChunk = (chunk) => {
    const text = chunk.toString('utf8');
    // Match https://*.lhr.life or https://*.localhost.run or https://*.pinggy.link or https://*.trycloudflare.com
    const match = text.match(/https:\/\/[a-zA-Z0-9.-]+\.(lhr\.life|localhost\.run|pinggy\.link|a\.pinggy\.link|trycloudflare\.com)/);
    if (match && !foundUrl) {
      foundUrl = true;
      const publicUrl = match[0];
      savePublicUrl(publicUrl);
      console.log(`\n========================================================================`);
      console.log(`🌎 CROSS-COUNTRY PUBLIC GAME LINK READY!`);
      console.log(`👉 Send this URL to up to 7 friends anywhere in the country:`);
      console.log(`\n   ${publicUrl}\n`);
      console.log(`   (Supports both HTTPS and real-time Secure WebSockets wss://)`);
      console.log(`   Copy the link above to invite your squad.`);
      console.log(`========================================================================\n`);
    }
  };

  proc.stdout.on('data', inspectChunk);
  proc.stderr.on('data', inspectChunk);

  proc.on('close', (code) => {
    if (!foundUrl && provider === 'localhost.run') {
      console.log('⚠️ Primary tunnel busy, switching to backup tunnel provider (Pinggy)...');
      startSshTunnel('pinggy');
    }
  });

  proc.on('error', (err) => {
    console.log(`⚠️ Could not auto-launch SSH tunnel (${err.message}).`);
    console.log(`   You can still play locally at http://localhost:${PORT} or deploy to Render/Railway!`);
  });
}

server.start().then(() => {
  console.log(`\n========================================================================`);
  console.log(`🚀 [CRACKUP: Protocol Eclipse] 8-Player Authoritative Server Listening!`);
  console.log(`   Host Local URL : http://localhost:${PORT}`);
  console.log(`========================================================================`);
  startSshTunnel('localhost.run');
}).catch((error) => { console.error('Unable to start the game server:', error); process.exitCode = 1; });

async function shutdown() {
  tunnel?.kill();
  await server.stop();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

