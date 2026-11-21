# Tier 1 narrative, lore registry and world mechanics

Completed November 15, 2026. All five requested deliverables passed their verification gates.

| Deliverable | Implementation | Evidence |
| --- | --- | --- |
| 1. World bible | `docs/WORLD_BIBLE.md`, Sections 1–2: Restless Dividend, Hollowing, Chimera, district profiles and four endings | Canon mirrored in typed content records |
| 2. Deterministic content | Four factions/districts; five ruin sites; 30 citizen memories and doorways; seven echoes; eight Agents; 15 characters; 24 missions with prerequisites, hard/soft attribute/equipment gates and Public Servant preparation | `npm run verify:lore`: IDs, recursive freezing, bounds, references, graph order, gates and ending thresholds |
| 3. Resonance Spires | Lightning-rod bases, opposing brass torus rings, twisted crystalline ribbons at 72 BPM; authoritative 3 m pickup, +6.5 m/s velocity, current capacity refill; twelve ballistic shards and 40 ms presentation hold | Capsule movement tests and live WebSocket collection; browser component rendering and audio checks |
| 4. Provenance and ledger | Canonical seeded citizen origins, real facade doorway targets, FOLLOW approach within 12 m, one-shot discovery event, inspectable Companion menu record, idempotent WAL migration and transactional consequence ledger | Legacy-schema reopen, duplicate actions, rollback, changed entity IDs, arena exclusion, live discovery and relay consequence persistence |
| 5. Verification | `tests/verify-tier1-lore.ts` and `verify:lore` package script | Build, lore suite, entire existing verify chain, progress check and diff check passed |

## Decisions

- Warden Iona Rook supplies the fourth Lieutenant, whose name was unspecified in the request. Her compliance vault supports the Civic Archivist's consent-record preparation objective.
- Runtime content is recursively frozen. Existing mission aliases and IDs remain stable; player-facing boss names resolve through the new character registry. The original mission-anchor hash still passes. The Phase 6 reconnect assertion now checks the added provenance fields as well as every previous pet field.
- Existing story exports remain available through a compatibility facade. Authored story content lives in `shared/content/storyScript.ts`; Voss's full purge is distinguished from the local Agent override.
- Ending precedence is Apex Usurper, Ascendant Gestalt, Voss Purge, then Vance Compromise. Boundaries and precedence are tested. There is no final morality-choice override.
- Live consequence sources include recovered memories, discovered citizen origins, nonlethal bounties, intact district-relay capture and destruction of all cooling vents in a relay generation. SQLite deduplicates stable action IDs. Save and ledger writes share a transaction; pending actions remain retryable after an outer campaign transaction failure.
- Pet origins derive from a stable seed and are persisted by citizen ID. Doorway approach coordinates are outside existing facade colliders with clearance. Decorative sealed entrances add no changes to legacy colliders or orb placements.
- All 30 memory phrases are bundled, non-silent, exactly two-second PCM assets generated from original transcripts using the installed Microsoft Zira voice. The manifest records synthesis source and file hashes. Playback uses local assets rather than a remote TTS request.
- Hit-stop holds client presentation only. Physics, inputs and authoritative snapshots continue.

## Verification and scope

`npm run build`, `npm run verify:lore`, `npm run verify`, `npm run progress:check`, and `git diff --check` passed. The full regression output is in [tier1-regression.log](evidence/tier1-regression.log). Source hashes and results are in [tier1-verification.json](evidence/tier1-verification.json).

The [browser report](evidence/tier1-browser.json) verifies all 30 speech files, reversed chord envelope, shard creation/expiry and a measured 44.9 ms presentation pause. [Rendered spires](evidence/tier1-spires.png) show the production mesh components. Browser console: zero errors or warnings.

The 24-mission graph and catastrophe parameters are authored data and callable resolvers; this upgrade does not replace the existing mission runtime with a new 24-mission playable campaign or implement a city flooding simulation. The five ruin sites are registered coordinates, not new explorable interiors. The browser scene is diagnostic; it is not an uncoached playthrough or target-hardware qualification. Existing unrelated workspace changes were preserved.

Reproduce the component preview with `node scripts/verify-tier1-browser.mjs`, open `http://127.0.0.1:3217`, and select **Verify browser audio and shatter**. Rebuild the synthetic voice pack on Windows with `npx tsx scripts/build-lore-voices.ts`.
