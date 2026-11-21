import { DiagnosticRecorder } from './events.js';

export const PERFORMANCE_METRICS = ['frame.interval', 'render.work', 'simulation.work', 'simulation.interval', 'eventloop.delay',
  'save.serialize', 'save.commit', 'asset.load', 'network.decode', 'network.encode'] as const;
export type PerformanceMetric = typeof PERFORMANCE_METRICS[number];
export type ActivityState = 'active' | 'paused' | 'background' | 'menu' | 'transition' | 'failed' | 'mixed';
type Sample = { ms: number; state: ActivityState };
type Bucket = { samples: Sample[]; count: number; total: number; maximum: number; state: ActivityState };

/** Fixed metric set, 120 retained samples per metric. Raw stalls are persisted immediately, not averaged away. */
export class PerformanceSampler {
  private readonly buckets = new Map<PerformanceMetric, Bucket>();
  constructor(private readonly recorder: DiagnosticRecorder) {}
  measure<T>(metric: PerformanceMetric, work: () => T, state: ActivityState = 'active'): T {
    if (!this.recorder.enabled) return work();
    const started = performance.now();
    try { return work(); } finally { this.sample(metric, performance.now()-started, state); }
  }
  sample(metric: PerformanceMetric, ms: number, state: ActivityState = 'active') {
    if (!this.recorder.enabled || !PERFORMANCE_METRICS.includes(metric) || !Number.isFinite(ms) || ms < 0) return;
    let b = this.buckets.get(metric);
    if (!b) { b = { samples: [], count: 0, total: 0, maximum: 0, state }; this.buckets.set(metric, b); }
    b.count++; b.total += ms; b.maximum = Math.max(b.maximum, ms); if (state !== b.state) b.state = 'mixed';
    b.samples.push({ms, state}); if (b.samples.length > 120) b.samples.shift();
    if (ms >= 100) this.recorder.record('performance.stall', { metric, durationMs: ms, state });
  }
  snapshot() {
    return [...this.buckets].map(([metric, b]) => {
      const sorted = b.samples.map(s => s.ms).sort((a,b)=>a-b);
      return { metric, state: b.state, sampleCount: b.count, retainedSamples: sorted.length,
        truncatedSamples: b.count - sorted.length, meanMs: b.total / b.count, durationMs: b.maximum,
        p50Ms: sorted[Math.floor(sorted.length * .5)], p95Ms: sorted[Math.min(sorted.length-1, Math.ceil(sorted.length*.95)-1)] };
    });
  }
  flush() { for (const summary of this.snapshot()) this.recorder.record('performance.sample', summary); this.buckets.clear(); }
}

/** In-process liveness only: detects a late callback after recovery, cannot diagnose a dead process. */
export class PerformanceClock {
  private timer: ReturnType<typeof setInterval> | null = null;
  private transition = false;
  markTransition() { this.transition = true; }
  constructor(private readonly recorder: DiagnosticRecorder, private readonly sampler: PerformanceSampler,
    private readonly state: () => ActivityState, private readonly resources: () => void) {}
  start() {
    if (this.timer || !this.recorder.enabled) return;
    let last = performance.now(), emitted = last, previous = this.state();
    this.timer = setInterval(() => {
      const now = performance.now(), state = this.state();
      this.sampler.sample('eventloop.delay', Math.max(0, now-last-250), state === previous && !this.transition ? state : 'transition');
      this.transition = false;
      if (previous !== state) this.recorder.record('performance.lifecycle', { state });
      last = now; previous = state;
      if (now-emitted >= 2000) {
        this.sampler.flush(); this.resources();
        this.recorder.record('performance.heartbeat', { state, durationMs: now-emitted }); emitted = now;
      }
    }, 250);
    this.timer.unref?.();
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; this.sampler.flush(); }
}
