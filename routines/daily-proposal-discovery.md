---
title: Daily proposal discovery
description: >
  Managed by Kimaki routine 6, Tuesday–Sunday at 09:00 America/Argentina/Buenos_Aires
  (12:00 UTC; cron 0 12 * * 0,2-6). Do not move or delete this file without
  updating the routine with kimaki routine edit.
---

# Daily proposal discovery

## 1. Load inventory, backlog and the weekly handoff

Read `routines/proposal-discovery-contract.md` and follow its inventory, reconciliation and publishing rules. Read `artifacts/proposal-discovery/latest-weekly.json` if present. It identifies the latest successful weekly review and its entire proposal set, including proposals that already existed before that review.

Completion: inventory and the full live backlog are loaded. Record a missing or unreadable weekly handoff as a coverage gap; continue recent-change discovery without pretending the weekly follow-up happened. A weekly scan has not necessarily run yet.

## 2. Follow up every proposal in the latest weekly set

Resolve each weekly project/key against the current backlog. Check its current decision, linked session, relevant subsequent discussions, issues, commits, tests and implementation files. Read session conclusions rather than relying on titles or idle status. Verify whether work is unstarted, underway, implemented, partially implemented, blocked, superseded or still uncertain, with concrete evidence. Review proposals in every decision state, but preserve those decisions.

Refresh existing proposal evidence when something meaningful changed, retaining its key and user/session linkage. Record implementation findings as evidence, not an automatic Done decision. If an opportunity is already implemented, explain that clearly rather than offering its old starting prompt as unfinished work. A missing stored proposal is an anomaly to report, not permission to recreate it automatically.

Completion: every weekly key has a follow-up outcome or an explicit inspection gap. Existing-proposal evidence updates do not consume the new-proposal allowance.

## 3. Discover recent opportunities

Inspect recent Git history, relevant source, issues and current session contents for each accessible project. Include concrete feature ideas as well as observed risks. Use weekly coverage gaps and deferred candidates to guide investigation, verifying fresh evidence before resurfacing them. Retain at most **three new proposals total** across all projects, with no minimum.

Completion: each new candidate has traceable evidence, a clear benefit and no duplicate or active implementation. Every project has an honest coverage entry; listing history or session titles alone is reconnaissance, not a source/workflow review.

## 4. Publish the review

Follow the shared publishing contract. Save a dated daily review under `artifacts/proposal-discovery/`, including weekly-key follow-up outcomes, project coverage, rejected/deferred candidates and ingestion verification. Leave `latest-weekly.json` unchanged.

Completion: ingestion and persisted decisions are verified; the daily report records what was actually inspected. Summarize additions, evidence updates and weekly follow-up findings briefly, referring to ThreadDeck's **Proposals** tab.
