#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { mkdir, readdir, readFile, writeFile, open, stat, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../', import.meta.url));
const inbox = path.join(root, 'asset-inbox');
const packages = path.join(inbox, 'packages');
const extensionKinds = {
  '.glb': 'model', '.gltf': 'model', '.fbx': 'model-source', '.blend': 'model-source', '.obj': 'model-source', '.mtl': 'material-source', '.bin': 'model-buffer',
  '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.webp': 'image', '.tga': 'image-source', '.tif': 'image-source', '.tiff': 'image-source', '.exr': 'image-source', '.hdr': 'environment', '.ktx2': 'compressed-texture', '.svg': 'vector',
  '.wav': 'audio', '.ogg': 'audio', '.mp3': 'audio', '.flac': 'audio-source', '.m4a': 'audio',
  '.zip': 'archive', '.7z': 'archive', '.rar': 'archive', '.unitypackage': 'engine-package', '.uasset': 'engine-package',
  '.txt': 'documentation', '.md': 'documentation', '.pdf': 'documentation', '.json': 'metadata', '.csv': 'metadata',
};

async function digest(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

async function glbInfo(filename, size) {
  const handle = await open(filename, 'r');
  try {
    const header = Buffer.alloc(20);
    const { bytesRead } = await handle.read(header, 0, 20, 0);
    if (bytesRead < 20 || header.toString('ascii', 0, 4) !== 'glTF' || header.readUInt32LE(4) !== 2 || header.readUInt32LE(8) !== size || header.readUInt32LE(16) !== 0x4e4f534a) throw new Error('Invalid GLB 2 header');
    const length = header.readUInt32LE(12);
    if (length > 16 * 1024 * 1024 || length + 20 > size) throw new Error('GLB JSON chunk is invalid or exceeds the 16 MiB intake limit');
    const json = Buffer.alloc(length);
    const read = await handle.read(json, 0, length, 20);
    if (read.bytesRead !== length) throw new Error('Truncated GLB JSON');
    return gltfInfo(JSON.parse(json.toString('utf8')));
  } finally { await handle.close(); }
}

function gltfInfo(gltf) {
  return {
    gltfVersion: gltf.asset?.version,
    meshes: gltf.meshes?.length ?? 0,
    primitives: (gltf.meshes ?? []).reduce((count, mesh) => count + (mesh.primitives?.length ?? 0), 0),
    materials: gltf.materials?.length ?? 0,
    skins: gltf.skins?.length ?? 0,
    animations: (gltf.animations ?? []).map((clip) => ({ name: clip.name ?? '', channels: clip.channels?.length ?? 0 })),
    nodeNames: (gltf.nodes ?? []).map((node) => node.name).filter(Boolean),
    externalResources: [...gltf.buffers ?? [], ...gltf.images ?? []].map((item) => item.uri).filter((uri) => uri && !uri.startsWith('data:')),
    extensionsRequired: gltf.extensionsRequired ?? [],
    inspection: 'Metadata only; geometry, animation bindings and shader compatibility still require validation.',
  };
}

export async function inspectFile(filename, relative = path.basename(filename)) {
  const info = await stat(filename);
  const ext = path.extname(filename).toLowerCase();
  const file = { path: relative.split(path.sep).join('/'), bytes: info.size, sha256: await digest(filename), kind: extensionKinds[ext] ?? 'other', warnings: [] };
  if (!info.size) file.warnings.push('Empty file; not a usable asset.');
  try {
    if (ext === '.glb') file.model = await glbInfo(filename, info.size);
    if (ext === '.gltf') {
      if (info.size > 16 * 1024 * 1024) throw new Error('glTF JSON exceeds the 16 MiB intake limit');
      file.model = gltfInfo(JSON.parse(await readFile(filename, 'utf8')));
    }
    if (['.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff'].includes(ext)) {
      const image = await sharp(filename).metadata();
      file.image = { width: image.width, height: image.height, channels: image.channels, format: image.format };
    }
  } catch (error) { file.warnings.push(`Inspection failed: ${error.message}`); }
  if (file.kind === 'archive') file.warnings.push('Archive is recorded, not extracted or content-validated.');
  if (file.kind === 'engine-package') file.warnings.push('Obtain source FBX/glTF/textures; this is not directly loadable in Three.js.');
  if (['.exe', '.msi', '.ps1', '.cmd', '.bat', '.sh', '.dll'].includes(ext)) file.warnings.push('Executable content recorded only; never executed by intake.');
  return file;
}

async function walk(directory, base, files, warnings) {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const filename = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) { warnings.push(`Skipped symbolic link: ${path.relative(base, filename)}`); continue; }
    if (entry.isDirectory()) await walk(filename, base, files, warnings);
    else if (entry.isFile()) files.push(await inspectFile(filename, path.relative(base, filename)));
  }
}

export async function indexInbox() {
  await mkdir(packages, { recursive: true });
  const report = { schemaVersion: 1, indexedAt: new Date().toISOString(), integrationApproved: false, packages: [], looseFiles: [] };
  for (const entry of (await readdir(packages, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) { report.looseFiles.push(entry.name); continue; }
    const base = path.join(packages, entry.name);
    const pack = { id: entry.name, metadata: null, status: 'needs-review', warnings: [], files: [] };
    try { pack.metadata = JSON.parse(await readFile(path.join(base, 'asset.json'), 'utf8')); }
    catch (error) { pack.warnings.push(error.code === 'ENOENT' ? 'Missing asset.json; copy metadata.template.json and fill it in.' : `Invalid asset.json: ${error.message}`); }
    const meta = pack.metadata;
    if (!meta?.creator || !meta?.sourceUrl || !meta?.license?.name) pack.warnings.push('Creator, source URL and license name are required for provenance review.');
    if (meta?.sourceUrl) {
      try { if (new URL(meta.sourceUrl).protocol !== 'https:') throw new Error(); }
      catch { pack.warnings.push('Source URL must be a valid HTTPS source page.'); }
    }
    if (meta?.license?.file) {
      try {
        const license = await realpath(path.resolve(base, meta.license.file));
        const actualBase = await realpath(base);
        if (!license.startsWith(actualBase + path.sep) || !(await stat(license)).isFile()) throw new Error();
      } catch { pack.warnings.push('License file must exist inside this package.'); }
    } else pack.warnings.push('Save the applicable license text/page in this package and record its filename.');
    await walk(base, base, pack.files, pack.warnings);
    const assets = pack.files.filter((file) => !['documentation', 'metadata'].includes(file.kind));
    if (!assets.length) pack.status = 'awaiting-files';
    else if (pack.warnings.length) pack.status = 'needs-provenance-review';
    else if (assets.every((file) => file.kind === 'archive')) pack.status = 'archive-needs-extraction';
    report.packages.push(pack);
  }
  const jsonPath = path.join(inbox, 'index.generated.json');
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  const safe = (value) => String(value).replace(/[|\r\n]/g, ' ');
  const markdown = ['# Local asset inbox', '', `Indexed: ${report.indexedAt}`, '', 'Inventory only. No package is approved or integrated automatically.', '', '| Package | Files | MiB | State |', '| --- | ---: | ---: | --- |', ...report.packages.map((pack) => `| ${safe(pack.id)} | ${pack.files.length} | ${(pack.files.reduce((size, file) => size + file.bytes, 0) / 1048576).toFixed(2)} | ${pack.status} |`), '', report.packages.length ? 'See index.generated.json for provenance, hashes, model nodes/clips and file warnings.' : 'No downloaded packages are present yet. Put each real pack under packages/<pack-id>/.', ''];
  await writeFile(path.join(inbox, 'index.generated.md'), markdown.join('\n'));
  console.log(`Indexed ${report.packages.length} packages, ${report.packages.reduce((count, pack) => count + pack.files.length, 0)} actual files. No files promoted to public/assets.`);
  if (report.looseFiles.length) console.warn(`Put these entries in package folders: ${report.looseFiles.join(', ')}`);
  console.log(`Read ${path.relative(root, jsonPath)} and asset-inbox/index.generated.md`);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === '--inspect' && process.argv[3]) console.log(JSON.stringify(await inspectFile(path.resolve(process.argv[3])), null, 2));
    else if (process.argv.length > 2) throw new Error('Usage: node scripts/index-asset-inbox.mjs [--inspect filename]');
    else await indexInbox();
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
