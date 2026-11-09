# Project schedules

Use **Schedules** beside **Threads** in the existing project sidebar. Each project
keeps its familiar collapsible heading and tree rows. Selecting a routine replaces
the chat pane with its full instruction, schedule, destination, agent/model,
overlap policy and last dispatch error. The displayed title comes from the saved
instruction; Kimaki does not have a separate routine-name field.

Projects without matching schedules are hidden, including when searching or
filtering. **New schedule** still lets you choose any registered project, even
one that has no routines yet.

## Activation

Schedules require the local bridge capability `schedules-v1`:

```sh
npm run kimaki:prepare
```

Preparation creates a new isolated, pinned fork. **It does not change or restart
the running bot.** Deliberately stop/relaunch the owning Kimaki process when you
are ready to activate it; launchers continue to reuse a healthy existing bot.
The ThreadDeck backend must also be running the updated code. An older bridge
shows an actionable unavailable state, not a misleading empty list.

## Supported actions

- **Create:** use a project's `+` or New schedule. New routines start a new
  conversation in that registered project. Choose a UTC cron expression (common
  presets are provided), or a future UTC ISO timestamp ending in `Z` for a
  one-time instruction. Kimaki validates the schedule using its own clock/parser.
- **Edit:** full, lossless prompt, schedule, agent/model and overlap policy.
  Only changed fields are sent. Empty optional agent/model values clear them.
  Existing thread/notification destinations, user, pre-run, permissions and
  worktree settings are preserved; they cannot be created/changed here.
- **Run now:** confirmed dispatch through Kimaki's normal scheduler. This is not
  an independent test run. It consumes a one-time occurrence and advances a
  recurring routine's next planned time. Busy checks and existing shell pre-run
  commands still apply. A pre-run skip can also consume a one-time routine.
- **Delete:** confirmed permanent removal. It does not stop an AI session or
  shell command already underway.

Only planned, decodable routines can be edited or run. Failed one-time routines
remain visible but cannot be retried through the native scheduler; inspect and
delete/recreate them deliberately. A routine with an unreadable payload remains
visible with editing/running disabled, rather than exposing its preview as the
full prompt.

New schedules and schedule changes use UTC. An instruction-only edit preserves a
legacy timezone; changing its schedule resets it to UTC, with a warning in the
editor. The pane explicitly labels stored timezone and local-time conversion.

## Status and safety

- Lists refresh every 15 seconds while Schedules is open. Refresh is also manual;
  stale snapshots are labeled and writes disabled after a fetch failure.
- **Dispatching** describes the scheduler's claim/pre-run/dispatch phase, not
  the AI turn's entire lifetime. Planned cron routines may still show a previous
  dispatch error. Successful one-time routines disappear. Failed rows do not
  promise another future execution.
- After a confirmed Run now dispatch, **Open thread** opens that exact run's
  conversation inside ThreadDeck, even before it appears in the recent-session
  inventory. New receipts retain the project so consumed one-time routines can
  still be opened. Older receipts use the existing session or matching routine
  project when available. Pending/uncertain operations retain **Check operation
  status** instead. Notification-only runs do not invent a conversation link.
- No fake pause/resume switch, execution-history view or second scheduler is
  introduced. Existing shell pre-run commands are shown read-only and explicitly
  called out by Run now confirmation.
- Every mutation gets a durable operation receipt inside the owning bot. HTTP
  timeouts never trigger automatic re-submission. Check operation status after
  uncertainty; the pending ID survives a browser reload. Restarted unfinished
  operations become **unknown**, not replayed. Receipt IDs deduplicate local
  requests; this does not promise exactly-once external effects across crashes.
- Confirmations and edits carry configuration revisions. The canonical scheduler
  writers use guarded compare-and-swap/claims so an intervening edit or run is
  rejected rather than silently overwritten/dispatched.
- The editor retains unsaved inputs across background refreshes and asks before
  discarding changes. Switching to Schedules preserves chat drafts, removes the
  hidden chat's viewed-notification state and disables composer-focus shortcuts.
  Opening a desktop notification returns to the corresponding thread. An open
  schedule editor remains modal, so notifications cannot discard its draft.

This is local-operator management, not Discord-user authentication. The backend
keeps the lock token private, accepts only loopback/same-origin requests, and
exposes a fixed typed API, not arbitrary Kimaki commands or shell execution.
Scheduler reads/writes use the same live bot's database. No direct SQLite writes
are performed by the ThreadDeck web server.

## Verification

```sh
npx vitest run server/schedules.test.ts server/schedules-core.test.ts src/schedules/schedules.test.tsx
npm run build
npx playwright test --config playwright.chat.config.ts e2e/schedules.spec.ts
npm run kimaki:test
```

The prepared-fork smoke uses a scratch database, manual clock and fake transports.
It tests native create/edit/run/delete, revision guards, full prompts, preserved
advanced settings, legacy timezone, corrupt payloads and one-time pre-run skips.
It does not start/restart Kimaki or OpenCode, mutate live schedules, or submit
real model requests. Browser tests intercept every API.
