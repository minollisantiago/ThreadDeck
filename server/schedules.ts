import type { IncomingMessage, ServerResponse } from 'node:http'
import { z } from 'zod'
import { ChatError } from '../shared/chat.ts'
import { scheduleMutationSchema, scheduleOperationSchema, schedulesCapability, schedulesResponseSchema } from '../shared/schedules.ts'
import { localChatBridge, type ChatBridge } from './chat.ts'
import { trustedRequest } from './http.ts'

export function scheduleHandler(port: number, bridge: ChatBridge = localChatBridge()) {
  return (request: IncomingMessage, response: ServerResponse) => {
    const pathname = request.url?.split('?')[0] || ''
    if (pathname !== '/api/schedules' && !pathname.startsWith('/api/schedules/')) return false
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff'); response.setHeader('Referrer-Policy', 'no-referrer')
    const json = (status: number, value: unknown) => { if (!response.destroyed) response.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(value)) }
    if (!trustedRequest(request, port) || request.headers['sec-fetch-site'] === 'cross-site') { json(403, { error: 'Local requests only' }); return true }
    const controller = new AbortController()
    response.once('close', () => controller.abort())
    void (async () => {
      const operation = /^\/api\/schedules\/operations\/([^/]+)$/.exec(pathname)
      if (pathname !== '/api/schedules' && !operation) return json(404, { error: 'Unknown schedules endpoint' })
      if (request.method !== 'GET' && !(pathname === '/api/schedules' && request.method === 'POST')) return json(405, { error: 'Method not allowed' })
      const info = z.object({ capabilities: z.array(z.string()) }).parse(await bridge.call('info', {}, controller.signal))
      if (!info.capabilities.includes(schedulesCapability)) throw new ChatError('unsupported', 'Schedules need the updated local Kimaki bridge. Prepare the fork, then activate it when you choose to restart Kimaki.')
      if (operation) return json(200, scheduleOperationSchema.parse(await bridge.call('schedule-operation', { id: z.uuid().parse(operation[1]) }, controller.signal)))
      if (request.method === 'GET') return json(200, schedulesResponseSchema.parse(await bridge.call('schedules', {}, controller.signal)))
      if (request.headers['content-type']?.split(';')[0] !== 'application/json') return json(415, { error: 'JSON content type required' })
      const chunks: Buffer[] = []; let size = 0
      for await (const chunk of request.iterator({ destroyOnReturn: false })) {
        size += chunk.length
        if (size > 256 * 1024) { request.resume(); return json(413, { error: 'Schedule request is too large' }) }
        chunks.push(Buffer.from(chunk))
      }
      const input = scheduleMutationSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      return json(202, scheduleOperationSchema.parse(await bridge.call('schedule-submit', input, controller.signal)))
    })().catch(error => {
      const code = error instanceof ChatError ? error.code : error instanceof z.ZodError || error instanceof SyntaxError ? 'invalid' : 'unavailable'
      json(code === 'invalid' ? 400 : code === 'not_found' ? 404 : code === 'conflict' ? 409 : 503, { code, error: error instanceof ChatError ? error.message : code === 'invalid' ? 'Invalid schedule request or incompatible bridge response' : 'Schedules are unavailable. An interrupted operation may still have completed; check its status before trying again.' })
    })
    return true
  }
}
