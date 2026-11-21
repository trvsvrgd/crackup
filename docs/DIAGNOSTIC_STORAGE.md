# Local diagnostic storage and retrieval

P003 implements persistent capture; P004 adds session selection and recovery exports. P005 will measure stalls and logging overhead. These logs do not mean the original crash/re-entry defects are fixed.

## Where to find files

| Launch/configuration | Runtime logs |
| --- | --- |
| `Start CRACKUP.bat` / `npm run solo` | `%LOCALAPPDATA%\CRACKUP\solo\logs` on Windows by default. |
| Explicit `SOLO_DATA_DIR` | `<SOLO_DATA_DIR>\logs`, alongside that root's `campaigns.db`. |
| `npm run campaign:coop` | `<CAMPAIGN_DATA_DIR>\logs`; default `data\campaign-coop\logs`. |
| Shared server | `<DATA_DIR>\logs`; default `data\logs`. |
| Embedded/test server with explicit database path | `logs` next to the actual database file, regardless of working directory. |
| Browser, including before login | Local storage key `crackup:diagnostics:v1` for the current origin. Use **Report a problem → Download report** to retrieve the bounded journal without accessing developer tools. |

Relative configured roots retain the existing launch-time resolution policy; the writer resolves the resulting data root once and writes beneath it. The root BAT changes to the project directory. The packaged solo launcher now points to `logs` in its error instructions; a new package has not been release-qualified by this task.

For the default Windows solo folder, paste `%LOCALAPPDATA%\CRACKUP\solo\logs` into Explorer. If using an override, open that override's `logs` folder instead. A normal browser cannot directly open arbitrary native folders. No native-folder success is simulated. Exported reports download to the browser's chosen location and are never deleted by runtime retention.

| Artifact | Meaning |
| --- | --- |
| `events-<runtime UUID>-<segment>.jsonl` | Sanitized schema-v1 events; one JSON object per line. Includes admitted current-page client events in local solo. |
| `session-<runtime UUID>.json` | Session start/update time, last successfully flushed event, clean/unclean state, lost-event and write-failure counters. |
| `latest-error.json` | Reserved most recent error event. It can survive eviction of its original event segment within the retention window. |
| `bootstrap.json` | Root BAT prerequisite/install/build/runtime failure category, captured with Windows PowerShell even when Node/npm cannot start. No raw error message, environment dump or command output. |
| `.writer.lock` | Internal single-writer ownership. Do not treat it as a gameplay save or delete it while a writer may be active. |

The old root-level `launcher.log` is no longer appended. Existing legacy files and arbitrary user files are preserved; they are outside the new managed retention set. Raw console output can contain filesystem paths and is not a sanitized report. `DIAGNOSTIC_STDOUT=1` optionally mirrors structured events for terminal/debug capture; it does not replace the bounded journal.

## Retention and space protection

The installation storage boundary is its configured data root. Default runtime retention is **98,000,000 bytes**, leaving a **2,000,000-byte browser allowance** within the planned 100 MB budget for a root and its browser origin. All managed launcher/server/uploaded-client files under that root share the runtime cap; these are not separate 98 MB allocations. Segments rotate at **10,000,000 bytes**, with a **seven-day maximum age**. A file-count bound also prevents unlimited tiny sessions. Metadata and temporary replacement files have reserved capacity within the runtime budget.

Browser persistence has both a **2,000-event** cap and a conservative **2,000,000-byte UTF-16 storage** cap, including metadata, plus seven-day retention and 32 session summaries. Browser security partitions storage by origin: different ports, browser profiles, browsers, and separately configured runtime roots have independent stores. This is not a machine-wide quota across independent installations. Uploaded records count against the receiving runtime's existing budget.

Only explicitly recognized automatic journal filenames are eligible for pruning. The writer does not recurse into saves, backups, reports or unrelated files. It keeps the latest error and current session summary within reserved space. JSONL reads tolerate torn final rows and malformed entries and return a `possibleMissingTail` flag; the streaming reader bounds line size and retained events.

Age pruning runs during writes/startup and minute maintenance while the runtime/page is active. A closed installation has no background cleanup service; expired files are pruned on its next launch. Browser background timer throttling can delay its maintenance until the page is active again.

The proposed free-space reserve is **256 MiB** by default. Before writing each batch, the writer checks available space and stops log writes when they would encroach on the reserve plus queue/metadata headroom. Filesystem races and power failure cannot be eliminated by that check; actual write failures are caught as well. This adds no save migration or save-deletion policy.

Optional environment settings apply on the next runtime launch. Invalid values fall back to defaults:

| Setting | Allowed values |
| --- | --- |
| `CRACKUP_LOG_MB` | 1–98 decimal MB; can tighten the combined runtime budget. |
| `CRACKUP_LOG_FILE_MB` | 0.01–10 decimal MB; also clamped to fit the runtime budget. |
| `CRACKUP_LOG_DAYS` | 1–7 days; can shorten retention. |
| `CRACKUP_SAVE_RESERVE_MB` | 256–4096 MiB; can increase the runtime free-space reserve. |

The PowerShell bootstrap writer uses one small replaceable diagnostic file and a 256 MiB minimum reserve. It does not run continuously. Advanced direct journal constructor limits are used by tests to exercise rotation without filling the real disk.

## Failure, restart and privacy behavior

Gameplay events enter a bounded in-memory queue (512 events / 1 MB); asynchronous filesystem work runs outside save transactions. The latest error is also retained separately until it can be written. Flooding or a slow disk evicts old queued events and increments loss counters. The game does not wait for log persistence to commit a save. Log shutdown waits are bounded to at most roughly three seconds, even if filesystem work remains stuck.

Segments are flushed with `fsync` before successful upload receipts. Clean session summaries are written during orderly shutdown. A killed process leaves its prior summary unclean and its last persisted event visible. A power failure can still lose the newest tail or metadata. A clean flag describes the shutdown path; it does not prove that no earlier event was dropped. Consult counters and `possibleMissingTail` too.

The writer uses an exclusive lock per data root. A second live writer falls back to memory/status without exceeding the root's shared disk budget. On restart, a lock belonging to a dead PID is recovered. A malformed lock or a PID that has been reused is treated conservatively as unavailable storage. Preserve it and have the coding assistant inspect actual process identity before any manual cleanup; no process is killed or active lock stolen automatically. No writable log folder means no guaranteed disk record: use the report download/console fallback and the status in `/api/health` under `diagnostics.journal`.

The browser merges and bounds its origin's stored events, writes at most once per scheduled second, and attempts a final write on page hide. A storage/quota exception retains bounded memory capture and makes the fallback visible in the downloaded report. If storage is unavailable, a later reload cannot recover that memory-only tail. Concurrent tabs use best-effort localStorage merging; racing writes can lose a tail, so this is not a transactional multi-tab audit store.

After successful **local solo** authentication, the browser may upload only events from its current page lifetime over its existing socket. The server revalidates the schema, event count/bytes, component, lifetime and authenticated session; replaces client-asserted Agent/server/campaign identity; rate-limits batches; and acknowledges only after successful flushing without new loss/failure counters. Prior-page records remain in the browser for explicit report export. Hosted/shared servers do not accept this upload. Neither mechanism sends a report to a maintainer or third party.

Automatic capture excludes PINs, raw profiles, invite codes, error messages, hosts and filesystem paths. Stack context is limited to shipped `game.js:line:column` offsets. Stored/imported events are sanitized again, not trusted as executable content. User-entered report notes are included only in the explicit download and require review before sharing.

## Verification and next work

### Selected-session retrieval

Local solo exposes read-only `GET /api/diagnostics/sessions` and `GET /api/diagnostics/session/<UUID>` before login, so startup/re-entry failures remain reportable. These require loopback access, valid local Host/Origin and non-cross-site requests. Campaign/shared modes return 404. There is no path argument or save-file reader. The catalogue shows at most 20 recent runtime/startup sessions; browser history is a separate origin-local list. The absolute folder appears only in the local catalogue/UI, never in report exports. Permissions are deliberately local-operator access, not Agent ownership: anyone able to use that same local game can read sanitized diagnostics for its recent sessions.

Runtime retrieval reads at most two 10 MB segments and retains at most 512 events, plus the same session's reserved latest error within that count. Missing segments, invalid/torn rows and event trimming are reported. Only catalogue-listed IDs are readable. Concurrent retention can make a selection unavailable; it is reported honestly instead of presenting another session. HTTP reads are limited to two concurrent operations and 30 requests/minute; the UI times out after three seconds and bounds response bytes. No reports are uploaded by these endpoints.

The report preview freezes the selected diagnostics; download uses exactly that snapshot. Changes to notes or selection refresh the preview. Active runtimes and unclean/missing history have explicit warnings. Browser clipboard denial offers manual copying. Download cancellation remains controlled by the browser; no native folder or successful-save claim is fabricated. An exported file is outside automatic log rotation.

`npm run verify:journal` covers real rotation/retention, killed-child recovery from a different working directory, malformed tails, ownership contention, bounded stalled writes, log failures alongside actual saves, authenticated upload rejection, and browser journal limits/fallback. Permission and disk-full errors are deterministic filesystem-boundary injections; the host disk is not filled and its ACLs are not changed. `tests/verify-journal-browser.mjs` uses actual Chromium storage/reloads/offline mode and an explicitly injected quota exception. [P003 evidence](../artifacts/lc00-p003-durable-diagnostics.md) records what was exercised and the exact builds.

P004's session selection, previous server-session export, missing-tail presentation and copy-path behavior are recorded in [its evidence](../artifacts/lc00-p004-recovery-reports.md). P005 still must measure overhead, stalls, queues and resources. The existing >1-second frame omission and slow-connection recovery defect remain open.
