#!/usr/bin/env node
import { readFile, writeFile, mkdir, readdir, rename } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { prune, unpartition, sortPrimitiveWeights, dedup } from '@gltf-transform/functions';
import validator from 'gltf-validator';

const run = promisify(execFile), root = fileURLToPath(new URL('../', import.meta.url));
const sourceDir = path.join(root, 'asset-inbox/packages/mixamo-capoeira/extracted');
const work = path.join(root, '.cache/prod-assets/capoeira'), convertedDir = path.join(work, 'converted');
const output = path.join(root, 'public/assets/models/characters/capoeira_ybot.glb');
const cli = path.join(root, 'node_modules/@gltf-transform/cli/bin/cli.js');
const platform = { win32: ['Windows_NT', 'FBX2glTF.exe'], darwin: ['Darwin', 'FBX2glTF'], linux: ['Linux', 'FBX2glTF'] }[process.platform];
const canonical = name => name.replace(/^mixamorig\d*[:_]?/i, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

async function main() {
  if (!platform) throw new Error(`Unsupported converter platform: ${process.platform}`);
  const files = (await readdir(sourceDir)).filter(n => /\.fbx$/i.test(n)).sort();
  const baseName = 'Y Bot.fbx';
  if (!files.includes(baseName)) throw new Error(`Missing genuine ${baseName} in ${sourceDir}; import the downloaded Capoeira ZIP first.`);
  const motions = files.filter(n => n !== baseName);
  if (!motions.length) throw new Error('No FBX motions supplied');
  await mkdir(convertedDir, { recursive: true });
  const io = new NodeIO(), paths = [], sources = [], conversionWarnings = [];
  for (const [i, file] of [baseName, ...motions].entries()) {
    const input = path.join(sourceDir, file), bytes = await readFile(input), target = path.join(convertedDir, `${i}.glb`);
    if (!bytes.subarray(0, 23).toString().startsWith('Kaydara FBX Binary')) throw new Error(`${file}: invalid FBX Binary header`);
    const converted = await run(path.join(root, 'node_modules/fbx2gltf/bin', ...platform), ['--input', input, '--output', target.slice(0, -4), '--binary', '--anim-framerate', 'bake30', '--no-khr-lights-punctual'], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
    if (/warning/i.test(converted.stdout + converted.stderr)) conversionWarnings.push({ file, log: (converted.stdout + converted.stderr).trim() });
    const doc = await io.read(target), r = doc.getRoot();
    if (i === 0) {
      if (!r.listSkins().length || !r.listMeshes().length) throw new Error('Base Y Bot has no skin/geometry');
      // Y Bot's short bind-pose take is NOT an Idle animation.
      r.listAnimations().forEach(a => a.dispose());
    } else {
      if (r.listAnimations().length !== 1 || r.listMeshes().length) throw new Error(`${file}: expected one animation without skin`);
      const a = r.listAnimations()[0];
      a.setName(path.basename(file, '.fbx'));
      if (!a.listChannels().length) throw new Error(`${file}: empty clip`);
      a.setExtras({ sourceFile: file, sourceSha256: sha256(bytes), bakedFps: 30 });
    }
    for (const n of r.listNodes()) n.setExtras({ ...n.getExtras(), crackupBase: i === 0 });
    for (const m of r.listMeshes()) for (const p of m.listPrimitives()) if (p.getAttribute('WEIGHTS_0')) sortPrimitiveWeights(p);
    await io.write(target, doc); paths.push(target);
    sources.push({ file, sha256: sha256(bytes), bytes: bytes.length, role: i ? 'motion' : 'skinned-base', bakedFps: 30 });
    console.log(`Converted ${i + 1}/${files.length}: ${file}`);
  }
  const merged = path.join(work, 'merged.glb');
  await run(process.execPath, [cli, 'merge', ...paths, merged, '--merge-scenes'], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  const doc = await io.read(merged), r = doc.getRoot(), all = r.listNodes(), base = all.filter(n => n.getExtras().crackupBase === true);
  const byName = new Map();
  for (const n of base) {
    const key = canonical(n.getName());
    if (byName.has(key)) throw new Error(`Ambiguous base joint ${key}`);
    byName.set(key, n);
  }
  for (const a of r.listAnimations()) {
    const pathsByNode = new Map();
    for (const c of a.listChannels()) { const n = c.getTargetNode(); if (!pathsByNode.has(n)) pathsByNode.set(n, new Set()); pathsByNode.get(n).add(c.getTargetPath()); }
    for (const c of a.listChannels()) {
      const old = c.getTargetNode(), target = old && byName.get(canonical(old.getName()));
      if (!target) throw new Error(`${a.getName()}: missing joint ${old?.getName()}`);
      const op = old.getParentNode(), tp = target.getParentNode(), paths = pathsByNode.get(old);
      if (canonical(op?.getName() ?? '') !== canonical(tp?.getName() ?? '')) throw new Error(`${a.getName()}: incompatible joint hierarchy`);
      for (const [p, getter, tolerance] of [['translation', 'getTranslation', 0.002], ['scale', 'getScale', 0.001]]) {
        if (!paths.has(p) && old[getter]().some((v, i) => Math.abs(v - target[getter]()[i]) > tolerance)) throw new Error(`${a.getName()}: incompatible ${p} at ${old.getName()}`);
      }
      if (!paths.has('rotation') && Math.abs(old.getRotation().reduce((sum, v, i) => sum + v * target.getRotation()[i], 0)) < 0.999) throw new Error(`${a.getName()}: incompatible joint rotation`);
      c.setTargetNode(target);
    }
  }
  for (const n of all) if (!n.getExtras().crackupBase) n.dispose();
  for (const n of base) n.setExtras({});
  await doc.transform(prune(), unpartition(), dedup());
  const rebound = path.join(work, 'rebound.glb'), final = path.join(work, 'capoeira_ybot.glb');
  await io.write(rebound, doc);
  await run(process.execPath, [cli, 'resample', rebound, final], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  const bytes = await readFile(final), validation = await validator.validateBytes(new Uint8Array(bytes), { maxIssues: 0 });
  if (validation.issues.numErrors) throw new Error(`Invalid GLB: ${JSON.stringify(validation.issues)}`);
  const finished = await io.read(final), clips = finished.getRoot().listAnimations().map(a => ({ name: a.getName(), channels: a.listChannels().length, duration: Math.max(...a.listSamplers().map(s => s.getInput().getMax([])[0])) }));
  if (clips.length !== motions.length || clips.some(c => !c.channels || !(c.duration > 0))) throw new Error('Clip loss/empty clip after merge');
  const report = { checkedAt: new Date().toISOString(), source: 'https://www.mixamo.com/', base: baseName, sources, clips, validation: validation.issues, conversionWarnings, bytes: bytes.length, sha256: sha256(bytes) };
  await mkdir(path.dirname(output), { recursive: true }); await writeFile(`${output}.part`, bytes); await rename(`${output}.part`, output);
  const manifestPath = path.join(root, 'public/assets/manifest.json'), manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.characters.capoeira_ybot = { url: '/assets/models/characters/capoeira_ybot.glb', optional: true, clips: clips.map(c => c.name), skins: finished.getRoot().listSkins().length, purpose: 'Capoeira motion source; retargeted onto game armor' };
  manifest.files = manifest.files.filter(f => f.assetId !== 'capoeira_ybot');
  manifest.files.push({ path: '/assets/models/characters/capoeira_ybot.glb', kind: 'glb', provider: 'Adobe Mixamo', assetId: 'capoeira_ybot', sourceUrl: 'https://www.mixamo.com/', license: 'Adobe Mixamo terms; incorporated game asset', sources, requiredClips: clips.map(c => c.name), bytes: bytes.length, sha256: sha256(bytes) });
  await writeFile(`${manifestPath}.part`, `${JSON.stringify(manifest, null, 2)}\n`); await rename(`${manifestPath}.part`, manifestPath);
  await writeFile(path.join(work, 'build-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Built ${output}: ${clips.length} genuine motion clips, ${validation.issues.numErrors} errors, ${validation.issues.numWarnings} warnings.`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
