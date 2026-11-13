# Kimaki schedules: integration research

Research only, 2026-11-08, checkout `main`. No application implementation, UI
mockups, schedule reads against the live database, schedule mutations, bot
restarts, credential reads, network API calls, or critique were performed.
Executable inspection was limited to CLI `--help`; all behavior below is verified
from local primary source, not a live scheduling experiment.

## Recommendation

Build on Kimaki's **routines**, not a second scheduler. The pinned **1.4.0** fork
already supports structured list, create, edit, run-now and delete. It does **not**
provide routine pause/resume, a full-detail read endpoint, or a run-history API.
Treat those as unavailable, not implicit future controls. [K1, K2, K3]

The safest complete integration is a narrowly typed, capability-gated extension
of the existing local ThreadDeck bridge, calling Kimaki's scheduler functions
inside the owning bot. That extension is **proposed, not present**. A smaller
read-only MVP can invoke the explicitly resolved pinned CLI's
`routine list --json`, with the limitations below. Never write Kimaki's SQLite
tables from ThreadDeck or expose its administrative lock API to the browser.
[T1, T2, T3, K1, K4]

## Version and installation boundary

- `scripts/prepare-kimaki-fork.mjs:13–24,33–39,53–60,85–89` pins `kimaki@1.4.0`,
  checks the baseline version, makes an immutable hashed copy, and adds the
  `client.*` dispatch seam without replacing native lock routes. Preparation is
  not activation. This matches `docs/local-chat.md:157–180`. [T1, T4]
- The inspected non-secret manifest,
  `/home/santiago/.local/share/threaddeck/kimaki-fork.json:1–6`, selects
  `fork-1.4.0-b42c6be4b8364606/dist/cli.js`, protocol 1. The installed executable
  shim `/home/santiago/.kimaki/bin/kimaki:1–3` points to that same fork and exports
  its data directory. This establishes the prepared/default CLI, **not the
  identity or health of a currently running process**. [L1, L2]
- Byte comparison confirmed the baseline and selected fork have identical
  `src/{scheduler.ts,schema.ts,cli/schedule.ts,lock-routes.ts,lock-server.ts}`
  and `dist/{scheduler.js,cli/schedule.js,lock-routes.js,lock-server.js}`.
  `K` below denotes that baseline's source; these scheduling semantics also apply
  to the selected fork. Package metadata identifies version, executable and
  upstream repository. [K0]
- The old npx cache path used in earlier research now contains **1.6.0**, not
  1.4.0. Its routine command surface and list/state logic remain the same in the
  inspected files. The scheduler diff adds coordinator-channel target resolution
  at `N/src/scheduler.ts:423–430`; the schema adds a coordinator table. Its send
  CLI has different wait behavior. Do not silently substitute cached/latest
  Kimaki for the pinned CLI. [N0, N1, N2, N3]
- `scripts/kimaki-launcher.mjs:11–23` checks manifest protocol/version/path;
  existing chat transport independently talks to the running lock listener.
  Therefore a manifest alone is insufficient for runtime capability detection.
  [T2, T3]

## Verified command and API capability matrix

All examples below describe supported commands; **none was executed without
`--help` during this research**. `task` is a hidden backwards-compatible alias
for `routine`. [K1:75–135]

| Capability | Verified interface | Important limit |
| --- | --- | --- |
| List | `kimaki routine list --json [--all] [--data-dir PATH]` | Reads the local DB directly; does not require a running bot or contact its lock API |
| Create | `kimaki send --send-at VALUE --prompt TEXT` plus exactly one channel/project/thread/session target | No `routine create` command; scheduling requires the local owning bot |
| Edit | `kimaki routine edit ID` with explicitly supplied change flags | Only `planned`; no target/name/worktree/permission editing |
| Run now | `kimaki routine run ID` | Only claims `planned`; executes the occurrence, not an independent test run |
| Delete | `kimaki routine delete ID` | Hard delete; not pause, cancel-current-turn or reversible archive |
| Pause/resume | **Absent** in inspected routine commands, schema and native route table | `session resume` is unrelated; do not implement a fake pause by deleting/recreating |
| Details/history | **Absent** as routine commands/native routes | List is a lossy summary; `--all` is legacy row visibility, not execution history |
| Timezone selection | **Absent** for create/edit | New/edited schedules use UTC; legacy cron rows can retain another timezone |

Sources: command registration [K1:12–72,75–151], scheduler [K2:219–264,407–530],
schema [K3:127–151], native route schemas and exhaustive dispatcher
[K5:64–121,270–276,333–360,611–625]. CLI help confirmed root, `routine`,
`routine list/edit/run/delete`, `send`, and `sleep`; cached 1.6.0 `routine --help`
also lists only the four routine subcommands. [H1]

### Structured list contract

`routine list --json` prints an unwrapped JSON array; empty means `[]`. Its item
contract is exactly: [K1:84–105; K2:219–264]

```ts
type RoutineSummary = {
  id: number
  status: 'planned' | 'running' | 'completed' | 'cancelled' | 'failed'
  schedule: string
  nextRunAt: string // ISO UTC timestamp, also present on failed/legacy rows
  prompt: string   // preview, NOT the full saved prompt
  channelId: string | null
  threadId: string | null
  agent: string | null
  model: string | null
  userId: string | null
  preRun: string | null
  allowConcurrency: boolean
  lastError: string | null
}
```

- Defaults to `planned`, `running`, `failed`; `--all` also includes retained
  `completed`/`cancelled` V1 rows. Sorted by `next_run_at`, then ID. No CLI
  project/guild/status filter, pagination, subscription or watch flag exists.
  Discord's `/routines` uses the same function with a guild filter and displays
  at most seven rows; that is not a CLI limit. [K1:84–106; K2:235–264,534–559]
- `schedule` is a display string: `once`, `cron EXPRESSION`, or
  `cron EXPRESSION (LEGACY_TIMEZONE)`. There are no separate JSON
  `scheduleKind`, `cronExpr`, `timezone`, `runAt`, full payload, last-run time,
  attempt count, last session ID, or revision fields. [K2:219–264]
- `prompt` collapses whitespace and truncates to 120 characters (117 plus `...`).
  **Do not prefill an edit form with it**: saving would silently destroy the
  original prompt. List `threadId` is the decoded target thread, not the last
  thread created by a channel routine. [K2:193–196,245–261,354–362]
- Invalid payload decoding does not fail the whole list: decoded fields fall
  back to null/false while preview/status/error remain. Missing decoded data is
  not proof that an option was never configured. [K2:245–262]
- List uses `openCliDb(...migrate:false)` against the chosen data directory and
  can work while the bot is offline. It must not be presented as proof that the
  scheduler is running. Even this nominal read opens libSQL with WAL/busy-timeout
  setup and mkdir/chmod behavior; it is not a pure filesystem read. Missing DB or
  tables fail rather than migrate/create the DB. [K6:31–33,57–66; K7:39–75]

## Stored schema and meaning of states

The `scheduled_tasks` table retains V1's internal “task” terminology. Columns:
`id`, `status`, `schedule_kind`, `run_at`, `cron_expr`, `timezone`, `next_run_at`,
`running_started_at`, `last_run_at`, `last_error`, `attempts`, `payload_json`,
`prompt_preview`, `channel_id`, `thread_id`, `session_id`, `project_directory`,
`created_at`, `updated_at`. Dates use the schema's datetime helper. There is no
paused/enabled field and no separate run-history table in the inspected schema.
[K3:127–151,153–179]

`payload_json` carries full prompt and target kind (`channel`/`thread`), agent,
model, one user, permissions, parent session, shell pre-run command, concurrency,
and channel-specific name/cwd/worktree/base-branch/notify-only settings. Legacy
`username` and `injectionGuardPatterns` are preserved but unused. Scheduled files
are not supported. [K2:96–190,407–411]

| State/transition | Actual meaning |
| --- | --- |
| `planned` | Eligible to claim when due, or immediately via Run now |
| `running` | Scheduler has claimed this occurrence and is checking busy/pre-run/dispatch; **not** the AI turn's entire lifetime |
| Cron success | Returns to `planned`, advances next run, clears last error and stores last session/thread when a session was created/returned |
| Cron dispatch error | Returns to `planned` at the next occurrence, records `lastError`, increments `attempts`; can be planned **and** have an error |
| One-shot dispatch error | Retained as `failed`; edit/run cannot claim it because it is not planned |
| Successful one-shot | Row is deleted, not marked completed |
| Pre-run nonzero/timeout | Skips occurrence: cron advances, one-shot is deleted; not necessarily a failed row |
| Previous session busy | Concurrency disabled: cron skips to next occurrence; one-shot stays due/planned for a later tick |
| `completed`, `cancelled` | Legacy persisted statuses visible with `--all`; current success/delete paths do not create them |

Sources: claim/finish [K2:289–387], pre-run [K2:271–287], legacy list
[K2:235–241]. `attempts` increments on execution errors, not every successful run;
it is not a completed-run count. `last_run_at` also records dispatch errors and
cron skips through the normal finish path, so is not proof of AI success.
[K2:331–362]

### Create, edit, run and delete semantics

**Create:** exactly one target is required: `--channel`, `--project`, `--thread`
or `--session`. Project/channel must be registered on the owning machine;
thread/session schedules require a locally linked session. Create resolves and
stores channel/thread/project ownership, returns
`{ routineId, schedule, nextRunAt }`, and does not run immediately. Note the
create response's cron `schedule` is the raw expression, unlike list's `cron …`
display string. New concurrency defaults false. No scheduled attachments; one
user only; model syntax `provider/model`. `--notify-only` requires a channel or
project; permissions are for new sessions, not thread/notification targets.
Worktree/base-branch validation is shared with send. [K5:69–121;
K2:407–464]

**Edit:** accepts only `prompt`, `sendAt`, `agent`, `model`, `user`, `preRun`,
`allowConcurrency`. At least one field is required. Omission preserves a value;
empty string clears optional agent/model/user/pre-run values, but empty prompt
or schedule is invalid. Supplying `sendAt` can switch one-shot/cron and recomputes
the next run in UTC. It does not clear a saved `lastError`. A conditional update
rejects the race where the routine started running after it was read, but there
is no client revision/ETag protection against two planned-row edits. Native IDs
must be positive safe integers. [K1:108–124; K5:64–65,333–352; K2:466–509]

**Run now:** uses the exact claim/execute/finish path as a scheduled run,
ignoring due time but still requiring `planned`. It respects concurrency and
pre-run checks; returns `{routineId, ran:false, reason}` for busy/skipped, or
`{routineId, ran:true, threadId, sessionId}` after dispatch, with nullable session
for notifications. It consumes a one-shot and recalculates a cron's next run
from the claim time. It does not wait for model completion. CLI timeout is
12 minutes because pre-run alone can take 10 minutes. [K1:126–133;
K2:271–287,365–387,520–530]

**Delete:** unconditionally hard-deletes an existing row, including a running or
failed row; unknown ID errors rather than returning success. A post-pre-run
recheck can prevent dispatch if deletion happened in time, but deletion cannot
undo a dispatch already underway and does not abort the model session or shell
command. Do not promise “stop current run.” [K2:277,305–326,511–518]

**No automatic replay:** native create/edit/run/delete have no request-id receipt
or deduplication protocol. Claims prevent concurrent execution of the same
planned occurrence, not repeated Run-now requests across subsequent cron
occurrences. A lost response can follow successful creation/dispatch/deletion.
The task route handlers ignore the supplied abort signal, so disconnect/timeout
is not reliable cancellation. Never blindly retry writes. Existing chat receipts
apply to chat submission only, not routine operations. [K5:333–360;
K2:365–387,407–530; T5:96–141]

## Time, next-run and history behavior

- New/create-edited one-shots require future UTC ISO text ending in `Z`; offsets
  and local datetimes are not accepted. Validation compares with the **bot's**
  clock. New/create-edited cron is evaluated in UTC. Existing V1 rows can carry
  an IANA timezone used for execution; changing their schedule resets it to UTC.
  [K2:59–93,445–452,494–500; K8:27–37]
- Kimaki delegates syntax to `cron-parser`, without strict mode or a timezone
  flag. The resolved dependency here is **5.10.2** (Kimaki declares `^5.5.0`).
  Its parser accepts five-field cron, six fields including seconds, and macros
  such as `@daily`; it even fills omitted leading fields in non-strict mode.
  This is broader than a five-field UI. Recommend common five-field presets
  plus backend-authoritative validation, not a new incompatible parser. Do not
  promise second-accurate dispatch just because seconds parse. [K0:25;
  K2:61–93; C1:1–7; C2:8–20,82–105,114–134]
- Production polls every **5 seconds**, sequentially processes up to 20 due
  routines per tick, runs wakes first, and does not overlap its own loop tick.
  Slow pre-run commands can delay later work. Next run is a planned timestamp,
  not a real-time execution guarantee. [K2:48–50,390–403,610–644; K9:194–198]
- Missed cron occurrences fire once, not a backlog replay: next occurrence is
  calculated from the run's claim time, not the old due time. A long pre-run can
  therefore finish after that newly computed timestamp. Startup resets leftover
  `running` rows to `planned` and ticks immediately; this is recovery, not an
  exactly-once external-effect guarantee. [K2:68–75,368–385,629–638]
- `nextRunAt` is stored and returned even for failed/legacy rows; only planned
  rows are runnable. Do not render failed/finished rows' timestamps as a promised
  future execution. Likewise “planned” says nothing about whether a previous
  model session is still busy. [K2:239–264,295–301,341–381]
- There is **no routine execution ledger** exposed here. Successful one-shots and
  deleted routines disappear even with `--all`; cron rows retain only latest
  bookkeeping, much of it omitted from JSON list. New task-created sessions have
  `metadata.kimaki.taskId`/`task`, and Discord input is attributed to `routine #N`.
  Those can support later best-effort links, not a complete history of skipped,
  failed, notification-only or existing-thread occurrences. [K2:331–362;
  K10:414–420; K11:529–571; K12:56–115,182–209]
- `sleep` is a different session-wake facility/table, not a paused routine.
  Keep it out of the routines MVP unless explicitly scoped later.
  [K1:137–150; K3:153–159; K8:40–49]

## Auth, bridge interfaces and safest seam

**Existing native transport:** CLI writes use `callBot` → authenticated
`POST http://127.0.0.1:<KIMAKI_LOCK_PORT>/kimaki/send` or
`/kimaki/task.edit`, `.run`, `.delete`. Default port is 29988. The token lives in
`<KIMAKI_DATA_DIR>/lock-token`, written owner-only; request limit is 1 MiB.
Success is the raw route result, errors `{error}` with HTTP status, **not** the
ThreadDeck chat envelope. `callBot` defaults to 30 seconds unless overridden.
There is no native `task.list` route. The route table rejects unknown names.
[K4:1,66,123–149,180–185,203–232; K5:270–276,333–360,611–625]

**Authorization boundary:** this token is administrative local-operator access,
not per-Discord-user or per-routine authorization. Native routine writers do not
check a requesting guild/user. Discord `/routines` separately filters guild
visibility for its buttons; possession of a lock token is a different trust
boundary. Do not copy arbitrary native-route forwarding into a web API, tunnel
the port, return the token to a renderer, or treat a UI-selected user as an
authenticated actor. Pre-run is arbitrary shell execution in the stored project
directory; hide it in the first slice or require explicit advanced-operator
consent. [K4:131–149; K5:333–360; K2:271–287,567–579]

**Existing ThreadDeck seam:** preparer intercepts `/kimaki/client.*` and leaves
other native actions intact. `server/chat.ts:14–33` holds credentials server-side,
has a 30-second transport deadline, and validates `{ok,value}`/`{ok,error}`.
The bridge reports protocol 1/local-operator capabilities but has **no schedules
capability or routes**. Existing chat request IDs/receipts protect chat
submissions, not scheduling. Host/Origin and cross-site protections already
exist at the HTTP boundary. [T1:53–60; T3:14–33,40–46; T5:96–152,192–208;
T6:5–11]

**Recommended implementation boundary (future work):**

1. Add explicit routines capabilities and narrowly validated list/detail/write
   operations to the fork bridge; bind reads and writes to the **same live bot**
   and its DB. Reuse `listTasks`, `createTask`, `editTask`, `runTaskNow`,
   `deleteTask`; add a sanitized full-detail read using the canonical payload
   decoder, not a browser-provided DB path. Preserve optional-field omission.
   Include separate schedule kind/expression/timezone, full prompt, target kind,
   last dispatch/error and an optimistic revision if editing is offered.
2. Fail closed on unsupported capability/version or unavailable bot. Do not
   auto-prepare/restart/upgrade to unlock the UI. Expose a typed server service,
   not a generic route/command/shell executor. Keep token handling and existing
   same-origin/host protections server-side. [T1, T2, T3, T5, T6]
3. For long Run-now requests, use an explicit long-running operation receipt and
   status lookup rather than the existing 30-second chat timeout. Design durable
   idempotency and “outcome unknown” handling before enabling retries; do not
   claim exactly-once dispatch across crashes merely because a receipt exists.
   [K1:130–132; K2:629–635; T3:25; T5:96–141]
4. If avoiding any bridge extension initially, list via `execFile(node,
   [resolvedPinnedCli, 'routine', 'list', '--json', ...])`, schema-validate and
   bound stdout/time, explicitly select the data directory, then filter the
   returned registered channel IDs server-side. Treat output as a summary and
   report bot health separately. Never use `npx latest`, shell interpolation or
   an arbitrary client-selected executable. Existing `server/projects.ts:20–22`
   is a subprocess-service precedent, not a sufficient scheduling contract.
   Full prompt editing cannot safely use this list-only approach. [K1, K6,
   K7, T2, T7]

## Practical MVP and tests required

**MVP:** registered local project routines; list/status/UTC schedule/next time/
last dispatch error; explicit create with one-shot UTC or common five-field cron;
planned-only Run now; confirmed Delete. Default non-overlap. Make channel-new-run
versus existing-thread continuation explicit. Disable unavailable actions with
reason rather than inventing pause, enable toggles, retry-failed, timezone
selection or history. Omit pre-run, permissions, worktrees and attachments from
initial creation. Offer full prompt editing only after adding a lossless detail
read; otherwise allow explicit field changes without reconstructing the prompt.
These are recommendations based on the verified limits above, not implemented
features.

Tests should run against isolated temp DBs, manual clocks, fake Discord/OpenCode
and stubbed processes/transport, **never the user's live schedules**. Upstream
`routines.e2e.test.ts` already demonstrates manual-clock concurrency, legacy
payload and CLI/button coverage; it was read, not run. [K12]

- **Contract/version:** JSON array/empty/nulls/unknown fields; long multiline
  prompts remain lossless in details/edits; legacy timezone/raw schedule kept
  separately; corrupt payload; CLI output/error bounds; incompatible bridge,
  missing/mismatched DB, wrong data dir, offline bot and stale manifest.
- **Validation/security:** safe integer IDs; exactly one allowed local target;
  unknown/cross-project targets; empty versus omitted edits; user/model syntax;
  rejected attachments; Host/Origin/cross-site/JSON/body limits; no credential
  leakage or generic IPC forwarding; adversarial argv text is never shell code.
- **Time:** future `Z` dates, past/offset/local dates, month rollover and invalid
  input; UTC presets and legacy DST; five/six-field/macros compatibility;
  missed occurrences, next-run ordering, batch delays and bot clock skew.
- **State:** one-shot success and pre-run skip disappear; one-shot error stays
  failed; cron errors remain planned with lastError; cron success clears it;
  busy one-shot retries versus busy cron skip; notification null session; routine
  running is distinct from AI busy; legacy completed/cancelled rows are inert.
- **Race/recovery:** duplicate simultaneous claims; planned→running edit race;
  concurrent editors; delete during pre-run and after dispatch; lost responses
  on create/run/delete; repeated request IDs and differing bodies; no automatic
  write replay; restart recovery with externally completed but unrecorded work.
- **UX/service:** Run now consumes one-shots and may return `ran:false`; failed
  rows cannot run/edit; delete never promises abort; offline lists marked stale;
  polling cannot overwrite drafts; no prompt preview used as saved full text;
  long operations stay inspectable after timeout/disconnect.

## Sources consulted

Line references are to the inspected checkout/installations, not a moving GitHub
branch. `K` = `/home/santiago/.local/share/threaddeck/kimaki/base/node_modules/kimaki`;
`F` = `/home/santiago/.local/share/threaddeck/kimaki/fork-1.4.0-b42c6be4b8364606`;
`N` = `/home/santiago/.npm/_npx/01ccfd0419791eec/node_modules/kimaki`;
`C` = `/home/santiago/.local/share/threaddeck/kimaki/base/node_modules/cron-parser`.
Repository-relative paths below are within `/home/santiago/projects/ThreadDeck`.
Published source URLs are version-pinned counterparts for follow-up; they were
not fetched during this local-source-only investigation. [Upstream repository](https://github.com/remorses/kimaki).

| ID | Primary source / consulted paths |
| --- | --- |
| K0 | `K/package.json:1–25`; [published](https://unpkg.com/kimaki@1.4.0/package.json) |
| K1 | `K/src/cli/schedule.ts:1–151`; [published](https://unpkg.com/kimaki@1.4.0/src/cli/schedule.ts) |
| K2 | `K/src/scheduler.ts:1–648`; [published](https://unpkg.com/kimaki@1.4.0/src/scheduler.ts) |
| K3 | `K/src/schema.ts:120–179`, routine table/relation search; [published](https://unpkg.com/kimaki@1.4.0/src/schema.ts) |
| K4 | `K/src/lock-server.ts:1–233`; [published](https://unpkg.com/kimaki@1.4.0/src/lock-server.ts) |
| K5 | `K/src/lock-routes.ts:30–149,265–369,611–625`, complete route-name search; [published](https://unpkg.com/kimaki@1.4.0/src/lock-routes.ts) |
| K6 | `K/src/cli/shared.ts:25–69`; [published](https://unpkg.com/kimaki@1.4.0/src/cli/shared.ts) |
| K7 | `K/src/db.ts:1–89`; [published](https://unpkg.com/kimaki@1.4.0/src/db.ts) |
| K8 | `K/src/sleeps.ts:25–49`; [published](https://unpkg.com/kimaki@1.4.0/src/sleeps.ts) |
| K9 | `K/src/main.ts:190–203`, scheduler configuration search; [published](https://unpkg.com/kimaki@1.4.0/src/main.ts) |
| K10 | `K/src/sessions.ts:407–424,522–543`; [published](https://unpkg.com/kimaki@1.4.0/src/sessions.ts) |
| K11 | `K/src/prompt.ts:528–577`; [published](https://unpkg.com/kimaki@1.4.0/src/prompt.ts) |
| K12 | `K/src/routines.e2e.test.ts:1–210`; [published](https://unpkg.com/kimaki@1.4.0/src/routines.e2e.test.ts) |
| N0–N3 | `N/package.json:1–17`; `N/src/cli/schedule.ts:1–165`; `N/src/scheduler.ts` (routine/state search and full diff against K); `N/src/schema.ts` (full diff), `N/src/lock-routes.ts` (routine-route search); [1.6.0 source](https://unpkg.com/kimaki@1.6.0/src/scheduler.ts) |
| C1–C2 | `C/package.json:1–32`; `C/dist/CronExpressionParser.js:1–180`; [published parser](https://unpkg.com/cron-parser@5.10.2/dist/CronExpressionParser.js) |
| L1–L2 | `/home/santiago/.local/share/threaddeck/kimaki-fork.json:1–6`; `/home/santiago/.kimaki/bin/kimaki:1–3` (executable shim only, no credentials) |
| T1 | `scripts/prepare-kimaki-fork.mjs:1–89` |
| T2 | `scripts/kimaki-launcher.mjs:1–35` |
| T3 | `server/chat.ts:1–122` |
| T4 | `docs/local-chat.md:155–194` (installation context, checked against T1) |
| T5 | `integrations/kimaki/bridge-core.ts:85–154`, route/capability search through line 208 |
| T6 | `server/http.ts:1–66` |
| T7 | `server/projects.ts:1–92` |
| T8 | `integrations/kimaki/adapter.mjs:1–85` (local ownership/project lookup and bridge assembly context) |
| H1 | Executed only `node F/dist/cli.js --help`, `routine --help`, `routine list --help`, `routine edit --help`, `routine run --help`, `routine delete --help`, `send --help`, `sleep --help`; and `node N/dist/cli.js routine --help` |

Additional discovery/convention checks: `K/src/cli.ts` imports/search;
`server/source.ts` routine/history search (no matches); directory listings and
targeted Kimaki searches in `integrations/`, `scripts/`, `docs/`;
`docs/research/audio-prompts-kimaki.md:1–70` for research format;
`docs/research/kimaki-chat-integration.md` discovery search (its historical npx
version assumption was not reused). No skill-driven secondary-source claims
or live-service observations were used as capability evidence.
