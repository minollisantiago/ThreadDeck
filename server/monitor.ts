import path from 'node:path'
import type { Project, Session, Snapshot } from '../shared/model.ts'
import type { Connection, RawSession, Registration, Source } from './source.ts'

// Limit simultaneous requests without dropping active sessions from the result.
async function mapLimit<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const result: R[] = new Array(items.length)
  let index = 0
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    for (;;) {
      const current = index++
      if (current >= items.length) return
      result[current] = await fn(items[current])
    }
  }))
  return result
}

export function projectFor(session: RawSession, projects: Registration[]) {
  const channel = session.metadata?.kimaki?.channelId
  if (channel) return projects.find(p => p.channelId === channel)
  const directory = path.resolve(session.location.directory)
  return [...projects].sort((a, b) => b.directory.length - a.directory.length).find(p => {
    const root = path.resolve(p.directory)
    return directory === root || directory.startsWith(root + path.sep)
  })
}

export function groupSessions(
  registrations: Registration[], sessions: RawSession[], active: Set<string>,
  inputs: Set<string>, permissions: Set<string>,
): Project[] {
  const groups = registrations.map(p => ({
    id: p.channelId, name: path.basename(p.directory), directory: p.directory, sessions: [] as Session[],
  }))
  const byId = new Map(sessions.map(s => [s.id, s]))
  const threads = new Map<string, { session: RawSession; agents: Set<string>; input: boolean; permission: boolean }>()
  function owner(raw: RawSession) {
    let current = raw
    const seen = new Set<string>()
    // Native child agents belong to their conversation; btw forks have their own thread.
    while (current.parentID && byId.has(current.parentID) && !seen.has(current.id)) {
      seen.add(current.id)
      const parent = byId.get(current.parentID)!
      const ownThread = current.metadata?.kimaki?.threadId
      if (ownThread && ownThread !== parent.metadata?.kimaki?.threadId) break
      current = parent
    }
    return current
  }
  for (const raw of sessions) {
    const root = owner(raw), thread = root.metadata?.kimaki?.threadId
    if (!thread || !/^\d{17,20}$/.test(thread)) continue
    if (!threads.has(thread)) threads.set(thread, { session: root, agents: new Set(), input: false, permission: false })
    const entry = threads.get(thread)!
    if (active.has(raw.id)) entry.agents.add(raw.id)
    entry.input ||= inputs.has(raw.id)
    entry.permission ||= permissions.has(raw.id)
  }
  for (const { session: raw, agents, input, permission } of threads.values()) {
    if (raw.time.archived && !agents.size) continue
    const project = projectFor(raw, registrations)
    const group = groups.find(p => p.id === project?.channelId)
    if (!group || !project) continue
    group.sessions.push({
      id: raw.id, projectId: group.id, title: raw.title || 'Untitled session',
      threadId: raw.metadata!.kimaki!.threadId!, guildId: project.guildId,
      updatedAt: raw.time.updated, agentCount: agents.size,
      status: permission ? 'permission' : input ? 'input'
        : agents.size ? 'working' : raw.outcome === 'failed' ? 'error' : 'idle',
    })
  }
  // Stable by creation ID, not continually changing activity timestamps.
  for (const group of groups) group.sessions.sort((a, b) => b.id.localeCompare(a.id))
  return groups.sort((a, b) => a.name.localeCompare(b.name))
}

export class Monitor {
  private registrations: Registration[] = []
  private registrationTime = -Infinity
  private recent: RawSession[] = []
  private recentTime = -Infinity
  private limited = false
  private guilds = new Map<string, { guildId: string | null; checkedAt: number }>()
  private endpoint: Connection | undefined
  private responses = new Map<string, { updatedAt: number; responseAt: number | null }>()
  private pending: Promise<Snapshot> | undefined
  private snapshot: Snapshot = {
    projects: [], health: 'disconnected', checkedAt: 0, lastSuccessAt: null,
    attentionAvailable: false, inventoryLimited: false, message: 'Connecting to local services…',
  }
  constructor(private source: Source, private clock = Date.now) {}

  read() { return this.snapshot }
  refresh(): Promise<Snapshot> {
    if (this.pending) return this.pending
    this.pending = this.update().finally(() => { this.pending = undefined })
    return this.pending
  }

  private async update(): Promise<Snapshot> {
    const now = this.clock()
    try {
      if (now - this.registrationTime >= 60_000) {
        this.registrations = await this.source.projects()
        this.registrationTime = now
      }
      // Re-discover on each poll so service restarts and rotated credentials recover.
      this.endpoint = await this.source.connect()
      const activeIds = await this.endpoint.active()
      if (now - this.recentTime >= 30_000) {
        const page = await this.endpoint.recent()
        this.recent = page.sessions; this.limited = page.limited; this.recentTime = now
      }
      const sessions = new Map(this.recent.map(s => [s.id, s]))
      const activeRows = await mapLimit(activeIds, id => this.endpoint!.get(id))
      for (const row of activeRows) sessions.set(row.id, row)
      const relevant = new Set([...activeIds, ...this.recent.filter(s => s.metadata?.kimaki?.threadId).map(s => s.id)])
      // Fetch missing ancestors so delegated work lights up the parent thread too.
      for (let depth = 0; depth < 12; depth++) {
        const missing = [...new Set([...relevant].flatMap(id => {
          const parent = sessions.get(id)?.parentID
          return parent && !sessions.has(parent) ? [parent] : []
        }))]
        if (!missing.length) break
        for (const row of await mapLimit(missing, id => this.endpoint!.get(id))) {
          sessions.set(row.id, row); relevant.add(row.id)
        }
      }
      // Refresh linked rows between inventory sweeps (titles, outcomes and last update).
      const linkedIds = [...sessions.values()].filter(s => s.metadata?.kimaki?.threadId && !activeIds.includes(s.id)).map(s => s.id)
      for (const row of await mapLimit(linkedIds, id => this.endpoint!.get(id))) sessions.set(row.id, row)

      const directories = [...new Set([...sessions.values()]
        .filter(s => relevant.has(s.id) && projectFor(s, this.registrations))
        .map(s => s.location.directory))]
      const attention = await mapLimit(directories, async directory => {
        try { return await this.endpoint!.attention(directory) } catch { return null }
      })
      const inputs = new Set(attention.flatMap(a => a?.input ?? []))
      const permissions = new Set(attention.flatMap(a => a?.permission ?? []))
      // Some Kimaki registrations omit guildId. Resolve through the supported CLI,
      // once per project, rather than handing Discord credentials to the browser.
      const registrations = await mapLimit(this.registrations, async project => {
        if (project.guildId) return project
        const cached = this.guilds.get(project.channelId)
        if (cached?.guildId || cached && now - cached.checkedAt < 60_000) return { ...project, guildId: cached.guildId }
        const example = [...sessions.values()].find(s => s.metadata?.kimaki?.threadId && projectFor(s, [project]))
        if (!example) return project
        let guildId: string | null = null
        try { guildId = await this.source.guild(example.id) } catch { /* links can recover on the next discovery */ }
        this.guilds.set(project.channelId, { guildId, checkedAt: now })
        return { ...project, guildId }
      })
      const projects = groupSessions(registrations, [...sessions.values()], new Set(activeIds), inputs, permissions)
      await mapLimit(projects.flatMap(p => p.sessions), async session => {
        if (session.agentCount > 0) return
        const cached = this.responses.get(session.id)
        if (cached?.updatedAt === session.updatedAt) { session.responseAt = cached.responseAt; return }
        try {
          session.responseAt = await this.endpoint!.response(session.id)
          this.responses.set(session.id, { updatedAt: session.updatedAt, responseAt: session.responseAt })
        } catch { session.responseAt = cached?.responseAt ?? null } // Retry without losing live status.
      })
      const visibleIds = new Set(projects.flatMap(p => p.sessions.map(s => s.id)))
      for (const id of this.responses.keys()) if (!visibleIds.has(id)) this.responses.delete(id)
      this.snapshot = {
        projects,
        health: 'connected', checkedAt: this.clock(), lastSuccessAt: this.clock(),
        attentionAvailable: attention.every(Boolean), inventoryLimited: this.limited, message: null,
      }
      this.recent = [...sessions.values()]
    } catch {
      this.snapshot = {
        ...this.snapshot, health: this.snapshot.lastSuccessAt === null ? 'disconnected' : 'stale',
        checkedAt: this.clock(), message: 'Local source unavailable. Retrying automatically.',
      }
      this.recentTime = -Infinity
      this.registrationTime = -Infinity
    }
    return this.snapshot
  }
}
