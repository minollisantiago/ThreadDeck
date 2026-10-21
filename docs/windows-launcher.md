# Windows all-in-one launcher

Install the shortcut once from your WSL checkout:

```sh
npm install
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
The loading screen uses the dashboard's saved **light or dark appearance**, including
its native window background, status indicators and error controls. Preferences are
read locally before WSL starts, so an existing light-mode choice does not flash dark
on a cold launch. With no saved appearance, the Windows color scheme is used.

No terminal window is opened. The client starts WSL invisibly, builds the production
dashboard only when a backend is missing, and starts missing services. The existing
`npm run kimaki` browser launcher and `npm run kimaki:desktop` terminal launcher
remain available; `npm run desktop` also gets the branded connecting screen but
does not start services.

The Windows shortcut **reuses an existing ThreadDeck backend and/or Kimaki** and
starts only missing services. It checks the dashboard endpoint and `kimaki status`
before launching. Existing processes are never replaced, restarted or adopted.
Closing its Electron window stops only the processes started by that launcher;
reused services keep running. If a different application occupies the dashboard
port, startup fails with a diagnostic instead of killing that application. Kimaki
manages OpenCode in the usual way; the shortcut does not independently manage it.

The shortcut captures the current WSL distribution, checkout and Node.js path.
It does not depend on an interactive terminal or fish/bash/nvm startup files.
Rerun `npm run desktop:install` after moving the checkout or removing/upgrading
the captured Node.js installation. Keep the checkout and its `node_modules`.
WSL interop and localhost forwarding must be available. The shortcuts point
directly to the cached Windows Electron executable, so cold WSL startup cannot
delay the loading screen. `launch.vbs` remains a native-client compatibility entry
for older pinned shortcuts and taskbar relaunches. No Windows Node.js installation
is needed.

Build/startup output is appended to `%LOCALAPPDATA%\ThreadDeck\launcher.log`.
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
