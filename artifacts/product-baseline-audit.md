# CRACKUP P0 product baseline audit

Recorded November 13, 2026 (America/Chicago), following the owner's instruction to proceed. This is an initial audit checkpoint, not acceptance of P0 or any complete-game requirement. The [requirements](../docs/PRODUCT_REQUIREMENTS_V3.md) and [delivery plan](../docs/PRODUCTION_DELIVERY_PLAN.md) remain the product baseline.

**Later continuation:** [owner decisions, restart evidence and opening specification](product-p0-continuation.md) supersede the unresolved scope/offline/spending notes below. This initial report retains its original measurement scope; it is not silently rewritten as a new run.

## Build and measurement identity

- Branch: `feat/section6-progress-checkpoint`; HEAD: `4af95ab1d82d2089cf886858e50cc85af40f6b58`. Substantial uncommitted implementation predates this task.
- `npm run build` passed: TypeScript and a fresh client bundle. No gameplay source was edited during this audit. The rebuilt bundle is 4,053,108 bytes.
- [Build identity](evidence/p0-build-identity.json) hashes 99 game source/runtime/configuration files, including runtime assets. Combined digest: `ebeeb4237355687080fb0af269aac51e7a8fb2e1460520e27e121f15bacf31bc`.
- The audit ran a separate current-source server on port 3217 with a private test database. It did not use or alter the existing service on port 3000 or the user's game database. The audit server and its browser sessions were stopped afterward.
- [Observed hardware](evidence/p0-hardware.json): i7-10700K (8 cores/16 logical processors), approximately 64 GB installed RAM, Windows 11 Home, RTX 5070 with approximately 12 GB VRAM, driver 616.92. **The requested 16 GB / desktop RTX 4070 class remains the product target. This host does not qualify it.**

## Inventory grounded in source and runtime data

| Area | Actual inventory / implementation | Product implication | Treatment |
| --- | --- | --- | --- |
| Shared world | 1,663 structure records; 18 architecture plans across four districts; 182 orbs. | A geometry inventory does not establish neighborhoods, authored streets, interiors or discovery density. | Reuse structural contracts; author the missing world experience. |
| Campaign structure | Four district operations with two terminals, lieutenant, kingpin and core override; six story beats across three acts. | Four repeated operation structures do not meet the proposed 24 authored missions, side arcs or 12–18-hour campaign. | Preserve current mechanics; introduce authored mission/encounter data and varied spaces. |
| Starting actors | Nine enemies, four controllable vehicle instances and 12 dynamic props in a newly instantiated shared world. | Counts do not establish eight tactical roles, ambient population, traffic or distinct handling profiles. | Reuse existing managers and physics; add behavior/content deliberately. |
| Progression | Five chassis and 20 nodes exist. | Important reusable foundation; normal-player teaching, build viability and campaign economy remain unaccepted. | Retain server authority and add meaningful campaign balance evidence. |
| Weapons | Carbine, marksman and heavy are three presentation profiles. Source explicitly says they do not change damage, fire rate or progression. | Three meshes are not three mechanically distinct weapons. | Define weapon handling/ammo/role contract before buying more models. |
| Animation | 23 declared visible-rig states. Only the third combo's `armada` selection uses the imported Capoeira motion; other states use procedural poses. | The 39-clip library does not mean 39 integrated gameplay animations. Procedural states still need quality/contact review. | Preserve the retarget path; complete state/actor/transition coverage. |
| Installed source rigs | Soldier: four clips; Xbot: seven; Capoeira/Y Bot: 39. | Sample/source rigs are reusable material, not final named characters or accepted performance. | Keep genuine provenance; adapt only necessary sources. |
| Materials | Four installed PBR families: concrete, asphalt, corrugated iron and carbon fiber; environment HDR and existing PBR/vista systems. | Sufficient ingredients for a reference scene, insufficient coverage evidence for the full world. | Establish one coherent target scene before acquiring large packs. |
| AI | Patrol, proximity targeting, obstacle whiskers, separation and melee/counter states are present in inspected code. | Cover, memory, deliberate squad tactics, capable vertical navigation and civilian routines need observable proof or implementation. | Build a scenario corpus; evolve behavior while retaining authority. |
| Saves | Individual profile/progression fields exist; mission/world operations are live session state in the current design. | A complete personal campaign needs durable mission/checkpoint/world ownership. | Prototype versioned campaign persistence and guest policy in P1. |
| UI/input | Keyboard/mouse onboarding, mission HUD, field menu and upgrades exist. The menu says the online world continues. | Controller/remapping, true solo pause, full map/journal and comprehensive accessibility need work. | Treat these as launch product requirements. |
| Audio/cinema | Bounded effects/synthesized sound and short in-engine opening/boss sequences exist. | Final voices, authored sound/music identity, character performance and complete scenes are production work. | Use finished representative sound/performance in the opening sample. |

Sources: [content inventory](evidence/p0-content-inventory.json), [animation mapping](evidence/p0-animation-coverage.json), [existing engineering ledger](project-progress.md), the source references in requirements section 2, and the captured live run below. Entries labeled gaps are not evidence that every related line of code is absent; they identify missing product acceptance or specific inspected limitations.

## Input-driven opening observation

A separate Playwright-controlled client used normal account entry, movement, jump, interaction, melee/counter and aiming/firing. No teleport, forced damage, progression injection or direct gameplay-state mutation was used. Development telemetry was enabled for observation.

The run interacted with the relay objective, exercised weapon/limb feedback and reached the downed state. The final snapshot shows one of two relays hacked, 0/230 health and the recovery flow. **It did not finish the opening operation.** Fresh test profiles on the same live server observed shared district progress; this is consistent with current session-owned world state, not a personal campaign implementation.

The first headed capture was interrupted when its target returned to a blank page. It does not establish an application crash. A second isolated headless run produced the diagnostic and screenshots. No usable video was retained, and none is claimed as evidence. The captured menu image is labeled as a menu rather than a street view.

- [Opening/combat screenshot](evidence/p0-opening-combat.png)
- [Field menu screenshot](evidence/p0-field-menu.png)
- [Final HUD snapshot](evidence/p0-final-snapshot.txt)
- [Raw observation and frame intervals](evidence/p0-runtime-observation.json)
- [Stored test-profile check](evidence/p0-stored-profiles.json): three task-created profile records, SQLite quick check `ok`. This is not a full resume/migration/campaign-restart acceptance test.

Observed friction and production implications:

1. The objective loop and interaction prompts work as a technical starting point. The play sample is too brief and automation-driven to judge onboarding or balance; the downed result is not proof of a balance defect.
2. Broad open ground, sparse street dressing, sample/procedural silhouettes and repeated tower language remain visible. More map area would multiply the current world-content problem.
3. The comms presentation and objectives communicate instructions, but this is not a fully staged character scene or authored mission arc.
4. The field menu explicitly leaves the world running, even with only one player. The new solo pause contract therefore needs deliberate implementation.
5. Captured UI/debug data and isolated account rows are safe test evidence; the test database and credentials are not included as public artifacts.

## Limited runtime diagnostic

| Measurement | Observed result | Limits |
| --- | --- | --- |
| Browser/GPU | Chrome automation, headless, ANGLE Direct3D11 on RTX 5070 | Different GPU/RAM from requested reference; other system workload was not controlled. |
| Viewport | 1,440 × 900, device pixel ratio 1, current Standard preset | Not the proposed 2,560 × 1,440 High reference configuration. |
| Sample | 25.013 seconds, 859 requestAnimationFrame intervals | One local player; mixes movement, combat, screenshots and eventual downed state; no representative eight-player load. |
| RAF cadence | Mean 34.34 frames/s; p50 33.3 ms; p95 33.5 ms; p99 50.1 ms; no interval >100 ms in this sample | RAF cadence is not isolated CPU/GPU render time or input latency. Recording/automation overhead was not isolated. Do not extrapolate to a 4070. |
| JavaScript heap | Approximately 257.5 MiB used, 347.2 MiB allocated at sample end | Excludes process-tree RAM, GPU allocations and most native/WASM accounting. Not a 16 GB memory qualification. |
| Resource timing total | 91,668,077 transferred bytes reported since navigation | Local unthrottled page, warm/reused browser session; not cold internet startup timing or steady gameplay bandwidth. |
| Console | No error-level messages returned for the diagnostic session | A short successful run does not establish session reliability or compatibility. |
| Server | Health endpoint was available; approximately 60 ticks/s across its lifetime | No eight-player tick-cost, event-loop percentile or host-capacity qualification. |

The diagnostic justifies early profiling of render submission, repeated geometry/material work, shadows/postprocessing, world culling and animation/physics CPU cost. It does not identify the dominant bottleneck. P1 must capture CPU/GPU traces and compare one change at a time before choosing optimizations or migration.

## Prioritized gaps and next production packages

| Priority | Gap | Next concrete output | Requirements affected |
| --- | --- | --- | --- |
| 1 | No accepted production-quality world/mission sample | A connected Docks street, furnished interior and roof route with a clear mission flow and target art treatment. | FR-WORLD-01–05, FR-ART-01/03/05, FR-CAMP-01/02 |
| 1 | Unproven frame/memory headroom | Profile the reference scenes and a representative actor load; derive bounded LOD/culling/material/shadow/AI budgets. | NFR-PERF-01–08 |
| 1 | Incomplete visible animation coverage/contact quality | Complete the actor/state/transition matrix and a normal-input movement/combat reel. | FR-ANIM-01–05, FR-PLAY-01–04 |
| 1 | No durable personal campaign contract | Versioned mission/checkpoint/world ownership schema; restart and guest-progress prototype. | FR-SAVE-01–03, FR-NET-02, NFR-DATA-01–03 |
| 2 | Limited tactical behavior and weapon roles | Three complementary enemy roles with perception/navigation scenarios and two mechanically distinct weapon profiles. | FR-AI-01–04, FR-PLAY-03/05 |
| 2 | Solo input/comfort gaps | Controller/remapping proof, solo pause/focus behavior, captions and motion controls in the sample. | FR-UX-01–04/06 |
| 2 | Presentation is not final performance | One performed exchange with final sample character treatment, foley, weapon/vehicle layers and adaptive music. | FR-NAR-01/03, FR-AUD-01–04, FR-ANIM-06 |

### Opening operation production brief: “A Human Signal”

This is a proposed authored operation for the first production sample, not a newly implemented mission or approved rewrite of existing mechanics. Preserve the old operation route/tests while the new mission data layer is evaluated; approve any intentional behavior/save migration explicitly.

**Player intent:** enter a believable Docks neighborhood as a newly deployed agent, learn expressive movement and readable combat, discover evidence that complicates the official briefing, and earn a useful advancement. Target 30–45 minutes without mandatory grinding. Fit the revelation to the accepted three-act script so the sample does not prematurely spoil Act II.

| Segment | Intended play | Space and production dependency | Acceptance emphasis |
| --- | --- | --- | --- |
| Arrival / preparation | Briefing, first controls, visible route choices and a practical loadout/upgrade explanation. | Finished safehouse/drop point, street landmark, performed handler exchange. | Player understands the first goal without coaching; no mandatory second player. |
| Street investigation | Follow a lead, observe civilian reaction and encounter an optional side task. | Connected street, storefront/public space, civilian family and traffic sample. | Navigation and world purpose are legible; discovery is more than a distant marker. |
| Interior objective | Recover a witness/data source using combat, movement and a meaningful tactical alternative. | One furnished mission interior with two approaches, readable cover and reliable navigation. | Different enemy roles/weapon choices matter; fail/retry and critical evidence remain recoverable. |
| Rooftop route | Use taught traversal to carry information or reach a vantage point. | Authored roof sequence, safe fall recovery and deliberately placed collectibles. | Movement/animation/contact quality and camera remain readable. |
| Escalation / boss | Combine the learned tools against a distinctive encounter; permit solo and scaled group tactics. | Boss arena, accepted move set/telegraphs, effects/audio and checkpoint. | A normal-input win has readable causes; retry is quick and does not erase earlier progress. |
| Resolution / return | Deliver the result, receive a useful reward, hear character response and save/resume. | Hub aftermath, journal/recap, durable checkpoint and a small world-state change. | Story context and progress survive quitting; next goal is useful and clear. |

The sample also contains one short side mission, two challenges, one event template and companion practice as required by the v3 content envelope. These are integrated around the critical route rather than counted as filler within its duration.

### P1 packages prepared for execution

1. **Target scene: Docks street.** Input: existing architecture/material pipeline and the street screenshot. Output: a coherent street section with entrances, sidewalk/road, light/dressing hierarchy and a clear near/mid/far composition. Verify street-scale art rubric, collision, route legibility and draw/frame/memory traces. Use owned/free verified resources first.
2. **Target scene: interior and roof.** Output: one furnished traversable interior linked to an authored roof route, using named interaction/navigation anchors. Verify camera, collision, navigation, lighting and progression-tier reachability. Blockouts stay explicitly unfinished until art acceptance.
3. **Profile and production budgets.** Output: repeatable capture routes, CPU/GPU frame breakdown, full process/GPU memory observations, load/download measurements and a representative peak actor fixture. Verify one measured optimization and its visual tradeoff; do not infer a required engine migration from this single RAF sample.
4. **State and content contracts.** Output: versioned asset/rig/material/weapon/mission data contracts, accepted core state coverage and invalid-content rejection cases. Retain stable IDs and shared collision/authority contracts.
5. **Solo/session/save proof.** Output: explicit personal campaign and guest reward policy, checkpoint transaction prototype, solo pause, and reconnect/restart demonstration. Decide true offline delivery before committing to runtime/distribution.

These packages are ready to size against actual work. No honest calendar forecast exists yet; measure accepted output and rework hours during the sample.

## P0 checkpoint and unresolved decisions

| Package | Checkpoint result |
| --- | --- |
| P0.1 Inventory and normal-input observation | Initial source/data inventory and short live route captured. Complete opening playthrough and full content audit remain future acceptance work. |
| P0.2 Baseline review | Product direction and instruction to proceed confirmed. Detailed quantities/NFR thresholds remain clearly proposed; no per-requirement owner acceptance is invented. |
| P0.3 Machine/performance baseline | Available host and a limited diagnostic recorded. Requested 16 GB/4070 device qualification, CPU/GPU timing, process memory and cold startup remain open. |
| P0.4 State/visual audit and opening brief | Initial state matrix, representative captures, production gaps and concrete opening/P1 packages prepared. Final target art scenes still require P1 construction/review. |
| P0.5 Capacity/budget/risk | Solo + AI, no date and no authorized additional spending/hiring are recorded. Owner hours/spending ceilings remain undecided; use existing resources for present audit work. Offline/runtime consequences remain a P1 decision. |

**P0 remains in progress.** The requirements-authoring task is complete; this execution checkpoint supplies evidence and next work without claiming final product, reference-machine, or human acceptance. Do not advance the status ledger past a gate whose exit contract remains open. Remaining choices can be recorded as the owner supplies them; none is being treated as implicit permission to spend money.
