# Local Stream chat: implementation and activation

This is the first production slice, on `prototype/kimaki-chat-workspace`.
The running Kimaki installation is not modified or restarted by preparing it.
The normal Windows launcher now prefers this fork automatically when it needs to
start a bot, with bounded retries and an explicit regular-bot fallback.

## Implemented

- Approved Stream conversation pane with the existing narrow/mobile dashboard as
  its resizable sidebar. Same typography, colors, cards, filters and grouping.
- Ctrl+P focuses drafting; Ctrl+P then P expands/restores the Markdown/Vim editor.
  Ctrl+K opens fuzzy session search; desktop also supports Ctrl+Tab. The existing
  history index remains available from the finder. New conversation chooses a
  registered project before the first prompt creates its linked thread/session.
- The hamburger's keyboard button opens **Keybinds / Commands & skills**. The live
  project catalog is searchable, shows descriptions and exact invocation syntax,
  and never advertises unsupported bot-management commands as app actions. Empty,
  loading and failure states keep the same dialog height as the keybinds section.
- Versioned, same-origin backend routes. Only the backend reads Kimaki's local
  lock token; the browser never receives bot or lock credentials.
- Published Discord-message snapshots, pagination, long-polled Gateway changes,
  edits, deletions, Components V2 text/callouts and ordered file attachments.
  No raw OpenCode transcript is substituted when the bridge is unavailable.
  Opening an existing thread fetches its latest 50 published messages; **Load
  earlier messages** pages backward by 50, including history predating installation.
- Plain prompts, native queue submission, native project commands and typed skill
  invocation through Kimaki. Skills that cannot be queued are explicitly rejected.
- Canonical bot-authored input messages attributed to the local operator, published
  before harness dispatch using Kimaki's own Markdown packing/formatting. Durable SQLite operation receipts and request-ID/hash
  deduplication prevent silent automatic retries. Ambiguous outcomes remain guarded.
- Per-session draft text/selection, conflict detection for other windows, staged
  attachment chips, and preserved reading position. A confirmed harness submission
  clears only a matching draft, not text edited while the operation was pending.
- Backend-only attachment fetching with URL refresh from the original message,
  restricted CDN hosts, no redirects, and size limits. Static HTML Preview / Source /
  Download replaces only the chat pane; DOMPurify, CSP, an inert sandbox, and no
  script/network permissions protect the app. Escape returns to the conversation.

## Explicitly not complete yet

- Answering Discord buttons, questions, permissions, upload-request modals and
  actor-scoped feedback inside ThreadDeck. These remain clearly marked **Respond
  in Discord**. No forged Discord interactions or direct harness replies are used.
- Editing/removing the native queue, bot-administration slash commands, arbitrary
  shell shortcuts, remote-machine forwarding and multi-user authentication.
- Exactly-once distributed side effects. If publication/dispatch becomes uncertain,
  inspect the operation and Discord before explicitly resolving the delivery guard.
- Offline-complete history: after an unresumable connection gap the active page is
  refetched. Previously loaded older history may require loading again. Deleted
  messages and historical ephemeral responses cannot be recovered.
- Interactive JavaScript HTML artifacts. Previews are intentionally static; use
  Source/Download when the page requires scripts or external resources. The height
  slider controls the isolated document's parent-owned scrolling surface.

The first version uses Kimaki's existing authenticated POST lock transport, with
`client.info`, `client.snapshot`, `client.changes`, `client.submit`,
`client.operation`, `client.catalog`, `client.file`, `client.threads`, and
`client.abort`. This is a concrete local-fork contract, not the hypothetical REST
route list in the original design proposal. `info.protocol` is 1; capabilities
never advertise native interaction answers. Current prepared builds also expose
`info.ready`, requiring a ready Discord client and connected OpenCode.

## Prepare without activation

```sh
npm install
npm run kimaki:prepare
npm run kimaki:test
```

The preparer installs a separate pinned Kimaki **1.4.0** baseline under
`~/.local/share/threaddeck/kimaki/base`, then copies it to an immutable hashed fork
directory. It retains the shipped source, compiled files, skills and dependencies;
it does not patch an npx cache, replace the running executable, write the current
shim, or launch a bot. Strict source anchors fail closed on version changes.

Tracked downstream changes live in `integrations/kimaki/` and the preparer:
one authenticated route dispatch seam, one catalog export, and an explicit
setup-only option for creating a linked session without running its first prompt.
The bridge otherwise calls the existing Kimaki semantic prompt/session methods.
Source changes create a new hash; an older running fork is never overwritten.

`~/.local/share/threaddeck/kimaki-fork.json` records the prepared executable.
`THREADDECK_DATA_DIR` overrides this root and must be consistent between the
dashboard and fork. Existing `KIMAKI_DATA_DIR`, `KIMAKI_LOCK_PORT`, gateway settings
and OpenCode discovery continue to apply. Node 24+ is required.

Optionally set `THREADDECK_DISCORD_USER_ID` to your own Discord user ID when
starting the fork so it can add you to newly created threads. This controls thread
membership only; input remains bot-authored and attributed to the local operator.
Without it, join the new thread in Discord manually if it is absent from your
sidebar. Membership still depends on Discord/guild permissions.

## Launch, reuse and fallback

For the installed Windows app, run `npm run desktop:install` to refresh the native
shell and shortcuts, then open **ThreadDeck** normally. Or launch from the WSL
project directory:

```sh
npm run kimaki:desktop
# Explicitly select the prepared local manifest:
npm run kimaki:local
npm run kimaki:local -- --desktop
```

The installed shortcut and shared terminal launchers use the fork-first startup
wrapper. They reuse a healthy running bot, including a regular one, rather than
replacing it. The desktop launcher also reuses an existing backend. To deliberately
switch versions, stop the current bot's owning launcher yourself first, while idle.

If no bot is running, try the prepared fork up to **3 times total**, with 1s/2s
backoff and owned-process cleanup. Bot and bridge readiness are checked, not just
process creation. Missing/incompatible preparation skips directly to regular
Kimaki; known auth/config errors skip redundant fork retries. Regular Kimaki gets
one startup attempt. If it also fails, startup shows an error. An unready external
bot is left untouched, not terminated to enable fallback.

The native shortcut shows **Running regular Kimaki—desktop chat unavailable**
during fallback and **REGULAR · CHAT OFF** in the title bar after handoff. Manager
and Discord access remain available, as does drafting; no raw OpenCode transcript
or unmirrored chat submission is substituted. Terminal launchers report the mode
in their startup output. Full process/readiness details: [Windows launcher](windows-launcher.md).

Preparation never replaces a running fork. Starting a newly selected bot refreshes
Kimaki's normal CLI/plugin shim. Do not switch a live bot silently during a session.
No upstream contribution is required, and no credentials are bundled with the fork.

### Roll back to regular Kimaki

Stop the fork's owning launcher while idle, then use the ordinary upstream command:

```sh
npx --yes kimaki@latest --gateway
```

Then open ThreadDeck; it reuses that regular bot rather than preferring a second
fork process. Discord threads, saved drafts and receipt files remain on disk.
Regular Kimaki does not expose the chat bridge or interpret fork delivery receipts.
Do not clear an uncertain submission guard without checking its Discord outcome.

### Verification so far

A user-authorized live smoke test created a linked thread, published an attributed
ThreadDeck prompt, submitted it through Kimaki, received the exact model reply,
and read that reply back as an actual Discord message:
[test conversation](https://discord.com/channels/1526236793048141935/1563511148848881844).
That is evidence of the basic live path, not full interaction parity. Live queue,
attachment, reconnect, and bidirectional continuation checks remain broader smoke
test work; questions/buttons/permissions are explicitly still Discord-only.
Launcher retries/fallback and cancellation are tested offline, not by repeatedly
restarting the production bot. Unit/browser fixtures do not prove a live model turn.

## Local limits and maintenance

- Uploads: 10 files per prompt, 10 MiB per file, 128 staged files / 256 MiB staging
  budget. Files are private, opaque-ID addressed, and preserve safe extensions for
  harness media detection. They are not automatically deleted while an agent may
  still reference their paths. Clean up only files no longer needed by any run.
- Prompts: at most 50,000 characters; an oversized draft is kept, not truncated.
- On browser reload, attachment chips require explicit reattachment; text and
  selection are restored. Drafts, receipts and uploads can contain private work.
- HTML preview limit: 2 MiB. Other files up to 10 MiB are downloadable.
- Projection: 24 threads, 250 cached messages each, 500 recent deltas; expired
  cursors cause explicit resnapshot rather than pretending no events were lost.
- Receipts persist in `KIMAKI_DATA_DIR/threaddeck-operations.sqlite`; an interrupted
  accepted operation becomes unknown after restart and is never replayed blindly.
- Local OS operator is the trusted principal. This is not Discord-user identity or
  a remotely exposed chat service. The local backend trusts processes that can
  access this workstation's loopback interface; do not use it on an untrusted
  multi-user/shared host. Friends need independent installs/credentials.
- Review significant upstream releases, update the pinned baseline and patch
  anchors, then rerun checks. Never automatically merge new Kimaki internals.

## Checks

```sh
npm test
npm run test:desktop
npm run test:chat:browser
npm run test:browser
npm run kimaki:prepare
npm run kimaki:test
```

Browser checks use a static asset server and synthetic HTTP responses, not the
real backend or Discord. They exercise drafts, focus/chords, delivery guards,
HTML isolation and narrow layout. Preparing the fork syntax-checks its main entry
and runs only `--help`; it does not start OpenCode or Discord connections.
`kimaki:test` additionally exercises the actual prepared adapter and native Kimaki
prompt/skill/queue code against in-memory transports and a private scratch folder.
Legacy dashboard visual checks mount the real Dashboard in a test-only standalone
entry to preserve its previous wide/narrow component contract. The Stream checks
exercise the actual production application entry and its compact sidebar context.
`scripts/kimaki-launcher.test.js` verifies startup retries, race-safe reuse, cleanup,
fallback, and cancellation, including a synthetic child with a fake lock/bridge.
