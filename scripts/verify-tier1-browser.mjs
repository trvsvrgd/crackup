import { build } from 'esbuild';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const bundle = await build({ entryPoints: ['tests/verify-tier1-browser.ts'], bundle: true, format: 'esm', platform: 'browser', write: false });
const publicDir = path.resolve('public');
http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/result' && request.method === 'POST') {
      const chunks = []; let length = 0;
      for await (const chunk of request) { length += chunk.length; if (length > 100000) throw new Error('Report too large'); chunks.push(chunk); }
      const result = JSON.parse(Buffer.concat(chunks).toString()); await fs.mkdir('output/playwright', { recursive: true });
      await fs.writeFile('output/playwright/tier1-browser.json', JSON.stringify(result, null, 2));
      response.writeHead(204); response.end(); return;
    }
    if (url.pathname === '/verify.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(bundle.outputFiles[0].text); return; }
    if (url.pathname.startsWith('/assets/')) {
      const file = path.resolve(publicDir, '.' + decodeURIComponent(url.pathname));
      if (!file.startsWith(publicDir + path.sep)) throw new Error('Invalid path');
      response.setHeader('Content-Type', 'audio/wav'); response.end(await fs.readFile(file)); return;
    }
    if (url.pathname === '/favicon.ico') { response.writeHead(204); response.end(); return; }
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end('<!doctype html><html><head><title>CRACKUP Tier 1 verification</title><style>body{margin:0;color:#def;background:#101c2b;font:15px system-ui}nav{position:fixed;left:28px;top:16px}h1{font-size:25px}button{background:#213a4c;color:#fff;border:1px solid #6b8999;padding:10px;margin:0 8px 4px 0;border-radius:4px}pre{position:fixed;right:12px;bottom:12px;max-height:22vh;overflow:auto;background:#101c2be8;font-size:10px;padding:12px}</style></head><body><script type="module" src="/verify.js"></script></body></html>');
  } catch (error) { response.writeHead(500); response.end(String(error)); }
}).listen(3217, '127.0.0.1', () => console.log('Tier 1 browser verification: http://127.0.0.1:3217'));
