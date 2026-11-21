import { build } from 'esbuild';
import http from 'node:http';
import fs from 'node:fs/promises';
const bundle = await build({ entryPoints: ['tests/verify-tier2-browser.ts'], bundle: true, format: 'esm', platform: 'browser', write: false });
http.createServer(async (request, response) => {
  try {
    if (request.url === '/result' && request.method === 'POST') {
      const chunks = []; let size = 0;
      for await (const chunk of request) { size += chunk.length; if (size > 100000) throw new Error('Report too large'); chunks.push(chunk); }
      const result = JSON.parse(Buffer.concat(chunks).toString()); await fs.mkdir('output/playwright', { recursive: true });
      await fs.writeFile('output/playwright/tier2-browser.json', JSON.stringify(result, null, 2)); response.writeHead(204); response.end(); return;
    }
    if (request.url === '/verify.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(bundle.outputFiles[0].text); return; }
    if (request.url === '/favicon.ico') { response.writeHead(204); response.end(); return; }
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end('<!doctype html><html><head><title>Tier 2 physics preview</title><style>body{margin:0;color:#def;background:#102031;font:14px system-ui}nav{position:fixed;left:24px;top:16px}h1{font-size:24px}button{background:#203f52;color:white;border:1px solid #7798a6;padding:9px;margin-right:7px;border-radius:3px}pre{position:fixed;right:16px;bottom:16px;background:#102031dd;padding:12px;font-size:11px;max-width:430px}</style></head><body><script type="module" src="/verify.js"></script></body></html>');
  } catch (error) { response.writeHead(500); response.end(String(error)); }
}).listen(3218, '127.0.0.1', () => console.log('Tier 2 physics preview: http://127.0.0.1:3218'));
