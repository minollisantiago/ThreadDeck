const { test } = require('node:test')
const assert = require('node:assert/strict')
const { prepareReviewSummary, reviewSessions } = require('../electron/review-summary.cjs')
const { savedAppearance } = require('../electron/appearance.cjs')
const session = (id = '1', extra = {}) => ({ id, projectId: 'project', threadId: id, agentCount: 0, responseAt: 100, updatedAt: 100, ...extra })
const snapshot = sessions => ({ health: 'connected', lastSuccessAt: 100, projects: [{ sessions }] })
const history = { messages: [], cursor: 'cursor', before: null, stale: false }

test('startup skips empty, read, or already-seen summaries, including working responses', () => {
  assert.deepEqual(reviewSessions(snapshot([])), [])
  assert.deepEqual(reviewSessions(snapshot([session()]), { read: '{"project:1":100}' }), [])
  assert.deepEqual(reviewSessions(snapshot([session()]), { seen: '{"project:1":100}' }), [])
  assert.deepEqual(reviewSessions(snapshot([session('1', { agentCount: 1 })])), [])
  assert.equal(reviewSessions(snapshot([session()]), { seen: '{"project:1":99}' }).length, 1)
})
test('startup includes manual unread and the complete unread batch when any response is unseen', () => {
  const sessions = [session('1'), session('2', { responseAt: null })]
  assert.deepEqual(reviewSessions(snapshot(sessions), { manual: '{"project:2":true}', seen: '{"project:1":100}' }), sessions)
  assert.equal(reviewSessions(snapshot([session()]), { read: '[]', seen: 'bad json', manual: 'null' }).length, 1)
})
test('summary preparation reports skipped without reading any conversation', async () => {
  const stages = []
  const result = await prepareReviewSummary({ origin: 'http://localhost', snapshot: snapshot([]), update: stage => stages.push(stage), request: () => assert.fail('Must not fetch') })
  assert.equal(result.state, 'skipped')
  assert.equal(stages.at(-1).state, 'skipped')
})
test('summary preparation bounds parallel history reads and returns the payload for renderer reuse', async () => {
  let inFlight = 0, max = 0
  const stages = [], sessions = Array.from({ length: 9 }, (_, i) => session(String(i)))
  const result = await prepareReviewSummary({ origin: 'http://localhost', snapshot: snapshot(sessions), update: stage => stages.push(stage), request: async () => {
    inFlight++; max = Math.max(max, inFlight)
    await new Promise(resolve => setTimeout(resolve, 2)); inFlight--
    return { ok: true, json: async () => history }
  } })
  assert.equal(max, 4)
  assert.equal(result.state, 'ready')
  assert.equal(result.items.length, 9)
  assert.deepEqual(result.items[0].history, history)
  assert.equal(stages.at(-1).detail, 'Review summary prepared')
})
test('missing conversation histories are optional failures, not startup errors', async () => {
  const stages = []
  const result = await prepareReviewSummary({ origin: 'http://localhost', snapshot: snapshot([session()]), update: stage => stages.push(stage), request: async () => { throw new Error('offline') } })
  assert.equal(result.state, 'failed')
  assert.equal(result.items[0].history, null)
  assert.equal(stages.at(-1).state, 'failed')
})
test('summary deadlines release a hung history read without holding startup indefinitely', async () => {
  const result = await prepareReviewSummary({ origin: 'http://localhost', snapshot: snapshot([session()]), update: () => {}, timeout: 10,
    request: (_url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true })) })
  assert.equal(result.state, 'failed')
})
test('summary preparation waits for a connected inventory before deciding it is empty', async () => {
  let snapshots = 0
  const result = await prepareReviewSummary({ origin: 'http://localhost', snapshot: { health: 'disconnected', projects: [], lastSuccessAt: null }, update: () => {}, request: async () => { snapshots++; return { ok: true, json: async () => snapshot([]) } } })
  assert.equal(snapshots, 1)
  assert.equal(result.state, 'skipped')
})
test('the hidden preference read includes review watermarks without marking any thread read', async () => {
  let preferences, stopped = false, unhandled = false
  const window = { loadURL: async () => {}, isDestroyed: () => false, webContents: {
    session: { protocol: { handle: () => {}, unhandle: () => { unhandled = true } } }, stop: () => { stopped = true },
    executeJavaScript: async script => { assert.match(script, /threaddeck:catch-up-seen/); assert.doesNotMatch(script, /setItem/); return { appearance: '"light"', read: '{}', seen: '{}', manual: '{}' } },
  } }
  assert.equal(await savedAppearance(window, 'http://localhost', 'dark', {}, value => { preferences = value }), 'light')
  assert.deepEqual(preferences, { appearance: '"light"', read: '{}', seen: '{}', manual: '{}' })
  assert.equal(stopped && unhandled, true)
})
