# Local Stream chat: implementation and activation

This is the first production slice, on `prototype/kimaki-chat-workspace`.
The running Kimaki installation is not modified or restarted by preparing it.

## Implemented

- Approved Stream conversation pane with the existing narrow/mobile dashboard as
  its resizable sidebar. Same typography, colors, cards, filters and grouping.
- Ctrl+P focuses drafting; Ctrl+P then P expands/restores the Markdown/Vim editor.
  Ctrl+K opens fuzzy session search; desktop also supports Ctrl+Tab. The existing
  history index remains available from the finder. New conversation chooses a
  registered project before the first prompt creates its linked thread/session.
- Versioned, same-origin backend routes. Only the backend reads Kimaki's local
  lock token; the browser never receives bot or lock credentials.
- Published Discord-message snapshots, pagination, long-polled Gateway changes,
  edits, deletions, Components V2 text/callouts and ordered file attachments.
  No raw OpenCode transcript is substituted when the bridge is unavailable.
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
never advertise native interaction answers.

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

## Activation is a separate, deliberate step

Stop the existing dashboard/Kimaki launcher yourself, then run one of:

```sh
npm run kimaki:local
npm run kimaki:local -- --desktop
```

These build the dashboard and start the prepared fork, preserving the existing
`--if-not-running` safety. They do not evict a running bot. Do not run both old and
new launchers concurrently. The Windows installed shortcut is not automatically
rewired by preparation; use the explicit local command until that launcher has
been updated deliberately. No remote/upstream contribution is required.

Activation changes the bot process and refreshes Kimaki's normal CLI/plugin shim;
it must not be performed silently during a Discord session. A live Discord smoke
test (one authorized test project/thread, first prompt, queue, screenshot, and
continuation from both clients) still needs to be performed after activation.
Unit/browser fixtures are not evidence of a live model turn.

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
npm run kimaki:prepare
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
