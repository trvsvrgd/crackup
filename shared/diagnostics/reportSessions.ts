import { isDiagnosticId, sanitizeDiagnosticEvent, type DiagnosticEvent } from './events.js';

export interface ReportSession {
  id: string; kind: 'runtime' | 'bootstrap'; startedAt: string; updatedAt: string;
  clean: boolean; active: boolean; possibleMissingTail: boolean; dropped: number; writeFailures: number;
  lastPersisted: { runId: string; component: string; sequence: number; at: string } | null;
}
export interface ReportSessionDetail {
  session: ReportSession; events: DiagnosticEvent[]; invalidLines: number; truncatedEvents: number; omittedFiles: number;
}
const timestamp = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value));
const count = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0 ? Math.min(Number(value), Number.MAX_SAFE_INTEGER) : 0;
export function safeReportSession(value: unknown): ReportSession | null {
  if (!value || typeof value !== 'object') return null;
  const s = value as ReportSession;
  if (!isDiagnosticId(s.id) || !['runtime', 'bootstrap'].includes(s.kind) || !timestamp(s.startedAt) || !timestamp(s.updatedAt)) return null;
  const p = s.lastPersisted;
  const lastPersisted = p && isDiagnosticId(p.runId) && ['client', 'server', 'launcher', 'journal'].includes(p.component) &&
    timestamp(p.at) && Number.isSafeInteger(p.sequence) && p.sequence > 0
    ? { runId: p.runId, component: p.component, sequence: p.sequence, at: p.at } : null;
  return { id: s.id, kind: s.kind, startedAt: s.startedAt, updatedAt: s.updatedAt, clean: s.clean === true, active: s.active === true,
    possibleMissingTail: s.possibleMissingTail !== false, dropped: count(s.dropped), writeFailures: count(s.writeFailures), lastPersisted };
}
export function safeReportDetail(value: unknown): ReportSessionDetail | null {
  if (!value || typeof value !== 'object') return null;
  const d = value as ReportSessionDetail, session = safeReportSession(d.session);
  if (!session || !Array.isArray(d.events)) return null;
  const events = d.events.slice(-512).map(sanitizeDiagnosticEvent).filter((e): e is DiagnosticEvent => Boolean(e));
  return { session, events, invalidLines: count(d.invalidLines) + Math.min(d.events.length, 512) - events.length,
    truncatedEvents: count(d.truncatedEvents) + Math.max(0, d.events.length - 512), omittedFiles: count(d.omittedFiles) };
}
