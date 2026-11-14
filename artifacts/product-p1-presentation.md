# P1-SAVE continuation: durable story, recap and settings

> Historical component checkpoint. The subsequent [owned co-op continuation](product-p1-campaign.md) implements host/guest ownership and separate visit persistence.
Recorded November 14, 2026. This completes the next focused implementation package after [local world checkpoints](product-p1-save.md). It does not accept the full P0/P1 product gates or the complete authored campaign. No purchases or new dependencies were needed.

## Delivered behavior

Local campaign save version 2 contains the existing world checkpoint plus story progress, the active dialogue node, selected responses, recovered-memory indices, cinematic outcomes, and six settings: mouse sensitivity, visual quality, neon glow, intro cameras, game sound and comms sound. The field menu derives a recap from encountered story beats and responses and displays the current saved objective. Resuming a line starts its text again; it does not replay earlier dialogue or the opening camera.

All of this is owned by the local callsign in the same SQLite database as its character, world checkpoint and unique reward receipts. Valid presentation changes save immediately, including while the menu is paused. WebSocket ordering places updates before subsequent Save / Return controls. Acknowledged saved data is durable; an unacknowledged last change during a forced shutdown is not promised. A failed transaction pauses play and retains the pending presentation in memory for the existing manual retry flow.

Version 1 world saves parse into version 2 without changing district progress, profile data, campaign identity or reward receipts. The first successful transaction writes the migrated version atomically. New and migrated campaigns initially have a null presentation field: the first authenticated browser imports its existing callsign-specific story/cinematic history and browser settings once. Older builds never recorded active dialogue or choices, so migration does not invent them. After that first import, the database is the source of truth even if browser storage is empty or blocked. Shared sessions retain browser preferences. Unsupported versions and damaged version 2 data are rejected without replacing the stored JSON.

Presentation messages accept bounded known story/cinematic identifiers and settings, and cannot provide world checkpoints, rewards, inventory or XP. Stale replaced sockets cannot write to the active session. Reauthentication suppresses the old camera's final local update before applying the newly loaded campaign. Presentation is not an authoritative mission-decision system for the future authored missions; those gameplay consequences still need mission data and server rules.

## Verification

| Check | Result and evidence |
| --- | --- |
| Build and package | TypeScript and browser bundle pass; new immutable Windows package contains 495 hashed files and the existing bundled runtime/dependencies. [Package inventory](evidence/p1-presentation-package.json). |
| Focused save suite | **12 reported scenarios pass**, extending the earlier nine with presentation serialization, legacy browser import/storage loss, schema validation, actual client/server persistence and abrupt restart. Also verifies version 1 migration, damaged version 2/unknown-version preservation, transaction rollback, failed-write retry, profile isolation, once-only rewards and retained ending. [Report](evidence/p1-presentation-verification.json). |
| Existing regression | Full `npm run verify` passed: Phase 1–6, alpha and Section 6 Stage 1–6 including network checks. The subsequent reconnect publication guard also passes the focused save suite. |
| Packaged browser | Normal UI selected **Understood. Moving.**, skipped the opening camera, muted comms, and set sensitivity **7**, Performance quality, glow off, intro cameras off and game sound off. Saved, returned to profiles, cleared browser storage, stopped the service and restarted the package. Authentication restored the exact `deployment/move` node, response, camera history, recap and all six settings. Zero page errors or failed requests in retained samples. [Raw report](evidence/p1-presentation-browser.json), [before](evidence/p1-presentation-menu.png), [restored](evidence/p1-presentation-restored.png). |
| Package integrity | All 495 files match their SHA-256 inventory; packaged browser/server/schema outputs match the compiled working tree. |

The browser run used the bundled Node executable and a private test save directory. Non-loopback HTTP requests were blocked and the initial cache disabled. The package ran from the repository output directory. Automatic approval review rejected the separate temporary-copy/background launch command with a generic blocked-by-policy reason; a managed terminal was used instead. The earlier checkpoint's outside-repository VBS launch remains historical evidence, not a repeated claim for this build. Test browser and server sessions were closed after verification. No real player saves were modified.

## Remaining work and next package

FR-SAVE-01 and FR-SAVE-03 remain **In progress**. The launch baseline is still four districts, 24 authored missions, a 12–18-hour complete offline solo campaign and optional 1–8-player co-op, with no additional spending. The ledger still has 92 Unverified requirements, four In progress and zero Accepted.

Next define and implement explicit host/guest campaign ownership, guest reward eligibility and reconnect/replay rules, with multi-client persistence evidence. Then integrate authored opening mission checkpoints and consequential decisions as that content is produced. The current six-beat presentation graph is not the 24-mission campaign. Full disk-full/corruption/backup/patch-rollback recovery, mission replay, clean-machine distribution, native focus behavior, reference hardware and uncoached campaign playtests remain open. Back up the local save folder with the game closed before application changes; older applications that only accept version 1 refuse version 2 without overwriting it.

The [current evidence manifest](p1-presentation-evidence.json) records this checkpoint. Earlier evidence manifests describe earlier working-tree snapshots; current source changes do not rewrite those historical claims.
