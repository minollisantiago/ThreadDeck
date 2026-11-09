// Actual pinned scheduler + adapter, scratch DB and clock. No bot startup, model
// requests or real schedules. A synthetic `exit 7` pre-run tests skip semantics.
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
const manifest = JSON.parse(await readFile(path.join(process.env.THREADDECK_DATA_DIR || path.join(homedir(), '.local/share/threaddeck'), 'kimaki-fork.json'), 'utf8'))
const root = path.dirname(manifest.cli), load = file => import(pathToFileURL(path.join(root, file)).href)
const { openDb } = await load('db.js'), schema = await load('schema.js')
const { createTask, editTask, runTaskNow, deleteTask } = await load('scheduler.js')
const { attachThreadDeckBridge } = await load('threaddeck-adapter.js')
const orm = createRequire(manifest.cli)('drizzle-orm')
const scratch = await mkdtemp('/tmp/opencode/threaddeck-schedules-test-')
const database = await openDb({ dataDir: scratch, migrate: true })
if (database instanceof Error) throw database
const id = '100000000000000001', foreign = '100000000000000099'
let now = Date.parse('2030-01-01T00:00:00Z')
const discord = new EventEmitter()
discord.user = { id: foreign }; discord.isReady = () => true
const bot = { db: database.db, dataDir: scratch, discord, clock: { now: () => now }, store: { getState: () => ({ roots: {}, threads: {} }) }, opencode: { connected: true } }
await database.db.insert(schema.channel_directories).values({ channel_id: id, directory: scratch, channel_type: 'text' })
const bridge = attachThreadDeckBridge(bot)
async function call(route, input = {}) {
  const envelope = (await bridge.handle(route, input, new AbortController().signal)).data
  assert.equal(envelope.ok, true, JSON.stringify(envelope))
  return envelope.value
}
async function submit(input) {
  const requestId = randomUUID()
  await call('schedule-submit', { requestId, ...input })
  const deadline = Date.now() + 5000
  for (;;) {
    const receipt = await call('schedule-operation', { id: requestId })
    if (!['accepted', 'running'].includes(receipt.state)) return receipt
    assert.ok(Date.now() < deadline, 'Schedule test operation timed out')
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}
try {
  assert.ok((await call('info')).capabilities.includes('schedules-v1'))
  const prompt = 'Full instruction\n\n' + 'not truncated '.repeat(50)
  const created = await submit({ action: 'create', projectId: id, prompt, sendAt: '0 12 * * 1', agent: 'build', allowConcurrency: false })
  assert.equal(created.state, 'succeeded', JSON.stringify(created))
  let task = (await call('schedules')).schedules[0]
  assert.equal(task.prompt, prompt); assert.equal(task.expression, '0 12 * * 1'); assert.equal(task.timezone, 'UTC')
  const edited = await submit({ action: 'edit', id: task.id, revision: task.revision, changes: { agent: '' } })
  assert.equal(edited.state, 'succeeded', JSON.stringify(edited))
  const stale = await submit({ action: 'edit', id: task.id, revision: task.revision, changes: { prompt: 'stale overwrite' } })
  assert.equal(stale.state, 'failed'); assert.match(stale.error, /changed/)
  task = (await call('schedules')).schedules[0]
  assert.equal(task.prompt, prompt); assert.equal(task.agent, null)
  const guarded = await editTask(bot, { id: task.id, prompt: 'wrong revision' }, () => false)
  assert.ok(guarded instanceof Error)
  assert.ok(await runTaskNow(bot, task.id, () => false) instanceof Error)
  assert.ok(await deleteTask(bot, task.id, () => false) instanceof Error)
  assert.equal((await call('schedules')).schedules[0].prompt, prompt)
  const bad = await submit({ action: 'create', projectId: foreign, prompt: 'No', sendAt: '0 12 * * 1', allowConcurrency: false })
  assert.equal(bad.state, 'failed')
  const invalid = await submit({ action: 'create', projectId: id, prompt: 'No', sendAt: 'not cron', allowConcurrency: false })
  assert.equal(invalid.state, 'failed')
  // Seed an advanced existing routine through Kimaki, not through the web API.
  const advanced = await createTask(bot, { send: { channelId: id, prompt: 'Preserve options', user: ['100000000000000007'], notifyOnly: true }, options: { sendAt: '0 9 * * *', preRun: 'exit 7', allowConcurrency: false } })
  assert.ok(!(advanced instanceof Error))
  let advancedTask = (await call('schedules')).schedules.find(t => t.id === advanced.routineId)
  const preserved = await submit({ action: 'edit', id: advancedTask.id, revision: advancedTask.revision, changes: { prompt: 'Still preserve options' } })
  assert.equal(preserved.state, 'succeeded', JSON.stringify(preserved))
  advancedTask = (await call('schedules')).schedules.find(t => t.id === advanced.routineId)
  assert.equal(advancedTask.preRun, 'exit 7'); assert.equal(advancedTask.notifyOnly, true)
  const row = await database.db.query.scheduled_tasks.findFirst({ where: { id: advancedTask.id } })
  assert.equal(JSON.parse(row.payload_json).userId, '100000000000000007')
  // Legacy timezone survives an instruction-only edit.
  await database.db.update(schema.scheduled_tasks).set({ timezone: 'America/New_York' }).where(orm.eq(schema.scheduled_tasks.id, advancedTask.id))
  advancedTask = (await call('schedules')).schedules.find(t => t.id === advanced.routineId)
  assert.equal((await submit({ action: 'edit', id: advancedTask.id, revision: advancedTask.revision, changes: { prompt: 'Keep legacy timezone' } })).state, 'succeeded')
  assert.equal((await call('schedules')).schedules.find(t => t.id === advancedTask.id).timezone, 'America/New_York')
  // Run-now consumes a skipped one-shot, without contacting Discord or OpenCode.
  const once = await createTask(bot, { send: { channelId: id, prompt: 'Synthetic skipped one-shot' }, options: { sendAt: '2030-01-02T09:00:00Z', preRun: 'exit 7', allowConcurrency: false } })
  const onceTask = (await call('schedules')).schedules.find(t => t.id === once.routineId)
  const skipped = await submit({ action: 'run', id: onceTask.id, revision: onceTask.revision })
  assert.equal(skipped.state, 'succeeded', JSON.stringify(skipped)); assert.equal(skipped.result.ran, false)
  assert.equal(skipped.result.projectId, id)
  assert.ok(!(await call('schedules')).schedules.some(t => t.id === onceTask.id))
  // Corrupt payloads remain visible but cannot be edited or run.
  await database.db.update(schema.scheduled_tasks).set({ payload_json: '{}' }).where(orm.eq(schema.scheduled_tasks.id, task.id))
  const corrupt = (await call('schedules')).schedules.find(t => t.id === task.id)
  assert.equal(corrupt.prompt, null); assert.equal(corrupt.editable, false)
  assert.equal((await submit({ action: 'run', id: corrupt.id, revision: corrupt.revision })).state, 'failed')
  assert.equal((await submit({ action: 'delete', id: corrupt.id, revision: corrupt.revision })).state, 'succeeded')
  console.log('Schedules adapter smoke passed: full prompts, creation, edit CAS, field preservation, UTC/legacy timezone, errors, one-shot skip, corruption and deletion. No live services used.')
} finally { await bridge.stop(); database.close(); await rm(scratch, { recursive: true, force: true }) }
