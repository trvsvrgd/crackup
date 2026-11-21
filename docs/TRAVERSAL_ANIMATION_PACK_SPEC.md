# Traversal animation pack and gameplay integration specification

November 19, 2026. Owner follow-up to the [living-city PRD](PRD_ADDENDUM_RELIABILITY_AND_LIVING_CITY.md). Binding detail for LC-ANM-01–06 and [P049–P054](RELIABILITY_LIVING_CITY_PROMPTS.md). No animation binaries were acquired or integrated by this planning revision.

## Player outcome

The character visibly prepares to leap, pushes off with leg extension and arm motion, adjusts its pose in flight, reaches for a ledge, catches and hangs from it, pulls up, compresses on landing, and reacts when a fall actually causes damage. These must play during normal controls on the actual Agent and appropriate enemies/remote actors. Existing procedural states and clip files do not prove that the player sees these actions.

The owner explicitly requests a momentary character recovery after fall damage. This means a bounded, authoritative character reaction, not pausing the entire game, freezing the renderer, disabling the camera, or confusing it with a crash. Preserve existing fall damage thresholds and resistance/upgrade rules unless a separate measured tuning decision changes them.

## Source selection and no-spending acquisition

Official publisher pages were checked November 19, 2026. They establish candidates and access conditions, not exact coverage in a downloaded archive.

| Candidate | Verified publisher description | Intended role and limitation |
| --- | --- | --- |
| [Quaternius Universal Animation Library](https://quaternius.com/packs/universalanimationlibrary.html) | Broad humanoid locomotion/combat collection; CC0; free and expanded tiers. | First candidate for locomotion and general movement. Inspect the free archive's exact contents; do not assume the advertised whole-library clip count is free. |
| [Quaternius Universal Animation Library 2](https://quaternius.com/packs/universalanimationlibrary2.html) | Complementary humanoid library including parkour and combat; CC0; free and expanded tiers. | First candidate for parkour. Specific ledge/landing clips and their tier remain unverified until archive inspection. |
| [Adobe Mixamo](https://www.mixamo.com/) and [official FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html) | Free with an Adobe ID; game use permitted without a Creative Cloud subscription. | Gap-filling candidates compatible with the existing Y Bot source workflow. Authenticated download may require the owner. Do not assume a search label guarantees a matching clip. |
| Existing local Y Bot/Capoeira and other licensed assets | Current manifest and animator already reference these assets. | Reuse compatible usable motions; the combat library is not evidence of a complete jump/landing/ledge collection. |

Acquisition preference: inventory local assets, inspect the free Quaternius archives, then use available Mixamo clips for remaining gaps. Author production-quality corrective poses/clips or procedural contact layers where no suitable free motion exists. No purchase or paid tier is authorized. Do not spend weeks retargeting unsuitable clips just to claim use of a pack; assess rig compatibility on one actual Agent first.

Store genuine sources and licenses under `asset-inbox/packages/traversal-animation/`, using `asset-inbox/metadata.template.json`. Preserve original archive/file names, source URLs, creator, download date, tier, SHA-256 hashes, and applicable license text. Keep separate provider subfolders. Do not invent an asset receipt for a pack not downloaded. `npm run assets:intake` inventories sources; it does not download, approve, retarget, or integrate them. Follow the [asset acquisition guide](ASSET_ACQUISITION_GUIDE.md).

For Mixamo, use one consistent Y Bot source skeleton; keep a matching base with skin and additional actions without skin, FBX Binary at 30 FPS, as supported by the existing workflow. The current seven-file merger is fixed to specific inputs and does **not** accept an arbitrary new library. Extend or create an explicit manifest-driven conversion/retargeting path. Quaternius has a different rig: never feed it into the Mixamo-only merger and assume compatibility.

Required acquisition deliverables: source inventory, real clip list/durations, license/hash records, state-to-source gap matrix, one-character retarget proof, and then a runtime-ready curated pack. If login or unavailable free clips block acquisition, identify the exact missing actions and concrete download destination. Continue independent mapping/test work, but do not mark missing clips integrated.

## Required motion coverage

These identifiers describe game actions, not promised vendor filenames. One source take may be segmented into multiple states with recorded time ranges; copied labels or reversed clips do not count as different motions unless the result passes review. Cover all 20 rows with a verified source clip, authored clip, or production procedural contact/pose layer.

| ID | Required state | Visible behavior and trigger |
| --- | --- | --- |
| TA01 | Grounded idle/ready | Breathing, balance and weapon-ready pose; no rigid T-pose or frozen limbs. |
| TA02 | Walk/run/sprint transition | Coordinated legs/arms with start/stop/turn weight transfer and velocity-matched cadence. |
| TA03 | Standing jump anticipation | Small knee/hip bend, torso preparation and arm backswing before or at the start of push-off. |
| TA04 | Running jump anticipation | Short stride-aware compression/arm preparation without an artificial full stop. |
| TA05 | Takeoff | Leg extension, feet leaving the ground, upward arm drive and coordinated torso motion. |
| TA06 | Airborne rise | Appropriate extended/tucked limbs; preserve forward momentum and aim policy. |
| TA07 | Apex transition | Smooth pose change as vertical velocity approaches zero; no held takeoff pose indefinitely. |
| TA08 | Fall loop | Balanced falling silhouette; arms/legs adapt as descent continues. Walking off a ledge skips jump anticipation. |
| TA09 | Landing preparation | Feet orient to expected contact and body prepares; based on validated proximity, not an arbitrary elapsed timer. |
| TA10 | Soft landing | Visible knee/hip compression and arm balance, blending into movement rather than snapping to upright. |
| TA11 | Hard landing without damage | Deeper compression/brace or supported roll; distinct from the injury reaction. |
| TA12 | Fall-damage impact | Clear impact/recoil or knee/hand brace only when authoritative fall damage is applied. |
| TA13 | Fall-damage recovery | Brief local character recovery beat then stand/movement blend; interrupts safely for death/downing. |
| TA14 | Ledge reach | Hands/arms reach toward an eligible edge during approach. No reach to an unrelated nearby surface. |
| TA15 | Ledge catch | Contact deceleration and body swing/compression; hands meet the actual ledge. |
| TA16 | Ledge hang loop | Body weight beneath fixed hand contacts; subtle motion with stable collision placement. |
| TA17 | Mantle/pull-up | Weight shift, arm pull, knee/foot plant where appropriate, hips over edge and grounded exit. |
| TA18 | Ledge release/drop | Hands release and transition into fall; no invisible support after release or destroyed ledge. |
| TA19 | Landing roll | Use existing eligibility rules; a roll must not trigger for every harmless step or erase legitimate damage. |
| TA20 | Interrupted/failed traversal | Blocked mantle, lost support, knockback, downing and death leave no stuck hang or pose/control lock. |

Lateral ledge shimmy, vault variants, and wall-run motions can be added for existing supported mechanics; this pack does not invent new traversal abilities just because a vendor supplies their animations.

## Timing, authority, and feel

Initial tuning targets, to be reviewed in gameplay:

- Jump anticipation approximately 60–100 ms with a modest bend and arm movement. Preserve immediate visible input response. Audit current jump buffering/launch timing first; do not quietly add an equal unresponsive physics delay. If anticipation needs an authoritative launch-window change, document it and compare responsiveness. Where buffering supplies lead-in time, use it; if lead-in is unavailable, shorten the pose instead of showing a crouch while already high in the air.
- Soft landing compression/rebound approximately 120–220 ms, blended with locomotion; no mandatory gameplay stun for ordinary landings.
- Hard landing presentation approximately 250–450 ms where compatible with existing roll/recovery behavior. Impact class derives from authoritative impact facts and upgrades, not frame-to-frame client height guesses.
- Damaging fall recovery approximately 250–600 ms as a proposed character-only recovery window. If controls are restricted, the server owns the window and replicates its start/duration; preserve camera/look, buffer eligible movement/jump input with expiry, and release on recovery. No extra invulnerability, damage, or cooldown bypass comes from animation. The user-requested recovery beat is an explicit scoped behavior addition, not permission to rewrite combat/traversal.
- Catch/hang/mantle durations are fitted to actual ledge geometry and existing traversal timings. A single fixed clip cannot force the character through a low ceiling or a higher edge. Reach and hand/foot contact require retargeting, bounded pose correction/IK, or equivalent contact constraints.

Define ordered states and transition guards: grounded -> anticipation -> takeoff -> rise -> apex -> fall -> contact -> soft/hard/damaging recovery -> grounded. Ledge reach/catch/hang/mantle/release branches interrupt the aerial path. Server death/downing/knockback has explicit priority. Each finite recovery has a bounded exit and input ownership; there is no infinite loop waiting for a client animation-complete callback.

Authoritative events include stable event identity, actor, action start/server tick, landing impact classification, whether damage occurred, recovery duration, and ledge/mantle facts where required. Local prediction can start visual feedback, but confirmation/reconciliation must avoid a duplicated impact or a second recovery beat. Server collision determines ground contact. Remote clients reproduce the same action phase through late join, delay, and reconnect. Test all protocol frame types correctly.

Root motion must have one owner. Prefer animation matching existing authoritative movement; strip/retarget incompatible translation and preserve visual pelvis motion separately. Keep weapon sockets, aim layers, hand contact, animated bounds and foot contact valid. Do not derive damage from clip events or alter the physics capsule solely to imitate a crouched mesh.

## Mandatory tests and review

| Case | Required observation |
| --- | --- |
| Stationary and running jumps | Readable small compression/arm drive and immediate visible response; no double jump impulse. |
| Walk off a ledge | Fall state without a false jump crouch or takeoff. |
| Low step and ordinary jump landing | Mild/no impact as appropriate; no spurious damaging-fall stun. |
| Hard safe fall and damaging fall | Distinct reactions; damage event triggers exactly one bounded injury recovery. |
| Fatal fall | Death/downed state wins; no stand-up after fatal damage. |
| Valid ledge at multiple heights | Hands reach/catch/contact; hang and pull-up align to geometry without floating wrists. |
| Blocked mantle and disappearing support | Safe abort/fall, cleared constraints, no clipping or permanent control lock. |
| Damage/knockback during anticipation, hang or recovery | Defined priority and coherent exit; no duplicate launch or repeated damage event. |
| Repeated jump/landing inputs | Buffer/cancellation semantics remain responsive; no delayed accidental action long after landing. |
| 30/60/120 FPS and 0/80/150 ms RTT | Consistent phase/contact timing, predicted/remote convergence, no time-step-dependent stun. |
| Save/reload, pause/reconnect, LOD changes | Restore a safe gameplay state; no stuck hang, replayed damage, frozen pose or duplicate action. |

Capture continuous normal-input videos from the gameplay camera plus diagnostic side/front views with state/event overlays. Measure jump input-to-visible-response, launch timing, hand contact error, foot sliding, recovery duration and event duplication. Proposed contact tolerance: hands remain within 5 cm of the ledge contact point during stable hang in representative geometries. Inspect actual hero, light/heavy enemy and remote Agent where actions apply; a source-rig viewer alone does not pass.

Technical acceptance requires all 20 state rows mapped and exercised with no unresolved critical transitions. Experience acceptance requires owner review of the jump/ledge/soft landing/damaging fall sequence. Source files, conversion success, or a preview video alone cannot satisfy gameplay integration.

## Work-package assignments

- P049: source audit, free-tier acquisition, complete 20-row gap matrix, provenance, one-Agent retarget feasibility. State acquisition blockers accurately.
- P050: curated runtime pack, skeleton/scale/rest-pose mapping, sockets, contact targets and animated bounds on final characters.
- P051: TA01–11 and TA14–20 traversal sequence, responsive anticipation, ledge contact and landing compression.
- P052: TA12–13 fall-damage event/recovery, action-priority integration with combat, and meaningful authority tests.
- P053: predicted/remote event identity, timing, late join, reconnect and LOD consistency for all applicable states.
- P054: complete state/asset validation, actual normal-input videos, interruption matrix, owner review and LC08 gate.

Do not move past LC08 with an unfilled motion gap hidden behind a generic idle/fall fallback. Re-estimate the phase after the actual free-pack coverage/retargeting audit rather than promising all parkour animation comes out of one archive.
