# ThreadDeck: graphical UI inspiration

Research date: **2026-10-20**. Research only; no application changes.

## Recommendation, ranked

1. **Project cockpit cards in a responsive grid.** Keep the charcoal surfaces, pastel state accents, and mono typography. Make each project a distinct visual container with its name/icon, small state-count chips, and **visible titled sessions**, not an accordion that conceals the useful information. Borrow the nested-card hierarchy in reference 1, not its analytics. Two columns on roomy screens, one on narrow screens; prefer predictable reading order over masonry.
2. **Read-only status board as an optional alternate view.** Reference 2 makes individual items scannable inside well-separated status columns; reference 4 adds project swimlanes. Useful when the immediate question is “what needs me?” rather than “what is happening in this project?” Keep project names on every session card. More columns and empty project/status intersections make this less suitable as the default mini-app view.
3. **A small abstract working indicator, not a visualization dashboard.** References 5–6 provide concrete motion vocabulary. Animate only sessions actually reported as working, in a consistent location. This is a supporting cue, never a replacement for titles and explicit state labels.

These are design adaptations, not claims that the references have demonstrated better usability for ThreadDeck.

## Six concrete references

### 1. Yuri Gokoryan — AI support-agent dashboard cards

- **Original designer:** <https://x.com/yurygok/status/2100843251477397905>
- **CollectUI item:** <https://collectui.com/designs/dashboard-ui-design-inspiration/c9916838-e613-488e-8faa-b0b342133cf2>
- **Accessible artwork:** <https://cdn.collectui.com/media/HSexuGLWAAACpyz.avif>
- **Observed:** The inspected artwork pairs two charcoal panels. Each has a circular header icon, title and subdued subtitle separated from its body. The “Unresolved” panel contains individually rounded, titled inset cards with compact secondary badges. The original post includes three additional images using the same visual language: agent performance, knowledge sources, and a conversation.
- **Borrow:** The outer-panel/inset-card hierarchy maps naturally to **project → session**. Give each project a stable identity mark; let each session retain a readable title, state badge, agent count, updated time, and Discord link. A thin pastel outline or a badge can emphasize input/permission requests without turning the whole project red.
- **Do not borrow:** The channel ring, resolution percentages, performance charts, confidence scores, transcript, and training action. ThreadDeck has neither the relevant data nor those write capabilities. In particular, replacing those charts with invented “progress” would be misleading.

### 2. Razvan Badea — conversation/status kanban

- **Original designer:** <https://x.com/imRazvanBadea/status/1990835658735411523>
- **CollectUI item:** <https://collectui.com/designs/dashboard-ui-design-inspiration/b83046ab-bea4-468f-828c-7297da9437e2>
- **Accessible artwork:** <https://cdn.collectui.com/media/G6Dees4a4AAa7Kg.avif>
- **Observed:** Three softly tinted columns labeled “Not Started,” “In Progress,” and “Finished” hold compact cards. Cards visibly preserve identity, short text, relative time, a channel icon, and a separated metadata footer; the columns themselves do not fill the entire screen height unnecessarily.
- **Borrow:** Clear column backgrounds, explicit column labels, compact card footers, and visible card titles. For ThreadDeck, use its real states: working, idle, error, input requested, permission needed. A simplified “Needs attention” group could combine the latter states only if individual badges preserve the distinction.
- **Limitation:** **Idle is not Finished.** These are live session conditions, not stages in a task-completion funnel. Do not copy drag handles, add buttons, assignment controls, message/attachment totals, or workflow transitions into a read-only switchboard. Five columns are awkward on a narrow screen, so this should remain optional.

### 3. Michael Nowak — modern OKR dashboard detail

- **Original designer:** <https://x.com/mnowakdesign/status/2014321428716495163>
- **CollectUI item:** <https://collectui.com/designs/dashboard-ui-design-inspiration/b98560ca-028b-44a1-9485-9b6e0a5fa96d>
- **Accessible artwork:** <https://cdn.collectui.com/media/G_ROqJ6a0AAK_gG.avif>
- **Observed:** Large rounded modules mix oversized numbers, concise labels, a pill reading “Items blocked,” and a roadmap with circular state icons. The inspected crop also contains an 89% progress bar and connecting arrows.
- **Borrow:** A restrained **attention-count chip** and clear distinction between a number and its meaning: e.g. “2 need input,” not an unexplained red “2.” Apply the modular spacing to project cards, but make them much denser than this presentation crop.
- **Limitation:** Reject its percentage, checkmarks, arrows, and roadmap semantics. ThreadDeck cannot infer completion, milestones, ordering dependencies, or historical events. Large KPI panels would also waste the space needed for session titles.

### 4. Linear — board layout and project swimlanes

- **First-party documentation and screenshots:** <https://linear.app/docs/board-layout>
- **Observed/documented:** Linear supports board/list switching, status grouping by default, alternative grouping by project and other properties, hiding columns, and collapsible swimlanes. Its documentation explicitly warns that cards cannot display every property.
- **Borrow:** An optional “Projects / Status” view switch. For a wide-screen status board, use project rows and state columns, with small titled session cards in the cells. Preserve the same ordering and metadata across views so the user need not relearn the app.
- **Limitation:** Swimlanes multiply empty space, and frequent state changes can move a card away from the user's pointer. A project grid keeps a more stable home for each session. No drag-to-change-state affordances; no task lifecycle assumptions. Never trade away session titles merely to match a screenshot's density.

### 5. David Hill — agent-working animation exploration

- **Original designer:** <https://x.com/iamdavidhill/status/1991865714823565517>
- **CollectUI item:** <https://collectui.com/designs/loading-ui-design-inspiration/91e85a25-44b2-4314-931a-d057b3de09e9>
- **Gallery video:** <https://cdn.collectui.com/amplify_video/1991864643946786816/vid/avc1/3840x2160/8IcRW9VtjepRl1Pz-optimized.mp4>
- **Source statement:** The designer calls for indicators that are “clear, large, and obvious,” remain “in the same location every time,” differ per agent, and are color-synced. The original post identifies the exploration as making it obvious an agent is working.
- **Borrow:** A consistent small signal/glyph beside a working session title, or one modest project-header signal when that project has working sessions. A static icon and the word “Working” must carry the same meaning without motion.
- **Limitation:** The original text was verified; the full video was not frame-by-frame inspected. Do not translate motion speed, brightness, or number of decorative particles into throughput, progress, or agent count. Do not animate idle sessions as though they were executing.

### 6. Generative Loaders — inline waiting-state primitives

- **First-party gallery:** <https://generativeloaders.com/>
- **First-party documentation:** <https://generativeloaders.com/docs>
- **Documented:** `InlineLoader` is intended for buttons/status rows and offers variants including glyph, orbit, signal, and dot-pulse. The API has size, color, speed, paused, and label options. The documentation says all loaders respect reduced motion and retain meaning without animation; unlabeled inline loaders are hidden from assistive technology to avoid duplicate announcements.
- **Borrow:** The inline scale and accessibility behavior, rather than a full-screen loader. Pair a single understated signal with an existing textual working label. Prefer a tiny CSS treatment if importing a library would add unnecessary weight.
- **Limitation:** Text-reveal and image-generation loaders do not fit: ThreadDeck has no streaming transcript or generated-image surface. A loader does not establish percentage completion, and a decorative project orb should not resemble telemetry.

## Data-to-visual mapping

| Available fact | Honest graphical treatment |
| --- | --- |
| Project membership | Stable bordered project card and identity mark |
| Session title | Visible text in an inset card, not hover-only content |
| Current state | Icon + explicit label + pastel accent; color is redundant |
| State totals | Labeled chips, or discrete segments explicitly labeled as current-state counts |
| `agentCount` | Number with an agent icon and text label; not fake teammate avatars |
| `updatedAt` | “Updated … ago”; not “working for …” or a history plot |
| Discord session link | Clear external-link affordance to continue the conversation there |

Keep errors, input requests, and permission requests visually distinguishable. If an aggregate attention badge is used, it must not imply every session in that project has the same state. Preserve a session's own label. No completion rings, invented event timelines, dependency diagrams, sparklines, or percentage bars.

## Source access and remaining gap

- **Dribbble was specifically investigated**, including <https://dribbble.com/search/project-dashboard>, <https://dribbble.com/search/project-management-dashboard>, and <https://dribbble.com/search/agent-dashboard>. The responses were AWS WAF JavaScript challenges or empty HTTP 202 bodies. Websearch returned no results even for broad queries. Consequently, there is **no verified Dribbble shot recommendation** in this note; search pages are research leads, not evidence of any specific layout. Do not manufacture shot URLs or attribute an unseen control-room design to a designer.
- CollectUI's current pages are client-rendered. The old guessed `/designs/dashboard` path returns 404; the current category route is <https://collectui.com/designs/dashboard-ui-design-inspiration>. Published gallery metadata was read through the same public read-only data source used by its client, then followed to the original designer posts above. The three static artworks in references 1–3 were downloaded and visually inspected. No private/account data was used.
- CollectUI is discovery, not proof of a product's behavior. Original posts verify authorship and expose the images; recommendations above distinguish observed image details, documented behavior, and ThreadDeck-specific proposals. No usability or performance benefit is asserted from a visual alone.

## Other suggested sites and implementation vocabulary

### Beautiful UI: session surfaces and attention hierarchy

- [Task Rows / Capsules](https://www.beautifului.dev/#task-rows) demonstrates rounded, self-contained task surfaces with leading state icons and expandable details. The live site was visually inspected. Borrow compact titled session tiles inside project cards; simply rounding the existing rows will not fix the overall list-like layout.
- [Approval Card](https://www.beautifului.dev/#approval-card) supplies useful attention hierarchy: a contained panel with a clear title and a distinct footer. Adapt this into a warm-tinted permission/input/error tile with an explicit label and **Open in Discord** navigation. Do not copy question bodies, response choices, dismiss or approval actions: ThreadDeck lacks the bodies and remains read-only. Ordinary Discord questions/buttons are not inferred.
- [Loading State](https://www.beautifului.dev/#loading-state) offers pixel-grid, dots and orbit variants. A small pixel signal beside “Working” fits the mono identity. Do not copy its elapsed timer: `updatedAt` is not a run-start timestamp.
- The [license](https://www.beautifului.dev/license) is MIT and requires preservation of its notice when copying code.

### Design Engineer Tools: useful discovery, not a dashboard template

- [Design Engineer Tools](https://designengineer.tools/) links to component resources including Motion Primitives and NumberFlow.
- [Animated Background](https://motion-primitives.com/docs/animated-background) demonstrates sliding selection backgrounds and segmented controls: useful for making the selected filter obvious.
- [Transition Panel](https://motion-primitives.com/docs/transition-panel) supplies restrained expansion/detail transitions. [Border Trail](https://motion-primitives.com/docs/border-trail) demonstrates an animated card border that could indicate verified working state, but should not compete with every session on screen.
- [NumberFlow](https://number-flow.barvian.me/) animates numeric changes and respects reduced-motion preferences by default: useful for working/attention counts only when their values change. Do not reanimate unchanged content on every refresh.
- These are polish references, not reasons to add dependencies before testing the layout. Small CSS treatments may suffice.

### Optional graphical experiment: bounded project islands

- [React Flow's Sub Flow example](https://reactflow.dev/examples/grouping/sub-flows) demonstrates nested groups and child nodes. [Node Status Indicator](https://reactflow.dev/ui/components/node-status-indicator) demonstrates loading borders and overlays.
- A more adventurous alternative is a bounded project map: each project is an island containing readable titled session nodes. Status glyphs/borders communicate working and attention states. This is a design hypothesis, not a proven usability improvement, and ranks below the grid for predictable scanning.
- Connectors, if any, may represent **project membership only**, never invented session dependencies or agent topology. The snapshot has a rolled-up `agentCount`, not child-agent identities. Never map idle to the reference's success state.
- A static CSS/SVG arrangement can test the language without adopting a full graph framework. Keep keyboard-accessible links and a clear reading order; no tiny hover-only dots or mandatory pan/zoom to find a thread.

### Canvas UI: optional decoration, not information architecture

- [Canvas UI's gallery](https://canvasui.dev/components) contains ASCII Object, Dithered Object, Particle Object, Glass, Ripple and other effects. Potential use: one optional low-contrast project emblem or header accent, not effects over session text.
- Its [rendering docs](https://canvasui.dev/docs/rendering) describe WebGL/WebGPU builds and fallback behavior. The [homepage FAQ](https://canvasui.dev/) notes that live HTML-in-canvas capability is experimental and Chrome-flag-dependent; some effects can still run as GPU overlays without it. Any selected effect needs browser testing.
- The homepage states **MIT + Commons Clause**, with restrictions on reselling/redistributing the components. Do not assume unrestricted MIT from its “open source” marketing.
- Avoid cursor lenses, particle reveals or distortion over titles, and avoid many persistent GPU effects. Make layout and state meaning work in ordinary HTML first.

### Shipped-product layout reference

- [Vercel's 2021 dashboard redesign](https://vercel.com/changelog/a-new-dashboard-overview-is-now-available) explicitly combines project cards, recognizable icons, search and quick navigation. Its original illustration shows a three-column project grid. This is an older layout reference, not a claim about Vercel's current dashboard.
- Borrow recognizable project monograms/icons and a regular grid; keep directly linked titles visible within each project. Skip analytics rings, commit details and deployment history, which ThreadDeck does not have.

## What to compare later, if approved

Compare the same synthetic dataset in **A: project-card grid**, **B: project-column board**, and optionally **C: bounded project islands**. A project-column board preserves grouping more directly than global status columns; status swimlanes are a separate wide-screen option. Keep behavior and data identical.

Check how easily someone can find an attention request, identify which project is working, and open a known thread. Include long titles, many threads in one project, idle projects, stale/unknown state, mobile and reduced motion. Keep stable positions during background polling, distinguish project identity colors from status colors, and stop live working animations when status cannot be verified. No prototype or UI change is authorized by this research note.
