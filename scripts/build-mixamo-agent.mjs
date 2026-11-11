#!/usr/bin/env node
import { readFile, writeFile, mkdir, stat, rename } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { prune, unpartition, sortPrimitiveWeights } from '@gltf-transform/functions';
import validator from 'gltf-validator';

const run = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const work = path.join(root, '.cache/prod-assets/mixamo');
const output = path.join(root, 'public/assets/models/characters/agent_cyber.glb');
const cli = path.join(root, 'node_modules/@gltf-transform/cli/bin/cli.js');
const platform = { win32: ['Windows_NT', 'FBX2glTF.exe'], darwin: ['Darwin', 'FBX2glTF'], linux: ['Linux', 'FBX2glTF'] }[process.platform];
const clips = [
  ['Idle', 'Idle.fbx'], // Download on the chosen base character WITH skin.
  ['Fast Run', 'Fast Run.fbx'],
  ['Jump', 'Jump.fbx'],
  ['Punching Combo', 'Punching Combo.fbx'],
  ['Roundhouse Kick', 'Roundhouse Kick.fbx'],
  ['Hit To Body', 'Hit To Body.fbx'],
  ['Dying', 'Dying.fbx'],
];
const canonical = (name) => name.replace(/^mixamorig\d*[:_]?/i, '').replace(/[^a-z0-9]/gi, '').toLowerCase();

async function main() {
  await mkdir(work, { recursive: true });
  const missing = [];
  for (const [, filename] of clips) {
    try { if ((await stat(path.join(work, filename))).size < 1000) missing.push(filename); }
    catch { missing.push(filename); }
  }
  if (missing.length) throw new Error(`Mixamo inputs missing in ${work}: ${missing.join(', ')}. Download Idle WITH skin, all others WITHOUT skin, same character, FBX Binary, 30 fps. No agent_cyber.glb was generated.`);
  if (!platform) throw new Error(`Unsupported FBX2glTF platform: ${process.platform}`);
  const converter = path.join(root, 'node_modules/fbx2gltf/bin', ...platform);
  const convertedDir = path.join(work, 'converted');
  await mkdir(convertedDir, { recursive: true });
  const io = new NodeIO();
  const converted = [];
  const sources = [];
  for (const [index, [clipName, filename]] of clips.entries()) {
    const input = path.join(work, filename);
    const target = path.join(convertedDir, `${index}.glb`);
    const bytes = await readFile(input);
    if (!bytes.subarray(0, 23).toString().startsWith('Kaydara FBX Binary')) throw new Error(`${filename}: expected genuine FBX Binary download`);
    // Direct execFile arguments avoid shell interpretation of filenames.
    await run(converter, ['--input', input, '--output', target.slice(0, -4), '--binary', '--anim-framerate', 'bake30', '--no-khr-lights-punctual'], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
    const document = await io.read(target);
    const documentRoot = document.getRoot();
    if (documentRoot.listAnimations().length !== 1) throw new Error(`${filename}: expected one animation take`);
    if (index === 0 && !documentRoot.listSkins().length) throw new Error('Idle.fbx must contain the base character WITH skin');
    if (index > 0 && documentRoot.listMeshes().length) throw new Error(`${filename}: expected animation WITHOUT skin`);
    documentRoot.listAnimations()[0].setName(clipName);
    for (const node of documentRoot.listNodes()) node.setExtras({ ...node.getExtras(), crackupMixamoBase: index === 0 });
    for (const mesh of documentRoot.listMeshes()) for (const primitive of mesh.listPrimitives()) {
      if (primitive.getAttribute('WEIGHTS_0')) sortPrimitiveWeights(primitive);
    }
    await io.write(target, document);
    converted.push(target);
    sources.push({ file: filename, clip: clipName, sha256: createHash('sha256').update(bytes).digest('hex'), skin: index === 0 ? 'With Skin' : 'Without Skin', fps: 30 });
  }
  const merged = path.join(convertedDir, 'merged.glb');
  // CLI merge alone creates duplicate rigs; explicitly rebind channels below.
  await run(process.execPath, [cli, 'merge', ...converted, merged, '--merge-scenes'], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  const document = await io.read(merged);
  const nodes = document.getRoot().listNodes();
  const baseNodes = nodes.filter((node) => node.getExtras().crackupMixamoBase === true);
  const byName = new Map();
  for (const node of baseNodes) {
    const key = canonical(node.getName());
    if (!key) continue;
    if (byName.has(key)) throw new Error(`Ambiguous base rig node: ${node.getName()}`);
    byName.set(key, node);
  }
  for (const animation of document.getRoot().listAnimations()) {
    if (!animation.listChannels().length) throw new Error(`${animation.getName()}: empty animation`);
    const animatedPaths = new Map();
    for (const channel of animation.listChannels()) {
      const node = channel.getTargetNode();
      if (!animatedPaths.has(node)) animatedPaths.set(node, new Set());
      animatedPaths.get(node).add(channel.getTargetPath());
    }
    for (const channel of animation.listChannels()) {
      const old = channel.getTargetNode();
      if (!old) throw new Error('Animation channel has no target');
      if (old.getExtras().crackupMixamoBase === true) continue;
      const target = byName.get(canonical(old.getName()));
      if (!target) throw new Error(`${animation.getName()}: no base joint matching ${old.getName()}`);
      // FBX may store each take's first animated pose as node defaults. Compare
      // only components that this clip does not overwrite; require matching hierarchy.
      const paths = animatedPaths.get(old);
      const scaleMatches = paths.has('scale') || old.getScale().every((value, index) => Math.abs(value - target.getScale()[index]) < 0.001);
      const qa = old.getRotation(), qb = target.getRotation();
      const rotationMatches = paths.has('rotation') || Math.abs(qa.reduce((dot, value, index) => dot + value * qb[index], 0)) > 0.999;
      const translationMatches = paths.has('translation') || old.getTranslation().every((value, index) => Math.abs(value - target.getTranslation()[index]) < 0.02);
      const oldParent = old.getParentNode(), targetParent = target.getParentNode();
      const hierarchyMatches = !oldParent && !targetParent || oldParent && targetParent && canonical(oldParent.getName()) === canonical(targetParent.getName());
      if (!scaleMatches || !rotationMatches || !translationMatches || !hierarchyMatches) throw new Error(`${animation.getName()}: incompatible rig on ${old.getName()}; download all clips on the same character`);
      channel.setTargetNode(target);
    }
  }
  for (const node of nodes) if (node.getExtras().crackupMixamoBase !== true) node.dispose();
  for (const node of baseNodes) {
    const { crackupMixamoBase: _internal, ...extras } = node.getExtras();
    node.setExtras(extras);
  }
  await document.transform(prune(), unpartition());
  const rebound = path.join(convertedDir, 'rebound.glb');
  const final = path.join(convertedDir, 'agent_cyber.glb');
  await io.write(rebound, document);
  await run(process.execPath, [cli, 'resample', rebound, final], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  const buffer = await readFile(final);
  const report = await validator.validateBytes(new Uint8Array(buffer), { maxIssues: 0 });
  if (report.issues.numErrors) throw new Error(`Merged GLB has ${report.issues.numErrors} validation errors: ${JSON.stringify(report.issues.messages.filter((message) => message.severity === 0).slice(0, 4))}`);
  const finished = await io.read(final);
  const names = finished.getRoot().listAnimations().map((animation) => animation.getName());
  for (const [name] of clips) if (!names.includes(name)) throw new Error(`Final GLB missing ${name}`);
  if (!finished.getRoot().listSkins().length) throw new Error('Final GLB has no skinned character');
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(`${output}.part`, buffer);
  await rename(`${output}.part`, output);
  const manifestPath = path.join(root, 'public/assets/manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.characters.agent_cyber = { url: '/assets/models/characters/agent_cyber.glb', clips: names, skins: finished.getRoot().listSkins().length };
  manifest.files = manifest.files.filter((file) => file.assetId !== 'agent_cyber');
  manifest.files.push({ path: '/assets/models/characters/agent_cyber.glb', kind: 'glb', provider: 'Adobe Mixamo', assetId: 'agent_cyber', sourceUrl: 'https://www.mixamo.com', license: 'Adobe Mixamo terms', sources, bytes: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex') });
  await writeFile(`${manifestPath}.part`, `${JSON.stringify(manifest, null, 2)}\n`);
  await rename(`${manifestPath}.part`, manifestPath);
  console.log(`Built ${output}: ${names.join(', ')}. Run npm run assets:verify and the browser verification before shipping.`);
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
