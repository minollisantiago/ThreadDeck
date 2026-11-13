# Proposal sidebar: mock and viability

This is a throwaway study, not a shipped feature. Run `npm run prototype:proposals-sidebar`, then open `artifacts/proposals-sidebar-prototype/ThreadDeck-project-proposals.html`. Everything is fixture-only and in memory. No routine, session, project scan, or persistent decision is created.

## Direction

- Add **Proposals** alongside **Threads** and **Schedules**, not another sidebar inside the app.
- Reuse project/channel groups, collapsing trees, selected-row styling, search, summary pills, and horizontal filter tabs.
- Filters: Inbox, All, In progress, Snoozed, Done, Dismissed.
- Open a proposal in the existing right pane. Keep full titles, evidence, rationale and prompt there, not in taller sidebar cards.
- Start session reviews the prompt, then navigates to the linked conversation. In-progress proposals open their existing session instead of starting another.
- Keep a proposal selected after a status change, even if it leaves the current filter. A “View … proposals” action makes the transition explicit.

## Reuse validated by the mock

The mock imports production `styles.css`, `chat/workspace.css`, and `schedules/schedules.css`; it uses the real `SidebarSearch`, `FilterTabGroup`, `ProjectCollapse`, `Badge`, `Button`, and tooltip primitives. Only proposal content and mock interactions are new. This checks the requested shape against the actual app geometry, not a recreated visual system.

Use `?width=565` to compare the wider screenshot-like sidebar with the production-minimum 430px sidebar. Use `?filter=Snoozed` or `?filter=In%20progress` to open those states directly. Narrow screens use a modal project drawer. The long filter row scrolls horizontally instead of shrinking labels.

## Implementation viability

**UI: good fit, incremental work.** `src/App.tsx` already switches Threads/Schedules above its content. `src/schedules/sidebar.tsx` is an existing pattern for project-grouped, non-thread rows. `src/chat/workspace.tsx` already swaps the right pane while retaining the conversation target.

**Navigation needs a small structural change.** Workspace section state is currently the two-value `section` inside `useSchedules` (`src/schedules/use-schedules.ts`). Move that state into workspace-owned navigation before introducing Proposals; do not make proposal navigation depend on the schedule module. Extend pane selection, drawer opening, viewed-session reporting, and keyboard guards to distinguish all three sections. Preserve the real conversation draft and scroll position across section switches.

**Session creation already has a usable path.** `src/chat/pane.tsx` submits a first prompt with a `projectId` through the existing chat submission path, then associates the returned `sessionId` and `threadId`. Reuse its submission receipts and uncertain-delivery safeguards. Add proposal-to-session linkage after confirmed submission; do not set In progress merely because Start was clicked. A request retry must not launch a duplicate session. Prefilling a proposal needs a deliberate draft handoff, not overwriting an existing project draft.

**Persistent proposal memory is new work.** Introduce stable proposal and project IDs, evidence/revision records, status, snooze-until timestamps, dismissal reasons, editable initial prompt, and linked sessions/outcomes. The discovery routine may update evidence but must not overwrite user decisions. Deduplicate proposals across runs and recheck whether work already exists before suggesting or starting it. A CLI and app should cross the same proposal-module interface rather than write independently to competing files.

**Completion is not agent idleness.** A session ending does not prove a proposal was delivered. Start with explicit Mark done and linked outcomes. A snooze must return through a real timestamp check; the mock only demonstrates that visual state. Dismissals should remain suppressed unless explicitly restored or materially new evidence warrants a clearly explained revisit.

## Suggested first slice

1. A persistent inbox with project groups, detail pane, search and status decisions; manually supplied proposals are enough.
2. Safe prompt handoff and confirmed session linkage using the existing chat receipt flow.
3. Routine ingestion, evidence updates and deduplication through the same proposal interface.

No new scheduling engine, separate HTML-report product, or autonomous implementation is needed. The main effort is trustworthy proposal memory and safe session handoff, not the sidebar layout.

## Evaluation

- Production TypeScript check and Vite build passed.
- Browser smoke checks passed for status filters, project search/collapse, snooze/restore/dismiss/done, editable prompt handoff, and linked-session navigation. No browser errors.
- Captured both 430px and 565px sidebar widths, dark/light appearances, and a 390px mobile drawer/detail flow. No page-level mobile overflow.
- At 430px, long titles truncate as existing thread titles do; the full title is available in a tooltip and the detail pane. On mobile, the filter row scrolls horizontally. These are existing app patterns, not a reason to introduce a second navigation system.
- Recommendation: proceed with this direction. Keep sidebar rows compact and put explanation/actions in the right pane; do not bring back the mock's earlier nested navigation or card-grid layouts.
