# Attachment row studies — throwaway, fixture-only

Question: which one-line structure should replace non-preview file cards? **Screenshot thumbnails
and audio/video players that already have a preview are not being redesigned.** Nothing here sends
messages, uploads files, reads disk content, changes settings, or changes production rendering.

Run `npm exec -- node scripts/attachments-prototype.mjs`. Open the printed URL.

- `?variant=A`: separate quiet rows, 48px desktop / 44px narrow.
- `?variant=B`: one shared file list with aligned metadata and action columns.
- `?variant=C`: compact content-width strips, wrapping as a collection on wide screens; each file
  remains one line. Narrow screens use full-width strips.

The bottom arrows and keyboard left/right switch variants. Other controls persist in the URL only:

- `case=reports|types|mixed|draft|edge|all` — reports, HTML preview/download, CSV, ZIP, JSON, Markdown,
  unpreviewable video, mixed screenshot+files, staged/uploading/failed/reattach/outgoing states,
  empty file, missing size, Unicode, long names, and single attachments.
- `width=fit|320|390|430|768|1024|1440|1920` — the complete fixture workspace is container-responsive.
- `theme=dark|light` — existing ThreadDeck color tokens.

Every proposed file row keeps icon → bounded, ellipsized filename → size → icon-only ghost actions.
Filename hover/focus shows the full name; icon actions have tooltips and accessible names. Buttons
simulate their intent. A staged file has readiness/removal controls instead of a download for a
file that is not yet published. Missing file sizes are represented honestly rather than invented.

**Implementation considerations after selection:** staged upload metadata currently lacks the file
size, so the real upload/draft contract would need to preserve it to show size before sending.
Unknown size uses `—`. Existing HTML trust consent and existing image thumbnails stay untouched.

Visual coverage: all three alternatives were rendered in both themes, across all six scenarios and
320, 390, 430, 768, 1024, 1440 and 1920px viewports (252 combinations). No horizontal overflow,
overlapping metadata/actions, or multi-line file rows was observed. Tooltip and keyboard switching
were also exercised. This is prototype inspection, not a production regression suite.
