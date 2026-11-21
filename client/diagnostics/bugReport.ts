import { DiagnosticRecorder } from '../../shared/diagnostics/events.js';
import { BrowserJournal } from './browserJournal.js';
import { PerformanceSampler, type ActivityState } from '../../shared/diagnostics/performance.js';
declare const __CRACKUP_DIAGNOSTICS__: boolean;
export type DiagnosticKind = 'startup-failed' | 'runtime-error' | 'unhandled-rejection' | 'graphics-lost' | 'graphics-restored';
export interface ReportContext {
  mode?: 'shared' | 'solo' | 'campaign'; connected?: boolean; serverTick?: number;
  paused?: boolean; saveError?: boolean; saveRevision?: number; district?: string;
  position?: { x: number; y: number; z: number }; drawCalls?: number; triangles?: number;
}
const finite = (n: unknown) => typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 100) / 100 : null;

/** Deliberate allowlist: never serialize sockets, storage, profiles, errors or arbitrary context. */
export class BugReportRecorder {
  public readonly timeline: DiagnosticRecorder;
  public readonly journal: BrowserJournal;
  public readonly performance: PerformanceSampler;
  constructor(build?: string, enabled = typeof __CRACKUP_DIAGNOSTICS__ === 'boolean' ? __CRACKUP_DIAGNOSTICS__ : true) {
    this.timeline = new DiagnosticRecorder('client', { clientBuild: build }, undefined, enabled);
    this.performance = new PerformanceSampler(this.timeline);
    this.journal = new BrowserJournal(this.timeline.runId, undefined, enabled);
    this.timeline.subscribe(event => this.journal.append(event));
    this.timeline.record('client.start');
  }
  private events: { kind: DiagnosticKind; at: string; category: string; frames: string[] }[] = [];
  private frameTimes: number[] = [];
  private frameStates: ActivityState[] = [];
  public record(kind: DiagnosticKind, error?: unknown): void {
    if (!this.timeline.enabled) return;
    let category = 'Unknown', frames: string[] = [];
    if (error instanceof Error) {
      category = ['Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'DOMException'].includes(error.name) ? error.name : 'Error';
      // Keep only shipped bundle locations, never messages, hosts, queries or local paths.
      frames = [...(error.stack ?? '').matchAll(/(?:https?:\/\/[^\s)]+\/)?(game\.js):(\d+):(\d+)(?=[\s)]|$)/g)]
        .slice(0, 6).map(match => `${match[1]}:${match[2]}:${match[3]}`);
    }
    this.events.push({ kind, at: new Date().toISOString(), category, frames });
    this.timeline.record('client.failure', { code: kind, ...Object.fromEntries(frames.map((frame, i) => [`frame${i}`, frame])) });
    if (this.events.length > 40) this.events.shift();
  }
  public frame(ms: number, state: ActivityState = 'active'): void {
    if (!this.timeline.enabled || !Number.isFinite(ms) || ms <= 0) return;
    this.performance.sample('frame.interval', ms, state);
    this.frameTimes.push(ms);
    this.frameStates.push(state);
    if (this.frameTimes.length > 120) { this.frameTimes.shift(); this.frameStates.shift(); }
  }
  public report(build: string, notes: string, context: ReportContext = {}) {
    const times = [...this.frameTimes].sort((a, b) => a - b);
    return {
      schemaVersion: 2, product: 'CRACKUP', build, createdAt: new Date().toISOString(),
      diagnostics: this.timeline.snapshot(),
      journal: this.journal.snapshot(),
      notes: notes.slice(0, 4000),
      session: {
        mode: ['shared', 'solo', 'campaign'].includes(context.mode ?? '') ? context.mode : null,
        connected: context.connected === true, paused: context.paused === true, saveError: context.saveError === true,
        saveRevision: finite(context.saveRevision), serverTick: finite(context.serverTick),
        district: ['NEON_DOCKS', 'FOUNDRY_SLUMS', 'HELIOS_SPIRE', 'AEGIS_CITADEL'].includes(context.district ?? '') ? context.district : null,
        position: context.position ? { x: finite(context.position.x), y: finite(context.position.y), z: finite(context.position.z) } : null,
      },
      rendering: { captureEnabled: this.timeline.enabled, drawCalls: finite(context.drawCalls), triangles: finite(context.triangles),
        intervals: this.frameTimes.map((ms,i)=>({ms:finite(ms),state:this.frameStates[i]})), maxFrameMs: times.length ? finite(times.at(-1)) : null,
        frameSamples: times.length, medianFrameMs: times.length ? finite(times[Math.floor(times.length * 0.5)]) : null,
        p95FrameMs: times.length ? finite(times[Math.min(times.length - 1, Math.ceil(times.length * 0.95) - 1)]) : null },
      events: this.events.map(event => ({ ...event, frames: [...event.frames] })),
    };
  }
}

export function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])'));
}
