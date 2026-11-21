# Performance diagnostics and comparison procedure

P005 adds bounded measurements to the existing local journals and selected-session reports. It does not change movement time steps, pause ownership, save durability, network packet formats or the 1 MiB slow-client guard. Use [bug reporting](BUG_REPORTING.md) to export the relevant session and [storage locations](DIAGNOSTIC_STORAGE.md) to retrieve runtime files.

## What the measurements mean

| Metric/event | Measurement and limits |
| --- | --- |
| `frame.interval` | Unclamped consecutive browser RAF interval, including intervals over one second. The current-page export retains the latest 120 intervals with activity states. The first RAF has no preceding measurement and is not counted. |
| `render.work` | Synchronous client frame callback work, including presentation and prediction; not GPU completion time. It overlaps some other client work and must not be added to that work again. |
| `simulation.work` | Complete authoritative tick callback including physics, game systems, synchronous saves and snapshot broadcast. Paused/menu callbacks are identified and must not be interpreted as active-world cost. |
| `simulation.interval` | A callback interval large enough to lose catch-up time under the existing four-step cap. `catchupDroppedMs` exposes the loss. This is elapsed scheduling time, not the cost of executing four simulation steps. |
| `eventloop.delay` | Delay beyond a 250 ms in-process timer period, measured with a monotonic clock. It becomes observable after a blocked loop recovers. It cannot run while that process is dead or prove a root cause. |
| `save.serialize` | Campaign world/guest-presentation JSON serialization inside the existing transaction. It does not separately time every nested profile field. |
| `save.commit` | Entire campaign transaction, including profile writes, JSON serialization, receipts, visits and SQLite commit. Existing `save.committed`/`save.failed` events still carry end-to-end attempt duration and correlation. Commit and serialization costs overlap. Shared-server save duration remains on its existing save events. |
| `asset.load` | Aggregate production asset load, decode and environment/material application at startup, including failed attempts. It is not a per-file download waterfall and contains no URLs. |
| `network.decode` | Complete client message handling, including snapshot application/reconciliation. This is broader than binary parsing and can include creation of presentation objects. |
| `network.encode` | Shared binary snapshot construction before recipient sends. Recipient-specific world-packet encoding and sends remain inside the encompassing simulation callback. |
| `network.traffic` | Per-connection outgoing application payload bytes/messages attempted since the previous sample, with actual elapsed duration, socket buffered bytes and input queue length. Includes JSON and binary messages, excludes transport overhead and does not certify network delivery. |
| `network.pressure` | Queue size, input queue and tick at the actual 4008 slow-connection guard, with that connection's identity. The guard is unchanged. |
| `performance.resources` | Server RSS/heap/external memory, actual Rapier body/collider counts, Agent count, maximum socket/input queue and journal queue; client graphics resource/draw counts, physics counts, prediction-ring occupancy, remote interpolation counts and received payload bytes/messages. These are separate scopes, not a summed process-tree/GPU memory estimate. Save age is wall-clock age of the most recently acknowledged/committed save, not a claim that current state is dirty. |

`performance.stall` stores each observed duration of at least 100 ms immediately, subject to the existing bounded recorder/rate limits. `performance.sample` emits at most one summary per fixed metric each two-second timer window. Each metric retains at most 120 samples; `sampleCount`, `retainedSamples` and `truncatedSamples` distinguish total observations from the rolling percentile sample. Mean/max cover the complete window; p50/p95 cover retained samples. Current-frame history and event journal are bounded, so a long-running benchmark needs its own explicitly bounded raw capture. Reports expose suppression rather than implying an exhaustive audit trail.

Activity labels are `active`, `paused`, `background`, `menu`, `failed`, `transition` and `mixed`. A focus/visibility boundary invalidates attributing the whole adjoining interval to active gameplay. Mixed summaries must not be compared to pure active summaries. Opening/menu/loading and paused/background series stay visible. A forced 500 ms block may yield less than 500 ms *timer lateness* depending on where it lands in the 250 ms period; the frame gap and injected duration are separate evidence.

`performance.heartbeat` reports that the loop ran at that timestamp, even when gameplay is normally paused. Existing journal summaries still distinguish clean and unclean process endings. Neither is an external watchdog or a guarantee of recovering the final crash tail. A hard kill is expected to leave a gap and an unclean session.

## Controlled capture-on/off runs

Capture is enabled by default. For isolated developer comparisons only, `CRACKUP_DIAGNOSTICS=0` disables server recorder/journal/performance capture. Build the client under the same environment value to disable its capture too; the build fingerprint includes this flag. Restore the environment and build again before returning to ordinary diagnostics. Existing captures and personal saves are not removed. Disabled builds disclose that state in report previews; health exposes the server flag. Do not disable capture as a speculative crash fix.

`tests/performance-runtime.ts` accepts only the isolated P005 test root and ports 33523/33524. It runs the production server and adds the same bounded external tick observer in both modes. The browser comparison uses Playwright CLI `run-code --filename tests/measure-performance-browser.mjs`: ordinary deploy, three-second warmup, twelve-second standing opening-scene window, report and save/leave. `tests/summarize-performance-comparison.mjs` checks mode flags, active-window membership and raw data, then computes three paired comparisons in order on/off/off/on/on/off. `P005_PUBLIC_DIR` selects independently built fixture clients with the same assets; it is a harness option, not a new production launch mode.

This short local sample measures behavior and noise; it is not the parent PRD's three five-minute route runs, populated eight-player scene, memory soak, or 1% confidence-bound qualification. Raw frame and external tick observations use identical observers in both modes. Record per-run results and variation instead of reporting a favorable single pair. No benchmark window should overlap builds, regressions, forced stalls or deliberate error floods.

## Verification and next work

`npm run verify:performance` covers bounded samples/privacy, long-frame retention and state, disabled capture, actual delayed heartbeat after a 500 ms block, real campaign serialization/commit/resource metrics, and genuine TCP receive backpressure reaching the unchanged guard. `tests/verify-performance-browser.mjs` exercises actual 500/1100 ms main-thread blocks, normal movement/save/report controls and a real secondary-tab focus transition. These are labeled staging faults. Existing journal failure/flood tests remain mandatory; a blocked logger must not block saves.

See [P005 evidence and initial budgets](../artifacts/lc00-p005-stall-instrumentation.md). Further phase qualification must use full raw timing, equal route/content/state, declared hardware/settings and representative load. Fixes to the actual reported crash/re-entry paths remain later work until supported by causal evidence.
