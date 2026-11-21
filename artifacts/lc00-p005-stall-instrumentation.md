# LC00 / P005 — Stall, queue and resource instrumentation

Status: implementation and focused/browser checks passed; final comparison/regression handoff is recorded below before advancing the cursor. LC00 phase acceptance and original crash/re-entry fixes remain open.

Work began November 20 at 20:05 UTC (14:05 America/Chicago); continuation resumed around November 21 01:20 UTC (November 20 19:20 local). The wall span includes a several-hour interruption and must not be reported as continuous execution.

## Delivered behavior

- Raw frame intervals over one second are retained with lifecycle labels. Current exports contain the latest 120 intervals and max/median/p95; stalls of at least 100 ms also reach persistent, bounded event history. Focus/visibility boundaries are explicit transitions. Simulation catch-up remains capped, with discarded catch-up time now observable.
- Fixed-cardinality timing covers frame/simulation work, event-loop lateness, campaign serialization/transaction, aggregate startup assets and message handling/snapshot construction. Two-second summaries expose total versus retained sample counts. Raw stall events retain original duration rather than being hidden inside an average.
- Liveness continues through normal pause. Actual physics/graphics resource counts, process memory, input/prediction/interpolation queues, save age and log backlog are captured. No in-process timer is represented as a crash-cause detector or a replacement for unclean session metadata.
- Per-connection payload traffic and queue size at the existing 1 MiB/4008 guard expose backpressure without changing its policy. No packet layout, gameplay authority, save schema or pause behavior was changed.
- Explicit comparison-only capture-off settings cover both runtimes and separately fingerprinted client builds. Normal capture is restored by default. No spending, new service or personal save modification.

The [measurement contract](../docs/PERFORMANCE_DIAGNOSTICS.md) defines scopes, overlapping costs, bounds, privacy, capture-off operation and reproduction. Shared-server save attempt duration remains on existing save events; campaign serialization is more granular. GPU completion, per-file asset waterfalls, full browser-process memory and independent external watchdogs are not claimed.

## Evidence

| Scenario | Result / source |
| --- | --- |
| Raw long intervals, bounded samples and label privacy | Passed in [focused performance tests](evidence/living-city/lc00-p005-performance.json). Fixed metric set, 120 retained samples per metric, invalid values rejected; private labels never exported. |
| 500 ms server/main-loop stall | Actual busy-loop fault produces a separately labeled delayed heartbeat and simulation scheduling gap with >300 ms discarded catch-up time. Intentional staging fault, not spontaneous-crash reproduction. Same focused trace. |
| Actual slow reader | Paused reads on a real TCP socket produced approximately 35,359 → 572,770 → 1,065,567 buffered bytes and a correlated guard event at close 4008. No fake queue assignment. This confirms the trigger mechanism, not the earlier browser incident's cause. |
| Saves, resources and traffic | Actual authenticated SQLite save emits serialization/transaction summaries; actual Rapier/resource and payload counters present in the focused trace. |
| Browser active/paused/background states | Seven checks passed through the actual root BAT with isolated data: 500 ms and 1.1 s blocks, ordinary movement/save/report/leave and secondary-tab focus. [Browser evidence](evidence/living-city/lc00-p005-browser.json). Both raw intervals and retained stall events include >1-second values. |
| Capture-on/off overhead | [Final comparison](evidence/living-city/lc00-p005-overhead.json) and six raw `lc00-p005-comparison-*.json` files. Three 12-second runs per mode after three-second warmup, order on/off/off/on/on/off; same production code/assets and external observers, with explicit client/server flag checks. This is a short local baseline, not 1% confidence-bound or reference-hardware certification. |
| Earlier desktop-size comparison | [First comparison](evidence/living-city/lc00-p005-desktop-overhead.json): 1689×1277, DPR 1; enabled mean frame 50.789 ms versus disabled 50.481 ms (+0.61%); tick work 3.426 versus 3.504 ms (-2.24%). Paired frame effects range -3.91% to +5.01%, showing noise. The recorded viewport differs from the initial 1080p target, so a separate 1920×1080 comparison follows. |
| Historical failures | P001/P002/P004 evidence remains linked in the ledger. Current diagnostics regression exercises failed authentication, unavailable/corrupt saves and reconnect capture; journal regression exercises actual killed-process persistence and log failure while saving. No new spontaneous-crash attribution is claimed. |

The first external RAF observer mixed an enrollment `performance.now()` with the next RAF timestamp, producing one negative *partial enrollment* value per run. All six original values remain in raw evidence and are listed separately in the desktop summary. They are not inter-frame intervals. The final observer starts intervals only after its first RAF; no real slow interval is discarded in either analysis.

The existing report test's default output path replaced P004's detailed synthetic fixture JSON during regression. Its original command log and real browser/restart reports remain intact. The replaced JSON now explicitly identifies the loss and links the [P005 revalidation](evidence/living-city/lc00-p005-reports.json); it is not passed off as historical evidence. The test now defaults to ignored output and supports `REPORTS_REPORT`, preventing future runs from replacing accepted evidence implicitly.

## Initial subsystem budget worksheet

These are **proposed allocations for later optimization**, not achieved limits or new gameplay tuning. Parent budgets remain authoritative. Nested work is never added twice; asynchronous GPU work is not added to synchronous CPU timing.

| Area | Proposed allocation / working target | Current evidence and next owner |
| --- | --- | --- |
| Client main-thread frame | 16.7 ms total; 8 ms frame callback, 4 ms asynchronous network/application work, 4.7 ms UI/GC/scheduling headroom | Both desktop comparison modes are around 50 ms intervals; not 60 FPS. P005 measurements expose this; LC02/LC03 must profile actual render/decode work before adding population. |
| GPU | At most 16.7 ms separately; parent memory targets unchanged | Counts only; no GPU timer or complete GPU-residency measurement. Reference-hardware qualification pending. |
| Authority | p95 total tick work ≤12 ms, p99 ≤16.7 ms; propose 8 ms physics/game systems, 2 ms encode/broadcast, 1 ms amortized save work, 1 ms headroom | Desktop one-client means ~3.4–3.5 ms, not eight-client p95 proof. Synchronous save peaks remain visible; do not hide them in averages. |
| Save | No recurring save-attributable >100 ms stalls; no lost acknowledged milestone; ≤30 s healthy unsaved age | Actual serialization/transaction/age visible; failure/durability regressions remain required. No worker/queue architecture change inferred from this instrumentation. |
| Network | 256,000 B/s down / 64,000 B/s up typical per client; propose down allocation 160k world, 70k actor/vehicle, 26k control/effects | Slow-reader trace includes a 535,253-byte / 2,048 ms window (~261k payload B/s) and queue growth. Not healthy eight-player qualification; transport overhead excluded. P006 triage/LC02 should correlate browser decode stalls and traffic before altering guards or rates. |
| Diagnostics | ≤1% mean frame/tick cost target; bounded 98 MB runtime + 2 MB browser per root/origin | Repeated comparisons and noise are reported separately. Full five-minute scenes, floods/disk-failure timing and confidence-bound qualification remain open; existing failure/flood correctness tests pass separately. |
| Resources | Parent ≤6 GB steady / 8 GB peak process-tree and GPU-estimate envelopes; bounded retention | Actual Node scope and counts are sampled. Do not sum RSS, heap, external and renderer/GPU estimates as independent allocations. Full process-tree accounting/soaks remain LC11. |

## Remaining work and handoff

P006 must demonstrate report-to-code triage, uncertain-incident handling and three interruption drills, then audit all LC00 requirements without equating these measurements with crash repair or hardware acceptance. LC-BUG-007 and ordinary-play stall attribution remain open. Later save/re-entry, world/civilian/traffic, animation pack, exactly 1,000 orbs and audio work retain their original dependency order.
