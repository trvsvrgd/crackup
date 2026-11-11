import { build } from 'esbuild';
import http from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
const bundle = await build({ entryPoints: ['tests/verify-stage3c-browser.ts'], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', write: false });
const server = http.createServer(async (req, res) => {
  if (req.url === '/verification-result' && req.method === 'POST') {
    const chunks = []; let length = 0; for await (const chunk of req) { length += chunk.length; if (length > 1000000) { res.writeHead(413); res.end(); return; } chunks.push(chunk); }
    const result = JSON.parse(Buffer.concat(chunks).toString()); await mkdir('output/playwright', { recursive: true }); await writeFile('output/playwright/stage3c-browser.json', JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result)); res.writeHead(204); res.end(); return;
  }
  if (req.url === '/verify.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(bundle.outputFiles[0].text); return; }
  res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><html><head><title>CRACKUP Relay Verification</title></head><body style="margin:0;background:#152333"><script type="module" src="/verify.js"></script></body></html>');
}); server.listen(3196, '127.0.0.1', () => console.log('Relay verification: http://127.0.0.1:3196'));
