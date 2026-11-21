// Read-only source inventory; writes only the explicitly named evidence manifest.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const output = path.resolve(root, process.argv[2] ?? 'artifacts/evidence/living-city/lc00-p001-baseline.json');
const evidenceRoot = path.resolve(root, 'artifacts/evidence/living-city');
if (!output.startsWith(evidenceRoot + path.sep)) throw new Error('Output must remain under artifacts/evidence/living-city');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
const names = [...new Set(git('ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean))]
  .filter(name => /^(client|server|shared|scripts|tests)\//.test(name) || /^(package(?:-lock)?\.json|tsconfig\.json|Start CRACKUP\.bat|public\/(game\.js|index\.html|style\.css|assets\/manifest\.json))$/.test(name)).sort();
const files = names.filter(name => fs.existsSync(name) && fs.statSync(name).isFile()).map(name => {
  const bytes = fs.readFileSync(name);
  return { path: name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
});
const fingerprint = createHash('sha256').update(JSON.stringify(files)).digest('hex');
const bundle = fs.existsSync('public/game.js') ? fs.readFileSync('public/game.js', 'utf8') : '';
const manifest = {
  schemaVersion: 1, capturedAt: new Date().toISOString(),
  scope: 'Source/runtime/configuration identity only. No personal saves, credentials, environment dump, or gameplay acceptance.',
  baseCommit: git('rev-parse', 'HEAD').trim(), branch: git('branch', '--show-current').trim(),
  workingTreeStatus: git('status', '--porcelain=v1').trim().split(/\r?\n/),
  fingerprint, clientBuild: bundle.match(/client-[a-f0-9]{16}/)?.[0] ?? null,
  host: { platform: process.platform, release: os.release(), arch: process.arch, node: process.version,
    cpu: os.cpus()[0]?.model ?? 'unknown', logicalCpus: os.cpus().length, totalRamGiB: Math.round(os.totalmem() / 2 ** 30) },
  files,
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ output: path.relative(root, output), files: files.length, fingerprint, clientBuild: manifest.clientBuild, host: manifest.host }));
