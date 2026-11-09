import type { IncomingMessage, ServerResponse } from 'node:http'
import { z } from 'zod'
import { ChatError, receiptSchema, submitSchema } from '../shared/chat.ts'
import { launchPrompt, proposalMutationSchema } from '../shared/proposals.ts'
import { localChatBridge, type ChatBridge } from './chat.ts'
import { trustedRequest } from './http.ts'
import { ProposalStore } from './proposal-store.ts'
import type { Monitor } from './monitor.ts'
import { snapshotStaleAfterMs } from '../shared/update-timing.ts'

export function proposalHandler(port: number, store: ProposalStore, monitor: Pick<Monitor, 'read'>, bridge: ChatBridge = localChatBridge()) {
  return (request: IncomingMessage, response: ServerResponse) => {
    if (request.url?.split('?')[0] !== '/api/proposals') return false
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff')
    const json = (status: number, value: unknown) => { if (!response.destroyed) response.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(value)) }
    if (!trustedRequest(request, port) || request.headers['sec-fetch-site'] === 'cross-site') { json(403, { error: 'Local requests only' }); return true }
    void (async () => {
      if (request.method === 'GET') return json(200, store.list())
      if (request.method !== 'POST') return json(405, { error: 'Method not allowed' })
      if (request.headers['content-type']?.split(';')[0] !== 'application/json') return json(415, { error: 'JSON content type required' })
      const chunks: Buffer[] = []; let size = 0
      for await (const chunk of request.iterator({ destroyOnReturn: false })) {
        size += chunk.length; if (size > 2 * 1024 * 1024) { request.resume(); return json(413, { error: 'Proposal request is too large' }) }
        chunks.push(Buffer.from(chunk))
      }
      const input = proposalMutationSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      if (input.action === 'ingest') {
        const projects = monitor.read().projects
        if (input.proposals.some(p => !projects.some(project => project.id === p.projectId))) throw new ChatError('invalid', 'Proposals must belong to registered projects. Refresh the project list first.')
        store.ingest(input.proposals)
      } else if (input.action === 'decide') store.decide(input)
      else if (input.action === 'resolve') store.resolve(input.id, input.requestId)
      else if (input.action === 'launch') {
        const snapshot = monitor.read()
        const project = snapshot.projects.find(project => project.id === store.list().proposals.find(p => p.id === input.id)?.projectId)
        if (!project || snapshot.health !== 'connected' || snapshot.lastSuccessAt === null || Date.now() - snapshot.lastSuccessAt > snapshotStaleAfterMs) throw new ChatError('unavailable', 'Refresh the connected project list before starting a session.')
        const { fresh } = store.reserve(input)
        if (fresh) {
          try {
            const receipt = receiptSchema.parse(await bridge.call('submit', submitSchema.parse({ requestId: input.requestId, projectId: project.id, text: launchPrompt(input.prompt, input.approach), delivery: 'send', files: [] })))
            store.settle(input.id, receipt)
          } catch { store.uncertain(input.id, input.requestId) }
        }
      } else {
        const p = store.launch(input.id, input.requestId)
        if (p.launch!.receipt.state !== 'submitted') {
          try { store.settle(input.id, receiptSchema.parse(await bridge.call('operation', { id: input.requestId }))) }
          catch { store.uncertain(input.id, input.requestId) }
        }
      }
      json(200, store.list())
    })().catch(error => {
      const code = error instanceof ChatError ? error.code : error instanceof z.ZodError || error instanceof SyntaxError ? 'invalid' : 'unavailable'
      json(code === 'invalid' ? 400 : code === 'conflict' ? 409 : code === 'not_found' ? 404 : 503, { error: error instanceof ChatError ? error.message : code === 'invalid' ? 'Invalid proposal request' : 'Proposal storage unavailable. Refresh before retrying.' })
    })
    return true
  }
}
