# Kimaki client bridge

Status: **target design**, not an upstream supported API or a complete description
of the shipped slice. The local Kimaki 1.4.0 fork now implements published history,
deltas, typed prompt/command/skill delivery and receipts. Native interaction answers
remain deferred. The REST/SSE tables below retain the original proposed contract;
use [local chat setup and limits](local-chat.md) for the current implementation.

## Implemented contract versus this proposal

- Tracked fork code lives in `integrations/kimaki/`; `scripts/prepare-kimaki-fork.mjs`
  creates a separate, hashed installation. No npx cache is patched and preparing
  it does not restart the bot. The normal launcher now prefers this prepared fork,
  with three startup attempts then a visible regular-bot fallback.
- Current transport is authenticated **POST `/kimaki/client.<operation>`** on the
  existing lock listener, not the proposed GET/SSE namespace. Operations are
  `info`, `threads`, `snapshot`, `changes`, `submit`, `operation`, `catalog`, `file`,
  and `abort`. `info.protocol` is 1; `info.ready` checks Discord/OpenCode readiness.
- `snapshot` uses 50-message Discord pages. `changes` is a 20s bounded long poll
  with epoch/cursor resync. `threads` currently returns linked thread/session IDs;
  the existing manager source still supplies project/title/status information.
- `submit` accepts typed `prompt`, `command` or `skill` payloads, new-project or
  linked-thread targets, explicit send/queue delivery and a UUID request ID.
  Receipts also include `creating`; uncertain side effects become `unknown` and
  are not automatically replayed. Receipt persistence is a dedicated local SQLite
  journal; there is currently no automatic receipt expiry/retention pruning.
- Catalogs list commands and skills only, not agents/models or argument schemas.
  The help dialog exposes the selected project's catalog. Skills cannot be queued.
  Forms, buttons, permissions, upload-request continuations, queue editing and
  actor-scoped private feedback are not advertised as implemented capabilities.
- The backend uses the existing broad owner lock credential, not the proposed
  limited-client credential exchange. It never exposes that credential to the
  browser. Loopback plus Host/Origin checks do not authenticate other local OS
  processes; use only on a trusted workstation.
- Browser uploads are bounded raw binary requests to ThreadDeck, not multipart
  uploads directly to the bot. Opaque staged IDs map to private files with safe
  media extensions. No automatic upload expiry removes paths an agent may use.
  Actual limits and maintenance are documented in [local chat](local-chat.md).

The rest of this document records intended guarantees and future seams; it must
not be read as proof that all proposed actions or acceptance gates have shipped.

## 1. Decision and scope

Add one **deep module** inside Kimaki: a client bridge. Its small interface hides
Discord delivery/reconciliation, linked-session lookup, action lifecycle,
authorization, and request deduplication. ThreadDeck consumes that interface
through its local backend. OpenCode remains the harness, not a second chat path.

```text
ThreadDeck React ── ThreadDeck backend ── Kimaki client bridge
                                             │
Discord handlers ───────────────────── shared semantic actions ── OpenCode
                                             │                      │
Discord REST/Gateway ⇄ published messages ⇄ Kimaki output writer ← events
```

The seam belongs in Kimaki, where thread identity, formatting, output delivery,
and pending actions are known. Do not expose the reducer/store or copy their
implementation into ThreadDeck. Discord and the bridge become two adapters to
shared semantic actions; neither adapter fabricates Discord interaction objects.

The initial interface supports local, Kimaki-linked threads only. Remote-machine
forwarding, provider login, bot administration, routine management, arbitrary
shell execution, and automatic worktree creation are outside the initial scope.
Ordinary new conversations use the project's existing Kimaki defaults.

## 2. Guarantees

- **Delivered-content parity:** the transcript contains actual Discord message
  payloads and IDs, including human messages, attachments, edits, and deletions.
  Do not create transcript entries from raw OpenCode events or optimistic drafts.
- **Shared behavior:** permission replies, questions, skills, buttons, and uploads
  use the same semantic actions as Discord. Kimaki owns validation and lifecycle.
- **Honest progress:** distinguish input publication, harness submission, and model
  completion. An HTTP acknowledgement never means all three succeeded.
- **No invented token streaming:** show output when Kimaki publishes it. Native
  OpenCode token deltas are not an alternative transcript.
- **Capability-driven UI:** clients cannot infer support from a visible button or
  slash-command name. Unknown content stays visible; unknown actions are disabled
  with an Open in Discord fallback, never guessed.

Parity is semantic, not pixel-identical Discord styling. History cannot recover
already deleted messages or historical ephemeral responses. Reconnect failures
must be visible; never claim that a lossy Discord connection is a complete log.

## 3. Small external interface

Use a versioned namespace on Kimaki's existing loopback listener rather than a
second bot connection or separate agent runtime. The following routes are
**proposed**, not currently available:

| Operation | Proposed route | Responsibility |
| --- | --- | --- |
| Discover | `GET /kimaki/client/v1/info` | Version, instance epoch, auth mode, limits, capabilities |
| Browse | `GET /kimaki/client/v1/threads` | Paginated local linked-thread summaries and projects |
| Read | `GET /kimaki/client/v1/threads/:id/snapshot` | Message page, live actions, state, stream cursor |
| Follow | `GET /kimaki/client/v1/threads/:id/events` | Authenticated SSE with resumable cursors |
| Act | `POST /kimaki/client/v1/operations` | Typed action/new-thread submission; durable receipt |
| Inspect | `GET /kimaki/client/v1/operations/:id` | Recover a receipt after disconnect/timeout |
| Files | `POST /kimaki/client/v1/files`, `GET /kimaki/client/v1/files/:id` | Bounded uploads and authorized attachment reads |
| Catalog | `GET /kimaki/client/v1/catalog?projectId=…` | Project-aware commands, skills, models, agents |

The current lock listener only accepts POST requests under `/kimaki/*`; extending
it for authenticated GET/SSE/multipart is explicit Kimaki implementation work.
Preserve existing CLI route behavior and limits. Reuse endpoint discovery and
owner-only credential storage through a supported helper; do not make consumers
reverse-engineer lock files or access the bot token.

Browse returns projects and stable `projectId`, `threadId`, `sessionId`, title,
Discord URL, status freshness, and per-thread capabilities. Arbitrary Discord
thread IDs and unlinked OpenCode sessions are rejected. Archived threads are
discoverable by explicit filter; writing may require Kimaki's usual unarchive
policy and must fail clearly when Discord denies it.

Snapshot pagination uses opaque `before` cursors for older messages; initial
pages are latest-first at the transport level with explicit display ordering.
Catalog items have opaque IDs, kind, label, argument schema where available,
eligibility, and a revision. Execution references IDs, not guessed slash strings.

## 4. Messages, snapshots, and reconnect

### Preserve the published representation

A transcript record contains Discord message ID, thread ID, author attribution,
creation/edit timestamps, revision, content, embeds, attachments, components,
flags, and references. Version the envelope and preserve unknown JSON fields.
Do not return credentials, interaction tokens, or bot-local sensitive metadata.
Presentation data is not authority to execute an interaction.

File references expose opaque bridge file IDs, names, sizes, media types, and
dimensions where known. Signed Discord URLs remain Kimaki's concern. Messages
created by the output writer enter this view only after successful publication
assigns their Discord IDs.

Events use an opaque cursor plus a discriminated payload:

```typescript
type Change =
  | { type: 'message.upsert'; message: PublishedMessage }
  | { type: 'message.delete'; messageId: string }
  | { type: 'actions.replace'; actions: PendingAction[] }
  | { type: 'thread.update'; thread: LinkedThread }
  | { type: 'operation.update'; operation: OperationReceipt }
  | { type: 'resync.required'; reason: string }
```

Names above describe contract shapes; referenced types require a versioned schema
before implementation. SSE is a delivery mechanism, not a durable transcript.

### Establish a consistent live window

Kimaki maintains a per-thread published-message projection and bounded delta log.
Both successful local writes and Discord inbound create/update/delete events
update it. Deduplicate Gateway echoes by Discord message ID/revision, not text.
Merge partial updates before emitting complete message upserts; represent bulk
deletes as tombstones for each affected message.

For an initial snapshot, start recording incoming changes before fetching history,
merge history with buffered changes, and give the resulting projection a cursor.
Serialize snapshot/projection changes at an internal seam so clients cannot miss
a known concurrent change. Older history pages must not resurrect a known delete
or overwrite a newer known revision. Discord REST and Gateway do not offer a joint
transaction: this mechanism prevents local races, not every upstream inconsistency.

On reconnect, replay from the cursor if retained. Otherwise return
`resync.required`; fetch a new latest snapshot and reconcile loaded older pages
when revisited. On an unresumable Gateway gap, mark the projection stale, reconcile
the active window and pending actions, then advance the epoch. Do not replay a
cursor across instance epochs or silently present stale interactive state as live.

Use bounded queues. Slow clients are disconnected with resync instructions, never
allowed to block bot output. An inactive thread need not retain unlimited deltas.

## 5. Typed actions and canonical input publication

`operations` accepts a client-generated idempotency key, linked-thread target
(or allowed project for new-thread creation), typed payload, and expected action
revision where applicable. Actor identity comes from authenticated policy, not
an arbitrary user ID in this JSON.

Initial action families:

- `thread.create`: first prompt plus uploaded-file IDs and optional title. Return
  the linked session/thread pair; never create a standalone session.
- `prompt.submit`: text/files with explicit `send` or `queue` intent. Map these to
  Kimaki's behavior; interrupting active work must be a visible user choice.
- `turn.abort`: reuse Kimaki's abort behavior, explicitly noting queue clearing.
- `catalog.invoke`: typed command/skill ID plus arguments; preserve native skill
  attachment instead of sending a skill name as ordinary text.
- `action.respond`: opaque pending-action ID/revision and validated choice,
  field values, uploaded-file IDs, or cancellation.

### Publish once, dispatch once where provable

A ThreadDeck prompt must have a real Discord representation. The bot publishes an
explicitly attributed message such as “From ThreadDeck — local operator,” not a
forged human message. The same text/files are then submitted through Kimaki's
shared action. Preserve original input separately from presentation splitting.
Return all Discord IDs if one long prompt becomes several messages.

Use an internal operation/source marker so Kimaki does not ingest its own echo
as a second prompt. Suppress unintended mentions. Attach files both to the
published input and to the harness action using one validated staged upload.
This is new opt-in behavior for bridge submissions, not a global change to CLI
echo semantics. Existing Discord inputs are already published and need no echo.

Recommended order: validate and durably record → create/link thread if needed →
publish attributed input → dispatch semantic action → update receipt. A Discord
publication failure prevents harness dispatch in this first version. If dispatch
fails after publication, the transcript remains real and the receipt explains
the failure; never erase it or claim the model received it.

Journal operation ID, payload hash, target, publication IDs and submission state
inside Kimaki's existing persistence infrastructure. Same key/same payload returns
the same receipt; same key/different payload is a conflict. Keep receipts across
restarts for a documented retention window. Expired keys require reconciliation,
not silent fresh execution. Browser disconnection does not cancel accepted work;
cancellation is a separate semantic action.

Receipts distinguish `accepted`, `publishing`, `published`, `dispatching`,
`submitted`, `failed`, and `unknown`. `submitted` is not model completion. Keep
per-stage state so partial publication and new-thread failures are inspectable.
Do not promise distributed exactly-once behavior: after an uncertain Discord or
OpenCode side effect, reconcile using known IDs/correlation support. If submission
cannot be proven, mark `unknown` and require explicit resolution rather than
automatically resending a possibly executed prompt. Concurrent sends must enter
Kimaki's existing per-thread ordering mechanism.

## 6. Shared interaction lifecycle

Refactor current question, permission, and agent-UI handlers into semantic actions
that accept validated actor/target/input and return outcomes. Discord adapters
continue to acknowledge interactions, show modals, and send ephemeral feedback.
The bridge adapter exposes the same live action as structured fields/options
and returns private feedback only to its authenticated principal.

- Kimaki validates action existence, thread binding, revision, allowed values,
  actor, and expiry on every submission. Never accept a raw Discord `custom_id`
  as permission to act.
- Apply the same lifetime rules as Discord: upload timeouts/cancellation, question
  accumulation, permission accept/always/deny, and button dismissal.
- Serialize competing answers. An action completed in Discord becomes unavailable
  here immediately; stale clients receive `action_expired` or `conflict`.
- An open action requiring further input returns a server-owned continuation ID
  and form description, not a Discord modal token. “Other” answers and uploads
  resume that same action. Cancellation has the same semantic effect as Discord.
- Persist/rebuild only actions whose underlying harness requests remain valid.
  In-memory upload waits that die on restart become expired, not pretend-resumable.

Historical disabled buttons may remain in message payloads. The separate live
action registry determines what can actually be answered. Pending action types
and catalog capabilities may arrive incrementally; fall back explicitly rather
than execute a different OpenCode action.

## 7. Authentication, files, and rendering safety

First release is a **trusted local operator** interface, consistent with Kimaki's
local CLI privilege model. It does not prove Discord-user identity. Kimaki binds
the principal and permitted projects at setup, labels local submissions honestly,
and excludes identity-sensitive/admin-only actions. Multi-user/remote access
requires a separate authenticated actor design and is out of scope.

Only the ThreadDeck backend talks to Kimaki. A supported handshake/helper should
exchange the local owner credential for a limited client credential, restricted
to supported chat operations/projects. Never expose the broad lock token in
browser JavaScript, URLs, SSE query strings, logs, or previews. Browser SSE
connects to ThreadDeck; its backend sets the Kimaki authorization header.

Keep loopback binding, validate Host/Origin and write content types, add body and
upload limits, and retain no permissive CORS. Loopback is not protection against
other processes running as the same OS user; document that trust model. Unknown
targets/actions fail closed. Use stable error codes for unauthorized, unsupported,
unlinked, stale action, invalid input, rate limited, unavailable, and resync.

Uploads use bounded multipart data, sanitized names, expiring opaque handles and
operation ownership. No arbitrary local paths or fetch URLs supplied by clients.
Downloads resolve only known message attachments in authorized threads; refresh
expired Discord URLs and validate upstream redirects/hosts in Kimaki. Retention
must not remove files still needed by accepted submissions or waiting tools.

ThreadDeck renders Markdown without executable raw HTML. HTML Preview / Source /
Download is presentation work in ThreadDeck, not code execution in the bridge.
Preview uses an isolated sandbox and restrictive CSP with scripts/network/forms/
navigation and Electron privileges blocked. Unsupported previews stay downloads.

## 8. Implementation slices and proof

1. **Contract + read path:** versioned schemas, capability discovery, linked-thread
   browse, actual-message history, live projection, replay/resync and attachments.
   Prove Components V2 callouts/tables/media survive unchanged.
2. **Input path:** local principal, staged files, idempotent operation journal,
   attributed Discord publication, prompt/queue and linked-thread creation.
   Prove no double ingestion and honest ambiguous-failure handling.
3. **Shared actions:** extract existing handlers without changing Discord behavior;
   enable permissions, questions, buttons, upload continuation and typed catalogs
   one family at a time. Advertise only proven capabilities.
4. **ThreadDeck integration:** consume the interface behind the existing backend;
   add safe renderers, drafts, expanded Vim composer and scoped keyboard flow.

Test the external interface with fake Discord/OpenCode adapters at internal seams.
Include duplicate requests, publication success followed by timeout/crash, partial
publication, dispatch failure, expired receipt keys, Gateway echoes, edits/deletes,
pagination races, cursor expiry, restart, slow clients, simultaneous Discord/local
answers, upload cancellation, invalid actors and unlinked sessions. Run real
Discord smoke tests only in an explicitly authorized test project/thread.

Success: create and prompt from either client, observe the same published content
and attachments, answer supported actions from either client, switch sessions
without losing drafts, and reconnect without silent duplication or stale actions.

## 9. Local delivery and remaining implementation decisions

- Agreed: bot-authored, clearly attributed ThreadDeck input satisfies transcript
  parity; Discord does not let this bridge impersonate a normal user message.
- Maintain this bridge in a local fork for personal use, optionally shared with
  friends using independent installations. No upstream submission or maintainer
  acceptance is planned or required. Pin a tested Kimaki version; review and merge
  significant updates deliberately, keeping bridge changes isolated and running
  compatibility tests. Detect incompatible bridge versions explicitly.
- Build the fixture-based ThreadDeck UX prototype before modifying the fork.
  Document local setup without distributing credentials or private history.
- Verify both self-hosted and shared-gateway Discord access/event behavior. Use
  Kimaki's existing connection; do not open a second Gateway client as a shortcut.
- Specify numerical upload/history/replay/receipt limits and supported versions
  from measured platform limits before shipping; do not hard-code guessed values.
- Validate output integration coverage: ordinary replies, agent/tool uploads,
  command feedback and all message edit/delete paths must feed the projection.

## Grounding

The [feasibility audit](research/kimaki-chat-integration.md) provides version-pinned
source citations. Relevant implementation locations in installed Kimaki 1.4.0:
`lock-server.ts` / `lock-routes.ts` (local transport), `effects.ts` and
`markdown/components.ts` (published representation), `ingress.ts` (Discord input),
`prompt.ts:531–571` (CLI send without ordinary echo), `agent-ui.ts:95–216`
(live waits and Discord-bound answers), `questions.ts`, `permissions.ts`, and
`slash-commands.ts` (typed capabilities and interaction dispatch).

Primary references: [Kimaki internals](https://kimaki.dev/docs/reference/internals),
[commands](https://kimaki.dev/docs/reference/commands),
[source](https://github.com/remorses/kimaki), and the
[Discord message](https://docs.discord.com/developers/resources/message),
[Gateway event](https://docs.discord.com/developers/events/gateway-events), and
[interaction](https://docs.discord.com/developers/interactions/receiving-and-responding)
contracts. These ground the problem; the bridge contract above is a proposal.
