# CRACKUP: Protocol Eclipse

A browser-based, third-person co-op city sandbox for up to eight players. **Playable alpha**: the current milestone is a clear opening district operation, earned upgrades, and reliable multiplayer sessions. This is not a production release.

Development checkpoint: Section 6 Stages 1-2 and 3A-3C are verified. Start with [the saved progress ledger](artifacts/project-progress.md) for the remaining stages, resume checklist, decisions and browser evidence. Stage 3D weapons and the combined Stage 3 integration gate are next.

## Run locally

Requires Node.js 20+ and a desktop browser with WebGL hardware acceleration.

```powershell
npm ci
npm run build
npm start
```

Open http://localhost:3000. Choose a callsign and a 4–8 digit PIN to create an agent; reuse the same details to continue. Accounts, health, earned progression, collected items and companions save to SQLite in `data/crackup_v2.db`. Existing accounts migrate automatically; old PIN hashes upgrade on successful login.

`npm run dev` watches the server. Re-run `npm run build:client` after client changes; the server serves `public/game.js` directly.

Production HDR, 2K PBR textures and rigged humanoids are included under
`public/assets/`. Reprovision with `npm run assets:fetch` and validate with
`npm run assets:verify`. See [asset sources and Mixamo build instructions](public/assets/README.md).

## Your first operation

You deploy near Neon Docks, facing the first objective. Follow the gold diamond, sabotage both relays, defeat the lieutenant and kingpin, then override the core. Liberating the district unlocks Grapple Overdrive for the squad. The tracker advances to the next district.

Green rooftop orbs improve agility. Combat, other orb types and relic discoveries grant attribute XP. Each earned attribute level grants an upgrade point. Press **B** to switch chassis or buy skills; skills require the preceding tier in their branch. Numeric keys no longer grant levels, and clients cannot grant themselves skills or relics.

| Action | Control |
| --- | --- |
| Move / sprint | WASD / Shift |
| Look / capture mouse | Mouse / click the city |
| Jump / air dash / mantle | Space / Ctrl or X / M |
| Aim / fire / cycle target limb | RMB / LMB / Tab or mouse wheel while aiming |
| Melee / counter amber attack | V / Q |
| Sabotage relay, override core, revive ally | H |
| Jetpack | Hold J |
| Grapple | Hold G |
| Grab or throw prop / enter or exit vehicle | F / E |
| Chrono rewind, after finding its relic | R |
| Upgrades / field menu / developer telemetry | B / Esc / F3 |

The field menu includes mouse sensitivity, visual quality, neon glow, controls, upgrades and companion adoption/arena entry. The online world continues running while menus are open. Downed agents can be revived with H or recover at the agency drop point after three seconds. Recovery preserves earned progress. The 15-second drop shield gives agents time to orient themselves.

Companions and the Dreadnought have procedural client visuals driven by authoritative snapshots. Pet arenas require two participants. The Dreadnought deploys after all four district operations are completed in the current city session. District operations and live arena/raid state reset when the server restarts; individual rewards and companion records persist.

## Verify

```powershell
npm run build
npm run verify
```

`verify` runs phases 1–6 and the alpha regression suite, followed by the Section 6 Stage 1-2 and 3A-3C checks. The alpha checks cover enemy damage, downed controls, relic ownership, district completion requirements, PIN migration, progression forgery, upgrade prerequisites and cost, health synchronization, timed recovery, reconnect persistence, stale/duplicate inputs, frame limits and origin rejection. Verification suites use test databases; `verify:alpha` uses an isolated temporary directory. The original `test:critic` script belongs to the retired 2.5D implementation and is not a release gate.

## Progress artifact

Edit the machine-readable ledger at artifacts/project-progress.json, then run:

~~~powershell
npm run progress
npm run progress:check
~~~

The generated Markdown ledger includes all remaining stage dependencies and a dated progress log. Its tracked evidence copies include browser reports/screenshots and the asset validation report; SHA-256 checks detect changed evidence.

## Host

For a temporary public link from your PC, `npm run host:online` builds the game, starts the current server and opens an SSH tunnel using localhost.run or Pinggy. The process must remain running. Copy the URL printed in the terminal. This is a playtest convenience, not managed production hosting.

For a built deployment:

```powershell
npm ci
npm run build
npm run start:production
```

Docker, Railway and Render configurations start `dist/server/index.js`. Render includes a persistent disk. For Railway, attach a persistent volume and set `DATA_DIR` to its mount path before relying on saved accounts. Terminate TLS at your hosting proxy so browsers use HTTPS/WSS. Back up the SQLite database and its WAL consistently before deployment.

Environment variables:

- `PORT`: listening port, default `3000`.
- `DATA_DIR`: SQLite directory, default `./data`.
- `ALLOWED_ORIGINS`: optional comma-separated browser origins, such as `https://game.example.com`. Without it, browser WebSocket origins must match the request host. Non-browser clients without an Origin header still authenticate normally.

## Release gate still outstanding

Automated checks do not establish game quality or production readiness. Before a public release, have five unfamiliar players complete the opening operation without coaching, then run a 30-minute eight-player playtest on declared minimum hardware and realistic network conditions. Verify frame times, reconnects, saves, combat balance, accessibility, backup restoration and the actual hosted build. See [ALPHA_RELEASE_NOTES.md](ALPHA_RELEASE_NOTES.md).
