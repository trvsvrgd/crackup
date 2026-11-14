import { build } from 'esbuild';
import http from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
const built = await build({ entryPoints: ['tests/verify-art-browser.ts'], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', write: false });
const server = http.createServer(async (req, res) => {
  if (req.url === '/verification-result') {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const result = Buffer.concat(chunks).toString();
    await mkdir('output/playwright', { recursive: true }); await writeFile('output/playwright/art-verification.json', result);
    console.log(result); res.writeHead(200); res.end('ok'); return;
  }
  if (req.url === '/verify.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(built.outputFiles[0].text); return; }
  res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><html><head><title>CRACKUP Art Verification</title></head><body style="margin:0;background:#101e2c;color:white"><script type="module" src="/verify.js"></script></body></html>');
});
server.listen(3198, '127.0.0.1', () => console.log('Art verifier: http://127.0.0.1:3198'));
