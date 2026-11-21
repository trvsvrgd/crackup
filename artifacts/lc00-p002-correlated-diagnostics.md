# P002 — Correlated diagnostic events

LC-OBS-02 is technically verified. LC00 remains in progress; P003 is next. This is diagnostic implementation evidence, not crash/re-entry acceptance. Original owner path: `Start CRACKUP.bat`, confirmed in conversation.

## Delivered behavior

- Shared versioned event schema, fixed event/error taxonomy, bounded numeric fields and opaque lifetime/connection/Agent/campaign/save-attempt references.
- Executing server/content fingerprints and client build identity carried through authentication, save state and downloaded reports.
- Solo launcher start/readiness/failure/reuse events correlated to the authoritative server. Database-constructor failures now reach safe stdout and best-effort `launcher.log` without altering damaged saves.
- Authoritative save request/commit/failure events in solo, co-op and shared modes; client save acknowledgements join by server-assigned attempt ID and revision. New client requests do not inherit the previous transaction ID.
- Client lifecycle/error timeline in existing preview/download UI. Existing bundle-offset sanitization remains intact. Recognized socket close reasons become fixed safe categories.
- Per-name flood limiting, suppression counts, bounded event rings, snapshot isolation and sink-failure isolation.

Contract and integration limits: [diagnostic schema](../docs/DIAGNOSTIC_EVENT_SCHEMA.md). Player/operator instructions: [bug reporting](../docs/BUG_REPORTING.md). No save ownership, binary gameplay layout, retry policy or gameplay tuning was changed.

## Verification

| Check | Result and evidence |
| --- | --- |
| Final build | Passed; [build output](evidence/living-city/lc00-p002-final-build.log). Client `client-bb06f71e9dbc115e`. |
| Source/hardware identity | [Final manifest](evidence/living-city/lc00-p002-baseline.json): 201 source/config/runtime files, fingerprint `829bcd13ab23e596d2b1b21168fdad6e5ea2970422a2f23219219d422563b608`; Node 22.16, Windows 10.0.26300, i7-10700K, 64 GiB. Same host as P001, not target-hardware qualification. |
| Focused diagnostics | Six scenario groups passed: [integration evidence](evidence/living-city/lc00-p002-diagnostics.json). Credential-bearing errors; safe bundle offsets; flood/sink/ring isolation; actual sockets in all three modes; actual SQLite rollback/retry in solo/co-op; corrupt-database solo startup preserving bytes. |
| Existing report/animation regression | `npm run verify:quality` passed: [output](evidence/living-city/lc00-p002-quality.log). |
| Existing solo persistence regression | 12 checks passed: [evidence](evidence/living-city/lc00-p002-solo.json). |
| Existing co-op ownership regression | Eight checks passed: [evidence](evidence/living-city/lc00-p002-campaign.json). Added optional `CAMPAIGN_REPORT` output override to preserve old evidence. |
| Final ordinary browser journey | Passed deploy → field menu → Save checkpoint → preview/download report → Save and leave → profile selection: [browser evidence](evidence/living-city/lc00-p002-browser.json). No page errors. Headed Chromium via normal controls; not a human review. Report screenshot visually inspected at `output/playwright/lc00-p002-report.png`. |
| Cross-component joins | [Validation](evidence/living-city/lc00-p002-trace-validation.json) verifies 63 [sanitized JSONL events](evidence/living-city/lc00-p002-trace.jsonl), actual launch/auth/save revision/attempt/disconnect, plus the earlier failed journey. Server `server-10c93b12133c370e`, content `content-3278076a2d790a71`. |
| Progress/whitespace | `npm run progress:check` passed ten existing checkpoints/122 evidence files; `git diff --check` passed (line-ending notices only). |

The real browser path used the root BAT, `--no-browser`, isolated `SOLO_DATA_DIR` and port 33520. Playwright opened the resulting URL explicitly. No personal database was read or changed. Browser/test server cleanup checked current process command/start identity and zero active Agents first. Isolated databases remain under ignored `output/solo/lc00-p002-*` for local reproduction. Raw launcher console logs are retained there; evidence-directory launcher logs contain only schema events.

The final source/browser assertions specifically prevent stale transaction IDs on new client save intent and unrelated lifecycle events. Earlier quality/solo/co-op suites preceded that client-only correction; the final build and real browser ran after it. Server diagnostics integration reran after adding close categories. Fixture client builds in socket tests are synthetic labels; the browser trace carries the actual client build.

## Newly observed gameplay defect: LC-BUG-007

**Open, S1 candidate: a slow-connection close leaves the player unable to use Save and leave.**

Two ordinary-input browser attempts encountered close code 4008. The first [failed run](evidence/living-city/lc00-p002-browser-first-failure.log) timed out waiting for profile selection; its [downloaded report](evidence/living-city/lc00-p002-browser-first-report.json) records the disconnect/exhaustion. After categorization was added, [the next trace](evidence/living-city/lc00-p002-slow-connection.json) captured `CONNECTION_TOO_SLOW` on both server and client with the same connection ID. The final run succeeded; this does not close an intermittent defect.

Confirmed chain: `server/gameServer.ts` checks `ws.bufferedAmount > 1 MiB` during snapshot broadcast and closes with 4008/Connection too slow; `client/net/netcodeClient.ts` treats 4008 as nonretryable, records exhausted, and leaves the deployment overlay hidden. A subsequent menu Save and leave cannot reach the server. Successful committed revisions still exist in the trace. The ordinary client is left with a reload instruction rather than a functioning return path.

**Not yet established:** why the queue backed up (serialization volume, reader/render stalls, CPU/GPU contention or another cause), prevalence without automation, or whether this explains the owner's original spontaneous crashes. The second run overlapped a build, so it is unsuitable for steady-state performance claims. No instrumentation-induced cause or gameplay fix is asserted. The first attempt also failed; the final lighter run passed. P005 must measure queue size/throughput and stalls; P015/P017 must repair and verify recovery without disabling backpressure safeguards speculatively.

LC-BUG-004's writable corrupt-database startup-log case is fixed and tested here. Log-directory write denial and retention remain P003. LC-BUG-006 now has a categorized campaign-load failure event; underlying invalid campaign content remains preserved/refused. P001's other defects remain open.

## Remaining gate and handoff

P003: implement bounded runtime JSONL rotation and durable browser fallback journal; preserve prior sessions, tolerate partial lines, test write denial/quota/disk-full/unavailable storage/offline restart, and document actual retrieval paths. Current stdout/ring/fatal-launcher file does not meet that persistence requirement. Include BAT failures before the TypeScript launcher and other launcher entrypoints in the path inventory.

P004/P005/P006 still need previous-session exports, complete stall/network/resource instrumentation, overhead measurement, triage and the three interruption drills. No LC phase is accepted. Animation work stays explicitly queued at LC08/P049–P054 with the 20-state traversal specification; this work does not supply a runtime animation pack or increase the current orb count.
