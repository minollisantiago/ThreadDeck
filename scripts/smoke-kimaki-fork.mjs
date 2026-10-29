// Exercises the actual prepared adapter and Kimaki prompt/skill code with in-memory
// transports. Never logs in to Discord, starts OpenCode, or reads conversation data.
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import ffmpegPath from 'ffmpeg-static'

const data = process.env.THREADDECK_DATA_DIR || path.join(homedir(), '.local/share/threaddeck')
const manifest = JSON.parse(await readFile(path.join(data, 'kimaki-fork.json'), 'utf8'))
const { attachThreadDeckBridge } = await import(pathToFileURL(path.join(path.dirname(manifest.cli), 'threaddeck-adapter.js')).href)
const scratch = await mkdtemp('/tmp/opencode/threaddeck-adapter-test-')
let transcriptionRequests = 0
const provider = createServer(async (request, response) => {
  let body = ''
  for await (const chunk of request) body += chunk
  const input = JSON.parse(body)
  assert.equal(input.model, 'gpt-audio-1.5')
  transcriptionRequests++
  if (transcriptionRequests === 2) {
    const audio = input.messages[0].content.find(part => part.type === 'input_audio').input_audio
    assert.equal(audio.format, 'wav')
    assert.equal(Buffer.from(audio.data, 'base64').subarray(0, 4).toString(), 'RIFF')
  }
  response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { tool_calls: [{ function: { name: 'transcriptionResult', arguments: JSON.stringify({ transcription: '/review this spoken task as text', route: 'btw', agent: 'plan' }) } }] } }] }))
})
await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve))
const providerUrl = `http://127.0.0.1:${provider.address().port}`
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
  db: { query: { bot_tokens: { findFirst: async () => ({ bot_mode: 'self_hosted', token: 'fake', app_id: discord.user.id, api_keys: { openai_api_key: 'sk-synthetic-test', gemini_api_key: null } }) } } },
  token: 'fake', opencodeDbFile: path.join(scratch, 'missing-credentials.db'), transcriptionBaseUrls: { openai: providerUrl, chatgpt: providerUrl, gemini: providerUrl },
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
  assert.ok((await call('info')).capabilities.includes('audio-prompt'))
  const audioId = randomUUID()
  await writeFile(path.join(scratch, 'uploads', `${audioId}.file.wav`), 'synthetic wav bytes')
  await writeFile(path.join(scratch, 'uploads', `${audioId}.json`), JSON.stringify({ name: 'voice.wav', path: `${audioId}.file.wav` }))
  const beforeAudio = sent.length, beforeInterrupt = interrupted.length
  const audio = await submit({ text: '', delivery: 'queue', files: [{ id: audioId, name: 'voice.wav', audioPrompt: true }] })
  assert.equal(transcriptionRequests, 1)
  assert.equal(sent.length, beforeAudio + 2)
  assert.equal(sent[beforeAudio].files[0].name, 'voice.wav')
  assert.ok(sent.at(-1).content.includes('**Transcription**'))
  assert.equal(sent.at(-1).reply.messageReference, audio.receipt.messageIds[0])
  assert.equal(received.at(-1).text, '/review this spoken task as text')
  assert.equal(received.at(-1).delivery, 'queue')
  assert.equal(interrupted.length, beforeInterrupt)
  assert.equal(received.at(-1).files?.length || 0, 0)
  await call('submit', { requestId: audio.requestId, threadId: id, text: '', delivery: 'queue', files: [{ id: audioId, name: 'voice.wav', audioPrompt: true }] })
  assert.equal(transcriptionRequests, 1)
  // Kimaki's native M4A path also discovers the exact same packaged executable,
  // even though its prism-media dependency lives in the isolated fork.
  const prism = createRequire(pathToFileURL(manifest.cli))('prism-media')
  assert.equal(prism.FFmpeg.getInfo().command, ffmpegPath)
  const m4aId = randomUUID(), m4aPath = path.join(scratch, 'uploads', `${m4aId}.file.m4a`)
  await promisify(execFile)(ffmpegPath, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.2', '-c:a', 'aac', m4aPath], { timeout: 10_000 })
  await writeFile(path.join(scratch, 'uploads', `${m4aId}.json`), JSON.stringify({ name: 'voice.m4a', path: `${m4aId}.file.m4a` }))
  await submit({ text: '', delivery: 'queue', files: [{ id: m4aId, name: 'voice.m4a', audioPrompt: true }] })
  assert.equal(transcriptionRequests, 2)
  console.log('Prepared fork smoke passed: published history, Gateway edits, typed skills, canonical echo, idempotency, native queue and media file extension.')
  console.log('Packaged FFmpeg verified: native Kimaki M4A converts to WAV without requiring system ffmpeg.')
  console.log('Only fake transports were used. Running Kimaki and OpenCode were untouched.')
} finally {
  await bridge.stop()
  provider.closeAllConnections()
  await new Promise(resolve => provider.close(resolve))
  if (originalData === undefined) delete process.env.THREADDECK_DATA_DIR; else process.env.THREADDECK_DATA_DIR = originalData
  await rm(scratch, { recursive: true, force: true })
}
