// Optional startup work. Never write read receipts or prevent the dashboard opening.
function record(value, type) {
  try {
    const parsed = JSON.parse(value ?? '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? Object.fromEntries(Object.entries(parsed).filter(([, item]) => typeof item === type && (type !== 'number' || Number.isFinite(item) && item >= 0))) : {}
  } catch { return {} }
}
function reviewSessions(snapshot, preferences = {}) {
  const read = record(preferences.read, 'number'), manual = record(preferences.manual, 'boolean'), seen = record(preferences.seen, 'number')
  const pending = (snapshot.projects ?? []).flatMap(project => project.sessions.filter(session => {
    const key = `${session.projectId}:${session.threadId}`
    return manual[key] || session.agentCount === 0 && session.responseAt != null && session.responseAt > (read[key] ?? 0)
  }))
  const unseen = pending.some(session => (session.responseAt ?? session.updatedAt) > (seen[`${session.projectId}:${session.threadId}`] ?? -1))
  return unseen ? pending : []
}
async function prepareReviewSummary({ origin, snapshot, preferences, update, request = fetch, signal, timeout = 8000 }) {
  const abort = new AbortController(), timer = setTimeout(() => abort.abort(), timeout)
  const combined = signal ? AbortSignal.any([signal, abort.signal]) : abort.signal
  const items = []
  let sessions = []
  update({ state: 'working', detail: 'Preparing review summary' })
  const json = async route => {
    if (combined.aborted) throw new Error('Summary preparation cancelled')
    const response = await request(`${origin}/api/${route}`, { signal: combined })
    if (!response.ok) throw new Error('Summary source unavailable')
    return response.json()
  }
  try {
    while (snapshot.health !== 'connected' || snapshot.lastSuccessAt == null) {
      await new Promise(resolve => { const timer = setTimeout(done, 200); function done() { clearTimeout(timer); combined.removeEventListener('abort', done); resolve() } combined.addEventListener('abort', done, { once: true }); if (combined.aborted) done() })
      if (combined.aborted) throw new Error('Summary preparation timed out')
      snapshot = await json('snapshot')
    }
    sessions = reviewSessions(snapshot, preferences)
    if (!sessions.length) { update({ state: 'skipped', detail: 'No unseen activity to review' }); return { state: 'skipped', items } }
    let index = 0
    await Promise.all(Array.from({ length: Math.min(4, sessions.length) }, async () => {
      while (index < sessions.length) {
        const session = sessions[index++]
        let history = null
        try {
          history = await json(`chat/threads/${encodeURIComponent(session.threadId)}/messages`)
          if (!history || !Array.isArray(history.messages)) history = null
        } catch { /* expose a per-thread retry in the summary */ }
        items.push({ threadId: session.threadId, version: session.responseAt ?? session.updatedAt, history })
        update({ state: 'working', detail: `Preparing review summary · ${items.length}/${sessions.length} threads` })
      }
    }))
    const failed = items.some(item => !item.history)
    const state = failed ? 'failed' : 'ready'
    update({ state, detail: failed ? 'Some exchanges unavailable · retry in summary' : 'Review summary prepared' })
    return { state, items }
  } catch {
    update({ state: 'failed', detail: 'Summary unavailable · retry in summary' })
    return { state: 'failed', items }
  } finally { clearTimeout(timer) }
}
module.exports = { reviewSessions, prepareReviewSummary }
