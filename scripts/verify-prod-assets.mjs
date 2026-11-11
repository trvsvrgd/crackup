#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import http from 'node:http';
import sharp from 'sharp';
import validator from 'gltf-validator';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const publicDir = path.join(root, 'public');
const manifest = JSON.parse(await readFile(path.join(publicDir, 'assets/manifest.json'), 'utf8'));
const result = { checkedAt: new Date().toISOString(), files: [], browser: 'Run --serve, then open the printed URL for real WebGL/Three.js checks.' };
for (const file of manifest.files) {
  const filename = path.resolve(publicDir, `.${file.path}`);
  assert.ok(filename.startsWith(publicDir + path.sep), 'Asset path must remain within public/');
  const buffer = await readFile(filename);
  assert.equal(buffer.length, file.bytes, `${file.path}: size mismatch`);
  assert.equal(createHash('sha256').update(buffer).digest('hex'), file.sha256, `${file.path}: SHA-256 mismatch`);
  const entry = { path: file.path, bytes: buffer.length, sha256: file.sha256 };
  if (file.kind === 'texture') {
    const metadata = await sharp(buffer).metadata();
    assert.equal(metadata.width, 2048, `${file.path}: not 2K`);
    assert.equal(metadata.height, 2048, `${file.path}: not square 2K`);
    await sharp(buffer).raw().toBuffer(); // Full decode, not just a valid-looking header.
    Object.assign(entry, { width: metadata.width, height: metadata.height });
  } else if (file.kind === 'hdr') {
    assert.ok(buffer.length > 1048576, 'HDR must be larger than 1 MiB');
    const hdr = new RGBELoader().parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
    assert.equal(hdr.width, 2048);
    assert.equal(hdr.height, 1024);
    Object.assign(entry, { width: hdr.width, height: hdr.height });
  } else if (file.kind === 'glb') {
    const report = await validator.validateBytes(new Uint8Array(buffer), { maxIssues: 0 });
    assert.equal(report.issues.numErrors, 0, `${file.path}: glTF validation errors: ${JSON.stringify(report.issues.messages.filter((message) => message.severity === 0).slice(0, 4))}`);
    Object.assign(entry, { validationErrors: report.issues.numErrors, validationWarnings: report.issues.numWarnings });
    const gltf = JSON.parse(buffer.toString('utf8', 20, 20 + buffer.readUInt32LE(12)));
    assert.ok(gltf.skins?.length && gltf.nodes.some((node) => node.skin !== undefined && node.mesh !== undefined));
    const clips = gltf.animations.map((animation) => animation.name);
    for (const required of file.assetId === 'agent_cyber' ? ['Idle', 'Fast Run', 'Jump', 'Punching Combo', 'Roundhouse Kick', 'Hit To Body', 'Dying'] : ['idle', 'walk', 'run']) {
      assert.ok(clips.some((clip) => clip.toLowerCase() === required.toLowerCase()), `${file.path}: missing ${required}`);
    }
    Object.assign(entry, { clips, skins: gltf.skins.length });
  }
  result.files.push(entry);
  console.log(`PASS ${file.path}${entry.validationWarnings ? ` (${entry.validationWarnings} upstream non-fatal glTF warnings)` : ''}`);
}
await mkdir(path.join(root, '.cache/prod-assets'), { recursive: true });
await writeFile(path.join(root, '.cache/prod-assets/verification.json'), JSON.stringify(result, null, 2));
console.log(`Verified ${result.files.length} assets: hashes, full image decode, RGBELoader and glTF validation.`);

if (process.argv.includes('--serve')) {
  const bundle = await build({ entryPoints: [path.join(root, 'scripts/verify-prod-assets-browser.ts')], bundle: true, format: 'esm', target: 'es2022', write: false });
  const html = '<!doctype html><title>CRACKUP production asset verification</title><style>body{background:#101725;color:#fff;font:14px monospace}pre{max-width:42vw;white-space:pre-wrap}canvas{position:fixed;right:12px;top:80px;width:50vw!important;height:auto!important}</style><h1>Production asset verification</h1><pre id="result">Loading real assets…</pre><script type="module" src="/verify.js"></script>';
  const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.glb': 'model/gltf-binary', '.hdr': 'application/octet-stream' };
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      if (pathname === '/verification-result' && req.method === 'POST') {
        let body = '';
        for await (const chunk of req) { body += chunk; if (body.length > 1000000) throw new Error('Result too large'); }
        const result = JSON.parse(body);
        await writeFile(path.join(root, '.cache/prod-assets/browser-verification.json'), `${JSON.stringify(result, null, 2)}\n`);
        res.writeHead(204); res.end(); return;
      }
      if (pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
      if (pathname === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); return; }
      if (pathname === '/verify.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(bundle.outputFiles[0].contents); return; }
      const filename = path.resolve(publicDir, `.${decodeURIComponent(pathname)}`);
      if (!filename.startsWith(publicDir + path.sep)) { res.writeHead(403); res.end(); return; }
      const data = await readFile(filename);
      res.setHeader('Content-Type', types[path.extname(filename)] ?? 'application/octet-stream');
      res.end(data);
    } catch { res.writeHead(404); res.end(); }
  });
  server.listen(0, '127.0.0.1', async () => {
    const url = `http://127.0.0.1:${server.address().port}`;
    await writeFile(path.join(root, '.cache/prod-assets/verification-url.txt'), url);
    console.log(`Browser verification server: ${url}`);
  });
}
