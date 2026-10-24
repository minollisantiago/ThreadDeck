# Pile motion catalogue → ThreadDeck proposal

Research date: **2026-10-21**. **Research and proposal only; no application behavior changed.**

This is a historical source catalogue at the pinned baseline below, not the current
feature inventory. ThreadDeck now includes the approved Stream workspace, scoped
shortcut/command help, and fork-first desktop startup. Existing collapse/popover
and selective-results motion have their own regression coverage; proposed timings
here are not claims about today's code. See [current app behavior](../../README.md)
and [local chat limits](../local-chat.md). The original source observations remain
unchanged so their citations can still be checked against the research baseline.

Reading order: [recommendation](#recommendation) · [current ThreadDeck surfaces](#threaddeck-baseline) · [implementation map](#proposed-implementation-map) · [motion policy](#motion-vocabulary-and-architecture) · [acceptance checks](#acceptance-checks-for-an-implementation) · [Pile source catalogue](#pile-source-catalogue).

## Recommendation

Borrow Pile's **small, fast, contextual transitions**, not its entire journaling UI. For ThreadDeck the best applications are:

1. **Project expand/collapse:** animate the content opening and closing instead of an immediate jump.
2. **Compact menus and connection tooltip:** a short fade/scale or fade/slide anchored to the trigger.
3. **Explicit view changes:** a restrained transition when switching project/state grouping or list/islands design.
4. **Real state changes:** gently settle new badges and rows without replaying motion on every poll.

Keep the existing sliding filter underline. It is already a good fit for this vocabulary. Avoid making a frequently refreshing switchboard feel like an onboarding sequence.

**Closest source-to-app matches:** Pile's height/opacity reply disclosure → project collapse; its compact settings modal and side-aware color menu → compact control popovers; its route fade/slide → explicit grouping/design switches; its 200 ms feed-row entrances → selectively introduced sessions. These are adaptations, not identical controls. Keep Pile's subtle press feedback; skip its full-screen chat blobs, image attachment effects and long result staggers.

This complements [the earlier graphical UI inspiration note](ui-design-inspiration.md): that note addresses layout and visual hierarchy; this one addresses how existing surfaces change over time. It does not propose another layout redesign.

## ThreadDeck baseline

Reviewed at commit `4be8464347ca9683261d94d56cf233650d86402b`. Paths below refer to that checkout, before any implementation.

| Surface | Current implementation | Opportunity |
| --- | --- | --- |
| Filters | `src/components/filter-tabs.tsx:16–44`; `src/styles.css:273–276`: measured underline, 240 ms, `cubic-bezier(.22, 1, .36, 1)` | Retain; extend the selection vocabulary to grouping if useful. `data-motion-direction` is recorded but does not currently animate the results. |
| Classic projects | `src/App.tsx:24–50`: swaps two chevron icons; sessions use `hidden` | Animate one stable chevron plus actual content height. |
| Islands projects | `src/components/project-islands.tsx:19–33`; `src/styles.css:190–191`: 160 ms rotating chevron; content uses `hidden` | Keep rotation; add content expansion without scaling text or distorting branch connectors. |
| Project/state and list/islands switches | `src/App.tsx:130–138`: conditional component trees | Short transition for the results surface; preserve toolbar and focus. |
| Compact menus | `src/components/header-controls.tsx:19–43`, `src/components/thread-options.tsx:12–60`: native popovers below 600 px | Animate native popover presentation, retaining top-layer, dismissal, positioning and focus behavior. This includes the 430 px desktop window. |
| Connection tooltip | `src/styles.css:80–82`: visibility/opacity changes with no explicit transition | Brief fade + 3–4 px translation; no elastic bounce. |
| Session rows and badges | `src/components/session-row.tsx:16–30`: classes and conditional badges change immediately | Local color transitions and small badge entrance; optional keyed row reflow later. |
| Working signal | `src/styles.css:212,237`: graphical working icon rotates every 4 s | Keep semantic state gating; do not add a competing whole-card loop. |
| Desktop startup | `electron/startup.css:5–8`: 2.5 s scanning logo and 1 s working-stage spinner, with reduced-motion alternatives | Already has its own identity. Optional small stage-state fades; no need to replace the scanner. |
| Buttons | `src/components/ui/button.tsx:6–11`: Tailwind `transition-colors` | Keep color feedback; optional restrained press feedback on actual buttons only. |
| Reduced motion | `src/styles.css:164,241`; `electron/startup.css:8` | Existing CSS safeguards must survive. JS animation would need a separate preference check. |

## Proposed implementation map

The values in this section are **proposed ThreadDeck values**, not measurements of Pile. Pile's source values are catalogued separately below.

### Phase 1 — highest value, smallest scope

| Priority | Interaction | Proposed motion | Files and important constraints |
| --- | --- | --- | --- |
| P1 | Expand/collapse a project | Content height open/close over 180–220 ms; opacity over 120–160 ms; chevron rotation over 160 ms | `src/App.tsx`, `src/components/project-islands.tsx`, `src/styles.css`. Current `[hidden] { display: none !important }` prevents a normal closing transition. Introduce a real collapse boundary; do not simply add a transition to the hidden element. Keep collapsed links out of keyboard navigation and the accessibility tree. Keep the controlled ID and `aria-expanded` semantics. |
| P1 | Open appearance/thread-options popover | Opacity 0→1; translateY(-4 px)→0; scale .98→1, origin near trigger; 140–170 ms. Exit 90–120 ms | `src/styles.css` plus existing menu components only if lifecycle support requires it. Native-popover CSS with `@starting-style` and discrete `display`/`overlay` transitions is a candidate, subject to browser verification. Do not replace `hidePopover()` with an uncoordinated visual-only delay. |
| P1 | Hover/focus connection tooltip | Opacity 0→1; translateY(-3 px)→0, 120 ms; quick exit | `src/styles.css`. Coordinate visibility timing so exit is visible, but do not leave invisible interactive content. Keyboard focus should reveal immediately; any hover intent delay is optional. Preserve existing hover bridge. |
| P1 | Hover/press controls | Explicit `background-color`, `border-color`, `color` over 100–140 ms; optional scale .98 while pressed on icon buttons | `src/components/ui/button.tsx`, `src/styles.css`. Avoid global `transition: all` and avoid transforms on draggable window chrome or row anchors. Keep focus outlines immediate. |

For collapse, prefer a reusable boundary shared by both project presentations. A CSS grid `0fr→1fr` implementation with a clipped inner wrapper is a candidate; measured height or a motion library is another. Decide after checking connector geometry and accessibility. Neither approach should animate every child independently.

Native-popover implementation reference: [MDN's Popover API animation guide](https://developer.mozilla.org/en-US/docs/Web/API/Popover_API/Using#animating_popovers) explains why entry needs `@starting-style` and exit needs discrete `display`/`overlay` transitions. This is implementation guidance, not a claim that Pile uses native popovers.

### Phase 2 — intentional navigation and feedback

| Priority | Interaction | Proposed motion | Files and important constraints |
| --- | --- | --- | --- |
| P2 | By project ↔ By state; classic ↔ islands | Results-only opacity/translateY(4 px) entrance, 160–200 ms. An exit/enter sequence must fit inside roughly 220 ms overall | `src/App.tsx`, `src/components/state-panels.tsx`, `src/components/project-islands.tsx`. Trigger only on explicit grouping/design change. No full-window slide, no toolbar fade, no fabricated card morph between unrelated trees. Do not remount on snapshot changes. |
| P2 | Change filter | Keep existing 240 ms underline; optionally a subtle 100–140 ms results entrance | `src/components/filter-tabs.tsx`, `src/App.tsx`. Avoid full directional slides despite the stored direction; filters are subsets, not forward/back navigation. No transition on every search keystroke. |
| P2 | Working → attention, new unread reply, mark read | State-color transition over 140–180 ms; new badge opacity 0→1 and y(2 px)→0 over 120 ms | `src/components/session-row.tsx`, `src/styles.css`. Trigger on changed primitive state/response timestamp, not object identity. Acknowledge actions immediately; do not hold a row clickable while it visually exits an Active/Attention filter. Preserve real labels and local unread semantics. |
| P2 | Connection failure/recovery | Notice enters/exits with short opacity and height transition, about 160 ms | `src/App.tsx`, `src/components/connection-indicator.tsx`. Alert semantics and retry behavior remain immediate. No celebratory recovery effect or animation that implies stale data is live. |

### Phase 3 — only if the first two phases feel insufficient

- **Row/project reflow:** 180–220 ms positional interpolation when IDs really change order. `src/lib/view.ts:7–43` sorts projects, sessions and state groups; `StatePanels` nests rows under separate parents. Stable React keys alone do not animate layout or preserve a row across parents. Cross-group shared-layout motion needs deliberate identity/lifecycle handling, or use a simpler fade. Do not silently change sorting semantics to simplify animation.
- **Counts:** a simple changed-value crossfade, not spinning odometer digits. Counters are not progress and unknown `—` must not tween through zero.
- **Startup stages:** a small icon/detail fade when stage state changes, keeping the scanner. Startup is a separate non-React document; a React motion dependency would not automatically cover it. `electron/main.cjs:52` navigates the window to the dashboard with `loadURL`; do not promise a shared-element scanner→dashboard morph across that document navigation. A small dashboard entrance is simpler.

## Motion vocabulary and architecture

Suggested starting tokens:

```css
/* Proposal, not code already installed in ThreadDeck. */
--motion-fast: 120ms;
--motion-standard: 180ms;
--motion-layout: 220ms;
--motion-ease: cubic-bezier(.22, 1, .36, 1);
```

Prefer **CSS first** for Phase 1. ThreadDeck currently has no animation-library dependency (`package.json`). There is no reason to import Pile's animation stack just for hover, menus and opacity.

If exit coordination or keyed reflow becomes necessary, evaluate **one** small React animation integration then. Keep shared motion policy and a few deep interaction boundaries (collapse, presence, layout) instead of sprinkling per-component timing constants everywhere. CSS reduced-motion rules do not disable JS-driven transforms; JS must honor `matchMedia('(prefers-reduced-motion: reduce)')` or its library equivalent, including preference changes while open.

```text
User action / changed semantic state
                  |
                  v
      Shared reduced-motion policy
           /                \
        reduce            normal
           |                |
    immediate update   bounded transition
           \                /
            same DOM meaning,
        labels, focus and final state
```

### Rules specific to this app

- **No poll animation.** `useSnapshot` fetches again after 5 s while visible and after 15 s when hidden (`src/hooks/use-snapshot.ts:11–30`); `App` also updates relative time every second (`src/App.tsx:145–149`). Neither is an animation trigger.
- Animate by stable project/session IDs and actual changed values. Do not key the page by `checkedAt`, `now`, the entire snapshot or `JSON.stringify(snapshot)`.
- Initial data hydration should not stagger hundreds of sessions. At most reveal the results surface once, or skip initial motion entirely.
- Preserve a stable scroll position and link hit targets. Avoid overlapping clickable entering/exiting copies, especially during state regrouping.
- Keep line/branch connectors attached to their content; avoid scaling an entire project card or animating font sizes.
- Preserve fast search: no debounce added solely for animation, delayed results, per-keystroke bounce, or replay of all row entrances.
- No pulse for idle/unknown sessions, no fake completion effect, no percentage loader, no confetti. Motion cannot establish facts the backend does not report.
- At 430 px desktop width, compact menus and dense vertical movement matter more than expansive page transitions. Verify wide layouts too.

## Acceptance checks for an implementation

Extend existing `e2e/dashboard.spec.ts` coverage (which already checks filter motion/reduced motion) rather than relying only on screenshots:

Keep `src/designs.test.tsx` behavior assertions too: switching design must retain search and the original list-collapse preference; acknowledging a reply must still remove it immediately from Active sessions. Test animation lifecycle in the real browser, not by waiting for CSS timeouts in jsdom.

1. Both project presentations animate open **and** closed; rapid toggles end correctly; collapsed descendants are not focusable; `aria-expanded` stays accurate.
2. At 430 px, 390 px and a wide viewport, menus still position correctly, dismiss with Escape/outside click and retain existing focus behavior. A breakpoint change mid-transition must not strand a hidden popover.
3. Under `prefers-reduced-motion: reduce`, there is no translation, scale, rotation, animated height or delayed removal. Explicit labels and immediate updates remain. Test a preference change while the app is open.
4. Two identical API snapshots and the one-second relative-time tick start **zero new animations**. A new response/state change animates only the affected surface.
5. Search and mark-read remain immediate. A removed row cannot retain an invisible focusable/clickable copy. No duplicate IDs during exits.
6. Project/state and list/islands switches preserve correct ordering, unread state, filter selection, focus and existing persistence behavior. No blank interval or large scroll jump.
7. Connection failure retains stale rows honestly. Motion never turns an unknown status into working/idle or marks anything read by itself.
8. Check a large fixture near the 300-session inventory bound for layout work and motion overload; do not claim performance wins without measurement.

## Evidence boundaries

- ThreadDeck was inspected in source. This proposal does not claim a live visual comparison or a completed prototype.
- Pile source links and exact animation values follow below. Source declarations establish intent and wiring, not a frame-by-frame recording of the shipped desktop binary.
- No implementation, dependency installation, service restart, or private-session tunnel is needed for this investigation.

## Pile source catalogue

Repository: [UdaraJay/Pile](https://github.com/udarajay/pile). Inspected commit: **`234aa902f6a5b8b231b815501d5dac996feb8cdf`**. All Pile links below are pinned to this commit.

Static inspection covered renderer JSX/TSX, SCSS, context wiring and licenses. “Applied” means reachable markup assigns the class/props, not that the animation was observed in a running binary. No app launch or video/frame inspection was performed.

### Stack and timing conventions

Pile declares **Framer Motion `^11.2.4`**, React Router, Radix dialogs/dropdowns/switches and React Virtuoso ([dependencies][p-deps]). It combines **JS motion, CSS transitions/keyframes, SVG animation and native/library smooth scrolling**. It does not use one universal spring or one universal duration.

JS durations/delays below are seconds unless explicitly converted to ms. Where a call site specifies only `delay`, its duration/easing is unspecified by Pile there. A physics spring with a `duration` declaration is not proof of that exact observed settling time. No `layoutId`, drag gesture, `whileHover` or `whileTap` was found in the renderer inspection; several tactile interactions are CSS, not Motion gestures.

### A. Navigation, dialogs and menus

| Pattern / trigger | Source-defined behavior | ThreadDeck adaptation |
| --- | --- | --- |
| Route navigation | `AnimatePresence mode="wait"` around pathname-keyed routes. Ordinary pages enter opacity 0 / Y 40→opacity 1 / Y 0; exit opacity 0 / Y 140. Open-pile route passes `down`, setting both initial and exit Y to 0: fade only. Transition declares spring stiffness 100, damping 20, duration .1. [Source][p-routes] | Results-only transition for explicit grouping/design changes, with far less travel. Not a shared-element morph. |
| Header date changes | Keyed date span fades opacity 0→1 over .5. Exit opacity 0 is declared, but without a local presence wrapper an outgoing crossfade is not established. [Source][p-layout] | Optional changed-count crossfade; no need to animate every relative-time tick. |
| Settings modal | Radix Dialog. Overlay fades 0→.9 in 120 ms. Content fades and settles `translate(-50%,-48%) scale(.96)`→`translate(-50%,-50%) scale(1)` in 150 ms. Curve `cubic-bezier(.16,1,.3,1)`. Entry only; no custom reverse-close keyframes. [Wiring][p-settings-js], [styles][p-settings-css], [keyframes][p-settings-keys] | Best visual model for compact menu entrance, adapted to a trigger anchor rather than a centered modal. Add a deliberate exit rather than assuming Pile has one. |
| Search dialog | At top 10vh, content enters from `translate(-50%,10vh)` to `translate(-50%,0)` plus opacity, 150 ms; overlay 120 ms; same curve as Settings. Separate `transition: all 120ms ease-in-out` is not the keyframe duration. [Styles][p-search-css], [keyframes][p-search-keys] | Borrow short settling, not the large viewport travel or a new search modal. ThreadDeck already has direct inline search. |
| Chat overlay | Full-viewport, bottom-aligned, blur(10px); content keyframes change opacity only, 150 ms; overlay 120 ms. Its base translate is positioning, not an animated slide. [Styles][p-chat-css], [keyframes][p-chat-keys] | No matching chat surface in ThreadDeck; do not add one for an effect. |
| Remove-pile confirmation | Radix AlertDialog; centered .96→1 scale/vertical settle, 150 ms overlay/content; overlay blur(10px). Overlay animates to opacity 1 but base opacity is .75 without forwards fill: possible endpoint snap, not runtime-verified. [Wiring][p-delete-js], [styles/keyframes][p-delete-css] | No destructive-action analogue in this read-only app. Catalogue only. |
| Highlight-color menu | Radix DropdownMenu, requested right/start with 6 px offset. Open trigger scales to .85 over 120 ms ease-in-out. Menu duration 400 ms with `cubic-bezier(.16,1,.3,1)`; side-aware variants. Top/bottom/left fade while moving 2 px. **Right variant actually only scales .9→1**, despite its `slideLeftAndFade` name. [Wiring][p-ball-js], [selectors][p-ball-css], [actual keyframes][p-ball-keys] | Compact appearance/options menus; use shorter timing and much smaller scale change. Preserve native popover semantics rather than importing Radix just to match Pile. |

### B. Lists, disclosure, attachments and previews

| Pattern / trigger | Source-defined behavior | ThreadDeck adaptation |
| --- | --- | --- |
| Feed item mounting | Virtuoso row uses Motion `layout`, opacity 0 / Y -20→opacity 1 / Y 0, duration .2; exit opacity 0 declared. Item key includes post path **and updatedAt**; `followOutput="smooth"`. [Rows][p-posts-virtual], [presence boundary][p-posts-js] | Optional true-new-row entrance or same-parent reflow later. **Do not copy timestamp keys:** they can remount/reanimate changed items. |
| Hover/focus action disclosure | Local `AnimatePresence`: opacity/height 0→1/auto, reverse on exit; delay .3, duration/ease unspecified. Parent reserves 40 px of action space. Actions stay shown while replying. [Markup/handlers][p-post-js], [reserved space][p-post-actions] | Height+opacity is useful for project content. Do not hide primary Discord links or unread actions behind hover. |
| Reply composer opening | Presence-managed opacity/height 0→1/auto and reverse; delay .09, no explicit duration/ease. Saving closes the composer and refreshes the feed, not a dedicated success flourish. [Source][p-post-js] | Closest functional motion analogue for project expansion, although ThreadDeck needs no composer. |
| Reply connectors and AI icon | Thread line opacity transition 120 ms with 15 ms show delay; reply connector 120 ms with 120 ms delay. AI reply icon pulses over 2 s, scale .8→1→.8; tied to reply-composer mode, not a precise network-loading boolean. [Source][p-post-css] | Keep connectors attached during collapse; do not animate every branch separately or borrow mode-based pulses as execution truth. |
| Search result reveal | Parent variants stagger children .05; children opacity 0 / Y 15→opacity 1 / Y 0, duration/ease unspecified. No query-keyed result-set boundary or exit variant. [Source][p-search-js] | Skip default staggering: many results and fast typing make it distracting. Source does not establish guaranteed replay on every query. |
| Image attachment mount | Opacity 0 / Y -30 / scale .8→opacity 1 / Y 0 / scale 1; delay .1; exit opacity 0 / scale .9 declared, no local presence boundary assuring removal animation. Active image brightness .9, 120 ms. Parent implements horizontal mouse-drag scrolling. **No image-click lightbox or shared-element zoom.** [Markup][p-attachments-js], [styles][p-attachments-css] | No corresponding ThreadDeck media surface. Do not add attachment UI or call this an image-expansion transition. |
| Link preview / AI highlights | Preview mount fades with .3 delay. YouTube iframe bypasses motion card. Click expands highlights: max-height 50px→100%, declared 200 ms ease-in-out; opacity .8→1 changes but is not the transitioned property. Gradient overlay fades out over 200 ms. [Markup][p-link-js], [styles][p-link-css] | The disclosure idea fits; **do not copy percentage max-height as a reliable auto-height recipe**. No need to introduce preview cards. |

**Presence/virtualization caveat:** Pile's feed presence wrapper surrounds the virtual list, not a directly keyed list of row elements. Row exits are declared, but reliable per-row animated deletion is not established. Virtualization can mount rows again on scroll, and changing `updatedAt` changes keys. Layout motion and variable row heights need runtime checking. These behaviors are reasons to adapt the vocabulary, not transplant the implementation.

### C. Micro-interactions, loaders and ambient effects

| Pattern / trigger | Source-defined behavior | ThreadDeck adaptation |
| --- | --- | --- |
| Open button | CSS transition 120 ms ease-in-out; background feedback and active scale .97. [Styles][p-home-css], [assigned class][p-home-js] | Small press feedback on real controls, not entire session rows. |
| Header icon hover | Holder background 120 ms; icon opacity .5→1, 220 ms plus 40 ms delay. Reply action pills use faster 80 ms background/color/contrast feedback. [Header][p-settings-css], [actions][p-post-actions] | Useful quiet polish for icon controls and existing row affordances. Keep keyboard focus immediate. |
| Semantic search switch | Actual Radix thumb moves X 4→20 px in 100 ms (CSS default easing). Search filter transitions are declared twice; later 300 ms `cubic-bezier(.075,.82,.165,1)` wins. [Wiring][p-options-js], [styles][p-options-css] | Existing sliding filter indicator already serves this purpose; no replacement dependency needed. |
| Timeline hover/scrubber | Day line width 20→25 px in 120 ms; day-number opacity .6→1 in 220 ms. Scrubber top transitions with `all 500ms cubic-bezier(.075,.82,.165,1)`; hover height 1→6 px. Native sidebar scroll is smooth; date-click context scroll uses `behavior:'auto'`; feed follow is separately smooth. Scrubber cursor suggests drag but its div has no drag handler. [Markup/scroll][p-timeline-js], [styles][p-timeline-css], [context][p-timeline-context] | Selection continuity is useful; do not add a timeline or fake draggable affordance. |
| Toast queue | Only first queued notification renders, keyed by notification ID under local `AnimatePresence mode="wait"`. Opacity 0 / Y -30 / scale .8→1/0/1; exit opacity 0 / scale .9; .1 delay. Default 5000 ms lifetime is not animation duration. [Queue render][p-toasts-js], [motion][p-toast], [timeout][p-toasts-context] | Only if an actual notification need emerges. Do not add a toast for every background state update. |
| Thinking / waiting SVGs | Thinking counter-rotates geometry over 2.5 s and 8 s; waiting arc rotates over 1 s, all indefinitely via SVG `animateTransform`. Used in toasts and Chat's querying button. [Thinking][p-thinking], [waiting][p-waiting], [chat wiring][p-chat-js] | ThreadDeck already has a gated working glyph and scanner. No need for another loader family. CSS motion suppression alone would not stop SVG SMIL animation. |
| Chat responding blobs | Query-dependent presence fade; three blurred colored blobs run 6 s infinite ease loops, moving top/left/right and scaling as far as 1.4; blur(30px). Noise filter application is commented out. [Component][p-blobs-js], [CSS][p-blobs-css] | **Do not adopt by default:** persistent blurred ambient movement competes with dense titles and may add rendering cost. No measured performance claim. |
| Chat intro/messages | Intro opacity/scale .97→1; .3 delay, spring stiffness 50, duration 1, scale-specific duration .5. Messages fade with .1 delay. Virtuoso smooth following is separate from element animation. [Intro][p-intro], [messages][p-message], [list][p-chat-virtual] | No transcript surface here. Borrow restraint, not a new chat experience. |
| AI text shimmer | `.editor.responding p` declares 4 s linear infinite clipped text gradient; 8 s media-query override has a descendant-selector mismatch. Generation switches to a non-editable render branch that lacks `.responding`. **Running shimmer is not established.** [Render branches][p-editor-js], [SCSS][p-editor-css] | Do not animate session titles with shimmer; preserve legibility. |

### D. Do not mistake unused declarations for shipped interactions

- **Logo animation objects are unused.** The returned SVG/path elements never apply the 2 s looping `faceAnimation` / `sideAnimation` objects ([logo component][p-logo]).
- Home's `@keyframes grow` has no application in that stylesheet ([Home styles][p-home-css]).
- Highlights dialog render and “Create new highlight” menu item are commented out; do not treat the similar modal styles as a normally reachable top-nav interaction ([Layout][p-layout], [Ball][p-ball-js]).
- Legacy-looking 0.4 s switch styles in Settings do not match the rendered Settings controls; the semantic-search switch is the wired example above ([Settings JSX][p-settings-js]).
- Exits declared on a motion element are not proof of a visible close if its presence boundary is missing or disappears with it.

### E. Accessibility and copying

**Reduced motion:** the inspected renderer has no global `MotionConfig`/`useReducedMotion` policy; the editor's problematic `prefers-reduced-motion: no-preference` block is the only located exception. Dialog, route, list, SVG and blob animations do not have explicit local reduced-motion branches. This is a source finding, not a runtime accessibility audit. ThreadDeck's existing reduced-motion protections are a better baseline and must be retained.

**License:** [Pile's license][p-license] grants MIT software permissions with notice retention, but separately reserves its **name, logos, icons/branding and taglines** under a proprietary Brand License. Adapt the interactions without importing Pile branding. If copying substantial software/CSS, retain applicable notices. The SVG loaders separately carry **Sam Herbert's MIT attribution**, which must also be retained if copied ([loader license][p-loader-license]). These are source observations, not legal advice.

### Pinned Pile references

[p-deps]: https://github.com/udarajay/pile/blob/234aa902f6a5b8b231b815501d5dac996feb8cdf/package.json#L96-L132
[p-routes]: https://github.com/udarajay/pile/blob/234aa902f6a5b8b231b815501d5dac996feb8cdf/src/renderer/App.jsx#L22-L93
[p-layout]: https://github.com/udarajay/pile/blob/234aa902f6a5b8b231b815501d5dac996feb8cdf/src/renderer/pages/Pile/Layout.jsx#L18-L96
[p-settings-js]: https://github.com/udarajay/pile/blob/234aa902f6a5b8b231b815501d5dac996feb8cdf/src/renderer/pages/Pile/Settings/index.jsx#L70-L148
[p-settings-css]: https://github.com/udarajay/pile/blob/234aa902f6a5b8b231b815501d5dac996feb8cdf/src/renderer/pages/Pile/Settings/Settings.module.scss#L1-L67
[p-settings-keys]: https://github.com/udarajay/pile/blob/234aa902f6a5b8b231b815501d5dac996feb8cdf/src/renderer/pages/Pile/Settings/Settings.module.scss#L356-L376
[p-search-js]: https://github.com/udarajay/pile/blob/234aa902f6a5b8b231b815501d5dac996feb8cdf/src/renderer/pages/Pile/Search/index.jsx#L79-L220
[p-search-css]: https://github.com/udarajay/pile/blob/234aa902f6a5b8b231b815501d5dac996feb8cdf/src/renderer/pages/Pile/Search/Search.module.scss#L44-L68
[p-search-keys]: https://github.com/udarajay/pile/blob/234aa902f6a5b8b231b815501d5dac996feb8cdf/src/renderer/pages/Pile/Search/Search.module.scss#L217-L237
[p-chat-js]: https://github.com/udarajay/pile/blob/234aa902f6a5b8b231b815501d5dac996feb8cdf/src/renderer/pages/Pile/Chat/index.jsx#L73-L190
[p-chat-css]: https://github.com/udarajay/pile/blob/234aa902f6a5b8b231b815501d5dac996feb8cdf/src/renderer/pages/Pile/Chat/Chat.module.scss#L48-L73
[p-chat-keys]: https://github.com/udarajay/pile/blob/234aa902f6a5b8b231b815501d5dac996feb8cdf/src/renderer/pages/Pile/Chat/Chat.module.scss#L344-L362
[p-delete-js]: https://github.com/udarajay/pile/blob/234aa902f6a5b8b231b815501d5dac996feb8cdf/src/renderer/pages/Home/DeletePile/index.jsx#L8-L50
[p-delete-css]: https://github.com/udarajay/pile/blob/234aa902f6a5b8b231b815501d5dac996feb8cdf/src/renderer/pages/Home/DeletePile/DeletePile.module.scss#L29-L156
[p-ball-js]: https://github.com/udarajay/pile/blob/234aa902f6a5b8b231b815501d5dac996feb8cdf/src/renderer/pages/Pile/Posts/Post/Ball/index.jsx#L36-L81
[p-ball-css]: https://github.com/udarajay/pile/blob/234aa902f6a5b8b231b815501d5dac996feb8cdf/src/renderer/pages/Pile/Posts/Post/Ball/Ball.module.scss#L1-L100
[p-ball-keys]: https://github.com/udarajay/pile/blob/234aa902f6a5b8b231b815501d5dac996feb8cdf/src/renderer/pages/Pile/Posts/Post/Ball/Ball.module.scss#L207-L252
[p-posts-js]: https://github.com/udarajay/pile/blob/234aa902f6a5b8b231b815501d5dac996feb8cdf/src/renderer/pages/Pile/Posts/index.jsx#L14-L71
[p-posts-virtual]: https://github.com/udarajay/pile/blob/234aa902f6a5b8b231b815501d5dac996feb8cdf/src/renderer/pages/Pile/Posts/VirtualList.jsx#L9-L76
[p-post-js]: https://github.com/udarajay/pile/blob/234aa902f6a5b8b231b815501d5dac996feb8cdf/src/renderer/pages/Pile/Posts/Post/index.jsx#L33-L232
[p-post-css]: https://github.com/udarajay/pile/blob/234aa902f6a5b8b231b815501d5dac996feb8cdf/src/renderer/pages/Pile/Posts/Post/Post.module.scss#L27-L198
[p-post-actions]: https://github.com/udarajay/pile/blob/234aa902f6a5b8b231b815501d5dac996feb8cdf/src/renderer/pages/Pile/Posts/Post/Post.module.scss#L200-L281
[p-attachments-js]: https://github.com/udarajay/pile/blob/234aa902f6a5b8b231b815501d5dac996feb8cdf/src/renderer/pages/Pile/Editor/Attachments/index.jsx#L7-L49
[p-attachments-css]: https://github.com/udarajay/pile/blob/234aa902f6a5b8b231b815501d5dac996feb8cdf/src/renderer/pages/Pile/Editor/Attachments/Attachments.module.scss#L1-L68
[p-link-js]: https://github.com/udarajay/pile/blob/234aa902f6a5b8b231b815501d5dac996feb8cdf/src/renderer/pages/Pile/Editor/LinkPreviews/LinkPreview/index.jsx#L20-L156
[p-link-css]: https://github.com/udarajay/pile/blob/234aa902f6a5b8b231b815501d5dac996feb8cdf/src/renderer/pages/Pile/Editor/LinkPreviews/LinkPreview/LinkPreview.module.scss#L1-L99
[p-home-css]: https://github.com/udarajay/pile/blob/234aa902f6a5b8b231b815501d5dac996feb8cdf/src/renderer/pages/Home/Home.module.scss#L29-L248
[p-home-js]: https://github.com/udarajay/pile/blob/234aa902f6a5b8b231b815501d5dac996feb8cdf/src/renderer/pages/Home/index.tsx#L30-L80
[p-options-js]: https://github.com/udarajay/pile/blob/234aa902f6a5b8b231b815501d5dac996feb8cdf/src/renderer/pages/Pile/Search/OptionsBar/index.jsx#L18-L98
[p-options-css]: https://github.com/udarajay/pile/blob/234aa902f6a5b8b231b815501d5dac996feb8cdf/src/renderer/pages/Pile/Search/OptionsBar/OptionsBar.module.scss#L26-L119
[p-timeline-js]: https://github.com/udarajay/pile/blob/234aa902f6a5b8b231b815501d5dac996feb8cdf/src/renderer/pages/Pile/Sidebar/Timeline/index.jsx#L61-L279
[p-timeline-css]: https://github.com/udarajay/pile/blob/234aa902f6a5b8b231b815501d5dac996feb8cdf/src/renderer/pages/Pile/Sidebar/Timeline/Timeline.module.scss#L55-L163
[p-timeline-context]: https://github.com/udarajay/pile/blob/234aa902f6a5b8b231b815501d5dac996feb8cdf/src/renderer/context/TimelineContext.js#L14-L31
[p-toasts-js]: https://github.com/udarajay/pile/blob/234aa902f6a5b8b231b815501d5dac996feb8cdf/src/renderer/pages/Pile/Toasts/index.jsx#L7-L24
[p-toast]: https://github.com/udarajay/pile/blob/234aa902f6a5b8b231b815501d5dac996feb8cdf/src/renderer/pages/Pile/Toasts/Toast/index.jsx#L9-L39
[p-toasts-context]: https://github.com/udarajay/pile/blob/234aa902f6a5b8b231b815501d5dac996feb8cdf/src/renderer/context/ToastsContext.js#L11-L88
[p-thinking]: https://github.com/udarajay/pile/blob/234aa902f6a5b8b231b815501d5dac996feb8cdf/src/renderer/pages/Pile/Toasts/Toast/Loaders/Thinking/index.jsx#L1-L33
[p-waiting]: https://github.com/udarajay/pile/blob/234aa902f6a5b8b231b815501d5dac996feb8cdf/src/renderer/pages/Pile/Toasts/Toast/Loaders/Waiting/index.jsx#L1-L29
[p-blobs-js]: https://github.com/udarajay/pile/blob/234aa902f6a5b8b231b815501d5dac996feb8cdf/src/renderer/pages/Pile/Chat/Blobs/index.js#L4-L38
[p-blobs-css]: https://github.com/udarajay/pile/blob/234aa902f6a5b8b231b815501d5dac996feb8cdf/src/renderer/pages/Pile/Chat/Blobs/Blobs.module.scss#L1-L138
[p-intro]: https://github.com/udarajay/pile/blob/234aa902f6a5b8b231b815501d5dac996feb8cdf/src/renderer/pages/Pile/Chat/Intro/index.js#L5-L36
[p-message]: https://github.com/udarajay/pile/blob/234aa902f6a5b8b231b815501d5dac996feb8cdf/src/renderer/pages/Pile/Chat/Message/index.js#L7-L45
[p-chat-virtual]: https://github.com/udarajay/pile/blob/234aa902f6a5b8b231b815501d5dac996feb8cdf/src/renderer/pages/Pile/Chat/VirtualList.jsx#L26-L74
[p-editor-js]: https://github.com/udarajay/pile/blob/234aa902f6a5b8b231b815501d5dac996feb8cdf/src/renderer/pages/Pile/Editor/index.jsx#L170-L359
[p-editor-css]: https://github.com/udarajay/pile/blob/234aa902f6a5b8b231b815501d5dac996feb8cdf/src/renderer/pages/Pile/Editor/Editor.module.scss#L48-L125
[p-logo]: https://github.com/udarajay/pile/blob/234aa902f6a5b8b231b815501d5dac996feb8cdf/src/renderer/pages/Home/logo.jsx#L1-L129
[p-license]: https://github.com/udarajay/pile/blob/234aa902f6a5b8b231b815501d5dac996feb8cdf/LICENSE.md#L1-L34
[p-loader-license]: https://github.com/udarajay/pile/blob/234aa902f6a5b8b231b815501d5dac996feb8cdf/src/renderer/pages/Pile/Toasts/Toast/Loaders/Readme.md#L1-L11
