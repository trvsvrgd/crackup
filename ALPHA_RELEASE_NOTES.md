# Alpha gameplay pass — November 10, 2026

This milestone turns the technical sandbox into a clearer opening experience. It does not certify a production release.

- Player HUD: health, drop shield, fuel, dash count, available upgrades, mission stages and a projected objective marker. Developer telemetry is optional with F3.
- Opening: deploy near Neon Docks facing the relay network; receive movement, traversal and combat hints as the operation advances. Mission completion requires defeating the kingpin and explicitly overriding the core.
- Combat: normal enemy melee now applies damage; downed agents cannot act. Health arrives from the server, with damage, hit, critical and defeat feedback. Recovery has a three-second delay and preserves progress. Health persists across reconnects.
- Progression: remove level/build cheat hotkeys and reject legacy stat/build mutation messages. Each earned attribute level grants a point; skill purchases enforce cost and prerequisites. Rewind requires its relic.
- Companion/raid integration: decode the existing phase-six protocol, display companions, arena platforms and the Dreadnought, expose adoption/entry/leave controls and show arena/raid status. Visuals remain procedural alpha assets.
- Reliability: retain brief action taps until the next input tick; clear held inputs on focus/pointer-lock loss; stop stale movement; reconnect with bounded backoff; reset prediction state on login/recovery. Schedule fixed physics steps with a bounded accumulator to compensate for timer drift. Bound input processing, reject duplicate sequences, limit message sizes/rates, validate browser origins, expire unauthenticated sockets and clean up dead/slow connections.
- Persistence: add a nullable health column without resetting existing accounts; salt PINs with scrypt and migrate legacy hashes upon successful login. Existing unlocks are preserved.
- Deployment: target the compiled current server, use reproducible dependency installation, and update the temporary tunnel launcher to ES modules/current server startup.

## Validation

Run `npm run build` and `npm run verify`. The phase-one suite now recognizes the newer protocol packets and seeds its test levels through the database. The alpha suite adds behavioral regression coverage for progression, combat, recovery, persistence and socket boundaries. Browser verification covers login, the player HUD, menus, settings and companion controls.

## Before production

- Five first-time players complete the opening district without coaching.
- An eight-player, 30-minute session succeeds on realistic internet connections without lost progress or unrecoverable disconnects.
- Profile frame times on the declared minimum machine; test the performance preset and several desktop viewport sizes.
- Review balance and enemy behavior with real players. Replace/refine procedural art and animation where readability or quality suffers.
- Validate the actual hosted build, TLS, persistent storage, backup restoration, operational monitoring and rollback.

World district stages and live arenas/raids are session state. Individual rewards, skills, collected items, companion records and health persist. Browser alpha checks and short automated multi-client tests do not replace the playtests above.
