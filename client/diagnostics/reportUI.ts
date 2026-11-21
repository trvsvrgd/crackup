import { BugReportRecorder, type DiagnosticKind, type ReportContext } from './bugReport.js';
import { buildSelectedReport, type ReportSelection } from './reportExport.js';
import { safeReportDetail, safeReportSession, type ReportSessionDetail } from '../../shared/diagnostics/reportSessions.js';
import { PerformanceClock, type ActivityState } from '../../shared/diagnostics/performance.js';

declare const __CRACKUP_BUILD__: string;

/** Local export only. Installed before the 3D engine starts so startup failures remain reportable. */
export class ReportUI {
  public readonly recorder = new BugReportRecorder(typeof __CRACKUP_BUILD__ === 'string' ? __CRACKUP_BUILD__ : undefined);
  public onBlockingChanged: (() => void) | null = null;
  public context: () => ReportContext = () => ({});
  public failed = false;
  public resources: () => void = () => {};
  public activityState(): ActivityState {
    if (document.hidden || !document.hasFocus()) return 'background';
    if (this.failed) return 'failed';
    if (!document.getElementById('auth-overlay')?.hidden) return 'menu';
    return this.isOpen || this.context().paused ? 'paused' : 'active';
  }
  private readonly dialog = document.getElementById('bug-report') as HTMLDialogElement;
  private readonly preview = document.getElementById('bug-report-preview') as HTMLTextAreaElement;
  private readonly notes = document.getElementById('bug-report-notes') as HTMLTextAreaElement;
  private readonly expected = document.getElementById('bug-report-expected') as HTMLTextAreaElement;
  private readonly actual = document.getElementById('bug-report-actual') as HTMLTextAreaElement;
  private readonly sessions = document.getElementById('bug-report-session') as HTMLSelectElement;
  private readonly download = document.getElementById('bug-report-download') as HTMLButtonElement;
  private readonly history = document.getElementById('bug-report-history')!;
  private readonly folder = document.getElementById('bug-report-folder') as HTMLInputElement;
  private readonly copyFolder = document.getElementById('bug-report-copy-folder') as HTMLButtonElement;
  private selection: ReportSelection = { kind: 'browser', id: this.recorder.timeline.runId };
  private runtime: ReportSessionDetail | null = null;
  private unavailable = false;
  private catalogueRequest: AbortController | null = null;
  private detailRequest: AbortController | null = null;
  private generation = 0;
  private opener: HTMLElement | null = null;
  public get isOpen(): boolean { return this.dialog.open; }
  public get blocksInput(): boolean { return this.failed || this.isOpen; }
  constructor() {
    const clock = new PerformanceClock(this.recorder.timeline, this.recorder.performance, () => this.activityState(), () => this.resources());
    clock.start();
    window.addEventListener('pagehide', () => clock.stop());
    window.addEventListener('pageshow', () => clock.start());
    for (const name of ['visibilitychange','focus','blur']) window.addEventListener(name, () => clock.markTransition());
    document.querySelectorAll<HTMLButtonElement>('[data-bug-report]').forEach(button => {
      button.onclick = () => {
        this.opener = button;
        this.selection = { kind: 'browser', id: this.recorder.timeline.runId }; this.runtime = null; this.unavailable = false;
        this.populateBrowserSessions();
        this.download.disabled = false;
        this.refresh();
        this.dialog.showModal();
        document.exitPointerLock?.();
        this.onBlockingChanged?.();
        this.notes.focus();
        void this.loadCatalogue();
      };
    });
    document.getElementById('bug-report-close')!.onclick = () => this.dialog.close();
    this.dialog.addEventListener('close', () => {
      this.generation++; this.catalogueRequest?.abort(); this.detailRequest?.abort();
      this.onBlockingChanged?.(); this.opener?.focus();
    });
    for (const input of [this.notes, this.expected, this.actual]) input.addEventListener('input', () => this.refresh());
    this.sessions.addEventListener('change', () => void this.selectSession());
    this.copyFolder.onclick = async () => {
      const status = document.getElementById('bug-report-folder-status')!;
      try { await navigator.clipboard.writeText(this.folder.value); status.textContent = 'Folder path copied. Paste it into your file manager.'; }
      catch { this.folder.focus(); this.folder.select(); status.textContent = 'Clipboard access is unavailable. The path is selected for manual copying.'; }
    };
    this.download.onclick = () => {
      if (this.download.disabled) return;
      // Download exactly the frozen diagnostic snapshot the player has reviewed.
      const url = URL.createObjectURL(new Blob([this.preview.value], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url; link.download = `crackup-bug-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      document.getElementById('bug-report-status')!.textContent = 'Report download requested. Attach the file when reporting the issue; nothing was sent to the maintainer.';
    };
    document.getElementById('runtime-reload')!.onclick = () => window.location.reload();
    window.addEventListener('error', event => this.recorder.record('runtime-error', event.error));
    window.addEventListener('unhandledrejection', event => this.recorder.record('unhandled-rejection', event.reason));
    window.addEventListener('pagehide', event => this.recorder.journal.persist(!event.persisted && !this.failed));
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.recorder.journal.persist(); });
  }
  private populateBrowserSessions(): void {
    this.sessions.replaceChildren();
    this.sessions.add(new Option('This browser page', `browser:${this.recorder.timeline.runId}`));
    for (const session of [...this.recorder.journal.snapshot().sessions].reverse().slice(0, 20)) {
      if (session.runId === this.recorder.timeline.runId) continue;
      this.sessions.add(new Option(`Earlier browser — ${new Date(session.updatedAt).toLocaleString()}${session.clean ? '' : ' — ending uncertain'}`, `browser:${session.runId}`));
    }
    this.folder.value = 'Local folder unavailable'; this.copyFolder.disabled = true;
    document.getElementById('bug-report-folder-status')!.textContent = '';
    this.history.textContent = 'Loading local game sessions… Browser reports remain available.';
  }
  private async fetchJSON(url: string, controller: AbortController, maximum: number): Promise<any> {
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      const response = await fetch(url, { signal: controller.signal, credentials: 'omit', cache: 'no-store' });
      if (!response.ok) throw Error('Unavailable');
      const reader = response.body?.getReader(); if (!reader) throw Error('Unavailable');
      const decoder = new TextDecoder(); let text = '', bytes = 0;
      try {
        while (true) {
          const chunk = await reader.read(); if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > maximum) { controller.abort(); throw Error('Too large'); }
          text += decoder.decode(chunk.value, { stream: true });
        }
        text += decoder.decode(); return JSON.parse(text);
      } finally { reader.releaseLock(); }
    } finally { clearTimeout(timeout); }
  }
  private async loadCatalogue(): Promise<void> {
    this.catalogueRequest?.abort(); const request = this.catalogueRequest = new AbortController();
    try {
      const data = await this.fetchJSON('/api/diagnostics/sessions', request, 65536);
      if (!this.dialog.open || this.catalogueRequest !== request || request.signal.aborted) return;
      if (!Array.isArray(data.sessions)) throw Error('Unavailable');
      for (const raw of data.sessions.slice(0, 20)) {
        const session = safeReportSession(raw); if (!session) continue;
        this.sessions.add(new Option(`${session.kind === 'bootstrap' ? 'Startup failure' : session.active ? 'Local game (running)' : 'Earlier local game'} — ${new Date(session.startedAt).toLocaleString()}${!session.active && !session.clean ? ' — ending uncertain' : ''}`, `${session.kind}:${session.id}`));
      }
      if (typeof data.localFolder === 'string' && data.localFolder.length <= 4096 && !/[\r\n\0]/.test(data.localFolder)) {
        this.folder.value = data.localFolder; this.copyFolder.disabled = false;
      }
      this.history.textContent = data.unavailableEntries || data.omittedSessions
        ? 'Some local sessions are unavailable or outside the recent-session list. Browser history is listed separately.'
        : 'Choose this page, an earlier browser page, or a local game session.';
    } catch {
      if (this.dialog.open && this.catalogueRequest === request) this.history.textContent = 'Local game history is unavailable. Browser history can still be exported. Hosted logs remain with the server operator.';
    }
  }
  private async selectSession(): Promise<void> {
    this.detailRequest?.abort(); const generation = ++this.generation;
    const [kind, id] = this.sessions.value.split(':');
    if (!['browser', 'runtime', 'bootstrap'].includes(kind)) return;
    this.selection = { kind: kind as ReportSelection['kind'], id }; this.runtime = null; this.unavailable = false;
    if (kind === 'browser') { this.download.disabled = false; this.refresh(); return; }
    this.download.disabled = true; this.refresh();
    document.getElementById('bug-report-status')!.textContent = 'Loading the selected local session…';
    const request = this.detailRequest = new AbortController();
    try {
      const data = await this.fetchJSON(`/api/diagnostics/session/${encodeURIComponent(id)}`, request, 2_000_000);
      if (generation !== this.generation || !this.dialog.open) return;
      const detail = safeReportDetail(data); if (!detail || detail.session.id !== id) throw Error('Unavailable');
      this.runtime = detail;
    } catch {
      if (generation !== this.generation || !this.dialog.open) return;
      this.unavailable = true;
    }
    if (generation === this.generation && this.dialog.open) { this.download.disabled = false; this.refresh(); }
  }
  private refresh(): void {
    const base = this.recorder.report(
      typeof __CRACKUP_BUILD__ === 'string' ? __CRACKUP_BUILD__ : 'development', this.notes.value, this.context(),
    );
    const report = buildSelectedReport(base, this.selection, { steps: this.notes.value, expected: this.expected.value, actual: this.actual.value }, this.runtime, this.unavailable);
    this.preview.value = JSON.stringify(report, null, 2);
    const last = report.lastGoodSave;
    const warnings = report.completeness.warnings;
    const explanations: string[] = [];
    if (warnings.includes('capture-disabled')) explanations.push('Diagnostic capture is disabled in this comparison build.');
    if (warnings.includes('selected-runtime-unavailable')) explanations.push('The selected local session could not be read; its runtime events are missing.');
    if (warnings.includes('previous-browser-session-not-confirmed-clean') || warnings.includes('runtime-not-confirmed-clean')) explanations.push('That session ended without a confirmed clean shutdown. Its final events may be missing.');
    if (warnings.includes('browser-storage-unavailable')) explanations.push('Browser storage is unavailable; only retained memory can be exported.');
    if (warnings.includes('events-rate-suppressed') || warnings.includes('event-sink-failures')) explanations.push('Some diagnostic events were suppressed or could not be recorded.');
    if (warnings.some(w => /evicted|malformed|truncated|limit/.test(w))) explanations.push('Some older or damaged events are omitted; the preview lists the known gaps.');
    if (warnings.includes('runtime-still-running') || warnings.includes('browser-persistence-may-lag')) explanations.push('This session is still being recorded. New events after the preview are not included.');
    if (!explanations.length && report.completeness.possibleMissingTail) explanations.push('Storage errors may have left gaps in the captured events.');
    document.getElementById('bug-report-completeness')!.textContent =
      `${last ? `Last recorded successful save: revision ${last.revision}. ` : 'No successful save revision is recorded in this capture. '}` +
      (explanations.length ? explanations.join(' ') : 'No capture gaps were detected. Events after this preview are not included.');
    document.getElementById('bug-report-status')!.textContent = '';
  }
  public fail(kind: Extract<DiagnosticKind, 'startup-failed' | 'graphics-lost' | 'runtime-error'>, error?: unknown): void {
    this.recorder.record(kind, error);
    this.failed = true;
    (document.getElementById('deploy-button') as HTMLButtonElement).disabled = true;
    document.getElementById('runtime-recovery')!.hidden = false;
    document.getElementById('runtime-recovery-message')!.textContent = kind === 'graphics-lost'
      ? 'The graphics connection was lost. Download a report, then reload to reconnect. Offline solo is paused; co-op continues.'
      : 'The game could not continue. Download a report, then reload. You will resume from your last saved checkpoint.';
    document.exitPointerLock?.();
    this.onBlockingChanged?.();
  }
}
