#!/usr/bin/env node
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { NodeIO } from '@gltf-transform/core';
import { sortPrimitiveWeights } from '@gltf-transform/functions';

const root = fileURLToPath(new URL('../', import.meta.url));
const assets = path.join(root, 'public/assets');
const cache = path.join(root, '.cache/prod-assets');
const headers = { 'User-Agent': 'CrackupAssetPipeline/1.0' };
const manifest = { version: 1, generatedAt: new Date().toISOString(), environment: null, materials: {}, characters: {}, files: [], substitutions: [] };

async function retry(label, operation) {
  for (let attempt = 1; ; attempt++) {
    try { return await operation(); }
    catch (error) {
      if (attempt >= 3 || error.status === 404) throw error;
      console.warn(`${label}: ${error.message}; retry ${attempt}/2`);
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
}

async function response(url) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(180_000) });
  if (!res.ok) {
    const error = new Error(`${res.status} ${url}: ${(await res.text()).slice(0, 160)}`);
    error.status = res.status;
    throw error;
  }
  return res;
}

async function json(url) {
  return retry(url, async () => (await response(url)).json());
}

async function hashes(filename) {
  const sha256 = createHash('sha256');
  const md5 = createHash('md5');
  for await (const chunk of createReadStream(filename)) { sha256.update(chunk); md5.update(chunk); }
  return { sha256: sha256.digest('hex'), md5: md5.digest('hex') };
}

function checkSize(bytes, source, minimum) {
  if (bytes <= minimum) throw new Error(`Asset too small: ${bytes} bytes`);
  if (source.size && bytes !== source.size) throw new Error(`Size mismatch: expected ${source.size}, received ${bytes}`);
}

async function download(source, filename, minimum = 100) {
  await mkdir(path.dirname(filename), { recursive: true });
  if (source.md5) {
    try {
      const info = await stat(filename);
      const digest = await hashes(filename);
      checkSize(info.size, source, minimum);
      if (digest.md5 === source.md5) return { bytes: info.size, ...digest };
    } catch { /* Missing or damaged cached download: fetch again. */ }
  }
  return retry(source.url, async () => {
    const temporary = `${filename}.part`;
    try {
      const res = await response(source.url);
      if (!res.body) throw new Error('Empty response body');
      let bytes = 0;
      const counter = new Transform({ transform(chunk, _encoding, next) { bytes += chunk.length; next(null, chunk); } });
      await pipeline(Readable.fromWeb(res.body), counter, createWriteStream(temporary));
      checkSize(bytes, source, minimum);
      const digest = await hashes(temporary);
      if (source.md5 && digest.md5 !== source.md5) throw new Error(`MD5 mismatch for ${source.url}`);
      await rename(temporary, filename);
      console.log(`Downloaded ${path.relative(root, filename)} (${(bytes / 1048576).toFixed(2)} MiB)`);
      return { bytes, ...digest };
    } finally { await rm(temporary, { force: true }); }
  });
}

async function asset(source, relative, metadata, minimum) {
  const digest = await download(source, path.join(assets, relative), minimum);
  const url = `/assets/${relative}`;
  manifest.files.push({ path: url, sourceUrl: source.url, sourceMd5: source.md5, ...metadata, ...digest });
  return url;
}

async function environment() {
  for (const id of ['san_francisco_4', 'belfast_sunset_puresky', 'venice_sunset']) {
    let files;
    try { files = await json(`https://api.polyhaven.com/files/${id}`); }
    catch (error) { if (error.status === 404) { console.warn(error.message); continue; } throw error; }
    const source = files.hdri?.['2k']?.hdr;
    if (!source?.url) throw new Error(`${id} has no 2K HDR download`);
    const url = await asset(source, 'env/bay_dusk.hdr', { provider: 'Poly Haven', assetId: id, license: 'CC0-1.0', kind: 'hdr', resolution: '2k' }, 1048576);
    manifest.environment = { assetId: id, url, sourcePage: `https://polyhaven.com/a/${id}` };
    if (id !== 'san_francisco_4') manifest.substitutions.push({ requested: 'san_francisco_4', actual: id, reason: 'Requested API asset unavailable; user-approved HDR alternative.' });
    return;
  }
  throw new Error('None of the requested HDR environments is available');
}

async function polyMaterial(name, candidates) {
  for (const id of candidates) {
    let files;
    try { files = await json(`https://api.polyhaven.com/files/${id}`); }
    catch (error) { if (error.status === 404) { console.warn(error.message); continue; } throw error; }
    const maps = {};
    for (const [channel, key] of [['diffuse', 'Diffuse'], ['roughness', 'Rough'], ['normal', 'nor_gl'], ['metalness', 'Metal']]) {
      const options = files[key]?.['2k'];
      if (!options && channel === 'metalness') continue;
      // Lossless OpenGL normals; browser-native JPEG for color and scalar maps.
      const format = channel === 'normal' && options?.png ? 'png' : options?.jpg ? 'jpg' : 'png';
      const source = options?.[format];
      if (!source?.url) throw new Error(`${id} lacks a browser-loadable 2K ${key} map`);
      maps[channel] = await asset(source, `textures/${name}/${channel}.${format}`, { provider: 'Poly Haven', assetId: id, license: 'CC0-1.0', kind: 'texture', channel, resolution: '2k' });
    }
    manifest.materials[name] = { assetId: id, provider: 'Poly Haven', sourcePage: `https://polyhaven.com/a/${id}`, maps };
    return true;
  }
  return false;
}

async function carbon() {
  if (await polyMaterial('carbon_fiber', ['carbon_fiber'])) return;
  const api = await json('https://ambientcg.com/api/v2/full_json?id=Fabric004&include=downloadData');
  const entry = api.foundAssets?.find((item) => item.assetId === 'Fabric004');
  const downloads = Object.values(entry?.downloadFolders ?? {}).flatMap((folder) => Object.values(folder.downloadFiletypeCategories ?? {}).flatMap((category) => category.downloads ?? []));
  const archive = downloads.find((item) => item.attribute === '2K-PNG');
  if (!archive) throw new Error('ambientCG Fabric004 has no 2K PNG archive');
  const archivePath = path.join(cache, archive.fileName);
  const archiveSource = { url: archive.downloadLink, size: archive.size };
  const archiveDigest = await download(archiveSource, archivePath);
  const contents = unzipSync(new Uint8Array(await readFile(archivePath)), { filter: (item) => /_(Color|Roughness|NormalGL)\.png$/i.test(item.name) });
  const maps = {};
  for (const [channel, suffix] of [['diffuse', 'Color'], ['roughness', 'Roughness'], ['normal', 'NormalGL']]) {
    const match = Object.entries(contents).find(([name]) => name.endsWith(`_${suffix}.png`));
    if (!match || match[1].length < 100) throw new Error(`Carbon archive missing ${suffix}`);
    const relative = `textures/carbon_fiber/${channel}.png`;
    const filename = path.join(assets, relative);
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, match[1]);
    const url = `/assets/${relative}`;
    maps[channel] = url;
    manifest.files.push({ path: url, sourceUrl: archiveSource.url, sourceArchiveEntry: match[0], sourceArchiveSha256: archiveDigest.sha256, provider: 'ambientCG', assetId: 'Fabric004', license: 'CC0-1.0', kind: 'texture', channel, resolution: '2k', bytes: match[1].length, ...await hashes(filename) });
  }
  manifest.materials.carbon_fiber = { assetId: 'Fabric004', provider: 'ambientCG', sourcePage: 'https://ambientcg.com/view?id=Fabric004', maps };
  manifest.substitutions.push({ requested: 'Poly Haven carbon_fiber', actual: 'ambientCG Fabric004', reason: 'Poly Haven returns 404; real CC0 carbon-fiber PBR material obtained from ambientCG public API.' });
}

function inspectGlb(buffer, name) {
  if (buffer.toString('ascii', 0, 4) !== 'glTF' || buffer.readUInt32LE(4) !== 2 || buffer.readUInt32LE(8) !== buffer.length) throw new Error(`Invalid GLB: ${name}`);
  const doc = JSON.parse(buffer.toString('utf8', 20, 20 + buffer.readUInt32LE(12)));
  if (!doc.skins?.length || !doc.nodes?.some((node) => node.skin !== undefined && node.mesh !== undefined)) throw new Error(`${name}: no rigged mesh`);
  const clips = (doc.animations ?? []).map((clip) => clip.name);
  for (const required of ['idle', 'walk', 'run']) if (!clips.some((clip) => clip?.toLowerCase() === required)) throw new Error(`${name}: missing ${required}`);
  if (doc.images?.some((image) => image.uri && !image.uri.startsWith('data:'))) throw new Error(`${name}: external texture dependency`);
  return { clips, skins: doc.skins.length, bones: doc.skins.reduce((sum, skin) => sum + skin.joints.length, 0) };
}

async function characters() {
  for (const name of ['Soldier', 'Xbot']) {
    const source = { url: `https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/${name}.glb` };
    const relative = `models/characters/${name}.glb`;
    const original = path.join(cache, `${name}.glb`);
    const originalDigest = await download(source, original, 100_000);
    const filename = path.join(assets, relative);
    // The upstream Soldier contains illegal accessor byte strides and slightly
    // unnormalized skin weights. Repack without lossy geometry/animation compression.
    const io = new NodeIO();
    const document = await io.read(original);
    for (const mesh of document.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
      if (primitive.getAttribute('WEIGHTS_0')) sortPrimitiveWeights(primitive);
    }
    await io.write(`${filename}.part.glb`, document);
    await rename(`${filename}.part.glb`, filename);
    const url = `/assets/${relative}`;
    manifest.files.push({ path: url, sourceUrl: source.url, sourceSha256: originalDigest.sha256, provider: 'three.js examples', assetId: name, kind: 'glb', processing: 'Lossless glTF Transform repack; normalize skin weights', bytes: (await stat(filename)).size, ...await hashes(filename) });
    const inspection = inspectGlb(await readFile(filename), name);
    manifest.characters[name] = { url, ...inspection };
    console.log(`${name}: ${inspection.bones} joints; ${inspection.clips.join(', ')}`);
  }
  await asset({ url: 'https://raw.githubusercontent.com/mrdoob/three.js/dev/LICENSE' }, 'licenses/threejs-LICENSE.txt', { kind: 'license', provider: 'three.js' });
}

async function main() {
  await Promise.all(['env', 'textures', 'models/characters'].map((dir) => mkdir(path.join(assets, dir), { recursive: true })));
  // Keep API and large download concurrency low; preserve successfully verified files on retry.
  await environment();
  for (const [name, candidates] of [['concrete_layers_02', ['concrete_layers_02']], ['asphalt_02', ['asphalt_02']], ['corrugated_iron_02', ['corrugated_iron_02', 'metal_plate']]]) {
    if (!await polyMaterial(name, candidates)) throw new Error(`No requested production material available for ${name}`);
  }
  await carbon();
  await characters();
  // Reprovisioning the public baselines must keep a verified custom Mixamo pack.
  try {
    const previous = JSON.parse(await readFile(path.join(assets, 'manifest.json'), 'utf8'));
    const custom = previous.files?.find((file) => file.assetId === 'agent_cyber');
    if (custom && previous.characters?.agent_cyber) {
      const filename = path.join(assets, 'models/characters/agent_cyber.glb');
      if ((await hashes(filename)).sha256 !== custom.sha256) throw new Error('Existing custom Mixamo pack fails its SHA-256 check');
      manifest.characters.agent_cyber = previous.characters.agent_cyber;
      manifest.files.push(custom);
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const output = path.join(assets, 'manifest.json');
  await writeFile(`${output}.part`, `${JSON.stringify(manifest, null, 2)}\n`);
  await rename(`${output}.part`, output);
  console.log(`Provisioned ${manifest.files.length} real files. Manifest: ${path.relative(root, output)}`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
