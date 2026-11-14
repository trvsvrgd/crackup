# Owned campaign co-op policy

Implementation baseline, November 14, 2026. Applies to the opt-in `campaign` server mode and the existing district operations. It preserves the earlier `shared` sandbox and offline `solo` modes. This is a tested component policy, not acceptance of the full multiplayer launch requirements.

| Situation | Implemented rule |
| --- | --- |
| Profile and authority | The current server stores and authenticates each callsign. Offline, public-hosted and this server's identities are separate by default; there is no implicit save upload or cross-device account reconciliation. |
| Host | Choose **Host my campaign** in the profile screen. The authenticated callsign owns the loaded world. Only one campaign can run on this server at a time. A different owner cannot replace a live party. |
| Invite and capacity | The host receives a random session code in the field menu. Share the server address, host callsign and code through a channel of your choice. Guests select **Join a host**. Up to eight players total may participate. Invalid codes, inactive hosts and capacity failures return actionable login errors. Codes rotate when a party ends or its service restarts; reconnecting a host to an existing guest party retains its code. |
| World advancement | Everyone may use the existing objective interactions. All resulting district objectives and the ending update only the host's campaign checkpoint. No guest world is imported, inferred from rewards, caught up or overwritten. |
| Mission selection and replay | Hosting continues that owner's current district campaign. The existing open district objectives remain available. There is no authored mission selector, rewind, replay mode or reset flow in this prototype. |
| Difficulty and scaling | Existing character levels and encounter rules apply. No new co-op level or enemy scaling is implemented. These rules need representative unequal-build playtests before launch. |
| District technology | Characters present in the authoritative session at completion, including downed teammates, receive that district's technology. This follows existing completion behavior. An offline or not-yet-joined character receives no retroactive unlock. Unique technology is a set, backed by a unique character/reward receipt across all hosted worlds. Repeating another world's operation does not duplicate the technology or create an additional unique bonus. |
| Other progression | Earned combat XP, individually collected orbs/relics, upgrades and companions remain character state. Existing final-boss participant statistics remain statistics; no new unique finale loot or bonus XP was added. |
| Guest story and preferences | A visit is keyed by **host campaign ID + guest callsign**. A first visit starts from the host's saved presentation and the guest's own saved settings where available; it can reveal later story. Later visits restore their own saved dialogue/cinematic history and preferences. Visit changes never change the guest's own campaign story, settings or objectives. |
| Menu/focus | A co-op field menu does not pause anyone else's game. Offline solo keeps its existing pause behavior. |
| Guest departure | **Save & leave visit** saves the party transaction and returns that guest to profiles; the host and other guests continue. Rejoining spawns at the agency drop point in the host's current world. |
| Host connection loss | The server freezes simulation and clears queued input. Guests see a waiting/recovery menu and may leave. The same authenticated owner can reconnect and resume. There is no automatic host migration or guest takeover. |
| Host departure | **Save & end party** commits the party, returns all members to profiles and retires the session code. A different owner can then host their own world. |
| Service restart | The host must reopen the saved campaign first. Unfinished encounters restart, completed objectives remain completed, and guests use a newly issued code. Owned campaign version 2 is shared with the solo checkpoint reader when a database is explicitly supplied. The default databases remain separate. |
| Failed save | Host world, every present character, character reward receipts and guest visits commit in one SQLite transaction. A failure pauses everyone, prevents Save & Leave, and keeps pending state for retry. After a successful retry, disconnected sessions are released. Only acknowledged saved state is promised durable after process termination. |

The same ownership/reward/pause rules appear before joining and in the field menu. Session codes are shown only to the host and can be selected/copied. There is no automatic messaging to other people.

## Running the component

From the development workspace, run `npm run build`, then `npm run campaign:coop`, and open `http://127.0.0.1:3222`. Default data is `data/campaign-coop/campaigns.db`, distinct from the installed solo save folder. `CAMPAIGN_DATA_DIR` and `CAMPAIGN_PORT` select an isolated store/port. The default listener is loopback. `CAMPAIGN_BIND` is an explicit configuration override for a separately managed LAN/server experiment; this change does not configure a firewall, router, paid host or public deployment.

The portable solo launcher still starts offline solo. A customer-facing co-op launcher, WAN/invite transport, encrypted public service, recovery identity, supported database import, platform integration and clean-machine qualification remain production work. The short local PIN is not a completed premium/public identity design.

See the [implementation checkpoint and proof](../artifacts/product-p1-campaign.md). The overall launch baseline remains four districts, 24 authored missions, 12–18 hours, offline solo and optional 1–8-player co-op, with no additional spending.
