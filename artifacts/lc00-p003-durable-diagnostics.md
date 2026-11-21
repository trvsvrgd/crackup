# P003 — Durable diagnostic journals

Scope: LC-OBS-03, **technically verified**. Implementation, fault/retention checks and final browser/restart evidence passed. LC00 remains open until P004–P006 pass. This work does not fix or close the original gameplay crash/re-entry complaints.

## Delivered

- `server/diagnosticJournal.ts`: asynchronous JSONL writer, bounded queue, rotation/retention, reserved latest-error/session metadata, free-space reserve, flush receipts, single-writer ownership and bounded shutdown waits. Streaming reads tolerate malformed lines and torn tails.
- `shared/diagnostics/events.ts`: allowlisted revalidation for stored/uploaded events, safe bundle offsets and journal lifecycle/loss fields. Writer lifecycle uses its own `journal` component so sequence numbers cannot collide with launcher events.
- `server/diagnostics.ts`, `gameServer.ts`, `solo.ts`, `campaign.ts`, `index.ts`: all runtime modes use the actual configured data root. Local solo admits only bounded, authenticated current-page uploads. Save transactions do not await logs.
- `client/diagnostics/browserJournal.ts`, recorder/UI/netcode integration: bounded persistent history before login and across reload, memory fallback on storage failure, safe local upload, reviewed download containing retained history, and maintenance while active. Avoids serializing the whole journal on every event.
- Root BAT plus `scripts/log-launcher-failure.ps1`: dependency/build/runtime failures leave a small categorized startup record when writable space exists, even without Node/npm. Packaged-launcher error instructions now point to the log directory.
- Retrieval/retention controls and limitations are documented in [diagnostic storage](../docs/DIAGNOSTIC_STORAGE.md), with updated [bug reporting](../docs/BUG_REPORTING.md) and [schema](../docs/DIAGNOSTIC_EVENT_SCHEMA.md).

Decisions: 98 MB combined runtime budget plus a 2 MB browser allowance per configured root/origin; seven-day retention; 10 MB segments; 2,000 browser events; proposed 256 MiB free-space save reserve. Separate configured roots and browser origins are independent stores, not a machine-wide quota. No new dependency/service, spending, save migration, destructive reset or gameplay backpressure change.

## Evidence

| Validation | Evidence and outcome |
| --- | --- |
| Final build | [Build output](evidence/living-city/lc00-p003-final-build.log), passed. Client `client-89684873d268013c`. |
| Focused journal suite | [Nine scenario groups](evidence/living-city/lc00-p003-journal.json), passed. Runtime `server-59e9091e77228abe`, content `content-3278076a2d790a71`. |
| Actual rotation/retention | Real JSONL segments stayed within reduced test byte budgets; old files expired; latest error survived queue pressure; personal-save/export sentinels remained unchanged. Production defaults are recorded in the test output. |
| Actual process death | Child writer killed/restarted from an unrelated working directory; configured-root events and unclean summary survived; dead lock recovered. |
| Fault isolation | EACCES/ENOSPC and low free space injected at filesystem boundaries; actual blocked log path exercised; real authenticated SQLite save still committed during log write failure; no false successful upload receipt. |
| Slow storage and ownership | Deliberately stalled append returned within the flush deadline and bounded its backlog; second live writer could not steal ownership. |
| Upload boundary | Real sockets rejected unauthenticated, wrong-lifetime, oversized and rapid duplicate batches; forged Agent reference was overwritten and private payload sentinel removed. |
| Browser store unit checks | Event/byte limits, eight reload instances, unclean previous session, malformed storage, quota and unavailable storage fallback passed. |
| Real browser | [Seven browser checks](evidence/living-city/lc00-p003-browser.json) passed on final client `client-89684873d268013c`: actual Chromium pre-login storage, three reloads, offline writes, injected quota fallback/recovery, report download and authenticated local flush. Screenshot visually inspected; screenshot/download retained under `output/playwright/lc00-p003-report.*`. |
| Actual solo restart | [Restart evidence](evidence/living-city/lc00-p003-restart.json) and [283 persisted events across four runtime sessions](evidence/living-city/lc00-p003-persisted.jsonl): live BAT-launched solo runs against the same isolated root retained prior sessions and real browser uploads. Unclean markers reflect deliberate test-process kills, not an inferred spontaneous crash. |
| Actual BAT missing Node | [Prerequisite test](evidence/living-city/lc00-p003-bootstrap-bat.json), passed with Node/npm removed only from the child command's PATH. Host installation unchanged. [Build-stage bootstrap fixture](evidence/living-city/lc00-p003-bootstrap.json) also passed. |
| Existing regressions | Correlated diagnostics, quality, 12 solo and eight co-op scenario groups passed. [Diagnostics](evidence/living-city/lc00-p003-diagnostics.json), [solo](evidence/living-city/lc00-p003-solo.json), [co-op](evidence/living-city/lc00-p003-campaign.json), [quality](evidence/living-city/lc00-p003-quality-final.log). |
| Progress/working tree | `npm run progress:check` passed ten existing checkpoints/122 evidence artifacts. `git diff --check` passed with only existing line-ending notices. [Source/hardware manifest](evidence/living-city/lc00-p003-baseline.json). |

Existing broad regressions ran after persistence/upload integration; final focused journal checks and final browser/build checks cover the later retention maintenance, bounded metadata-close wait, journal component separation and serialization correction. No claim that every broad gameplay suite was rerun after those narrow changes.

Permission/disk-full scenarios use deterministic filesystem-boundary injection, not a physically filled disk or modified host ACL. Browser quota is an explicit exception injected into the actual storage API. Chromium offline mode was used for journal writing after page load; this is not installed-package or OS-wide offline qualification. Browser automation and screenshot inspection are not human experience acceptance or RTX 4070/16 GB target-hardware qualification.

## Evidence preservation note

The first P003 run of the older diagnostics test reused its historical P002 default JSON output. That replaced P002's detailed JSON; its original command log remains intact. The old JSON now explicitly points to the P003 revalidation rather than mislabeling its trace as the P002 build. Added `DIAGNOSTICS_REPORT` and used a separate P003 destination thereafter. No personal save was involved. Other historical evidence and the pre-existing dirty working tree were preserved.

## Limits and next dependency

Storage-denied capture cannot survive reload if it never reached disk. Power loss can lose a recent tail. Concurrent browser tabs use best-effort origin storage merging and can race. Invalid/reused writer-lock identity conservatively disables disk capture until ownership is resolved. Age pruning requires an active runtime/page or the next launch. Log/status fallbacks and exact paths are documented; these limits must remain visible in P004 report presentation.

LC-BUG-007 (slow-connection close prevents Save and leave), original spontaneous-crash attribution, and the >1-second frame omission remain open. P005 must measure logging overhead, network queues and stalls; LC02 must repair/retest gameplay recovery. This task changes diagnostic capture, not those policies.

Next: **P004 / LC-OBS-04**, session selection and useful prior-session exports across startup/main/pause/recovery surfaces; explicit missing-tail indicators, real folder/copy-path behavior, cancellation/unavailable-storage/large-session/controller tests. Animation and the 1,000-orb program remain scheduled in their existing later phases.

Execution window: approximately 29 minutes on November 20, 2026 (13:43–14:12 UTC). Owned browser/server processes were stopped after checking the current command, start identity, runtime ID and zero active Agents. No operations remain pending. Source/runtime fingerprint: `5a7b085887d183df96e0cef3b4f6a93000430ebfdf67ce178b6dba80075c5a58` over 207 files. Full program success and human/hardware qualification remain pending.
