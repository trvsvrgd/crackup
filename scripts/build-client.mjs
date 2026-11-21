import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';

async function sources(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? sources(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]))).flat();
}
const hash = createHash('sha256');
const captureEnabled = process.env.CRACKUP_DIAGNOSTICS !== '0';
hash.update(`diagnostics:${captureEnabled}`);
const files = [...await sources('client'), ...await sources('shared'), 'public/index.html', 'public/style.css', 'package.json', 'package-lock.json', 'scripts/build-client.mjs'].sort();
for (const file of files) { hash.update(file); hash.update('\0'); hash.update(await readFile(file)); hash.update('\0'); }
const identity = `client-${hash.digest('hex').slice(0, 16)}`;
await build({ entryPoints: ['client/main.ts'], bundle: true, format: 'esm', target: 'es2022', outfile: 'public/game.js', sourcemap: true,
  define: { __CRACKUP_BUILD__: JSON.stringify(identity), __CRACKUP_DIAGNOSTICS__: JSON.stringify(captureEnabled) } });
console.log(`Client build: ${identity}`);
