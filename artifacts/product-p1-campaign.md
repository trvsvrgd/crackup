# P1-SAVE continuation: owned co-op worlds and guest persistence

Recorded November 14, 2026. Follows the [durable solo presentation checkpoint](product-p1-presentation.md). The new opt-in campaign mode implements the [host/guest policy](../docs/CAMPAIGN_COOP_POLICY.md) without rewriting the Phase 1–5 simulation or changing the existing shared sandbox behavior.

## Delivered

Players explicitly host their own saved campaign or join an active host using a private session code. Only the host's objectives advance. Connected teammates retain earned character progression and district technology; late arrivals receive no past district unlocks. Character reward receipts prevent duplicate unique technology across different owners' worlds. Guest story/cinematic/settings data is stored per visit to a host's campaign, separate from their own campaign JSON.

One transaction saves the owner world, all present character records, unique receipts and guest visits. A failed guest write rolls back the whole transaction and pauses play until retry. Host disconnection suspends guest simulation; reauthentication restores the same party without replacing its world. Explicit host departure ends the party. Menus remain live during co-op. Join errors, ownership, roster, guest policy and leave behavior are visible in the UI. Sensitivity dragging previews locally and saves the final selection, avoiding control-message flooding.

The opt-in mode uses the existing version 2 campaign schema plus additive `character_reward_receipts` and `campaign_guest_visits` tables. Existing solo campaign/reward tables remain readable. The shared-world create-agent behavior previously inherited all completed district technology; campaign guests now receive only their saved character unlocks on arrival. That adjustment is confined to the new mode.

## Evidence

| Check | Observed result |
| --- | --- |
| Build | `npm run build` passed TypeScript and browser bundling. |
| Campaign persistence | `npm run verify:campaign`: **8 scenarios passed**, with real child server processes, authenticated WebSockets, packet-aware snapshots, 2/4/8 players, actual core-interaction input, SQLite guest-write failure and abrupt process death/restart. [Raw report](evidence/p1-campaign-verification.json). |
| Unequal-progress proof | A guest with a different saved district and sensitivity 9 joined another world, saved visit sensitivity 6 and a response, earned the host's district technology, disconnected/rejoined, and survived a service restart. Their original world JSON remained byte-for-byte unchanged. Hosting their own campaign restored their original checkpoint/settings. Completing that world did not duplicate their character receipt. |
| Failure proof | Failure while saving the guest rolled back host character, guest character, world checkpoint and receipts together. Leave was denied; repair/retry persisted one world completion and one technology receipt for each eligible character. |
| Solo regression | All **12** existing solo save scenarios passed. [Report](evidence/p1-campaign-solo-regression.json). |
| Existing regression | Full `npm run verify` passed Phase 1–6, alpha and Section 6 Stage 1–6 including networking. The final client-only label/slider adjustments were subsequently built and checked in the browser. |
| Two-browser UI | Host code/ownership, actionable wrong-code retry, guest roster/privacy, live menu ticks, guest preference persistence through leave/rejoin, a 40-step sensitivity drag, and host end-party behavior passed. No page errors or failed requests. [Report](evidence/p1-campaign-browser.json), [host](evidence/p1-campaign-host.png), [guest](evidence/p1-campaign-guest.png). |
| Distribution artifact | Rebuilt the existing offline solo package with the current source. The co-op runtime is included as compiled code, but its customer launcher/network setup is still open. [Package manifest](evidence/p1-campaign-package.json). |

The scenario prepares defeated-enemy prerequisites as explicit fixtures; it does not claim a human mission completion. The UI test used normal controls on two browser pages and a private loopback database. No deployed service, real player save, router/firewall or paid resource was changed. Browser and test services were stopped after checking. The [evidence manifest](p1-campaign-evidence.json) binds source and reports for this checkpoint.

## Status and next work

FR-NET-02 moves to **In progress**, alongside the four already progressing requirements. The product register now has **91 Unverified, 5 In progress, 0 Accepted**. P0/P1 full quality gates remain open. Engineering checks are not 4070/16 GB qualification, a real WAN eight-player playtest, authored campaign completion, or public identity/security acceptance.

Next connect the durable ownership/checkpoint path to the authored opening operation and its mission data, while continuing the outstanding P1 scene/content contracts. The prototype still has the existing district loops rather than the proposed 24 missions. Authored mission selection/replay, consequential mission decisions, level scaling/play balance, supported catch-up/import, customer co-op launch/discovery, native focus behavior, storage backup/rollback recovery and full multiplayer network qualification remain open. These limits are detailed in the policy and the [delivery ledger](product-delivery-status.md).
