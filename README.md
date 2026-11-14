# CRACKUP: Protocol Eclipse

A browser-based, third-person co-op city sandbox for up to eight players. **Playable alpha**: the current milestone is a clear opening district operation, earned upgrades, and reliable multiplayer sessions. This is not a production release.

Next product program: [complete-game requirements v3](docs/PRODUCT_REQUIREMENTS_V3.md), [phased delivery plan and solo-development budget guidance](docs/PRODUCTION_DELIVERY_PLAN.md), and [new product delivery status](artifacts/product-delivery-status.md). The target is a focused premium PC game with a complete solo campaign, a dense authored world and optional co-op. The new P0–P8 quality/content milestones are separate from the completed engineering stages below.

Development checkpoint: Section 6 Stages 1-6 and the controlled Stage 3 integration gate are verified. Start with [the saved progress ledger](artifacts/project-progress.md) for the remaining stages, resume checklist, decisions and browser evidence. Release qualification is next: minimum-hardware performance, unfamiliar-player onboarding and an eight-player playtest remain open.

## Run locally

### Offline solo

Run `npm run build` then `npm run solo` for local development. The offline server binds only to `127.0.0.1:3219`, opens your browser and stores each local profile's campaign in `%LOCALAPPDATA%\CRACKUP\solo\campaigns.db`. It uses a separate database from hosted accounts. Override `SOLO_DATA_DIR` and `SOLO_PORT` for isolated testing.

For a Windows x64 build that needs no development terminal or installed Node/npm, run `npm run solo:package` once. Open the newly generated folder under `output/solo/` and double-click **Launch CRACKUP.vbs**. Keep the entire folder together: the runtime, dependencies, assets and licenses are included. After packaging, playing requires no internet. A desktop browser with WebGL2/hardware acceleration is still required. The builder caches the matching Node license on its first run; it never downloads anything during play.

Offline solo pauses in the field menu and on focus loss. Use **Save checkpoint** or **Save & return to profiles**. Relay progress, lieutenant/kingpin checkpoints, district completion, one-time reward receipts and the Dreadnought ending persist. Resume starts at the safe agency drop point; unfinished fights restart. Closing the tab saves progress, and the local process exits when no player/tab remains active for about a minute. Back up the entire save folder with the game closed; replacing/deleting the application folder preserves that separate save folder.

This is the existing district campaign, not the proposed 24-mission game. Story choices, cinematic history and settings still use browser-local storage; hosted guest/campaign reconciliation and release qualification remain open. See the [save/offline implementation checkpoint](artifacts/product-p1-save.md). Validate with `npm run verify:solo`.

### Shared multiplayer development

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

For the next art/audio acquisitions, use the [asset sourcing and Codex handoff
guide](docs/ASSET_ACQUISITION_GUIDE.md). Put real downloads under
`asset-inbox/packages/<pack-id>/`, add source/license notes, then run
`npm run assets:intake` to index them for review and integration.

The installed Mixamo Capoeira library contains Y Bot and 39 real motion clips.
The third melee strike uses a retargeted Armada kick on the existing game armor.
Run `npm run assets:preview` for the motion/weapon studio and
`npm run assets:capoeira` to rebuild from the preserved local FBXs.

Run `npm run vista:preview` and open http://127.0.0.1:3199 to inspect the
10 km bay, suspension bridges, coast and dusk/night views. Bridge decks and rails
use shared physics; distant terrain is scenery. Texture packs support JPEG, PNG,
WebP and KTX2, with procedural fallbacks and atomic replacement.

Run `npm run effects:preview` and open http://127.0.0.1:3205 for the combat
and spatial-audio studio. Click **Enable audio / verify** to run actual WebAudio
checks. The game now uses authoritative pooled tracers, impact sparks,
shockwaves and skid marks, with bounded HRTF sound and a saved Game sound
setting. Cues are synthesized; final recorded sound packs remain optional art
refinement. Run `npm run verify:stage5` for shared/network checks.

Run `npm run cinematics:preview` and open http://127.0.0.1:3206 for the in-engine
opening and boss camera studio. First deployment uses an 11.5-second bridge,
city, vehicle and agent sequence; nearby authoritative boss encounters have
short introductions. Esc, Space or the skip button returns control immediately;
movement also cancels an intro. Disable **Intro cameras** in the field menu.
Seen/skipped sequences are saved per callsign in this browser. Damage, death,
disconnect and page hiding restore gameplay; simulation and co-op keep running.
Run `npm run verify:stage6` for lifecycle, network and scripted story-route checks.

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

The local solo save continuation stores story position, responses, cinematic history, settings and a recap with each campaign. See [the verified checkpoint](artifacts/product-p1-presentation.md) for migration behavior, evidence and remaining product requirements.

For the owned co-op prototype, run `npm run build` and `npm run campaign:coop`, then open `http://127.0.0.1:3222`. Choose Host my campaign or Join a host. The default listener and database are isolated from installed solo. See [host/guest rules and configuration](docs/CAMPAIGN_COOP_POLICY.md) and [verification evidence](artifacts/product-p1-campaign.md).
