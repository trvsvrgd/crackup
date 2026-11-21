import { isDiagnosticId, sanitizeDiagnosticEvent, type DiagnosticEvent } from '../../shared/diagnostics/events.js';
import { safeReportDetail, type ReportSessionDetail } from '../../shared/diagnostics/reportSessions.js';
import type { BugReportRecorder } from './bugReport.js';

export interface ReportSelection { kind: 'browser' | 'runtime' | 'bootstrap'; id: string; }
export function buildSelectedReport(base: ReturnType<BugReportRecorder['report']>, selection: ReportSelection,
  fields: { steps: string; expected: string; actual: string }, runtime?: ReportSessionDetail | null, unavailable = false) {
  const selectedId = isDiagnosticId(selection.id) ? selection.id : base.diagnostics.runId;
  const candidate = runtime ? safeReportDetail(runtime) : null;
  const detail = candidate?.session.id === selectedId && candidate.session.kind === selection.kind ? candidate : null;
  const current = selection.kind === 'browser' && selectedId === base.diagnostics.runId;
  const session = base.journal.sessions.find(s => s.runId === selectedId);
  const browserEvents = (current ? [...base.journal.events, ...base.diagnostics.events] : base.journal.events).filter(event => selection.kind === 'browser'
    ? event.context.runId === selectedId : event.context.serverRunId === selectedId);
  const warnings: string[] = [];
  if (current && !base.rendering.captureEnabled) warnings.push('capture-disabled');
  if (unavailable || (selection.kind !== 'browser' && !detail)) warnings.push('selected-runtime-unavailable');
  if (selection.kind === 'browser') {
    if (!current && (!session || !session.clean)) warnings.push('previous-browser-session-not-confirmed-clean');
    if (base.journal.storageState !== 'available') warnings.push('browser-storage-unavailable');
    if (base.journal.dropped > 0) warnings.push('browser-history-evicted');
    if (base.journal.malformed > 0) warnings.push('browser-history-malformed');
    if (current && (base.diagnostics.events.at(-1)?.sequence ?? 0) > (session?.lastPersistedSequence ?? 0)) warnings.push('browser-persistence-may-lag');
  }
  if (detail) {
    if (detail.session.active) warnings.push('runtime-still-running');
    else if (!detail.session.clean) warnings.push('runtime-not-confirmed-clean');
    if (detail.session.possibleMissingTail || detail.session.dropped || detail.session.writeFailures) warnings.push('runtime-tail-may-be-missing');
    if (detail.invalidLines) warnings.push('runtime-history-malformed');
    if (detail.truncatedEvents || detail.omittedFiles) warnings.push('runtime-history-truncated');
  }
  const unique = new Map<string, DiagnosticEvent>();
  for (const raw of [...browserEvents, ...(detail?.events ?? [])]) {
    const event = sanitizeDiagnosticEvent(raw); if (!event) continue;
    // Name preserves early P003 archives whose launcher/writer sequences overlapped.
    unique.set(`${event.component}:${event.context.runId}:${event.sequence}:${event.name}`, event);
  }
  const all = [...unique.values()].sort((a, b) => a.at.localeCompare(b.at) || a.sequence - b.sequence);
  const reportedSuppressed = all.reduce((sum, event) => Math.min(Number.MAX_SAFE_INTEGER, sum + event.suppressedBefore), 0);
  if (reportedSuppressed > 0 || (current && base.diagnostics.suppressed > 0)) warnings.push('events-rate-suppressed');
  if (current && base.diagnostics.sinkFailures > 0) warnings.push('event-sink-failures');
  if (selection.kind === 'browser' && ((all[0]?.sequence ?? 1) > 1 ||
      (session?.lastPersistedSequence ?? 0) > Math.max(0, ...all.map(e => e.sequence)))) warnings.push('browser-history-truncated');
  const latestError = [...all].reverse().find(e => e.severity === 'error');
  const latestCommit = [...all].reverse().find(e => e.name === 'save.committed' && Number.isSafeInteger(e.payload.revision));
  const events = all.slice(-510);
  if (latestError && !events.includes(latestError)) events.unshift(latestError);
  if (latestCommit && !events.includes(latestCommit)) events.unshift(latestCommit);
  events.sort((a, b) => a.at.localeCompare(b.at) || a.sequence - b.sequence);
  if (all.length > events.length) warnings.push('report-event-limit');
  const committed = events.filter(e => e.name === 'save.committed' && Number.isSafeInteger(e.payload.revision));
  const last = committed.at(-1);
  const lastGoodSave = last ? { revision: last.payload.revision, at: last.at, campaignRef: last.context.campaignRef ?? null,
    serverRunId: last.context.serverRunId ?? (last.component === 'server' ? last.context.runId : null),
    source: last.component, evidence: 'recorded-commit' } : null;
  const legacy = current ? base.events.map(e => ({ kind: e.kind, at: e.at, category: e.category,
    frames: e.frames.filter(frame => /^game\.js:\d{1,8}:\d{1,8}$/.test(frame)).slice(0, 6) })) : [];
  const report = {
    schemaVersion: 3, product: 'CRACKUP', build: base.build, buildRole: 'reporting-client', createdAt: base.createdAt,
    notes: fields.steps.slice(0, 4000), expected: fields.expected.slice(0, 2000), actual: fields.actual.slice(0, 2000),
    selectedSession: { kind: selection.kind, id: selectedId, currentBrowserPage: current,
      runtime: detail?.session ?? null, browser: selection.kind === 'browser' && session ? {
        runId: session.runId, updatedAt: session.updatedAt, clean: session.clean, lastPersistedSequence: session.lastPersistedSequence } : null },
    session: current ? base.session : null, rendering: current ? base.rendering : null, events: legacy,
    lastGoodSave, laterSaveFailure: Boolean(last && events.slice(events.indexOf(last) + 1).some(e => e.name === 'save.failed')),
    completeness: { possibleMissingTail: warnings.length > 0, warnings: [...new Set(warnings)],
      retainedEvents: events.length, lastIncludedEvent: events.at(-1) ? { at: events.at(-1)!.at, sequence: events.at(-1)!.sequence } : null,
      invalidLines: detail?.invalidLines ?? 0, truncatedEvents: detail?.truncatedEvents ?? 0, omittedFiles: detail?.omittedFiles ?? 0 },
    diagnostics: { schemaVersion: 1, runId: selectedId, events,
      suppressed: current ? base.diagnostics.suppressed : null, sinkFailures: current ? base.diagnostics.sinkFailures : null,
      reportedSuppressedLowerBound: reportedSuppressed },
    journal: { schemaVersion: 1, storageState: base.journal.storageState, dropped: base.journal.dropped,
      malformed: base.journal.malformed, events: events.filter(e => e.component === 'client') },
  };
  // Explicit final byte limit includes pretty-print expansion and user-supplied Unicode notes.
  while (new TextEncoder().encode(JSON.stringify(report, null, 2)).length > 2_000_000 && report.diagnostics.events.length > 1) {
    const index = report.diagnostics.events.findIndex(e => e !== latestError && e !== latestCommit);
    report.diagnostics.events.splice(Math.max(0, index), 1);
    report.journal.events = report.diagnostics.events.filter(e => e.component === 'client');
    report.completeness.possibleMissingTail = true;
    if (!report.completeness.warnings.includes('report-byte-limit')) report.completeness.warnings.push('report-byte-limit');
    report.completeness.retainedEvents = report.diagnostics.events.length;
  }
  return report;
}
