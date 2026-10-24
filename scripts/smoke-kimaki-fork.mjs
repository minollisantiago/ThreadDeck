// Exercises the actual prepared adapter and Kimaki prompt/skill code with in-memory
// transports. Never logs in to Discord, starts OpenCode, or reads conversation data.
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const data = process.env.THREADDECK_DATA_DIR || path.join(homedir(), '.local/share/threaddeck')
const manifest = JSON.parse(await readFile(path.join(data, 'kimaki-fork.json'), 'utf8'))
const { attachThreadDeckBridge } = await import(pathToFileURL(path.join(path.dirname(manifest.cli), 'threaddeck-adapter.js')).href)
const scratch = await mkdtemp('/tmp/opencode/threaddeck-adapter-test-')
const originalData = process.env.THREADDECK_DATA_DIR
process.env.THREADDECK_DATA_DIR = scratch
const id = '100000000000000001', sessionId = 'ses_synthetic', sent = [], received = [], interrupted = []
let sequence = 100000000000000010n
const discord = new EventEmitter()
discord.user = { id: '100000000000000099' }
discord.isReady = () => true
discord.channels = { fetch: async () => ({ id, name: 'Synthetic test', isThread: () => true, isSendable: () => true,
  send: async payload => { sent.push(payload); return { id: String(sequence++) } },
}) }
discord.rest = { get: async () => [{ id: '100000000000000002', channel_id: id, content: 'Published Discord payload', timestamp: '2026-10-24T00:00:00Z', author: { id: discord.user.id, username: 'Fake Kimaki', bot: true } }] }
const client = {
  integration: { list: async () => ({ data: [] }) }, agent: { list: async () => ({ data: [] }) },
  command: { list: async () => ({ data: [{ name: 'review' }] }) }, skill: { list: async () => ({ data: [{ id: 'research', description: 'Test skill' }] }) },
  session: {
    get: async () => ({ location: { directory: '/synthetic' } }),
    interrupt: async value => { interrupted.push(value) },
    prompt: async value => { received.push(value) }, command: async value => { received.push(value) },
  },
}
const bridge = attachThreadDeckBridge({ discord, store: { getState: () => ({ roots: { [id]: sessionId }, threads: {} }) }, dataDir: scratch,
  opencode: { connected: true, endpoint: { client } }, eventLoop: { dispatch: () => {} },
})
const call = async (route, input = {}) => {
  const result = await bridge.handle(route, input, new AbortController().signal)
  assert.equal(result.data.ok, true, JSON.stringify(result.data))
  return result.data.value
}
async function submit(input) {
  const requestId = randomUUID()
  await call('submit', { requestId, threadId: id, delivery: 'send', ...input })
  const deadline = Date.now() + 3000
  for (;;) {
    const receipt = await call('operation', { id: requestId })
    if (receipt.state === 'submitted') return { requestId, receipt }
    assert.ok(!['unknown', 'failed'].includes(receipt.state), JSON.stringify(receipt))
    assert.ok(Date.now() < deadline, 'Synthetic operation timed out')
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}
try {
  assert.equal((await call('info')).protocol, 1)
  assert.equal((await call('info')).ready, true)
  const snapshot = await call('snapshot', { threadId: id })
  assert.equal(snapshot.messages[0].content, 'Published Discord payload')
  discord.emit('raw', { t: 'MESSAGE_UPDATE', d: { id: snapshot.messages[0].id, channel_id: id, content: 'Gateway edit' } })
  assert.equal((await call('changes', { threadId: id, cursor: snapshot.cursor })).changes[0].message.content, 'Gateway edit')
  const skill = await submit({ kind: 'skill', name: 'research', text: 'Inspect primary sources' })
  assert.deepEqual(received.at(-1).skills, [{ id: 'research' }])
  assert.equal(received.at(-1).text, 'Inspect primary sources')
  assert.equal(received.at(-1).id, `msg_discord_${skill.receipt.messageIds[0]}`)
  assert.ok(sent[0].content.includes('ThreadDeck · local operator'))
  assert.ok(sent[0].content.includes('/research-skill'))
  assert.deepEqual(sent[0].allowedMentions, { parse: [] })
  const count = sent.length
  await call('submit', { requestId: skill.requestId, threadId: id, delivery: 'send', kind: 'skill', name: 'research', text: 'Inspect primary sources' })
  assert.equal(sent.length, count)
  const interrupts = interrupted.length
  await submit({ text: 'Run this later', delivery: 'queue' })
  assert.equal(received.at(-1).delivery, 'queue'); assert.equal(interrupted.length, interrupts)
  const uploadId = randomUUID()
  await mkdir(path.join(scratch, 'uploads'))
  await writeFile(path.join(scratch, 'uploads', `${uploadId}.file.png`), 'synthetic image bytes')
  await writeFile(path.join(scratch, 'uploads', `${uploadId}.json`), JSON.stringify({ name: 'screenshot.png', path: `${uploadId}.file.png` }))
  await submit({ text: 'Inspect this screenshot', files: [{ id: uploadId, name: 'screenshot.png' }] })
  assert.ok(received.at(-1).files[0].uri.endsWith('.png'))
  assert.equal(received.at(-1).files[0].name, 'screenshot.png')
  console.log('Prepared fork smoke passed: published history, Gateway edits, typed skills, canonical echo, idempotency, native queue and media file extension.')
  console.log('Only fake transports were used. Running Kimaki and OpenCode were untouched.')
} finally {
  await bridge.stop()
  if (originalData === undefined) delete process.env.THREADDECK_DATA_DIR; else process.env.THREADDECK_DATA_DIR = originalData
  await rm(scratch, { recursive: true, force: true })
}
