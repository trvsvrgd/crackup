# LC00 / P001 — re-entry, pause, and crash baseline

November 19, 2026. **Baseline investigation technically verified; reported spontaneous crash cause remains unresolved. No repair or LC00 phase acceptance is claimed.**

Requirement: LC-OBS-01. Next work package at baseline: P002, correlated diagnostics. The owner subsequently confirmed `Start CRACKUP.bat`, matching the baseline launch path. The original failing save and spontaneous-crash cause remain unverified. Existing personal databases were not opened or changed.

## Identity and method

- Commit: `1d107a661a0ac070130194ae45890dd8bc721d07`, with substantial pre-existing modified/untracked work preserved.
- Client build throughout browser tests: `client-dd1c4731be6fb880`.
- [Pre-build source inventory](evidence/living-city/lc00-p001-baseline.json): SHA-256 manifest of 193 source/runtime/config files, including server and client source. The code's current health endpoint supplies product version, not an independent server/content build fingerprint; the source manifest supplies this audit's server identity.
- Host: Windows 10.0.26300, Node 22.16.0, Intel i7-10700K, 64 GB RAM, NVIDIA RTX 5070, driver 32.0.16.1692; a Meta Virtual Monitor is also installed. This is not the RTX 4070 / 16 GB reference configuration.
- Headed Chromium through Playwright CLI, viewport 1689 × 1277, device pixel ratio 1. Normal DOM controls and keyboard for deployment, walking/jumping, menus, save, leave, PIN retry, and re-entry. Timing and incoming save messages were observed without moving the player or granting progression through debug APIs.
- Isolated launcher: `SOLO_DATA_DIR=output/solo/lc00-p001`, `SOLO_PORT=33519`, `Start CRACKUP.bat --no-browser`. Only automatic opening of the default browser was suppressed; the batch build and solo entry point ran. The browser was opened separately in named Playwright session `lc00`.
- Process death, a 1,250 ms main-thread stall, WebGL context loss, unsupported campaign version, and invalid SQLite bytes were explicitly induced. They establish reproducible recovery/diagnostic gaps, not the cause or frequency of spontaneous owner failures.

## Launch and save-source map

| Launch path | Runtime/mode | Save source | P001 evidence |
| --- | --- | --- | --- |
| `Start CRACKUP.bat` | Builds checkout, then `npm run solo` | `%LOCALAPPDATA%\CRACKUP\solo\campaigns.db` by default; `SOLO_DATA_DIR` overrides | Actual batch launched with isolated override; current build and deployment exercised. |
| `npm run solo` | Source `server/solo.ts`, loopback solo | Same solo root | Same entry point exercised by batch and direct restart. |
| Packaged `Launch CRACKUP.vbs` | Bundled node and packaged `app/dist/server/solo.js`; packaged assets | Same default solo root or inherited `SOLO_DATA_DIR` | Packaging/launcher source and existing package inventory inspected. Native VBS/default-browser launch and clean offline installation were not run. Existing dated packages are separate build artifacts, not the current checkout. |
| `npm start` / `start:production` | Shared sandbox, default port 3000 | Repository `data/crackup_v2.db` | Source inspection only; personal/shared data untouched. |
| `npm run campaign:coop` | Owned hosted campaign, default port 3222 | `CAMPAIGN_DATA_DIR` or `data/campaign-coop/campaigns.db` | Source/policy inspection only; this browser audit did not qualify host/guest UI. |

The same callsign does not identify the same world across different stores. This isolation is intentional, but the current menu offers neither a save-source browser nor a saved-Agent picker. An occupied solo port is reused after checking product and mode only; desired data root and build are not compared.

## Reproduction matrix

Counts describe this short audit only. “Not reproduced” never means the owner's issue is disproved.

| ID / symptom | Steps and input method | Expected versus observed | Frequency / confidence / last checkpoint |
| --- | --- | --- | --- |
| B01 Fresh deployment | Open isolated BAT server; enter synthetic Agent and PIN; Deploy. | Deployment reached live world with save state; no startup failure. | 1/1 success; high for this path. Revision 4 observed after initial presentation writes. |
| B02 Ordinary play | Return to city, click canvas, hold W, press Space, release and observe roughly 6 s. | Input path remained active without fatal recovery overlay. Frame intervals were predominantly about 33 ms. | 1 short sample; not a stability or campaign playtest. |
| B03 Manual save | Open field menu; select Save checkpoint. | Revision advanced 12 -> 13, saveError false, visible saved feedback. | 1/1 success; current world had no completed relay. |
| B04/B06 Save, leave, re-enter | Select Save & return to profiles; enter the same details and Deploy. | Returned to same profile/world; health 230 restored. Exit transitions through a reloading/disabled deployment screen before readiness. | 1/1 success; departure revision 16; re-entry revision 17. |
| B05 Incorrect PIN | Enter wrong synthetic PIN, then retry correct PIN. | Specific PIN error and enabled retry; correct retry succeeds. | 1/1 success; no profile replacement. |
| B07 Browser reload | Reload while deployed; enter same details. | Correct world loads with one actor, revision 20. | 1/1 success; no spontaneous crash. |
| B08 Menu/report pause | Open report from field menu, export, close report. | Authority reports paused; field menu remains open. | 1/1 success; revision 21. Export has build and rendering data. |
| B09 Long server outage | Stop the verified isolated server process; wait until retries end; restart same data/port. | Desired: actionable reconnect/resume. Actual: banner says Reload to try again, no auth/recovery panel, no automatic reconnect after server returns healthy. | 1/1 reproduced; high. Restart health has zero active Agents and one stored account. |
| B10 Explicit reload after outage | Browser reload and normal sign-in; if saved downed, select Recover at drop point. | Re-entry succeeds and one actor exists. A downed profile requires normal recovery before field menu can open. | 1/1 completed recovery. Revision 118 reflects subsequent play/autosaves; no claim about newly earned objectives. |
| B11 Induced long stall | Block only the test page's main thread for 1,250 ms; observe RAF and export real report. | Observed 1,283.8 ms frame gap. Export has no stall event/max and discards intervals over one second; p95 is 50 ms. | 1/1 diagnostic omission; high. Revision 120. This is not a spontaneous stall cause. |
| B12 WebGL loss | Request actual `WEBGL_lose_context` loss, then use recovery report UI. | Recovery/report works; graphics-lost event exported and solo paused. | 1/1 induced failure handled; high. Revision 120. |
| B13 Post-crash diagnostics | Reload using recovery button; open report on deployment screen. | Desired: previous failure remains accessible. Actual: previous graphics-lost event disappears; new report events is empty. | 1/1 reproduced; high. Manual pre-reload export survives only because it was downloaded. |
| B14 Graphics recovery re-entry | Enter same synthetic profile after recovery reload. | Re-entry succeeds; one authoritative Agent. | 1/1 success; revision 123. |
| S01 Occupied solo port | Start source A with a partial campaign; launch source B on A's port with different data directory. | Desired: verify desired source/build or explain conflict. Actual: second launcher exits 0 and reuses the first solo service despite different intended store. | 1/1 reproduced in real isolated processes; high. Source A fixture revision 1; source B revision 0. |
| S02 Partial checkpoint restart | Seed one relay in real CampaignStore transaction; authenticate; close client; abruptly kill and restart process. | Partial relay checkpoint and campaign identity retained. | 1/1 success; revision 2 on resume. Explicit fixture, not normal mission completion. |
| S03 Same identity, different store | Start source B on its own port; sign in with same synthetic callsign. | Separate world at relays 0/2, while A had 1/2. Isolation works; menu does not discover/explain alternate saves. | 1/1 confirmed; high. This is a candidate explanation, not attribution to the owner. |
| S04 Unsupported campaign | Seed version 999 in isolated campaign, then authenticate normally over WebSocket. | Save rejected without overwrite. Generic UI error; no detailed logged load reason or selectable backup. | 1/1 induced refusal; original bytes preserved. High confidence in missing diagnostics. |
| S05 Invalid database startup | Put invalid SQLite bytes in a new isolated store; run real solo entry point. | Process exits 1 with SQLITE_NOTADB on stderr, but no advertised launcher.log is created. | 1/1 induced failure; high. Constructor executes outside launcher try/catch. |

## Prioritized defect and investigation list

| Defect | Severity / confidence | Mechanism / next work |
| --- | --- | --- |
| LC-BUG-001: no session recovery after retries exhaust | S1 for blocked re-entry without manual page reload; reproduced | `client/net/netcodeClient.ts` stops after five retries. `client/playerHUD.ts` presents an offline banner but does not restore a login/recovery action surface. P002/P005 add correlation; P015/P017 repair recovery. |
| LC-BUG-002: failed session diagnostics disappear on reload | S1 support gap for recurring crashes; reproduced | `BugReportRecorder` is page-memory only. P003 persists a bounded journal; P004 exports prior sessions. |
| LC-BUG-003: long stalls excluded from the report | S2 observability defect; reproduced with induced 1,283.8 ms interval | `BugReportRecorder.frame()` drops intervals above 1,000 ms. P005 must retain/classify long intervals, not hide them. |
| LC-BUG-004: database startup failure bypasses launcher logging | S1 startup/support defect under damaged-store condition; induced | `new CrackupAuthoritativeServer()` and database creation occur before `server/solo.ts` startup try/catch. P002/P003 instrument startup including constructor failure. Preserve the damaged file. |
| LC-BUG-005: occupied port silently reuses a different intended store/build | S1 save-source confusion risk; reproduced using different stores, build mismatch not separately runtime-tested | Solo EADDRINUSE branch validates only health product/mode. P002 adds real identity; LC02 needs source/build matching and actionable recovery. No personal data loss was demonstrated. |
| LC-BUG-006: invalid campaign rejection has no diagnostic cause | S2 support/recovery gap; induced | Campaign-load catch discards the exception. P002 records a safe categorized failure and correlation; LC01 handles migration/backups. |
| LC-INV-001: spontaneous pause/crash reported by owner | Unresolved, potentially S1; original symptom not reproduced | BAT launch path confirmed by owner. Need affected session/save version and persistent logs. Do not infer that injected faults caused the owner's crashes. |
| LC-INV-002: high render work / apparent pauses | S2 performance concern pending profiling | Approximately 4,170–4,181 draw calls in reports; short normal-input RAF sample p50 33.3 ms, p95 33.5 ms, max 66.7 ms. Mixed menu/startup report p95 reached 300.2 ms but is not isolated gameplay timing. P005 should correlate frame/tick/save/asset/resource costs. |

There is no evidence here supporting a backend replacement or paid service. Current data supports targeted observability and recovery work first. Existing saves did survive the tested acknowledged checkpoint/restart cases; that does not establish corruption resilience, release reliability, or every user's resume path.

## Evidence and limitations

- [Normal-input observations and raw frame samples](evidence/living-city/lc00-p001-browser.json).
- [Outage before restart](evidence/living-city/lc00-p001-outage-before-restart.json) and [healthy server while client remains disconnected](evidence/living-city/lc00-p001-outage-after-restart.json).
- [Controlled stall/graphics/reload observations](evidence/living-city/lc00-p001-recovery.json).
- [Real-process store/startup observations](evidence/living-city/lc00-p001-storage.json).
- [Existing solo regression: 12 passing checks](evidence/living-city/lc00-p001-solo-regression.json).
- Browser screenshots and manually exported reports are in `output/playwright/lc00-p001-*`; selected sanitized copies are retained with the evidence. Synthetic profile names may appear; no personal PIN/save was captured.

The first browser recovery audit helper timed out because the previously saved Agent was downed and the helper tried to open the field menu without using Recover at drop point. Its failed log is retained as `lc00-p001-recovery.log`. The helper was corrected to use that actual button; the rerun completed. This test-harness error is not labeled a renderer crash.

The initial RAF recorder produced one negative first-sample interval because the current frame timestamp preceded instrumentation setup. That invalid initialization sample is retained in raw evidence and excluded from statistics. The harness now starts its clock on the first callback; no genuine long interval was excluded from external capture. The game's own one-second exclusion is separately reproduced above.

No native OS sleep/device-loss matrix, clean installed offline qualification, eight-human-player session, full campaign, target-hardware result, or spontaneous process-crash attribution is claimed. Short successful re-entry runs do not rule out intermittent failure.

## Repeatable entry points

1. `node scripts/capture-living-city-baseline.mjs` captures source identity; use a new evidence filename when preserving a previous run.
2. Build with output redirected to a named log. Use isolated `SOLO_DATA_DIR` and unused `SOLO_PORT`, then launch `Start CRACKUP.bat --no-browser`.
3. In a named Playwright session, open that URL and run `tests/audit-living-city-browser.mjs`. It uses only the synthetic LC00AUDIT profile.
4. For B09, verify the isolated server process identity before stopping it, wait for the retry-exhausted banner, capture it, restart that same store/port, and capture health plus banner again. Never stop an unidentified process.
5. Run `tests/audit-living-city-recovery.mjs` to exercise reload, a deliberately induced stall and graphics loss, report retention, and normal re-entry.
6. `node --import tsx tests/audit-living-city-storage.ts` creates its own unique fixture stores under `output/solo/` and captures S01–S05 without opening existing saves.
7. `SOLO_REPORT` can redirect `npm run verify:solo` evidence to a new file. The audit ran it successfully, plus final `npm run build` and `npm run progress:check`.

Next: P002 should add allowlisted, versioned diagnostic events and opaque cross-component correlation, using LC-BUG-002/004/006 as concrete failure examples. P001's unknown original crash remains open in the ledger until better evidence identifies it.
