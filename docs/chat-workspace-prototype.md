# Chat workspace prototype

Branch: `prototype/kimaki-chat-workspace`. Throwaway, synthetic data only.

**Selected direction: A — Stream.** User approved the restyled Stream layout on
2026-10-24. Preserve the existing ThreadDeck mobile sidebar and shared visual
language. B/C remain prototype comparisons, not production requirements.

**Question:** does the manager → conversation → compact/expanded Vim composer →
session-switching flow feel right? Also compare three transcript structures without
changing the agreed single-pane/sidebar layout.

## Visual continuity

The sidebar is the existing narrow/mobile ThreadDeck design, not a new compact
navigation treatment. It imports the real `styles.css`, uses the existing buttons,
inputs, filters, session rows, project collapse/unread controls, state panels and
optional islands view. Production mobile CSS is applied to the sidebar container
even in a wide desktop window. Production dashboard files remain unchanged.

Typography throughout the prototype uses the existing JetBrains Mono family and
theme tokens; the experimental sans/serif transcript faces, tiny custom sidebar
type, and separate mauve palette have been removed. Chat geometry, keyboard flow,
expanded composer and full-pane previews remain intact. Appearance controls use
the real app's palettes and dark/light backgrounds, stored only as prototype
preferences. DEMO replaces LIVE so fixture data is not presented as a connection.

## Run

```sh
npm install
npm run prototype:chat
```

The command builds and serves only the fixture entrypoint on loopback port 43139
(`PROTOTYPE_PORT` overrides it). It does not start the real dashboard, Kimaki,
OpenCode, or a proxy to their interfaces. Temporary output lives under
`/tmp/opencode` by default. Quit with Ctrl+C.

For a single downloadable file instead of a running server:

```sh
npm run prototype:chat -- --export
```

Open `artifacts/chat-workspace-prototype/ThreadDeck-chat-prototype.html` in a browser.
It contains its own JavaScript, styles, font and fixture images; no server or
external resources are required. File-origin storage availability depends on the
browser. It contains no real conversation data or credentials.

## Compare

The same page accepts `?variant=A`, `?variant=B`, or `?variant=C` and has a floating
switcher. Left/right arrows switch variants outside editing fields and controls.

- **A — Stream:** separate conversational turns, inline artifacts, docked composer.
- **B — Turn cards:** paired prompt/answer cards with numbered turn sections.
- **C — Notebook:** document reading surface with prompts treated as margin notes.

All share the same draft/session/preview state. The prototype control bar is
present only in the explicit `prototype` build mode. No fixture entrypoint is
imported by the production application.

## Try the flow

1. Drag the sidebar divider (430px minimum, 40% app-width maximum); collapse it,
   or use Manager only. Below 1080px it becomes an overlay drawer.
2. `Ctrl+P` focuses the composer; a quick second P (within 550ms, with Ctrl held or
   released) expands/restores it. Toggle Vim in the expanded editor. Escape returns
   to normal mode, not chat. The chord window is provisional, not a settled timing.
3. `Ctrl+K` opens fuzzy session search; arrows/Enter select, Escape returns.
   Double Space works outside inputs/controls. `Ctrl+Tab` is reserved for desktop
   integration and is not intercepted in an ordinary browser.
4. Write separate drafts in several sessions; switch away and back, then reload.
   Text/cursor, sidebar preference and Vim preference use only the isolated
   `threaddeck:chat-prototype:v1` storage key. Undo is not persisted.
5. Attach files to exercise attachment chips/removal. Only metadata is staged in
   this prototype; file bytes are not uploaded or retained. Reload flags files as
   unavailable. This is not a production attachment implementation.
6. Open the sample HTML attachment: the preview replaces the chat pane, leaving
   the manager untouched. View source/download or return with Back to chat/Escape.
   It is an inert static sandbox with no script/network/parent privileges. A
   parent-owned scroll surface keeps keyboard focus outside the sandbox.
7. Use Fixture lab to simulate a reply, working state, successful send, harness
   failure after publication, or uncertain delivery. Failures retain drafts.
   Ctrl+Enter simulates send, Ctrl+Shift+Enter queues. Queued fixture prompts can
   be edited/removed. Stop confirms queue clearing. Nothing is actually published.

Replies, queue state, action selections, unread markers and scroll positions are
in-memory fixtures. Drafts/preferences intentionally persist because their
lifecycle is being evaluated. Reset that scratch storage from Shortcuts.

## Validation and next decision

Existing production build and 136 existing tests pass. Browser smoke exercises
cover chord focus/expansion, Vim Escape, fuzzy switching, retained drafts/reload,
HTML return, uncertain delivery, narrow drawer and horizontal overflow. These are
prototype checks, not production coverage of a Kimaki integration.

Stream is the approved transcript direction. Validate remaining interaction
details such as chord timing, then rewrite the chosen rendering for production.
Do not promote this throwaway file directly or claim that its simulated controls
prove the bridge works. No Kimaki installation/fork has been modified.
