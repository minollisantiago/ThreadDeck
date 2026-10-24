# ThreadDeck as a keyboard-first Kimaki client

Status: agreed product decisions consolidated on 2026-10-24; implementation pending.

## Feasibility result

The installed Kimaki 1.4.0 does not expose a supported delivered-message history,
live message-change feed, or interaction-answer interface. Ordinary CLI sends also
do not necessarily publish a corresponding user message in Discord. Therefore the
full experience below cannot currently be implemented using existing supported
interfaces alone. Do not proceed by substituting raw OpenCode messages.

Agreed approach: maintain a local Kimaki fork with a small client bridge for canonical
input publication, linked-thread snapshots/deltas, typed interaction actions, and
project-aware command/skill discovery. No Kimaki modification is implemented by
this document. Dashboard/composer fixture work can be independent,
but does not resolve the transport gate.

## Product boundary

- OpenCode remains the harness. Kimaki owns conversation creation, prompting,
  delivery, commands, and the Discord relationship.
- Display only Kimaki-linked sessions. Do not create standalone OpenCode sessions.
- Display Kimaki's delivered conversation, not a reconstruction from raw OpenCode
  messages. Semantic parity includes message ordering, edits, attachments,
  callouts, and interactive actions; visual styling can differ from Discord.
- Reuse existing infrastructure through an explicit interface in the local fork.
  Do not have ThreadDeck read Kimaki's database, scrape Discord's UI,
  expose bot credentials to the browser, or import undocumented internals as a
  production integration.
- No second model runtime or agent loop. Chat components are presentation only.

See [Kimaki integration research](research/kimaki-chat-integration.md) for the
receive-side feasibility findings and capability gaps.

The proposed local-fork interface is drafted in
[Kimaki client bridge design](kimaki-client-bridge-design.md). It is not implemented;
upstream acceptance is not a requirement.

## Existing ThreadDeck seams

- `server/source.ts`: authenticated OpenCode discovery, event subscription, and
  session status. This is useful for dashboard status, not Discord message parity.
- `shared/model.ts`: session identity already includes `threadId` and `guildId`.
- `server/http.ts`: read-only GET routes and snapshot SSE. Writes require explicit
  routes, validated bodies, size limits, origin protection, and session allowlists.
- `server/index.ts`: loopback-only backend; keep credentials and file fetching here.
- `src/App.tsx`: dashboard state and global shortcuts. Preserve grouping/filtering
  behavior while introducing a selected conversation and scoped keyboard handling.
- `src/components/conversation-search.tsx`: keyboard selection and focus restoration
  can be reused conceptually; search results should open the internal conversation
  with a secondary Discord action. Existing history search indexes OpenCode text,
  so its excerpts are not proof of Kimaki-delivered content.
- `electron/policy.cjs` and `electron/preload.cjs`: external handoffs currently allow
  Discord links only. General Markdown links and attachment downloads need an
  explicit safe navigation policy, not a blanket relaxation of Electron security.

These are observations of the current code, not instructions to overwrite current
uncommitted dashboard work.

## Conversation UI

Approved presentation: **Stream (prototype A)**, with the existing ThreadDeck
mobile-style manager as the sidebar. Reuse current typography, theme tokens,
containers, borders, badges and spacing rather than introducing a new visual
system. Turn cards and Notebook are not production requirements.

Keep the current narrow manager-only view and project/state grouping. Use only one
conversation pane. In a wide chat workspace, the manager is a collapsible sidebar
with a draggable divider, capped at 40% of usable app width and further constrained
by the minimum usable chat width. Remember sidebar width and collapsed preference.
Exact dimensions/breakpoint will be validated in the prototype.

In narrow windows, chat fills the window and the manager opens as an overlay drawer.
The 40% cap does not apply to this drawer. Selecting a session closes it. Opening
or closing the drawer preserves the conversation position and draft. The expanded
composer fills only the conversation pane and leaves the sidebar unchanged.

Render Markdown safely, including fenced code, tables, links, and Kimaki callouts.
Keep conversation content and harness diagnostics distinct. Preserve scroll when
reading history; only follow new messages while already at the bottom. Restore
per-session scroll and focus on switching back.

- Display Kimaki-delivered activity collapsed by default where available; do not
  add raw harness output to fill gaps.
- Render questions, buttons and permissions inline; completed controls are inactive.
- Show a New messages action when the reader is not at the bottom. Responses and
  requests never steal focus. Search opens the matching message in context.
- Keep local unread receipts independent of Discord. Viewing the latest response
  marks it read here; responses arriving during HTML preview remain unread.

### One draft, two composers

The compact composer grows to a maximum height and then scrolls. An explicit
shortcut expands the same draft to fill the conversation pane. Use CodeMirror 6
with Markdown support and optional Vim bindings in the expanded composer.

- Enter inserts a newline. Send and queue are deliberate, separate actions.
- Escape in Vim insert mode changes editor mode; it must not close the composer.
- Persist unsent text per session, including separate new-conversation drafts.
- Text and cursor survive app restarts. Remember the optional Vim preference
  globally; compact input is ordinary text editing, not Vim.
- Preserve attachments on session switches; flag files unavailable after restart.
- Preserve selection/cursor when changing composer size or switching sessions.
- Clear a submitted draft only after confirmed harness submission, not merely an
  HTTP receipt or Discord publication. Keep failed or uncertain submissions.
- Define whether undo survives unmounts; do not promise reload-persistent undo.
- Never silently overwrite a draft with a historical prompt or another tab's edit.

The [Vim extension's usage guide](https://github.com/replit/codemirror-vim/tree/master/packages/codemirror-vim)
requires Vim before other keymaps and exposes mappings and Ex-command extension
points. Treat any custom send/close binding as application behavior, not a Vim
default. Use [shadcn AI Elements](https://ui.shadcn.com/docs/ai-elements) selectively
for presentation without adopting a second agent runtime.

### Keyboard scopes

Use a central action registry shared by shortcut help and the command palette.
Prioritize focused controls, editor/Vim, modal dialogs, then application shortcuts.
Ignore composition events, preserve native accessibility, and avoid stealing
browser/Electron shortcuts. No Vim-style navigation in chat or the manager.

Agreed bindings:

| Shortcut | Action |
| --- | --- |
| `Ctrl+P` | Focus composer |
| `Ctrl+P`, then `P` | Toggle expanded composer and focus it |
| `Ctrl+Tab` | Open fuzzy session finder in desktop |
| `Ctrl+K` | Open fuzzy session finder in desktop and browser |
| Double Space | Additional finder shortcut outside editable fields/controls |

The composer chord accepts a quick second P with Ctrl either held or released;
consume it without inserting P. The first press focuses the composer immediately.
Define/test a short chord window in the prototype. Prevent native Print only when
handling Ctrl+P in the app. Ignore repeats and text composition. Browser Ctrl+Tab
remains browser-owned. The finder starts typing immediately, shows recent sessions
for an empty query, supports arrows/Enter, and restores prior focus on Escape.
Use the composer chord to restore compact mode; Vim Escape never closes it.

Required actions: session finder, recent session, next attention-needed session,
focus composer, expand/restore composer, find within conversation, next/previous
 turn, send, queue, attach files, command palette, and shortcut help. Preserve the
existing double-Space finder outside editable fields and controls.

### Attachments and HTML

- Outgoing: file picker, preview/remove controls, validated size/type, and Kimaki's
  supported attachment submission. Do not turn user-controlled paths into shell.
- Incoming: inline images with full-size viewer; file cards with download actions.
  Preserve original ordering and refresh expired attachment URLs through a trusted
  backend capability. Do not implement an unrestricted URL-fetch proxy.
- HTML: explicit Preview / Source / Download for HTML attachments or deliberately
  selected HTML code fences. Never interpret arbitrary chat text as executable HTML.
- Opening HTML preview replaces the entire conversation pane, not the sidebar.
  Back to chat and Escape return with chat scroll/draft preserved. Source and
  Download remain available. Incoming messages never interrupt the preview.
- Preview in an isolated sandbox with restrictive CSP: no scripts, remote requests,
  parent access, forms, navigation, or privileged Electron bridge. Disable preview
  when isolation cannot be guaranteed. Static preview need not faithfully reproduce
  a page that depends on external resources or JavaScript.

## Sending and recovery

- Idle primary action: Send. Working primary action: Queue, with Send now /
  interrupt an explicit secondary choice. Existing agreed send shortcuts are
  Ctrl+Enter for send and Ctrl+Shift+Enter for queue.
- Keep pending operations distinct from confirmed transcript messages. Explain
  publication success followed by harness-submission failure as separate stages.
- Reconcile uncertain delivery; never automatically resend or offer an apparently
  harmless Retry for an action that may have executed.
- Stop warns when Kimaki also clears queued prompts. Show queued prompts and allow
  editing/removal only where the bridge actually supports those actions.

## Local maintenance strategy

Personal use, optionally shared with friends running their own local instances.
Maintain the bridge in a local Kimaki fork; no upstream proposal, contribution,
maintainer approval or merge is planned/required. Pin a tested Kimaki version,
isolate bridge changes, and deliberately review/merge significant releases with
compatibility checks. Version the bridge interface and fail clearly on mismatch.
Document independent setup; never distribute personal credentials or session data.

## Delivery sequence and acceptance gates

1. **Fixture prototype first.** Validate the agreed layout, composer, shortcuts,
   drafts and preview-return flow without changing production dashboard behavior.
   Label fixtures clearly; no real prompts, bot restarts or invented connectivity.
2. **Transport proof.** Establish the local-fork interface for Kimaki-delivered
   history and live create/update/delete events, outgoing prompts, attachments,
   and session/thread identity. Document which commands and interactions are
   available. Do not silently fall back to OpenCode text if parity is unavailable.
3. **Read-only conversation.** Paginated history plus incremental delivery,
   message-ID deduplication, reconnect reconciliation, Markdown, and attachment
   rendering. Prove edits and messages sent from Discord appear correctly.
4. **Write actions.** Existing-session prompt/queue and new linked conversation.
   Include pending/accepted/failed/unknown delivery states. Never automatically
   retry an ambiguous send unless the transport guarantees idempotency.
5. **Commands and interactions.** Discover capabilities from Kimaki/OpenCode where
   supported; distinguish Discord slash interactions from prompt commands and
   skills. Cover buttons, permissions, forms, cancellations, and stale actions.
6. **Safe HTML previews.** Verify isolation in both the browser and Electron shell
   before enabling previews for real attachments.

Minimum end-to-end checks: create here and continue in Discord; create in Discord
and continue here; identical delivered text/attachments; send while working;
disconnect/reconnect without duplicates; failed/ambiguous submission retains draft;
session switching retains drafts and scroll; Vim Escape does not dismiss editing;
all core navigation works without a mouse; untrusted Markdown/HTML cannot execute
code or access privileged resources.

## Implementation status

The approved Stream direction now has a first production slice: see
[local chat setup and remaining limits](local-chat.md). The local fork has been
prepared separately; activation and live Discord tests remain explicit gates.
Native interaction answers and queue editing are still deferred, not silently
implemented through raw harness calls. The earlier
[fixture prototype](chat-workspace-prototype.md) remains an experimental reference.
