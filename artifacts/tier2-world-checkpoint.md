# Tier 2 geography and world systems checkpoint

Implemented and re-audited November 17, 2026. The five requested deliverables are implemented and pass automated verification. The follow-up audit closed the chassis-service bypass, unified SAM bounds with runtime queries, and replaced generic events with distinct physical objectives.

| Deliverable | Implementation | Verification |
| --- | --- | --- |
| World bible | Sections 3 and 5 document four vertical tiers, district signatures, airspace, destruction, facilities and ambient tasks. | `docs/WORLD_BIBLE.md` |
| Deterministic registry | Frozen 3D hazard bounds, four ceilings/radar nodes, four breachable rooms, twelve suspended props, eight facilities and five stability-driven event types. | `shared/content/worldSystemsRegistry.ts` and registry/boundary checks |
| Airspace and turbulence | Four spawnable Rapier VTOLs; pilot input, gravity-compensating rotor forces, three-second lock, 2.5-second EMP stall, grounded radar destruction, Flying Lv 4 flares, liberation and inverse-level canyon impulses/torque. | All four district ceilings; physical loss of lift; normal E/Space input; browser radar-warning view |
| Destruction and recovery | Live weapon probes, held charged melee, limited shaped-charge ammunition and swept thrown-prop hits; CCD 1,200 kg bodies; one 450-damage crush pulse on actual contact; 180-second recovery with an 80 m exclusion around origin and debris. | Real rays, shape casts, contact manifolds, enemy limb queries and constant rigidbody counts |
| Verification and replication | `verify:tier2` script, versioned binary packet 0x0c, authoritative 30 Hz broadcast, client collider/mesh reconciliation, facility services and bounded skirmish lifecycle. | 22 focused test groups, two authenticated WebSocket peers, complete existing regression suite and browser component checks |

## Controls and decisions

- Facility coordinates are authored at X ±550 m / Z ±70 m. Static support geometry is additive and excluded from persisted orb placement. Eight local defenders gate the facilities; enemy clearance uses a 60 m 3D Rapier sphere.
- Thermal and crosswind velocity impulses fire on entry, including wingsuit activation inside a thermal column. Leaving the volume rearms the impulse. Louver damage is 40 HP/s during the first 1.5 seconds of each six-second cycle. Contact-distance queries handle deep capsule containment reliably in the installed Rapier version.
- Hold **V/C** for 0.75 seconds while grounded and within 3 m of a cracked wall for a charged breach at Strength Lv 3. **RMB + fire** within 3 m deploys an Explosives Lv 3 shaped charge. Shaped charges start at three and resupply at facilities/caches; the existing firearm ammunition model remains compatible.
- Shoot the visible amber anchors to drop holo-signs, HVAC chillers or cargo. Crush radius is measured from the real impact contact point and deduplicated across enemy limb colliders. Recovery reuses the same body and collider handles, resets motion and advances generation.
- At an unlocked facility, **H** resupplies and spawns its Interceptor or VTOL. **B** retains the existing Augment Chassis menu. Chassis changes require a living, unmounted Agent inside a cleared facility. The server validates every request and the menu disables unavailable changes; forged position/unlock fields cannot bypass the restriction.
- **E** enters/exits VTOLs, **W/S** supplies thrust, **A/D** turns, **Space** climbs, **Shift** descends, and **Ctrl/X** deploys Flying Lv 4 EMP flares. Flare protection lasts three seconds, with an eight-second cooldown. Radar nodes have 120 HP; weapon rays respect cover and only grounded, unmounted attackers can destroy them. Disabling radar prevents future locks; an already-applied stall finishes its 2.5-second duration.
- SAM state, destruction, facilities and skirmishes are authoritative. Client snapshots cannot cause damage, unlock sites or regenerate objects. Tier 2 packet 0x0c is now version 2 and includes objective health, stage, target and outcome; version 1 is rejected. Other packet layouts remain unchanged. Aircraft IDs and facility vehicle IDs occupy distinct ranges.
- SAM coverage uses the registry ceiling plane and horizontal footprint through Rapier half-space and cuboid queries. It extends upward without an artificial altitude cap; tests cover exact ceilings, district boundaries, footprint edges and flight above 2,000 m.
- Ambient tasks activate near live players. Stability uses the campaign owner's recorded values in owned campaigns and the connected-player mean in shared sessions. High-stability tasks rotate escort/repair; values strictly below 40 rotate hostile events. Public tasks use physical proximity and collision-tested movement; hostile events spawn real combat actors. Each district has at most one event, a 90-second lifetime and a bounded cooldown/actor cleanup.
- Escort: accompany a 180 HP citizen within 4 m for a 25 m collision-tested route. Repair: hold **H** within 3 m and clear reach for 10 seconds to restore a damaged generator. Robbery: stop the 600 HP van before its 50 m extraction route, defeat its guards, then hold **H** for three seconds to recover cargo. Clinic siege: protect 400 HP for 45 seconds and eliminate the initial attackers plus waves at 15/30 seconds; cover blocks hostile damage. Ambush: enter an 8 m 3D trigger, survive the initial squad and six-second reinforcement wave, and clear all attackers; target death/disconnect fails the event. Each task has replicated health/stages/outcomes and its own multipart mesh and HUD instructions.

## Evidence

- `npm run build`: passed.
- `npm run verify:tier2`: 22 groups passed, including normal input dispatch, two-client replication, forged command rejection, all five objective outcomes, cover/obstruction, repeated event cleanup, and normal-input service/radar/throw integration. [Report](evidence/tier2-verification.json).
- `npm run verify`: every existing Phase 1–6, alpha, Stage 1–6 and quality gate passed. [Full output](evidence/tier2-regression.log).
- Browser production-component preview: 10 checks passed covering real breach/drop physics, all eight facility states, all five distinct objectives and stable geometry allocation; zero console warnings/errors. [Report](evidence/tier2-browser.json), [facility](evidence/tier2-facility.png), [VTOL radar lock](evidence/tier2-vtol.png), [armored robbery](evidence/tier2-robbery.png), [clinic siege](evidence/tier2-clinic.png).
- `npm run progress:check` and `git diff --check`: passed.

Reproduce the browser preview with `node scripts/verify-tier2-browser.mjs`, open `http://127.0.0.1:3218`, and select **Verify renderer and physics**.

## Final original-prompt audit

All five deliverables are covered by the implementation and verification above. The final audit added `tests/tier2-integration.ts`, invoked by `verify:tier2`, to close the gap between direct subsystem checks and ordinary player controls:

- All eight facilities: settle the Agent onto authored Rapier support, clear actual defenders, press H through shared input dispatch, verify ammunition/health resupply and the correct ground vehicle or VTOL.
- All four rooftop radar nodes: stand on the actual platforms and destroy each node using normal firing input and weapon ray queries.
- Thrown-prop breach: pick up and throw a real 2,000 kg cargo container at Strength Lv 3 through normal input, advance the full world simulation, and verify the 250 HP wall breaks.

These checks passed without another gameplay change. No additional implementation requirement was found in the original five-deliverable prompt.

## Scope and qualification outside this prompt

Deliverable 1 explicitly requests documentation of the district moving-geometry signatures and four-tier route language. Those descriptions are complete; implementing every described district route is a separate content-production task. New world-system states are session-scoped; a server restart reconstructs their initial state. Existing district campaign checkpoints still control liberation. The browser preview is a diagnostic scene. Uncoached playthroughs and reference-hardware qualification remain broader product release gates; neither is an unfinished deliverable in this prompt. Existing unrelated work was preserved; no product milestone acceptance is implied.
