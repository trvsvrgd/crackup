# CRACKUP: Protocol Eclipse — World Bible

## 1. The Restless Dividend

Neo-Veridia stands on the flooded ruins of San Francisco. The Somna-Mesh began as voluntary sleep compute: citizens leased unused dreaming cycles to keep municipal systems affordable. The Restless Dividend expanded those contracts into waking leases. District Relays then silently installed firmware that made withdrawal impossible. A simultaneous 15% loss of leased compute overwhelms Neon Docks flood pumps and cascades through smog scrubbers, transit distribution and Citadel life support. Liberation must preserve replacement capacity; destroying every relay kills the people the Agents intend to free.

The Hollowing compresses memories to make biological storage available for rent. It overwrites episodic memory first: a citizen may still operate a crane while forgetting their daughter's name. At 95% Hollowing, hyper-reflexive brainstems are extracted and grafted into Neon Fox, Grid Hound, Aero-Raven and Titan Beetle chassis. These Cyber-Pets are surviving citizens, not synthetic imitations. Doorways, familiar routes and sounds can awaken dormant memories. Provenance records retain citizen identity independently of pet ownership and chassis.

Project Chimera produced eight playable Agents. Each Agent is a Gestalt consciousness braided from seven specialist minds: Agility, Strength, Driving, Shooting, Explosives, Flying and Vigilante. Repeated actions change Neural Drift ratios and let individual echoes speak through the HUD. The eight bodies share this architecture, not a single personal identity. Sera Lin maintains the citizen archive and helps strip Aegis audio filters in Act II, after the third Whisper collection. Before that threshold, spires emit reversed harmonic chords; afterward they reveal two-second citizen memories.

### District power and hidden histories

1. **Neon Docks:** Kingpin Captain Mateo "Barge" Kael is officially a terrorist. His stolen power actually shields Faraday nursery barges carrying children off-grid. Lieutenant Harbor Master Vane hides the barge manifests in pump schedules. The Seawall Engineer can prepare a bypass before the relay is disconnected. The Sunken Ferry Clocktower and offshore Alcatraz Chimera Lab preserve traces of the old bay.
2. **Foundry Slums:** Kingpin Mother Solange, called "Sister Mercy," publicly offers charity medicine. Her clinic secretly harvests episodic memory in a biological chop-shop. Lieutenant Foreman Ignis feeds its extraction furnaces. The Municipal Coroner can match missing citizens to mislabeled remains and secure scrubber reserves. Encased Coit Tower is sealed inside industrial filtration works.
3. **Helios Financial Spire:** Kingpin Sterling Graves is a power-hungry high-frequency broker wired to 4,000 rented slum brains at ten times normal perception speed. Lieutenant Valkyrie-9, formerly Cassia, protects his settlement routes. The Grid Transit Dispatcher can isolate financial traffic while keeping civic transport alive. Lombard-7 Hairpin survives beneath elevated trading infrastructure.
4. **Aegis Citadel Plaza:** Kingpin Provost Marshal Thorne enforces the firmware lock; Lieutenant Warden Iona Rook administers its compliance vault. The Civic Archivist can restore erased consent records and secure life-support redundancy. Rooftop Painted Ladies survive as relocated houses. In Act III, Director Julian Vance insists that order justifies coerced leases. Dr. Kaelen Voss proposes Protocol Eclipse, a scorched-earth virus that kills every citizen at 50% Hollowing or above. Neither plan is harmless.

Coordinates, identities, catastrophe thresholds, reveal conditions and mission text are canonical in `shared/content/`. Coordinates use engine metres, Y-up, within the 1,200 m city or its 10 km bay. Ruin coordinates identify lore sites; they do not imply newly built explorable interiors.

## 2. Campaign and cumulative consequence

The campaign registry contains 24 missions, six per district, with sequential dependencies, hard access requirements, soft preparation thresholds and Public Servant preparation objectives. Preparation protects infrastructure and exposes hidden motives. Micro-actions accumulate rather than presenting a final morality selection. MunicipalGridStability is tracked separately for all four districts from 0–100; GestaltResonance ranges from -100 (Tyrant) to +100 (Hero). The append-only SQLite ledger deduplicates action IDs so reconnects cannot award the same consequence twice.

Act IV resolves in the following explicit precedence, using the registry's weights and thresholds:

1. **The Apex Usurper:** resonance at or below -50, or domination sufficiently outweighing mercy and preservation. The Agent takes the lease network and becomes its tyrant.
2. **The Ascendant Gestalt:** resonance at least +50, every district at least 70 stability, and cumulative compassionate actions exceeding coercive ones. The seven echoes cooperate to distribute compute without erasing citizens.
3. **The Voss Purge:** any district below 35 stability, or repeated purge actions outweighing preservation. Protocol Eclipse destroys the network and kills all 50%+ Hollowed citizens.
4. **The Vance Compromise:** all other histories. Municipal systems survive under Vance's continued coercive administration, with incomplete emancipation.

Spire collection is a physical interruption: within 3 m of the capsule centre it adds 6.5 m/s upward velocity, restores current traversal capacities, produces twelve ballistic shards and a 40 ms client presentation hit-stop. The authoritative simulation and network clock continue during that visual pause. Citizen memories and pet discoveries are inspectable in the HUD; they are evidence of the people behind the infrastructure.

## 3. Neo-Veridia Geography & Urban Architecture

### Four-tier vertical stratification

| Tier | Elevation | Traversal language |
| --- | --- | --- |
| 1: Street & Podium | 0–25 m | Standard ledges and awnings are climbable at Agility Lv 1. |
| 2: Mid-Rise Canopy | 25–90 m | Smooth glass facades and overhanging cornices require horizontal monorail jumps, grapple pendulum swings, or vehicle ramp launches. |
| 3: High-Altitude Wind & Hazard Zone | 90–200 m | Foundry thermal updraft columns lift wingsuits; skyscraper canyon crosswinds, plasma cooling louvers on a six-second cycle, and security purge strips interrupt direct ascents. |
| 4: Apex Stratosphere | 200–320 m+ | Routes chain updrafts, grapple swings, mid-air Resonance Spire fuel resets, and rotating microwave dishes. |

### District traversal signatures

1. **Neon Docks (0–85 m):** moving geometry, rotating crane booms and swaying cargo containers.
2. **Foundry Slums (0–140 m):** thermal updraft plumes, high-pressure steam pipes and molten slag vents.
3. **Helios Financial Spire (0–260 m):** smooth glass atriums for wall-running and mag-grip driving, exterior high-speed elevators and twin-tower grapple gaps.
4. **Aegis Citadel Plaza (0–320 m):** active anti-air forcefields and turret emplacements.

These signatures define the architectural direction; the executable Tier 2 placements and bounds are canonical in `shared/content/worldSystemsRegistry.ts`.

## 4. Gestalt progression, equipment and field combat

The seven attributes use cumulative XP thresholds **0 / 1,000 / 3,500 / 8,500 / 18,000** for levels 1-5. `shared/content/progressionRegistry.ts` is the numeric authority for every level and unlock. Intermediate continuous values interpolate linearly; dash counts round to **1 / 2 / 2 / 3 / 3**. Existing saved levels are retained when older XP is migrated.

| Attribute | Level 1  to  Level 5 | Level 2 / 3 / 4 / 5 unlocks |
| --- | --- | --- |
| Agility | Run 8 to 16.5 m/s; jump 3.2 to 14.5 m; dashes 1 to 3; reach .8 to 1.8 m | Roll, wall-kick / 3.5 s wall-run / kinetic vault, 22 m/s rail grind / zero-terminal fall, wind-shear |
| Strength | Melee 35 to 140; HP 200 to 600; throw 150 to 4000 kg; warp 4.5 to 9.5 m | 14 m/s wall-splat / breach, heavy equipment / seismic crater, shield rip / vehicle hurl |
| Driving | Speed 28 to 55 m/s; mass 1400 to 3200 kg; grip 1 to 2x | Ram-plow / roof HMG, 4.5 m hop / EMP harpoon, 65 degrees mag tires / twin rockets, 25 m ejection |
| Shooting | Spread 4.2 to .4 degrees; range 40 to 110 m; V.A.T.S. bonus 0 to 60% | Ammo detonation / .4x airborne focus, weakpoint scan / dual-limb queue / 50% magazine refill on cripple |
| Explosives | Radius 4.5 to 12 m; impulse 18 to 65 N*s; self-damage reduction 0 to 90% | Arc preview, sticky / shaped breach, rocket jump / three bomblets, thermal lock / 6 m chain |
| Flying | Fuel 3 to 12 s; acceleration 12 to 28 m/s^2; handling 1 to 2.2x | Wingsuit, 20 mm cannon / hover aim, swarm missiles, winch / 28 m/s jet dash, EMP flares / 15 m dive-bomb |
| Vigilante | Aura 15 to 45 m; parry 220 to 420 ms | Deflect, scanner / disarm, pet pounce / elite parry, 30 s hack / instant co-op revive on parry |

Micro-XP is fixed per completed server-observed event: 2 per 10 m on foot, 4 per jump, 8 per mantle, 2 per second driving/flying, 12 per prop throw, 30 per shot hit (50 weakpoint), 40 per melee/explosion hit. A parry grants 150 total, split equally Strength/Vigilante. Hybrid events always conserve the total: VTOL strafe 40 split Flying/Shooting; rocket jump 20 split Agility/Explosives; ram 40 split Driving/Strength; pet pounce 40 split Vigilante/Shooting. No client can submit XP awards. Macro payouts: relic 1,050, district completion 3,500, raid 7,000 (equally across seven attributes); bounty 1,000 split Vigilante/Driving. Collectible payouts retain their prior authored values.

The 42-node tree has seven five-tier paths costing **1 / 1 / 2 / 3 / 4** points (11 per branch), and seven bridges costing two points with level 3 in both linked attributes. Each core tier requires its attribute level and previous node. Each earned attribute level supplies one permanent point (28 total), making builds selective. Chassis remain freely swappable at cleared safe houses. Legacy upgrades remain readable for existing saves, with their spent points accounted for; the new interface presents the 42-node tree.

All 28 weapons, four prototype relics, 15 vehicle variants and four pet field abilities are specified in `shared/content/arsenalAndVehicleRegistry.ts`. Equip requirements, cooldowns, damage and movement values are server-owned. Values absent from the Tier 3 request (intermediate curves, XP payouts, equip thresholds and most skill/equipment tunings) are explicit implementation balance defaults, not additional owner-supplied requirements. Heights are converted to launch velocity with v = sqrt(2gh); speeds are metres per second, impulses are N*s, and timers use simulation seconds.

Field controls: **B** opens upgrades and equipment; **T** activates the companion field ability, or its pounce while aiming; **Z** glides, **U** hovers, **J** runs the jetpack, **X** jet-dashes, **L** focuses, **O/I** scan threats/weakpoints, and **K** reloads. **Q** counters/deflects and **R** rewinds with the Anchor. In vehicles, **Q** launches missiles, **F** attaches/releases winch cargo or fires the ground EMP harpoon, and **Ctrl** deploys aircraft flares. Aimed Shooting Lv4 fire queues the selected limb and its adjacent limb, consuming ammunition for both shots.

Stinger missiles steer toward a visible thermal target in their forward cone. The Orbital Painter designates a ray-hit point for a two-second delayed strike. The Sky-Crane holds up to 4,000 kg below its hull with a damped tether; departure, destruction or release disconnects cargo. Four cache doors have visible Fox access grilles: the pet phases through the registered vent before disabling the door collider. Key-Cipher can take over actual Dreadnought flak turrets for 30 seconds. Severe ordinary landings above 24 m/s cost four HP per excess m/s below Agility Lv5; intentional crater attacks are exempt. These are explicit balance defaults for otherwise unspecified behavior.

## 5. Combat ecology, faction archetypes and boss arenas

### Environment: airspace, tactical destruction and recovery

Unliberated districts enforce SAM ceilings at D1 75 m, D2 90 m, D3 120 m and D4 100 m. Piloted aircraft receive a three-second radar warning before EMP flak suppresses rotor lift for 2.5 seconds. Destroying the local rooftop radar node on foot disables its lock; Flying Lv 4 unlocks deployed EMP flares. Canyon turbulence scales inversely with Flying level.

SAM volumes extend upward without an artificial upper cutoff. The registry defines the ceiling plane and district footprint; Rapier half-space and footprint queries enforce both. Chassis changes require a living, unmounted Agent inside a cleared safe house, with server validation of every request.

Thermal columns supply a +18 m/s vertical velocity impulse on wingsuit entry; crosswinds supply a 6.5 m/s lateral impulse on entry. Leaving and re-entering a volume retriggers it. Louvers scald during the first 1.5 seconds of each deterministic six-second cycle. Volumes use Y-up metre bounds and Rapier shape queries, including their vertical extent.

Cracked mid-rise walls have 250 HP. Only Strength Lv 3 charged melee or thrown props, or Explosives Lv 3 shaped charges, can breach them and expose an interior safe room/cache. Corporate holo-signs, rooftop HVAC chillers and suspended cargo have 80 HP tethers: breaking one releases a 1,200 kg body, with one 450-damage crush pulse within 5 m on physical impact. Broken architecture regenerates after 180 seconds only when every player is beyond 80 m of both the original structure and its debris. Recovery reuses the original bodies and clears motion.

Eight Forward Operating Safe Houses provide two sites per district: a street garage and an elevated landing pad. Clearing the local sub-sector unlocks vehicle/VTOL spawning, Augment Chassis swapping and ammo resupply. Municipal stability at or above 70 enables occasional Public Servant escort and repair tasks; below 40 it enables Syndicate armored robberies, riot clinic sieges and Aegis hit-squad ambushes. Active events have physical objectives, bounded actor lifetimes and cooldowns.

Escorts require accompanying a vulnerable citizen along a collision-tested route. Repairs require holding H beside damaged equipment with clear reach. Armored robberies require stopping the escaping van, defeating its guards and holding H to recover its cargo. Clinic sieges require preserving the clinic through timed reinforcement waves and clearing the attackers. Ambushes trigger when an Agent enters the sensor volume, track that Agent through a flanking wave, and fail if the target dies or disconnects. Objective health, stages and explicit success/failure outcomes replicate from the server.

### Shared-rig faction ecology

Syndicate, Aegis and Resistance each field five roles: Grunt, Shielded, Agile/Rush, Heavy/Support and a 3.2 m Elite Exosuit. All use the existing humanoid skeletal state machine and six bone-attached V.A.T.S. colliders. Bone layout remains shared; faction plates, pauldrons, shields, dorsal rails, colors and arsenal loadouts distinguish all fifteen silhouettes. Grunts advance and fire; shield units absorb frontal pressure; rush units close rapidly; support units suppress from range; exosuits carry heavy weapons. Crippled arms suppress weapons and crippled legs reduce pursuit. Resistance units encountered in contested missions are hostile combatants, not civilian targets. Faction patrols use Syndicate Mule technicals, Aegis Prowler MRAPs and Resistance Cyber-Cycles.

### District encounters

| Encounter | Arena and behavior |
| --- | --- |
| BOSS_D1_KAEL | Neon Docks Flooded Megacrane Drydock. Industrial exosuit, harpoon and GN_06 suppression; defeat reveals a Faraday nursery barge and the children protected by its isolated power. |
| BOSS_D2_SOLANGE | Foundry Slums Cathedral of Molten Glass. Hover-rig, GN_08 arcs and successive stasis-pod guard waves. |
| BOSS_D3_LT_CASSIA | Valkyrie-9, the open-world Hunter-Killer. District 3 Mission 2 completion or high heat deploys a VH_A06 Valkyrie VTOL and two VH_G02 Cyber-Cycle escorts. Cassia follows the target beyond district boundaries with GN_07 and ML_10 until defeated; target loss suspends/reassigns the hunt. |
| BOSS_D3_GRAVES | Helios Spire, 260 m Sky-Vault Penthouse. Destructible plate-glass windows and a high-speed dash chassis create exposed escape lanes. |
| BOSS_D4_THORNE | Aegis Citadel Plaza, 320 m Crown command deck. The command uplink deploys the orbiting Apex Eclipse Dreadnought; the final encounter requires neutralizing both command and ship. |

## 6. Campaign missions and life in the city

The 24 named missions in `campaignGraph.ts` have explicit executable assignments to five reusable controllers. SABOTAGE isolates multiple physical nodes; CONVOY_INTERCEPT stops a moving transport and recovers its cargo; VERTICAL_HEIST takes an elevated archive then extracts; TURF_DEFENSE protects a civic device through reinforcement waves; TARGET_HUNT tracks and defeats a named combatant. Prerequisites preserve story order. Attribute and equipment recommendations do not prevent an alternative player build, weapon, or vehicle approach. Objective interactions use H; damage objectives accept ordinary combat. Mission, quest and collectible rewards are authoritative and granted once per saved character.

Fourteen Chimera Black-Box Logs contain two recordings from each Gestalt Echo Subject 01–07. Each has a world position and an authored transcript; the full set unlocks GN_10, the Chimera 7-Voice Revolver. Twenty Redacted Somna-Dossiers, five per district behind breachable cache walls, reveal internal Aegis escalation memos. Thirty Hollowed Citizen Memory Tags in alleys and clinics reference the same citizens as pet provenance. Each tag awards 150 Vigilante XP and +2 Heroic Gestalt Resonance.

Five multi-stage San Francisco landmark quests preserve displaced fragments of the old city: the Sunken Ferry Clocktower restores a bell and unlocks RELIC_01 plus GN_10; the Alcatraz Black-Site pits the Agent against Chimera Unit 00 for ML_09; the Encased Coit Tower interior drop yields ML_10; the Lombard-7 Hairpin Drift Trial awards VH_G05; the Rooftop Painted Ladies Defense awards RELIC_02. Rewards remain available after reconnecting. Quest stages combine physical travel, interaction, combat and timed defense rather than menu-only completion.

Four timed citizen interventions occur near traveling Agents: UNLAWFUL_HARVEST_VAN, OVERCLOCK_MEDICAL_DROP, STOREFRONT_SHAKEDOWN and STRANDED_CRANE_CREW. They require stopping harvesters, delivering medicine, defeating extortionists or reaching and evacuating workers. Success awards XP, stability and Heroic resonance; expiration causes the registered stability/resonance loss. The HUD reports the objective, remaining time and result.

The Midnight Circuit has four checkpoint street races, including both suspension bridges. Four Skyline Stunt Ring courses accept wingsuit, grapple and VTOL traversal, replenishing fuel and dashes at each ring. Two Foundry Crucible arenas each run ten escalating co-op survival waves; surviving participants share completion credit. Checkpoints must be crossed in order, deadlines are authoritative, and failed activities can be restarted. Numerical payouts, durations and heat thresholds not specified by the production request are explicit balance defaults in the immutable registries.
