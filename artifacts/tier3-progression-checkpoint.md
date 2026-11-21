# Tier 3 progression checkpoint - November 18, 2026

The five numbered deliverables in the supplied Tier 3 prompt are implemented and pass the requested build and regression gates. The introduction says six deliverables, but supplies only five; no sixth requirement was invented.

## Deliverable audit

| Deliverable | Implementation and evidence |
| --- | --- |
| 1. Progression and World Bible | Section 4 and `shared/content/progressionRegistry.ts` define the seven complete level curves, 0/1000/3500/8500/18000 thresholds, unlock parameters, fixed action awards and conserved hybrid splits. Server-observed actions award XP. |
| 2. Chassis and skill tree | `shared/content/skillTreeRegistry.ts` defines five chassis, 35 core nodes and seven bridges. Server purchases validate earned levels, predecessors, points and duplicates. Costs are 1/1/2/3/4 per path and 2 per bridge. Passive modifiers and registered active effects execute through the authoritative build/ability systems. |
| 3. Arsenal, vehicles, relics and pets | `shared/content/arsenalAndVehicleRegistry.ts` defines 28 weapons, four relics, eight ground vehicles, seven aircraft and four companion abilities. Runtime enforcement covers equipment requirements, magazines, cooldowns, movement impulses, vehicle services and mass limits. See the focused report for physical execution checks. |
| 4. Animation | Fixed 60 Hz pose blending, velocity stride, bounded directional banking, ten traversal states and additive combat offsets. Grounded recovery overrides stale falling state; tests verify finite transforms and continuing leg movement during combat. |
| 5. Verification | `tests/verify-tier3-progression.ts` and `npm run verify:tier3` added. Build, 20 focused groups, the complete existing `npm run verify` chain and 22 Tier 2 groups pass. |

## Runtime coverage

The focused suite exercises real Rapier grenade motion and collider cleanup, 7/18/35 m launches, the 30 m/s Pile-Bunker intercept, the 8 m Katana dash and 22 m/s Shield Surf. It also covers reload timing, Crown shields/refills, Spire hover, co-op revive, SAM suppression, all vehicle services, moving Raven anchors, pet combat and scan state, and ordinary input persistence.

The final audit added steering Stinger missiles, a delayed Orbital Painter strike, persistent Sky-Crane cargo attachment/release with a 4,000 kg cap, aircraft destruction/ejection, Fox travel through actual vent coordinates before opening the physical cache door, a timed Q bullet-deflection window, and Key-Cipher control of actual Dreadnought turrets. Additional checks cover severe-fall immunity and dual-limb ammunition consumption. SQLite tests cover equipment, skills and idempotent legacy XP migration. Live WebSocket checks reject forged levels and points.

Browser QA used an isolated in-memory server with an explicitly seeded level-5 profile. Normal menu clicks displayed 42 skill cards, 28 weapon choices and 15 vehicle choices, installed a full Agility branch for exactly 11 points, and equipped the Pile-Bunker. The final screenshot was visually reviewed; the fresh browser console contained no errors. This verifies menu interaction, not organically earned progression or an uncoached playthrough.

## Decisions and compatibility

- Intermediate continuous curves use linear interpolation; dash counts are 1/2/2/3/3. Missing XP payouts, equip thresholds and skill/weapon tuning were chosen as explicit balance defaults. The registries contain those values; they are not claimed to have been supplied by the owner.
- One point per earned attribute level gives 28 total points, preserving selective builds. Legacy 20-node saves remain readable and retain their effects and spent-point accounting; new purchases use the 42-node catalog. Old relic IDs remain aliases.
- Existing authored weapon and vehicle presentation remains the visual foundation for the expanded roster. This task does not establish 28 bespoke weapon models or 15 bespoke vehicle models.
- Hover aim uses U, leaving J for the held jetpack control. B contains the equipment and skill actions; the World Bible and equipment panel describe the remaining controls.
- Existing unrelated work was preserved. No commit, push or deployment was performed.

## Evidence and remaining qualification

- [Build output](evidence/tier3-build.log)
- [20 focused groups](evidence/tier3-verification.json)
- [Full existing regression output](evidence/tier3-regression.log)
- [Tier 2 regression output](evidence/tier3-tier2-regression.log)
- [Browser report](evidence/tier3-browser.json)
- [Reviewed menu screenshot](evidence/tier3-menu.png)

The supplied numbered implementation deliverables are closed. Human balance/playability review, an uncoached campaign playthrough, target-hardware performance and realistic eight-player qualification remain broader release gates. Existing product acceptance stages are not advanced by this checkpoint. The session spanned continuation breaks; wall-clock elapsed time is not continuous active execution time.
