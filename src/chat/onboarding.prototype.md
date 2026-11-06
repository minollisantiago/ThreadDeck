# First-run chat empty states — throwaway study

Question: which simple empty state best helps someone connect their first project
while keeping the chat composer visible?

Run `npm run prototype:onboarding`, then use `?variant=current`, `A`, `B`, or `C`.
The default is **Current app**, using the real `ChatWorkspace` and `Dashboard`
components inside an isolated iframe, not a visual approximation. Its synthetic
inventory has the Kimaki registration and no active sessions, with no last-session
restore preference. Switch the scenario to compare zero registered projects too.
The baseline pins dark appearance to match the mocks, but retains the real controls.
All requests are intercepted with in-memory fixtures; registration and sending are
blocked. Production preference hooks write only to an in-memory storage shim.

Export a downloadable, self-contained HTML with
`npm run prototype:onboarding -- --export`. It includes both the current app and
the mocks, embeds the font, and needs no server or network connection to run.
The floating switcher also selects `state=home` or `state=unconfigured`.
The page uses the real app tokens and chat styling, but only synthetic content.
Nothing is sent, registered, uploaded, persisted, or automatically created.

- **Current app:** real existing behavior, including the Active filter empty state,
  Show all sessions, session finder and project discovery. No chat composer until
  a project/conversation is selected; this is intentional baseline fidelity.
- **A / Quiet welcome:** centered welcome, one primary folder action, assistant help secondary.
- **B / A little guidance:** a vertical checklist distinguishes completed Kimaki setup from adding a project.
- **C / Start with a conversation:** prompt suggestions are the primary navigation; connecting a folder is an alternative.

All proposed variants show a composer. In the genuinely unconfigured state it accepts a
draft but cannot send. The setup dialog is simulated, not an implemented wizard.
The folder action stands in for the existing project browser; it does not read
the real filesystem in this publicly shareable prototype.

## Verified constraints

Checked against the prepared Kimaki 1.4.0 fork's `src/project.ts` and `src/onboarding.ts`:

- Default project directory is `<Kimaki data dir>/projects/kimaki`, normally
  `~/.kimaki/projects/kimaki`, not Kimaki's source checkout.
- Its general channel is normally `#kimaki`; onboarding starts a linked thread
  that can help discover projects and invoke `kimaki project add` on the user's behalf.
- Existing upgraded installations can already have project mappings without
  this default project. Do not assume every install has it or identify it by name alone.
- With zero mapped channels and no explicit guild, `kimaki project add` asks for
  initial bot onboarding. The folder browser alone cannot replace Discord setup.

Checked against this repo's `integrations/kimaki/adapter.mjs`:

- Desktop slash actions are the project's native commands and skills, not every
  Kimaki Discord management command. No project/channel-creation slash action
  is registered by the local fork's command modules.
- A new conversation must start with a normal prompt; slash commands require an
  existing linked thread. Reusing an existing onboarding thread could avoid that
  prerequisite, but this study does not choose or fabricate a real thread.

## Recommended direction, not implemented

Reuse the existing general project when available. Give it a clear local **Home**
label with its **Kimaki** backing visible; do not rename its directory or Discord
channel, and do not silently create a second ThreadDeck project. Treat it as a
general-purpose workspace, not a repository. Use the existing folder browser as
the primary deterministic path; plain-language assistant help is optional.

Keep genuinely missing setup separate from no user projects, unavailable services,
and filtered-out projects. Never infer a first-run state from the Active filter.

Pending decision: choose a variant or combine pieces. Capture the winning design
and archive the study on a throwaway branch after approval; no production onboarding
behavior has been changed by this prototype.
