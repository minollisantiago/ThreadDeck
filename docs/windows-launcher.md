# Windows all-in-one launcher

Install the shortcut once from your WSL checkout:

```sh
npm install
npm run kimaki:prepare # optional for manager-only use; required for desktop chat
npm run desktop:install
```

This adds **ThreadDeck** to the Windows desktop and Start menu. Setup downloads
the Windows Electron runtime if necessary, but does not start, stop or restart
Kimaki, OpenCode, or an existing dashboard.
The shortcuts and Electron window use the same pink layered ThreadDeck icon as
the web app. Rerun the installer to refresh existing shortcut icons. The checked-in
Windows icon is generated from `src/assets/favicon.svg`; after changing that SVG,
run `node scripts/generate-desktop-icon.mjs` (requires Playwright Chromium).
The shortcuts and native window also share a Windows AppUserModelID and explicit
taskbar icon/relaunch metadata. This prevents Windows from using the generic
Electron or Windows Script Host icon when grouping or pinning the app. If you
pinned an older generic icon, unpin it and pin the updated running ThreadDeck
window after rerunning setup; old pinned shortcuts can retain cached metadata.

Double-click the shortcut to open the **native Windows client immediately**,
before WSL or the backend has started. A local branded screen shows the ThreadDeck
logo with a top-to-bottom opacity scanner, followed by live WSL, dashboard-backend
and Kimaki startup stages. Once the services are ready, the same window transitions
into the dashboard. The animation respects Windows' reduced-motion preference.
The drafting-frame layout adds a softly faded line grid, a restrained pink glow,
registration corners and diagonal hatch gutters around the service list. Its
ready count reflects actual visible startup stages, not an estimated time or
fake percentage; direct client-only launches count just the backend connection.
The complete loading composition (including its grid and footer) stays centered
at a maximum width of **430px**, even when the native window is maximized.
The loading screen uses the dashboard's saved **light or dark appearance**, including
its native window background, status indicators and error controls. Preferences are
read locally before WSL starts, so an existing light-mode choice does not flash dark
on a cold launch. With no saved appearance, the Windows color scheme is used.

No terminal window is opened. The client starts WSL invisibly, builds the production
dashboard only when a backend is missing, and starts missing services. The existing
`npm run kimaki` browser launcher and `npm run kimaki:desktop` terminal launcher
remain available; `npm run desktop` also gets the branded connecting screen but
does not start services.

The Windows shortcut **reuses an existing ThreadDeck backend and/or healthy Kimaki**
and starts only missing services. It checks the dashboard endpoint and `kimaki status`
before launching. The bot startup wrapper then uses authenticated readiness and
bridge checks. Existing processes are never replaced, restarted or adopted.
Closing its Electron window stops only the processes started by that launcher;
reused services keep running. If a different application occupies the dashboard
port, startup fails with a diagnostic instead of killing that application.
When starting missing Kimaki, the launcher first reuses an existing OpenCode service
or starts OpenCode V2 itself. Closing the window waits for owned Kimaki/backend
processes to exit before stopping the exact OpenCode child it started. Pre-existing
OpenCode services (including those used by reused Kimaki) and later replacement
services are left running. Cancellation, startup failures and retry also clean up
owned OpenCode processes. No service is stopped globally or killed by process name.

## Bot selection, retries and fallback

```text
Open native shell → start WSL → check/reuse backend and OpenCode as needed
                                      │
                         Kimaki already running?
                           │                 │
                          yes               no
                           │                 │
                    verify/reuse      prepared fork available?
                    do not stop         │                │
                     on exit           yes              no
                                        │                │
                              fork, up to 3 starts       │
                              1s / 2s retry backoff      │
                                 │             │         │
                               ready         failed      │
                                 │             └────┬────┘
                                 │                  │
                            desktop chat      regular Kimaki once
                                               chat unavailable
```

- The fork is selected from `~/.local/share/threaddeck/kimaki-fork.json`
  (`THREADDECK_DATA_DIR` overrides that root). Missing, incompatible, or missing-file
  preparation skips straight to regular Kimaki; startup does not install a fork.
- Each fork attempt has a 20s readiness window. After 3 total attempts, regular
  `npx --yes kimaki@latest --gateway --if-not-running` has one 30s readiness window.
  Cleanup/probe/network time is additional; the overall native startup deadline is
  still 180s. A known auth/configuration failure skips the remaining fork retries.
- Ready means the authenticated status reports connected OpenCode and a guild;
  fork startup additionally requires protocol-1 chat capabilities and, on current
  prepared builds, Discord-client readiness. A listening port or live PID alone
  does not count. An unready external bot is left untouched and reported as an error.
- All bot starts use `--if-not-running`. A race winner is reused, not evicted.
  Owned attempts are stopped before retry/fallback; process-group ownership and
  the lock holder are checked so cleanup cannot target a different bot. An owned
  lock that survives shutdown stops startup rather than spawning a competitor.
- **Fallback is visible:** the startup stage says **Running regular Kimaki—desktop
  chat unavailable**. After handoff, the installed native title bar shows
  **REGULAR · CHAT OFF**, with details on hover. Discord and manager features remain
  usable; drafts are retained. This also labels a reused regular bot. The badge
  records startup mode, not continuous monitoring of later external replacements.
- This policy is startup-only: it never restarts a bot after successful readiness
  and never automatically retries prompts. A later owned-process exit follows the
  existing shutdown/error flow. If regular startup also fails, use the error/log UI.

The shared terminal launchers (`kimaki`, `kimaki:desktop`, `kimaki:local`) use the
same fork-first wrapper for missing bots. `npm run desktop` is still client-only.
See [local chat setup](local-chat.md) for preparation, credentials and rollback.

The shortcut captures the current WSL distribution, checkout and Node.js path.
It does not depend on an interactive terminal or fish/bash/nvm startup files.
Rerun `npm run desktop:install` after pulling native-shell changes, moving the
checkout, or removing/upgrading the captured Node.js installation. It refreshes the
cached main/preload scripts as well as the shortcuts without starting services.
Keep the checkout and its `node_modules`.
WSL interop and localhost forwarding must be available. The shortcuts point
directly to the cached Windows Electron executable, so cold WSL startup cannot
delay the loading screen. `launch.vbs` remains a native-client compatibility entry
for older pinned shortcuts and taskbar relaunches. No Windows Node.js installation
is needed.

Build/startup output is appended to `%LOCALAPPDATA%\ThreadDeck\launcher.log`.
This includes fork attempt numbers, readiness results, cleanup and fallback notices.
If startup fails or times out, the loading screen shows **Retry startup** and
**Open startup log**. Retrying cleans up the failed attempt's owned processes first.
Closing the client during startup also cancels owned builds/services via a renewable
local lease; already-running services are left untouched. Rerun
`npm run desktop:install` to update an older shortcut to client-first startup.

To remove the shortcut, delete **ThreadDeck** from the desktop and Start menu.
The runtime and generated launcher live under `%LOCALAPPDATA%\ThreadDeck`;
they are separate from the WSL checkout and Kimaki data.

For a Windows-to-WSL smoke test without starting real services, run
`node scripts/windows-launcher.e2e.mjs`. It starts a native Windows client against
a slow, failing-once synthetic WSL supervisor, and checks the immediate loading
screen, animation/reduced motion, error/log actions, retry, dashboard handoff and
owned-service cleanup. It never starts real Kimaki. Unit checks are in `npm test`.
`scripts/kimaki-launcher.test.js` separately covers retries/backoff, missing forks,
authentication failures, existing/racing bots, cancellation, fallback failure and
owned cleanup using fake transports and a synthetic local process. These do not
prove a real Discord cold-start failure/recovery sequence.
