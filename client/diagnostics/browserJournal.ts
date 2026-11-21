import { isDiagnosticId, newDiagnosticId, sanitizeDiagnosticEvent, type DiagnosticEvent } from '../../shared/diagnostics/events.js';

export const BROWSER_JOURNAL_KEY = 'crackup:diagnostics:v1';
const MAX_BYTES = 2_000_000, MAX_EVENTS = 2000, RETENTION = 7 * 86400_000;
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
interface Session { runId: string; updatedAt: string; clean: boolean; lastPersistedSequence: number; }
export class BrowserJournal {
  private events: DiagnosticEvent[] = [];
  private eventBytes = 0;
  private sessions: Session[] = [];
  private dirty = true;
  private storageState = 'pending';
  private dropped = 0;
  private malformed = 0;
  private readonly startedAt = new Date().toISOString();
  private closed = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private maintenance: ReturnType<typeof setInterval> | null = null;
  private transport: ((batch: { id: string; events: DiagnosticEvent[] }) => boolean) | null = null;
  private upload: { id: string; events: DiagnosticEvent[]; sentAt: number } | null = null;
  private acceptedSequence = 0;
  private lastUploadAt = 0;
  constructor(readonly runId: string, private readonly storage: () => StorageLike | undefined = () => globalThis.localStorage, enabled = true) {
    if (!enabled) { this.closed = true; this.storageState = 'disabled'; return; }
    this.mergeStored();
    this.sessions.push({ runId, updatedAt: this.startedAt, clean: false, lastPersistedSequence: 0 });
    this.trim(); this.persist();
    this.maintenance = setInterval(() => { this.dirty = true; this.persist(); }, 60_000);
    this.maintenance.unref?.(); // Node-only unit harness; a browser timer has no unref method.
  }
  private mergeStored() {
    try {
      const text = this.storage()?.getItem(BROWSER_JOURNAL_KEY); if (!text) return;
      if (text.length * 2 > MAX_BYTES) { this.malformed++; return; }
      const data = JSON.parse(text);
      if (data.schemaVersion !== 1 || !Array.isArray(data.events) || !Array.isArray(data.sessions)) { this.malformed++; return; }
      const byId = new Map(this.events.map(event => [`${event.context.runId}:${event.sequence}`, event]));
      for (const raw of data.events.slice(-MAX_EVENTS)) {
        const event = sanitizeDiagnosticEvent(raw);
        if (!event || event.component !== 'client') { this.malformed++; continue; }
        byId.set(`${event.context.runId}:${event.sequence}`, event);
      }
      this.events = [...byId.values()].sort((a, b) => a.at.localeCompare(b.at) || a.sequence - b.sequence);
      this.eventBytes = this.events.reduce((sum, event) => sum + this.size(event), 0);
      const sessions = new Map(this.sessions.map(session => [session.runId, session]));
      for (const s of data.sessions.slice(-32)) if (s && isDiagnosticId(s.runId) && s.runId !== this.runId &&
        typeof s.updatedAt === 'string' && s.updatedAt.length === 24 && Number.isFinite(Date.parse(s.updatedAt)) &&
        typeof s.clean === 'boolean' && Number.isSafeInteger(s.lastPersistedSequence) && s.lastPersistedSequence >= 0)
        sessions.set(s.runId, { runId: s.runId, updatedAt: s.updatedAt, clean: s.clean, lastPersistedSequence: s.lastPersistedSequence });
      this.sessions = [...sessions.values()];
    } catch { this.storageState = 'unavailable-or-corrupt'; this.malformed++; }
  }
  append(input: DiagnosticEvent) {
    if (this.closed) return;
    const event = sanitizeDiagnosticEvent(input); if (!event || event.component !== 'client' || event.context.runId !== this.runId) return;
    this.events.push(event); this.eventBytes += this.size(event); this.dirty = true; this.trim(false); this.schedule();
  }
  private size(event: DiagnosticEvent) { return (JSON.stringify(event).length + 1) * 2; }
  private trim(expire = true) {
    if (expire) {
      const cutoff = Date.now() - RETENTION;
      this.events = this.events.filter(e => Date.parse(e.at) >= cutoff);
      this.eventBytes = this.events.reduce((sum, event) => sum + this.size(event), 0);
      this.sessions = this.sessions.filter(s => Date.parse(s.updatedAt) >= cutoff).slice(-32);
    }
    // Reserve metadata space; do not stringify the entire journal for every gameplay event.
    while (this.events.length && (this.events.length > MAX_EVENTS || this.eventBytes > MAX_BYTES - 16384)) {
      this.eventBytes -= this.size(this.events.shift()!); this.dropped++;
    }
  }
  private data() { return { schemaVersion: 1, events: this.events, sessions: this.sessions }; }
  private schedule() {
    if (this.timer || this.closed) return;
    this.timer = setTimeout(() => { this.timer = null; this.persist(); this.send(); if (this.transport) this.schedule(); }, 1000);
  }
  persist(clean = false): boolean {
    if (!this.dirty && !clean) return this.storageState === 'available';
    try {
      this.mergeStored();
      this.trim();
      const data = structuredClone(this.data());
      const own = data.sessions.find(s => s.runId === this.runId);
      if (own) { own.updatedAt = new Date().toISOString(); own.clean = clean;
        own.lastPersistedSequence = this.events.reduce((max, e) => e.context.runId === this.runId ? Math.max(max, e.sequence) : max, 0); }
      const storage = this.storage(); if (!storage) throw Error();
      // Allow for metadata growth without exceeding the physical UTF-16 storage budget.
      while (data.events.length && JSON.stringify(data).length * 2 > MAX_BYTES) { data.events.shift(); this.dropped++; }
      storage.setItem(BROWSER_JOURNAL_KEY, JSON.stringify(data));
      this.events = data.events; this.sessions = data.sessions;
      this.eventBytes = this.events.reduce((sum, event) => sum + this.size(event), 0);
      this.storageState = 'available'; this.dirty = false; return true;
    } catch { this.storageState = 'unavailable-or-quota'; return false; }
  }
  snapshot() {
    return { storageState: this.storageState, dropped: this.dropped, malformed: this.malformed,
      possibleMissingTail: this.storageState !== 'available' || this.dirty || this.sessions.some(s => !s.clean && s.runId !== this.runId),
      ...structuredClone(this.data()) };
  }
  setTransport(send: ((batch: { id: string; events: DiagnosticEvent[] }) => boolean) | null) {
    this.transport = send; this.upload = null; this.acceptedSequence = 0;
    if (send) this.schedule();
  }
  acknowledge(id: string, durable: boolean) {
    if (this.upload?.id !== id) return;
    if (durable) this.acceptedSequence = this.upload.events.at(-1)?.sequence ?? this.acceptedSequence;
    this.upload = null;
  }
  private send() {
    if (!this.transport || Date.now() - this.lastUploadAt < 2000) return;
    if (this.upload && Date.now() - this.upload.sentAt < 5000) return;
    const events: DiagnosticEvent[] = [];
    for (const event of this.events.filter(e => e.context.runId === this.runId && e.sequence > this.acceptedSequence).sort((a, b) => a.sequence - b.sequence)) {
      if (events.length === 16 || JSON.stringify([...events, event]).length > 12000) break;
      events.push(event);
    }
    if (!events.length) return;
    const batch = { id: newDiagnosticId(), events, sentAt: Date.now() };
    if (this.transport(batch)) { this.upload = batch; this.lastUploadAt = Date.now(); }
  }
  close(clean = true) { this.persist(clean); this.closed = true; if (this.timer) clearTimeout(this.timer); if (this.maintenance) clearInterval(this.maintenance); this.timer = null; this.transport = null; }
}
