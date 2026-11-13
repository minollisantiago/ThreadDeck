# Schedules: ThreadDeck integration constraints

Research notes for future UI mockups; not an implementation or approved design.

## Existing layout

- The session dashboard lives inside `ChatWorkspace`, not a conventional routed
  application (`src/App.tsx:205-209`). Its header, overview, filters and project
  list are all inside the manager/sidebar (`src/App.tsx:159-201`).
- The sidebar starts at 430px and is limited to 30% of the viewport on wide
  screens. Narrow screens use a drawer instead (`src/chat/workspace.tsx:17`,
  `src/chat/workspace.tsx:61-63`, `src/chat/workspace.tsx:173-189`). A full
  schedule editor should not be squeezed into this sidebar.
- Workspace navigation currently selects a conversation or a new-conversation
  draft. There is no existing general-purpose page router
  (`src/chat/workspace.tsx:53-75`, `src/chat/workspace.tsx:176-201`).
- Project discovery demonstrates the existing modal pattern: native dialog,
  Escape/backdrop dismissal, and focus restoration
  (`src/chat/workspace.tsx:48-51`). This is a useful reference for an editor or
  confirmation, rather than proof that the entire schedules section should be
  modal.

## Mockup directions to compare later

1. **Workspace section:** a visible Conversations / Schedules switch, with the
   schedules overview and selected routine occupying the main workspace. More
   room for management, but requires deliberate handling of the selected chat,
   draft, composer shortcuts and return navigation.
2. **Management dialog:** a visible Schedules entry opens a roomy list/detail
   dialog above the current workspace. Less navigation work and preserves chat
   context, but nested edit/confirmation dialogs can become cumbersome.

For either direction, compare an overview, selected-routine detail, and editing
state before deciding. Include narrow layouts, no schedules, unavailable data,
and an operation whose result is uncertain. Do not mock unsupported controls as
working features; scheduler capabilities are researched separately.

## Backend boundary

- Add a dedicated schedules service/handler rather than mixing management into
  the read-only snapshot endpoint. The server already dispatches chat, projects
  and sessions before its generic API handler (`server/index.ts:19-30`);
  the latter rejects non-GET requests (`server/http.ts:23-26`).
- Reuse loopback/same-origin protection and bounded JSON request bodies.
  Project management provides an existing example
  (`server/projects.ts:66-89`, `server/http.ts:5-11`).
- Existing project operations use `execFile` with an argument array and timeout,
  not interpolated shell commands (`server/projects.ts:20-22`). Preserve that
  boundary if scheduling integrates through the CLI.
- Keep schema validation shared across server/client, following the project
  browser (`src/chat/project-browser.tsx:3-4`,
  `src/chat/project-browser.tsx:21-25`). Keep scheduler availability separate
  from chat availability.
- Do not blindly retry mutations after a timeout: existing project registration
  explicitly tells the user to refresh and confirm the outcome first
  (`docs/project-discovery.md:19-22`). This is especially important for Run now.

## Interaction checks for implementation

- Leaving schedules restores the conversation and unsent draft without sending
  anything, changing unread state or accidentally focusing a hidden composer.
- If schedules replaces the conversation pane, desktop notifications must no
  longer regard that hidden conversation as viewed. Define whether opening a
  notification exits schedules, with a dirty-edit guard if needed. The current
  desktop integration reports the selected conversation as viewed and opens
  notified sessions directly (`src/chat/workspace.tsx:76-85`;
  `src/chat/desktop-navigation.test.tsx:14-40`).
- Conversation-specific keyboard shortcuts do not submit or navigate behind
  the schedules editor. Existing shortcuts are centralized in
  `src/chat/workspace.tsx:112-152` and currently guard native open dialogs.
- Confirmations identify the exact routine and destination; pending mutations
  disable repeated activation. Timeout messaging distinguishes failure from an
  unknown outcome.
- Cached or stale data is visibly distinct from current scheduler state. An
  unavailable service must not look like an empty list.
- Display timezone and schedule semantics explicitly; do not silently translate
  a local clock choice into a different recurrence.
- Preserve existing theme, keyboard and narrow-screen behavior, with tests for
  focus restoration, Escape, validation errors and service outages.
