# Proposal inbox

**Proposals** sits beside Threads and Schedules. The existing project/channel tree, search, filter tabs and right-hand detail pane are reused. Filters are Inbox, All, In progress, Snoozed, Done and Dismissed. Decisions survive app reloads and discovery runs. Snoozes last 24 hours and return on the next read/refresh after they expire.

## Review and start work

The empty inbox cycles through four chat-avatar scenes every 12 seconds: folder inspection, inbox fishing, a coffee break, and bug patrol. The copy stays centered. Animation can be paused, stops while the app is hidden, and respects reduced-motion preferences. **Scan projects** opens the configured discovery routine in Schedules; its existing **Run now** confirmation starts the scan. Merely opening the inbox or selecting this shortcut never dispatches an agent.

Open a proposal to inspect its rationale, evidence and initial prompt. An optional decision note explains a dismissal or snooze. **Start session** opens an editable prompt and an approach selector. Confirmation creates a real session/thread in that proposal's project through the existing local chat bridge. It does not overwrite a conversation draft.

Session creation is durably recorded before contacting Kimaki. Duplicate clicks/replayed requests do not resubmit. Proposals become In progress only after a receipt confirms both session and thread IDs. Open the linked session to continue the work. Completion is explicit **Mark done**, not an inference from an idle agent.

If delivery is uncertain, **Check delivery status** reconciles the same operation; it never resends. **Resolve delivery guard** is a manual escape hatch only after inspecting Discord. It does not undo an existing session. Returning a linked proposal to Inbox still preserves its session and will not launch another automatically.

## Routine and CLI ingestion

Storage is local SQLite at `$THREADDECK_DATA_DIR/proposals.sqlite`, defaulting to `~/.local/share/threaddeck/proposals.sqlite`. Both the app and CLI use `server/proposal-store.ts`; SQLite transactions serialize concurrent writers. Back up the database with its WAL/SHM files using SQLite-aware backup practices, or stop writers first.

```sh
npm run --silent proposals -- list
npm run --silent proposals -- ingest /tmp/opencode/proposals.json
```

The JSON file is an array, at most 100 entries per ingestion:

```json
[
  {
    "projectId": "100000000000000001",
    "key": "draft-recovery",
    "title": "Keep drafts through reconnects",
    "summary": "Protect unfinished prompts when connectivity changes.",
    "rationale": "Inspect the existing recovery paths and confirm any gap first.",
    "kind": "observed",
    "effort": "small",
    "evidence": [
      { "label": "Draft lifecycle", "reference": "src/chat/drafts.ts" }
    ],
    "prompt": "Investigate draft recovery, report evidence, and propose the smallest useful change."
  }
]
```

`projectId` is the registered project's Discord channel ID, not its name or directory. Keep `key` stable for an opportunity within that project. Ingestion upserts by project/key, refreshing discovery content while retaining user status, decision reason, snooze time and session linkage. `kind` is `observed` or `idea`; effort is `small`, `medium`, `large` or `explore`. Evidence references are plain file/code references or HTTP(S) links. This example is illustrative, not an actual defect finding.

`[]` records that a discovery review completed without adding proposals. A failed/incomplete inventory lookup should not mark a review as complete. The CLI deliberately does not depend on a running dashboard or bot. Verify project IDs against `kimaki project list --json` before ingestion; the app HTTP ingestion endpoint additionally checks connected inventory. No sample proposal is seeded into your real inbox.

## Daily discovery activation

Kimaki routine **6** reads `routines/daily-proposal-discovery.md` every day at **09:00 America/Argentina/Buenos_Aires** (**12:00 UTC**, cron `0 12 * * *`). It runs in the ThreadDeck project using the `build` agent, without overlapping executions. Its first scheduled run is November 10, 2026 at 09:00 Buenos Aires time. No new scheduler is introduced.

The discovery routine reviews projects, updates evidence, respects decisions and proposes worthwhile work. It never starts implementation automatically. Proposal generation uses the routine's existing agent/model; the app itself does not need model credentials.

## HTTP interface

The loopback-only app exposes `GET /api/proposals` and JSON `POST /api/proposals`. Mutations are validated by `shared/proposals.ts`: `ingest`, revision-checked `decide`/`launch`, `reconcile`, and explicitly acknowledged `resolve`. Launch request IDs are durable idempotency keys. Status transitions to In progress are receipt-owned, not ingestion-owned. Other user decisions use the current revision to reject stale writes. No bot restart or bridge fork modification is required beyond the existing chat capability.
