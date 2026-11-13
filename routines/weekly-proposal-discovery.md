---
title: Weekly whole-project proposal discovery
description: >
  Managed by Kimaki routine 7, Mondays at 09:00 America/Argentina/Buenos_Aires
  (12:00 UTC; cron 0 12 * * 1). Do not move or delete this file without
  updating the routine with kimaki routine edit.
---

# Weekly whole-project proposal discovery

## 1. Load inventory and prior coverage

Read `routines/proposal-discovery-contract.md` and follow its inventory, reconciliation and publishing rules. Read the previous `artifacts/proposal-discovery/latest-weekly.json` and recent daily reports if present. Missing first-run history is normal; unreadable existing reports are explicit coverage gaps.

Completion: registered projects and all backlog decisions are loaded, with prior scan coverage available or its absence recorded.

## 2. Scan each whole project systematically

For every accessible project, map its architecture, major modules, user workflows, operational entry points, tests and roadmap. Inspect representative implementation and tests in **each major area**, rather than restricting discovery to recent commits. Then investigate promising findings in depth. Exclude generated/dependency/secret material as specified in the contract. Rotate deeper attention toward previously neglected areas; the proposal ceiling must not truncate project coverage.

Look for incomplete workflows, reliability risks, missing capabilities, useful feature opportunities, documentation/behavior mismatches and demonstrated maintenance costs. Keep a per-project coverage map naming inspected areas, depth, evidence and remaining blind spots. If limits prevent full coverage, name the uninspected areas rather than claiming an entire-project review.

Completion: every registered project has an explicit coverage entry, and every major area is inspected or marked as a gap.

## 3. Recover historical intent and verify current implementation

Inventory project sessions and search historical discussions for requested features, approved plans, deferrals, open questions and partial implementations. On the first scan, search available history broadly; on later scans, review new sessions plus older unresolved discussions and rotate unsearched history. Record the history range and any retrieval gaps. Use local transcripts for discovery, syncing when needed; read promising sessions with `kimaki session read`, including relevant follow-ups.

For each promising historical item, establish whether it was rejected, deferred, approved, superseded or unclear. Verify current source, tests, issues, Git history and later session conclusions before classifying it as unimplemented. Record original discussion references and why it is worth revisiting now. Keep rejected ideas rejected and active implementations out of new work. Reconcile previous weekly proposals as well as new candidates.

Completion: each historical candidate has intent, implementation evidence and a disposition; uncertainty is explicit rather than assumed abandonment.

## 4. Select and publish

Retain at most **ten new proposals total** across all projects, with no minimum. Meaningful updates to existing proposals do not consume that allowance. Apply the shared reconciliation and publishing contract. Record promising candidates below the cutoff as deferred, with evidence and reasons, for daily follow-up or the next scan.

Save a dated weekly report and atomically replace `artifacts/proposal-discovery/latest-weekly.json` only after successful ingestion verification (write a temporary sibling, then rename). The handoff uses the shared report fields; its `proposals` array identifies the **entire weekly set** by projectId/key, including newly added, updated and unchanged existing proposals actually reviewed. Include safe evidence summaries and current decision/session snapshots, but daily runs must fetch live state rather than trust snapshots. Exclude rejected/deferred candidates from this array; they belong in `candidates`. A genuinely empty successful scan publishes an empty proposal set. Preserve the previous dated reports for auditability.

Completion: up to ten new opportunities and all useful evidence updates are persisted, user decisions survive, and daily discovery can identify and follow up every proposal in this weekly set. Summarize coverage, selection/rejection reasons and limitations without dumping the full report into Discord.
