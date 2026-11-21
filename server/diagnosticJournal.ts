import fs from 'node:fs/promises';
import path from 'node:path';
import { DiagnosticRecorder, diagnosticErrorCode, newDiagnosticId, sanitizeDiagnosticEvent, type DiagnosticEvent } from '../shared/diagnostics/events.js';

export const JOURNAL_DEFAULTS = { totalBytes: 98_000_000, fileBytes: 10_000_000, retentionMs: 7 * 86400_000,
  reserveBytes: 256 * 1024 * 1024, queueBytes: 1_000_000, queueEvents: 512, maxFiles: 128 };
type Limits = typeof JOURNAL_DEFAULTS;
// Only our explicitly named artifacts are eligible for automatic retention. Never recurse into saves/reports.
const managed = /^(events-[a-f0-9-]{36}-\d+\.jsonl|session-[a-f0-9-]{36}\.json|latest-error\.json|bootstrap\.json)(\.tmp)?$/;
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
function environmentLimits(): Partial<Limits> {
  const number = (name: string, fallback: number, min: number, max: number) => {
    const value = Number(process.env[name]); return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
  };
  const totalBytes = Math.floor(number('CRACKUP_LOG_MB', 98, 1, 98) * 1_000_000);
  return { totalBytes, fileBytes: Math.min(totalBytes - 16384, Math.floor(number('CRACKUP_LOG_FILE_MB', 10, 0.01, 10) * 1_000_000)),
    retentionMs: Math.floor(number('CRACKUP_LOG_DAYS', 7, 1, 7) * 86400_000),
    reserveBytes: Math.floor(number('CRACKUP_SAVE_RESERVE_MB', 256, 256, 4096) * 1024 * 1024) };
}

export class DiagnosticJournal {
  readonly directory: string;
  readonly runId = newDiagnosticId();
  readonly limits: Limits;
  private queue: { event: DiagnosticEvent; line: string; bytes: number }[] = [];
  private queueBytes = 0;
  private running: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private maintenance: ReturnType<typeof setInterval> | null = null;
  private nextRetry = 0;
  private segment = 0;
  private file: string | null = null;
  private size = 0;
  private initialized = false;
  private ownsLock = false;
  private closed = false;
  private latestError: DiagnosticEvent | null = null;
  private startedAt = new Date().toISOString();
  private lastPersisted: { runId: string; component: string; sequence: number; at: string } | null = null;
  private dropped = 0;
  private writeFailures = 0;
  private lastError = '';
  private readonly lifecycle = new DiagnosticRecorder('journal', { runId: this.runId });
  constructor(dataRoot: string, limits: Partial<Limits> = {}, private readonly io: typeof fs = fs) {
    this.directory = path.resolve(dataRoot, 'logs');
    this.limits = { ...JOURNAL_DEFAULTS, ...environmentLimits(), ...limits };
    if (process.env.CRACKUP_DIAGNOSTICS === '0') { this.closed = true; return; }
    for (const [key, value] of Object.entries(this.limits)) if (!Number.isSafeInteger(value) || value < 0) throw Error(`Invalid journal limit: ${key}`);
    if (this.limits.totalBytes < 32768 || this.limits.fileBytes < 4096 || this.limits.fileBytes > this.limits.totalBytes - 16384 || this.limits.queueEvents < 1 || this.limits.queueBytes < 4096 || this.limits.maxFiles < 4) throw Error('Journal limits too small');
    this.lifecycle.record('journal.session', { clean: false });
    this.enqueue(this.lifecycle.snapshot().events[0]);
    this.maintenance = setInterval(() => { if (!this.closed) void this.pump(); }, 60_000);
    this.maintenance.unref();
  }
  status() { return { runId: this.runId, queued: this.queue.length, queueBytes: this.queueBytes, dropped: this.dropped,
    writeFailures: this.writeFailures, lastError: this.lastError, lastPersisted: this.lastPersisted ? { ...this.lastPersisted } : null,
    available: this.initialized && !this.lastError, closed: this.closed }; }
  enqueue(input: DiagnosticEvent): boolean {
    if (this.closed) return false;
    const event = sanitizeDiagnosticEvent(input); if (!event) return false;
    const line = JSON.stringify(event) + '\n', bytes = Buffer.byteLength(line);
    if (bytes > 4096) { this.dropped++; return false; }
    if (event.severity === 'error') this.latestError = event;
    while (this.queue.length && (this.queue.length >= this.limits.queueEvents || this.queueBytes + bytes > this.limits.queueBytes)) {
      const removed = this.queue.shift()!; this.queueBytes -= removed.bytes; this.dropped++;
    }
    this.queue.push({ event, line, bytes }); this.queueBytes += bytes;
    this.schedule(); return true;
  }
  private schedule() {
    if (this.timer || this.running || this.closed) return;
    this.timer = setTimeout(() => { this.timer = null; void this.pump(); }, Math.max(100, this.nextRetry - Date.now()));
    this.timer.unref();
  }
  private async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.io.mkdir(this.directory, { recursive: true });
    if ((await this.io.lstat(this.directory)).isSymbolicLink()) throw Object.assign(Error(), { code: 'EACCES' });
    const lock = path.join(this.directory, '.writer.lock');
    if (!this.ownsLock) {
      try {
        const handle = await this.io.open(lock, 'wx');
        try { await handle.writeFile(JSON.stringify({ pid: process.pid, runId: this.runId })); } finally { await handle.close(); }
        this.ownsLock = true;
      } catch (error: any) {
        if (error?.code !== 'EEXIST') throw error;
        // A reused PID conservatively prevents disk capture; never terminate a process or steal a live lock.
        const stat = await this.io.lstat(lock);
        if (stat.isSymbolicLink() || stat.size > 512) throw Object.assign(Error(), { code: 'EACCES' });
        let owner: { pid?: number };
        try { owner = JSON.parse(await this.io.readFile(lock, 'utf8')); } catch { throw Object.assign(Error(), { code: 'EACCES' }); }
        if (!Number.isSafeInteger(owner.pid) || owner.pid! <= 0) throw Object.assign(Error(), { code: 'EACCES' });
        try { process.kill(owner.pid!, 0); throw Object.assign(Error(), { code: 'SQLITE_BUSY' }); }
        catch (probe: any) { if (probe?.code !== 'ESRCH') throw probe; }
        // Exclusive rename makes simultaneous stale-lock recovery contenders serialize.
        const stale = lock + '.stale';
        const guard = await this.io.open(stale, 'wx');
        try { await this.io.unlink(lock); } finally { await guard.close(); await this.io.unlink(stale); }
        return this.initialize();
      }
    }
    await this.retain(0);
    this.initialized = true;
  }
  private async retain(incoming: number) {
    const files = [];
    for (const entry of await this.io.readdir(this.directory, { withFileTypes: true })) {
      if (!entry.isFile() || !managed.test(entry.name)) continue;
      const filename = path.join(this.directory, entry.name), stat = await this.io.lstat(filename);
      files.push({ filename, name: entry.name, bytes: stat.size, at: stat.mtimeMs });
    }
    files.sort((a, b) => a.at - b.at || a.name.localeCompare(b.name));
    let total = files.reduce((sum, file) => sum + file.bytes, 0), count = files.length;
    // Reserve 16 KiB for current summary/error and their atomic replacement files, including lock metadata.
    const ceiling = this.limits.totalBytes - 16384;
    for (const file of files) {
      const protectedFile = file.name === `session-${this.runId}.json` || file.name === 'latest-error.json';
      if (protectedFile && Date.now() - file.at <= this.limits.retentionMs) continue;
      if (Date.now() - file.at <= this.limits.retentionMs && total + incoming <= ceiling && count < this.limits.maxFiles - 4) continue;
      await this.io.unlink(file.filename); total -= file.bytes; count--;
      if (file.filename === this.file) { this.file = null; this.size = 0; }
    }
    if (total + incoming > ceiling) throw Object.assign(Error(), { code: 'ENOSPC' });
  }
  private async atomic(name: string, value: unknown) {
    const filename = path.join(this.directory, name), temporary = filename + '.tmp';
    // Reject symlinks rather than following an unexpected user-created path.
    for (const candidate of [filename, temporary]) {
      try { if ((await this.io.lstat(candidate)).isSymbolicLink()) throw Object.assign(Error(), { code: 'EACCES' }); }
      catch (e: any) { if (e?.code !== 'ENOENT') throw e; }
    }
    await this.io.writeFile(temporary, JSON.stringify(value) + '\n');
    await this.io.rename(temporary, filename);
  }
  private async summary(clean: boolean) {
    await this.atomic(`session-${this.runId}.json`, { schemaVersion: 1, runId: this.runId, startedAt: this.startedAt,
      updatedAt: new Date().toISOString(), clean, possibleMissingTail: !clean || this.dropped > 0 || this.writeFailures > 0,
      lastPersisted: this.lastPersisted, dropped: this.dropped, writeFailures: this.writeFailures });
  }
  private pump(): Promise<void> {
    if (this.running) return this.running;
    this.running = (async () => {
      try {
        await this.initialize();
        await this.retain(0);
        const disk = await this.io.statfs(this.directory);
        if (disk.bavail * disk.bsize < this.limits.reserveBytes + this.limits.queueBytes + 16384) throw Object.assign(Error(), { code: 'ENOSPC' });
        while (this.queue.length) {
          const remaining = await this.io.statfs(this.directory);
          if (remaining.bavail * remaining.bsize < this.limits.reserveBytes + this.limits.queueBytes + 16384) throw Object.assign(Error(), { code: 'ENOSPC' });
          const batch = this.queue.splice(0, 32); const bytes = batch.reduce((sum, item) => sum + item.bytes, 0);
          this.queueBytes -= bytes;
          try {
            await this.retain(bytes);
            if (!this.file || this.size + bytes > this.limits.fileBytes) {
              this.file = path.join(this.directory, `events-${this.runId}-${++this.segment}.jsonl`); this.size = 0;
              const handle = await this.io.open(this.file, 'wx'); await handle.close();
            }
            // An event batch is split by the configured rotation boundary, including small test limits.
            const touched = new Set<string>();
            for (const item of batch) {
              if (this.size + item.bytes > this.limits.fileBytes) {
                await this.retain(item.bytes);
                this.file = path.join(this.directory, `events-${this.runId}-${++this.segment}.jsonl`); this.size = 0;
                const handle = await this.io.open(this.file, 'wx'); await handle.close();
              }
              await this.io.appendFile(this.file!, item.line);
              touched.add(this.file!);
              this.size += item.bytes;
            }
            for (const filename of touched) {
              try { const handle = await this.io.open(filename, 'r+'); try { await handle.sync(); } finally { await handle.close(); } }
              catch (error: any) { if (error?.code !== 'ENOENT') throw error; } // Retention can retire a tiny test segment within a batch.
            }
            const last = batch.at(-1)!.event;
            this.lastPersisted = { runId: last.context.runId!, component: last.component, sequence: last.sequence, at: last.at };
          } catch (error) { this.dropped += batch.length; this.file = null; this.size = 0; throw error; }
        }
        if (this.latestError) { await this.atomic('latest-error.json', this.latestError); this.latestError = null; }
        this.lastError = ''; await this.summary(false);
      } catch (error) {
        this.writeFailures++; this.lastError = diagnosticErrorCode(error); this.nextRetry = Date.now() + 5000;
      }
    })().finally(() => { this.running = null; if (this.queue.length) this.schedule(); });
    return this.running;
  }
  /** Bounded shutdown wait. Never put this on the save transaction's critical path. */
  async flush(timeoutMs = 1500): Promise<boolean> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    await Promise.race([this.pump(), delay(timeoutMs)]);
    return !this.running && this.queue.length === 0 && !this.lastError;
  }
  async close(): Promise<void> {
    if (this.closed) return;
    this.lifecycle.record('journal.stop', { clean: true, dropped: this.dropped, writeFailures: this.writeFailures });
    this.enqueue(this.lifecycle.snapshot().events.at(-1)!);
    const flushed = await this.flush(); this.closed = true;
    if (this.maintenance) clearInterval(this.maintenance);
    if (this.timer) clearTimeout(this.timer);
    if (this.running) return; // Keep lock if an OS write is still pending; next process checks liveness.
    await Promise.race([(async () => {
      try {
        if (flushed) await this.summary(true);
      } catch { this.writeFailures++; }
      finally {
        if (this.ownsLock) {
          try { await this.io.unlink(path.join(this.directory, '.writer.lock')); this.ownsLock = false; } catch { /* Recovered after process exit. */ }
        }
      }
    })(), delay(1500)]);
  }
}

/** Bounded streaming reader tolerates a torn final line, malformed rows and injected fields. */
export async function readDiagnosticFile(filename: string, limit = 2000) {
  const { createReadStream } = await import('node:fs');
  const events: DiagnosticEvent[] = []; let invalid = 0, bytes = 0, truncatedEvents = 0;
  const stream = createReadStream(filename, { highWaterMark: 8192 });
  let line = '', oversized = false;
  function consume() {
    if (oversized) { invalid++; }
    else if (line) {
      try {
        const event = sanitizeDiagnosticEvent(JSON.parse(line)); if (!event) throw Error();
        events.push(event); if (events.length > Math.max(1, Math.min(2000, limit))) { events.shift(); truncatedEvents++; }
      } catch { invalid++; }
    }
    line = ''; oversized = false;
  }
  try {
    for await (const chunk of stream) {
      bytes += chunk.length;
      if (bytes > 10_000_000) { invalid++; break; }
      for (const character of chunk.toString('utf8')) {
        if (character === '\n') consume();
        else if (!oversized) { line += character; if (line.length > 4096) { line = ''; oversized = true; } }
      }
    }
    // Un-terminated rows may be a torn write even when JSON happens to parse.
    if (line || oversized) invalid++;
  } finally { stream.destroy(); }
  return { events, invalid, truncatedEvents, possibleMissingTail: invalid > 0 };
}
