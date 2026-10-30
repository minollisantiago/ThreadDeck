import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { renameSessionSchema } from '../shared/sessions.ts'
import type { Monitor } from './monitor.ts'
import { trustedRequest } from './http.ts'

const exec = promisify(execFile)
export async function renameSession(threadId: string, title: string) {
  // End option parsing before the user-controlled positional title.
  await exec('kimaki', ['session', 'title', '--session', threadId, '--', title], { timeout: 30_000, maxBuffer: 64 * 1024 })
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
