// Durable submissions + Discord-message projection. No OpenCode messages enter this module.
import { DatabaseSync } from 'node:sqlite'
import { createHash, randomUUID } from 'node:crypto'
import { ZodError } from 'zod'
import { ChatError, submitSchema, publishedMessageSchema, threadIdSchema, type ChatSubmission, type PublishedMessage, type MessageChange, type OperationReceipt } from '../../shared/chat.ts'
export { ChatError }

export interface BridgeAdapter {
  ready?(): boolean
  linked(threadId: string): boolean
  threads(): Promise<unknown>
  history(threadId: string, before?: string): Promise<unknown[]>
  validate(input: ChatSubmission): Promise<void>
  create(input: ChatSubmission): Promise<{ threadId: string; sessionId: string }>
  publish(input: ChatSubmission, threadId: string, progress: (id: string) => void): Promise<void>
  dispatch(input: ChatSubmission, threadId: string, messageId: string): Promise<void>
  transcribe?(input: ChatSubmission, threadId: string, messageId: string, progress: (id: string) => void): Promise<ChatSubmission>
  catalog(threadId: string): Promise<unknown>
  file(input: unknown): Promise<unknown>
  abort(threadId: string): Promise<void>
}
type Projection = { generation: string; sequence: number; messages: Map<string, PublishedMessage>; partial: Map<string, Record<string, unknown>>; deleted: Set<string>; log: { sequence: number; change: MessageChange }[]; wake: Set<() => void> }
const pendingStates = new Set(['accepted', 'creating', 'publishing', 'published', 'transcribing', 'dispatching'])
export function createClientBridge(adapter: BridgeAdapter, filename: string) {
  const db = new DatabaseSync(filename)
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY, hash TEXT NOT NULL, receipt TEXT NOT NULL)')
  const select = db.prepare('SELECT hash, receipt FROM operations WHERE id = ?')
  const save = db.prepare('UPDATE operations SET receipt = ? WHERE id = ?')
  for (const row of db.prepare('SELECT id, receipt FROM operations').all()) {
    const receipt = JSON.parse(String(row.receipt)) as OperationReceipt
    if (pendingStates.has(receipt.state)) save.run(JSON.stringify({ ...receipt, state: 'unknown', error: 'Kimaki restarted before delivery was confirmed. Do not automatically resend.', updatedAt: Date.now() }), String(row.id))
  }
  const projections = new Map<string, Projection>(), workers = new Map<string, Promise<void>>()
  let epoch = randomUUID(), stale = false, stopped = false, pending = 0, connectionGeneration = 0
  function target(value: unknown) {
    const id = threadIdSchema.parse(value)
    if (!adapter.linked(id)) throw new ChatError('unlinked', 'This thread is not linked to this Kimaki instance')
    return id
  }
  function projection(id: string) {
    let value = projections.get(id)
    if (!value) {
      if (projections.size >= 24) {
        const oldest = projections.keys().next().value!
        for (const wake of projections.get(oldest)!.wake) wake()
        projections.delete(oldest)
      }
      value = { generation: randomUUID(), sequence: 0, messages: new Map(), partial: new Map(), deleted: new Set(), log: [], wake: new Set() }; projections.set(id, value)
    }
    return value
  }
  function cursor(p: Projection) { return `${epoch}.${p.generation}:${p.sequence}` }
  function record(id: string, change: MessageChange) {
    const p = projections.get(id)
    if (!p) return
    if (change.type === 'delete') { p.messages.delete(change.id); p.partial.delete(change.id); p.deleted.add(change.id) }
    else { p.messages.set(change.message.id, change.message); p.partial.delete(change.message.id); p.deleted.delete(change.message.id) }
    p.log.push({ sequence: ++p.sequence, change }); if (p.log.length > 500) p.log.shift()
    if (p.messages.size > 250) p.messages.delete(p.messages.keys().next().value!)
    // A reset is safer than dropping tombstones and resurrecting deleted history.
    if (p.deleted.size > 1000) { epoch = randomUUID(); p.deleted.clear() }
    for (const wake of p.wake) wake()
  }
  function ingest(type: string, data: Record<string, unknown>) {
    const id = String(data.channel_id || '')
    if (!adapter.linked(id) || !projections.has(id)) return
    if (type === 'MESSAGE_DELETE') return record(id, { type: 'delete', id: String(data.id) })
    if (type === 'MESSAGE_DELETE_BULK') { for (const mid of data.ids as string[] || []) record(id, { type: 'delete', id: mid }); return }
    if (type !== 'MESSAGE_CREATE' && type !== 'MESSAGE_UPDATE') return
    const old = projections.get(id)!.messages.get(String(data.id))
    const parsed = publishedMessageSchema.safeParse({ ...old, ...data })
    if (parsed.success) record(id, { type: 'upsert', message: parsed.data })
    else {
      const p = projections.get(id)!
      p.partial.set(String(data.id), { ...p.partial.get(String(data.id)), ...data })
      if (p.partial.size > 500) p.partial.delete(p.partial.keys().next().value!)
      epoch = randomUUID()
      for (const wake of p.wake) wake()
    }
  }
  function connection(connected: boolean) {
    stale = !connected; epoch = randomUUID(); connectionGeneration++
    for (const p of projections.values()) {
      p.messages.clear(); p.partial.clear(); p.log = []; p.sequence = 0
      for (const wake of p.wake) wake()
    }
  }
  function update(receipt: OperationReceipt, patch: Partial<OperationReceipt>) {
    Object.assign(receipt, patch, { updatedAt: Date.now() }); save.run(JSON.stringify(receipt), receipt.id)
  }
  async function submit(value: unknown) {
    const input = submitSchema.parse(value)
    if (input.files.some(file => file.audioPrompt) && !adapter.transcribe) throw new ChatError('unsupported', 'This Kimaki bridge does not support audio prompts')
    const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex')
    const existing = select.get(input.requestId)
    if (existing) {
      if (existing.hash !== hash) throw new ChatError('conflict', 'This request ID was already used for different content')
      return JSON.parse(String(existing.receipt)) as OperationReceipt
    }
    if (pending >= 32) throw new ChatError('busy', 'Too many pending local submissions')
    if (input.threadId) target(input.threadId)
    await adapter.validate(input)
    // Validation can await. Recheck so concurrent retries cannot insert twice.
    const raced = select.get(input.requestId)
    if (raced) {
      if (raced.hash !== hash) throw new ChatError('conflict', 'Request ID conflict')
      return JSON.parse(String(raced.receipt)) as OperationReceipt
    }
    if (pending >= 32) throw new ChatError('busy', 'Too many pending local submissions')
    const receipt: OperationReceipt = { id: input.requestId, state: 'accepted', messageIds: [], updatedAt: Date.now(), ...(input.threadId && { threadId: input.threadId }) }
    db.prepare('INSERT INTO operations VALUES (?, ?, ?)').run(input.requestId, hash, JSON.stringify(receipt))
    pending++
    const key = input.threadId || input.projectId!
    const work = (workers.get(key) || Promise.resolve()).then(async () => {
      try {
        if (stopped) { update(receipt, { state: 'unknown', error: 'Bridge stopped before submission' }); return }
        if (!receipt.threadId) { update(receipt, { state: 'creating' }); update(receipt, await adapter.create(input)) }
        const threadId = target(receipt.threadId)
        update(receipt, { state: 'publishing' })
        await adapter.publish(input, threadId, id => update(receipt, { messageIds: [...receipt.messageIds, id] }))
        update(receipt, { state: 'published' })
        let prompt = input
        if (input.files.some(file => file.audioPrompt)) {
          update(receipt, { state: 'transcribing' })
          prompt = await adapter.transcribe!(input, threadId, receipt.messageIds[0]!, id => update(receipt, { messageIds: [...receipt.messageIds, id] }))
        }
        update(receipt, { state: 'dispatching' })
        await adapter.dispatch(prompt, threadId, receipt.messageIds[0]!)
        update(receipt, { state: 'submitted' })
      } catch (error) {
        // A transport error can follow a successful external side effect. Never label it safe to retry.
        update(receipt, { state: 'unknown', error: error instanceof ChatError ? `${error.message} Inspect Discord before deciding to resend.` : 'Delivery could not be confirmed. Inspect Discord and this operation before deciding to resend.' })
      } finally { pending-- }
    }).finally(() => { if (workers.get(key) === work) workers.delete(key) })
    workers.set(key, work)
    return { ...receipt }
  }
  async function handle(route: string, input: Record<string, unknown>, signal: AbortSignal) {
    try {
      let value: unknown
      switch (route) {
        case 'info': value = { protocol: 1, kimakiVersion: '1.4.0', actor: 'local-operator', ready: adapter.ready?.() ?? false, capabilities: ['history', 'changes', 'prompt', 'queue', 'create', 'files', 'catalog', 'abort', ...(adapter.transcribe ? ['audio-prompt'] : [])] }; break
        case 'threads': value = await adapter.threads(); break
        case 'snapshot': {
          const id = target(input.threadId), p = projection(id)
          const before = input.before === undefined ? undefined : threadIdSchema.parse(input.before)
          const start = p.sequence, generation = connectionGeneration
          const history = (await adapter.history(id, before)).map(m => publishedMessageSchema.parse(m))
          if (generation !== connectionGeneration) throw new ChatError('resync', 'Discord reconnected during history fetch; refresh the conversation')
          if (history.some(message => message.channel_id !== id)) throw new ChatError('unavailable', 'Discord returned a different thread; refusing to mix conversations')
          if (start < (p.log[0]?.sequence ?? start + 1) - 1) throw new ChatError('resync', 'History changed too quickly; refresh the conversation')
          const combined = new Map(history.map(m => [m.id, m]))
          for (const [id, message] of combined) {
            const known = p.messages.get(id)
            if (known?.edited_timestamp && known.edited_timestamp > (message.edited_timestamp || '')) combined.set(id, known)
            const partial = p.partial.get(id)
            if (partial && (!partial.edited_timestamp || String(partial.edited_timestamp) >= (message.edited_timestamp || ''))) combined.set(id, publishedMessageSchema.parse({ ...combined.get(id), ...partial }))
          }
          // Changes recorded while REST was in flight override the older fetched page.
          for (const entry of p.log.filter(e => e.sequence > start)) {
            if (entry.change.type === 'upsert' && (!before || combined.has(entry.change.message.id))) combined.set(entry.change.message.id, entry.change.message)
            if (entry.change.type === 'delete') combined.delete(entry.change.id)
          }
          for (const id of p.deleted) combined.delete(id)
          const messages = [...combined.values()].sort((a, b) => BigInt(a.id) < BigInt(b.id) ? -1 : 1)
          for (const m of messages) { p.messages.set(m.id, m); p.partial.delete(m.id) }
          while (p.messages.size > 250) p.messages.delete(p.messages.keys().next().value!)
          value = { messages, cursor: cursor(p), before: history.length === 50 ? history.at(-1)!.id : null, stale }; break
        }
        case 'changes': {
          const id = target(input.threadId), p = projections.get(id)
          const requested = String(input.cursor || '')
          if (p && requested === cursor(p) && !signal.aborted) await new Promise<void>(resolve => {
            const done = () => { clearTimeout(timer); p.wake.delete(done); signal.removeEventListener('abort', done); resolve() }
            const timer = setTimeout(done, 20_000); p.wake.add(done); signal.addEventListener('abort', done, { once: true })
          })
          const current = projections.get(id), [requestedEpoch, seq] = requested.split(':')
          const sequence = Number(seq)
          const resync = !current || requestedEpoch !== `${epoch}.${current.generation}` || !Number.isSafeInteger(sequence) || sequence > current.sequence || sequence < (current.log[0]?.sequence ?? current.sequence + 1) - 1
          value = { cursor: current ? cursor(current) : '', resync, stale, changes: resync ? [] : current!.log.filter(e => e.sequence > sequence).map(e => e.change) }; break
        }
        case 'submit': value = await submit(input); break
        case 'operation': {
          const row = select.get(String(input.id)); if (!row) throw new ChatError('not_found', 'Unknown operation')
          value = JSON.parse(String(row.receipt)); break
        }
        case 'catalog': value = await adapter.catalog(target(input.threadId)); break
        case 'file': target(input.threadId); value = await adapter.file(input); break
        case 'abort': await adapter.abort(target(input.threadId)); value = { stopped: true }; break
        default: throw new ChatError('unsupported', 'Unsupported bridge operation')
      }
      return { data: { ok: true, value } }
    } catch (error) {
      return { data: { ok: false, error: { code: error instanceof ChatError ? error.code : error instanceof ZodError ? 'invalid' : 'unavailable', message: error instanceof ChatError ? error.message : error instanceof ZodError ? 'Invalid bridge request' : 'Kimaki bridge request failed' } } }
    }
  }
  return { handle, ingest, connection, async stop() { stopped = true; connection(false); await Promise.allSettled(workers.values()); db.close() } }
}
