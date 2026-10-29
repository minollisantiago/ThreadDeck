# Project activity indicator

The selected placement is **A — Header activity pill**. In the classic project list, activity
appears beside the session/unread counters rather than on a second line below the project name.
The islands layout reuses the same indicator in its existing header statistics area.

The original 3×3 CSS matrix animation is inspired by the inline `matrix` loader in
[Generative Loaders](https://generativeloaders.com/docs#components). No additional dependency or
runtime request is needed. Animation affects only opacity and transforms, never layout.

- A fixed-width slot remains reserved while idle to prevent activity-driven header shifts.
- Only verified working sessions animate. Stale status shows a static question mark and `—`.
- Reduced-motion preferences replace animation with a static matrix.
- The compact visual count caps at `99+`; the tooltip and accessible label retain the full count.
- At narrow card widths, metadata is compacted and the session-total pill is hidden below 370px.
  The project toggle's accessible description still includes the session total and attention state.

The earlier tooltip and unread badge changes are separate commits (`a3e2e87` and `2b16529`).
The alternatives are archived on `prototype/project-activity-studies` at `12b1460`.

Decision: https://discord.com/channels/1526236793048141935/1564730499048677486
