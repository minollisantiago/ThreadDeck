# Set up ThreadDeck

Use this guide for a fresh machine, an existing Kimaki installation, or an agent
setting up the app for you. ThreadDeck runs locally alongside Kimaki and OpenCode;
it is not a standalone replacement for either service.

## 1. Check the machine

Choose a launch target:

| Target | Requirements |
| --- | --- |
| Windows desktop app | WSL with Linux Node.js, Windows interop, localhost forwarding and Windows PowerShell |
| Local browser | Linux, macOS or WSL; no native desktop install needed |

Native Windows Node.js/PowerShell alone is not a supported backend setup. The
Windows app is launched from WSL; native Linux/macOS desktop packaging is not
provided. A remote agent needs shell access to the **user's target machine**;
installing in a disposable cloud sandbox does not install the user's app.

In the Linux/macOS/WSL shell, check:

```sh
git --version
node --version
npm --version
opencode --version
```

- Install **Git and Node.js 24+ (with npm)** if missing. In WSL, use the Linux
  binaries, not a Windows Node installation. See [Node.js downloads](https://nodejs.org/en/download).
- ThreadDeck's launcher requires **OpenCode V2**, not V1. Follow the
  [official V2 installation instructions](https://opencode.ai/v2/docs/) if needed.
  Obtain permission before replacing an existing V1 installation. If V2 is installed
  under another name/path, set `OPENCODE_PATH` to its executable for the launcher.
- Downloads require internet access: npm packages, the isolated Kimaki fork,
  packaged FFmpeg, and (for Windows desktop) the Windows Electron runtime.
- The user needs a Discord account, permission to authorize Kimaki in a server,
  and access to a model provider. Each user supplies their own credentials.

For Windows, install WSL if necessary using
[Microsoft's WSL guide](https://learn.microsoft.com/en-us/windows/wsl/install),
then reopen this guide in the WSL shell. OS installation, elevation and reboot
steps may require the human. Keep the checkout under the WSL home directory.

**Agent safety:** inspect the existing checkout and services before making changes.
Preserve uncommitted work, configured data directories, provider credentials and
service registrations. Ask before replacing installations or stopping services.
Keep secrets out of repository files, chat messages and shared logs. Keep the
backend loopback-only; a public tunnel is not a setup solution.

Continue when the selected platform, Git, Node 24+, npm and OpenCode V2 are available.

## 2. Clone and prepare

For a new checkout:

```sh
mkdir -p ~/projects
cd ~/projects
git clone https://github.com/minollisantiago/ThreadDeck.git
cd ThreadDeck
```

If a checkout already exists, use it instead. Inspect its branch and local changes
before updating it; setup does not require resetting or overwriting user work.

```sh
npm install
npm run build
npm run kimaki:prepare
npm run kimaki:test
```

Preparation creates an isolated, pinned **Kimaki 1.4.0 fork** with ThreadDeck's
chat bridge; it does not start or restart the bot. The smoke test checks the
prepared integration, not the user's live Discord/model connection. FFmpeg's
install script must be allowed for audio support; see
[packaged FFmpeg](local-chat.md#packaged-ffmpeg) if scripts are restricted.

Continue when the build, preparation and integration smoke test pass.

## 3. Connect Kimaki, Discord and a model

### Existing Kimaki user

Use the same OS user and Kimaki/OpenCode environment as the existing installation.
If `kimaki` is not on PATH, check its usual shim directory:

```sh
export PATH="$HOME/.kimaki/bin:$PATH"
kimaki status
kimaki project list
```

If the CLI is unavailable, use `npx -y kimaki@latest status` and
`npx -y kimaki@latest project list` to inspect the installation. Preserve any
custom `KIMAKI_DATA_DIR`, `KIMAKI_LOCK_PORT`, `THREADDECK_DATA_DIR` or
`KIMAKI_OPENCODE_SERVICE_FILE` values consistently across launch commands.

A healthy running bot is reused **even if it lacks ThreadDeck's bridge**. Preparing
the fork does not activate it in that process. If chat is unavailable, ask the user
to stop the bot's owning launcher while idle, then launch ThreadDeck in step 4.
Never kill a shared service to force activation. If stopping it is not acceptable,
leave it running and report desktop chat as pending; Discord/manager use can remain
available. See [reuse and fallback](windows-launcher.md#bot-selection-retries-and-fallback).

### First-time Kimaki user

Follow [Kimaki's agent machine setup guide](https://kimaki.dev/docs/guides/agent-machine-setup)
for the authoritative gateway onboarding flow. Use the published CLI, not a Kimaki
source checkout or a newly invented Discord bot:

```sh
npx -y kimaki@latest --gateway
```

Keep this onboarding process running until authorization completes:

1. The human opens the install link, selects their Discord server and authorizes
   the bot. The link contains a secret: share it only through a private channel.
2. Wait for authorization and readiness. Let Kimaki create its own onboarding
   category/channel; avoid creating duplicates manually.
3. In Discord, use **`/login`** to connect a model provider, then choose an available
   model with **`/model`**. Complete OAuth or enter API keys through the provider's
   intended login flow, never through repository files or an agent transcript.

See [models and subscriptions](https://kimaki.dev/docs/getting-started/subscriptions).
An agent should pause at human authorization steps and resume after confirmation.

After onboarding, stop **only this newly started foreground onboarding process**
with Ctrl+C, while idle. Step 4 can then start the prepared fork using the same
credentials. This handoff is necessary: reusing the regular onboarding bot would
leave ThreadDeck chat unavailable. Preserve pre-existing OpenCode services.

### Register a project

With a bot running (the onboarding process, an existing bot, or step 4's launcher),
inspect registrations and add a real project only if absent:

```sh
kimaki project list
kimaki project add /absolute/path/to/your/project
```

Use `npx -y kimaki@latest` in place of `kimaki` if the shim is unavailable. Choose
the user's actual project directory, not a subfolder of an already registered
project. Adding a project creates its Discord channel. No need to register
ThreadDeck itself unless the user wants agents working on ThreadDeck.

Continue when Discord is authorized, a provider/model is connected and a project
is registered. If registration needs a running bot, launch step 4 first and return.

## 4. Launch

### Windows desktop from WSL

```sh
npm run desktop:install
```

Open **ThreadDeck** from the Windows desktop or Start menu. Installation itself
does not start services. The shortcut starts missing services and reuses healthy
existing ones. No Windows Node.js installation is needed. For a terminal-based
desktop launch instead, use `npm run kimaki:desktop`.

See [Windows startup and logs](windows-launcher.md) if interop or startup fails.
When an agent cannot open or inspect the native window, ask the human to open it
and complete the visible checks below.

### Local browser on Linux, macOS or WSL

```sh
npm run kimaki
```

Keep the launcher running and open http://localhost:43127 on the same machine
(the Windows browser when using WSL). Ctrl+C stops services owned by this launcher;
reused services stay running. If intentionally reusing an existing ThreadDeck
backend, use `npm run kimaki -- --reuse-existing`.

`npm run dev` is for development; it does not onboard or launch Kimaki/OpenCode.

## 5. Verify before declaring success

An open window or successful build alone is not a working chat installation.

- [ ] `kimaki status` reports a running bot and connected OpenCode.
- [ ] `kimaki project list` contains the intended project/channel.
- [ ] The app loads without a disconnected/stale-service error.
- [ ] An existing Discord-linked conversation appears, or **New linked conversation**
  can select the registered project. An empty dashboard on a new setup is not
  proof of failure; there may be no linked conversations yet.
- [ ] Chat is available, not **REGULAR · CHAT OFF** or a bridge-unavailable fallback.
- [ ] In a new test conversation, send: “Reply with SETUP OK only. Do not edit files
  or run commands.” Verify the prompt and actual assistant reply appear in both
  ThreadDeck and the corresponding Discord thread. This invokes the selected model
  and may incur provider usage; obtain permission before sending a test prompt.
- [ ] The user knows how to reopen the app and where startup logs live.

Agents: finish with the checkout path, launch method, checks actually performed,
any reused services, and outstanding human actions. If authorization, permission
for a test prompt, or visual confirmation is pending, report **installed, verification
pending**, not fully working. Synthetic smoke tests do not replace this round trip.

## Troubleshooting

| Symptom | Next check |
| --- | --- |
| `opencode` is V1 or not found | Install V2 with approval; set `OPENCODE_PATH` if needed. A missing custom service registration must be handled by its owner. |
| Dashboard disconnected but sessions exist | Ensure the dashboard inherits Kimaki's PATH; see [PATH troubleshooting](../README.md#troubleshooting-disconnected-with-existing-sessions). |
| Manager works but chat is off | Confirm the fork was prepared and activated, not just installed; an existing regular bot is intentionally reused. |
| New installation has no conversations | Check project registration, then create a linked conversation in that project. Only Discord-linked sessions appear. |
| Discord ignores the user | Check Kimaki's [access control](https://kimaki.dev/#access-control); authorization and model login are separate requirements. |
| Windows window cannot connect | Check WSL interop/localhost forwarding and `%LOCALAPPDATA%\ThreadDeck\launcher.log`; use **Open startup log** on the loading screen. |
| Port conflict | Resolve it with the owning application or use a free `PORT`; development also needs `PORT + 1`. Preserve other processes. |

For deeper chat limits, data locations and maintenance, read [local chat](local-chat.md).
Interactions marked **Respond in Discord** still require Discord; they are not
failed setup checks. For updates, preserve local work, install dependencies, prepare
the fork again, and rerun `npm run desktop:install` for Windows shell updates.
Activation of an updated fork still requires a deliberate, idle handoff from the
old bot's owning launcher. Never wipe Kimaki/OpenCode data to fix onboarding.
