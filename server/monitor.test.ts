import { afterEach, describe, expect, it, vi } from 'vitest'
import { Monitor, groupSessions, projectFor } from './monitor.ts'
import type { Connection, RawSession, Registration, Source } from './source.ts'
import { discordLinks } from '../shared/model.ts'

const project: Registration = { directory: '/projects/deck', channelId: '1561737628280164432', guildId: '1526236793048141935' }
const raw = (overrides: Partial<RawSession> = {}): RawSession => ({
  id: 'ses_root', title: 'A conversation', location: { directory: project.directory },
  time: { updated: 100 }, metadata: { kimaki: { channelId: project.channelId, threadId: '1561737719133114458' } },
  ...overrides,
})

describe('conversation grouping', () => {
  it('exposes the root session model without substituting a delegated agent model', () => {
    const model = { id: 'fixture-model', providerID: 'provider', variant: 'high' }
    const child = raw({ id: 'ses_child', parentID: 'ses_root', metadata: undefined, model: { id: 'child-model', providerID: 'provider' } })
    expect(groupSessions([project], [raw({ model }), child], new Set(['ses_child']), new Set(), new Set())[0].sessions[0].model).toEqual(model)
  })
  it('does not mistake the previous successful outcome for completion while working', () => {
    const groups = groupSessions([project], [raw({ outcome: 'succeeded' })], new Set(['ses_root']), new Set(), new Set())
    expect(groups[0].sessions[0].status).toBe('working')
  })
  it('rolls active child agents into their parent thread without duplicate sessions', () => {
    const child = raw({ id: 'ses_child', parentID: 'ses_root', metadata: undefined })
    const groups = groupSessions([project], [raw(), child], new Set(['ses_child']), new Set(), new Set())
    expect(groups[0].sessions).toHaveLength(1)
    expect(groups[0].sessions[0]).toMatchObject({ id: 'ses_root', status: 'working', agentCount: 1 })
  })
  it('propagates confirmed child permission requests to the thread', () => {
    const child = raw({ id: 'ses_child', parentID: 'ses_root', metadata: undefined })
    expect(groupSessions([project], [raw(), child], new Set(['ses_child']), new Set(), new Set(['ses_child']))[0].sessions[0].status).toBe('permission')
  })
  it('keeps a fork with its own thread independent', () => {
    const fork = raw({ id: 'ses_fork', parentID: 'ses_root', metadata: { kimaki: { threadId: '1561737719133114459' } } })
    expect(groupSessions([project], [raw(), fork], new Set(['ses_fork']), new Set(), new Set())[0].sessions).toHaveLength(2)
  })
  it('uses channel association for worktrees outside the project directory', () => {
    expect(projectFor(raw({ location: { directory: '/elsewhere/worktree' } }), [project])).toEqual(project)
    expect(projectFor(raw({ metadata: undefined, location: { directory: '/projects/deck-other' } }), [project])).toBeUndefined()
  })
  it('hides archived conversations unless an agent is still running', () => {
    const archived = raw({ time: { updated: 100, archived: 90 } })
    expect(groupSessions([project], [archived], new Set(), new Set(), new Set())[0].sessions).toHaveLength(0)
    expect(groupSessions([project], [archived], new Set(['ses_root']), new Set(), new Set())[0].sessions).toHaveLength(1)
  })
  it('validates IDs before generating app and browser links', () => {
    expect(discordLinks({ guildId: project.guildId, threadId: '1561737719133114458' })?.app).toBe('discord://-/channels/1526236793048141935/1561737719133114458')
    expect(discordLinks({ guildId: 'javascript:bad', threadId: 'x' })).toBeNull()
  })
})

function fixture() {
  let now = 100_000
  const connection: Connection = {
    active: vi.fn(async () => ['ses_root']),
    recent: vi.fn(async () => ({ sessions: [raw()], limited: false })),
    get: vi.fn(async () => raw()),
    attention: vi.fn(async () => ({ input: [], permission: [] })),
    response: vi.fn(async () => null),
  }
  const source: Source = { events: async function* () {}, projects: vi.fn(async () => [project]), connect: vi.fn(async () => connection), guild: vi.fn(async () => project.guildId) }
  return { monitor: new Monitor(source, () => now), source, connection, advance: () => { now += 5_000 } }
}

describe('monitor refresh', () => {
  it('fetches completion metadata for settled threads and caches it until the session changes', async () => {
    const { monitor, connection, advance } = fixture()
    vi.mocked(connection.active).mockResolvedValue([])
    vi.mocked(connection.response).mockResolvedValue(90)
    expect((await monitor.refresh()).projects[0].sessions[0].responseAt).toBe(90)
    advance(); await monitor.refresh()
    expect(connection.response).toHaveBeenCalledTimes(1)
    vi.mocked(connection.get).mockResolvedValue(raw({ time: { updated: 200 } }))
    vi.mocked(connection.response).mockResolvedValue(190)
    advance()
    expect((await monitor.refresh()).projects[0].sessions[0].responseAt).toBe(190)
    expect(connection.response).toHaveBeenCalledTimes(2)
  })
  it('does not fetch completion metadata while agents are working', async () => {
    const { monitor, connection } = fixture()
    await monitor.refresh()
    expect(connection.response).not.toHaveBeenCalled()
  })
  it('retries failed completion checks without losing live status', async () => {
    const { monitor, connection, advance } = fixture()
    vi.mocked(connection.active).mockResolvedValue([])
    vi.mocked(connection.response).mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValue(90)
    const first = await monitor.refresh()
    expect(first.health).toBe('connected')
    expect(first.projects[0].sessions[0].responseAt).toBeNull()
    advance()
    expect((await monitor.refresh()).projects[0].sessions[0].responseAt).toBe(90)
  })
  it('resolves missing guild IDs through the supported URL lookup and caches them', async () => {
    const { monitor, source, advance } = fixture()
    vi.mocked(source.projects).mockResolvedValue([{ ...project, guildId: null }])
    expect((await monitor.refresh()).projects[0].sessions[0].guildId).toBe(project.guildId)
    advance(); await monitor.refresh()
    expect(source.guild).toHaveBeenCalledTimes(1)
  })
  it('keeps the last snapshot stale rather than converting working threads to idle on failure', async () => {
    const { monitor, connection, advance } = fixture()
    const first = await monitor.refresh()
    vi.mocked(connection.active).mockRejectedValueOnce(new Error('offline'))
    advance()
    const next = await monitor.refresh()
    expect(next.health).toBe('stale')
    expect(next.lastSuccessAt).toBe(first.lastSuccessAt)
    expect(next.projects[0].sessions[0].status).toBe('working')
  })
  it('recovers after a source failure and avoids repeating discovery and inventory every poll', async () => {
    const { monitor, source, connection, advance } = fixture()
    await monitor.refresh(); advance(); await monitor.refresh()
    expect(source.projects).toHaveBeenCalledTimes(1)
    expect(connection.recent).toHaveBeenCalledTimes(1)
    expect(connection.active).toHaveBeenCalledTimes(2)
    vi.mocked(connection.active).mockRejectedValueOnce(new Error('offline'))
    advance(); await monitor.refresh(); advance()
    expect((await monitor.refresh()).health).toBe('connected')
  })
  it('fetches working sessions independently of the bounded inventory', async () => {
    const { monitor, connection } = fixture()
    vi.mocked(connection.recent).mockResolvedValueOnce({ sessions: [], limited: true })
    expect((await monitor.refresh()).projects[0].sessions[0].status).toBe('working')
    expect(connection.get).toHaveBeenCalledWith('ses_root')
  })
  it('does not lose verified working state when optional attention checks fail', async () => {
    const { monitor, connection } = fixture()
    vi.mocked(connection.attention).mockRejectedValueOnce(new Error('not supported'))
    const result = await monitor.refresh()
    expect(result.health).toBe('connected')
    expect(result.attentionAvailable).toBe(false)
    expect(result.projects[0].sessions[0].status).toBe('working')
  })
  it('coalesces concurrent refreshes', async () => {
    const { monitor, connection } = fixture()
    await Promise.all([monitor.refresh(), monitor.refresh()])
    expect(connection.active).toHaveBeenCalledTimes(1)
  })
})

describe('live monitoring', () => {
  let monitor: Monitor | undefined
  afterEach(() => { monitor?.stop(); vi.useRealTimers() })

  function liveFixture() {
    const fixtureValue = fixture()
    monitor = fixtureValue.monitor
    let emit: ((event: { type: string }) => void) | undefined
    fixtureValue.source.events = async function* (signal) {
      yield { type: 'server.connected' }
      while (!signal.aborted) {
        const event = await new Promise<{ type: string } | null>(resolve => {
          const abort = () => resolve(null)
          signal.addEventListener('abort', abort, { once: true })
          emit = event => { signal.removeEventListener('abort', abort); resolve(event) }
        })
        if (!event) break
        yield event
      }
    }
    return { ...fixtureValue, emit: async (type: string) => { emit?.({ type }); await Promise.resolve(); await Promise.resolve() } }
  }

  it('publishes refreshes and supports unsubscribing', async () => {
    const { monitor } = fixture()
    const listener = vi.fn(), unsubscribe = monitor.subscribe(listener)
    await monitor.refresh()
    expect(listener).toHaveBeenCalledWith(monitor.read())
    unsubscribe(); await monitor.refresh()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('coalesces lifecycle bursts, ignores token deltas and immediately rediscovers new idle threads', async () => {
    vi.useFakeTimers()
    const { monitor, connection, emit } = liveFixture()
    monitor.start(); monitor.start()
    await vi.advanceTimersByTimeAsync(150)
    expect(connection.active).toHaveBeenCalledTimes(1)
    await emit('session.text.delta'); await emit('session.step.streamed')
    await vi.advanceTimersByTimeAsync(200)
    expect(connection.active).toHaveBeenCalledTimes(1)
    await emit('session.created'); await emit('session.renamed'); await emit('permission.asked')
    await vi.advanceTimersByTimeAsync(150)
    expect(connection.active).toHaveBeenCalledTimes(2)
    expect(connection.recent).toHaveBeenCalledTimes(2)
    monitor.stop()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(connection.active).toHaveBeenCalledTimes(2)
  })

  it('refreshes the model indicator immediately when a session model is selected', async () => {
    vi.useFakeTimers()
    const { monitor, connection, emit } = liveFixture()
    vi.mocked(connection.get).mockResolvedValue(raw({ model: { id: 'first-model', providerID: 'provider' } }))
    monitor.start()
    await vi.advanceTimersByTimeAsync(150)
    expect(monitor.read().projects[0].sessions[0].model?.id).toBe('first-model')
    vi.mocked(connection.get).mockResolvedValue(raw({ model: { id: 'second-model', providerID: 'provider' } }))
    await emit('session.model.selected')
    await vi.advanceTimersByTimeAsync(150)
    expect(monitor.read().projects[0].sessions[0].model?.id).toBe('second-model')
  })
  it('reconciles periodically even with no events', async () => {
    vi.useFakeTimers()
    const { monitor, connection } = liveFixture()
    monitor.start()
    await vi.advanceTimersByTimeAsync(30_150)
    expect(connection.active).toHaveBeenCalledTimes(2)
  })

  it('runs a follow-up refresh when events arrive during an in-flight refresh', async () => {
    vi.useFakeTimers()
    const { monitor, connection, emit } = liveFixture()
    let release!: (ids: string[]) => void
    vi.mocked(connection.active).mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    monitor.start()
    await vi.advanceTimersByTimeAsync(150)
    await emit('session.created')
    release(['ses_root'])
    await vi.advanceTimersByTimeAsync(200)
    expect(connection.active).toHaveBeenCalledTimes(2)
    expect(connection.recent).toHaveBeenCalledTimes(2)
  })

  it('rediscovers and resubscribes after stream failures', async () => {
    vi.useFakeTimers()
    const { monitor, source, connection } = fixture()
    const events = vi.fn(async function* () { throw new Error('offline') })
    source.events = events
    // Ensure cleanup also covers this fixture.
    try {
      monitor.start()
      await vi.advanceTimersByTimeAsync(3_200)
      expect(events).toHaveBeenCalledTimes(3)
      expect(connection.active).toHaveBeenCalledTimes(3)
    } finally { monitor.stop() }
  })
})
