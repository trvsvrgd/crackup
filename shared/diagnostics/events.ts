/** Versioned, bounded diagnostics. Never serialize arbitrary errors, profiles or protocol messages. */
export const EVENT_NAMES = [
  'launcher.start', 'launcher.ready', 'launcher.reused', 'launcher.failed', 'launcher.stop',
  'server.start', 'server.ready', 'server.failed', 'server.stop',
  'connection.open', 'connection.attempt', 'connection.authenticated', 'connection.rejected',
  'connection.closed', 'connection.retry', 'connection.exhausted',
  'campaign.loaded', 'campaign.load-failed', 'save.requested', 'save.committed', 'save.failed',
  'client.start', 'client.ready', 'client.failure', 'lifecycle.pause',
  'journal.session', 'journal.stop',
  'performance.sample', 'performance.stall', 'performance.heartbeat', 'performance.lifecycle', 'performance.resources', 'network.pressure', 'network.traffic',
] as const;
export type DiagnosticName = typeof EVENT_NAMES[number];
export type DiagnosticComponent = 'launcher' | 'server' | 'client' | 'journal';
export interface DiagnosticContext {
  runId?: string; connectionId?: string; clientRunId?: string; serverRunId?: string;
  agentRef?: string; campaignRef?: string; saveAttemptId?: string;
  clientBuild?: string; serverBuild?: string; contentBuild?: string;
}
export interface DiagnosticEvent {
  schemaVersion: 1; sequence: number; at: string; elapsedMs: number;
  component: DiagnosticComponent; name: DiagnosticName; severity: 'info' | 'warn' | 'error';
  context: DiagnosticContext; payload: Record<string, number | boolean | string>; suppressedBefore: number;
}
export const isDiagnosticId = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
export function newDiagnosticId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  // Correlation only, never authentication. Insecure-origin browsers may omit randomUUID.
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
const names = new Set<string>(EVENT_NAMES);
const numeric = ['revision', 'serverTick', 'attempt', 'delayMs', 'durationMs', 'closeCode', 'port', 'activeAgents', 'dropped', 'writeFailures', 'lastPersistedSequence',
  'sampleCount', 'retainedSamples', 'truncatedSamples', 'meanMs', 'p50Ms', 'p95Ms', 'bufferedBytes', 'inputQueue', 'bytes', 'messages',
  'heapBytes', 'rssBytes', 'externalBytes', 'bodies', 'colliders', 'geometries', 'textures', 'programs', 'drawCalls', 'triangles',
  'predictionInputs', 'remoteEntities', 'snapshotEntries', 'journalQueue', 'saveAgeMs', 'catchupDroppedMs', 'saveBytes'] as const;
const booleans = ['paused', 'saveError', 'retry', 'isNew', 'clean'] as const;
const codes = new Set(['UNKNOWN', 'TYPE_ERROR', 'RANGE_ERROR', 'REFERENCE_ERROR', 'SYNTAX_ERROR', 'ERROR',
  'SQLITE_FULL', 'SQLITE_BUSY', 'SQLITE_CORRUPT', 'SQLITE_NOTADB', 'SQLITE_READONLY', 'SQLITE_CONSTRAINT',
  'EACCES', 'EPERM', 'ENOENT', 'ENOSPC', 'EADDRINUSE', 'AUTH_REJECTED', 'CAMPAIGN_INVALID',
  'MESSAGE_RATE_EXCEEDED', 'CONNECTION_TOO_SLOW', 'LOGIN_TIMEOUT', 'SESSION_REPLACED',
  'LAUNCHER_PREREQUISITE', 'LAUNCHER_INSTALL', 'LAUNCHER_BUILD', 'LAUNCHER_RUNTIME',
  'startup-failed', 'runtime-error', 'unhandled-rejection', 'graphics-lost', 'graphics-restored']);
export function diagnosticCloseCode(reason: unknown): string {
  if (typeof reason !== 'string') return 'UNKNOWN';
  return new Map([
    ['Message rate exceeded', 'MESSAGE_RATE_EXCEEDED'], ['Connection too slow', 'CONNECTION_TOO_SLOW'],
    ['Login timed out', 'LOGIN_TIMEOUT'], ['Replaced by newer session', 'SESSION_REPLACED'],
  ]).get(reason) ?? 'UNKNOWN';
}
export function diagnosticErrorCode(error: unknown): string {
  try {
  if (!(error instanceof Error)) return 'UNKNOWN';
  const code = (error as Error & { code?: unknown }).code;
  if (typeof code === 'string' && codes.has(code)) return code;
  return ({ TypeError: 'TYPE_ERROR', RangeError: 'RANGE_ERROR', ReferenceError: 'REFERENCE_ERROR', SyntaxError: 'SYNTAX_ERROR', Error: 'ERROR' } as Record<string, string>)[error.name] ?? 'UNKNOWN';
  } catch { return 'UNKNOWN'; }
}
export function safeDiagnosticContext(value: unknown): DiagnosticContext {
  const input = value && typeof value === 'object' ? value as DiagnosticContext : {};
  const safe: DiagnosticContext = {};
  for (const key of ['runId', 'connectionId', 'clientRunId', 'serverRunId', 'saveAttemptId'] as const)
    if (isDiagnosticId(input[key])) safe[key] = input[key];
  for (const key of ['agentRef', 'campaignRef'] as const)
    if (typeof input[key] === 'string' && /^[a-f0-9]{32}$/.test(input[key]!)) safe[key] = input[key];
  for (const key of ['clientBuild', 'serverBuild', 'contentBuild'] as const)
    if (typeof input[key] === 'string' && new RegExp(`^${key.replace('Build', '')}-[a-f0-9]{16}$`).test(input[key]!)) safe[key] = input[key];
  return safe;
}
function payload(input: Record<string, unknown>): DiagnosticEvent['payload'] {
  const safe: DiagnosticEvent['payload'] = {};
  for (const key of numeric) if (typeof input[key] === 'number' && Number.isFinite(input[key]) && input[key] >= 0 && input[key] <= Number.MAX_SAFE_INTEGER)
    safe[key] = Math.round((input[key] as number) * 100) / 100;
  for (const key of booleans) if (typeof input[key] === 'boolean') safe[key] = input[key] as boolean;
  if (['active','paused','background','menu','transition','failed','mixed'].includes(String(input.state))) safe.state = String(input.state);
  if (['frame.interval','render.work','simulation.work','simulation.interval','eventloop.delay','save.serialize','save.commit','asset.load','network.decode','network.encode'].includes(String(input.metric))) safe.metric = String(input.metric);
  if (typeof input.mode === 'string' && ['solo', 'campaign', 'shared'].includes(input.mode)) safe.mode = input.mode;
  if (typeof input.code === 'string' && codes.has(input.code)) safe.code = input.code;
  for (let i = 0; i < 6; i++) {
    const value = input[`frame${i}`];
    if (typeof value === 'string' && /^game\.js:\d{1,8}:\d{1,8}$/.test(value)) safe[`frame${i}`] = value;
  }
  return safe;
}
/** Revalidate all persisted/imported data; never trust browser storage or uploaded events. */
export function sanitizeDiagnosticEvent(value: unknown): DiagnosticEvent | null {
  if (!value || typeof value !== 'object') return null;
  const e = value as DiagnosticEvent;
  if (e.schemaVersion !== 1 || !names.has(e.name) || !['launcher', 'server', 'client', 'journal'].includes(e.component) ||
      !Number.isSafeInteger(e.sequence) || e.sequence < 1 || !Number.isFinite(e.elapsedMs) || e.elapsedMs < 0 ||
      typeof e.at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(e.at) || !Number.isFinite(Date.parse(e.at)) ||
      !e.payload || typeof e.payload !== 'object' || !Number.isSafeInteger(e.suppressedBefore) || e.suppressedBefore < 0) return null;
  const context = safeDiagnosticContext(e.context);
  if (!context.runId) return null;
  return { schemaVersion: 1, sequence: e.sequence, at: e.at, elapsedMs: e.elapsedMs, component: e.component, name: e.name,
    severity: e.name.endsWith('failed') || e.name === 'client.failure' ? 'error' : /rejected|exhausted/.test(e.name) ? 'warn' : 'info',
    context, payload: payload(e.payload), suppressedBefore: e.suppressedBefore };
}
export class DiagnosticRecorder {
  public readonly runId: string;
  private readonly origin = performance.now();
  private sequence = 0;
  private readonly events: DiagnosticEvent[] = [];
  private readonly rates = new Map<DiagnosticName, { start: number; emitted: number; suppressed: number }>();
  private suppressed = 0;
  private sinkFailures = 0;
  private correlation: DiagnosticContext = {};
  private readonly observers = new Set<(event: DiagnosticEvent) => void>();
  constructor(public readonly component: DiagnosticComponent, private readonly base: DiagnosticContext = {},
    private readonly sink?: (event: DiagnosticEvent) => void, public readonly enabled = true) {
    this.runId = isDiagnosticId(base.runId) ? base.runId : newDiagnosticId();
    this.base = safeDiagnosticContext(base);
  }
  public setContext(value: unknown): void { this.correlation = safeDiagnosticContext(value); }
  public subscribe(sink: (event: DiagnosticEvent) => void): () => void { this.observers.add(sink); return () => this.observers.delete(sink); }
  public record(name: DiagnosticName, fields: Record<string, unknown> = {}, correlation: DiagnosticContext = {}): void {
    if (!this.enabled) return;
    if (!names.has(name)) return;
    const elapsed = Math.max(0, performance.now() - this.origin);
    let rate = this.rates.get(name);
    if (!rate) { rate = { start: elapsed, emitted: 0, suppressed: 0 }; this.rates.set(name, rate); }
    if (elapsed - rate.start >= 1000) { rate.start = elapsed; rate.emitted = 0; }
    if (rate.emitted >= 10) { rate.suppressed++; this.suppressed++; return; }
    rate.emitted++;
    const event: DiagnosticEvent = { schemaVersion: 1, sequence: ++this.sequence, at: new Date().toISOString(),
      elapsedMs: Math.round(elapsed * 100) / 100, component: this.component, name,
      severity: name.endsWith('failed') || name === 'client.failure' ? 'error' : /rejected|exhausted/.test(name) ? 'warn' : 'info',
      context: safeDiagnosticContext({ ...this.base, ...this.correlation, ...correlation, runId: this.runId }), payload: payload(fields), suppressedBefore: rate.suppressed };
    rate.suppressed = 0;
    this.events.push(event); if (this.events.length > 256) this.events.shift();
    try { this.sink?.(structuredClone(event)); } catch { this.sinkFailures++; }
    for (const observer of this.observers) { try { observer(structuredClone(event)); } catch { this.sinkFailures++; } }
  }
  public snapshot() { return { schemaVersion: 1, runId: this.runId, suppressed: this.suppressed, sinkFailures: this.sinkFailures, events: structuredClone(this.events) }; }
}
