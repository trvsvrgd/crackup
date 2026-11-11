# CRACKUP project progress ledger

Updated: 2026-11-11T20:49:51Z. This is a checkpoint log, not a production-release certificate.

**Resume here:** Start Stage 3D WeaponBuilder; then pass the full Stage 3 integration gate before beginning Stage 4.

Branch: feat/section6-progress-checkpoint · Base: main
PR: Will be linked after the branch is pushed.
Approval: Requested by the user; GitHub review will be attempted after the PR is created.

## Stage map

The Phase 1-6 gameplay roadmap and Section 6 art stages use different numbering. The gameplay foundation is verified; the art pipeline remains incomplete.

| Section 6 checkpoint | State | Dependencies | Outcome / exit gate |
| --- | --- | --- | --- |
| 1 - Narrative and visual style | Complete / verified | None | Three-act story bible, wireframe comms, faction PBR and Sobel ink pass. |
| 2 - Rigs and physical combat | Complete / verified | 1 | Nineteen-joint rigs, nine silhouettes, animation/reactions, disarms and paired counters. |
| 3A - Architecture | Complete / verified | 2 | Eighteen detailed buildings, 898 shared ledges, interior mapping, resource/model checks. |
| 3B - Vehicles and destruction | Complete / verified | 3a | Detailed vehicles, wheel suspension/steering, authoritative panel destruction and packet 0x09. |
| 3C - Relays | Complete / verified | 3b | Eight relays, shared hull/lattice colliders, vent heat/shutdown/reboot and packet 0x0A. |
| 3D - WeaponBuilder | Next | 3c | Consolidate socket/disarm weapons, add firearm variants and verify muzzle/socket orientation through every combat pose. |
| 3 - Integration and performance gate | Waiting for prerequisites | 3d | Verify all four builders together, collision/model contracts, destruction, disposal, browser shots and combined rendering cost. |
| 4 - PBR pipeline and Bay Area vista | Waiting for prerequisites | 3gate | Triplanar fallback/external PBR, 10 km Gerstner bay, two suspension bridges, terrain/headlands, fog and dusk/night. |
| 5 - Combat effects and spatial audio | Waiting for prerequisites | 4 | Pooled tracers/sparks/shockwaves/skid marks and bounded HRTF footsteps/engines/gunfire/counters/orbs. |
| 6 - In-engine cinematics | Waiting for prerequisites | 5 | Skippable bridge fly-in and boss introductions using finalized upstream assets; restore camera/input/HUD and verify co-op interruption. |

## Resume checklist

1. Run npm run build and npm run verify to refresh the baseline.
2. Promote createRigFirearm into client/builders/WeaponBuilder.ts and reuse it for equipped, dropped and disarmed weapons.
3. Add receiver/barrel/optic/magazine/muzzle variants with named Grip and MuzzleFlashEmitter anchors and a rich procedural fallback.
4. Verify right-hand socket alignment through locomotion, aim, all three melee strikes, paired counters and disarms; preserve existing combat timing and progression.
5. Run the combined Stage 3 collision, optional-model, destruction, disposal, network and browser/performance gate.
6. Update this ledger and SECTION6_PROGRESS_REPORT.md with evidence before moving to Stage 4.

## Project foundation

- **Gameplay Phases 1-6:** Shared physics, progression, district loops, pet arenas, Dreadnought, binary packets and SQLite persistence have passing automated suites.
- **Playable alpha:** HUD, earned upgrades, health/recovery, companion controls, reconnect/input/socket hardening and compiled deployment configuration are included.
- **Asset provisioning:** HDR, four 2K PBR material sets and Soldier/Xbot GLBs are saved with provenance/hashes and licenses; 17 manifest assets validate. Unsupported combat poses continue to use articulated procedural rigs.

## Verification at this checkpoint

| Check | Result | Evidence |
| --- | --- | --- |
| npm run build | Passed at saving checkpoint | Strict TypeScript compilation and browser bundle. |
| npm run verify | Passed at saving checkpoint | Phases 1-6, alpha, art stages 1-2 and 3A-3C, including live WebSocket tests. |
| npm run assets:verify | Passed at saving checkpoint | 17 assets; hashes, full image/HDR decode and glTF validation. Six upstream non-fatal GLB warnings remain. |
| npm run verify:art:browser | Saved implementation-run evidence passed | evidence/art-verification.json; nine rigs, portrait, resize and zero errors. |
| npm run verify:stage3a:browser | Saved implementation-run evidence passed | evidence/stage3a-browser.json and architecture screenshots. |
| npm run verify:stage3b:browser | Saved implementation-run evidence passed | evidence/stage3b-browser.json; four vehicles 373 calls / 36,358 triangles. |
| npm run verify:stage3c:browser | Saved implementation-run evidence passed | evidence/stage3c-browser.json; isolated relay 94 calls, city 2,895 calls / 382,200 triangles. |

Browser reports below were produced during the implementation runs. Build, regression and asset validation were rerun for this saving checkpoint.

## Decisions and limits

- Keep the Section 6 dependency order. Do not start cinematics until Stages 3-5 pass.
- Preserve legacy world/orb/objective data and established gameplay; maintain rich multipart procedural fallbacks and validated optional GLTF models.
- Vehicles use 1,000 HP: hood below 50%, doors/trunk below 25%; physical debris expires after 12 seconds with a global cap of 64; wrecks reset after 20 seconds.
- Relays have three 120-HP vents. Lost cooling raises heat; shutdown parks dishes and triggers an eight-second automatic repair/reboot. It does not bypass hacking or boss requirements.
- Existing packet layouts remain compatible; presentation and damage extensions use packets 0x08, 0x09 and 0x0A.
- Rendering budgets are controlled-view checks, not hardware-independent FPS guarantees. The combined Stage 3 integration gate and minimum-hardware profiling are still open.
- Save the combined current checkout: Phase 6, alpha, installed assets, art stages through 3C, deployment configuration and progress evidence. Do not merge or deploy as part of this checkpoint.
- Generated local databases, credentials, node_modules, build maps, QA server helpers and caches remain excluded by .gitignore. Runtime asset binaries and the existing tracked public/game.js bundle are saved.

## Remaining release work

- [ ] Complete Stage 3D, the Stage 3 integration gate and ordered Stages 4-6.
- [ ] Have five unfamiliar players finish the opening district without coaching.
- [ ] Run an eight-player, 30-minute playtest on realistic network conditions and declared minimum hardware.
- [ ] Validate frame times, combat balance, accessibility, reconnects and persistence.
- [ ] Validate the hosted build, TLS, persistent volumes, backup restoration, monitoring and rollback.
- [ ] Perform the final three-act playthrough and record remaining release limitations.

## Progress log

| Date / time (UTC) | Event |
| --- | --- |
| 2026-11-11 | Stages 1-2 completed and verified: narrative, comms, materials/outlines, articulated rigs and physical combat reactions. |
| 2026-11-11 | Stage 3A completed: citywide architecture, shared ledges, model fallbacks and browser/performance evidence. |
| 2026-11-11T19:09:57Z | Stage 3B completed: detailed vehicles, authoritative physical panel destruction, three-client replication and browser verification. |
| 2026-11-11T19:55:30Z | Stage 3C completed: detailed relays, vent heat/reboot, approach clearance, three-client replication and live H interaction. |
| 2026-11-11T20:47:17Z | User requested a branch, commit, push, PR approval and a saved progress/remaining-stage artifact. |
| 2026-11-11T20:49:51Z | Fresh build, full regression and 17-asset verification passed. Created the feature branch and prepared the versioned ledger/evidence before committing. |

## Saved evidence

Files are copied from local QA output; SHA-256 hashes in the JSON ledger bind this checkpoint to these exact artifacts.

- [art-verification.json](./evidence/art-verification.json) — verification report
- [stage3a-browser.json](./evidence/stage3a-browser.json) — verification report
- [stage3b-browser.json](./evidence/stage3b-browser.json) — verification report
- [stage3c-browser.json](./evidence/stage3c-browser.json) — verification report
- [stages-1-2.png](./evidence/stages-1-2.png) — browser screenshot
- [live-stages-1-2.png](./evidence/live-stages-1-2.png) — browser screenshot
- [alpha-login.png](./evidence/alpha-login.png) — browser screenshot
- [alpha-final-hud.png](./evidence/alpha-final-hud.png) — browser screenshot
- [alpha-field-menu.png](./evidence/alpha-field-menu.png) — browser screenshot
- [alpha-upgrades.png](./evidence/alpha-upgrades.png) — browser screenshot
- [prod-assets.png](./evidence/prod-assets.png) — browser screenshot
- [stage3a-aegis.png](./evidence/stage3a-aegis.png) — browser screenshot
- [stage3a-docks.png](./evidence/stage3a-docks.png) — browser screenshot
- [stage3a-facade.png](./evidence/stage3a-facade.png) — browser screenshot
- [stage3a-foundry.png](./evidence/stage3a-foundry.png) — browser screenshot
- [stage3a-helios.png](./evidence/stage3a-helios.png) — browser screenshot
- [stage3a-live.png](./evidence/stage3a-live.png) — browser screenshot
- [stage3a-roof.png](./evidence/stage3a-roof.png) — browser screenshot
- [stage3b-healthy.png](./evidence/stage3b-healthy.png) — browser screenshot
- [stage3b-live-mounted.png](./evidence/stage3b-live-mounted.png) — browser screenshot
- [stage3b-panels.png](./evidence/stage3b-panels.png) — browser screenshot
- [stage3b-rear.png](./evidence/stage3b-rear.png) — browser screenshot
- [stage3b-wreck.png](./evidence/stage3b-wreck.png) — browser screenshot
- [stage3c-city.png](./evidence/stage3c-city.png) — browser screenshot
- [stage3c-console.png](./evidence/stage3c-console.png) — browser screenshot
- [stage3c-hacked.png](./evidence/stage3c-hacked.png) — browser screenshot
- [stage3c-live.png](./evidence/stage3c-live.png) — browser screenshot
- [stage3c-online.png](./evidence/stage3c-online.png) — browser screenshot
- [stage3c-shutdown.png](./evidence/stage3c-shutdown.png) — browser screenshot
- [asset-verification.json](./evidence/asset-verification.json) — verification report

## Maintaining this artifact

Edit artifacts/project-progress.json when a checkpoint passes. Append a dated log entry, attach the new evidence, and update the resume checklist. Keep unfinished dependencies blocked.

Run npm run progress to rebuild this document and npm run progress:check to validate it. The check validates dependencies, saved-evidence hashes and generated-document consistency. PR approval remains governed by the live GitHub review state.

Detailed history: [Section 6 progress](../SECTION6_PROGRESS_REPORT.md), [implementation plan](../SECTION6_IMPLEMENTATION_PLAN.md), [alpha notes](../ALPHA_RELEASE_NOTES.md), [Phase 6 report](../PHASE6_PROGRESS_REPORT.md).
