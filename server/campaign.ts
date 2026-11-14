import fs from 'node:fs';
import path from 'node:path';
import { CrackupAuthoritativeServer } from './gameServer.js';

// Separate server-local profile database. No implicit import from an offline or public account.
const directory = path.resolve(process.env.CAMPAIGN_DATA_DIR ?? 'data/campaign-coop');
fs.mkdirSync(directory, { recursive: true });
const server = new CrackupAuthoritativeServer({ mode: 'campaign', port: Number(process.env.CAMPAIGN_PORT ?? 3222),
  bindAddress: process.env.CAMPAIGN_BIND ?? '127.0.0.1', dbPath: path.join(directory, 'campaigns.db') });
const port = await server.start();
console.log(`Campaign co-op: http://127.0.0.1:${port}. Choose Host or Join in the profile screen. Saves: ${directory}`);
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => {
  if (closing) return;
  closing = true;
  void server.stop().then(() => { server.physicsWorld.world.free(); process.exit(0); })
    .catch(error => { closing = false; console.error('Save failed; shutdown cancelled:', error); });
});
