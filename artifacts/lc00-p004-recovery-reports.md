# LC00 / P004 — Selected-session recovery reports

Status: **Technically verified**. LC00 acceptance, spontaneous-crash attribution and later reliability fixes remain open. This package implements LC-OBS-04; it does not complete the whole living-city program.

Work began November 20, 2026 at 19:36 UTC (13:36 America/Chicago); approximately 22 active minutes through final evidence/handoff. The earlier P003 work and intervening idle interval are separate.

## Delivered behavior and decisions

Report a problem now selects this browser page, earlier browser pages, recent local runtime sessions and captured launcher failures. It works before login, from the paused field menu and from startup/graphics recovery. Separate steps, expected and actual fields feed a frozen, previewed local download. Closing/cancelling restores focus; keyboard/controller dismissal leaves the paused field menu intact. An export requests a browser download and never claims it was saved, uploaded or sent to a maintainer.

Exports use schema v3 and retain at most 512 correlated events / 2 MB pretty-printed JSON. They prioritize the latest available error/commit, show the last recorded successful revision and expose unclean endings, missing tails, malformed/trimmed events, persistence and suppression gaps. Current-page state and rendering metrics cannot masquerade as a prior session. A commit is recorded evidence, not a fresh integrity check. If runtime history is unavailable, independently retained browser events matching that server lifetime remain useful and explicitly attributed.

Runtime retrieval is read-only and local-solo-only, including before authentication. Host/Origin/loopback/cross-site checks, UUID-only catalogue admission, bounded file/response reads, concurrency and request limits keep this separate from gameplay persistence. Hosted/shared logs remain operator-owned. Copy folder path is available for local solo; denied clipboard access selects the path for manual copying. Neither the current browser nor browser-based package has a native folder bridge. Local paths are excluded from exported JSON.

Offline solo, no spending, personal saves, existing mechanics and campaign ownership are preserved. No deployment, commit, new service, animation pack, city content or orb tuning was part of this package.

## Build and changed paths

- Client: `client-ddb95d151b5656d0`; server: `server-897b1f553c786474`; content: `content-3278076a2d790a71`.
- [Final source/runtime manifest](evidence/living-city/lc00-p004-baseline.json): 213 files, fingerprint `e0ee8f9bd3388644facb12b98dfbd1240100c9e982b331736fb4f39d2e9b1af2`; base commit `1d107a661a0ac070130194ae45890dd8bc721d07`. Extensive pre-existing dirty worktree preserved. [Before manifest](evidence/living-city/lc00-p004-before.json) distinguishes this package's source changes.
- Implementation: `server/diagnosticReports.ts`, HTTP routing in `server/gameServer.ts`, truncation accounting in `server/diagnosticJournal.ts`, `shared/diagnostics/reportSessions.ts`, `client/diagnostics/reportExport.ts`, `client/diagnostics/reportUI.ts`, `public/index.html` and report styles.
- Verification: `tests/verify-report-export.ts`, two report browser scripts, `verify:reports` package script, and a `JOURNAL_REPORT` output override to preserve historical P003 evidence during revalidation.
- Guides: [bug reporting](../docs/BUG_REPORTING.md), [storage/retrieval](../docs/DIAGNOSTIC_STORAGE.md), [schema](../docs/DIAGNOSTIC_EVENT_SCHEMA.md), ledger and durable cursor.

## Verification evidence

| Check | Actual result and evidence |
| --- | --- |
| Focused file/export/HTTP tests | Four scenario groups passed: large/torn history, bounded Unicode/free text, privacy and suppression, unavailable/malformed storage, bootstrap failure, and actual pre-login solo versus hosted/shared access restrictions. [Result](evidence/living-city/lc00-p004-export.json), [command log](evidence/living-city/lc00-p004-export.log). Large/corrupt/bootstrap data are explicitly synthetic fixtures. |
| Final normal-control browser journey | 16 checks passed on the final client: main menu, field menu, controller/keyboard focus, authoritative pause/input blocking, actual save acknowledgement, exact preview/download, cancellation messaging, clipboard and unavailable-history fixtures, actual WebGL context loss, previous-page export and injected startup failure. [Result](evidence/living-city/lc00-p004-browser.json). |
| Forced runtime restart | Real root BAT with isolated data and port 33522; identity-verified runtime `6f91c143-df49-410b-a730-d1ef7b893776` force-stopped only after actual save/leave and zero agents. Restart selected that lifetime before login, exported its actual commit revision 26 and 458 correlated events, and disclosed unclean tail/suppression. Seven checks also cover late-response cancellation and a selected log becoming inaccessible. [Stop identity](evidence/living-city/lc00-p004-runtime-stop.json), [result](evidence/living-city/lc00-p004-restart-browser.json). |
| Durable journal regressions | All nine groups passed, including genuine killed-child restart, rotation, save isolation and upload boundary checks. Filesystem EACCES/ENOSPC remain labeled injections. [Result](evidence/living-city/lc00-p004-journal.json). |
| Existing regressions | Diagnostics, quality, controller, all 12 solo and eight campaign/co-op groups passed. [Diagnostics](evidence/living-city/lc00-p004-diagnostics.log), [quality](evidence/living-city/lc00-p004-final-quality.log), [controller](evidence/living-city/lc00-p004-controller.log), [solo](evidence/living-city/lc00-p004-solo.log), [co-op](evidence/living-city/lc00-p004-campaign.log). |
| Build / repository checks | Build passed with final client ID; progress check passed with 10 checkpoints / 122 saved evidence files; scoped diff whitespace check passed. [Build](evidence/living-city/lc00-p004-build.log), [progress](evidence/living-city/lc00-p004-progress.log). |
| Visual review | Previous-browser and previous-runtime report screenshots inspected for readable selection, gap explanation, fields, preview and actions. [Browser report](evidence/living-city/lc00-p004-previous-report.png), [runtime report](evidence/living-city/lc00-p004-previous-runtime.png). |

Host recorded in the manifest: Windows 10.0.26300, Node 22.16.0, i7-10700K, 64 GiB RAM. Browser controls were driven through Playwright CLI. The standard Gamepad API was simulated; no physical controller pairing, human experience approval or RTX 4070/16 GB qualification is claimed. Packaged-native UI was not separately built: current packaging opens the same browser implementation and deliberately exposes no native bridge.

Raw saves, runtime logs and downloaded reports stay in ignored `output/solo/lc00-p004-browser` and `output/playwright/lc00-p004-*`. Selected sanitized reports are embedded in the linked evidence. Test-only processes were checked by PID, creation time, command and runtime identity before cleanup; personal game processes were not stopped.

## Failed attempts and practical limits

The first browser test incorrectly required movement packets during authoritative pause; zero packets is valid, so the check now also requires the active connected/paused state and rejects any nonneutral packet. The second tried the graphics fault before Save & return's real page reload finished; it now waits for the new engine. Both original logs are retained as `lc00-p004-browser-attempt1.log` / `attempt2.log`.

A fixed 220 ms simulated B tap was missed during a parallel regression run. A focused 500 ms repeat closed the dialog; the final test keeps focus and waits eight actual animation frames for each input state. The failed attempt remains `lc00-p004-browser-short-tap.log`. This does not resolve general stall/input responsiveness; P005 must instrument it. No product input routing was weakened to pass this test.

The restart harness initially asserted that missing runtime logs must also erase independently retained browser save evidence. That assertion was corrected to require only correlated client evidence with explicit runtime-unavailable status. Its failed route fixture persisted into the next attempt; the harness now clears its own routes in setup/finally. Both failures remain `lc00-p004-restart-attempt1.log` / `attempt2.log`.

Browser-controlled download cancellation cannot be reliably detected by game code; only the request is acknowledged. Retention, a hard power loss, origin/profile changes and unavailable storage can still remove history. Historical suppression totals may be unknown; retained per-event counts are lower bounds. Startup and graphics faults were controlled injections/API calls, not a reproduction of the owner's spontaneous crash. The earlier slow-connection recovery defect LC-BUG-007 remains open.

## Next exact work

**P005 / LC-OBS-05:** retain >1-second frame intervals; label pause/background periods; instrument render/simulation/save/asset/event-loop work, queues and bounded resources. Demonstrate an induced 500 ms stall, compare equivalent logging-enabled/disabled runs, and investigate LC-BUG-007 queue growth using evidence. Do not remove backpressure guards speculatively. P006 triage/interruption drills and LC00 acceptance follow P005; later save/re-entry, world, animation, 1,000-orb and audio phases remain pending.
