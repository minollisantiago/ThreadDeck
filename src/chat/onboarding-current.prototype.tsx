// THROWAWAY: render today's real app components with synthetic inventory, never live APIs.
import { createRoot } from 'react-dom/client'
import { Dashboard } from '../App'
import { ChatWorkspace } from './workspace'
import { TooltipProvider } from '../components/ui/tooltip'
import type { Snapshot } from '../../shared/model'
import '../styles.css'

// Isolate production hooks' preferences in memory, including in the downloadable file.
for (const key of ['localStorage', 'sessionStorage']) {
  const values = new Map<string, string>()
  Object.defineProperty(window, key, { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, String(value)) },
    removeItem: (key: string) => { values.delete(key) }, clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null, get length() { return values.size },
  } })
}
localStorage.setItem('threaddeck:appearance', JSON.stringify('dark'))
const scenario = (window as Window & { __ONBOARDING_SCENARIO__?: string }).__ONBOARDING_SCENARIO__
const now = Date.now()
const snapshot: Snapshot = { health: 'connected', checkedAt: now, lastSuccessAt: now, attentionAvailable: true, inventoryLimited: false, message: null,
  projects: scenario === 'unconfigured' ? [] : [{ id: '100000000000000001', name: 'kimaki', directory: '/home/demo/.kimaki/projects/kimaki', sessions: [] }],
}
// Real controls stay interactive, but every API call is a fixture. Mutations are blocked.
window.fetch = async (input, options) => {
  const url = new URL(String(input), 'http://prototype.local')
  if (options?.method && options.method !== 'GET') return Response.json({ error: 'Preview only — no projects, channels or prompts are created.' }, { status: 403 })
  if (url.pathname === '/api/projects/browse') {
    const directory = url.searchParams.get('directory') || '/home/demo/projects'
    return Response.json({ directory, parent: directory === '/home/demo/projects' ? '/home/demo' : '/home/demo/projects', registered: null, locations: ['/home/demo/projects'], guilds: [], entries: directory === '/home/demo/projects' ? [{ name: 'my-project', directory: '/home/demo/projects/my-project', repository: true, registered: null }] : [] })
  }
  if (url.pathname === '/api/search') return Response.json({ hits: [], indexed: 0, indexing: false, error: null })
  return Response.json({ code: 'prototype', error: 'Fixture only — the chat service is not connected in this comparison.' }, { status: 503 })
}
createRoot(document.getElementById('root')!).render(<TooltipProvider><ChatWorkspace snapshot={snapshot}><Dashboard snapshot={snapshot} now={now} /></ChatWorkspace></TooltipProvider>)
