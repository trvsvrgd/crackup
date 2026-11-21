# Xbox controller support — 2026-11-19

Implemented native browser gamepad support for Windows Xbox controllers, using the [W3C standard gamepad layout](https://www.w3.org/TR/gamepad/#remapping). No new dependency or keyboard-emulation software is required. Existing keyboard/mouse input remains available.

## Delivered

- Analog camera-relative movement and vehicle steering/throttle; radial stick deadzones; frame-time-based look with slower aiming, saved sensitivity and invert Y.
- Xbox bindings for combat, traversal, interaction, equipment reload, companion commands, target limbs, unlocked abilities, map and field menu. LB supplies secondary actions. The in-game control guide lists every binding.
- D-pad/left-stick menu navigation, A activation, B back, right-stick scrolling, sliders, select controls, map zoom/panning and waypoint placement. Callsign, PIN and other text entry use the keyboard.
- Polling handles sparse device slots, hotplug and disconnect. Menus, cinematics, text input, focus loss and hidden pages suppress gameplay. Release controls to rearm after these transitions; held triggers cannot fire on menu dismissal. Short observed taps persist until the next simulation tick.
- Controller inputs feed the existing prediction, binary input packets and authoritative server. Abilities retain their existing server validation and unlock requirements.
- Controller onboarding and interaction/combat prompts; keyboard prompts return when keyboard/mouse input is used. Controller gameplay and menu dismissal do not require mouse pointer lock.

## Verification

Passed `npm run build`, `npm run verify:controller`, `npm run verify:alpha`, `npm run verify:map`, all six `verify:phase1` through `verify:phase6` suites, and `npm run progress:check`. The controller regression is also included in `npm run verify`.

The production browser client and an isolated authoritative solo server passed 24 browser checks, including real player movement confirmed in server snapshots, analog input packets, camera yaw, aim/fire/jump/grapple, one-shot reload, keyboard coexistence, menu input suppression, settings, map zoom/waypoints, reconnect, held-trigger safety and scrolling. There were no browser runtime errors. Test profiles used a temporary database, separate from player saves.

- [Browser results](evidence/xbox-controller-browser.json)
- [Controller guide screenshot](evidence/xbox-controller.png)
- Repeatable browser driver: `tests/verify-controller-browser.mjs`, run with `playwright-cli run-code --filename tests/verify-controller-browser.mjs` against an isolated solo server.

The browser test substitutes only `navigator.getGamepads()` hardware readings. Physical Xbox USB, Bluetooth and Xbox Wireless Adapter pairing, driver behavior, and human controller playtesting remain unverified. Rumble and custom button remapping are not implemented. One local controller drives the local agent; this adds no local split-screen mode.

## Use on Windows

Connect the controller in Windows, open the game on localhost or HTTPS in Edge/Chrome, click the page once and press a controller button. Enter callsign/PIN with the keyboard, then play with the controller. Open **Menu → Briefing & controls → Xbox controller controls** for the complete layout. An unrecognized nonstandard mapping is reported instead of guessing its buttons. Browser policy or insecure LAN HTTP can prevent access to controllers.
