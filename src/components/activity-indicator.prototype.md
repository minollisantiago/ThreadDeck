# Working indicator placement — fixture-only studies

Question: where should project-level working activity live without creating a second header row?
Run `npm exec -- node scripts/activity-indicator-prototype.mjs`.

- **A — Header activity pill:** reserves a compact activity-count slot alongside header counters.
  Strong explicit signal; consumes some horizontal space, even while idle.
- **B — Channel icon signal:** turns the existing hash icon into an activity mark with a small count.
  The most compact option; meaning is conveyed by color/icon and a hover/focus tooltip.
- **C — Always-present footer:** reserves a 28px status footer for idle, running and stale states.
  Most explicit, and never shifts on state changes, but every card is taller.

Parameters: `variant=A|B|C`, `activity=running|idle|stale`, `case=normal|long|many`,
`theme=dark|light`, `width=fit|320|390|430|768|1440|1920`.
Bottom arrows and keyboard left/right cycle variants; Pause/Start all changes the activity state.
Cards can collapse, unread badges can be cleared, and the real create-button tooltip is available.
All data and actions are local fixtures; no real sessions, uploads or settings are changed.

This is a project/card header experiment, not an assistant-message activity experiment. The
production working placement remains unchanged until a variant is selected. It also shows the
production unread badge color fix and the current-project shortcut tooltip, which are independent
small UI changes rather than part of the placement decision.

Visual inspection covered 324 state combinations: three variants, two themes, normal/long/multiple
working scenarios, 320/390/430/768/1440/1920px viewports, and running/idle/stale states. Card and header
heights remained stable across activity transitions; no horizontal overflow was observed.
