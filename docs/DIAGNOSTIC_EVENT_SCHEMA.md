# Diagnostic event contract v1

P002 / LC-OBS-02, extended by P003–P005 storage, exports and performance capture. Implementation: `shared/diagnostics/`, runtime launchers, authoritative server, client netcode, and bug-report recorder. The enclosing downloadable export is schema v3; each timeline event is independently schema v1. Additive JSON control fields do not change binary gameplay packet layouts or grant any authority. Storage contract: [durable journals](DIAGNOSTIC_STORAGE.md).

## Envelope and privacy boundary

Every event contains `schemaVersion`, `sequence`, UTC `at`, process-local monotonic `elapsedMs`, `component`, fixed `name`, derived `severity`, allowlisted `context` and `payload`, and `suppressedBefore`. Components are `launcher`, `server`, `client`, and the storage writer's `journal`. Order by `(component, runId, sequence)` within a recorder. UTC timestamps help align components but are not a distributed total order; use correlation IDs to establish causality. Launcher, server and journal share a run ID in offline solo but have separate component sequences and monotonic origins. Upload retries are at least once; deduplicate by source component/run/sequence and retain the original browser export when investigating reconnect timing, since server receipt context identifies the currently authenticated socket.

| Context | Meaning |
| --- | --- |
| `runId` | Recorder's process/page lifetime UUID; always assigned locally. |
| `serverRunId` | Server lifetime, supplied in health/auth/state messages. Joins solo launcher to server and client. |
| `clientRunId` | Page lifetime supplied at authentication; remains the same for reconnects within that page. A reload creates another ID. |
| `connectionId` | Fresh server-generated UUID for each socket, including a replacement/reconnect. |
| `agentRef`, `campaignRef` | Truncated HMAC-SHA256 pseudonyms with a fresh process-local random salt. No raw callsign/campaign ID or salt is exported. Stable only within that server process; do not infer cross-restart account identity. |
| `saveAttemptId` | Fresh server-assigned UUID per persistence attempt; shared by request/result events and solo/co-op state acknowledgement. A retry gets another ID. Client intent has no attempt ID until the server assigns it. |
| `clientBuild` | `client-` plus 16 hex digits from the existing client build pipeline. |
| `serverBuild` | `server-` plus 16 hex digits derived from sorted executing server/shared source files (compiled JS for distribution). |
| `contentBuild` | `content-` plus 16 hex digits derived from executing `shared/content` registries. This is a registry fingerprint, not an exhaustive hash of visual/audio asset binaries. |

Context keys are copied explicitly; UUIDs, HMAC references and correctly prefixed build tokens must match their formats. Client-supplied IDs/build labels are untrusted correlation hints, never authentication credentials. The server assigns connection and transaction IDs. Unknown fields are dropped, including arbitrary messages, profiles, saved state, URLs, filesystem paths, credentials and invite codes.

Payload numbers are finite, nonnegative and bounded by `Number.MAX_SAFE_INTEGER`: `revision`, `serverTick`, `attempt`, `delayMs`, `durationMs`, `closeCode`, `port`, `activeAgents`. Boolean fields are `paused`, `saveError`, `retry`, `isNew`. `mode` accepts only solo/campaign/shared. `code` uses a fixed error category allowlist. No `error.message`, complete stack or WebSocket close reason is serialized. Recognized close reasons map to `MESSAGE_RATE_EXCEEDED`, `CONNECTION_TOO_SLOW`, `LOGIN_TIMEOUT` or `SESSION_REPLACED`; others become `UNKNOWN`.

Client reports retain up to six shipped `game.js:line:column` offsets per captured error plus a fixed category. Hosts, paths, queries and messages are excluded. Keep the matching bundle/source map privately for symbolication. User-entered report notes remain separately visible in the preview and are not automatically redacted; users must review those notes before sharing.

## Event taxonomy

| Events | Producers and interpretation |
| --- | --- |
| `launcher.start`, `.ready`, `.reused`, `.failed`, `.stop` | Solo, campaign and shared process entrypoints. Solo `.reused` points to the already-running server lifetime. BAT prerequisite/install/build failures have a fixed-category PowerShell bootstrap record. |
| `server.start`, `.ready`, `.failed`, `.stop` | Authoritative server in all three modes. Database-constructor failure is categorized before rethrow. |
| `connection.open`, `.attempt`, `.authenticated`, `.rejected`, `.closed` | Socket admission and client lifecycle. Invalid PIN rejection is recorded without the PIN/profile. Not all existing admission refusal branches have distinct categories; missing category is not evidence of successful authentication. |
| `connection.retry`, `.exhausted` | Client scheduling or refusal to retry. Exhaustion includes nonretryable close codes as well as exhausted retry budget. |
| `campaign.loaded`, `.load-failed` | Authoritative campaign/visit restoration outcomes. No saved content is logged. |
| `save.requested`, `.committed`, `.failed` | Server persistence boundaries in solo, co-op and shared modes; solo/co-op clients record intent and acknowledge each distinct attempt once. The server's committed revision is the durability evidence. Shared mode has no new client save acknowledgement protocol. |
| `client.start`, `.ready`, `.failure` | Browser bootstrap/readiness and existing startup/runtime/graphics error hooks. |
| `lifecycle.pause` | Client-observed authoritative pause transition, including save-error flag. Full pause-reason ownership remains LC02. |
| `performance.sample`, `.stall`, `.heartbeat`, `.lifecycle`, `.resources` | Fixed metric/state labels, bounded durations/percentiles/counters and process liveness. [Measurement scopes and limits](PERFORMANCE_DIAGNOSTICS.md) distinguish overlapping costs, raw stalls, lifecycle periods and estimated versus actual resources. |
| `network.traffic`, `.pressure` | Per-connection application payload counts/queues and the actual slow-connection guard trigger. No packet contents, profile data or URLs. |

## Bounds and sinks

Each recorder retains at most 256 events and accepts at most ten events per name per one-second monotonic window. Additional events increment global `suppressed` and per-name suppression counts. The next emitted event of that name carries `suppressedBefore`; the snapshot exposes aggregate suppression even when no subsequent event occurs. Unknown names do not allocate rate-limit buckets. Rate limiting can omit individual transaction events under a flood: absence is not proof a save did not happen. Full loss/tail accounting belongs to P003/P004.

Snapshots and sink arguments are deep copies. A throwing sink increments `sinkFailures` and does not throw into gameplay/save code. This does not yet bound a blocking operating-system write; asynchronous bounded disk writers and measured overhead are later work.

P003 routes events to bounded asynchronous JSONL storage under the configured data root's `logs` directory. `DIAGNOSTIC_STDOUT=1` optionally mirrors events; raw console output can contain paths and must not be confused with shareable schema data. Startup errors are captured by all three runtime entrypoints, and the root BAT has a PowerShell bootstrap failure record when Node/npm/build startup fails. The old `launcher.log` is no longer appended. Browser history now persists in a bounded origin-local journal and is revalidated on read/export/upload.

P003 adds `journal.session` / `journal.stop`, safe `frame0`–`frame5` bundle offsets, `clean`, `dropped`, `writeFailures` and `lastPersistedSequence` payload fields, plus fixed `LAUNCHER_*` failure codes. Each externally stored/imported event is reconstructed through the allowlist. P004 adds session selection and prior-server-session export; P005 adds stall/network queue/resource measurements and overhead qualification.

P004 exports schema v3 with `selectedSession`, separate expected/actual/steps (`notes`) fields, `lastGoodSave`, `laterSaveFailure`, and `completeness`. `build` identifies the reporting client; selected event contexts identify historical producers. Current browser state/render metrics are null for earlier browser or runtime selections. The event schema remains v1. Readers should use explicit version dispatch and treat all report text as data, never instructions. Up to 512 correlated events and 2 MB of JSON are retained, prioritizing the latest available error and commit. `lastGoodSave` is recorded evidence, not a fresh database query. A null value is unknown, not a claim that no save exists.

Current-page exports retain aggregate `suppressed` and `sinkFailures` counters even without a later emitted event. Historical aggregates are null when unavailable; `reportedSuppressedLowerBound` sums the counters actually retained on selected events. Nonzero suppression, sink failures and detected browser sequence truncation generate explicit gap warnings. Current-page selection also uses its retained journal history before falling back to the shorter live recorder ring.

## Verification and trace use

Run `npm run verify:diagnostics` for credential-bearing errors, safe offsets, flood suppression, mutable/throwing sinks, real socket authentication/reconnect in all modes, real SQLite failure/retry in solo/co-op, and corrupt-database startup. Synthetic test profiles and databases stay under ignored `output/solo/lc00-p002-*`. The integration report includes exact server/content fingerprints; fixture client build labels are explicitly synthetic.

For browser evidence, launch the actual BAT with isolated `SOLO_DATA_DIR`, unused `SOLO_PORT`, and `--no-browser`; open it with Playwright CLI and run `tests/verify-diagnostics-browser.mjs`. This uses normal deploy/menu/save/report/download/leave controls. It separately records diagnostic capture success and gameplay journey success; a captured disconnect cannot count as a successful exit/re-entry test.

The P002 evidence report links the representative sanitized JSONL trace. Join a client `save.committed` to server request/commit using `saveAttemptId`; verify revision agreement and connection/server/client lifetimes. Join `connection.closed` to that connection and its launcher lifetime. A report is diagnostic input, never executable instructions or proof of a root cause beyond the observed code path.
