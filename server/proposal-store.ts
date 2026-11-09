import { DatabaseSync } from 'node:sqlite'
import { chmodSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { ChatError, receiptSchema, type OperationReceipt } from '../shared/chat.ts'
import { proposalInputSchema, proposalSchema, pendingLaunch, type Proposal, type ProposalInput, type ProposalMutation, type ProposalLaunch } from '../shared/proposals.ts'

export function proposalsDatabase() { return path.join(process.env.THREADDECK_DATA_DIR || path.join(homedir(), '.local/share/threaddeck'), 'proposals.sqlite') }
// App and CLI share this module and SQLite transactions, including across processes.
export class ProposalStore {
  private db: DatabaseSync
  constructor(filename = proposalsDatabase(), private now = Date.now) {
    if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 })
    this.db = new DatabaseSync(filename)
    if (filename !== ':memory:') chmodSync(filename, 0o600)
    this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS proposals (id TEXT PRIMARY KEY, projectId TEXT NOT NULL, dedupeKey TEXT NOT NULL, data TEXT NOT NULL, UNIQUE(projectId, dedupeKey));
      CREATE TABLE IF NOT EXISTS proposal_launches (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS proposal_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`)
  }
  close() { this.db.close() }
  private transaction<T>(run: () => T): T {
    this.db.exec('BEGIN IMMEDIATE')
    try { const result = run(); this.db.exec('COMMIT'); return result } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
  private all() { return this.db.prepare('SELECT data FROM proposals').all().map(row => proposalSchema.parse(JSON.parse(String(row.data)))) }
  private save(proposal: Proposal) {
    const parsed = proposalSchema.parse(proposal)
    this.db.prepare('INSERT INTO proposals VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(parsed.id, parsed.projectId, parsed.key, JSON.stringify(parsed))
    return parsed
  }
  private get(id: string) {
    const row = this.db.prepare('SELECT data FROM proposals WHERE id=?').get(id)
    if (!row) throw new ChatError('not_found', 'Proposal not found')
    return proposalSchema.parse(JSON.parse(String(row.data)))
  }
  private wake() {
    for (const p of this.all()) if (p.status === 'snoozed' && p.snoozedUntil !== null && p.snoozedUntil <= this.now()) this.save({ ...p, status: 'inbox', snoozedUntil: null, updatedAt: this.now(), revision: randomUUID() })
  }
  list() {
    return this.transaction(() => {
      this.wake()
      const meta = this.db.prepare("SELECT value FROM proposal_meta WHERE key='reviewedAt'").get()
      return { proposals: this.all().sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id)), reviewedAt: meta ? Number(meta.value) : null }
    })
  }
  ingest(input: ProposalInput[]) {
    const parsed = z.array(proposalInputSchema).max(100).parse(input)
    return this.transaction(() => {
      const now = this.now()
      for (const value of parsed) {
        const row = this.db.prepare('SELECT data FROM proposals WHERE projectId=? AND dedupeKey=?').get(value.projectId, value.key)
        const previous = row ? proposalSchema.parse(JSON.parse(String(row.data))) : null
        // Discovery owns evidence, not user decisions or session linkage.
        this.save(previous ? { ...previous, ...value, reviewedAt: now, revision: randomUUID() } : { ...value, id: randomUUID(), revision: randomUUID(), status: 'inbox', createdAt: now, reviewedAt: now, updatedAt: now, snoozedUntil: null, decisionReason: '', session: null, launch: null })
      }
      this.db.prepare("INSERT INTO proposal_meta VALUES ('reviewedAt', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(now))
    })
  }
  decide(input: Extract<ProposalMutation, { action: 'decide' }>) {
    return this.transaction(() => {
      this.wake()
      const p = this.get(input.id)
      if (p.revision !== input.revision) throw new ChatError('conflict', 'This proposal changed. Refresh before deciding.')
      if (pendingLaunch(p)) throw new ChatError('conflict', 'Resolve session delivery before changing this proposal.')
      if (input.status === 'snoozed' && (!input.snoozedUntil || input.snoozedUntil <= this.now())) throw new ChatError('invalid', 'Choose a future snooze time.')
      return this.save({ ...p, status: input.status, decisionReason: input.reason, snoozedUntil: input.status === 'snoozed' ? input.snoozedUntil! : null, revision: randomUUID(), updatedAt: this.now() })
    })
  }
  reserve(input: Extract<ProposalMutation, { action: 'launch' }>): { proposal: Proposal; fresh: boolean } {
    return this.transaction(() => {
      const p = this.get(input.id)
      const prior = this.db.prepare('SELECT data FROM proposal_launches WHERE id=?').get(input.requestId)
      if (prior) {
        const launch: ProposalLaunch = JSON.parse(String(prior.data))
        if (launch.proposalId !== p.id || launch.prompt !== input.prompt || launch.approach !== input.approach) throw new ChatError('conflict', 'Request ID already used for another launch.')
        return { proposal: p, fresh: false }
      }
      if (p.revision !== input.revision) throw new ChatError('conflict', 'This proposal changed. Refresh before starting.')
      if (p.status !== 'inbox' || p.session || pendingLaunch(p)) throw new ChatError('conflict', 'Open the linked session or resolve the existing delivery before starting.')
      const launch: ProposalLaunch = { id: input.requestId, proposalId: p.id, prompt: input.prompt, approach: input.approach, receipt: { id: input.requestId, state: 'accepted', messageIds: [], updatedAt: this.now() }, createdAt: this.now(), resolvedAt: null }
      this.db.prepare('INSERT INTO proposal_launches VALUES (?, ?)').run(launch.id, JSON.stringify(launch))
      return { proposal: this.save({ ...p, launch, revision: randomUUID(), updatedAt: this.now() }), fresh: true }
    })
  }
  launch(id: string, requestId: string) {
    const p = this.get(id)
      if (!p.launch || p.launch.id !== requestId || p.launch.resolvedAt !== null) throw new ChatError('conflict', 'This is not the active launch.')
    return p
  }
  settle(id: string, receipt: OperationReceipt) {
    const parsed = receiptSchema.parse(receipt)
    return this.transaction(() => {
      const p = this.get(id)
      if (!p.launch || p.launch.id !== parsed.id || p.launch.resolvedAt) throw new ChatError('conflict', 'Unexpected operation receipt.')
      const previous = p.launch.receipt
      // Never regress a confirmed delivery because a slower poll returned late.
      if (previous.state === 'submitted' && p.session) return p
      const confirmed = parsed.state === 'submitted' && parsed.threadId && parsed.sessionId
      const launch = { ...p.launch, receipt: parsed.state === 'submitted' && !confirmed ? { ...parsed, state: 'unknown' as const, error: 'Delivery reported success without a session link. Inspect Discord before resolving this guard.' } : parsed }
      this.db.prepare('UPDATE proposal_launches SET data=? WHERE id=?').run(JSON.stringify(launch), launch.id)
      return this.save({ ...p, launch, ...(confirmed && { status: 'progress' as const, session: { id: parsed.sessionId!, threadId: parsed.threadId! } }), revision: randomUUID(), updatedAt: this.now() })
    })
  }
  uncertain(id: string, requestId: string) {
    const p = this.launch(id, requestId)
    if (p.launch!.receipt.state === 'submitted') return p
    return this.settle(id, { ...p.launch!.receipt, state: 'unknown', updatedAt: this.now(), error: 'Delivery could not be confirmed. Check operation status and Discord before resolving; do not resend automatically.' })
  }
  resolve(id: string, requestId: string) {
    return this.transaction(() => {
      const p = this.launch(id, requestId)
      if (!['unknown', 'failed'].includes(p.launch!.receipt.state)) throw new ChatError('conflict', 'Check delivery status before resolving this guard.')
      const launch = { ...p.launch!, resolvedAt: this.now() }
      this.db.prepare('UPDATE proposal_launches SET data=? WHERE id=?').run(JSON.stringify(launch), launch.id)
      return this.save({ ...p, launch, revision: randomUUID(), updatedAt: this.now() })
    })
  }
}
