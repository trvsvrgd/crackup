# Opening operation: A Signal in the Salt

P0.4 authored design package, November 13, 2026. **Proposed content, not implemented or experience accepted.** Uses the owner-approved working scope in [baseline decisions](PRODUCT_BASELINE_DECISIONS.md). Full product requirements remain in [v3.1](PRODUCT_REQUIREMENTS_V3.md).

## Player experience and narrative boundary

The agent arrives in Neon Docks under Vance's orders to investigate a disrupted cargo signal. Sera guides a practical field exercise through a lived-in dock neighborhood. A missing dockworker's freight record contradicts the official account. The player recovers a signal ledger, takes it across the roofs, defeats Kraken's local enforcement unit and returns the evidence to Sera. The immediate operation resolves; the ledger's unexplained human identifiers motivate the next mission.

This opening must not reveal the later harvested-minds twist, resolve Voss's arc, liberate all Docks, or grant the district's existing Grapple Overdrive reward early. Preserve the existing story bible's recruitment-to-revelation order. Integrate the old relay/lieutenant/kingpin loop as later district work instead of counting its four repetitions as authored campaign missions.

Player promise: “I can read this place, choose an approach, win with the tools I learned, and keep my progress.” First meaningful movement/interaction occurs within two minutes after control begins. No mandatory camera sequence delays control. The 30–45-minute critical path includes first-time observation, fights and dialogue; it excludes optional activities, downloads and repeated deaths. Measure real players before accepting duration. Never add waiting, forced grinding or enemy health to meet it.

## Route and authored spaces

A contiguous approximately 240 m neighborhood connects these spaces. Distances are design intentions, not verified coordinates. Layout belongs to P1/P3; existing stable orb and progression IDs remain intact.

| Space ID | Place and practical use | Entry / exit and readable landmark | Production status |
| --- | --- | --- | --- |
| DOCK-HUB | Tidewatch safehouse: preparation, return, upgrades, saves and companion practice | Open loading door to the street; warm workbench light and agency antenna visible from the return route | Missing authored/furnished hub |
| DOCK-STREET | Lantern Row: storefronts, dockworker conversation, traffic crossing and optional aid | Blue market awning → amber hoist → red customs clock; sidewalk separated from road | Existing city/materials reusable; authored street missing |
| DOCK-CUSTOMS | Customs House: furnished records room, two approaches and mixed combat | Ground lobby or marked service stair; each route rejoins the records room and exits to a roof stair | Missing mission interior/navigation |
| DOCK-ROOFS | Crane Walk: taught jumps, mantles and a safe lower recovery route | Clock tower to cargo crane; reachable landing surfaces have consistent trim/lighting | Existing ledges reusable; continuous route needs authoring |
| DOCK-QUAY | Pump Quay: waterfront boss arena, cover and readable lateral movement | Roof descent and street ramp both enter; no mandatory flight/grapple upgrade | Missing finished encounter arena |

Three authored reference scenes use the street, Customs records room and one roof junction. Preserve a street-scale foreground/midground/skyline hierarchy, clear entrances and distinct route silhouettes. The original waterfront/bay remains a backdrop, not proof of additional playable land.

## Mission flow and checkpoints

Mission ID: `docks_signal_01`. Revision: `1`. Entry: `arrival`. Terminal success: `return`. Every transition below is a server-validated objective event in the future implementation, never an elapsed timer alone.

| Beat ID | Minutes | Player goal / transition | Teaching and tactical choice | Checkpoint / failure recovery |
| --- | --- | --- | --- | --- |
| arrival | 3–4 | Leave Tidewatch after Sera's short briefing; continue to street_lead | Movement, camera, objective interaction, captions/settings; optional replay of instructions | CP-ARRIVAL before control; failed exit interaction remains available |
| street_lead | 4–6 | Find the dockworker and inspect the freight seal; continue to customs | Read three landmarks; interact and observe a civilian; street or service-alley approach | CP-LEAD after the evidence is recorded; civilian flees to a safe marked fallback instead of disappearing |
| customs | 8–11 | Enter Customs, neutralize the guard pressure and recover the ledger; continue to roof_transfer | Aim/fire and feedback, melee/counter, cover, one explosive; lobby or service stair changes sightlines and encounter entry | CP-CUSTOMS before combat, CP-LEDGER after recovery; evidence cannot be destroyed, dropped out of bounds or consumed twice |
| roof_transfer | 5–7 | Reach the crane transmitter with the ledger; continue to quay_fight | Jump/mantle with optional faster route; visual landing guidance, safe fall recovery; grapple is optional | CP-ROOF at the transmitter; a fall returns to the lower route or latest safe anchor without replaying the interior |
| quay_fight | 7–11 | Defeat Kraken's enforcement unit and secure the route home; continue to return | Combine range/limb/counter tools; readable heavy and ranged pressure; solo always viable | CP-QUAY before entry; defeat/retry restores the encounter once without duplicating loot |
| return | 3–6 | Deliver the ledger, choose a useful upgrade and see Sera's response; operation complete | Reward and journal recap, next goal, save feedback and optional side-content discovery | CP-COMPLETE commits objective + decision + reward receipt atomically; repeated interaction/replay cannot pay twice |

Total planned critical path: 30–45 minutes. Interior optional observation and tactical choice contribute real play. Teach recovery after the first defeat without requiring a scripted loss. Provide a safe retry at each encounter and retain completed story evidence. A disconnected or relaunched player resumes the latest committed checkpoint with a concise recap.

## Encounters and rewards

| Content ID | Role / intent | Required observable behavior | Reuse / gap |
| --- | --- | --- | --- |
| EN-DOCK-BRAWLER | Closes distance and exposes counter timing | Pursues a reachable route, telegraphs a strike, reacts physically and searches last known position after occlusion | Existing melee/counter/contact foundation; reliable navigation/perception still needed |
| EN-DOCK-RIFLE | Controls a lane without hidden tracking | Uses visible firing windows, valid sight lines and bounded repositioning; loses a concealed target | Ranged role/cover implementation needed |
| EN-DOCK-SUPPORT | Forces a readable target-priority decision | Announces a bounded ally support action that the player can interrupt; cannot infinitely respawn opponents | Support behavior and feedback needed |
| BOSS-QUAY-FOREMAN | Kraken's foreman: slow anchored heavy with open flanks | Windup, committed attack, recovery and a visible weak-side opportunity; support pressure comes in finite waves | Existing heavy/contact systems reusable; distinct subordinate design, move set, final rig and arena quality missing. Kraken remains the later district kingpin. |
| WPN-DOCK-CARBINE | Forgiving close/mid-range tool | Distinct handling, burst control, reload/ammo policy and audiovisual impact | Existing carbine presentation; mechanical contract still needed |
| WPN-DOCK-MARKSMAN | Deliberate long-range/limb choice | Slower cadence with visible accuracy tradeoff and distinct feedback | Existing marksman presentation is cosmetic; role not yet implemented |
| RWD-SIGNAL-01 | First meaningful upgrade opportunity | Award sufficient progression for one valid first-tier choice, subtract already granted opening credit, and show its effect | Existing five chassis/20-node authority reusable; economy amount and one-time receipt need validation |

Do not force one chassis, weapon, companion or optional collectible. Keep prerequisite nodes and server authority. Co-op scales role pressure and space use; health multiplication alone is insufficient. Join-in-progress cannot respawn completed waves or replay the reward transaction. Friendly participants can revive each other; no objective requires simultaneous human inputs.

## Optional neighborhood content

| Content ID | Authored activity | Completion / persistence |
| --- | --- | --- |
| SIDE-DOCK-01 | “Last Shift”: follow a worker's missing delivery through two clues, recover it from a service yard, return it to the recipient | Distinct journal entry and once-only reward; can finish after the main operation |
| CHAL-ROOF-01 | Marked roof time trial with safe fall recovery and ghost/best-time feedback | Restart independently; save personal best; no campaign lock |
| CHAL-QUAY-01 | Counter-and-cover practice with visible targets and readable scoring | Solo practice, no mandatory win; best score and tutorial dismissal persist |
| EVT-DOCK-01 | A stalled delivery blocks the crossing; move the obstruction and reopen the route | One bounded event with reset/cooldown and no infinite reward farm |
| PET-DOCK-01 | Safehouse companion follow/recall and practice route | One finished companion family; adoption/progress saved, no multiplayer dependency |
| EXP-DOCK-01 | Ten intentional existing-ID collectibles, one secret service route and one worker memorial story | Record placements against the existing 182-orb inventory; do not mint duplicate IDs or require all ten for progression |

## Art, animation and audio work inventory

Use the [current animation mapping](../artifacts/evidence/p0-animation-coverage.json) as the observed baseline. It describes 23 rig states and one imported gameplay selection; it is not acceptance of all transitions. Every item below needs a runtime capture and contact review in its actual space.

| Actor / asset family | Essential state and transition coverage | Current source and gap | Delivery package |
| --- | --- | --- | --- |
| Player agent / five chassis identities | Idle → start/stop/strafe/sprint; jump/fall/land/mantle; aim/fire/reload; melee/counter; hit/down/recover; interact; vehicle entry/exit | Procedural armor and sample/imported motion reusable; most state performance/contact remains unaccepted | P1-CONTENT, P2.1–2.2 |
| Three enemy roles / boss | Patrol/alert/search; navigate/stop/turn; role action and interruption; hit/limb response; knockback/death | Multipart reaction path exists; perception/navigation/role performances need work | P1-CONTENT, P2.3 |
| Dockworker / civilian family | Idle/work/walk; notice player; converse; flee; resume; fallback interaction | Missing authored civilian and performance | P1-INTERIOR, P3.1–3.3 |
| Sera / Vance exchange | Readable speaker presentation, captions, pauses and safe interruption | Story bible/comms reusable; final voice/performance absent | P3.3 |
| Interior / street / roof kit | Human scale, doors, furnished rooms, floor/rail contacts, legible routes; daylight and dusk read | Existing PBR/architecture is source material; no finished Customs interior | P1-STREET, P1-INTERIOR |
| Vehicle / companion | One vehicle handling presentation and traffic sample; companion follow/recall/practice | Existing vehicle and pet managers reusable; quality and complete teaching open | P2/P3 integration |
| Sound / music | Foot contacts, weapon layers, reactions, water/market/room ambience, boss transition, calm return | Existing bounded synthesized sound is honest prototype material; final authored mix/music/voices absent | P3.3 |

No spending is authorized. Use owned material, original authored work or compatible free sources with provenance. Missing voices/rigs remain missing until real usable sources exist. Do not claim that a generated placeholder or clip count passes final art/performance review.

## Current visual audit and target review tasks

| View | Existing observation evidence | Target task for P1 review |
| --- | --- | --- |
| Street | [Current opening](../artifacts/evidence/p0-opening-combat.png): broad open surfaces and repeated tower language | Build a walkable street segment with three legible route cues, door/street scale, material hierarchy and purposeful dressing; inspect approach from both ends |
| Roof | [Existing roof capture](../artifacts/evidence/stage4-roof.png): roof/vista rendering evidence | Join a complete novice-reachable route; prove landing contacts, camera clearance, fallback path and coherent near/far composition |
| Interior | No furnished mission-interior evidence in the baseline inventory | Build Customs records room with two usable approaches, cover, readable exit, sound transition, interior lighting and collision; do not substitute an exterior screenshot |

These are audit references and review tasks, not an approved final art board. P0 owner direction review and P1 finished scene review remain separate. References are existing project captures, with no third-party art licensing implied.

## Acceptance scenarios

| Scenario ID | Procedure and pass condition | Requirement links |
| --- | --- | --- |
| OPEN-01 | Fresh profile, normal UI/input, no coaching/debug shortcuts; reach first meaningful action within two minutes and finish the critical path | FR-CORE-01, FR-CORE-03, FR-CAMP-01 |
| OPEN-02 | Complete lobby and service-stair approaches with viable solo equipment; no sight-through-wall attacks or mandatory skill dead end | FR-CORE-02, FR-PLAY-04, FR-AI-01, FR-AI-02 |
| OPEN-03 | Fail/retry at Customs and quay, fall from every roof segment, leave an evidence interaction; all routes recover without lost mission items | FR-PLAY-01, FR-CAMP-04, FR-SAVE-01 |
| OPEN-04 | Quit and restart at each checkpoint, including after boss death and during completion commit; resume once with correct reward and recap | FR-SAVE-01, FR-SAVE-02, FR-SAVE-03, FR-CAMP-05 |
| OPEN-05 | Installed solo launch/continue and completion with internet unavailable; cold asset cache, no remote sign-in, all required content local | FR-NET-01, FR-NET-05, FR-DIST-01 |
| OPEN-06 | Host and unequal-progress guest join/leave/rejoin at each encounter; no guest campaign overwrite; 2/4-player play and 8-client peak load | FR-NET-01, FR-NET-02, FR-NET-03 |
| OPEN-07 | Controller/keyboard, captions, remapping, motion settings, pause/focus, cinematic skip and downing preserve readable UI and control | FR-UX-01, FR-UX-02, FR-UX-03, FR-UX-06 |
| OPEN-08 | Ten unfamiliar players, raw times/deaths/assistance/ratings recorded; at least eight finish uncoached; relevant quality disciplines ≥4/5 | FR-CORE-03, NFR-QUALITY-01 |
| OPEN-09 | Physical 4070/16 GB reference route with representative actors/materials/audio; record frame, process/GPU memory, cold load and traffic | NFR-PERF-01, NFR-PERF-02, NFR-PERF-04, NFR-PERF-06 |
| OPEN-10 | Inspect all optional activities and ten collectible IDs; final audio/art/actor coverage reviewed in ordinary play through the return | FR-ART-01, FR-ANIM-01, FR-AUD-01, FR-AUD-02, FR-CORE-04 |

Synthetic restart fixtures and component browser diagnostics support investigation only. OPEN-01/08 need actual normal gameplay/human evidence; OPEN-09 needs the declared machine. No scenario is currently accepted.

## Bounded P1 work packages

Estimates below are initial engineering/design session sizes, not measured accepted throughput or release dates. Each session is roughly 2–4 focused hours. If the output cannot fit, split the package and record the reason; do not claim quality acceptance at the end of a timebox.

| Package ID | Input → reviewable output | Size / dependencies | Verification and stopping point |
| --- | --- | --- | --- |
| P1-STREET | Existing kit and street audit → one ~60 m target street section with doors, sidewalks, lighting hierarchy and three route landmarks | 2–3 sessions; P0 exit | Walk both approaches; collision, capture, art rubric and frame/resource trace; owner reviews target direction |
| P1-INTERIOR | Street scale → one furnished Customs room, stair and linked roof junction with named anchors | 2–3 sessions; P1-STREET scale decision | Normal-input two-approach traversal, camera/contacts and light/sound boundaries; remaining whole-route work explicit |
| P1-CONTENT | Existing manifest/rigs → versioned import, actor-state, socket, material and collision contracts with one accepted sample export | 2 sessions; P0 exit | Real source/license/hash and reproducible export; broken references/rig mappings rejected; missing final sources stay pending |
| P1-PROFILE | Reference scenes → repeatable cold/warm route and representative 8-player/24-combatant load capture; one measured optimization | 2–3 sessions; scene fixtures and physical reference access | Compare quality and frame/memory/load/network traces before/after; no empty-scene FPS claim |
| P1-SAVE | Restart finding and offline decision → isolated two-profile checkpoint/reward prototype plus local launch/pause proof | 2–3 sessions; P0 exit and ownership contract review | OPEN-04/05 component subset, guest isolation, interrupted transaction and schema fixture; no global-world-only persistence shortcut |

First P1 execution candidate is **P1-SAVE** because the measured restart failure and offline requirement affect the campaign foundation. P0 exit still requires its remaining baseline evidence/review. This specification and successful document checks do not accept P1 or start mass content production.
