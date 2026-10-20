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

Double-click the shortcut to build ThreadDeck, start Kimaki and the production
WSL dashboard, and open the native Windows Electron window. No terminal stays
open. The existing `npm run kimaki` browser launcher and `npm run kimaki:desktop`
terminal launcher remain available.

**Before switching:** stop any previously started Kimaki or ThreadDeck launcher
yourself. The all-in-one launcher deliberately refuses to replace an existing
Kimaki instance; it does not take over or kill existing services. Opening a
second copy while the first is running is not supported. Closing its Electron
window stops the backend and Kimaki processes owned by that launcher. Kimaki
manages OpenCode in the usual way; the shortcut does not independently manage it.

The shortcut captures the current WSL distribution, checkout and Node.js path.
It does not depend on an interactive terminal or fish/bash/nvm startup files.
Rerun `npm run desktop:install` after moving the checkout or removing/upgrading
the captured Node.js installation. Keep the checkout and its `node_modules`.
Windows Script Host (`wscript.exe`), WSL interop and localhost forwarding must
be available. No Windows Node.js installation is needed.

Build/startup output is appended to `%LOCALAPPDATA%\ThreadDeck\launcher.log`.
If startup fails, a Windows message box points to that log. An occupied dashboard
port or an existing Kimaki instance will stop startup rather than replace them.

To remove the shortcut, delete **ThreadDeck** from the desktop and Start menu.
The runtime and generated launcher live under `%LOCALAPPDATA%\ThreadDeck`;
they are separate from the WSL checkout and Kimaki data.

For a Windows-to-WSL smoke test without starting real services, run
`node scripts/windows-launcher.e2e.mjs`. It uses a synthetic supervisor script
to verify the actual Windows Script Host command parsing, Node path, working
directory and `--desktop` argument. Unit checks are included in `npm test`.
