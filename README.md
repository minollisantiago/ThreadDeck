# ThreadDeck

A personal, local, read-only switchboard for Kimaki/OpenCode conversations.
Discord remains the conversation interface. Sessions always stay grouped by project.

## Stack

Vite, React, TypeScript, Tailwind CSS and shadcn/ui-style source components,
with a lightweight Node.js backend. Node 24+ is required.

## Interface

- One column of project panels, with active projects first and inactive groups
  initially collapsed. Manual collapse, search, filters and scroll survive refresh.
- Working, Attention and Recent activity (last 24 hours) filters keep project groups.
- Session titles open `discord://` app links; the external-link icon opens Discord
  in the browser instead. Windows may ask permission for the first app handoff.
- Local light/dark, accent palette and collapse preferences; no account or cloud sync.
- Shared charcoal/light surfaces and bundled OFL-licensed JetBrains Mono typography
  follow the WeekTrace/NaturalGas references without sharing runtime code.

## Start alongside Kimaki

Instead of `npx kimaki@latest --gateway`, run:

```sh
cd ~/projects/ThreadDeck
npm run kimaki
```

This builds ThreadDeck, then starts the production dashboard and Kimaki together.
Open `http://localhost:5173` in your Windows browser. Ctrl+C stops both; if either
process exits, the launcher stops the other too. Build failures prevent startup.
Kimaki's internal bot restarts keep the dashboard running with its parent launcher.

Stop a previously launched Kimaki yourself before switching to this command.
The launcher uses `--if-not-running` so it never replaces an already running bot;
if one exists, Kimaki exits and the dashboard stops too. No existing bot is
restarted or reconfigured by installing this launcher. It does not start OpenCode
directly: Kimaki manages its own service as usual.

Extra Kimaki options can be passed with `npm run kimaki -- --no-analytics`.
The launcher adds `~/.kimaki/bin` to PATH for the dashboard's CLI access.
Run `npm install` once before first use. This launcher requires Linux/macOS
(including WSL) for process-group cleanup.

## Development

```sh
npm install
npm run dev
```

Open `http://localhost:5173` in your Windows browser when running inside WSL.
The backend and frontend share one loopback-only port.

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
starts, stops, or reconfigures either service; the optional shared launcher above
owns only the processes it starts.
No Discord token or OpenCode credential is sent to the browser.

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
- No transcripts, Git history, database access, or service mutations are used.

The local backend is loopback-only and rejects foreign Host/Origin headers.
Do not expose it through a public tunnel: session titles are personal data.
`PORT` changes the default port. `KIMAKI_OPENCODE_SERVICE_FILE` optionally selects
the existing OpenCode registration used by Kimaki.
