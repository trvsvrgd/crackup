import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { DiagnosticRecorder, type DiagnosticContext, type DiagnosticComponent } from '../shared/diagnostics/events.js';
import type { DiagnosticJournal } from './diagnosticJournal.js';

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extension = import.meta.url.endsWith('.ts') ? '.ts' : '.js';
function hashTrees(directories: string[]) {
  const hash = createHash('sha256');
  function walk(directory: string) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile() && entry.name.endsWith(extension)) {
        hash.update(path.relative(runtimeRoot, file).replaceAll('\\', '/')); hash.update('\0'); hash.update(fs.readFileSync(file)); hash.update('\0');
      }
    }
  }
  for (const directory of directories) walk(path.join(runtimeRoot, directory));
  return hash.digest('hex').slice(0, 16);
}
// Executing sources (or compiled JS), not a stale commit label. Dist builds differ from source runs.
const identity: DiagnosticContext = { serverBuild: `server-${hashTrees(['server', 'shared'])}`, contentBuild: `content-${hashTrees(['shared/content'])}` };
const salt = randomBytes(32);
export const diagnosticRef = (value: string) => createHmac('sha256', salt).update(value).digest('hex').slice(0, 32);
export const diagnosticIdentity = () => ({ ...identity });
export function serverDiagnostics(component: DiagnosticComponent = 'server', runId?: string, journal?: DiagnosticJournal) {
  return new DiagnosticRecorder(component, { ...identity, runId }, event => {
    journal?.enqueue(event);
    if (!journal || process.env.DIAGNOSTIC_STDOUT === '1') console.log(JSON.stringify(event));
  }, process.env.CRACKUP_DIAGNOSTICS !== '0');
}
