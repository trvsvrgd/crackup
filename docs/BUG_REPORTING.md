# Reporting and investigating bugs

Select **Report a problem** on the deployment screen, field menu, recovery screen or agent-down screen. Choose **Session to report**: this browser page, an earlier browser page, a recent local game session, or a captured startup failure. Describe steps, expected result and actual result in their separate fields. Review the JSON preview and capture-gap message, select **Download report**, then attach the file when reporting the issue to the project maintainer. Downloading does not create an issue or transmit a report. The browser controls the destination and cancellation; the game says only that a download was requested.

After a crash, reopen the game through the same launcher/data root and browser origin. Select the earlier session by its timestamp; an uncertain ending is marked. The selected report does not substitute current-page position, pause state or rendering statistics for an earlier session. **Last recorded successful save** means a commit event retained in that capture, not a database integrity check or a guarantee that it is the newest save. Missing events are disclosed; no recorded commit means the revision is unknown.

Expand **Find local game logs** to copy the local solo folder path. If clipboard permission is denied, the path is selected for manual copying into File Explorer. Both the normal browser and current packaged browser launcher lack a native folder-open bridge. Hosted/shared logs remain with the server operator. If runtime history cannot be read, browser reports are still available; export memory-only reports before reloading. Folder paths are shown locally and excluded from the report.

Offline solo pauses while the report is open. Closing a report opened from the field menu leaves that menu open; Return to city resumes play. Shared and co-op worlds continue. After a startup, render-loop or graphics-context failure, export a report and select Reload game. Reload returns to deployment and the last saved checkpoint; it does not recover unsaved state.

## Included diagnostics

- Content-derived client build identity and export time.
- A schema-v1 correlated event timeline inside the schema-v3 export: client/server/content IDs, opaque connection/Agent/campaign references, save-attempt IDs and categorized connection failures. See the [event contract](DIAGNOSTIC_EVENT_SCHEMA.md) for identity scope and privacy rules. Selected runtime events are joined to retained browser events bearing that server lifetime ID.
- Selected-session identity, clean/uncertain ending, last persisted metadata, omitted/damaged-event counters, last recorded successful commit and any later recorded save failure. Exports contain at most 512 correlated events and 2 MB of pretty-printed JSON. The most recent retained error and commit are prioritized when trimming.
- For the current browser page only: session mode, connection, pause/save-error flags, save revision, server tick, district and rounded position. Earlier captures have null current-state/rendering fields.
- Full-frame draw calls/triangles and up to 120 raw frame intervals with active/paused/background/transition labels, including intervals over one second; median/p95/max are diagnostic samples, not hardware performance qualification. Bounded timing, resource and queue events are described in [performance diagnostics](PERFORMANCE_DIAGNOSTICS.md).
- Up to 40 recent errors/context events with category and up to six `game.js` line/column locations. Error messages, arbitrary rejection values and full stacks are deliberately excluded.

Automatic capture does not record callsigns, PINs, session codes, saved profiles or page URLs. It reads/writes only its own bounded diagnostic journal in browser storage. Free-text steps are limited to 4,000 characters and expected/actual fields to 2,000 each: review them for personal information. Reports include only the selected session and correlated retained events. Storage failure falls back to memory; export before reloading in that case. See [local diagnostic locations and retention](DIAGNOSTIC_STORAGE.md).

## Triage

Record a short title, impact (crash/save loss/blocker/visual issue), reproducibility, steps, expected/actual result, client build ID and attached report. Ask for the browser/OS and a screenshot if needed. Use an isolated test profile to reproduce save-related issues. Preserve the matching deployed `game.js` and its source map when retaining a release build; reports intentionally contain generated bundle locations rather than private filesystem paths. The build ID identifies client source/assets configuration, not the server release or GPU.

## Verification

`npm run verify:quality` checks bounded capture, exclusion of automatic secrets, report isolation, frame statistics, continuous walking cadence, invalid delta recovery and 60/120 Hz equivalence. It is also part of `npm run verify`. `verify:alpha` covers expiration of held aim/sprint/grapple/jetpack after 250 ms without fresh input.

`npm run verify:diagnostics` checks correlated schema and actual socket/SQLite/launcher boundaries. `npm run verify:journal` checks persistence, retention, restart/failure handling and upload admission. `npm run verify:reports` checks selected-session exports, bounded/torn files, privacy and local HTTP access restrictions. Runtime files are under `logs` in the actual configured data root; default Windows solo is `%LOCALAPPDATA%\CRACKUP\solo\logs`. Raw console logs can contain local paths; share the sanitized report/event trace.

`tests/verify-report-browser.mjs` exercises report surfaces, downloads, earlier graphics-failure export, clipboard/storage failure fallback, keyboard focus and simulated controller controls through Playwright CLI against isolated solo. It labels injected faults; it does not prove physical controller pairing or explain spontaneous crashes. [P004 evidence](../artifacts/lc00-p004-recovery-reports.md) records actual outcomes and remaining work.

For browser checks, start an isolated solo server with `SOLO_DATA_DIR` pointing to a test directory and `SOLO_PORT` set to an unused port, then run `npm run solo -- --no-browser`. Open that URL with Playwright CLI and run `run-code --filename tests/verify-quality-browser.mjs`. The script creates the synthetic QUALITYQA profile, downloads a report, checks focus and solo pause/resume, loses the actual WebGL context and injects a startup failure in a separate page. Screenshots/downloads go to ignored `output/playwright/`. Do not run this against a personal campaign database.
