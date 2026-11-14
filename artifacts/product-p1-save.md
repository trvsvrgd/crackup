# P1-SAVE implementation checkpoint

> Historical checkpoint. The subsequent [story/settings continuation](product-p1-presentation.md) closes the browser-only presentation limitation described below.
Recorded November 14, 2026 (America/Chicago), following the owner's “go” and “proceed” on durable campaign checkpoints and offline launch. This is a focused implementation and feasibility result. P0's remaining baseline evidence and the full P1 art/performance/owner-review gates remain open. No spending, engine migration, commit, push or deployment was performed.

## Delivered behavior

- **Separate local campaigns.** `npm run solo` uses a loopback-only server and a separate local database. Each callsign owns one versioned campaign with a stable ID. Another profile cannot join an active solo world; returning to profiles and choosing another player restores that player's own world.
- **Durable district checkpoints.** One/two relay hacks, the lieutenant checkpoint, kingpin defeat/core override, completed districts and the final Dreadnought outcome survive restarts. Resume uses the existing agency drop area rather than an unsafe saved airborne/vehicle location. Incomplete fights restart. Restoring a checkpoint does not replay progression awards.
- **Atomic writes.** Profile state, campaign revision and unique reward receipts commit in one SQLite transaction. Stale revisions, wrong owners, damaged data and unknown schema versions are rejected. Existing individual profiles can receive a new local campaign without losing their progression; missing historical world completion is not invented from their reward inventory.
- **Save-failure behavior.** A failed write pauses local play, keeps the in-memory session and exposes a retry in the field menu. Save-and-leave is refused until persistence succeeds. Corrupt/unknown campaign data is retained instead of silently replaced.
- **Pause and player controls.** Field-menu and focus/visibility changes request authoritative local pause. Queued gameplay input is cleared; client prediction and world sound stop while paused. The menu shows save time/checkpoint and provides Save checkpoint and Save & return to profiles.
- **Portable Windows build.** `npm run solo:package` creates a fresh folder containing Node, installed native dependencies, compiled server/shared code, browser bundle, real assets, licenses and a hashed inventory. Double-click Launch CRACKUP.vbs to start a hidden local process and open the default browser. No Node/npm installation or developer terminal is needed on the play path.

Shared multiplayer remains the default for `npm start`. Its existing mechanics, online-menu behavior and repeating raid remain in place. Offline profile data is not automatically imported into hosted accounts. Solo completion disables raid respawn only in the local campaign.

## How to run this build

The exact generated package directory is recorded as `localPath` in the [package report](evidence/p1-solo-package.json). Open its **Launch CRACKUP.vbs** file. The package contains approximately 199 MB across 494 files plus its manifest, including 40 installed dependency packages. A desktop browser with WebGL2/hardware acceleration is required.

Local saves use `%LOCALAPPDATA%\CRACKUP\solo\campaigns.db`. Keep the entire save directory when replacing the application; back it up while the game is closed. `SOLO_DATA_DIR` and `SOLO_PORT` allow isolated diagnostics. The default local port is 3219. Closing the last game tab saves progression; the process exits after no active player/tab remains for approximately one minute. An already running local instance is reopened instead of starting another competing server.

The package includes the genuine [Node v22.16.0 license](https://raw.githubusercontent.com/nodejs/node/v22.16.0/LICENSE), matching the installed binary, plus dependency and asset notices. The builder's first license acquisition is a build-time operation; the installed play path does not fetch it.

## Verification

| Check | Result / evidence |
| --- | --- |
| `npm run build` | Passed TypeScript and browser bundle generation. |
| `npm run verify:solo` | **9 scenarios passed**: legacy profile preservation and transaction/receipt rollback; owner/version guards; loopback/API isolation; pause/input handling; real abrupt restart after a single relay; active lieutenant restart; dead kingpin/override and once-only completion; separate profiles; failed-save retention/retry; retained ending. Related cases are grouped in nine reported scenarios. [Raw report](evidence/p1-solo-verification.json). |
| `npm run verify` | Full existing Phase 1–6, alpha and Section 6 Stage 1–6 regression passed, including packet-aware network suites. |
| Portable launch | Copied the package outside the repository to an isolated temporary directory, cleared `NODE_PATH`, and launched its actual VBS entry point with a private save directory. Its bundled Node served the game successfully; no repository dependency resolution was available. [Package inventory/hashes](evidence/p1-solo-package.json). |
| Normal browser sample | With HTTP cache cleared/disabled and all external HTTP requests blocked, created a local profile, reached/hacked the first relay using normal input, paused, saved, resumed, returned to profiles and continued. Objective remained **1/2 relays**. Server tick stayed **272** across the pause sample and advanced to **296** after resume. Zero page errors and failed requests. [Raw observation](evidence/p1-solo-browser.json), [menu screenshot](evidence/p1-solo-menu.png). |
| Native focus coverage | A second automation tab did not change the game's `document.hidden` or `document.hasFocus()` values. The [observation](evidence/p1-solo-focus-observation.json) is explicitly unverified for focus pause; native alt-tab/minimize remains a qualification task. No synthetic visibility override was counted as a native pass. |

The isolated server tests deliberately place players and set up boss states to exercise recovery boundaries; they are not human campaign completion evidence. The browser sample uses no teleport, forced damage or gameplay-state injection. Earlier browser navigation attempts missed relay range; the retained successful sample uses the visible distance cue and verifies the actual changed objective.

The [checkpoint evidence manifest](p1-save-evidence.json) binds source files, checks, browser evidence and the package report with SHA-256 hashes. The package itself has a complete file inventory. Test browser/server processes used private data and were stopped after verification.

## Scope and remaining work

This implementation saves the **existing four district operations**, not the future 24 authored missions. It does not finish the game's campaign content, personal co-op world selection/catch-up, controller support or release installation/update/rollback UX. Story/dialogue choices, cinematic history and preferences still live in browser storage; they are not yet part of a complete durable campaign schema. Session-only vehicles, destructible props, active combat damage, bounties and transient effects reset on resume by design for this checkpoint prototype.

A Chromium request filter is not an operating-system internet outage. No clean Windows machine qualification, physical 4070/16 GB benchmark, full human playthrough, exhaustive corruption/disk-full recovery study or guest reconciliation acceptance is claimed. The local short PIN identifies a local profile; it is not a production online identity solution. Windows Script Host/browser availability still belongs in the distribution compatibility matrix.

FR-NET-01, FR-SAVE-01, FR-SAVE-03 and FR-DIST-01 are **In progress**, supported by this subset of evidence. All other product requirements remain Unverified. No product gate is Accepted. Preserve the [P0 audit](product-p0-continuation.md) as historical evidence and use the [current ledger](product-delivery-status.md) for status.

Next work: unify story decisions/recap/settings with the versioned local campaign; define and prove explicit host/guest ownership and reward policy; then connect this save path to the authored opening as its spaces and mission data are produced. Reference-scene art review and target-hardware evidence remain required for the full P1 gate.
