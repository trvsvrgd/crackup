# CRACKUP project progress ledger

Updated: 2026-11-13T19:18:27.109948Z. This is a checkpoint log, not a production-release certificate.

**Resume here:** Begin release qualification. Stage 1-6 implementation gates pass; the game remains a playable alpha pending hardware, multiplayer, uncoached playthrough and final art/audio qualification.

Branch: feat/section6-progress-checkpoint · Base: main
PR: [Open pull request](https://github.com/trvsvrgd/crackup/pull/1)
Approval: Last checked November 11: GitHub rejected author self-approval (HTTP 422): authenticated account trvsvrgd is also the PR author. An eligible reviewer must approve PR #1.

## Stage map

The Phase 1-6 gameplay roadmap and Section 6 art stages use different numbering. Both implementation roadmaps pass their gates; production release qualification remains open.

| Section 6 checkpoint | State | Dependencies | Outcome / exit gate |
| --- | --- | --- | --- |
| 1 - Narrative and visual style | Complete / verified | None | Three-act story bible, wireframe comms, faction PBR and Sobel ink pass. |
| 2 - Rigs and physical combat | Complete / verified | 1 | Nineteen-joint rigs, nine silhouettes, animation/reactions, disarms and paired counters. |
| 3A - Architecture | Complete / verified | 2 | Eighteen detailed buildings, 898 shared ledges, interior mapping, resource/model checks. |
| 3B - Vehicles and destruction | Complete / verified | 3a | Detailed vehicles, wheel suspension/steering, authoritative panel destruction and packet 0x09. |
| 3C - Relays | Complete / verified | 3b | Eight relays, shared hull/lattice colliders, vent heat/shutdown/reboot and packet 0x0A. |
| 3D - WeaponBuilder | Complete / verified | 3c | Three shared weapon variants, normalized grip/muzzle anchors, aim/disarm replication, pooled cleanup and genuine Mixamo Armada integration. |
| 3 - Integration and performance gate | Complete / verified | 3d | Combined builders, collision/model/destruction/network/resource gates and controlled browser render budgets passed. Minimum-hardware FPS qualification remains a release gate. |
| 4 - PBR pipeline and Bay Area vista | Complete / verified | 3gate | Five-channel world triplanar PBR, validated atomic WebP/KTX2 packs, deterministic fallbacks, 10 km Gerstner bay, two shared-collision bridges, 3-8 km headlands and dusk/night. Physics, browser, cleanup and controlled draw budgets pass. |
| 5 - Combat effects and spatial audio | Complete / verified | 4 | Authoritative deduplicated packet 0x0B; four fixed tracer/spark/wave/mark pools; bounded synthesized HRTF footsteps, engines, gunfire, counters and orbs. Shared, three-client, browser, WebAudio and live settings checks pass. |
| 6 - In-engine cinematics | Complete / verified | 5 | Four-shot in-engine bridge opening; eight authoritative district boss introductions and Dreadnought. Skip, camera/FOV/HUD/input/mouse restoration, profile history, damage/death/disconnect/page-hide handling, three-client continuity and scripted three-act route pass. Native background and release playtests remain open. |

## Resume checklist

1. Preserve the completed mechanics, Capoeira retargeting, authoritative snapshots, bounded effects/audio, cinematics and saved evidence. Do not rewrite Phase 1-5 gameplay.
2. Run the opening district with five unfamiliar players and record time-to-understanding, deaths, navigation errors and required coaching.
3. Run an eight-player 30-minute session on realistic network conditions with declared minimum hardware; measure frame times, reconnects, progression/persistence and combat readability.
4. Check native tab/minimize visibility, focus, pointer capture, reduced motion, sound preference and cinematic interruptions in target browsers.
5. Perform an uncoached full three-act playthrough. The passing scripted route uses QA teleports/direct damage and does not establish balance or playability.
6. Prioritize missing genuine Mixamo locomotion/reaction clips and final hero/boss art/audio over more kick variants. The seven-clip agent_cyber starter remains pending; existing Capoeira has 39 real clips.
7. Validate hosted TLS, persistent volumes, backups, monitoring and rollback. Review local changes before any separately requested commit/push/deployment.

## Project foundation

- **Gameplay Phases 1-6:** Shared physics, progression, district loops, pet arenas, Dreadnought, binary packets and SQLite persistence have passing automated suites.
- **Playable alpha:** HUD, earned upgrades, health/recovery, companion controls, reconnect/input/socket hardening and compiled deployment configuration are included.
- **Asset provisioning:** HDR, four 2K PBR sets, Soldier/Xbot and the 39-clip Capoeira Y Bot GLB are installed with hashes/provenance. 18 manifest files validate; Armada drives the visible armor rig; other motion states retain procedural fallbacks.

## Verification at this checkpoint

| Check | Result | Evidence |
| --- | --- | --- |
| npm run build | Passed November 13 UTC | Strict TypeScript compile and regenerated public/game.js with camera director, scene tracks, live skip/restoration and startup loading gate. |
| npm run verify | Passed November 13 UTC | Complete Phases 1-6, alpha and Stages 1-6 including real WebSocket checks; saved stage6-regression.log. |
| npm run assets:verify | Passed: 18 files | Full image/HDR decode, hashes, GLB validation; zero errors and eight non-fatal upstream warnings. |
| npm run verify:stage3d:browser | Passed | 39 clips, retargeted armor, two-draw weapons, shared normal/shadow buffers, invisible-effect/quality fallback, GPU geometry cleanup and combined city budgets. |
| Production loader + live game browser | Passed | Every GLB clip, independent skins, PBR/environment, login/render/downed recovery; zero loader/render warnings or errors. |
| npm run verify:art:browser | Saved implementation-run evidence passed | evidence/art-verification.json; nine rigs, portrait, resize and zero errors. |
| npm run verify:stage3a:browser | Saved implementation-run evidence passed | evidence/stage3a-browser.json and architecture screenshots. |
| npm run verify:stage3b:browser | Saved implementation-run evidence passed | evidence/stage3b-browser.json; four vehicles 373 calls / 36,358 triangles. |
| npm run verify:stage3c:browser | Saved implementation-run evidence passed | evidence/stage3c-browser.json; isolated relay 94 calls, city 2,895 calls / 382,200 triangles. |
| npm run verify:stage4 | Passed | Four deterministic fallback sets, atomic/racing/invalid pack swaps and disposal; 422 visible colliders, 330 bridge ray samples and four controller ramp walks. |
| npm run verify:stage4:browser | Passed; zero warnings/errors | Six views; real WebP/Basis KTX2 and invalid-file retention; baked/instanced texture scale pixel error 0; three disposal cycles return GPU resource counts to baseline; incremental 20-32 calls and 235032-249224 triangles. |
| Live game Stage 4 browser | Passed; zero warnings/errors | Authentication, production assets, live rendering, resize and downed recovery at 230/230 HP on an isolated in-memory QA server. |
| npm run verify:stage5 | Passed November 13 UTC | Strict protocol boundaries, authority and surface normals, 120-second pool simulation, counter contact/dedup/expiry, grounded footsteps/skids; three observers, forged packets, late join and delayed duplicate delivery. Empty sessions discard transient effects before the next player joins. |
| npm run verify:stage5:browser + Enable audio / verify | Passed; zero warnings/errors | 120-second simulated effect load; mixed burst +3 calls / 512 triangles; GPU cleanup; real HRTF left/right, voice limits/priority, natural source end, mute, disconnect and context disposal. Six-second stereo WAV peak 0.178. |
| Live game Stage 5 browser | Passed; zero warnings/errors | Production assets, login, recovery and live rendering; Game sound checkbox stores true/false mute preference. Saved menu/game screenshots. |
| npm run verify:stage6 | Passed November 13 UTC | Seven restoration reasons, bounded profile history, reduced motion and a scripted four-district/three-act route with eight boss intros and Dreadnought finale. Three real peers keep moving/receiving snapshots during playback. |
| npm run verify:stage6:browser | Passed; zero warnings/errors | Seven rendered views, skip at every shot, FOV restoration, fifty overlay disposals and stable warmed GPU geometry counts. |
| Live game Stage 6 browser | Passed; native tab/minimize qualification pending | Natural completion; Escape/Space and movement skip; damage/death/page-hide; preference storage; forced disconnect/relogin without replay; mouse capture restores and field menu stays closed. Automation did not produce native hidden-tab state. |

Browser reports below were produced during the implementation runs. Build, regression and asset validation were rerun for this saving checkpoint.

## Decisions and limits

- Keep the Section 6 dependency order. Do not start cinematics until Stages 3-5 pass.
- Preserve legacy world/orb/objective data and established gameplay; maintain rich multipart procedural fallbacks and validated optional GLTF models.
- Vehicles use 1,000 HP: hood below 50%, doors/trunk below 25%; physical debris expires after 12 seconds with a global cap of 64; wrecks reset after 20 seconds.
- Relays have three 120-HP vents. Lost cooling raises heat; shutdown parks dishes and triggers an eight-second automatic repair/reboot. It does not bypass hacking or boss requirements.
- Controlled Stage 3 render budgets pass; shared buffer reuse reduces matched city draw calls by 44%. Minimum-hardware GPU/frame-time and sustained multiplayer qualification remain open.
- Generated local databases, credentials, node_modules, build maps, QA server helpers and caches remain excluded by .gitignore. Runtime asset binaries and the existing tracked public/game.js bundle are saved.
- Packet 0x08 v2 adds 8 bytes per dropped weapon for visual variant/scale. The new decoder accepts v1; deploy matching browser/server builds together. Other packet layouts and damage timing remain unchanged.
- The Capoeira ZIP/FBXs stay in the ignored local inbox; the verified GLB is a game runtime asset. Y Bot remains the consistent source for future animations. No missing Idle/Run/Jump/Hit/Death clips were fabricated.
- Bridge highways start on the existing 14 m city sea-wall and end at visible viewing barriers. Their decks/rails have matching shared collision; distant headlands and peninsula neck are scenery, not a new playable terrain system.
- World triplanar mapping applies to static surfaces. Animated rigs retain UV maps. Valid texture packs swap atomically; deterministic procedural maps remain an explicit fallback.
- The sky and water reuse the installed real HDR; neon water streaks are stylized, not screen-space reflections. The pinned official KTX2 test fixture is kept in ignored QA output, never used as production scenery.
- Keep the 18 km camera range, world-distance SSAO thresholds and distant ink fade together. Controlled complexity checks are not hardware FPS certification.
- Effects packet 0x0B is a versioned cosmetic server-to-client extension. Strict validation, stable IDs and bounded queues suppress prediction/reconciliation duplicates; deploy matching client/server bundles. Gameplay damage and awards remain authoritative and unchanged.
- Counter audiovisual contact is 0.48 seconds within the existing 0.65-second paired pose. Replicated pair progress drives visual contact; damage/input-lock timing is preserved.
- Four fixed instanced effect batches cap GPU resources. Audio uses 16 prioritized one-shot HRTF channels, six orb loops and four engines; hidden/disconnected state silences and clears pending presentation.
- Stage 5 sound is honestly synthesized procedural PCM, not a downloaded sound pack. Final recorded audio may refine it later through the same bounded event path. No placeholder files were added.
- Cinematics own only presentation and never pause multiplayer, add immunity or award progression. The 11.5-second opening starts only while more than 11.5 seconds of existing deployment protection remain.
- Boss introductions require authoritative mission-stage and living entity snapshots. Camera tracks follow current actor facing/position; seen/skip/interruption history is per callsign and local to this browser.
- Camera/HUD/input restore on every exit; prior pointer capture is requested again only when gameplay/focus permit, with safe fallback to clicking the city. Reduced motion uses stationary shots.
- The three-act route is a scripted integration check using QA teleport/damage acceleration. Uncoached playability, minimum-hardware FPS, native background behavior and eight-player reliability remain separate release gates.

## Remaining release work

- [ ] Qualify the completed Stage 1-6 implementation on declared minimum hardware; preserve controlled resource budgets and regression coverage.
- [ ] Have five unfamiliar players finish the opening district without coaching.
- [ ] Run an eight-player, 30-minute playtest on realistic network conditions and declared minimum hardware.
- [ ] Validate frame times, combat balance, accessibility, reconnects and persistence.
- [ ] Qualify native tab/minimize visibility, focus and pointer capture in target browsers; automation page-hide and controller interruption checks already pass.
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
| 2026-11-11T20:55:58Z | Committed the combined checkpoint as 65a06a2 and pushed feat/section6-progress-checkpoint to origin; code, runtime assets, reports and evidence are saved. |
| 2026-11-11T20:56:10Z | Opened PR #1 against main: https://github.com/trvsvrgd/crackup/pull/1. No merge or production deployment was performed. |
| 2026-11-11T20:57:00Z | Attempted an APPROVE review; GitHub returned HTTP 422 because the authenticated account is the PR author. Recorded the delivery outcome and reviewer handoff in this artifact. |
| 2026-11-12T20:52:50.868Z | Completed Stage 3D and controlled combined Stage 3 gate. Built the genuine 39-clip Capoeira/Y Bot library, retargeted Armada onto visible armor, added three shared weapons/scaled disarms, reduced city draw calls by 44%, and passed build/regression/assets/browser/live QA. Stage 4 is next; no commit, push or deployment. |
| 2026-11-13T03:49:47.023177Z | Stage 4 completed and verified: triplanar/fallback/external PBR, real codecs, Gerstner bay, two physical bridges, headlands, height fog and dusk/night. Build, full regression, 18 assets, six-view browser budgets and live game pass. Stage 5 is next; work remains local and uncommitted. |
| 2026-11-13T13:48:10.375217Z | Completed Stage 5 authoritative combat effects and bounded HRTF sound. Build, complete regression, 18 real assets, three-client replication and empty-session no-replay, two-minute simulated pools, actual WebAudio and live game settings/recovery pass. Stage 6 is next. All new work remains local and uncommitted; hardware FPS and sustained eight-player qualification remain open. |
| 2026-11-13T19:18:27.109948Z | Completed Stage 6 in-engine opening and authoritative boss intros; verified skip, camera/HUD/input/pointer restoration, profile history, damage/death/page-hide/disconnect recovery, three-client continuity and scripted three-act route. Build, complete regression, 18 assets and browser checks pass. Release qualification remains open. Work is local and uncommitted. |

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
- [stage3d-verification.json](./evidence/stage3d-verification.json) — verification report
- [stage3d-browser.json](./evidence/stage3d-browser.json) — verification report
- [stage3d-regression.log](./evidence/stage3d-regression.log) — full regression log
- [capoeira-build.json](./evidence/capoeira-build.json) — source hashes and conversion report
- [stage3d-assets.json](./evidence/stage3d-assets.json) — asset validation report
- [stage3d-assets-browser.json](./evidence/stage3d-assets-browser.json) — production loader browser report
- [stage3d-weapons.png](./evidence/stage3d-weapons.png) — browser screenshot
- [stage3d-capoeira.png](./evidence/stage3d-capoeira.png) — browser screenshot
- [stage3d-aim.png](./evidence/stage3d-aim.png) — browser screenshot
- [stage3d-city.png](./evidence/stage3d-city.png) — browser screenshot
- [stage3d-live.png](./evidence/stage3d-live.png) — browser screenshot
- [stage4-verification.json](./evidence/stage4-verification.json) — shared physics and texture ownership checks
- [stage4-browser.json](./evidence/stage4-browser.json) — six-view GPU/browser codec and resource report
- [stage4-regression.log](./evidence/stage4-regression.log) — full Phase 1-6 and Stage 1-4 regression log
- [stage4-codec-source.json](./evidence/stage4-codec-source.json) — real codec fixture provenance and hash
- [stage4-assets.json](./evidence/stage4-assets.json) — 18 production assets hash and decode report
- [stage4-live-console.log](./evidence/stage4-live-console.log) — live game console: zero warnings and errors
- [stage4-live-recovery.yml](./evidence/stage4-live-recovery.yml) — live agent recovery and mission HUD
- [stage4-roof.png](./evidence/stage4-roof.png) — browser screenshot
- [stage4-street.png](./evidence/stage4-street.png) — browser screenshot
- [stage4-bridge.png](./evidence/stage4-bridge.png) — browser screenshot
- [stage4-night.png](./evidence/stage4-night.png) — browser screenshot
- [stage4-live.png](./evidence/stage4-live.png) — browser screenshot
- [stage5-verification.json](./evidence/stage5-verification.json) — shared physics, event, queue and pool checks
- [stage5-network.json](./evidence/stage5-network.json) — three-client authoritative effect replication and forged-packet checks
- [stage5-browser.json](./evidence/stage5-browser.json) — real GPU pool and WebAudio HRTF/resource checks
- [stage5-build.log](./evidence/stage5-build.log) — TypeScript and browser bundle build
- [stage5-regression.log](./evidence/stage5-regression.log) — complete Phase 1-6, alpha and Stage 1-5 regression log
- [stage5-effects.png](./evidence/stage5-effects.png) — pooled blast and impact screenshot
- [stage5-counter.png](./evidence/stage5-counter.png) — paired counter wave screenshot
- [stage5-skids.png](./evidence/stage5-skids.png) — tire skid strip screenshot
- [stage5-live-menu.png](./evidence/stage5-live-menu.png) — live sound preference and credits screenshot
- [stage5-live.png](./evidence/stage5-live.png) — live game and recovery screenshot
- [stage5-audio.wav](./evidence/stage5-audio.wav) — six-second stereo synthesized cue audition
- [stage5-assets.json](./evidence/stage5-assets.json) — 18 production asset hashes and decode checks
- [stage5-live-console.log](./evidence/stage5-live-console.log) — live game console: zero warnings and errors
- [stage6-verification.json](./evidence/stage6-verification.json) — camera lifecycle and scripted three-act integration
- [stage6-network.json](./evidence/stage6-network.json) — three-client continuity and authoritative encounter checks
- [stage6-browser.json](./evidence/stage6-browser.json) — seven-view GPU and overlay cleanup report
- [stage6-live.json](./evidence/stage6-live.json) — live UI histories, restoration checks and automation limits
- [stage6-build.log](./evidence/stage6-build.log) — strict TypeScript and client bundle build
- [stage6-regression.log](./evidence/stage6-regression.log) — complete Phase 1-6, alpha and Stage 1-6 regression
- [stage6-assets.json](./evidence/stage6-assets.json) — 18 production asset hashes and decode checks
- [stage6-live-console.log](./evidence/stage6-live-console.log) — live game console: zero warnings and errors
- [stage6-bridge.png](./evidence/stage6-bridge.png) — bridge fly-in screenshot
- [stage6-agent.png](./evidence/stage6-agent.png) — agent arrival shot
- [stage6-lieutenant.png](./evidence/stage6-lieutenant.png) — lieutenant introduction shot
- [stage6-kingpin.png](./evidence/stage6-kingpin.png) — kingpin introduction shot
- [stage6-dreadnought.png](./evidence/stage6-dreadnought.png) — existing Dreadnought introduction shot
- [stage6-live-settings.png](./evidence/stage6-live-settings.png) — live Intro cameras setting
- [stage6-live-reconnected.png](./evidence/stage6-live-reconnected.png) — live game restored after reconnect without replay
- [stage6-live-death.png](./evidence/stage6-live-death.png) — live downed UI restored during interrupted intro
- [stage6-live-city.png](./evidence/stage6-live-city.png) — live opening city view
- [stage6-live-vehicle.png](./evidence/stage6-live-vehicle.png) — live opening vehicle view
- [stage6-live-restored.png](./evidence/stage6-live-restored.png) — live opening completion and resumed Sera briefing

## Maintaining this artifact

Edit artifacts/project-progress.json when a checkpoint passes. Append a dated log entry, attach the new evidence, and update the resume checklist. Keep unfinished dependencies blocked.

Run npm run progress to rebuild this document and npm run progress:check to validate it. The check validates dependencies, saved-evidence hashes and generated-document consistency. PR approval remains governed by the live GitHub review state.

Detailed history: [Section 6 progress](../SECTION6_PROGRESS_REPORT.md), [implementation plan](../SECTION6_IMPLEMENTATION_PLAN.md), [alpha notes](../ALPHA_RELEASE_NOTES.md), [Phase 6 report](../PHASE6_PROGRESS_REPORT.md).
