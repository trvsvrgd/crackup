# Tier 4 combat and missions checkpoint

Implemented November 18, 2026 (America/Chicago). Work began at 18:56 UTC; the final checks ran after continuation breaks on November 19 UTC. Wall-clock duration includes those breaks. Existing unrelated changes were preserved.

## Original deliverable audit

| Deliverable | Result | Implementation / evidence |
| --- | --- | --- |
| 1. World Bible sections 5 and 6 | Complete | `docs/WORLD_BIBLE.md` covers faction roles/patrols, five encounters, campaign archetypes, collectibles, landmark quests, interventions and sandbox activities. |
| 2. Enemy and boss registry | Complete | `shared/content/enemyAndBossRegistry.ts`: 15 faction archetypes, five bosses, faction patrols, immutable IDs, arsenal references and distinct armor presets. Shared rig, six limb colliders, frontal shields, role movement/loadouts, 3.2 m exosuits and faction presentation execute in runtime. |
| 3. Activities and collectibles registry | Complete | `shared/content/activitiesAndCollectiblesRegistry.ts`: 14 authored Chimera recordings, 20 breach-room dossiers, 30 provenance-linked tags, five multi-stage landmark quests, four timed citizen events and ten sandbox activities. |
| 4. Mission controllers and Hunter-Killer | Complete | `missionArchetypeRegistry.ts` assigns all 24 campaign missions. Five controller classes run physical sabotage, convoy recovery, elevated heists, defense waves and target hunts. `RoamingHunterDirector` deploys Cassia in a Valkyrie with two Cyber-Cycles after D3 Mission 2 or high heat. Swept pursuit crosses district boundaries; defeat cleans up escorts. Four physical arenas include breakable Graves windows, Solange pod reinforcements, the nursery reveal and Thorne's Crown-centered Dreadnought orbit. |
| 5. Runtime, persistence and HUD | Complete | `tier4World.ts` connects normal controls, proximity collection, lifts, actor spawning, attack/throw/vehicle-impact paths, timed events, ordered race/ring crossings and ten-wave co-op survival. SQLite WAL stores collected lore, completed quests/missions and equipment unlocks with civic award receipts. Server snapshots replicate physical objectives, vehicles, actors, lifts and glass. The journal reads recovered lore and tracks content in the main HUD. |
| 6. Verification | Complete | `tests/verify-tier4-combat-missions.ts`, three integration modules and `npm run verify:tier4`; 19 focused groups, build, full existing regression chain and Tier 1-3 suites pass. |

## Decisions

- Preserve the existing animated humanoid rig, including its helper bones. It has 19 joints (`client/animation/humanoidRig.ts`, `JOINT_LAYOUT`), and the existing Stage 2 and Stage 3D suites verify that layout. Every new humanoid uses that rig and the existing six-collider V.A.T.S. system. This satisfies existing-rig reuse but does not literally satisfy the prompt's 15-joint count; the earlier description of that count as shorthand was an implementation interpretation, not an explicit user-approved exception.
- Keep legacy gate metadata/evaluation compatible. Tier 4 mission entry enforces story prerequisites and treats attributes/equipment as recommendations, so alternative builds can start every mission. Public lifts provide access to elevated objectives.
- Numerical tuning absent from the request is explicit balance data: mission XP, citizen payouts/failure deltas, timers, heat and activity limits. Memory tags grant exactly 150 Vigilante XP and +2 resonance. Repeated completed missions, sets, quests and course rewards cannot be farmed; citizen event receipts remain repeatable and unique per character.
- Completed content and rewards survive reconnect/restart. Interrupted encounters restart; partial quest stages and partially finished races are not checkpoints. Character-earned collectibles and unlocks remain personal in co-op.
- Use additive multi-mesh procedural faction armor, props and vehicles alongside the existing art. No new paid assets, dependencies, commits, pushes or deployments were required.

## Evidence

- [19 focused groups](evidence/tier4-verification.json)
- [Build](evidence/tier4-build.log)
- [Full existing regression suite](evidence/tier4-regression.log)
- [Tier 1](evidence/tier4-lore-regression.log), [Tier 2](evidence/tier4-tier2-regression.log), [Tier 3](evidence/tier4-tier3-regression.log)
- [Browser report](evidence/tier4-browser.json), [field journal](evidence/tier4-journal.png), [faction presentation](evidence/tier4-factions.png), [hunter alert](evidence/tier4-hunter.png)

Tests exercise all 24 missions using a level-one starting build; normal H/gunfire/throw input; live WebSocket authority and observer collider replication; all collectible and landmark reward paths; actual SQLite WAL reopen; all four citizen resolutions plus failure; eight ordered courses; and both Crucibles with two survivors. Controlled test placement and accelerated simulation are used to reach authored content. Browser QA uses an isolated in-memory profile and explicit faction/hunter fixtures; normal H input starts Wake Debt and normal journal clicks change tracking. Reviewed screenshots and the final console show no errors.

The six requested implementation deliverables are implemented, with the strict 15-joint count exception above. An unqualified claim that every original requirement was met is therefore too strong. These checks do not establish an uncoached 24-mission playthrough, final combat balance, target-hardware performance or realistic eight-player release qualification. Existing product acceptance stages and broader release gates remain separate.
