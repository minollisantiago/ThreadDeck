# Kimaki chat integration: receive-side feasibility

Investigated: 2026-10-23. **Installed Kimaki 1.4.0 is the authority for this assessment**, not a hypothetical API or current upstream main. Scope: ThreadDeck is a UX layer over Kimaki, OpenCode remains the harness, and only Kimaki-linked sessions are eligible.

## Decision

**NO-GO for a complete, faithful, interactive chat replacement using only the installed supported Kimaki interfaces.** Kimaki has supported automation commands and a real localhost command IPC, but no exposed Discord-history API, message-change subscription, or client action submission API. `session read`, transcripts, and recorded events are OpenCode data, **not the messages Discord actually shows**. Re-rendering them would violate the requirement. [S1–S5]

**GO for a limited control panel with “Open in Discord.”** Existing linked sessions can receive prompts and selected commands through Kimaki; Discord remains the authoritative conversation and interaction UI. **Conditional GO for a native chat after an upstream Kimaki bridge is available**, or for a separately authorized read-only Discord mirror with explicit limitations. Neither exception should be silently presented as full parity. [S2–S9]

“Exactly Kimaki/Discord content” should mean parity with actual published message payloads, ordering, edits, attachments and interactive state—not a second rendering of model messages. Pixel-identical Discord rendering is a separate, stronger requirement that a custom renderer cannot promise. A channel history is also not the user's complete interaction UI: modals and ephemeral responses require a separate, actor-scoped channel. [S6–S10, D1, D3]

## Evidence and safety

- Inspected the installed `src` implementation shipped alongside `dist`; the package explicitly ships both and identifies `dist/cli.js` as its executable. Also executed **only** `node /home/santiago/.npm/_npx/01ccfd0419791eec/node_modules/kimaki/dist/cli.js --help`, which confirmed command discovery without starting a bot. [S1]
- No bot/session start, restart, live API requests, credential retrieval, or user history reads were performed. Upstream public docs were fetched read-only. This is implementation research, not a successful runtime integration test.
- Local citations below expand `K` to `/home/santiago/.npm/_npx/01ccfd0419791eec/node_modules/kimaki`. Line references are to that installed package. Upstream documentation is supplementary and may move ahead of version 1.4.0.

## Interface inventory: supported versus internal

| Capability | Installed surface | Status and consequence |
| --- | --- | --- |
| Discover public commands | `kimaki --help`, `kimaki <command> --help`; official commands reference | Supported user/automation surface. No chat history/watch/action-answer command appears. [S1–S3, U2] |
| Local command IPC | `POST http://127.0.0.1:<KIMAKI_LOCK_PORT>/kimaki/<route>`; default port 29988; bearer lock token | Real first-party CLI-to-bot implementation, **not evidence of a stable third-party chat SDK**. Prefer CLI for supported writes; a direct adapter must pin/version-check this internal protocol. [S4, U1] |
| Health | `GET /health` | Unauthenticated health/PIDs only; not a message API. [S4] |
| Thread discovery | `thread list --channel … --archived --json` | Supported command calling Discord REST directly. Lists active/public archived threads, not thread messages, and does not establish that every result has a local session binding. [S3] |
| Linked-session discovery | SQLite `thread_sessions`; in-process `store.roots` / `sessionThreads` | Existing mappings, **internal schema/state**. No dedicated public `linked-session list` IPC. `session list --all --json` reads OpenCode sessions, not only linked sessions. [S2, S11] |
| Discord thread history | None in CLI or lock route table | Discord itself has `GET /channels/{threadId}/messages`, but this is a Discord API, not an exposed Kimaki API. [S2–S4, D1] |
| Live published messages/edits/deletes | None exposed to clients | Kimaki internally uses discord.js Gateway events and writers; no lock-server SSE/WebSocket subscription exists. Discord Gateway supports create/update/delete/bulk-delete events. [S4, S6, S12, D2] |
| Attach files to a prompt | `send --session/--thread … --file …` | Supported input; files become local file URIs. This is agent input, not proof that a matching user attachment message was posted to Discord. [S5, S13] |
| Publish agent/output files | `upload-to-discord … --session …` → `upload` IPC | Supported. Uses actual Discord uploads and Components V2 media/file layout. No receive/download proxy is exposed by Kimaki. [S3, S6, S13] |
| Show agent action buttons or upload request | `buttons`, `upload-request` → same-named IPC routes | Supported **creation** APIs. Not APIs to click, answer, submit files, or discover pending actions. [S3, S7] |
| Answer buttons/forms/permissions | Discord component/modal interactions | Internal handlers consume real Discord interaction objects and bot-local pending state. No equivalent lock routes. [S7–S10] |
| Arbitrary published-message edit/delete | No Kimaki CLI/IPC | Internal Discord operations exist, including question updates and queued-message edit/delete ingress behavior. They do not expose general message CRUD to ThreadDeck. [S6, S8, S12] |

### Actual IPC semantics

The server binds `127.0.0.1`; `/kimaki/*` requires `Authorization: Bearer <lock-token>`, accepts only POST, limits input to 1 MiB, parses JSON, aborts the handler on response disconnect, and returns one JSON result. The handler's internal `{ data }` wrapper is **unwrapped on the HTTP wire**: success is `result.data`, error is `{ error }`. Most CLI calls default to a 30-second timeout, with explicit longer calls for uploads and waits. This is request/response, not outbound streaming. The file containing the token is owner-only; keep credentials in the backend and never expose this broadly privileged port to a browser or tunnel. [S4]

The lock route table is exhaustive at runtime (`runLockRoute` rejects unknown names). It contains send/upload/status, process and credential operations, routines/sleep, UI creation, channel/worktree preferences, session operations and queue operations. It contains **no history, subscribe/watch, component click, form answer, permission answer, or modal-submit route**. This negative finding is bounded to the inspected installed version. [S4]

## Why OpenCode data cannot satisfy receive-side parity

1. `session read --json` explicitly prints raw OpenCode messages; ordinary `session read` renders OpenCode markdown. `session events` streams a recorded OpenCode/Kimaki thread-event JSONL file, not Discord message objects. `session list` obtains all OpenCode sessions and native status/forms/permissions. A Kimaki-named CLI command does not make these Discord content. [S2]
2. `createEventLoop` folds events into a private thread view, then calls `effects.run`. Recording occurs **before** output execution. These records cannot prove a Discord send succeeded or capture assigned Discord message IDs, payload merging, subsequent external edits or deletions. [S6, S14]
3. `createEffectsRunner` batches adjacent bot lines, computes the footer's current git branch at send time, splits markdown into Discord payloads, and sends actual Discord messages. Interactive message IDs are held in a process-local prompt map. Replaying reducer events elsewhere will not reproduce the actual message identities/boundaries or restart behavior. [S6]
4. In this implementation, assistant text is published on **`session.text.ended`**, not as token-by-token Discord text edits. ThreadDeck must not invent token streaming from OpenCode deltas; “streaming” here should mean progressively receiving what Discord actually publishes, including later edits. [S15, S6]
5. Tables and callouts are transformed into Components V2 containers/TextDisplays/separators with accent colors and packing limits. Output uploads use media galleries or file components, ordered and sometimes numbered. Showing only `message.content` loses real visible content. [S6, S16]

Do not use logs as the transcript either: the documented log file resets at each bot start, while recorded events are explicitly OpenCode events. [U1]

## Interactions are the hard blocker

- **Agent buttons:** `createAgentUi.request` dispatches a prompt into the linked thread. Clicking looks up the bot's live prompt, dismisses it, then calls `send` with the chosen label and Discord user identity. Upload buttons open a Discord modal; submission downloads the resolved uploaded files, writes them under the session directory and settles an in-memory waiting call. Simply sending the label text or calling `upload-to-discord` does not perform that lifecycle. [S7]
- **Questions/forms:** Kimaki renders supported string/multiselect/boolean fields as dropdown messages. “Other” opens a text modal. Answers accumulate in a closure until complete, acknowledge/update the original UI, then call OpenCode `session.form.reply`. Unsupported number/external/conditional/pattern forms are intentionally not shown. ThreadDeck must mirror what Kimaki shows, not add its own raw OpenCode form UI. [S8]
- **Permissions:** Accept / Accept Always / Deny resolve a pending request in the thread and call `permission.reply`; the replied event removes the buttons. There is no Kimaki answer IPC. Calling OpenCode directly would cross the “Kimaki-only UX layer” boundary and bypass the existing action path. [S9]
- **Identity/access:** the Discord dispatcher checks project ownership, guild membership/access and admin-only features before routing interactions. A local HTTP write is a privileged local automation capability, not a Discord user authentication mechanism. Client-supplied `--user` is not identity proof. [S10, S5]
- Discord documents how apps **receive** interactions and **respond** to an existing interaction ID/token. It does not supply a documented bot API for ThreadDeck to originate a user's button click merely from a `custom_id`. Do not use undocumented user endpoints, self-bot credentials, forged Discord interactions or fake discord.js objects as the integration design. Modal payloads and actor-only ephemeral responses are not reconstructible from public channel history alone. [D1, D3]

## Available writes and command/skill discovery

### Useful supported writes for already-linked sessions

Use the pinned installed entrypoint through `execFile`/argument arrays, not interpolated shell commands. Examples are illustrative; none was run:

```text
node <K>/dist/cli.js send --session <linked-session> --prompt <text> [--file <local-path>]
node <K>/dist/cli.js session abort <linked-session>
node <K>/dist/cli.js session title <title> --session <linked-session>
node <K>/dist/cli.js session archive <linked-session>
node <K>/dist/cli.js session queue add <text> --session <linked-session>
node <K>/dist/cli.js session queue remove <inbox-id> --session <linked-session>
node <K>/dist/cli.js session queue clear --session <linked-session>
node <K>/dist/cli.js session command <name> <args...> --session <linked-session> [--queue]
node <K>/dist/cli.js session shell <command> --session <linked-session>
node <K>/dist/cli.js session cwd [directory] --session <linked-session>
node <K>/dist/cli.js upload-to-discord <files...> --session <linked-session>
```

The parser supports steer by default, `. queue`, `. btw`, `!shell`, and `/command arguments`. Fork/btw create a **new linked thread**, so require an explicit UI decision if “only linked sessions” means no creation at all. Likewise do not silently expose `session resume`, channel/project `send`, worktree creation, notification threads or scheduled creation as existing-session actions. Other available supported commands include channel model/agent/verbosity preferences, worktree management, routine management, sleep, UI creation, and provider credential administration; they should not all become default chat toolbar actions. [S2–S5, S13, S17, U2]

**Important send caveat:** local `send` into an existing thread assigns a synthetic message ID and does not create a normal Discord user message. Its `echo` is set for scheduled tasks, not ordinary CLI sends. Prompt metadata carries that echo only when supplied. Do not append an optimistic “user message” to the authoritative Discord transcript unless a corresponding Discord message actually exists. A full bridge needs an explicit, canonical input-publication contract. [S5]

### Discovery limits

- Static CLI action discovery is supported via help; the official command reference also describes fixed Discord slash commands. Installed help was verified. [S1, U2]
- Kimaki internally calls OpenCode `agent.list`, `command.list`, `skill.list`, filters built-in skills, builds guild slash commands and refreshes them on catalog events/reconnect. Discord shortcuts are capped at 100; project-aware `/command` and `/skill` autocomplete retain full catalog access. There is **no equivalent CLI/lock catalog-list endpoint** in this version. Do not hard-code the global shortcut list as the complete per-project catalog. [S18, S4]
- The CLI advertises `session command` for commands/skills/MCP prompts, but the actual local path checks `command.list`; if absent, it sends `/name args` as plain prompt text. Discord's explicit skill path instead attaches a skill ID to `session.prompt`. Therefore do not promise that typing a skill into `session command` is equivalent to a real `/<skill>-skill` selection. A bridge should expose Kimaki's typed skill action and project-scoped catalog, not have ThreadDeck call the harness directly. [S17, S18]

## Discord APIs: useful fallback, not an existing Kimaki bridge

Discord's supported message-history endpoint returns actual message objects newest-first with before/after/around pagination (1–100 per page). It requires channel/history permissions. Objects include content, embeds, attachments, flags, references and components; Message Content intent restrictions can redact the fields the UI needs. The Gateway exposes message create/update/delete/bulk-delete events. These are the correct data level for a faithful **published channel transcript**, provided access, intent and reconnection requirements are met. [D1, D2]

Kimaki already resolves credentials and routes REST differently in self-hosted versus shared-gateway mode. Gateway credentials target the proxy, not discord.com. Its CLI `discordApi`/`createApi` helpers are internal code, not a new public history endpoint. Sharing a bot token or opening a second Gateway client must not be assumed to be a safe/supported receive integration: shared-gateway multi-client behavior was not verified here. No credential extraction or second connection was attempted. [S19]

A backend-owned Discord REST mirror could provide a limited read-only transcript without changing Kimaki. Polling only `after=<last-id>` misses edits and deletes; a robust mirror needs Gateway deltas or explicit reconciliation, pagination, message-ID deduplication, partial-update handling, delete tombstones and reconnect recovery. History also cannot recover already-deleted messages or actor-only modal/ephemeral state. These are engineering implications of the documented history/event/interaction contracts, **not APIs Kimaki currently provides**. [D1–D3]

## Smallest recommended strategy

### Now, without changing Kimaki

1. Ship only a **linked-session control surface** and “Open in Discord” using `session url`. Avoid promising native chat parity. Use public CLI writes with an allowlist and no bot start/restart fallback. [S2–S5]
2. If a local binding adapter is acceptable, read only needed columns of `thread_sessions` and `channel_directories`, read-only, version-gated; never read bot credential tables into frontend state. This is internal-schema coupling, not a supported linked-session API. Fail closed on missing/mismatched bindings. Do not enumerate/display all OpenCode sessions as Kimaki sessions. [S2, S11]
3. If a separately approved read-only Discord mirror is desired, explicitly label its scope and keep interactive controls opening Discord. It is a distinct integration decision and still not the requested complete native chat. [D1–D3]

### To unlock complete native chat: ask upstream for one narrow bridge

The following is a **proposed contract**, not existing endpoints. Keep Kimaki as the renderer/router and OpenCode as the harness:

- **Linked-thread list** scoped to the local Kimaki instance, with stable session/thread/project identities and capabilities.
- **Paginated actual Discord-message snapshot + resumable delta stream** for allowlisted linked threads. Include successful published message objects/IDs, creates, edits, deletes/bulk deletes, attachments, Components V2, typing and thread metadata. Establish a snapshot cursor/sequence and replay/reconciliation rules. Capture Discord inbound changes too—not only reducer effects or the output writer—because edits, deletions and human messages can originate elsewhere. [S6, S11, S12, S14, D1, D2]
- **Typed action submission** that validates an authenticated actor and current thread/message/action identity, then reuses Kimaki's semantic handlers for buttons, selections, form answers, permissions and file submissions. Refactor shared action logic inside Kimaki rather than fabricate a Discord `Interaction`. Include modal-open/submit/cancel and actor-scoped ephemeral feedback; channel history alone is insufficient. [S7–S10, D3]
- **Canonical input publication** with idempotency and returned Discord message identity, covering text and attachments. Distinguish published message, delivered prompt and pending/draft state; never manufacture transcript entries from CLI acknowledgements. [S5, S13]
- **Project-aware command/skill/action catalog**, using the same filters and typed routing as Kimaki, plus explicit capability/version negotiation. [S17, S18]
- Local authenticated backend access only; per-thread authorization, opaque action identifiers, stale-action checks and attachment URL refresh/proxy behavior. Preserve received payloads; render content/embeds/components rather than reinterpret agent messages. [S4, S7–S10, D1]

Start with the snapshot/delta seam and typed actions for the existing question/permission/agent-UI families. Do **not** fork the entire reducer into ThreadDeck or add a second OpenCode transport. Upstream implementation is future work and was not performed here.

### Acceptance gate

Before calling native chat complete, demonstrate: identical published messages and boundaries; callout/table containers; mixed/numbered file and media output; multiple-field question answers and “Other” modal; permission accept/always/deny; action-button dismissal; upload-request resolution/cancellation; edits and bulk deletes from outside ThreadDeck; reconnect/restart recovery; no duplicate input echo; no unlinked-session exposure; no credentials in frontend/log output. If ephemeral responses/modals are in scope, prove actor-scoped parity too. The current installed supported surface cannot pass these gates. [S2–S19, D1–D3]

## Source index

Local references (`K` is the absolute installed package root defined above):

- **S1:** `K/package.json:2–15,21–23` (version, repository, bin, shipped source and OpenCode dependencies); `K/src/cli.ts:9–51` (all command registration and help).
- **S2:** `K/src/cli/session.ts:35–66` (`registerSessionQueryCommands`, all-session reads); `:136–147` (`session url`); `:150–211` (`registerSessionActionCommands`); `:214–251` (`session events`, `session read`, cwd).
- **S3:** `K/src/cli/discord.ts:32–52` (`registerAgentUiCommands`); `:56–84` (`thread list`); `:102–115` (`upload-to-discord`).
- **S4:** `K/src/lock-server.ts:1–10,52–67,123–167,180–185,203–232` (`startLockServer`, `callBot`); `K/src/lock-routes.ts:270–609,617–625` (complete `lockRoutes`, `runLockRoute`); `K/src/main.ts:199–200` (route-prefix dispatch).
- **S5:** `K/src/prompt.ts:54–105` (`promptIdForMessage`, `prompt` echo/metadata); `:531–571` (`send` identity, binding validation and echo behavior).
- **S6:** `K/src/effects.ts:1–14,40–69,93–120,131–199,230–300,311–316` (`createEffectsRunner`, footer, publication, components, prompt-ID map and batching).
- **S7:** `K/src/agent-ui.ts:40–47,95–135,137–177,191–216` (`AgentUi`, `createAgentUi`, `submitUpload`, `clickAgentButton`, `agentUiRoutes`).
- **S8:** `K/src/questions.ts:1–15,82–100,108–147,173–203,215–300` (`questionFields`, `questionMessage`, `showForm`, `closeForm`, `createQuestionHandlers`).
- **S9:** `K/src/permissions.ts:53–64,75–97,103–121` (`requestMessage`, `showPermission`, `closePermission`, `handlePermissionButton`).
- **S10:** `K/src/slash-commands.ts:447–487` (`adminOnly`, interaction `handle`, `InteractionCreate` registration).
- **S11:** `K/src/schema.ts:1–4,30–57` (`thread_sessions`, credential schema and `channel_directories`); `K/src/store.ts:1–26` (`State`, `createBotStore`).
- **S12:** `K/src/ingress.ts:291–343` (`registerIngress`, message create/delete/update listeners and queued-message semantics).
- **S13:** `K/src/cli/schedule.ts:12–72` (`registerSendCommand`, file URIs and remote fallback); `K/src/prompt.ts:644–663` (`upload`).
- **S14:** `K/src/event-loop.ts:1–15,118–128,156–173` (`fold`, `deliver`, recorder before effects).
- **S15:** `K/src/thread-reducer.ts:350–378` (`session.step.started`, `session.text.ended`).
- **S16:** `K/src/markdown/components.ts:1–6,21–24,65–102` (`DiscordPayload`, `containers`, `segmentPayloads`, `markdownPayloads`).
- **S17:** `K/src/routes.ts:11–17,30–48` (`Route`, `parseTextMessage`); `K/src/prompt.ts:274–317,320–365` (`command`, `runInSession`); `K/src/lock-routes.ts:547–553` (`session.command`).
- **S18:** `K/src/slash-commands.ts:160–230` (`Catalog`, `readCatalog`, `catalogRoutes`); `:244–303` (`buildCommands`, shortcut cap); `:492–529` (`registerAll`, catalog refresh).
- **S19:** `K/src/credentials.ts:1–15,44–66,76–93` (`gatewayUrlsFromEnv`, `restApiUrl`, credential modes); `K/src/cli/shared.ts:75–90,101–115` (`readClient`, `resolveTarget`, `discordApi`); `K/src/main.ts:104` (Discord intents).

Verified upstream URLs (fetched during this investigation; not version-pinned substitutes for installed code):

- **U1:** [Kimaki Internals](https://kimaki.dev/docs/reference/internals): shared OpenCode service, lock port, SQLite, attachments, events and log lifetime.
- **U2:** [Kimaki Commands Reference](https://kimaki.dev/docs/reference/commands): public CLI, slash commands and message shortcuts. [Repository](https://github.com/remorses/kimaki), also identified in installed `package.json`.
- **D1:** [Discord Message Resource](https://docs.discord.com/developers/resources/message): “Message Object,” “Attachment Object,” flags, and “Get Channel Messages” (permissions, ordering and pagination).
- **D2:** [Discord Gateway Events](https://docs.discord.com/developers/events/gateway-events): Message Create/Update/Delete/Delete Bulk and Gateway payload/resume model.
- **D3:** [Discord Receiving and Responding to Interactions](https://docs.discord.com/developers/interactions/receiving-and-responding): interaction object, component/modal data, ephemeral responses, callback and token lifetimes; this documents receiving/responding, not a bot-originated user-click API.
