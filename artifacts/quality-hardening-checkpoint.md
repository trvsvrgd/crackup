# Quality-of-life and hardening checkpoint

November 15, 2026. Focused improvement batch completed; full product/release gates remain open.

| Step | Dependency | Result | Evidence |
| --- | --- | --- | --- |
| Inspect current code and delivery status | None | Complete: missing reporting, shortcut ordering, discontinuous gait and stale held input identified | Changes below |
| Implement focused improvements | Inspection | Complete | Client diagnostics, animation, input and server changes |
| Automated verification | Implementation | Passed | [Full regression log](evidence/quality-regression.log); build, solo and campaign checks |
| Browser fault/recovery checks | Build | Passed: 19 assertions | [Browser result](evidence/quality-browser.json), [report preview](evidence/quality-report.png), [graphics recovery](evidence/quality-recovery.png), [startup failure](evidence/quality-startup-failure.png), [render failure](evidence/quality-runtime-failure.png) |
| Production qualification | Product P0/P1 and later gates | Still open | [Current product ledger](product-delivery-status.md) |

## Delivered behavior

- Report a problem is available before deployment, from the field menu, while downed and after startup/graphics/render failure. Players review/download JSON locally. No automatic submission, external service, account or spend is introduced. [Usage and triage guide](../docs/BUG_REPORTING.md).
- B/menu shortcuts no longer consume text entry or modified browser shortcuts. Reports preserve focus, block gameplay input, pause offline solo and leave an already-open field menu paused when closed. Co-op remains live.
- Startup, graphics context loss and render-loop exceptions expose report/reload controls. A failed renderer stops running its frame body, preventing repeated exception storms; reload is explicit and resumes through deployment from saved state.
- Server input expiration now releases held aim/sprint/grapple/jetpack after 250 ms without fresh input, in addition to stopping movement. Real WebSocket coverage verifies fresh controls still reach simulation and stale controls clear.
- Walking cadence is integrated over time, removing phase jumps as speed changes. The skeletal animator reuses pose/quaternion scratch objects and ignores invalid frame deltas. This is procedural animation polish; no additional imported clips were obtained.
- Reports contain a deterministic content-derived client build ID, 40 bounded error/context events, 120 bounded frame samples, full-frame draw statistics and explicitly allowed session/save fields. Automatic fields omit credentials, callsigns, profiles, raw exception messages and URLs. Free-text notes remain user-controlled.

## Verification and limits

`npm run build` and the complete `npm run verify` passed, including the new `verify:quality` checks and all Phase 1-6 / Stage 1-6 / alpha suites. `verify:solo` and `verify:campaign` also passed; their new outputs are [solo evidence](evidence/quality-solo-verification.json) and [campaign evidence](evidence/quality-campaign-verification.json). Original historical evidence remains preserved.

The final browser-tested build is `client-84cc111e494ccc81`. Browser checks used a synthetic profile in an isolated local solo database. They verified reviewed/downloaded byte equality, keyboard focus and B handling, authoritative pause/resume, actual `WEBGL_lose_context` recovery, injected draw-call failure, uncaught error/rejection capture, and injected startup failure. Expected injected errors are not spontaneous gameplay crashes. Screenshots were visually inspected.

No target-hardware benchmark, human playtest, authored campaign acceptance or native minimized-window qualification is claimed. Genuine locomotion/reaction/death clips, final art/audio, uncoached playthroughs, sustained realistic-network co-op, backup/restore and deployment qualification remain future work. No commit, push or deployment was performed.
