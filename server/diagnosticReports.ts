import fs from 'node:fs/promises';
import path from 'node:path';
import { isDiagnosticId, sanitizeDiagnosticEvent, type DiagnosticEvent } from '../shared/diagnostics/events.js';
import { safeReportSession, type ReportSession, type ReportSessionDetail } from '../shared/diagnostics/reportSessions.js';
import { readDiagnosticFile } from './diagnosticJournal.js';

/** Read-only local operator access. Never accepts a path from the request or reads a save. */
export class DiagnosticReports {
  constructor(private readonly directory: string, private readonly currentRunId: string) {}
  private async files() {
    if ((await fs.lstat(this.directory)).isSymbolicLink()) throw Error('Unavailable');
    return (await fs.readdir(this.directory, { withFileTypes: true })).filter(e => e.isFile()).map(e => e.name);
  }
  private async smallJSON(name: string) {
    const filename = path.join(this.directory, name), stat = await fs.lstat(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8192) throw Error('Unavailable');
    return JSON.parse(await fs.readFile(filename, 'utf8'));
  }
  async catalogue() {
    const files = await this.files(), sessions: ReportSession[] = []; let unavailableEntries = 0;
    for (const name of files.filter(n => /^session-[a-f0-9-]{36}\.json$/.test(n)).slice(-128)) {
      try {
        const raw = await this.smallJSON(name);
        if (raw.schemaVersion !== 1) throw Error();
        const session = safeReportSession({ ...raw, id: raw.runId, kind: 'runtime', active: raw.runId === this.currentRunId });
        if (!session || name !== `session-${session.id}.json`) throw Error();
        sessions.push(session);
      } catch { unavailableEntries++; }
    }
    if (files.includes('bootstrap.json')) {
      try {
        const event = sanitizeDiagnosticEvent(await this.smallJSON('bootstrap.json'));
        if (!event || event.name !== 'launcher.failed') throw Error();
        sessions.push({ id: event.context.runId!, kind: 'bootstrap', startedAt: event.at, updatedAt: event.at, clean: false,
          active: false, possibleMissingTail: true, dropped: 0, writeFailures: 0,
          lastPersisted: { runId: event.context.runId!, component: event.component, sequence: event.sequence, at: event.at } });
      } catch { unavailableEntries++; }
    }
    sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return { sessions: sessions.slice(0, 20), omittedSessions: Math.max(0, sessions.length - 20), unavailableEntries,
      currentRunId: this.currentRunId, localFolder: this.directory };
  }
  async detail(id: string): Promise<ReportSessionDetail | null> {
    if (!isDiagnosticId(id)) return null;
    const session = (await this.catalogue()).sessions.find(s => s.id === id); if (!session) return null;
    if (session.kind === 'bootstrap') {
      const event = sanitizeDiagnosticEvent(await this.smallJSON('bootstrap.json'));
      if (!event || event.context.runId !== id) return null;
      return { session, events: [event], invalidLines: 0, truncatedEvents: 0, omittedFiles: 0 };
    }
    const files = (await this.files()).filter(n => n.startsWith(`events-${id}-`) && /^events-[a-f0-9-]{36}-\d+\.jsonl$/.test(n))
      .sort((a, b) => Number(b.match(/-(\d+)\.jsonl$/)![1]) - Number(a.match(/-(\d+)\.jsonl$/)![1]));
    const events: DiagnosticEvent[] = []; let invalidLines = 0, truncatedEvents = 0, readFiles = 0;
    // Bounded I/O even for large retained sessions: newest two segments, 512 exported events.
    for (const name of files.slice(0, 2)) {
      const filename = path.join(this.directory, name), stat = await fs.lstat(filename);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 10_000_000) { invalidLines++; continue; }
      const read = await readDiagnosticFile(filename, 512 - events.length);
      events.unshift(...read.events); invalidLines += read.invalid; truncatedEvents += read.truncatedEvents; readFiles++;
      if (events.length >= 512) break;
    }
    try {
      const error = sanitizeDiagnosticEvent(await this.smallJSON('latest-error.json'));
      if (error && (error.context.runId === id || error.context.serverRunId === id) &&
          !events.some(e => e.context.runId === error.context.runId && e.component === error.component && e.sequence === error.sequence && e.name === error.name)) {
        if (events.length >= 512) { events.shift(); truncatedEvents++; }
        events.unshift(error);
      }
    } catch { /* Optional reserved error may not exist; never read another session's error as this one. */ }
    return { session, events, invalidLines, truncatedEvents, omittedFiles: Math.max(0, files.length - readFiles) };
  }
}
