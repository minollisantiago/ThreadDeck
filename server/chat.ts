import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFile, mkdir, writeFile, stat, readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { ChatError, submitSchema, threadIdSchema } from '../shared/chat.ts'
import { trustedRequest } from './http.ts'

export interface ChatBridge { call(route: string, input: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> }
export function localChatBridge(): ChatBridge {
  return { async call(route, input, signal) {
    const directory = process.env.KIMAKI_DATA_DIR || path.join(homedir(), '.kimaki')
    const port = Number(process.env.KIMAKI_LOCK_PORT || 29988)
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new ChatError('configuration', 'Invalid Kimaki lock port')
    let token: string
    try { token = (await readFile(path.join(directory, 'lock-token'), 'utf8')).trim() }
    catch { throw new ChatError('bridge_required', 'The local Kimaki chat bridge is not running. Open this thread in Discord instead.') }
    if (!/^[a-f0-9]{64}$/.test(token)) throw new ChatError('bridge_required', 'Kimaki bridge credentials are unavailable')
    let response: Response
    try { response = await fetch(`http://127.0.0.1:${port}/kimaki/client.${route}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.any([AbortSignal.timeout(30_000), ...(signal ? [signal] : [])]) }) }
    catch { throw new ChatError('unavailable', 'Kimaki is unavailable. Your draft is safe; check delivery status before resending.') }
    if (!response.ok) throw new ChatError('bridge_required', 'This Kimaki installation does not expose the chat bridge. Prepare and activate the local fork.')
    const raw: unknown = await response.json()
    const envelope = z.discriminatedUnion('ok', [z.object({ ok: z.literal(true), value: z.unknown() }), z.object({ ok: z.literal(false), error: z.object({ code: z.string(), message: z.string() }) })]).safeParse(raw)
    if (!envelope.success) throw new ChatError('version_mismatch', 'Incompatible Kimaki chat bridge')
    if (!envelope.data.ok) throw new ChatError(envelope.data.error.code, envelope.data.error.message)
    return envelope.data.value
  } }
}
async function body(request: IncomingMessage, limit: number) {
  const chunks: Buffer[] = []; let size = 0
  for await (const chunk of request.iterator({ destroyOnReturn: false })) { size += chunk.length; if (size > limit) { request.resume(); throw new ChatError('too_large', 'Request is too large') } chunks.push(Buffer.from(chunk)) }
  return Buffer.concat(chunks)
}
export function chatHandler(port: number, bridge = localChatBridge(), data = process.env.THREADDECK_DATA_DIR || path.join(homedir(), '.local/share/threaddeck')) {
  return (request: IncomingMessage, response: ServerResponse): boolean => {
    if (!request.url?.startsWith('/api/chat/')) return false
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff'); response.setHeader('Referrer-Policy', 'no-referrer')
    const json = (status: number, value: unknown) => { if (!response.destroyed) response.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(value)) }
    if (!trustedRequest(request, port) || request.headers['sec-fetch-site'] === 'cross-site') { json(403, { error: 'Local requests only' }); return true }
    const controller = new AbortController()
    response.once('close', () => controller.abort())
    void (async () => {
      const url = new URL(request.url!, 'http://localhost'), route = url.pathname.slice('/api/chat/'.length)
      const thread = /^threads\/(\d{17,20})\/(messages|changes|catalog|abort)$/.exec(route)
      const attachment = /^threads\/(\d{17,20})\/messages\/(\d{17,20})\/attachments\/(\d{17,20})$/.exec(route)
      const operation = /^operations\/([a-f0-9-]{36})$/.exec(route)
      if (request.method === 'GET') {
        if (route === 'info' || route === 'threads') return json(200, await bridge.call(route, {}, controller.signal))
        if (operation) return json(200, await bridge.call('operation', { id: z.uuid().parse(operation[1]) }, controller.signal))
        if (thread && thread[2] !== 'abort') {
          const input: Record<string, unknown> = { threadId: thread[1] }
          if (thread[2] === 'messages' && url.searchParams.has('before')) input.before = threadIdSchema.parse(url.searchParams.get('before'))
          if (thread[2] === 'changes') input.cursor = z.string().max(200).parse(url.searchParams.get('cursor') || '')
          return json(200, await bridge.call(thread[2] === 'messages' ? 'snapshot' : thread[2], input, controller.signal))
        }
        if (attachment) {
          const file = z.object({ name: z.string(), type: z.string(), data: z.string().max(14_000_000) }).parse(await bridge.call('file', { threadId: attachment[1], messageId: attachment[2], attachmentId: attachment[3] }, controller.signal))
          const bytes = Buffer.from(file.data, 'base64')
          if (bytes.length > 10 * 1024 * 1024) throw new ChatError('too_large', 'Attachment is too large')
          const inline = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type)
          response.setHeader('Content-Type', inline ? file.type : 'application/octet-stream')
          response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox")
          response.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.name)}`)
          response.writeHead(200).end(bytes); return
        }
      }
      if (request.method === 'POST') {
        if (route === 'files') {
          if (request.headers['content-type'] !== 'application/octet-stream') throw new ChatError('invalid', 'Use a binary file upload')
          const name = z.string().min(1).max(200).parse(url.searchParams.get('name'))
          if (/[\x00-\x1f/\\]/.test(name)) throw new ChatError('invalid', 'Invalid filename')
          // Require the bridge before creating disk state; uploads are never silently staged for an old bot.
          await bridge.call('info', {}, controller.signal)
          const bytes = await body(request, 10 * 1024 * 1024), id = randomUUID(), directory = path.join(data, 'uploads')
          await mkdir(directory, { recursive: true, mode: 0o700 })
          const existing = (await readdir(directory)).filter(name => name.includes('.file.') || name.endsWith('.bin'))
          const sizes = await Promise.all(existing.map(async name => (await stat(path.join(directory, name))).size))
          if (existing.length >= 128 || sizes.reduce((sum, size) => sum + size, 0) + bytes.length > 256 * 1024 * 1024) throw new ChatError('too_large', 'Local upload storage is full; remove files no longer needed before attaching more')
          const extension = /^\.[a-z0-9]{1,12}$/i.test(path.extname(name)) ? path.extname(name) : '.bin'
          const filename = `${id}.file${extension}`
          await writeFile(path.join(directory, filename), bytes, { mode: 0o600, flag: 'wx' })
          await writeFile(path.join(directory, `${id}.json`), JSON.stringify({ name, path: filename, size: bytes.length, createdAt: Date.now() }), { mode: 0o600, flag: 'wx' })
          return json(201, { id, name })
        }
        if (request.headers['content-type']?.split(';')[0] !== 'application/json') throw new ChatError('invalid', 'JSON content type required')
        const input: unknown = JSON.parse((await body(request, 256 * 1024)).toString('utf8'))
        if (route === 'submit') return json(202, await bridge.call('submit', submitSchema.parse(input), controller.signal))
        if (thread?.[2] === 'abort') return json(200, await bridge.call('abort', { threadId: thread[1] }, controller.signal))
      }
      json(404, { error: 'Unknown chat endpoint' })
    })().catch(error => {
      const code = error instanceof ChatError ? error.code : 'invalid'
      const status = code === 'too_large' ? 413 : code === 'invalid' ? 400 : code === 'unlinked' ? 404 : 503
      json(status, { code, error: error instanceof ChatError ? error.message : 'Invalid chat request' })
    })
    return true
  }
}
