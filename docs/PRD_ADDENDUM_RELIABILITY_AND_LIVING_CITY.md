# CRACKUP PRD addendum: reliable return, a living city, and rewarding discovery

Version 1.1 · November 19, 2026 · Product owner: Travis · Status: implementation planning baseline; gameplay acceptance pending. Updated with interruption recovery and explicit traversal animation requirements.

This addendum turns the owner's observed problems into a sustained implementation program: inability to re-enter a saved game, frequent pauses/crashes, inaccessible diagnostic history, empty or repetitive city spaces, absent pedestrians and moving traffic, visible enemy materialization, simplistic unanimated characters, unpleasant orb sound, and insufficiently hidden collectibles. It defines **12 ordered phases, 72 requirements, and 72 executable work prompts**. It is intended to require substantial work across many coding sessions and days, including authored content, failure testing, real gameplay review, and optimization. Passing a build is not the outcome.

Read this document with the [72-prompt execution pack](RELIABILITY_LIVING_CITY_PROMPTS.md) and [dedicated execution ledger](../artifacts/reliability-living-city-status.md). Start future coding at the ledger's earliest unfinished dependency. This planning delivery does not implement or certify the features described here.

## 1. Authority, scope, and decisions

### 1.1 Relationship to existing requirements

The [complete-game PRD](PRODUCT_REQUIREMENTS_V3.md), [production plan](PRODUCTION_DELIVERY_PLAN.md), [owner decisions](PRODUCT_BASELINE_DECISIONS.md), [co-op ownership policy](CAMPAIGN_COOP_POLICY.md), and [Section 6 presentation addendum](../PRD-Addendum.md) remain applicable. This addendum supplies execution detail and new acceptance obligations for their reliability, world, animation, and exploration requirements. It does not replace the 24-mission campaign, four-district scope, 12–18-hour solo baseline, optional 1–8-player co-op, or the broader P0–P8 release program.

The phase prefix **LC** means this addendum's implementation sequence. LC phases are distinct from product P0–P8, legacy engineering Phases 1–6, and Section 6 art stages. Focused repairs may proceed without claiming that a broader product milestone is accepted. Finish and verify the current LC phase before beginning dependent implementation in the next one. Experience acceptance may remain pending a human review; dependent production expansion must wait where the gate explicitly requires it.

| Decision | Binding interpretation |
| --- | --- |
| Owner-confirmed collectible scope | **Exactly 1,000 persistent exploration orbs across the four districts. “Shards” means these same orbs, not a second collectible system.** This explicitly supersedes the old 182-orb quantity in FR-WORLD-08 and legacy orb specifications. Relics, dossiers, memory tags, and other separately named collectibles do not count toward 1,000. |
| Save and agent selection | A player chooses an owned campaign save and a compatible playable Agent/profile, with an explicit ownership model. “Agent” means the in-game character, not the coding assistant. Never silently bind to the wrong profile or world. |
| Offline and spending | Installed solo launch, saves, diagnostics, and all required assets work without internet. No additional spending, paid monitoring, asset purchases, or new hosting subscriptions. |
| Architecture | Diagnose before deciding that a more powerful server or new backend is needed. Prefer incremental changes to the existing local/server authoritative implementation. Any proposed migration needs measured evidence, alternatives, data migration, rollback, and a separate explicit decision. |
| Existing work | Preserve unrelated working-tree changes, established mechanics, character progression, narrative identities, and host/guest ownership. Add or repair systems at their existing seams. No wholesale Phase 1–5 rewrite. |
| Quality | No placeholder stubs, mock population arrays, test-only interactions, count-only content claims, fake log exports, or runtime fallback primitives accepted as final assets. Procedural production art is allowed if it passes the same quality review as imported art. |
| Tuning defaults | Numerical targets introduced below are proposed implementation defaults, not claims of owner-approved release qualification. Implement to them unless measurement supports an explicit recorded revision. Do not silently lower a target to pass a test. |

### 1.2 Outcomes the player must experience

1. Launch the game tomorrow, select the intended save and Agent, and continue the right campaign without terminal commands, lost acknowledged progress, duplicated rewards, or unexplained empty profiles.
2. Understand when the game is paused, reconnecting, loading, or unable to save. A fatal failure offers a useful next action and preserves the last good save.
3. Find a diagnostic report after a crash or restart, give its local path to a coding assistant, and have that assistant connect the reported symptom to the relevant client/server/save events.
4. Move through four coherent districts with built streets, varied occupied-looking buildings, believable walking citizens, and moving vehicles that respond to one another and the player.
5. Encounter enemies entering through plausible routes without visibly appearing out of nowhere, including when multiple players watch different approaches.
6. See expressive, articulated characters whose movement and combat animation match the actual gameplay state.
7. Hunt 1,000 authored, persistently tracked orbs through sound, observation, and traversal. The approach hum grows smoothly and pleasantly louder; the reward sounds satisfying rather than abrasive.

### 1.3 Explicit boundaries

This program does not promise fully enterable buildings everywhere, a real economic simulation, simulated schedules for every distant citizen, cloud saves, automatic public telemetry, host migration, a new engine, a new paid backend, or full release qualification from local scripts. Advertised enterable spaces must be real; other doors must communicate that they are closed. The program must leave existing campaign and launch requirements intact and identify remaining work honestly.

## 2. Current evidence and starting points

The following is a **source/document inspection on November 19**, not a fresh gameplay reproduction. The owner reports current failures; previous verification does not invalidate that experience. The checkout contains substantial pre-existing modified and untracked work. Future evidence must identify both commit and working-tree/build fingerprints.

| Area | Observed implementation/documentation | Required consequence |
| --- | --- | --- |
| Saves | `server/gameServer.ts` contains a five-second autosave loop; `server/campaignStore.ts` describes transactional character/world/reward writes; `server/soloWorldCheckpoint.ts` restores district state. | Do not just add another timer. Trace the actual failing launch/profile/save path, save acknowledgement, and restart behavior. |
| Storage | `server/solo.ts` defaults to `%LOCALAPPDATA%\CRACKUP\solo\campaigns.db`; hosted campaign documentation uses a separate data directory. | Explain mode and store selection; prevent accidental appearance of an empty save list when mode or launch path changes. |
| Recovery | Local report UI and render/startup failure handling exist under `client/diagnostics/`; current [bug reporting](BUG_REPORTING.md) documents a page-lifetime buffer and manual export. | Persist bounded, sanitized diagnostic history across page/process loss and correlate server events; preserve the existing preview/privacy behavior. |
| World | `shared/world/neoVeridiaBlock.ts`, `shared/world/architecture.ts`, `client/world/cityBuilder.ts`, and `shared/content/` contain existing geometry and world content. | Inventory actual visible/collidable/playable coverage. Registry counts do not prove a populated city. |
| Citizens | `client/entities/citizenDoorways.ts` builds sealed residential entrances. | Door meshes are not walking civilians. Demonstrate actual travel, activities, and reactions. |
| Characters | `client/animation/skeletalAnimator.ts`, `client/entities/agentMesh.ts`, `client/entities/enemyRigMesh.ts`, and `shared/combat/enemyRigSystem.ts` exist. | Audit rendered actors and active animation mappings, including asset loading failures and remote actors. Do not infer animation coverage from clip files. |
| Orbs | `shared/constants.ts` declares 150 Agility + 20 Renegade + 12 Whisper = 182; `shared/world/orbSystem.ts` generates them. Separate lore collectibles exist in `shared/content/activitiesAndCollectiblesRegistry.ts`. | Migrate stable collection identity to 1,000 without conflating lore collectibles, breaking progression, or reallocating old IDs. |
| Audio | `client/audio/spatialGameAudio.ts` includes procedural orb cues/loop voices. | Replace the heard result through listening and mix review, while retaining bounded resource use and offline availability. |

Before modifying these paths, inspect the current revision. They are investigation entry points, not a mandate to put every new responsibility into already large files.

## 3. Requirement register

All 72 rows begin **Unverified** in the dedicated ledger. “Must” describes the target behavior. Technical verification, human experience acceptance, and target-hardware qualification are different evidence states. Each row maps to one primary work prompt; later integrated gates may add evidence without erasing failures.

### LC00 — Reproduce failures and make diagnostics durable

| ID | Requirement and acceptance contract | Required evidence |
| --- | --- | --- |
| LC-OBS-01 | Establish the exact user launch path, mode, data directory, build identities, and reproducible cases for re-entry failure, apparent pause, render loss, process exit, and network interruption. Unknown causes remain unknown. | Symptom matrix with normal-input steps, actual/expected result, frequency, last good checkpoint, and classification confidence. |
| LC-OBS-02 | Client, server, launcher, session, and save events share correlation IDs and schema versions. Record bounded timing/error context without credentials, raw saves, invite codes, or private user paths. | Sanitized JSONL samples linking one launch, save attempt, disconnect, and recovery across components. |
| LC-OBS-03 | Diagnostics survive browser reload and process restart; rotate within a 100 MB total log budget per installation and seven-day retention by default. A log failure never blocks saving or gameplay. | Restart, quota, permissions, offline, malformed-entry, and rotation tests; real files and documented paths. |
| LC-OBS-04 | A report can be exported from startup failure, main menu, pause menu, and next launch after an unclean shutdown. It includes selectable recent sessions and a preview. Export does not upload anything. | Normal-input export walkthrough and sanitized archive inspection, including a previous crashed session. |
| LC-OBS-05 | Record frame/tick stalls, event-loop delay, resource counts, save latency/age, socket queues, and lifecycle transitions. Keep long frames instead of discarding the very stalls being investigated. | Raw timing trace with explicit pause/background classifications and a deliberately induced 500 ms stall. |
| LC-OBS-06 | Publish an assistant-ready triage workflow from user report to reproduced defect, root-cause evidence, regression, and closure. A missing report or crash tail is explicitly disclosed. | Two example triage records, one reproduced and one insufficient-evidence case; complete local retrieval instructions. |

### LC01 — Durable campaign and Agent saves

| ID | Requirement and acceptance contract | Required evidence |
| --- | --- | --- |
| LC-SAV-01 | Define stable profile, Agent, campaign, slot, content, and save-revision identity. Separate world state, character state, and preferences; explicitly classify every mutable subsystem as durable, reconstructed, or transient. | State inventory and ownership diagram covering solo, host, guest, rewards, orbs, story, pets, vehicles, and settings. |
| LC-SAV-02 | Commit mutually dependent campaign/character/reward changes atomically. Display “Saved” only after durable commit; retry idempotently without duplicate rewards. Autosave remains active during normal play without blocking the frame loop. | Commit-boundary crash tests and repeat-request tests with revision/receipt comparisons. |
| LC-SAV-03 | Retain five rotating autosave revisions and at least three recoverable consistent backups per campaign; support three manual named checkpoint slots per campaign without permitting profile reward duplication. | Rotation, slot isolation, backup integrity, rewind/reward policy, and disk-cap tests. |
| LC-SAV-04 | Survive interrupted writes, disk full, locked database, corrupt latest revision, and unavailable directories. Preserve original damaged data; offer a verified older revision with clear loss information. | Fault matrix on isolated real storage and recovery report; no destructive auto-reset. |
| LC-SAV-05 | Version and migrate supported legacy saves non-destructively, preserve legacy orb/reward identities, and reject unsupported newer versions intelligibly. Back up before migration; test migration twice. | Fixtures for supported schemas, idempotence comparison, compatibility failure, and rollback drill. |
| LC-SAV-06 | Prove acknowledged objectives/rewards survive repeated real-process kills and restarts. Ordinary unacknowledged continuous progress loss is at most 30 seconds under healthy storage; failures surface immediately. | At least 100 seeded kill/restart trials across commit boundaries, with zero lost acknowledged milestones or duplicate awards. |

### LC02 — Re-entry, lifecycle, and runtime stability

| ID | Requirement and acceptance contract | Required evidence |
| --- | --- | --- |
| LC-RET-01 | Main menu has Continue, Load game, and New campaign. Save cards show campaign, compatible Agent, district/checkpoint, playtime, timestamp/timezone, revision health, and mode. Never create a new profile as silent recovery. | Keyboard/mouse/controller walkthrough with two profiles, two campaigns, and multiple slots. |
| LC-RET-02 | Selecting a save then an Agent clearly shows compatible choices and any restart/rewind consequences. A default Continue returns the last compatible pair. Agent selection cannot import another profile's progress. | Valid/invalid selection, cancelled selection, renamed display name, and mode-switch tests. |
| LC-RET-03 | A bounded reconnect state machine clears stale input, restores one authoritative actor, synchronizes the correct world, and resumes within 15 seconds of connection availability in at least 95 of 100 trials. | Client/server interruption trials at varied durations; actor counts, reconnect times, and state comparisons. |
| LC-RET-04 | Every apparent pause identifies its reason. Focus loss, manual solo pause, co-op menu, save failure, reconnect, loading, graphics loss, and system sleep are distinct recoverable states. | Native focus/sleep/device tests plus separately labelled synthetic lifecycle tests. |
| LC-RET-05 | Fix measured causes of crashes/stalls; bound tick catch-up, queues, asset work, and resource lifetimes. A backend-change proposal must compare measured alternatives before implementation. | Before/after traces tied to reproduced defects; failure containment and two-hour stability run. |
| LC-RET-06 | Installed offline launch, Continue, manual load, quit, process restart, and recovery work with external networking disabled and no developer server prestarted. | Clean installation walkthrough, saved-state diff, process exit verification, and startup timing. |

### LC03 — Complete city layout, navigation, and streaming

| ID | Requirement and acceptance contract | Required evidence |
| --- | --- | --- |
| LC-CITY-01 | Every playable district has an authored parcel/street/public-space inventory; every visible vacant parcel is intentional and justified. Distinguish playable spaces, set dressing, water, and distant vista. | Four district maps with parcel dispositions and street/roof/player route overlays. |
| LC-CITY-02 | Deliver at least three recognizable neighborhoods per district, connected by streets and traversal routes. No required route crosses missing collision, fake doors, or decorative-only road spans. | Twelve neighborhood briefs and ordinary traversal recordings, including cross-district connections. |
| LC-CITY-03 | Share compatible navigation data for pedestrians, traffic, enemies, and player-adjacent interactions, with actor-specific access/capability rules. Dynamic blockage triggers safe replan. | At least 100 representative navigation cases, at least 98 successful reachable routes, blocked recovery within three seconds. |
| LC-CITY-04 | Stream/cull city cells with stable identity and bounded caches; load collision before traversal becomes possible. High-speed travel and return cannot duplicate objects, lose objectives, or drop actors through geometry. | Repeated ground/air/vehicle traversal, eviction/re-entry, and retained-resource traces. |
| LC-CITY-05 | Produce one populated representative neighborhood as the reusable quality reference, including street, alley, roof, actual accessible interior, and ambient movement integration points. | Continuous player tour, content manifest, collision report, and owner experience review before replication. |
| LC-CITY-06 | Supply validators and visual debug views for parcel gaps, overlaps, navigation, spawn portals, traffic lanes, collectible anchors, and streaming budgets. All four districts pass structural validation. | Deliberately broken fixtures rejected; normal build content report and mapped exceptions. |

### LC04 — Varied architecture and believable occupancy

| ID | Requirement and acceptance contract | Required evidence |
| --- | --- | --- |
| LC-ARC-01 | Provide at least six recognizable building archetypes per district, 24 district archetype definitions total. Differences include silhouette, use, proportions, frontage, roofs, and materials; recolors do not count. | Silhouette sheet, archetype registry, and district street review. |
| LC-ARC-02 | Deterministic modular composition provides at least three substantive variants per archetype. Adjacent buildings must not share the complete silhouette/frontage/roof signature except authored paired structures. | Variant inventory, adjacency audit, and fixed-seed comparison after save/reload. |
| LC-ARC-03 | Streets communicate occupancy through furnished storefront views, entrances, lighting, service details, signs, balconies, and rooftop functions appropriate to each neighborhood. | Street/roof/night close-ups and an environmental-storytelling checklist per neighborhood. |
| LC-ARC-04 | Every enterable building has furnished playable interiors and correct access/navigation. Decorative room shaders are counted only as views. Closed entrances cannot masquerade as objectives. | Interior inventory and first-time entry/exit/navigation tasks with collision checks. |
| LC-ARC-05 | New geometry preserves climbable routes, mission entrances, destruction rules, line of sight, camera clearance, and collectible access. | Route regression matrix and interaction/combat recordings at low and high mobility tiers. |
| LC-ARC-06 | Apply LOD, batching/instancing, texture residency, and material reuse without collapsing nearby variety. All four district tours meet assigned performance budgets. | Comparison captures, draw/resource counts, and recorded repetition review. |

### LC05 — Pedestrians and civilian behavior

| ID | Requirement and acceptance contract | Required evidence |
| --- | --- | --- |
| LC-PED-01 | Active neighborhoods show citizens walking purposeful routes and performing idle/work/social activities. On a standard inhabited street route, observe at least eight walking civilians and three activity types within a two-minute sample. | Ten-minute samples in all districts; named intentional quiet areas excluded with rationale. |
| LC-PED-02 | Pedestrians use sidewalks/crossings, avoid nearby actors and props, queue plausibly, and recover from blocked routes. They do not walk through walls or endlessly oscillate. | Intersection, narrow-path, moving-obstacle, and blocked-door tests; navigation failure telemetry. |
| LC-PED-03 | Citizens react visibly to nearby combat, approaching vehicles, explosions, and district state. Reactions have varied delays and safe escape goals; persistent mission NPCs are protected from ambient despawn. | Threat-response recordings and mission continuity tests; deterministic seeded debugging. |
| LC-PED-04 | Population uses near/mid/far simulation levels and bounded pools. Spawn/despawn is hidden from all relevant players or uses authored physical entrances/exits. | Multi-view recordings, distance-tier traces, and population churn/soak tests. |
| LC-PED-05 | Shared interactive citizens have authoritative identity and state. Cosmetic distant figures cannot confer rewards, block hits, or create contradictory collisions. Named citizen consequences follow the save policy. | Two/eight-client interaction and reload tests; cosmetic/interactive classification audit. |
| LC-PED-06 | Provide at least eight civilian appearance families with meaningful clothing/body/silhouette variation and animated walking, idle, activity, and threat responses. | Near-camera contact sheet and continuous behavior review; no placeholder people. |

### LC06 — Moving traffic and street interactions

| ID | Requirement and acceptance contract | Required evidence |
| --- | --- | --- |
| LC-TRF-01 | Authored lane graphs cover drivable roads and intersections, with legal direction, stop lines, signals/right-of-way, spawn portals, and lane/sidewalk separation. | Graph validator and route drive through every intersection class. |
| LC-TRF-02 | Traffic accelerates, follows, brakes, queues, turns, and yields. Standard inhabited-road samples show at least three moving civilian vehicles in two minutes, not only parked props. | Four district ten-minute traffic samples and repeatable following/intersection scenarios. |
| LC-TRF-03 | Vehicles react to pedestrians, stopped cars, player obstruction, collision, and combat; blocked traffic replans or waits plausibly. No visible teleporting through obstacles to clear jams. | Jam, crossing, road closure, pursuit interruption, and recovery cases. |
| LC-TRF-04 | Traffic vehicles can transition coherently between ambient driving and existing supported player interaction/damage systems. Ownership, driver, physics, and simulation authority never duplicate. | Interaction/damage/exit/reconnect tests with two/eight players and existing vehicle regression. |
| LC-TRF-05 | Traffic spawns, despawns, and changes simulation detail through hidden routes, with bounded physics and network cost. Player-owned or mission-critical vehicles cannot be culled as ambient traffic. | Multi-view spawn captures, pool/physics counts, and slow-receiver tests. |
| LC-TRF-06 | At least six recognizable traffic body archetypes appear across the city with plausible district distribution, wheel/steering motion, brake lights, and spatial engine sound. | Road-level video, archetype inventory, mix review, and crowded-scene profile. |

### LC07 — Enemy spawning that respects visibility

| ID | Requirement and acceptance contract | Required evidence |
| --- | --- | --- |
| LC-SPN-01 | All combat spawn producers use a common authoritative admission policy with stable encounter IDs, valid collision/support, reachable ingress, player distance, and capacity checks. | Producer inventory and tests proving mission, patrol, reinforcement, boss-add, and restart paths use admission. |
| LC-SPN-02 | Hidden spawns must be outside every relevant player's visibility, using conservative frustum plus occlusion checks of the full spawn volume, not just its center or distance. Unknown/stale visibility fails closed. | Cases for corners, roofs, glass, thin cover, high FOV, scopes, orbiting cameras, and separated co-op viewers. |
| LC-SPN-03 | Visible reinforcement arrivals must enter physically through an authored doorway, vehicle, elevator, drop route, or other clearly telegraphed entrance. Enemies cannot become attack-capable while invisibly appearing. | Frame-by-frame arrival/first-attack recordings and interrupted-arrival behavior. |
| LC-SPN-04 | If no legal hidden candidate exists, defer, choose a legitimate ingress, or adjust encounter pacing without deadlocking the mission. Never relax visibility silently because a timer expired. | All-portals-watched and blocked-ingress tests with mission completion proof and reason-coded decisions. |
| LC-SPN-05 | Recently observed positions have cooldown/hysteresis; last-moment camera changes trigger revalidation or a safe ingress fallback. Despawning follows equally strict visibility rules. | Fast-turn and packet-delay trials; at least 500 admission attempts with zero unexplained visible materializations. |
| LC-SPN-06 | Encounter budgets and difficulty remain fair in solo and split-up co-op. Debug overlays show candidates and rejection reasons but are disabled in production. | Normal-input mission/combat runs and build configuration negative tests. |

### LC08 — Character fidelity and animation coverage

| ID | Requirement and acceptance contract | Required evidence |
| --- | --- | --- |
| LC-ANM-01 | Inventory every player, enemy, boss, and civilian archetype and its actual loaded mesh, rig, clips, material quality, sockets, LODs, and usage rights. Missing assets fail visibly in QA. | Runtime content/coverage report; no counting unused files as integrated animation. |
| LC-ANM-02 | Hero and enemy archetypes use cohesive articulated multi-part or skinned models with distinct silhouettes and faction detail. Meet the existing Section 6 joint/state intent and close-camera quality. | Turntables and combat-distance review of every archetype, including low LOD transitions. |
| LC-ANM-03 | Locomotion covers idle/walk/run/sprint, directional movement, visible pre-jump knee/hip compression and arm-driven takeoff, rise/apex/fall, soft/hard landing compression, ledge reach/catch/contact/hang/pull-up/release, and supported traversal/vehicle transitions. Playback scales with movement and preserves responsive controls. | Normal-input TA01–TA20 coverage from the traversal pack specification at 30/60/120 FPS; sliding, contact, snapping, and missing-state report. |
| LC-ANM-04 | Combat layers aim/fire/recoil/reload and existing melee/parry/flinch/stagger/knockback/death behavior over locomotion with correct sockets/contact timing. Authoritative fall damage triggers a distinct impact and bounded character-only recovery beat, with explicit input/interrupt policy; it never pauses the whole game. | Mixed combat and safe/damaging/fatal-fall videos with authoritative timestamps; no duplicate reactions or stuck recovery. |
| LC-ANM-05 | Remote actors interpolate and animate coherently through late join, reconnect, pause, interruption, LOD changes, and supported network conditions. Rendering never decides damage or progression. | Multi-client captures at 0/80/150 ms RTT with packet loss and actor lifecycle tests. |
| LC-ANM-06 | Validate rigs, mapping, license provenance, clip coverage, and animated bounds automatically; obtain human review of weight, readability, foot contact, and silhouette. | Validator rejection cases and before/after videos; owner acceptance of representative hero, enemy, and civilian. |

### LC09 — One thousand tactically placed persistent orbs

| ID | Requirement and acceptance contract | Required evidence |
| --- | --- | --- |
| LC-ORB-01 | Registry contains exactly 1,000 unique persistent orb identities, with district, type, anchor, route, mobility tier, hint, reward, and content version. Existing IDs remain mapped to the same collected identity. | Count/type/district audit and old-save migration proof. |
| LC-ORB-02 | Allocate 250 orbs to each district and author hidden routes with varied discovery patterns. At least 700 require looking beyond the obvious street route; concealment never means clipping, random invisibility, or unavailable geometry. | Placement manifest, design notes, spatial heatmaps, and route sampling. |
| LC-ORB-03 | Every orb is reachable at its declared capability tier with normal controls; no irreversible missables or mandatory death routes. Destruction and mission changes preserve a valid reachable fallback. | Automated support/path checks plus per-orb human or recorded normal-input reachability signoff. |
| LC-ORB-04 | Collection and reward are authoritative and transactionally persistent. Collection is per Agent, with explicit local/remote visual policy and anti-duplication across campaigns, slots, and retries. | Two/eight-player simultaneous pickup, invalid claim, save-load, disconnect, and rollback tests. |
| LC-ORB-05 | Map/journal track found/total by district and type; optional late-hunt hints help finish without revealing every location immediately. Exploration remains viable with audio muted. | New-player discovery and 95%-complete cleanup sessions using visual guidance. |
| LC-ORB-06 | Streaming, spatial indexing, instanced rendering, network representation, and progression balance support all 1,000. The expanded count must not accidentally accelerate campaign leveling or narrative unlocks. | Dense-route performance and bandwidth traces, progression curves, completion audit, and old/new save comparisons. |

### LC10 — Satisfying proximity hum and collectible mix

| ID | Requirement and acceptance contract | Required evidence |
| --- | --- | --- |
| LC-AUD-01 | Replace abrasive orb tones with a curated warm hum and satisfying pickup accent. Compare at least three candidates at matched loudness; evaluate fatigue as well as initial appeal. | Audio candidates, source/provenance record, listening rubric, and owner selection. |
| LC-AUD-02 | Hum grows smoothly louder with approach, fades with retreat, and communicates direction and elevation. Distance response and occlusion are independent and continuous. | Recorded 40/25/15/8/2 m approaches, vertical approaches, and around-wall paths; gain traces. |
| LC-AUD-03 | Select a bounded set of nearby orb voices with stable priorities and crossfades; dense clusters cannot stack into a piercing drone. Collected orbs stop promptly and release resources. | Dense-cluster recording, source/node counts, voice-stealing tests, and leak cycle. |
| LC-AUD-04 | Master/effects/collectible sliders, mute, dynamic-range option, and visual hunting aid persist. Muting collectible audio cannot mute mission speech or force loss of discovery information. | Settings/restart and muted hunt walkthrough; keyboard/controller accessibility checks. |
| LC-AUD-05 | Audio recovers from browser gesture restrictions, focus loss, solo pause, co-op menus, context suspension, device change, and reconnect without duplicate loops. | Real-device/lifecycle matrix and repeated reload/return recording. |
| LC-AUD-06 | Qualify the hum in quiet exploration, dense urban ambience, combat, dialogue, and long hunts. No clipped samples, audible switching clicks, or masking of critical cues at default mix. | At least 20-minute listening sessions on headphones and speakers plus waveform/peak evidence. |

### LC11 — Integrated experience and qualification handoff

| ID | Requirement and acceptance contract | Required evidence |
| --- | --- | --- |
| LC-INT-01 | A normal-input golden journey exercises launch, save/Agent selection, populated streets, traffic, combat ingress, animation, orb hunting, manual/autosave, forced interruption, and correct resume. | Continuous recordings for all four districts and before/after durable-state comparisons. |
| LC-INT-02 | Run required current regressions and focused new tests against the integrated build, including actual player input and authoritative multi-client paths. No skipped check may be reported as passed. | Build/command logs, test counts, failures, revision fingerprints, and defect links. |
| LC-INT-03 | Meet declared frame/tick/memory/queue budgets on the reference profile under inhabited-city load, with separate eight-player load and two-hour/eight-hour soak results. | Raw traces, hardware/settings, percentile methodology, resource plots, and unresolved-limit disclosure. |
| LC-INT-04 | Conduct representative human reviews of resume trust, city life, visual variety, animation, spawning, and orb sound/discovery. Automated coverage cannot substitute for perception. | At least five reviewers, anchored ratings, negative feedback, and issue dispositions. |
| LC-INT-05 | Prepare upgrade/backup/recovery and diagnostics runbooks with a tested rollback and clean offline package. Keep personal saves untouched during qualification. | Installation/upgrade/restore drills, package manifest, logs retrieval exercise, and rollback demonstration. |
| LC-INT-06 | Audit every original complaint and requirement against evidence; publish implemented, verified, experience-accepted, qualified, and remaining work separately. Do not declare full-game release from LC completion. | Final traceability report with 72 row dispositions and parent-PRD updates that preserve historical evidence. |

## 4. Persistence and recovery design contract

### 4.1 Identity and save semantics

Use stable internal IDs independent of editable display names. A profile owns Agents and campaigns. A campaign belongs to one profile; a slot selects a world checkpoint revision, not a new owner. An Agent carries earned character progression and per-Agent collection receipts. Guest visits refer to the host campaign without replacing the guest's owned world. Existing callsign-based storage needs an explicit migration mapping, not an abrupt identity rewrite.

Initial implementation should expose all existing valid Agents and a clear create-Agent action where supported. Do not promise unrestricted character swapping if campaign scripts or current storage do not support it. Define compatibility rules and show why a choice is unavailable. New Agent creation must not be a hidden prerequisite for recovering an existing campaign.

Default checkpoint policy: world rewind restores the selected campaign checkpoint, while irreversible unique reward receipts and per-Agent collected identities remain monotonic. Explain this on the load screen. A rewind cannot farm a unique reward; a new Agent has separate collection/progression. If existing systems require a different policy, record a concrete decision before changing saved data. A world snapshot and its character/receipt references must always form a compatible transaction.

| State group | Persistence rule |
| --- | --- |
| Profile/Agent identity, upgrades, equipment, earned XP, unique awards, companions | Durable; atomic with the actions that confer them. |
| Campaign objectives, checkpoint, decisions, district liberation, boss completion, named NPC consequences | Durable per owned campaign; never inferred solely from character unlocks. |
| Collected orb IDs and collection rewards | Durable per Agent; idempotent receipt; consistent across save slots and guest visits. |
| Story presentation and visit history | Preserve existing host/guest distinctions; skipped/seen events cannot overwrite another campaign. |
| Player transform, health, resources | Explicit checkpoint policy; recover at a valid authored anchor when exact restore is unsafe. Display the policy; never fall into void geometry. |
| Vehicles/world damage | Persist owned/mission-critical state as specified; reconstruct disposable ambient vehicles and nonessential destruction using documented rules. |
| Pedestrian and traffic pools | Transient/reconstructed; do not serialize every ambient actor each autosave. Named story actors are an exception. |
| Particles, projectiles, audio nodes, animation blend state, network queues | Transient; clear/rebuild safely on load and reconnect. |
| Preferences and accessibility | Durable per profile/device as documented, independent of campaign rewind. |

### 4.2 Save timing and failure behavior

Keep the existing five-second cadence as a starting point; profile its actual cost before changing it. Coalesce dirty data and immediately request a transaction for durable milestones, unique rewards, manual save, and intentional departure. Do not rely on browser unload callbacks for the last save. Record requested revision, committed revision, commit duration, pending age, and failure reason.

The 30-second healthy-storage recovery objective is a ceiling, not permission to lose acknowledged milestones. When the ceiling cannot be met, show “Progress is not being saved,” preserve pending state, provide retry and report actions, and prevent misleading success feedback. Do not retain unlimited pending data. Enter a controlled safe state if the bounded buffer cannot preserve consistency. Existing co-op save-failure pause semantics remain until intentionally revised.

Use SQLite-consistent snapshots/backups that account for WAL; copying a live `.db` file alone is not an acceptable backup procedure. Verify integrity before presenting a backup as loadable. A checksum detects damage but does not replace transactional consistency. Backups must not be pruned until a newer recoverable copy is verified. A clean quit waits for commit or clearly reports failure and offers an explicit unsaved exit decision.

### 4.3 Recovery state model

`BOOT -> DISCOVER_STORAGE -> SELECT_SAVE -> SELECT_AGENT -> LOAD_VALIDATE -> CONNECT -> SYNCHRONIZE -> PLAYING`.

Failures enter named states such as `SAVE_BLOCKED`, `RECONNECTING`, `GRAPHICS_RECOVERY`, `INCOMPATIBLE_SAVE`, or `RECOVERY_CHOICE`. Each state has visible cause, available actions, bounded retry/backoff, telemetry, and input ownership. No loading spinner is indefinite without a status message and safe exit. Retry does not issue duplicate joins, create extra actors, or discard a known committed revision.

Host connection loss preserves the existing freeze/wait behavior. A service restart requires the owner to reopen the host campaign and renew session credentials as applicable; do not pretend that an expired invite can seamlessly rejoin a new party. No host migration is introduced.

## 5. Diagnostics and crash investigation contract

### 5.1 Local storage and retrieval

Proposed runtime locations below must be implemented and documented by LC00; they are **not assertions that these folders already exist**:

| Mode | Data/log/report location |
| --- | --- |
| Installed Windows solo | Existing data root `%LOCALAPPDATA%\CRACKUP\solo`; new `logs\`, `reports\`, and `backups\` beneath it. |
| Isolated solo test | The directory explicitly selected by `SOLO_DATA_DIR`, with the same subdirectory convention. |
| Hosted campaign | The configured `CAMPAIGN_DATA_DIR`, otherwise the documented local campaign data directory; server logs remain accessible to its operator. |
| Browser client before server connection | Bounded sanitized persistent browser journal, with storage-unavailable fallback and a local download action. Flush to the local runtime when it becomes available. |
| Development/review artifacts | `artifacts/evidence/living-city/` for selected sanitized evidence; raw private logs and saves stay outside tracked source. |

Expose **Diagnostics -> Open folder / Copy path / Export report** where platform capabilities permit; a normal browser must offer download/copy instructions when it cannot open a native folder. Never fake a successful native action. A launcher crash before the UI renders must leave an operator-readable startup log if writable storage exists.

Default retention: seven days and a 100 MB combined automatic log budget, whichever deletes old automatic logs first. Rotate at 10 MB per file; reserve capacity for the latest error and session summary. Persist client journal at a maximum of 2 MB or 2,000 events. User-exported reports are explicit artifacts and are not silently deleted by automatic log rotation. Rate-limit repeated errors and record suppression counts. Logging quotas cannot consume the save reserve.

### 5.2 Event and report schema

Every event includes schema version, UTC wall time, monotonic elapsed time, severity, component, event name, client/server/content build IDs, session correlation ID, pseudonymous campaign/Agent references where needed, and a typed payload. Domain fields include save revision/commit ID, server tick, frame time, lifecycle state, reconnect attempt, queue depth, memory/resource count, and a categorized error code. Distinguish browser/device estimates from measured process metrics.

Reports include user-entered steps, expected/actual result, severity selection, reproduction frequency, recent timeline, relevant metrics, sanitized error stacks/bundle offsets, runtime/browser/OS facts, graphics-context events, save-health summary without save contents, and current/previous session summaries. Keep exact build source maps privately available for symbolication; sanitized exports omit absolute private source paths.

Never automatically collect PINs, authentication tokens, cookies, invite codes, full URLs/query strings, full profile databases, chat, or arbitrary object dumps. Free text is previewed as supplied and can contain personal information. Export is user-initiated and local. A server endpoint accepting client diagnostics must validate schema, byte limits, frequency, and session permissions; it cannot become an unauthenticated disk-filling endpoint.

A renderer crash or hard power loss may lose the newest journal tail. Explicitly report the last persisted event and mark the session unclean; do not invent a stack trace or claim every crash can be caught. A watchdog must distinguish normal pause/background throttling from an unresponsive process. A last-successful heartbeat is evidence of timing, not proof of root cause.

### 5.3 Triage loop

Classify severity: S0 = durable data loss/corruption or cross-profile exposure; S1 = repeatable crash, blocked re-entry, campaign blocker, or unusable performance; S2 = materially broken behavior with workaround; S3 = cosmetic/polish. Record symptom, build, session, evidence paths, reproduction confidence, suspected subsystem, measured cause, regression coverage, and before/after results. Only call an issue fixed when the original reproduction passes on the changed build.

The future triage prompt must permit: “Read the selected report directory, preserve saves, correlate the last failed session, reproduce in an isolated store, fix the evidenced cause, run the relevant regression and normal-input route, and report remaining uncertainty.” Unreproduced failures stay open; adding a try/catch or retry timer is not itself a resolution.

## 6. City content and simulation design

### 6.1 Content quantities and distribution

Retain four districts and existing lore identities. Deliver at least 12 neighborhoods, 24 distinct district building archetypes, three meaningful variants each, eight civilian appearance families, and six traffic body archetypes. These are proposed minimum production targets; each requires a content inventory and actual in-game review. Repeated fragments within a coherent modular kit are fine; changing a color on the same tower does not create a new archetype.

| District | Architectural emphasis | Street-life emphasis | Orb design emphasis |
| --- | --- | --- | --- |
| Neon Docks | Warehouses, waterfront housing, ferry/service buildings, cranes and elevated service routes | Workers, deliveries, waterfront pedestrians and slower service traffic | Crane sightlines, seawall alcoves, warehouse roofs, service catwalks |
| Foundry Slums | Dense residential layers, workshops, industrial halls, retrofits, markets | Market queues, workers, constrained streets and mixed utility vehicles | Courtyards, exhaust structures, balconies, hidden rooftop connections |
| Helios Spire | Mixed-height commercial blocks, terraces, civic space, clean corporate towers | Commuters, plazas, public crossings and organized traffic | Setbacks, gardens, tower maintenance paths, elevation clues |
| Aegis Citadel | Institutional/security buildings, fortified infrastructure, service compounds | Controlled civilian access, patrol-adjacent public zones, restricted roads | Perimeter alternatives, guarded service routes, late-game vertical circuits |

This is a placement brief, not permission to overwrite authored geography or narrative. Preserve existing landmark/activity access. Every parcel needs an intended use; “complete city” does not mean placing a building on water, roads, parks, mission arenas, or deliberate negative space. Review sightlines and route rhythm, not just coverage percentages.

### 6.2 Navigation and population

Navigation graphs must carry district/cell identity, actor capabilities, edge width/slope/height, crossing controls, portal state, and dynamic-block references. Prefer shared spatial facts with separate pedestrian/lane/combat navigation layers instead of pretending one path representation fits every actor. Revision changes invalidate cached routes safely. Obstacles cannot force enemies/citizens into endless replan storms.

Initial tuning envelope: up to 48 nearby fully simulated civilians and 16 active traffic vehicles per authoritative world, with additional bounded cheaper distant population. Treat these as starting caps for profiling, not guarantees at every street or additive caps per player. Reserve budgets for combat and mission actors. With eight players in separate districts, allocate fairly; do not make each client create a full independent interactive city. Target standard street samples in LC-PED-01 and LC-TRF-02 without silent quality collapse. If caps cannot support the experience, revise implementation or document an explicit measured capacity decision.

Population persists through plausible entrances/exits and can be reconstructed on revisit. Shared interactable entities are server-authoritative. Purely cosmetic distant actors must never affect gameplay collision, targeting, rewards, or threat decisions. Named narrative citizens are not disposable ambient entries. Variation includes activity timing, route choice, speed, appearance, and threat response; it must not create random behavior that makes reproduction impossible. Record deterministic seeds.

### 6.3 Visibility-safe spawning

Assess visibility conservatively for all players who could see the spawn. Include camera offsets, elevation, orbit range, zoom, field of view, and movement since the last sample. Client camera reports are advisory and validated; server-owned position and conservative view envelopes prevent trusting a forged camera to manipulate spawns. If the authority cannot establish concealment, use deferred admission or physical ingress.

Occlusion uses multiple samples over the actor bounding volume against valid opaque geometry. Transparent glass, open doors, narrow poles, unloaded collision, and temporary particles are not dependable hiding cover. Recheck immediately before activation. Initial tuning: at least 25 m separation from a player for hidden materialization and two seconds of recent-visibility hysteresis, adjusted only with recorded encounter evidence. Physical doorway/vehicle arrivals can be closer when telegraphed and fair. Distance alone never establishes invisibility.

Suggested admission pipeline: enumerate authored candidates -> check encounter/capacity -> validate support/navigation -> check all-player distance/view/occlusion -> reserve candidate -> revalidate -> instantiate -> begin approach -> allow combat when arrival conditions are met. Record rejection reasons. All-watched scenes must still progress through a believable arrival or changed timing, never by silently switching off checks. Remote interpolation must not turn an otherwise valid entrance into a visible pop.

## 7. Character and animation production contract

The owner's November 19 follow-up explicitly requires ledge grabs, a small squat and arm movement before leaping, landing compression, and a short reaction/recovery after taking fall damage. The [traversal animation pack specification](TRAVERSAL_ANIMATION_PACK_SPEC.md) is binding detail for LC08: 20 motion states, free-source acquisition candidates, actual archive/clip inspection, retargeting, geometry contact, timing, authority, and normal-input acceptance. A pack must be acquired/curated and integrated; downloading it alone is not completion. All 72 primary work-package IDs remain stable.

Build an actor/state matrix before sourcing assets. For each archetype record actual mesh source, license/hash, rig map, skeleton hierarchy, state-to-clip/procedural mapping, motion mode, root-motion policy, weapon sockets, hit volumes, animated bounds, LOD policy, and fallback status. Reuse existing licensed assets where they meet the art direction; do not purchase replacements. Consult the [asset acquisition guide](ASSET_ACQUISITION_GUIDE.md) for intake/provenance.

Gameplay movement remains authoritative. Choose one explicit root-motion/in-place reconciliation policy per action; animation cannot independently move a remote actor through geometry or award a hit. Animation events consume authoritative combat/traversal facts. Blend upper-body actions while lower-body locomotion continues where physically appropriate. Include locomotion start/stop/turn, weapon-ready/aim, recoil/reload, attack interruption, downed/death/recovery, landing, ledge motion, driver/rider state, and civilian activities as applicable.

Validate clips on the actual runtime character, not only an external preview. Inspect feet, hands, weapon alignment, shoulder deformation, ground contact, silhouette, slide distance, blend popping, and visible attack contact. Initial tuning: ordinary state crossfades approximately 100–200 ms unless an authored action needs different timing; test at 30/60/120 FPS. Avoid a universal blend delay that makes combat sluggish. Keep animation updates on distant actors cheap without freezing nearby people in a static pose.

If a required asset cannot be sourced within the no-spending constraint, build an acceptable procedural articulated version or mark the requirement blocked with a concrete asset brief. A final placeholder is not an acceptable workaround. Human quality review of a hero, enemy, and civilian precedes replicating the pipeline across all archetypes.

## 8. Collectible content and progression contract

### 8.1 Exactly 1,000, with compatible identity

Proposed type allocation: **968 Agility + 20 Renegade + 12 Whisper = 1,000**. This retains the existing special-orb counts and narrative trigger structure while expanding ordinary exploration. Each district gets 242 Agility, five Renegade, and three Whisper, totaling 250. Validate actual legacy distribution before finalizing; if legacy placements differ, keep identity stable and document any relocation. Never regenerate IDs by sorted position or current array index.

Preserve legacy identities 1–182 through an explicit stable mapping; new entries get new IDs. Correct invalid old placements with relocation metadata, not by deleting collection receipts. Treat registry/content version separately from save schema. Audit binary field widths, fixed arrays/bitsets, HUD denominators, achievements, map indexing, exported reports, tests, and server validation for assumptions about 182. A changed constant alone is not implementation.

### 8.2 Placement rules

Each entry records: `orbId`, district/neighborhood, type, stable anchor/structure, local/world placement, mobility tier, concealment category, primary/alternate route, clue, safe landing/escape, reward policy, dynamic-geometry fallback, source content version, and QA result. Generation can assist authored placement, but a seeded random scatter without reachable routes and clues cannot pass.

Use exactly one primary concealment classification per orb for audit: 300 rooftop/vertical-route discoveries, 250 alley/courtyard/understructure discoveries, 150 traversable interior/service-space discoveries, 200 landmark/parkour circuit discoveries, and 100 onboarding/open sightline discoveries. Counts total 1,000; at least 700 of all entries must independently satisfy the beyond-obvious-street-route rule. Categories alone do not prove concealment. If interior capacity requires redistribution, record the content decision while retaining 1,000, district balance, reachability, and concealment quality.

At least 400 must be reachable using baseline movement across the accessible world, at least 350 additional entries with mid-tier movement, and no more than 250 requiring advanced mobility. This is a proposed first balance pass, not a promise that every district is accessible at campaign start. Record both district unlock and movement requirements. No circular progression lock: the player can earn required movement without collecting orbs gated by that movement.

Hidden means observation, angle, route choice, or a navigable puzzle. Do not hide collectibles inside opaque solid meshes, unenterable rooms, unbounded out-of-map areas, lethal one-way falls, or mission spaces that disappear permanently. Give subtle environmental/audio clues. Establish local spacing and route rhythm in context; avoid a uniform grid, one identical orb per roof, or hundreds stacked on the same ledges. Near clusters need an authored purpose and listening review.

### 8.3 Rewards and multiplayer

Increasing Agility count from 150 to 968 must trigger an explicit economy review. Preserve already-earned XP/unlocks; rebalance future rewards through a versioned reward table and progression simulations plus normal play. Do not simply grant the old per-orb reward 968 times without evaluating the campaign curve. Keep Whisper narrative thresholds intentional and guarantee required story information remains obtainable.

One Agent collecting an orb must not erase it for teammates who have not collected it. Locally hide or de-emphasize already-collected orbs; render teammates' pickup effects without granting the local reward. The server validates ID, distance, capability/route constraints where applicable, existing receipt, and reward version. A transaction commits collection and reward once. Failed acknowledgement/retry cannot duplicate it. Campaign rewind retains character collection receipts under the save policy.

Counts and hints distinguish not discovered, discovered/uncollected, and collected where the design provides discovery tracking. Early exploration should rely on clues; optional late-hunt district hints can narrow an area and show elevation/entrance rather than instantly reveal every secret. Provide a non-audio proximity aid with adjustable intensity; secrets cannot require hearing.

## 9. Orb sound design and accessibility

Start with three distinctly authored warm, tonal hum candidates using available synthesis or licensed local assets. Seek a rounded fundamental and restrained harmonic texture, smooth loop boundaries, minimal harsh beating, and a short complementary pickup bloom. Match candidate loudness before comparisons so “louder” does not win automatically. Do not impose a frequency as the definition of pleasant sound; listening decides.

Initial audition parameters: audible within roughly 35 m in a quiet scene, strongest within 2 m, smooth distance interpolation, 100–250 ms gain/source crossfades, no hard oscillator restarts on frame boundaries, and at most four active proximity orb voices plus a bounded pickup accent pool. Use distance/type/uncollected priority and hysteresis to prevent two equidistant orbs rapidly stealing the same voice. One thousand placements must not mean one thousand AudioNodes.

Within a fixed acoustic environment, moving closer must monotonically increase the intended distance gain. Wall/occlusion changes can legitimately alter perceived volume; test distance and occlusion independently. Preserve direction/elevation clues around corners without making every hidden room loudly audible through the whole block. Dialogue/combat ducking must not destroy the player’s ability to resume a search once the critical cue ends.

Capture dense clusters, moving Renegade orbs, a collected voice fading out, rapid turning, headphones/stereo speakers, muted play, and twenty-minute hunts. Listen for hiss, rough beating, piercing harmonics, repetition fatigue, clipping, clicks, and false direction. Subjective acceptance target: owner approves the selected identity and at least four of five reviewers rate satisfaction and comfort at least 4/5. Keep disagreeing feedback and revise; numerical acoustic checks alone cannot certify “satisfying.”

## 10. Performance, reliability, and evidence budgets

Carry forward the parent PRD's reference desktop RTX 4070 and 16 GB RAM; record CPU, storage, OS, driver, runtime, resolution, and quality settings. Use 1920×1080 High without dynamic resolution as an initial declared comparison preset, with other presets reported separately. Existing faster hardware is useful for diagnostics but cannot certify reference performance.

| Area | Working acceptance target | Measurement rule |
| --- | --- | --- |
| Rendering | Mean at least 60 FPS, p95 frame time at most 16.7 ms, p99 at most 33.3 ms; no recurring gameplay stalls above 100 ms. | At least three five-minute runs per route after documented warmup; preserve full raw timing and list every >100 ms event. |
| Simulation | Retain 60 Hz authority/30 Hz snapshots; p95 work at most 12 ms, p99 at most 16.7 ms; no sustained catch-up spiral. | Actual populated eight-client workload; include AI, traffic, saves, and network serialization. |
| Memory | Parent target: total game process tree at most 6 GB steady/8 GB peak; estimated resident GPU allocations at most 6 GB steady/8 GB peak. | Separate server, browser renderer/GPU process, estimates, and shared accounting limits; no unsupported sum of overlapping counters. |
| Retention | After two hours, final warmed idle retained memory within 10% or 100 MB, whichever is larger, of initial warmed idle; bounded scene/audio/physics counts. | Same route cycle and idle conditions; report cache warmup separately from leaks. |
| Network | Typical steady state at most 256 KB/s down and 64 KB/s up per client; bounded queue/slow-client behavior. | Eight clients together and split across districts, with traffic/civilians and orb synchronization. |
| Re-entry | Cached menu at most 10 s; Continue to control at most 15 s; reconnect target in LC-RET-03. | SSD, selected save size, warm/cold distinction, all trials reported. |
| Saves | No lost acknowledged durable milestone; healthy-storage unacknowledged progress at most 30 s; no save-attributable recurring >100 ms gameplay stalls. | Real process faults and shared timestamped frame/tick/commit traces. |
| Diagnostics | Bounded storage as above; target at most 1% mean frame/tick cost when enabled in ordinary play. | Controlled on/off comparison, repeated error flood and disk-failure cases. |

Allocate subsystem budgets in LC00/LC03 from the measured total; do not spend the full frame target on each subsystem. Measure synchronous storage impact before moving work to a worker or queue. A queue can improve frame times while violating durable-save age; both constraints must pass.

Required performance scenes: populated opening street, dense intersection, skyline/roof sweep, interior/street boundary, large combat reinforcement event, dense orb hunt, high-speed cross-district vehicle/flight route, and eight players separated across the world. Include at least 24 active combatants in the representative combat load where applicable. Loading screens, user pause, background throttling, and genuine gameplay stalls are separate series; never drop long frames silently.

## 11. Ordered phases and exit gates

The effort ranges below are **scope estimates in focused engineering/content workdays**, assuming roughly six focused hours per workday for estimation only. They are not the owner's availability, a delivery promise, or proof that a coding assistant must spend a fixed time. Measure actual effort; split large prompts without reducing their acceptance contracts. Content and review may take longer. Each phase has six primary prompts.

| Phase | Depends on | Main deliverable | Exit gate | Planning range |
| --- | --- | --- | --- | --- |
| LC00 | None | Reproduction baseline and durable diagnostics | At least one re-entry failure path and one stall/crash path reproduced or rigorously captured as unresolved; reports survive restart and support triage. | 2–4 days |
| LC01 | LC00 | Transactional saves, backups, migrations | Save fault matrix and 100 kill/restart trials pass; no acknowledged data loss. | 3–5 days |
| LC02 | LC01 | Trusted Continue/load/Agent/reconnect flow | Original re-entry reproduction fixed, lifecycle matrix passes, installed offline journey and two-hour stability pass. | 3–5 days |
| LC03 | LC02 | World inventory, routes, navigation, streaming | Four district plans validated; representative neighborhood quality review passed before broad replication. | 3–5 days |
| LC04 | LC03 | Varied building kits and complete city dressing | Twelve neighborhoods reviewed; 24 archetypes/variants and access/collision routes pass. | 4–7 days |
| LC05 | LC04 | Walking/reactive civilian population | Four district samples, threat/navigation tests, multi-client authority and population budget pass. | 3–5 days |
| LC06 | LC05 | Real street traffic | All intersection classes and jam/interaction tests pass; visible moving traffic and budgets pass. | 3–5 days |
| LC07 | LC06 | Unified hidden/physical enemy arrivals | All producer paths migrated; 500 admission attempts plus all-watched scenario pass. | 2–4 days |
| LC08 | LC07 | Production character/animation coverage | State matrix passes on real/remote actors; representative human review and full archetype audit pass. | 4–8 days |
| LC09 | LC08 | Exactly 1,000 placed, reachable, persistent orbs | Count/migration/economy tests pass and all placements have reachability signoff; no unresolved inaccessible orbs. | 4–7 days |
| LC10 | LC09 | Accepted hum, pickup sound, and mix | Owner-selected sound and listening/lifecycle/accessibility/voice-budget checks pass. | 2–4 days |
| LC11 | LC10 | Integrated qualification dossier and handoff | All 72 requirements have honest dispositions; addendum acceptance requires no open S0/S1 and required technical/experience evidence. | 4–7 days |

Total planning envelope: **37–66 focused workdays**, before external review delays or asset blockers. This deliberately represents a substantial program; it is not a same-day checklist. A prompt is a bounded work package, not necessarily one conversation or one day. Actual throughput must replace these estimates after LC02. If a phase remains blocked, record the precise dependency; do not silently label a partially implemented phase complete to start the next.

Phase delivery always includes source/content changes, meaningful tests, normal-input evidence, metrics where applicable, and a ledger update. Requirements already implemented may be credited only after current evidence meets this addendum. Avoid rewriting working systems merely to produce a change for every prompt.

## 12. Cross-cutting acceptance scenarios

| Scenario | Required result | Primary phases |
| --- | --- | --- |
| AC01 Fresh offline install -> create Agent -> play -> quit -> relaunch -> Continue | Same owned campaign/Agent and acknowledged progress; no internet dependency. | LC01–LC02 |
| AC02 Two profiles, two campaigns each, manual slots, renamed Agent | Correct isolation and understandable compatibility; no accidental new game. | LC01–LC02 |
| AC03 Kill client/server before, during, after commit | Old or new valid transaction; never partial state or duplicate reward. | LC01 |
| AC04 Disk full/locked/corrupt latest save | Clear failure, retained originals, verified recovery candidate, no false “Saved.” | LC01–LC02 |
| AC05 Tab background, sleep, controller loss, pointer loss, graphics-context loss | Explained state and recoverable controls/audio; save semantics preserved. | LC00–LC02, LC10 |
| AC06 Host disconnects while guests collect or advance objectives | Existing freeze/ownership rules; correct retry/receipt behavior; no guest-world overwrite. | LC01–LC02, LC09 |
| AC07 Street -> alley -> interior -> roof -> vehicle -> next district -> return | Complete collision, variety, occupancy and bounded streaming; no duplicate actors. | LC03–LC06 |
| AC08 Intersection with pedestrian, stopped car, player obstruction, combat | Yield/avoid/recover; no chronic pileup or visible teleporting. | LC05–LC06 |
| AC09 Eight players watch all reinforcement candidates | No materialization; fair physical ingress/defer preserves mission progression. | LC07 |
| AC10 Run/aim/fire/parry/hit/fall/mantle near and remote | Correct continuous animation, authority timing, and interruption recovery. | LC08 |
| AC11 Upgrade old save with all 182 legacy orbs collected | Existing collection/rewards intact; total becomes 1,000 with exactly 818 newly collectible identities. | LC01, LC09 |
| AC12 Two players collect same orb; repeat packet; crash after commit | Each eligible Agent gets one reward; retry never doubles; receipt survives restart. | LC09 |
| AC13 Hunt behind a wall/above a roof, dense cluster, muted audio | Pleasant stable approach cues, no source thrash, usable visual alternative. | LC09–LC10 |
| AC14 Report last session after process death, then triage it | Local report has correct build/session, persisted timeline and honest missing-tail disclosure. | LC00, LC11 |
| AC15 Two-hour repeated travel/combat/save and separate eight-hour soak | No leak, unbounded queue, lost durable progress or unexplained stuck state. | LC02, LC11 |
| AC16 Clean package upgrade and rollback with newer save schema | Supported migration preserves data; unsupported downgrade refuses safely with backup path. | LC01, LC11 |

## 13. Execution, review, and definition of done

Coding-work continuity is separate from game-save continuity. Follow the [prompt pack's interruption/resume protocol](RELIABILITY_LIVING_CITY_PROMPTS.md) and maintain the [durable coding checkpoint](../artifacts/reliability-living-city-checkpoint.json) during work. The [project instructions](../AGENTS.md) route a future `continue` request to the active task and saved cursor. Record partial changes and pending processes/results before long operations and at coherent boundaries; never rely on a usage-limit warning or final handoff. After an abrupt cutoff, reconcile actual files/logs before resuming. This cannot execute work while service access is unavailable or recover files absent from the resumed workspace.

Use the [prompt pack](RELIABILITY_LIVING_CITY_PROMPTS.md) as executable work orders, not isolated suggestions. Every prompt inherits this document, the shared execution contract, and prior accepted decisions. Each has a requirement ID, implementation objective, edge cases, and evidence requirement. Later prompts integrate earlier work; they cannot substitute a test harness for playable behavior.

For each work package record start/end/elapsed time, inspected revision plus working-tree fingerprint, changed paths, requirement IDs, decisions/defaults changed, tests and exact results, player-visible evidence, new defects, and next dependency. Use statuses `Unverified`, `In progress`, `Technically verified`, `Experience pending`, `Accepted`, and `Blocked`; “Accepted” needs the evidence appropriate to the row and a reviewer. A blocked row requires a concrete reason and next action. Phase acceptance does not automatically accept a parent release milestone.

Run `npm run build`, focused suites, relevant regression suites, and `npm run progress:check` for coding changes according to their impact. At integrated gates also run the current full suite and explicit suites omitted by its script. Current entry points include `verify:solo`, `verify:campaign`, `verify:quality`, `verify:map`, `verify:controller`, `verify:lore`, and `verify:tier2`/`verify:tier3`/`verify:tier4`; inspect `package.json` again before executing. New focused commands are future deliverables, not commands assumed to exist. Keep all test databases isolated from personal campaigns. Protocol tests must decode packet types appropriately rather than treating all frames as world snapshots.

For this documentation-only planning delivery, structural/link/traceability validation is sufficient; it does not constitute execution of the future gameplay checks above.

The addendum is achieved only when the original complaints are demonstrably resolved, all applicable requirements have accepted evidence, no S0/S1 remains, known S2 issues have explicit dispositions, and the installed offline/multiplayer/recovery paths actually work. Human listening/play reviews and reference-hardware checks cannot be fabricated or replaced with a passing script. If unavailable, publish exactly what is technically verified and keep experience/qualification open.

## 14. Risk register and controls

| Risk | Early signal | Required control |
| --- | --- | --- |
| Wrong launch mode looks like missing saves | Different database root between launch methods | Save-source identity in menu/diagnostics; supported discovery/import flow with explicit selection. |
| Autosaves cause stalls | Tick/long-frame peaks align with transactions | Measure serialization/commit cost, coalesce work, bound queues, retain durability age. |
| Backend rewrite obscures actual renderer failure | No correlation between server health and freeze | Client/server/GPU/lifecycle classification before architecture changes. |
| More city content worsens crashes | Rising resources across district returns | Streaming/LOD/pool budgets before broad content replication; retention tests each phase. |
| Spawn rules deadlock encounters | Every candidate rejected indefinitely | Authored physical ingress and deferral policy tested with all routes watched. |
| 1,000 orbs become busywork or break progression | Repeated placement patterns or early max level | Route authorship, economy review, hunt playtests and bounded hints. |
| Legacy saves lose identity after content expansion | Collection count changes after migration | Stable ID map, migration fixtures and receipt-based reward reconciliation. |
| Asset count masks unanimated actors | Runtime mapping differs from inventory | Actual rendered-state coverage and normal-input video. |
| Pleasant solo hum becomes dense-scene noise | Too many simultaneous voices or masking | Voice caps, crossfades, priority/ducking and long listening review. |
| Logging worsens disk-full or exposes credentials | Large repeated entries, sensitive payload | Schema allowlist, quotas, redaction, flood tests and export preview. |
| Unavailable target hardware/reviewers | Only headless/faster-host evidence exists | Leave qualification open; supply a reproducible handoff, not invented approval. |

## 15. Traceability to the original request and parent PRD

| Owner concern | This addendum | Parent obligations extended |
| --- | --- | --- |
| Cannot re-enter, choose save and Agent | LC01–LC02 | FR-SAVE-01–03, NFR-DATA-01–03, NFR-REL-04 |
| Frequent pause/crash; whether backend needs improvement | LC00, LC02, LC11 | NFR-PERF-01–08, NFR-REL-01–04, NFR-COMPAT-01–02 |
| Logs accessible to coding assistant | LC00, LC11 | NFR-MAINT-02, NFR-PRIV-01 |
| City/buildings not fully populated | LC03–LC05 | FR-WORLD-01–06, FR-AI-06 |
| No cars on streets | LC06 | FR-WORLD-05, FR-AI-06, FR-PLAY-06 |
| Enemies spawn visibly | LC07 | FR-AI-01–04, FR-PLAY-05 |
| Buildings lack variety | LC03–LC04 | FR-WORLD-02–04 and Section 6 architecture |
| Simple characters without animation | LC08 | FR-PLAY-01/04 and Section 6 articulation/animation/hit reactions |
| Orb sound is unpleasant; approach should get louder | LC10 | FR-AUD-01/04, FR-WORLD-08 |
| Hidden, widespread shards/orbs; 1,000 total | LC09–LC10 | FR-WORLD-08 quantity override; FR-SAVE-01–03 |
| Exhaustive multi-day phased coding instructions | LC00–LC11 and 72 prompts | Existing production planning and evidence discipline |

At LC11, reconcile affected parent requirement wording and quantities explicitly, without marking unrelated requirements accepted or destroying historical 182-orb evidence. This addendum is the authority for the new orb count from now on.
