// Snapshot transitions are independent of Electron, window visibility and timers.
function agentStatus() {
  let previous = null
  let connected = false
  let reads = {}
  let sessions = []
  let health = 'disconnected'
  const responses = new Map()
  const read = session => reads[`${session.projectId}:${session.threadId}`] ?? 0
  return {
    receipts(value) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return
      for (const [key, time] of Object.entries(value)) {
        if (typeof time === 'number' && Number.isFinite(time) && time >= 0) reads[key] = Math.max(reads[key] ?? 0, time)
      }
    },
    update(snapshot, viewing = null) {
      health = snapshot.health
      if (health !== 'connected') { connected = false; return [] }
      const next = snapshot.projects.flatMap(project => project.sessions.map(session => ({ ...session, projectName: project.name })))
      const events = []
      for (const session of next) {
        const old = previous?.get(session.id)
        const lastResponse = responses.get(session.id) ?? 0
        if (!connected || !old) responses.set(session.id, Math.max(session.responseAt ?? 0, snapshot.checkedAt ?? 0))
        // A new inventory entry is not evidence of new activity. Reconnects rebase.
        if (!connected || !old || viewing === session.id) continue
        const attention = ['input', 'permission'].includes(session.status)
        if (attention && old.status !== session.status && snapshot.attentionAvailable) events.push({ kind: session.status, session })
        else if (session.status === 'error' && old.status !== 'error') events.push({ kind: 'error', session })
        else if (!attention && session.status !== 'error' && session.agentCount === 0 && session.responseAt != null
          && session.responseAt > lastResponse && session.responseAt > read(session)) events.push({ kind: 'response', session })
      }
      for (const session of next) responses.set(session.id, Math.max(responses.get(session.id) ?? 0, session.responseAt ?? 0))
      const ids = new Set(next.map(session => session.id))
      for (const id of responses.keys()) if (!ids.has(id)) responses.delete(id)
      sessions = next
      previous = new Map(next.map(session => [session.id, session]))
      connected = true
      return events
    },
    summary() {
      const attention = sessions.filter(session => ['input', 'permission', 'error'].includes(session.status))
      const unread = sessions.filter(session => session.agentCount === 0 && session.responseAt != null && session.responseAt > read(session))
      return { health, attention, unread, working: sessions.reduce((count, session) => count + session.agentCount, 0) }
    },
  }
}
module.exports = { agentStatus }
