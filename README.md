# ThreadDeck

A personal, local, read-only switchboard for Kimaki/OpenCode conversations.
Discord remains the conversation interface. Sessions always stay grouped by project.

## Stack

Vite, React, TypeScript, Tailwind CSS and shadcn/ui-style source components,
with a lightweight Node.js backend. Node 24+ is required.

## Development

```sh
npm install
npm run dev
```

Open `http://localhost:5173` in your Windows browser when running inside WSL.
The backend and frontend share one loopback-only port.

```sh
npm run check
npm run build
npm start
```

The existing Kimaki CLI must be on PATH and the existing OpenCode V2 service
must be running. ThreadDeck never starts, stops, or reconfigures either service.
No Discord token or OpenCode credential is sent to the browser.

## Data and refresh

- Active sessions are checked every five seconds, independently of the recent list.
  Native child agents roll up into the owning Discord thread.
- The latest 300 OpenCode sessions are inventoried every 30 seconds. Projects are
  rediscovered every minute. Only Discord-linked conversations in registered
  Kimaki projects appear. This is a recent switchboard, not a full history browser.
- Project association prefers the Kimaki channel, so linked worktrees remain under
  their original project. Directory matching is a fallback, not project-ID matching.
- Forms and permissions supply optional attention badges. Ordinary Discord
  questions/buttons are not inferred. Idle is not completion.
- A failed source check preserves the previous rows as stale, never as newly idle.
- No transcripts, Git history, database access, or service mutations are used.

The local backend is loopback-only and rejects foreign Host/Origin headers.
Do not expose it through a public tunnel: session titles are personal data.
`PORT` changes the default port. `KIMAKI_OPENCODE_SERVICE_FILE` optionally selects
the existing OpenCode registration used by Kimaki.
