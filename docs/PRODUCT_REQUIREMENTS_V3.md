# CRACKUP: Protocol Eclipse — complete-game product requirements

Version: 3.1 working baseline · Updated: November 13, 2026 · Product owner: Travis

**Product direction confirmed by the owner:** a focused premium PC game with a dense explorable world, a complete offline-capable solo campaign, and optional 1–8-player co-op. Four districts, 24 campaign missions and a 12–18-hour solo campaign are the approved working baseline. A desktop RTX 4070 and 16 GB system RAM are the reference machine, not a reason to maximize hardware consumption. Development is solo with AI assistance, with **no additional spending** authorized. There is no committed release date. See the [owner decision record](PRODUCT_BASELINE_DECISIONS.md).

**Current classification:** a playable technical alpha with substantial implemented systems. Completion of the old engineering phases does not establish a finished campaign, production art, a complete city, or release readiness. Under this document's stricter product milestones, a production-quality vertical slice has not yet been demonstrated.

This document defines the working launch contract; individually proposed quality thresholds still require baseline review. The [delivery plan](PRODUCTION_DELIVERY_PLAN.md) defines sequence, staffing coverage, budgeting, and gate evidence. The [new delivery ledger](../artifacts/product-delivery-status.md) records evidence and gaps without inferring acceptance. The [existing ledger](../artifacts/project-progress.md) remains the historical record of engineering implementation and its saved evidence.

## 1. Purpose, authority, and scope

The intended result is a game a customer can install or launch, understand, enjoy alone or with friends, finish, leave, and resume without developer assistance. Its world, missions, characters, combat, presentation, and reliability must form one finished experience.

Assassin's Creed, Spider-Man, The Elder Scrolls/Oblivion, and GTA are references for particular qualities: traversal, believable places, responsive characters, exploration, authored missions, and cohesive presentation. They do not define an automatic promise to match every franchise's map size, systemic depth, or content volume. This is a substantial production program; more code and downloaded packs alone cannot establish that quality.

The full launch scope below is not reduced to a small demo. A representative opening operation is the first proof that the production process can deliver the full game. Scope and quality are separate: hitting counts never substitutes for quality, and a beautiful opening never substitutes for a completed campaign.

### 1.1 Relationship to existing documents

| Document | Role after this baseline |
| --- | --- |
| [PRD.md](../PRD.md) | Legacy mechanics and architecture specification. Reuse implemented behavior and acceptance evidence. Its six engineering phases are not the new release definition. |
| [PRD-Addendum.md](../PRD-Addendum.md) | Existing Section 6 presentation obligations and history; retain compatible art and combat contracts. |
| [Section 6 plan](../SECTION6_IMPLEMENTATION_PLAN.md) and [report](../SECTION6_PROGRESS_REPORT.md) | Implementation history. A passed subsystem gate carries forward as subsystem evidence only. |
| This document | Product completeness, proposed launch scope, and measurable quality requirements. Confirmed owner choices take precedence; unconfirmed numerical targets remain proposals until P0 baseline review. |
| [Delivery plan](PRODUCTION_DELIVERY_PLAN.md) | New P0–P8 milestones, dependencies, work packages, and acceptance procedure. |

No gameplay changes, engine migration, purchases, hiring, hosting changes, or release approval are performed by adopting this planning draft. Preserve existing Phase 1–5 mechanics and regression coverage during implementation. Any intentional future behavior change needs an explicit design decision, migration impact, and focused verification; a broad rewrite is not the default.

### 1.2 Completion vocabulary

| State | Required meaning |
| --- | --- |
| Implemented | Code or content exists and can be exercised. |
| Technically verified | Relevant automated/integration checks pass on an identified revision. |
| Experience accepted | Normal gameplay, final presentation, and usability pass representative player review. |
| Qualified | Applicable performance, compatibility, reliability, accessibility, and operational checks pass on a release candidate. |
| Accepted requirement | Technical, experience, and qualification evidence required by that row all pass, with owner review recorded. |
| Shippable game | Every launch requirement is accepted, all release gates pass, and no launch blocker remains. |

Do not report a requirement as complete because a file exists, a model has enough joints, a unit test passes, or a QA script teleports to the finale. Temporary development blockouts are allowed in unfinished work; they cannot pass final content acceptance. Genuine procedural assets can ship when they meet the same quality bar as imported assets.

## 2. Current state and material gaps

This is a source-and-artifact audit of the working tree on November 13, 2026, not a fresh runtime certification. The checkout contains substantial uncommitted work; HEAD alone does not identify the audited build. No old test result is being represented as a newly executed result.

| Area | Evidence in this checkout | Gap the new program must close |
| --- | --- | --- |
| Mechanics | Shared physics, seven attributes, targeting/counters, vehicles, skills, relics, district loops, companions and Dreadnought have implementation and saved test evidence. | Integrated feel, balance, teaching, solo completion, mission variety and sustained player engagement. |
| World | Four named quadrants, a 1,200 × 1,200 m footprint, 18 detailed buildings and hundreds of climbable ledges are recorded. Bay and bridges extend the vista. | Designed streets and neighborhoods, contiguous playable routes, authored interiors, meaningful density, population, traffic, navigation and environmental storytelling. Distant scenery is not playable map area. |
| Materials and characters | Four installed 2K PBR sets, HDR, sample Soldier/Xbot rigs, procedural armor, and a real 39-clip Capoeira library. | Cohesive final material coverage, original hero/faction/boss identity, complete state-specific animation and readable close-up presentation. Downloaded clip count is not integration coverage. |
| Animation | Armada is retargeted onto the visible armor for the third melee strike. Many other states retain procedural fallbacks. | Locomotion, transitions, traversal, weapon handling, reactions, death/recovery, vehicles, facial performance and contact quality. The seven-clip agent_cyber starter remains pending in the current records. |
| AI | The inspected enemy update selects nearby targets, follows patrol points, steers using obstacle whiskers/separation, and runs melee/counter states. | Reliable navigation over authored geometry, perception/memory, cover, ranged roles, coordinated tactics, recovery and convincing civilian behavior. Comments using “navmesh” or “flanking” do not demonstrate these behaviors. |
| Narrative | Three-act bible, comms choices and short in-engine opening/boss introductions exist. | A fully authored playable campaign, side stories, staged performance, final audio, pacing, ending, journal and persistent story continuity. |
| Persistence | Individual progression and companions persist; live district/raid state resets on server restart, as documented in README. | Resumable personal campaign and owned world state, stable checkpoints, co-op reconciliation and safe migrations. |
| Presentation | PBR, outlines, water, effects, bounded synthesized HRTF sound and skippable camera sequences are implemented. Saved screenshots show sparse large ground areas and procedural/sample presentation. | Finished composition at street scale, cohesive authored sound/music/voice, character performance and consistent quality through the finale. |
| Release | Existing ledger explicitly leaves human playtests, hardware FPS, native background behavior and hosted qualification open. | Full product acceptance, reproducible qualification and an operable launch build. |

Audit anchors: [current ledger](../artifacts/project-progress.md), [asset manifest](../public/assets/manifest.json), [asset acquisition guide](ASSET_ACQUISITION_GUIDE.md), [world generator](../shared/world/neoVeridiaBlock.ts), [enemy update](../shared/combat/enemyRigSystem.ts), [story bible](../shared/narrative/storyBible.ts), [saved live-cinematic report](../artifacts/evidence/stage6-live.json), [city screenshot](../artifacts/evidence/stage6-live-city.png), and [agent screenshot](../artifacts/evidence/stage6-agent.png). Screenshots establish visible conditions in those views, not a complete world audit.

Follow-up after the owner instructed execution: the [initial P0 audit](../artifacts/product-baseline-audit.md) adds fresh build identity, source/runtime inventory, animation coverage, available-host hardware and a limited normal-input browser diagnostic. Its available 5070/64 GB host differs from the requested 4070/16 GB target; it does not qualify that target or complete a human playtest. The audit and this planning baseline have separate evidence scopes.

## 3. Product pillars and player journey

1. **Expressive super-agent traversal.** Moving through streets, interiors and rooftops is enjoyable, legible and reliable before rewards are added.
2. **Readable, physical combat.** Shooting, limb tactics, counters, movement and destructible props support choices; enemies visibly react and can defeat inattentive players fairly.
3. **A city worth exploring.** Each district has coherent geography, landmarks, residents, environmental stories and activities that fit its identity.
4. **A complete authored campaign.** Vance, Sera and Voss have staged, understandable arcs from recruitment through revelation to the Dreadnought and aftermath.
5. **A dependable personal adventure with friends.** Solo is a complete experience. Co-op adds cooperation while preserving each player's progress and control.

Normal journey: launch → accessibility/settings → new/continue game → learn movement/combat in a real mission → explore and upgrade → complete escalating district stories → resolve the narrative → credits → meaningful post-campaign free roam/replay. Returning players receive a useful recap and resume at a valid checkpoint. Failure, disconnect, skip, death, and replay are designed paths through this journey.

## 4. Working launch content envelope

These are planning floors for estimating work, not claims about current content or industry standards. The owner selected this proposed scope as the working baseline, explicitly including four districts, 24 campaign missions, a 12–18-hour solo campaign and optional 1–8 co-op. Keep changes explicit; this does not accept implemented content or independently proposed NFR thresholds. Missions count only after unique objective flow, space, encounters, dialogue, rewards, fail/retry paths, and normal-play evidence are accepted. Skin or coordinate variations do not create new missions/archetypes.

| Deliverable | Full launch baseline | P3 vertical slice sample |
| --- | --- | --- |
| Playable world | Four fully authored districts inside the existing approximately 1.44 km² footprint; expand boundaries only if route density and performance justify it. | One contiguous Docks neighborhood, approximately 200–300 m across, connected to a usable safehouse, waterfront and roof route. |
| World identity | At least three recognizable neighborhoods and one major landmark per district; four district hubs/safehouses. | One hub, three route landmarks, one finished skyline composition and a readable local street network. |
| Interiors | At least 12 substantial enterable locations, including four campaign-critical interiors, with meaningful navigation/combat/story uses. Not every facade is enterable. | One fully furnished mission interior plus the safehouse. |
| Campaign | Approximately 12–18 hours for a first-time solo player on standard difficulty; 24 authored missions across three acts, including a tutorial, set pieces, finale and aftermath. | One complete 30–45 minute operation, including travel, dialogue, combat, rewards, checkpoint/retry and a boss. |
| Optional authored content | At least 16 side missions in four multi-mission character/area arcs; 12 distinct traversal/combat/driving challenges; 8 systemic event templates with meaningful variations. | One side mission, two challenges and one event template. |
| Exploration | Existing 182 orbs and four relics preserved and revalidated; optional lore, hidden routes and location discoveries. Target total engaged play of 25–40 hours without mandatory grinding. | At least 10 intentionally placed collectibles, one secret route and one environmental story. |
| Characters | One polished playable agent rig with all five chassis identities; Vance, Sera and Voss with final presentation; at least four side-story characters and a consistent civilian population family. | Final agent, two faction combatants, one civilian family, one boss and one performed story exchange. |
| Combat | At least eight tactically distinct regular enemy roles, four district boss designs, and the Dreadnought finale. Existing lieutenant/kingpin positions may share a family only where encounter play remains distinct. | Three complementary enemy roles and one finished boss encounter. |
| Equipment | At least six mechanically distinct primary/secondary weapon options, two explosive options, the established traversal/throwing systems and five viable chassis builds. Preserve existing progression/relic contracts. | Two finished ranged weapons, full melee/counter loop, one explosive, one useful upgrade choice and relevant traversal tools. |
| Vehicles | At least three distinct controllable vehicle handling profiles; traffic variants and destruction consistent with their use. | One finished agency vehicle and a traffic sample. |
| Companions | All advertised companion adoption, commands, progression and arena modes completed and taught. Provide solo practice; multiplayer competitions can require participants when clearly labeled. | One finished companion family and one usable practice activity. |
| Audio and cinema | Full mission/important NPC dialogue, authored sound identity, adaptive music and all required story/boss sequences. No compulsory duration quota for cutscenes. | Final-quality dialogue for the sample, layered combat/vehicle/foley/environment mix, music transitions and one cinematic with safe skip. |
| Co-op | Complete campaign supports 1–8 players. No campaign objective requires another human. | Same operation validated solo, with two/four players and under eight-client combat load. |

Counts and duration can conflict. If the measured campaign is short, add meaningful play and narrative development; do not lengthen travel, inflate health or require collectible grinding to satisfy a duration target. If solo production cannot sustain this envelope, the owner must choose more time, paid help, or a documented scope revision. Do not silently call a reduced release “AAA complete.”

### 4.1 Explicit boundaries and future expansion

Launch does not assume PvP, an MMO population, console/mobile/VR releases, every building being enterable, fully destructible skyscrapers, an unbounded procedural city, or live generative-AI conversations. These may become separate costed expansions. Weather is a bounded authored presentation/gameplay system; a large climate simulation is not implied.

A larger franchise-scale horizon can add districts, deeper civilian schedules/economy, additional traversal families, extensive story branches, more vehicles/interiors and platform ports after the complete first game is proven. A native engine migration, new platform or enlarged world requires its own decision record and acceptance plan. Optional co-op means a solo player never has to recruit someone. The owner has explicitly required offline solo: after installation, launch/continue, the full campaign and saves must work without internet. Runtime/packaging feasibility and qualification remain open.

## 5. Requirement register conventions

All FR and NFR rows are **Must for the proposed launch baseline**. Their numerical targets are proposed unless explicitly identified as owner-confirmed. A scope change must name the affected IDs and update the launch contract. Requirements introduced early remain regression obligations through release.

“Gate” is the latest milestone at which full evidence is required. Relevant samples are built and evaluated earlier, especially at P3. Roles identify the discipline accountable for acceptance, not a required employee count: PD product/design, LD level design, ART art/lighting, ANIM animation, AI behavior/navigation, ENG engineering, NAR narrative, AUD audio, UX interface/accessibility, QA verification/playtesting, OPS deployment/support. The solo owner can cover several roles, with effort recorded honestly.

### 5.1 Whole game, campaign, and progression

| ID | Requirement and acceptance | Required evidence | Owner | Gate |
| --- | --- | --- | --- | --- |
| FR-CORE-01 | New/continue, settings, tutorial, failure/retry, complete campaign, ending/credits and postgame work through normal UI. No developer command, forced damage or teleport is needed. | Recorded normal-input full playthrough and QA route checklist. | PD/QA | P6 |
| FR-CORE-02 | All campaign missions and bosses are completable alone on standard difficulty with obtainable equipment; co-op objectives scale by role/pressure as well as health. | Solo campaign run and 1/2/4/8-player encounter comparison. | PD/QA | P6 |
| FR-CORE-03 | The opening teaches movement, camera, aiming, melee/counter, objective interaction, recovery and first upgrade in context. At least 8 of 10 unfamiliar players finish the opening operation without coaching; median first meaningful action ≤2 minutes after control begins. | Observed sessions, raw timings, assistance/death/navigation log. | UX/PD | P3 |
| FR-CORE-04 | Campaign, side missions, challenges, exploration, builds and companions meet the approved content envelope; the last district meets the same acceptance bar as the first. | Accepted content inventory plus late-game review and duration study. | PD/QA | P6 |
| FR-CAMP-01 | Every mission has a brief, objective transitions, authored spaces/encounters, success/fail states, useful rewards, checkpoint/retry and journal entry. At least six objective families are used across the campaign. | Mission matrix and end-to-end pass for every mission. | PD/LD | P6 |
| FR-CAMP-02 | Each act introduces a new conflict, meaningful gameplay development and a playable turning point. Four district arcs differ in objective sequencing and encounter design; repeating relay/boss/core four times is insufficient. | Act/mission beat sheet, campaign walkthrough and reviewer rationale. | NAR/PD | P6 |
| FR-CAMP-03 | Five chassis branches, seven attributes, all 20 established nodes and relic unlocks have understandable descriptions and measurable uses. At least three materially different builds complete representative early/mid/late encounters without a mandatory exploit. | Economy/progression sheet, build comparison and server-authority checks. | PD/ENG | P6 |
| FR-CAMP-04 | Rewards, respec policy and difficulty options prevent irreversible campaign dead ends. Mandatory advancement is available from normal campaign play; retrying or replaying cannot duplicate unique rewards. | Fresh-account progression runs, spending/retry/replay abuse cases. | PD/QA | P6 |
| FR-CAMP-05 | After the ending, credits, story closure, district state, remaining activities and mission replay have explicit behavior. New Game and save deletion require clear confirmation. | Finale-to-postgame run, replay reward checks and UI review. | PD/UX | P6 |

### 5.2 Complete maps, exploration, and a populated world

| ID | Requirement and acceptance | Required evidence | Owner | Gate |
| --- | --- | --- | --- | --- |
| FR-WORLD-01 | All four districts have approved maps covering streets, shore/bounds, terrain/elevation, roofs, traversable connections, interiors, hubs, encounter spaces and landmarks. Every required objective is reachable at its intended progression tier. | Editable map sources, collision/navigation overlays and route traversal matrix. | LD/ENG | P4 |
| FR-WORLD-02 | Each district has a distinct architectural/material kit, neighborhood purpose, landmark silhouette, soundscape and lighting identity. Connected streets and public spaces replace unsupported expanses of ground. | Street/roof/interior capture set and art/level review for every neighborhood. | ART/LD | P4 |
| FR-WORLD-03 | On at least 90% of sampled normal exploration routes, a meaningful discovery, encounter, interaction or deliberate vista occurs within 60 seconds. Intentional quiet routes are mapped and justified. Distant decorative objects do not count. | Ten timed routes per district at normal progression speeds; encounter/discovery log. | LD/QA | P4 |
| FR-WORLD-04 | Every advertised interior is furnished, lit, collision-complete and supports its stated activity. Loading boundaries and closed doors communicate access accurately; window shaders do not count as interiors. | Interior inventory, traversal/combat pass and connection/loading checks. | LD/ART | P4 |
| FR-WORLD-05 | Civilians have observable idle/work/travel behaviors and plausible reactions to threat, vehicles and district events. Streets show bounded ambient traffic with stopping, avoidance and recovery; distant population can use cheaper simulation. | Ten-minute samples in all districts, threat tests and simulation budget profile. | AI/LD | P4 |
| FR-WORLD-06 | Time of day and approved weather/atmosphere variants retain mission visibility, traversal readability and NPC usability. District liberation causes visible, persistent world changes instead of only HUD text. | Before/after world states, night/weather routes and save/reload comparisons. | ART/LD/ENG | P5 |
| FR-WORLD-07 | Map, compass, objective markers and journal distinguish elevation, interior entrances, discovered/undiscovered locations and optional content. Routes never guide players through unavailable geometry. | First-time navigation tasks across street/roof/interior transitions. | UX/LD | P4 |
| FR-WORLD-08 | All 182 orbs, four relics and required collectibles have stable IDs and reachable placements. Secrets reward observation; sound-based hunting has a usable visual alternative. | Collection/placement audit by progression tier and reload/reconnect checks. | LD/UX | P6 |

### 5.3 Player control, combat, weapons, and vehicles

| ID | Requirement and acceptance | Required evidence | Owner | Gate |
| --- | --- | --- | --- | --- |
| FR-PLAY-01 | Walk/run/sprint, strafe, jump, dash, mantle, grapple, flight, pickup/throw and recovery form a consistent controller. The authored route suite has no unavoidable snag, accidental fall-through or unrecoverable control state. | At least 50 grounded/vertical transition cases with normal input at relevant skill tiers. | ENG/ANIM | P2 |
| FR-PLAY-02 | Camera works in tight interiors, on roofs, while aiming/driving, during grabs/counters and at high speed. Collision, shoulder behavior, FOV and motion settings avoid obscuring required targets or trapping the view. | Camera obstacle suite and continuous movement/combat recordings. | ENG/UX | P2 |
| FR-PLAY-03 | Every weapon has recognizable handling, firing rhythm, recoil, impact, audio and a tactical purpose. Spread, ammo/reload behavior and upgrades are explained; muzzle visuals and authoritative hits agree. | Weapon role sheet, moving/fixed target tests and gameplay review. | PD/ANIM/AUD | P5 |
| FR-PLAY-04 | Melee, targeting, limb effects, parry, knockback, wall-splat and death have readable cause/effect. Attacks cannot routinely hit through solid cover or produce damage before their readable contact. | Recorded fight suite and authority/contact checks at 0/80/150 ms RTT. | PD/ENG | P2 |
| FR-PLAY-05 | Challenge comes from positioning, roles, timing and resource decisions. Standard encounters use at least two viable approaches; difficulty adjusts useful behavior/pressure and assistance, not solely enemy HP. | Encounter option matrix, difficulty runs and unfamiliar-player feedback. | PD/AI | P5 |
| FR-PLAY-06 | Each drivable profile has controlled acceleration/braking/turning, usable camera, entry/exit, collision/damage feedback and a recovery path. Doors and exits cannot permanently strand a player; thrown objects obey authority and mass rules. | Urban drive/combat/rollover/exit/throw cases and multiplayer observation. | PD/ENG | P5 |

### 5.4 Intelligent enemies, bosses, civilians, and companions

| ID | Requirement and acceptance | Required evidence | Owner | Gate |
| --- | --- | --- | --- | --- |
| FR-AI-01 | Navigation covers ground, stairs, interiors and intentional vertical links using actor capabilities. At least 98 of 100 representative reachable start/goal cases succeed; blocked routes trigger replan/recovery within 3 seconds rather than indefinite wall-running. | Authored navigation test corpus, dynamic-obstacle runs and debug replays. | AI/QA | P2 |
| FR-AI-02 | Perception respects sight occlusion, hearing events, last-known position and a bounded search/alert memory. Enemies do not know concealed player transforms without an explicit communicated sensor ability. | Hidden/seen/heard/lost-target scenarios and decision traces. | AI/PD | P2 |
| FR-AI-03 | Ranged, melee, shield/heavy, mobile, support and specialist roles make different decisions about range, cover, suppression, flanking, retreat or rescue. Nearby squadmates do more than separate; selected tactics are observable and counterable. | Eight-role behavior matrix and at least 20 mixed-squad scenario replays. | AI/PD | P5 |
| FR-AI-04 | Enemies handle disabled limbs, disarms, thrown props, explosives, inaccessible players, death and encounter reset coherently. No required target becomes permanently unreachable or essential NPC permanently lost. | Disruption/recovery suite and unattended encounter soak. | AI/QA | P5 |
| FR-AI-05 | Each district boss and Dreadnought has a distinct arena, readable moves, counterplay, phase changes, music/presentation, retry and aftermath. Solo and eight-player tactics work without unbounded adds or unavoidable wipe loops. | Boss design sheets, full normal-play kills and wipe/rejoin tests. | PD/AI/ANIM | P6 |
| FR-AI-06 | Civilians and traffic avoid chronic loops, collisions and synchronized robotic reactions. Named side characters retain story state and use appropriate contextual behavior. | Threat/traffic tests in dense spaces and mission-state continuity checks. | AI/NAR | P5 |
| FR-AI-07 | Companions follow across intended routes, recover when separated, respond to supported commands and have readable combat/support effects. Adoption, progression, arena rules and solo practice are taught and saved. | Companion route/command suite, progression/reconnect and arena playtests. | AI/PD | P5 |

“Intelligent” is accepted through these observable behaviors and enjoyable encounters, not use of a particular AI technique or a language model. Record decision traces and fixed seeds for reproducible debugging; visual variety alone does not meet tactical diversity.

### 5.5 Art, models, materials, lighting, and effects

| ID | Requirement and acceptance | Required evidence | Owner | Gate |
| --- | --- | --- | --- | --- |
| FR-ART-01 | An approved art bible specifies stylized PBR/ink treatment, shapes, scale, faction palettes, wear, signage, lighting and UI. Three target scenes—street, rooftop and interior—establish the launch bar using actual gameplay assets. | Art bible, reference sheets and approved target captures. | ART/PD | P1 |
| FR-ART-02 | Hero, faction, story character, boss, companion, weapon, vehicle and environment assets use a coherent design family with production UVs, materials, scale, collision, sockets and silhouettes. Sample rigs cannot stand in for named final characters. | Asset inventory with in-game close/mid/far views and role acceptance. | ART | P6 |
| FR-ART-03 | Every visible production surface has an intentional material assignment. Required albedo/normal/roughness/metalness/emissive/AO channels use correct color space and scale; absent channels have intentional constants. No missing maps, stretched hero surfaces or accidental mixed texture styles remain. | Material coverage/texel-density sheet, reference-light renders and in-game review. | ART | P4 |
| FR-ART-04 | Texture packs and models have mipmaps/LODs or an approved equivalent, compression and streaming tiers. Hero assets can use higher resolution where visibly beneficial; a 4K/8K label is never an acceptance criterion by itself. | Cook report, VRAM/streaming profile and near/far transition capture. | ART/ENG | P4 |
| FR-ART-05 | Buildings and spaces have entrances, structural logic, furnishings/dressing, surface variation, signage and environmental story appropriate to their use. Multipart mesh count alone does not establish believable architecture. | District scene review and street-scale reference comparisons. | ART/LD | P4 |
| FR-ART-06 | Lighting, shadows, reflections/approximations, exposure, fog and outlines support depth and target readability in every approved time/weather state. No persistent outline noise, severe shimmer, black interiors or unlit critical enemies. | Matched route captures and motion review across quality presets. | ART/ENG | P6 |
| FR-ART-07 | Effects communicate weapon/limb/material impacts, threat, destruction and power without obscuring combat. Pools and debris limits remain bounded, and reduced-effects settings retain essential information. | Dense eight-player fight, readability review and resource profile. | ART/ENG | P5 |
| FR-ART-08 | Every shipped asset has real source files or retrievable provenance, license snapshot, author/provider, usage terms, hashes and attribution where required. No fake URLs, empty assets or undocumented substitutions. | Asset manifest/license audit covering models, textures, motion, fonts, audio and video. | ART/PD | P6 |

Implementation guidance for the current web stack: use glTF/GLB for delivery models where appropriate and evaluate KTX2/Basis texture compression with real device tests. Khronos describes the format's GPU transcoding and mip support; format compliance does not establish visual quality. [Khronos KHR_texture_basisu specification](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_texture_basisu/README.md).

### 5.6 Animation and physical performance

| ID | Requirement and acceptance | Required evidence | Owner | Gate |
| --- | --- | --- | --- | --- |
| FR-ANIM-01 | An animation coverage matrix maps each relevant actor, gameplay state, transition, blend, contact/event and fallback. Establish the matrix at P2; integrated, accepted coverage reaches 100% for launch states by P6. Unavailable motion is marked missing rather than implied by imported clip count. | State/actor matrix with in-game links and provenance. | ANIM/ENG | P6 |
| FR-ANIM-02 | Player/enemy locomotion covers idle, start/stop, turning, walk/jog/sprint, directional strafe, jump rise/apex/fall, soft/hard landing and slopes/stairs. Speed/blending and foot contacts avoid visible skating in representative movement. | Front/side/behind continuous recordings at all movement tiers. | ANIM | P2 |
| FR-ANIM-03 | Mantle/hang/vault, grapple, flight, pickup/carry/throw, vehicle enter/drive/exit, companion interactions and recovery have authored or equally accepted procedural transitions. Hands/feet contact intended geometry and occupied seats correctly. | Traversal/interaction contact suite across actor scales. | ANIM/ENG | P5 |
| FR-ANIM-04 | Aim, recoil, weapon switch/reload where supported, melee chains, parry, disarm, stagger, cripple, knockback, death and revive blend without snapping/T-poses. Foot/body placement, weapon grip and paired counter contacts remain coherent under latency. | Full combat animation reel plus normal fights at tested RTTs. | ANIM/ENG | P2 |
| FR-ANIM-05 | Animation events, hitboxes and authority use an agreed timing contract. Root motion or motion warping cannot move through solid walls or let cosmetic pose state invent damage. | Contact/authority overlay, obstruction and cancellation tests. | ANIM/ENG | P2 |
| FR-ANIM-06 | Named cast and close-up NPCs have suitable gaze, gestures, facial expression and lip sync or an intentionally approved stylized performance treatment. Repeated generic idle/speech tones cannot pass final dramatic scenes. | Reviewed dialogue scenes at gameplay camera distance. | ANIM/NAR | P6 |

### 5.7 Story, cinematics, video, sound, and music

| ID | Requirement and acceptance | Required evidence | Owner | Gate |
| --- | --- | --- | --- | --- |
| FR-NAR-01 | A complete script/beat bible ties each mission, revelation, character arc, side arc, collectible and ending to playable actions. Required Act II information cannot be permanently missed by choosing a different play style. | Branch/trigger graph and full critical-path narrative run. | NAR/PD | P5 |
| FR-NAR-02 | Dialogue choices have honest labels and documented effects; informational choices are not presented as major branching consequences. Objective dialogue can be reviewed in journal/transcript. | Choice/effect matrix and returning-player comprehension tasks. | NAR/UX | P5 |
| FR-NAR-03 | Cinematics are staged with accepted actors, animation, lighting, editing, audio and subtitles. Skip works at any point and preserves intended story/objective state; death, damage, focus loss and disconnect restore control safely. | Scene list, shot reviews and lifecycle/co-op interruption suite. | NAR/ANIM/ENG | P6 |
| FR-NAR-04 | In co-op, seen-state, synchronized events, late arrivals and skip rules are explicit. A player cannot repeatedly seize others' cameras or erase another player's first story exposure. | Two/four/eight-player scene and late-join scenarios. | NAR/UX/ENG | P5 |
| FR-NAR-05 | If pre-rendered video is used, encode/decode, resolution, subtitle tracks, audio levels, skip and loading fallback work on supported devices; unavailable video never blocks campaign progression. In-engine scenes are sufficient if they meet the same dramatic bar. | Media inventory and interrupted/failed playback tests. | ENG/NAR | P6 |
| FR-AUD-01 | Final foley, weapons, impacts, movement, vehicles, UI and ambience have curated variation, spatial position, priority and dynamic range. Existing synthesis may remain where artistically accepted; unreviewed test beeps cannot stand in for final voice or sound identity. | Sound event coverage, quiet/dense scene listening review and clipping report. | AUD | P5 |
| FR-AUD-02 | Main campaign and important NPC dialogue have intelligible final recorded or expressly approved performed voices, with consistent direction and usage rights. Synthesized cadence alone is not spoken dialogue. | Final line database, rights record, pronunciation/mix review and missing-line audit. | AUD/NAR | P6 |
| FR-AUD-03 | Music supports exploration, tension, combat, bosses and resolution with coherent transitions and no unintended restart on repeated state changes. Voice ducking and independent master/music/voice/effects controls work and persist. | Music state map, transition recordings and saved-settings checks. | AUD/ENG | P5 |
| FR-AUD-04 | Every spoken line and gameplay-critical sound has an accessible textual/visual equivalent. Radio priority prevents simultaneous critical instructions; audio loss cannot remove the only objective cue. | Muted campaign sample, subtitle/caption coverage and concurrent-dialogue tests. | AUD/UX | P6 |

Video duration, photorealism and cinematic count are not substitutes for playable content. Produce expensive final performance only after the script, actor rigs and environment are accepted; representative performance is included in the early slice.

### 5.8 Menus, accessibility, player comfort, and localization

| ID | Requirement and acceptance | Required evidence | Owner | Gate |
| --- | --- | --- | --- | --- |
| FR-UX-01 | All normal flows work with keyboard/mouse and a supported standard gamepad, including boot, settings, menus, map, combat and text entry fallback. Remapping, deadzones, sensitivity, inversion and prompt switching persist. | Device/mapping matrix, hot-swap and controller-only campaign sample. | UX/ENG | P3 |
| FR-UX-02 | Health, damage direction, targets, objective progress, resources and rewards are readable without debug UI. Tutorials adapt to bindings and can be reviewed; UI scaling and common aspect ratios avoid clipped essential controls. | 1080p/1440p/4K and ultrawide UI review with novice sessions. | UX | P3 |
| FR-UX-03 | Subtitles are available before the first spoken line, identify speakers and support size/background adjustment. Critical sounds have captions; threat/state information never relies solely on color or sound. | Settings-first flow and color/audio-disabled mission tests. | UX/AUD | P3 |
| FR-UX-04 | Camera shake, motion blur if present, flashing effects, FOV and cinematic motion are configurable; aiming/sprint/interaction have toggle alternatives. Difficulty/aim/counter assistance options preserve campaign access. | Comfort/accessibility checklist and representative player sessions. | UX/PD | P3 |
| FR-UX-05 | Supported UI, subtitles, input prompts and journal text use localization keys, correct font coverage and layout expansion. English is the proposed launch language; additional languages require an approved list and complete translation QA before being advertised. | String inventory, pseudo-localization and language-switch/save tests. | UX/NAR | P6 |
| FR-UX-06 | Solo campaign gameplay pauses through the pause menu. Online co-op menus clearly communicate that the world continues; joining/leaving a party cannot silently change pause behavior. Focus/device loss never leaves stuck inputs or hidden lethal solo gameplay without the designed response. | Pause/background/gamepad loss tests in solo and co-op. | UX/ENG | P3 |

Use Microsoft's Xbox Accessibility Guidelines as a review framework, not a claim of platform certification. In particular, review input, captions, multimodal cues, UI navigation and motion settings. [Guidelines index](https://learn.microsoft.com/en-us/xbox/accessibility/guidelines), [subtitles and captions](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/104), [input](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/107).

### 5.9 Co-op, identity, saves, and distribution

| ID | Requirement and acceptance | Required evidence | Owner | Gate |
| --- | --- | --- | --- | --- |
| FR-NET-01 | Installed new/continue solo and the complete campaign work without internet, remote authentication, party, matchmaking queue or second account. Up to eight friends can form a private/invite session, join/leave, see party status and recover from join failures through usable UI. | Cold-cache installed offline solo launch/continue/completion and 2/4/8-player lobby/session runs. | ENG/UX | P5 |
| FR-NET-02 | Party authority, owned world/campaign, guest rewards, mission selection, level scaling, join-in-progress, catch-up, leave and reconnect policies are documented and visible. Guests never overwrite their own campaign unintentionally. | Policy matrix and unequal-progress party scenarios. | PD/ENG | P5 |
| FR-NET-03 | Combat/vehicles/interactions remain coherent across peers; objectives and important rewards are awarded exactly once. Teammates can locate/revive one another and cooperate without client-granted progress. | Real-client action/reward tests under the network profiles below. | ENG/QA | P5 |
| FR-NET-04 | Communication supports pings and essential preset messages. If text/voice chat is shipped, mute/block and an operational abuse/reporting policy are required before enabling it. Voice chat is not required to complete any mission. | No-voice co-op run and applicable social control tests. | UX/OPS | P5 |
| FR-NET-05 | A premium identity flow provides durable ownership/account or local-profile behavior appropriate to distribution, recovery and secure session handling. The existing short PIN flow is evaluated rather than automatically accepted for paid public service. | Identity design, recovery/throttle/session tests and migration rehearsal. | ENG/OPS | P5 |
| FR-SAVE-01 | Character, campaign checkpoints, mission decisions, owned district liberation, inventory/skills, collectibles, companions and settings have an explicit durable-state schema. Restarting the service cannot silently reset a player's owned campaign. | Save-state inventory and before/after client/server restart comparison. | ENG | P5 |
| FR-SAVE-02 | Autosave feedback and manual save/checkpoint policy are clear. Interrupted writes, disk-full, forced close, patch rollback and corrupt saves recover to a valid state with an understandable message and backup path. | Fault-injection/recovery suite on real storage. | ENG/QA | P7 |
| FR-SAVE-03 | Mission replay, rewind, reconnect, guest play and repeated requests cannot duplicate unique rewards or roll back another player's progress. Supported older saves migrate without reset; irreconcilable state is recoverable. | Versioned save fixtures, transactional reward and migration tests. | ENG/QA | P7 |
| FR-DIST-01 | The selected PC delivery path has new-user installation/launch, integrity/version checks, updates, settings/save locations, clean uninstall and useful failure recovery. All required solo runtime/content is installed locally; offline launch needs no development terminal, remote entitlement renewal or CDN fetch. A temporary tunnel is not the release distribution plan. | Clean Windows machine/user journey, installed offline run with internet unavailable, and update/rollback rehearsal. | ENG/OPS | P7 |
| FR-DIST-02 | Store/product copy, controls, system requirements, accessibility information, content disclosures, credits and help accurately describe the qualified build and online/offline requirements. | Release checklist against shipped behavior and final owner review. | PD/OPS | P8 |

## 6. Non-functional requirements

These are proposed internal service and quality targets, not measured capabilities or externally mandated “AAA” thresholds. P1 measures feasibility; P3 proves a representative load; P7 qualifies the full release candidate. Record exact CPU, GPU/driver, 16 GB RAM configuration, storage, OS, display resolution and application/browser build. The CPU and final minimum-spec tier remain to be identified. Do not purchase a stronger machine to excuse a failure on the owner's reference configuration.

### 6.1 Qualification profiles

| Profile | Defined conditions |
| --- | --- |
| Reference PC | Owner's desktop RTX 4070, 16 GB RAM, SSD, exact CPU/OS/driver recorded during P0/P1. Windows 11 desktop is the proposed primary platform. Normal OS/background workload is included. |
| Reference graphics | Proposed 2560 × 1440 High, native resolution, no frame generation. Sensible optimized lighting and texture budgets; ray tracing is not required. Upscaling can be offered as an option and measured separately. |
| Accessible performance tier | 1920 × 1080 balanced preset on the reference machine, plus a lower-spec machine selected from actual P1 measurements. Advertise no minimum tier until it passes. |
| Typical network | 80 ms RTT, ±20 ms jitter, 1% application-message loss, 25 Mbps down / 5 Mbps up per client, separate real clients and server. For WebSocket/TCP, also test transport packet loss/retransmission; application drops alone do not model head-of-line blocking. |
| Adverse network | 150 ms RTT, ±40 ms jitter, 3% transport loss; outages of 5/15/60 seconds, slow clients, server restart and version mismatch. State which properties degrade and which remain guaranteed. |
| Representative maximum scene | Eight players, at least 24 active combatants (including mixed ranged/melee/support roles), four nearby vehicles, civilians/traffic, a boss/large effect burst where applicable, full materials/audio and normal streaming. P1/P3 may refine counts through an explicit capacity decision; do not profile an empty scene as release load. |
| Route run | Five-minute warmup followed by at least 30 minutes covering street/interior/roof traversal, high-speed driving/flight, district boundaries and dense combat, repeated three times. Capture cold load separately. |

### 6.2 Performance, loading, memory, and scale

| ID | Requirement and acceptance | Required evidence | Owner | Gate |
| --- | --- | --- | --- | --- |
| NFR-PERF-01 | On the reference profile, mean FPS ≥60, p95 frame time ≤16.7 ms and p99 ≤33.3 ms across each route run; no recurring gameplay hitches >100 ms. Report all runs, CPU/GPU frame times and stutter locations. | Frame-time traces on physical hardware; percentile method and raw data. | ENG/QA | P7 |
| NFR-PERF-02 | Maintain reference-PC headroom: proposed game process-tree RAM ≤6 GB steady/8 GB peak, estimated resident GPU allocations ≤6 GB steady/8 GB peak. No game-induced sustained paging, out-of-memory or GPU device loss on a 16 GB system. | Whole-process-tree/system memory traces; GPU captures with browser accounting limits stated. | ENG/QA | P7 |
| NFR-PERF-03 | After warmup, two-hour repeated traversal/combat/scene-load cycles have no monotonic retained-resource growth; final idle retained RAM is within 10% or 100 MB, whichever is larger, of the first warmed idle sample. Bounded caches have documented caps. | Heap/resource snapshots, audio-node counts and two-hour plots. | ENG | P7 |
| NFR-PERF-04 | Cached boot to usable menu ≤10 s and Continue to control ≤15 s from SSD; mission retry ≤8 s. First-play web delivery, if selected, targets ≤150 MB critical download and ≤90 s on 25 Mbps including initialization; stream later content with progress/retry and no missing required collision. | Clean-cache and warm-cache runs, bytes transferred, CDN/network and SSD timings. | ENG/UX | P7 |
| NFR-PERF-05 | Movement/look receives local visible response within two presented frames at 60 FPS under nominal load. Shot/melee feedback respects the authority contract and remains understandable under typical latency. | Frame/input instrumentation and high-frame-rate capture where available. | ENG/ANIM | P3 |
| NFR-PERF-06 | Preserve the proposed 60 Hz authoritative simulation and 30 Hz snapshots at eight-player representative load: p95 simulation work ≤12 ms, p99 ≤16.7 ms, no sustained catch-up spiral; server per-instance RAM ≤2 GB on an explicitly benchmarked host. | Server tick/queue/event-loop metrics and hardware record. | ENG/OPS | P7 |
| NFR-PERF-07 | Typical steady-state gameplay traffic targets ≤256 KB/s down and ≤64 KB/s up per client, excluding assets. Late join/state recovery is bounded and observable; a slow receiver cannot grow server memory without limit. | Per-client byte/queue traces and slow-client tests. | ENG | P5 |
| NFR-PERF-08 | Draw calls, triangles, material/texture residency, active physics bodies, navigation work, effects and audio voices have per-scene budgets derived from the frame target. LOD/culling/streaming transitions preserve collision, threats and navigation. | Budget sheet plus quality/performance comparison in worst-case routes. | ENG/ART | P4 |

### 6.3 Reliability, networking, and data integrity

| ID | Requirement and acceptance | Required evidence | Owner | Gate |
| --- | --- | --- | --- | --- |
| NFR-REL-01 | Release qualification records ≥99.5% crash-free player sessions over at least 200 sessions and 500 aggregate player-hours, with ≥20 unique human testers. Zero known repeatable campaign blockers or confirmed lost durable rewards. | Build-tagged session/crash log and issue reconciliation. | QA | P7 |
| NFR-REL-02 | Three two-hour eight-real-player sessions and a separate eight-hour automated soak complete without unrecoverable desync, progress loss or unbounded resources. A short multi-socket script alone is insufficient. | Human session recordings/logs and separate soak metrics. | QA/ENG | P7 |
| NFR-REL-03 | Under typical network conditions, at least 95% of tested non-teleport local corrections are ≤0.5 m; corrections >1 m occur less than once per ten player-minutes. Measure at least 10,000 samples, split on-foot/vehicle/high-speed traversal. | Reconciliation traces, percentiles and visible failure clips. | ENG | P7 |
| NFR-REL-04 | Reconnect restores the correct profile/campaign within 15 s of network availability in ≥95% of 100 interruption trials. Longer outages never fabricate rewards or leave duplicate actors; unrecoverable sessions offer safe resume. | Outage/rejoin matrix, identity/actor count and save comparison. | ENG/QA | P7 |
| NFR-DATA-01 | Every acknowledged durable milestone survives a clean restart and abrupt process termination. Maximum recoverable loss of unacknowledged continuous progress ≤60 s; communicate pending saves rather than falsely acknowledging durability. | Kill-at-write/checkpoint tests and transactional persistence report. | ENG | P7 |
| NFR-DATA-02 | For hosted progression, encrypted backups target RPO ≤15 minutes and tested restoration RTO ≤60 minutes, including consistent SQLite/WAL handling or the selected replacement. Local saves retain at least three rolling recoverable snapshots. | Timed restore drill, integrity check and restored-account walkthrough. | OPS/ENG | P7 |
| NFR-DATA-03 | Supported save/protocol migrations are versioned, idempotent and tested on previous-release fixtures. Mixed client/server versions fail clearly or negotiate compatible behavior; rollback cannot silently corrupt newer saves. | Upgrade/rollback matrix and preserved fixture diffs. | ENG/OPS | P7 |

### 6.4 Accessibility, compatibility, security, and production operations

| ID | Requirement and acceptance | Required evidence | Owner | Gate |
| --- | --- | --- | --- | --- |
| NFR-ACCESS-01 | Every applicable item in the declared accessibility review has Pass/Fail/Not applicable with rationale; no critical-path action depends solely on color, hearing, rapid repeated presses or an unmappable input. At least five relevant player evaluations include reduced-motion, input and caption needs. | Accessibility matrix and session outcomes; no unsupported certification claim. | UX/QA | P7 |
| NFR-COMPAT-01 | All advertised OS/runtime/browser, GPU-driver and input combinations pass boot, a full opening, save/resume, background/focus and representative late-game tests. For web delivery, propose current and previous stable Chrome/Edge plus current Firefox on Windows; evaluate Safari/macOS only if advertised. | Versioned support matrix and actual device results. | QA/ENG | P7 |
| NFR-COMPAT-02 | Alt-tab, minimize, display resize/DPI, audio-device change, controller disconnect, pointer loss and suspended/resumed systems recover without stuck input, silent audio failure or lost progress. | Native device lifecycle tests; synthetic page-hide tests identified separately. | QA/ENG | P7 |
| NFR-SEC-01 | Authority rejects forged movement, damage, purchases, collectibles and mission awards. Auth/input/message/queue limits and malformed-protocol fuzzing prevent one untrusted client from corrupting or exhausting an instance. | Abuse suite and scoped independent review before public paid release. | ENG/QA | P7 |
| NFR-SEC-02 | Public services use protected transport, secure credential/session storage, throttled auth/recovery, least-privilege service access and no embedded secrets. Debug endpoints and QA mutation paths are unavailable in release builds. | Release configuration/dependency review and deployed negative tests. | ENG/OPS | P7 |
| NFR-PRIV-01 | Collect only documented account/operational/playtest data, expose required player controls, and define retention/deletion/access policy before public accounts. Crash logs and shared evidence omit credentials and private chat. | Data inventory, deletion exercise and sanitized telemetry samples. | PD/OPS | P8 |
| NFR-OPS-01 | If hosted service is required, propose 99.5% monthly availability for login/save/session creation; monitor it separately from FPS and instance capacity. Health/readiness, alerting, support route and an outage message are verified before launch. | Synthetic monitoring, alert drill, runbook and named responsible owner. | OPS | P8 |
| NFR-OPS-02 | Declare expected simultaneous instances separately from eight players per instance. Measure host/egress/storage cost, set spend alerts and admission limits, and test capacity at twice the initial expected concurrent population. | Capacity/cost worksheet and staged load test. | OPS/ENG | P7 |
| NFR-OPS-03 | A clean checkout builds a versioned candidate with pinned dependencies, asset manifest/license inventory and checksums. Staging matches production; deployment/rollback has a timed rehearsal and compatible saves. | CI/build record, release package and staged rollback evidence. | ENG/OPS | P7 |
| NFR-MAINT-01 | CI covers meaningful physics/combat/protocol/save tests and representative end-to-end missions. Content validators catch missing references, unreachable objectives, invalid rig mappings and unlicensed assets before integration. | CI reports and deliberate invalid-content rejection samples. | ENG/QA | P4 |
| NFR-MAINT-02 | Runtime telemetry ties crashes, frame/tick times, saves, reconnects and mission failures to build/content versions. Debug tools support reproducible seeds and capture without requiring changes to production state. | Sanitized diagnostic bundle for a deliberately introduced staging failure. | ENG/QA | P3 |
| NFR-QUALITY-01 | Zero open severity-0/1 defects at launch; severity-2 issues have owner-reviewed disposition and no campaign/data/accessibility blocker. At least 8 of 10 target players rate traversal, combat readability and world coherence ≥4/5 using the anchored rubric below. | Defect report and raw playtest scores/comments, including negative results. | PD/QA | P7 |

## 7. Acceptance method and evidence

### 7.1 Experience rubric

Score each pillar and presentation discipline using the same anchors: **1** broken/unusable; **2** repeatedly distracting or confusing; **3** playable but visibly unfinished; **4** coherent, readable and polished with minor issues; **5** consistently excellent with a distinctive identity. Record concrete observations and clips supporting each score. An arithmetic average cannot hide a critical failure.

For P3 and P7, have at least ten target players perform normal tasks, without explaining the route or controls in advance. At least eight must rate traversal, combat readability and world coherence at least 4. At P3, all sampled disciplines also need owner scores ≥4 and no known blocker. At P7, apply the same review to beginning, middle and ending content. Include controller and accessibility sessions; do not count the developer as an unfamiliar tester.

Duration research uses at least ten first-time solo critical-path runs on standard difficulty. Publish the median, range, completion/abandonment, retries and optional time. These small-sample gates support decisions; they do not prove mass-market appeal or guarantee a review score.

### 7.2 Required evidence packet

Each accepted requirement records its ID, revision, build/content hashes, owner/reviewer, result, acceptance date, environment, exact scenario, raw output/capture links, limitations, defects and retest conditions. When uncommitted work is tested, retain the patch/build hash as well as HEAD. Verify artifacts exist; do not put a planned file path into the ledger as if it were evidence.

Evidence classes are distinct: A automated behavior/invariants; I real-client integration; H uncoached human gameplay; V visual/animation/audio review; P physical-hardware profiling; O operational rehearsal. Use the evidence class appropriate to the row, often more than one. Human and operational work stays pending until it actually happens; AI-generated testers cannot count as unfamiliar humans.

Existing commands such as `npm run build`, `npm run verify`, `npm run assets:verify` and `npm run progress:check` remain regression tools. Their success never automatically accepts all new product requirements. New tests should verify actual behavior or important failure modes, not count functions, assert filenames, or mirror implementation details.

### 7.3 Defects, changes, and release authority

| Severity | Meaning | Release treatment |
| --- | --- | --- |
| 0 | Data loss, serious security exposure, widespread unplayability or inability to deliver the product. | Stop release; fix and requalify. |
| 1 | Campaign blocker, frequent crash/desync, inaccessible required action, missing mandatory content or repeatable inability to save/continue. | Stop release; fix and requalify. |
| 2 | Material quality/functional defect with a reliable workaround and no critical-path/data impact. | Fix or document owner-approved disposition; never conceal it in an average score. |
| 3 | Minor polish inconsistency. | Prioritize and track; do not allow accumulation to fail the experience rubric. |

Every scope change names the requirement/content IDs affected, player impact, work/cost delta, save/protocol impact and owner decision. Reopen accepted requirements when code, assets or dependencies invalidate their evidence. A deadline is never permission to mark failing requirements accepted. The product owner approves milestone quality and launch; an assistant can prepare and execute authorized work but cannot manufacture missing human acceptance.

## 8. Decisions still required

The confirmed direction is already sufficient to begin P0 planning work. These are bounded decisions for that work, not a request to stop all progress.

| Decision | Planning default / unresolved point | Due |
| --- | --- | --- |
| D01 Runtime and distribution | Benchmark the existing implementation first. Compare native options only against measured failures or a delivery requirement. No automatic engine rewrite. | P1 |
| D02 Solo availability | Offline solo is owner-confirmed. Prototype installed local launch, local profile/checkpoint ownership and co-op reconciliation without a remote entitlement dependency. | P0 decision recorded; P1 proof |
| D03 PC matrix | Desktop RTX 4070 + 16 GB RAM confirmed. Record actual CPU/SSD/OS and choose a measured lower tier; 1440p60 High is proposed, not a request to exhaust the GPU. | P0–P1 |
| D04 Commercial/content envelope | Proposed scope selected as the working baseline: four districts, 24 missions, 12–18-hour solo campaign and optional 1–8 co-op at launch. Tone/content audience, store and individual NFR thresholds remain open. | P0 working scope recorded |
| D05 Solo production capacity | No release date. Record sustainable owner hours, tool limits and actual content throughput; forecast from accepted work. | P0, reforecast P3 |
| D06 Spending | Owner confirmed no spending. Zero additional tools, hosting, assets or specialists; use existing resources and genuine compatible free sources. Preserve rights/quality requirements and record unavailable dependencies honestly. | P0 decision recorded |
| D07 Service scale | Expected launch population, region coverage, support availability, monthly hosting ceiling and account/recovery provider are undecided. | P5, freeze P7 |
| D08 Language/performance rights | English baseline proposed; identify voice approach, performer/source rights and any additional languages before final recording/translation. | P1–P3 |

## 9. What must be true at the end

A new customer can start and finish a coherent, polished game alone, return to a durable campaign, explore all advertised districts and interiors, understand and enjoy combat against capable enemies, and optionally play the complete campaign with friends. Production assets, animations, sound, story and world content meet a consistent bar through the finale. The game runs comfortably on the declared PC, remains reliable under real play, and has a tested way to install/update, recover saves, handle outages and support players.

That is the completion target. The [P0–P8 plan](PRODUCTION_DELIVERY_PLAN.md) describes how to earn it without treating an engineering checklist as proof that the game is finished.
