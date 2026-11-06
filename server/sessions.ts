import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { renameSessionSchema } from '../shared/sessions.ts'
import type { Monitor } from './monitor.ts'
import { trustedRequest } from './http.ts'

export async function renameSession(threadId: string, title: string) {
  const directory = process.env.KIMAKI_DATA_DIR || path.join(homedir(), '.kimaki')
  const port = Number(process.env.KIMAKI_LOCK_PORT || 29988)
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid Kimaki lock port')
  const token = (await readFile(path.join(directory, 'lock-token'), 'utf8')).trim()
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Kimaki credentials unavailable')
  // Use the same native action as the CLI, without its positional argument parser.
  // Goke treats values after `--` as forwarded options, not the required title.
  // JSON also preserves option-like titles (e.g. "--help") without shell escaping.
  const response = await fetch(`http://127.0.0.1:${port}/kimaki/session.title`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ threadId, text: title }), signal: AbortSignal.timeout(30_000), redirect: 'error',
  })
  if (!response.ok) throw new Error('Kimaki rename failed')
  const result: unknown = await response.json()
  if (typeof result !== 'object' || result === null || !('title' in result) || result.title !== title) throw new Error('Kimaki rename could not be confirmed')
}

export function sessionHandler(port: number, monitor: Pick<Monitor, 'read' | 'refresh'>, rename = renameSession) {
  return (request: IncomingMessage, response: ServerResponse) => {
    const match = /^\/api\/sessions\/([^/?]+)\/rename$/.exec(request.url || '')
    if (!match) return false
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    const json = (status: number, value: unknown) => response.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(value))
    if (!trustedRequest(request, port) || request.headers['sec-fetch-site'] === 'cross-site') { json(403, { error: 'Local requests only' }); return true }
    void (async () => {
      if (request.method !== 'POST') return json(405, { error: 'Method not allowed' })
      if (request.headers['content-type']?.split(';')[0] !== 'application/json') return json(415, { error: 'JSON content type required' })
      const chunks: Buffer[] = []; let size = 0
      for await (const chunk of request.iterator({ destroyOnReturn: false })) {
        size += chunk.length
        if (size > 4096) { request.resume(); return json(413, { error: 'Request too large' }) }
        chunks.push(Buffer.from(chunk))
      }
      const { title } = renameSessionSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      const session = monitor.read().projects.flatMap(project => project.sessions).find(session => session.id === match[1])
      if (!session || !/^\d{17,20}$/.test(session.threadId || '')) return json(404, { error: 'Linked conversation unavailable. Refresh before trying again.' })
      try {
        await rename(session.threadId!, title)
      } catch {
        return json(503, { error: 'Rename could not be confirmed. The session title may have changed, but Discord may not be synchronized. Check the current name before retrying.' })
      } finally {
        // Native rename writes OpenCode first; even failures can change its title.
        await monitor.refresh(true).catch(() => {})
      }
      json(200, { title })
    })().catch(() => json(400, { error: 'Enter a single-line name of 1–100 characters.' }))
    return true
  }
}
