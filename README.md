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
