/**
 * CRACKUP: Protocol Eclipse (v2.0 True 3D AAA Architecture)
 * Authoritative Server Entrypoint
 */

import { CrackupAuthoritativeServer } from './gameServer.js';

const port = Number(process.env.PORT || 3000);
const server = new CrackupAuthoritativeServer({ port });

server
  .start()
  .then((boundPort) => {
    console.log(
      `[CRACKUP v2.0 3D ENGINE] Authoritative Rapier3D Server (60Hz Physics / 30Hz Binary Netcode / SQLite WAL) online at http://localhost:${boundPort}`
    );
  })
  .catch((err) => {
    console.error('[CRACKUP v2.0] Fatal startup error:', err);
    process.exit(1);
  });

const shutdown = async () => {
  console.log('\n[CRACKUP v2.0] Flushing SQLite WAL state and shutting down...');
  await server.stop();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

