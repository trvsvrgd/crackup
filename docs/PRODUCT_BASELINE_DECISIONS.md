# Product baseline decisions

Recorded November 13, 2026 (America/Chicago). Applies to [requirements v3.1](PRODUCT_REQUIREMENTS_V3.md), the [production plan](PRODUCTION_DELIVERY_PLAN.md), and the [product ledger](../artifacts/product-delivery-status.md).

## Owner decisions

| ID | Decision and source | Effect | Still open |
| --- | --- | --- | --- |
| D04 | Owner answered **“Use the proposed baseline”** to four districts, 24 campaign missions, a 12–18-hour solo campaign and optional 1–8-player co-op. | These quantities are the working launch baseline. Retain the remaining v3 content envelope for production planning; changes must be explicit. | Audience/content rating, store, price and individually proposed NFR thresholds are not approved by this answer. |
| D02 | Owner answered **“Yes, support offline solo.”** | The complete solo campaign must launch, save, quit, resume and reach its ending without internet after installation. No remote authentication, entitlement renewal, CDN asset fetch or party service can block installed solo play. Updates/downloads and internet co-op may need a connection. | Packaging/runtime choice and local/online identity reconciliation require P1 proof. Offline functionality is required, not implemented acceptance. |
| D06 | Owner answered **“no spending.”** | Zero additional paid assets, specialists, voice services, hosting, tools or subscriptions. Use available resources and genuinely licensed free sources. No purchases or paid service commitments. | Existing tools are not cancelled or reconfigured. Record time and quality gaps; do not silently reduce scope or invent missing assets. |
| D05 | Weekly development capacity was not supplied. | Remains unknown; record actual task effort and accepted throughput. | No invented weekly hours or release forecast. |
| D03 | Prior confirmed reference remains desktop RTX 4070 / 16 GB system RAM. | Use it as the qualification target. | Exact target CPU/SSD/OS/driver and access to that configuration. The observed RTX 5070 / 64 GB host is diagnostic only. |

These decisions authorize continued work within the baseline. They do not accept P0–P8 quality gates, authorize spending, approve a runtime migration or establish successful playtests.

## Offline and save feasibility contract for P1.4

First evaluate a local authoritative process using the existing Three.js/Rapier/SQLite implementation. Preserve the current hosted mode and Phase 1–5 behavior during this feasibility work. A browser talking to a prestarted local developer server is a component diagnostic; a customer must eventually launch the installed product without a terminal or development tools.

Proposed ownership contract, pending the P1 prototype and owner review:

- Assign a stable campaign ID and local profile owner. Keep character progression distinct from the owned world/checkpoint. Local sessions bind to loopback; no public listener is needed for offline solo.
- Store mission version, current checkpoint, completed objectives, decisions, district changes and unique reward receipts transactionally. The operation completion and its reward receipt must commit together.
- Resume at a validated authored anchor. Do not restore an arbitrary position inside moved geometry or infer completed missions from unlocked rewards.
- In co-op, the host selects a campaign. Guests keep their own campaign checkpoint; joining never silently imports the host's world history. Reward eligibility and any voluntary catch-up action need visible rules before launch.
- Save/profile import and local-to-online reconciliation are separate flows with explicit user intent, version checks and backup. An offline local save cannot be trusted as server-authoritative public progression without a defined policy.
- Offline field-menu pause stops local simulation and audio appropriately; co-op pause behavior is explained. Focus loss, disconnect, downing and cinematic exit restore control safely.

Proof scenarios: fresh installed local profile with external network unavailable; save/restart after each opening checkpoint; interrupted checkpoint/reward commit; migration from a supported old fixture; two local profiles with different world progress; guest leave/rejoin without overwriting either campaign; no remote asset/auth request on the installed solo path. Host operating-system offline testing and clean installation are separate from browser request filtering.

## Current evidence and consequence

The [repeatable save audit](../artifacts/evidence/p0-save-continuity.json) uses three real server processes and a temporary database. Individual state and district rewards survive; both partial and completed district objectives reset. Its completion fixture is synthetic and does not count as normal campaign play. FR-SAVE-01 is **Needs work**.

The next production save work must address campaign ownership and atomic checkpoints. Merely persisting the one global district map would not satisfy separate solo campaigns and intentional guest participation. P0 can document and measure this risk now; the P1.4 implementation gate still depends on the full P0 exit contract.

November 14 follow-up: the owner said **“go”** after durable checkpoints/offline launch were proposed as the next priority, then **“proceed.”** This authorized the focused [P1-SAVE implementation](../artifacts/product-p1-save.md). The local district checkpoint gap is addressed by that implementation; the preceding P0 findings remain historical evidence. Scope, spending and runtime decisions are unchanged. P0/P1 quality gates are not declared accepted by this focused engineering result.
