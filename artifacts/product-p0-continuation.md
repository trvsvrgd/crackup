# P0 continuation: opening contract and save continuity

Recorded November 13, 2026 (America/Chicago). Continues the [initial P0 audit](product-baseline-audit.md). This checkpoint advances P0.1/P0.2/P0.4/P0.5; no product gate is accepted.

## Decisions now recorded

The owner selected the proposed launch scope as the working baseline, explicitly including four districts, 24 campaign missions, a 12–18-hour solo campaign and optional 1–8 co-op. Offline solo is required. No additional spending is authorized. Weekly owner capacity remains unknown. The [decision record](../docs/PRODUCT_BASELINE_DECISIONS.md) preserves the exact replies, implications and remaining choices. Requirements v3.1 now explicitly includes installed offline behavior in FR-NET-01 and FR-DIST-01.

## Save continuity: measured failure

`npm run product:audit:saves` starts three successive real server processes against one isolated temporary SQLite database. It seeds a test profile at a relay with known inventory/XP/companion stats, authenticates over WebSocket, buys a skill through the normal server control message and hacks the nearby terminal through a real binary input. It disconnects/reconnects and performs graceful process restarts. A second scenario deliberately fixtures district completion; this is not a normal-input boss win.

| Observation | Result |
| --- | --- |
| Profile reconnect | Health, attributes/XP, collected orb IDs, skill, companion stats and other sampled profile fields match |
| Server process restart | Sampled individual profile and granted district reward survive |
| Partially hacked district | Hacked terminal state resets on process restart |
| Completed district | Completion stage resets on process restart, even though the personal reward survives |
| Storage quick check | SQLite reports `ok` |

[Raw restart evidence](evidence/p0-save-continuity.json) includes before/after observations, process identities, environment and SHA-256 hashes of the audited source/configuration. FR-SAVE-01 is now **Needs work**. The command's `audit_completed` result means the diagnostic ran successfully, not that saving meets the product contract. It intentionally reports the observed gap without making reset behavior a regression expectation.

No real player database was read or modified. Test credentials and the database are not published; the temporary database is removed after child processes close. Abrupt power loss, migration, interrupted transactions, disk-full and guest campaign ownership remain untested product cases.

## Local browser / offline component observation

[Browser evidence](evidence/p0-offline-local.json) and [opening-camera capture](evidence/p0-offline-local.png) cover the current client against a separate local server/database. Browser HTTP cache was cleared and disabled; non-loopback HTTP requests were blocked. Normal account entry and movement/jump/interaction were exercised. The client loaded local assets and connected over a loopback WebSocket. The observation contains zero failed requests and zero page errors; the final HUD reports one of two relays hacked. No external HTTP request was attempted during this sample. The browser and isolated server were closed afterward.

This verifies a component path only. The developer server was prestarted; the operating system's network adapters were not disabled, and this was not a clean customer installation or completed campaign. Offline packaging, launcher, local profile UX, true solo pause, durable campaign ownership and installed cold-start qualification remain open. The available machine is still not the declared 4070/16 GB target. Resource timings and JS heap in the report are diagnostics, not GPU/process memory or release FPS measurements.

## Opening operation ready for review

[A Signal in the Salt](../docs/OPENING_OPERATION_SPEC.md) now defines:

- Six connected beats with a 30–45-minute planned critical path, five named spaces and two interior approaches.
- Objective transitions, checkpoint boundaries, death/fall/disconnect recovery and a once-only completion/reward contract.
- Three complementary enemy roles, a boss, two weapon roles and first upgrade teaching; existing district rewards/story order remain intact.
- One side mission, two challenges, one bounded event, companion practice, ten existing-ID collectibles, a secret route and environmental story.
- An actor/state/asset gap matrix, street/roof/interior review tasks, ten requirement-linked acceptance scenarios and five bounded P1 work packages.

This is authored design and a production work breakdown, not shipped content. Expected durations/session sizes are hypotheses for measurement. Final reference art review and normal gameplay evidence remain open. No source assets or voices were fabricated or purchased.

## Repeatable checks and limits

- `npm run product:check`: validates all 96 requirement/status mappings, roles/gates, local links, reference IDs, P0–P8 dependencies, the opening's six-beat timing/transition/checkpoint structure, ten scenarios and five packages. Writes [validation evidence](product-requirements-validation.json).
- `npm run product:audit:saves`: reproduces the process-restart findings and writes source-tagged evidence.
- `npm run build`, `npm run verify:alpha` and `npm run progress:check`: build/type validation, existing six-part alpha regression and historical engineering-ledger integrity.

Fresh verification on this checkpoint: build passed; alpha **6/6** passed; product structure check passed with **96 requirements, valid local links, six opening beats, ten scenarios and five P1 packages**; historical ledger check passed with **10 checkpoints and 85 saved evidence files**. Save audit completed and reported the two district-continuity failures above. These are component/structure results, not product acceptance. The [continuation evidence manifest](p0-continuation-evidence.json) binds the saved reports/capture and relevant files with SHA-256 hashes.

The historical engineering ledger remains separate from the product register. No Phase 1–5 mechanics or gameplay runtime implementation was changed by this package. Existing local edits remain in place; no commit, push, deployment or paid action was performed.

## Remaining P0 exit work and next action

1. Review the opening brief/art direction and unresolved numerical NFR thresholds/audience. Working content scope/offline/spending decisions are already recorded and need not be asked again.
2. Finish a captured normal-input run of the existing opening loop and complete the gap inventory; the initial sample and this component check do not establish opening completion or unfamiliar-player usability.
3. Measure the declared reference hardware, including CPU/GPU timing, full process/GPU memory and representative crowded load. Exact target configuration/access is still absent.
4. Record weekly owner capacity when available; do not invent a deadline or replace human review with generated logs.
5. After P0 exit, execute **P1-SAVE**: versioned local campaign ownership, atomic checkpoint/reward receipts, two-profile isolation and installed offline launch/pause proof. The implementation must preserve current hosted behavior and use the existing stack first. Do not simply save one global district map and call it a personal campaign.

P0 remains in progress. Product totals: **95 Unverified, 1 Needs work, 0 Accepted**. No complete-game milestone is claimed.
