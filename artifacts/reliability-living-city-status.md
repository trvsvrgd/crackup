# Reliability and living-city execution ledger

Created November 19, 2026. **LC00 underway: P001–P004 baseline, correlation, durable diagnostics and recovery exports technically verified; recovery/crash fixes and LC00 acceptance remain open.**

Specification: [PRD addendum](../docs/PRD_ADDENDUM_RELIABILITY_AND_LIVING_CITY.md). Work orders: [72-prompt pack](../docs/RELIABILITY_LIVING_CITY_PROMPTS.md). Parent program: [product delivery status](product-delivery-status.md).

Durable coding cursor: [checkpoint JSON](reliability-living-city-checkpoint.json). Discovery instructions: [project AGENTS.md](../AGENTS.md). Animation detail: [traversal pack specification](../docs/TRAVERSAL_ANIMATION_PACK_SPEC.md). A plain `continue` resumes the active task; fresh program sessions reconcile the cursor with actual files before coding. See the [P001 failure baseline](lc00-p001-failure-baseline.md) for actual observations and open defects.

## Resume here

**Next work: P005 / LC00 / LC-OBS-05 — measure stalls, queues, resource counts and logging overhead.** Read [P004 implementation evidence](lc00-p004-recovery-reports.md), [storage/retrieval contract](../docs/DIAGNOSTIC_STORAGE.md) and [schema](../docs/DIAGNOSTIC_EVENT_SCHEMA.md). Retain >1-second frames and label pause/background periods; prove a controlled 500 ms stall and compare equivalent capture-enabled/disabled runs. The owner confirmed `Start CRACKUP.bat`. LC-BUG-007's slow-connection recovery failure and original spontaneous crash attribution remain open. Preserve the working tree and personal campaigns. No LC phase is accepted.

Confirmed scope: exactly **1,000 persistent orbs total**, 250 per district as the proposed distribution; “shards” refers to the same orbs. Preserve offline solo, no additional spending, four districts, existing campaign scope, and host/guest ownership. All other new numerical tuning defaults are identified as proposals in the PRD.

## Phase gates

| Phase | Prompts | Depends on | Status | Required exit evidence |
| --- | --- | --- | --- | --- |
| LC00 | P001–P006 | None | In progress | P001–P004 technically verified; P005–P006 instrumentation/triage/interruption proofs remain. |
| LC01 | P007–P012 | LC00 | Unverified | Save ownership/slots/backups/migration and 100 kill/restart trials. |
| LC02 | P013–P018 | LC01 | Unverified | Correct save/Agent return, lifecycle/reconnect, original failure repair and offline package proof. |
| LC03 | P019–P024 | LC02 | Unverified | Four district plans, connected routes/streaming, reviewed reference neighborhood and validators. |
| LC04 | P025–P030 | LC03 | Unverified | Twelve neighborhoods, 24 archetypes with variants, playable advertised interiors and budgets. |
| LC05 | P031–P036 | LC04 | Unverified | Actual walking/reactive civilians, authoritative interactions, appearance and density samples. |
| LC06 | P037–P042 | LC05 | Unverified | Actual traffic, legal intersections, obstruction/interaction behavior and presentation. |
| LC07 | P043–P048 | LC06 | Unverified | All spawn producers covered, 500 admission trials, all-watched progression and fairness. |
| LC08 | P049–P054 | LC07 | Unverified | Runtime actor/state coverage, remote behavior, final assets and human motion review. |
| LC09 | P055–P060 | LC08 | Unverified | Exactly 1,000 stable reachable orbs, migration, authority, balance and hunt evidence. |
| LC10 | P061–P066 | LC09 | Unverified | Accepted sound, proximity/voice/lifecycle/accessibility checks and long listening review. |
| LC11 | P067–P072 | LC10 | Unverified | Integrated journeys, regressions, load/soak, human review, upgrade/restore and final audit. |

## Requirement and work-package status

Allowed statuses: `Unverified`, `In progress`, `Technically verified`, `Experience pending`, `Accepted`, `Blocked`. Track verification and reviewer separately; a technical pass does not imply human acceptance or target-hardware qualification. Evidence must identify the relevant build and actual input method. Blocked entries need a concrete reason and next action.

| Requirement | Prompt | Phase | Status | Evidence / reviewer / remaining work |
| --- | --- | --- | --- | --- |
| LC-OBS-01 | P001 | LC00 | Technically verified | [P001 baseline](lc00-p001-failure-baseline.md): recovery/diagnostic failures captured; owner confirmed BAT launch, original spontaneous crash cause unresolved. |
| LC-OBS-02 | P002 | LC00 | Technically verified | [P002 evidence](lc00-p002-correlated-diagnostics.md): schema/privacy/flood and real socket/SQLite/launcher/browser correlation verified; earlier slow-connection journey failed and remains open. |
| LC-OBS-03 | P003 | LC00 | Technically verified | [P003 evidence](lc00-p003-durable-diagnostics.md): rotation, retention, process restart, browser reload/offline/fallback, log-failure save isolation and upload admission passed. Storage/qualification limits documented. |
| LC-OBS-04 | P004 | LC00 | Technically verified | [P004 evidence](lc00-p004-recovery-reports.md): bounded selected-session exports; 16 final browser and seven restart/race checks, actual prior runtime revision 26, access/privacy and affected regressions passed. Human/hardware qualification remains open. |
| LC-OBS-05 | P005 | LC00 | Unverified | Pending full stall/resource instrumentation. |
| LC-OBS-06 | P006 | LC00 | Unverified | Pending demonstrated triage and phase gate. |
| LC-SAV-01 | P007 | LC01 | Unverified | Pending state/identity ownership inventory. |
| LC-SAV-02 | P008 | LC01 | Unverified | Pending transactional acknowledgement proof. |
| LC-SAV-03 | P009 | LC01 | Unverified | Pending revisions, backups and manual slots. |
| LC-SAV-04 | P010 | LC01 | Unverified | Pending real storage-failure recovery. |
| LC-SAV-05 | P011 | LC01 | Unverified | Pending supported migration/rollback fixtures. |
| LC-SAV-06 | P012 | LC01 | Unverified | Pending 100 kill/restart trials. |
| LC-RET-01 | P013 | LC02 | Unverified | Pending real save-selection UI. |
| LC-RET-02 | P014 | LC02 | Unverified | Pending explicit compatible Agent choice. |
| LC-RET-03 | P015 | LC02 | Unverified | Pending 100 reconnect trials. |
| LC-RET-04 | P016 | LC02 | Unverified | Pending lifecycle state/recovery matrix. |
| LC-RET-05 | P017 | LC02 | Unverified | Pending measured crash/stall fixes. |
| LC-RET-06 | P018 | LC02 | Unverified | Pending installed offline return journey. |
| LC-CITY-01 | P019 | LC03 | Unverified | Pending parcel and district audit. |
| LC-CITY-02 | P020 | LC03 | Unverified | Pending twelve connected neighborhoods. |
| LC-CITY-03 | P021 | LC03 | Unverified | Pending navigation corpus. |
| LC-CITY-04 | P022 | LC03 | Unverified | Pending streaming/resource lifecycle proof. |
| LC-CITY-05 | P023 | LC03 | Unverified | Pending reviewed reference neighborhood. |
| LC-CITY-06 | P024 | LC03 | Unverified | Pending authoring validators and gate. |
| LC-ARC-01 | P025 | LC04 | Unverified | Pending 24 distinct district archetypes. |
| LC-ARC-02 | P026 | LC04 | Unverified | Pending variants and adjacency audit. |
| LC-ARC-03 | P027 | LC04 | Unverified | Pending occupied-looking frontage/roofs. |
| LC-ARC-04 | P028 | LC04 | Unverified | Pending real advertised interiors. |
| LC-ARC-05 | P029 | LC04 | Unverified | Pending gameplay geometry regressions. |
| LC-ARC-06 | P030 | LC04 | Unverified | Pending city art budgets and review. |
| LC-PED-01 | P031 | LC05 | Unverified | Pending real walking/activity samples. |
| LC-PED-02 | P032 | LC05 | Unverified | Pending crowded-route navigation. |
| LC-PED-03 | P033 | LC05 | Unverified | Pending civilian threat/world reactions. |
| LC-PED-04 | P034 | LC05 | Unverified | Pending hidden population lifecycle/scaling. |
| LC-PED-05 | P035 | LC05 | Unverified | Pending authority/persistence proof. |
| LC-PED-06 | P036 | LC05 | Unverified | Pending animated appearance families. |
| LC-TRF-01 | P037 | LC06 | Unverified | Pending legal lane/junction graphs. |
| LC-TRF-02 | P038 | LC06 | Unverified | Pending moving traffic samples. |
| LC-TRF-03 | P039 | LC06 | Unverified | Pending crossing/jam recovery. |
| LC-TRF-04 | P040 | LC06 | Unverified | Pending ambient/player vehicle handoff. |
| LC-TRF-05 | P041 | LC06 | Unverified | Pending bounded hidden traffic lifecycle. |
| LC-TRF-06 | P042 | LC06 | Unverified | Pending six traffic archetypes and review. |
| LC-SPN-01 | P043 | LC07 | Unverified | Pending complete producer admission policy. |
| LC-SPN-02 | P044 | LC07 | Unverified | Pending all-player conservative visibility. |
| LC-SPN-03 | P045 | LC07 | Unverified | Pending physical reinforcement ingress. |
| LC-SPN-04 | P046 | LC07 | Unverified | Pending all-watched mission progression. |
| LC-SPN-05 | P047 | LC07 | Unverified | Pending 500 admission/hysteresis trials. |
| LC-SPN-06 | P048 | LC07 | Unverified | Pending fair encounters and gate. |
| LC-ANM-01 | P049 | LC08 | Unverified | Pending actual runtime asset/state inventory. |
| LC-ANM-02 | P050 | LC08 | Unverified | Pending final articulated archetypes. |
| LC-ANM-03 | P051 | LC08 | Unverified | Pending locomotion/traversal transitions. |
| LC-ANM-04 | P052 | LC08 | Unverified | Pending combat layers/contact timing. |
| LC-ANM-05 | P053 | LC08 | Unverified | Pending remote/lifecycle animation. |
| LC-ANM-06 | P054 | LC08 | Unverified | Pending validators and human motion review. |
| LC-ORB-01 | P055 | LC09 | Unverified | Pending 1,000 stable identities/migration. |
| LC-ORB-02 | P056 | LC09 | Unverified | Pending authored hidden placement routes. |
| LC-ORB-03 | P057 | LC09 | Unverified | Pending reachability of all 1,000 entries. |
| LC-ORB-04 | P058 | LC09 | Unverified | Pending authoritative durable collection. |
| LC-ORB-05 | P059 | LC09 | Unverified | Pending discovery/hints/accessibility. |
| LC-ORB-06 | P060 | LC09 | Unverified | Pending economy/performance hunt gate. |
| LC-AUD-01 | P061 | LC10 | Unverified | Pending three candidates and owner selection. |
| LC-AUD-02 | P062 | LC10 | Unverified | Pending smooth proximity/occlusion. |
| LC-AUD-03 | P063 | LC10 | Unverified | Pending bounded voice selection/lifetimes. |
| LC-AUD-04 | P064 | LC10 | Unverified | Pending persistent accessible controls. |
| LC-AUD-05 | P065 | LC10 | Unverified | Pending audio lifecycle/device recovery. |
| LC-AUD-06 | P066 | LC10 | Unverified | Pending long listening/mix acceptance. |
| LC-INT-01 | P067 | LC11 | Unverified | Pending continuous integrated journeys. |
| LC-INT-02 | P068 | LC11 | Unverified | Pending integrated regression manifest. |
| LC-INT-03 | P069 | LC11 | Unverified | Pending reference load/soak qualification. |
| LC-INT-04 | P070 | LC11 | Unverified | Pending five-person experience review. |
| LC-INT-05 | P071 | LC11 | Unverified | Pending package/upgrade/recovery drills. |
| LC-INT-06 | P072 | LC11 | Unverified | Pending original-request and parent-PRD audit. |

## Planning checkpoint

- Reviewed current save, launcher, report, world, character, audio, collectible, product-decision, and co-op-policy entry points. This was source/document inspection, not a fresh reproduction of gameplay failures.
- Existing autosave/checkpoint/report functionality is explicitly recognized; future work must diagnose and extend it rather than claim it is absent or already sufficient.
- Created 12 dependency-ordered phases, 72 requirement/work-package mappings, 16 integrated scenarios, and state/diagnostic/content/performance contracts.
- Owner confirmed the orb/shard terminology and exactly 1,000 total. Proposed allocation preserves 20 Renegade and 12 Whisper identities, expands Agility to 968, and retains old collection receipts.
- Planning envelope is 37–66 focused workdays, subject to actual throughput, asset availability, reviews, and qualification access; it is not a delivery commitment or the owner's available hours.
- All feature work, real fault tests, gameplay reviews, and performance qualification remain future work. Documentation validation does not accept those gates.

### Planning validation

November 19 structural validation passed: 72 unique requirement IDs, 72 consecutively numbered complete prompts, 72 matching ledger rows, 12 ordered phases, and 16 integrated acceptance scenarios. Every prompt maps to its intended requirement and phase; all prompt dependencies refer backward. All 15 local links in the three new documents resolve, as do their added README/parent-PRD index links. New documents have balanced code fences and no trailing whitespace. Scoped `git diff --check` passed for the two existing documents updated with discovery links. No gameplay build, runtime regression, human playtest, or hardware qualification was run for this documentation-only task.

## Future checkpoint entries

### November 20 execution: P004 recovery reports

Approximately 22 minutes (19:36–19:58 UTC; 13:36–13:58 America/Chicago). [P004 implementation and evidence](lc00-p004-recovery-reports.md) records selected-session exports, missing-tail/save-revision presentation, separate bug-description fields and honest local folder/download actions. Final client `client-ddb95d151b5656d0`; server `server-897b1f553c786474`. Four focused scenario groups, 16 final browser checks, seven previous-runtime/race checks and existing diagnostics/journal/quality/controller/12 solo/eight campaign regression groups passed. Build, scoped diff checks and progress validation passed. Actual forced runtime restart yielded a selectable previous session with revision 26 and 458 correlated events; failed harness attempts remain in evidence rather than being erased.

Decisions: read-only pre-login retrieval belongs only to loopback solo; hosted/shared logs remain operator-owned. Export is bounded and local, current state never substitutes for historical state, and suppression/unclean tails are explicit. Current browser packages offer copy-path/download rather than a nonexistent native folder bridge. Owned test browser/runtime stopped after identity/zero-agent checks; personal saves and unrelated edits preserved. Human/physical-controller/target-hardware acceptance and original spontaneous-crash cause remain pending. P004 is technically verified; LC00 remains unaccepted. Next exact work is P005 stall/queue/resource/overhead instrumentation, followed by P006 triage and interruption drills.

### November 19 follow-up: interruption recovery and traversal motion

Added during-work checkpoints, explicit stop/abrupt-cutoff recovery, running-command/process reconciliation, and fresh-session discovery through AGENTS.md. Added 20 concrete animation states, free-source pack acquisition/retargeting instructions, pre-jump compression/arms, ledge hand contact, soft/hard landings, and authoritative damaging-fall recovery. Expanded P006 and P049–P054 without renumbering the 72 work packages. Pack binaries/runtime animation changes and interruption drills remain future implementation; no LC gate has been accepted by this revision.

Follow-up document validation passed: 72 requirement/prompt/ledger mappings retained, 20 unique ordered animation coverage rows, 29 local links resolved across project instructions and the revised planning documents, valid initialized checkpoint JSON, and no trailing whitespace. Scoped diff checking passed for edited tracked documents. No runtime tests or interruption drills were executed for this documentation revision.

Append each bounded package result with start/end/elapsed time, build identity, decisions, changed paths, tests/results, evidence links, human/qualification status, success against the assigned prompt, and exact next dependency. Update the matching row and phase status. Keep prior failures and historical evidence discoverable.

### November 19 execution: P002 correlated diagnostics

This continuation ran approximately 11 minutes (November 20 03:42–03:53 UTC; November 19 local), excluding preparation before the earlier interruption. Reconciled stale process/checkpoint entries and an interrupted build, then completed and technically verified P002. [Implementation, changed paths, build IDs, tests and remaining work](lc00-p002-correlated-diagnostics.md). Final client `client-bb06f71e9dbc115e`; server `server-10c93b12133c370e`.

Six focused diagnostic scenario groups, existing quality/12 solo/eight co-op regression groups, final build, final normal-control browser journey, 63-event trace joins and progress checking passed. Two earlier browser journeys failed at disconnect/return; categorized evidence implicates the slow-connection guard and nonretryable 4008 recovery path, not the underlying queue-growth cause. LC-BUG-007 remains open. Personal saves and unrelated edits preserved; no spending or new service. Temporary test processes stopped after ownership checks. No human/target-hardware acceptance or LC00 phase acceptance claimed. Next: P003 durable bounded logs/browser journal; current checkpoint records its exact starting action.

### November 20 execution: P003 durable diagnostic journals

Approximately 29 minutes (13:43–14:12 UTC). [P003 implementation/evidence](lc00-p003-durable-diagnostics.md) records nine passing journal scenario groups, seven passing final Chromium checks, actual BAT missing-Node capture, real restart persistence, existing diagnostics/quality/solo/co-op regression passes, build and progress checking. Final client `client-89684873d268013c`; server `server-59e9091e77228abe`; 283 persisted events across four runtime sessions. Saved retrieval instructions and bounded retention controls. Added a separate diagnostics-test output override after its initial run replaced the prior P002 detailed JSON; that artifact now explicitly discloses the replacement, and its original command log remains intact.

Decisions: local bounded capture, 98 MB runtime plus 2 MB browser allowance per root/origin, seven-day retention, 10 MB rotation, proposed 256 MiB reserve, no new service/spending/save migration. Fault injection is labeled; no full-disk destruction, personal-save access, human acceptance or target-hardware qualification. Temporary owned processes stopped after current identity/empty-session checks. Next: P004 session selection, missing-tail presentation and recovery exports. Gameplay crash fixes, animation, city population and 1,000-orb expansion remain in their existing later phases.
