# ThreadDeck

A personal, local switchboard and Stream chat workspace for Kimaki/OpenCode
conversations. Group threads by project or state; keep Discord available alongside
the desktop conversation. Chat requires the prepared local Kimaki fork: see
[local chat setup and current limits](docs/local-chat.md).

## Stack

Vite, React, TypeScript, Tailwind CSS and shadcn/ui-style source components,
with a lightweight Node.js backend. Node 24+ is required.

## Interface

- **Ctrl+K** (desktop also **Ctrl+Tab**) or double-tap **Space** outside text fields
  and controls opens fuzzy session search. Use ↑/↓ and Enter to open a conversation.
  The finder also provides **New linked conversation** and **Search conversation
  history**. **Ctrl+P** focuses drafting; **Ctrl+P, then P** expands/restores Vim editing.
  The existing history index searches user/assistant text, titles and word prefixes.
  The existing `/` shortcut still focuses the dashboard filter. History search is
  independent of dashboard filters and its recent-300-session inventory.
- A private local SQLite FTS5 index lives at `~/.local/share/threaddeck/search.sqlite`
  (`THREADDECK_DATA_DIR` overrides its directory). The first background sync pages
  through linked conversation history; results appear progressively. Every minute,
  changed sessions are reindexed and deleted/unregistered sessions are removed after
  a successful sweep. Tool output, reasoning and attachments are not indexed. Cached
  results remain searchable during service outages. No external search service is used.

- One column of project panels, with active projects first and inactive groups
  initially collapsed. Manual collapse, search, filters and scroll survive refresh.
- **By project / By state** switches grouping and remembers your choice locally.
  State view stacks Needs attention (including unread responses), Working, then Idle,
  with project pills on every thread and newest activity first within each group.
  Threads appear once; attention takes priority over working. Stale live states
  appear under Status unavailable, while local unread flags remain actionable.
- Working, Attention and Recent activity (last 24 hours) filters work in both views.
- Active sessions is the default: working threads, requests needing attention and
  locally unread responses stay visible; All sessions also reveals idle threads.
- Completed assistant responses are marked **Unread** until opened from ThreadDeck
  or acknowledged with the row's Unread button. Unread counts appear on projects
  and unread threads also appear under Attention. Merely expanding a project does
  not mark its threads read.
- **Mark all as read** clears unread flags across all loaded projects, including
  sessions hidden by the current search or filter. Subsequent replies become unread again.
- Click a project's **Unread** pill to mark just that project's unread responses
  read, including filtered-out threads, without expanding or collapsing the project.
- Read receipts are local to this browser and persist across reloads. They do not
  sync with Discord. On first use, existing completed responses are unread because
  ThreadDeck has no record of what you have already read elsewhere.
- Session titles open the internal Stream pane. Its messages come from Kimaki's
  actual Discord publication, not the raw harness transcript. Without the local
  bridge, drafting remains available and the app offers Discord rather than fake
  history or unmirrored prompts. The external-link icon still opens Discord.
- Local light/dark, accent palette and collapse preferences; no account or cloud sync.
- Each mode has four independently saved backgrounds: dark **Original, Charcoal,
  Midnight, Graphite**, and light **Original, Porcelain, Warm paper, Cool slate**.
  Both modes keep the same four-slot picker so the controls popup does not move
  when switching modes. Background choices do not change the selected accent.
- Shared charcoal/light surfaces and bundled OFL-licensed JetBrains Mono typography
  follow the WeekTrace/NaturalGas references without sharing runtime code.

## Start alongside Kimaki

Instead of `npx kimaki@latest --gateway`, run:

```sh
cd ~/projects/ThreadDeck
npm run kimaki
```

This builds ThreadDeck, then starts the production dashboard and Kimaki together.
Open `http://localhost:43127` in your Windows browser. Ctrl+C stops both; if either
process exits, the launcher stops the other too. Build failures prevent startup.
Kimaki's internal bot restarts keep the dashboard running with its parent launcher.
Before starting owned Kimaki, the launcher reuses an existing OpenCode service or
starts OpenCode V2 with its inherited environment (including the SSH agent socket).
On shutdown it waits for owned Kimaki/backend processes to exit, then stops only
the OpenCode process it started. Pre-existing and replacement services are never
adopted or stopped. Cancelling startup also cleans up an owned OpenCode process.

Stop a previously launched Kimaki yourself before switching to this command.
The launcher uses `--if-not-running` so it never replaces an already running bot;
if one exists, Kimaki exits and the dashboard stops too. No existing bot is
restarted or reconfigured by installing this launcher. If Kimaki is reused, the
launcher leaves its OpenCode service completely alone as well.

Extra Kimaki options can be passed with `npm run kimaki -- --no-analytics`.
The launcher adds `~/.kimaki/bin` to PATH for the dashboard's CLI access.
Run `npm install` once before first use. This launcher requires Linux/macOS
(including WSL) for process-group cleanup.

## Windows desktop app (from WSL)

For a **Windows desktop / Start menu shortcut** that starts Kimaki, the dashboard
backend and Electron together without a terminal, run `npm run desktop:install`
once from WSL. See [Windows all-in-one launcher](docs/windows-launcher.md) for
setup and logs. The Windows shortcut reuses already-running services and starts
only missing ones; closing it leaves reused services untouched.
The native client opens before WSL starts, with a branded scanner-logo loading
screen, live startup stages, and retry/log controls if anything fails.

Keep `npm run kimaki` for the existing browser dashboard. For a **native Windows
Electron window** alongside Discord, use this separate command from WSL:

```sh
npm run kimaki:desktop
# Extra Kimaki options still work:
npm run kimaki:desktop -- --no-analytics
```

This builds the app and starts the WSL dashboard backend, Kimaki and the Windows
window together. Closing the window, Ctrl+C, or any owned process exiting stops
the others. Stop an earlier Kimaki launcher yourself first; this command never
replaces an existing bot. No Kimaki or OpenCode services are restarted by setup.

- Opens **430 pixels wide**, filling the primary display's usable height (taskbar
  stays visible), ready to sit beside Discord. The starting width is also its
  minimum width; you can widen or maximize it, but cannot make it narrower.
- A frameless, draggable title bar follows the app's light/dark theme and accent.
  Maximize fills the desktop; **Restore** returns to narrow, full-height mode on
  the current display. Minimize is the normal Windows taskbar action, not Restore.
- Discord links open in the Windows Discord app or default browser, never inside
  the dashboard window. Browser and desktop have separate local preferences and
  unread receipts; these do not migrate or sync.
- Requires WSL Windows interop and localhost forwarding (the WSL defaults), plus
  Windows PowerShell. The first run downloads the matching Windows Electron
  runtime, verifies its checksum, and caches it in `%LOCALAPPDATA%\ThreadDeck`.
  Only the desktop shell is copied there; the backend and project data stay in WSL.
  No Windows Node.js install is needed. This is a launcher, not an installer/MSI.
- `PORT` is forwarded to the desktop app. The backend stays loopback-only; do not
  expose it publicly. If Windows cannot reach it, check WSL localhost forwarding.

To open just the desktop window against an **already running** production or dev
dashboard, use `npm run desktop`. This command does not start or stop that backend
or Kimaki. Run `npm run build && npm start` separately if needed.

Desktop policy checks: `npm run test:desktop`. Shared launcher checks are included
in `npm test`. To exercise the real Windows window with synthetic sessions and
save screenshots under `artifacts/`, run `node scripts/desktop.e2e.mjs` after a build.

## Development

```sh
npm install
npm run dev
```

Open `http://localhost:43127` in your Windows browser when running inside WSL.
The backend and frontend share one loopback-only port. Development hot reload
uses port `43128`. These defaults avoid Vite's usual `5173` port range.

```sh
npm run check
npm run build
npm start
```

Browser checks (after building): `npx playwright install chromium`, then
`npm run test:browser`. Optional `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` uses an
existing Chromium binary. These checks use synthetic sessions and save desktop,
light, mobile, and disconnected-state screenshots under ignored `artifacts/`.

When starting the dashboard on its own, the existing Kimaki CLI must be on PATH
and the existing OpenCode V2 service must be running. The dashboard itself never
starts, stops, or reconfigures either service; the optional launchers above manage
only the processes they start, including OpenCode when no service is already running.
No Discord token or OpenCode credential is sent to the browser.

### Live updates

ThreadDeck subscribes to OpenCode lifecycle, status, form and permission events,
coalesces bursts for 150 ms, and pushes full snapshots to dashboard windows over
server-sent events (`/api/events`). Token deltas do not trigger expensive refreshes.
One upstream subscription serves all windows; a 30-second reconciliation refresh
catches missed events and discovers project-registration changes (cached for 60 seconds).
Stream failures retry with exponential backoff and rediscover service credentials;
silent upstream streams are reconnected after 45 seconds without transport activity.
Browsers automatically reconnect and receive the current snapshot, so replay is
unnecessary. If streaming fails, the dashboard falls back to `/api/snapshot` every
30 seconds until streaming recovers. Source failures retain the last good data
with stale/disconnected status. Both endpoints remain read-only and loopback-only.
Quiet streams do not imply an outage: the UI allows 75 seconds (two reconciliation
cycles plus request headroom) before marking a silently frozen snapshot stale.
Explicit source or dashboard-transport failures are still shown immediately.

### Troubleshooting: disconnected with existing sessions

ThreadDeck must be able to run `kimaki` from its own process environment. If
Kimaki is installed in `~/.kimaki/bin` but that directory is missing from the
terminal's `PATH`, the dashboard can show disconnected even when OpenCode is
healthy and existing sessions are available.

Stop ThreadDeck and restart it with Kimaki on `PATH`:

```sh
PATH="$HOME/.kimaki/bin:$PATH" npm run dev
# For a production build, use npm start instead of npm run dev.
```

To make this permanent, add `export PATH="$HOME/.kimaki/bin:$PATH"` to your
shell startup file and open a new terminal before starting ThreadDeck. Only
ThreadDeck needs restarting; do not restart Kimaki or OpenCode for this issue.

## Data and refresh

- Active sessions are checked every five seconds, independently of the recent list.
  Native child agents roll up into the owning Discord thread.
- The latest 300 OpenCode sessions are inventoried every 30 seconds. Projects are
  rediscovered every minute. Only Discord-linked conversations in registered
  Kimaki projects appear. This is a recent switchboard, not a full history browser.
- Project association prefers the Kimaki channel, so linked worktrees remain under
  their original project. Directory matching is a fallback, not project-ID matching.
- Forms and permissions supply optional attention badges. Ordinary Discord
  questions/buttons are not inferred. Idle is not completion.
- A failed source check preserves the previous rows as stale, never as newly idle.
- The latest assistant message is checked for a completed text response when a
  thread settles, cached until its session updates. Message bodies are not stored
  or sent to the browser; only the completion timestamp is exposed for unread tracking.
- No Git history, database access, or service mutations are used.

The local backend is loopback-only and rejects foreign Host/Origin headers.
Do not expose it through a public tunnel: session titles are personal data.
`PORT` changes the default port (`43127`); development hot reload uses `PORT + 1`,
so both ports must be available. `KIMAKI_OPENCODE_SERVICE_FILE` optionally selects
the existing OpenCode registration used by Kimaki.
