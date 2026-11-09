---
title: Daily proposal discovery
description: >
  Managed by Kimaki routine 6, daily at 09:00 America/Argentina/Buenos_Aires
  (12:00 UTC; cron 0 12 * * *). Do not move or delete this file without
  updating the routine with kimaki routine edit.
---

# Daily proposal discovery

## 1. Load the workspace and backlog

Run from the ThreadDeck project root. Read `docs/proposals.md` for the ingestion contract. List registered Kimaki projects using `kimaki project list --json`, and read the entire existing proposal backlog with `npm run --silent proposals -- list`. Use each project's channel ID as `projectId`.

Completion: you have the registered project directories/IDs and existing proposals, including snoozed, dismissed, completed and in-progress decisions. If either lookup fails, report the failure and stop without ingestion.

## 2. Review evidence

Inspect recent Git history, relevant source, existing issues, and current sessions for each accessible project. Prioritize recently changed or actively used areas. Bound the review to at most three strong proposals total across all projects; zero is a useful result. Record inaccessible projects in your final summary rather than treating them as reviewed. Existing user changes remain untouched.

Distinguish evidence-backed investigations (`observed`) from speculative features (`idea`). Each proposal needs concrete starting points, a reason it matters, rough effort, and a self-contained starting prompt. A suspected defect starts with verification, not an assertion that the bug exists. Refactors need a demonstrated maintenance benefit, not aesthetic churn.

Completion: every candidate has traceable evidence and a clear benefit, or it is dropped. This run only proposes work; it never implements fixes or starts implementation sessions.

## 3. Reconcile before writing

Compare candidates with the backlog and active work. Reuse the existing stable `key` for the same underlying opportunity, even if its title changes. Keep keys short, project-local and descriptive. Keep snoozed, dismissed, completed and in-progress proposals out of the new-work shortlist. Update evidence for an existing proposal when useful; ingestion preserves its decision and session linkage. Surface genuinely new evidence for a dismissed proposal as an update, not a fresh key that bypasses dismissal.

Completion: each retained candidate is either a justified new opportunity or an update to an existing project/key. No duplicate or active implementation has been repackaged as new work.

## 4. Publish the review

Write a JSON array matching `docs/proposals.md` to a temporary file under `/tmp/opencode`, then run `npm run --silent proposals -- ingest <file>`. Use `[]` when the completed review found no worthwhile proposals. Re-read the stored result and confirm the expected keys and decisions survived. Never edit the SQLite file directly or use the decision/launch endpoints from this discovery routine.

Completion: ingestion succeeded and the persisted result matches the review. Report how many projects were reviewed, which were skipped, and which proposals were added or updated. Refer the user to ThreadDeck's **Proposals** tab. Keep the Discord summary brief; the inbox holds the detail. Do not ping the user for an empty or unchanged review.
