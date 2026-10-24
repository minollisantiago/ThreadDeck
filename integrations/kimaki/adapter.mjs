// Copied into the isolated Kimaki fork, next to its own compiled modules.
import { createHash } from 'node:crypto'
import { lstat, readFile, chmod } from 'node:fs/promises'
import path from 'node:path'
import { homedir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { ChatError, createClientBridge } from './threaddeck-core.js'
import { sessionDirectory } from './bot.js'
import { runInSession, abort } from './prompt.js'
import { startSession } from './sessions.js'
import { readCatalog } from './slash-commands.js'
import { SKIPPED_COMMANDS } from './commands/thread-commands.js'
import { markdownPayloads } from './markdown/components.js'
import { SILENT_MESSAGE_FLAGS } from './format-parts.js'

function result(value) { if (value instanceof Error) throw value; return value }
export function attachThreadDeckBridge(bot) {
  const memberId = process.env.THREADDECK_DISCORD_USER_ID
  if (memberId && !/^\d{17,20}$/.test(memberId)) throw new Error('THREADDECK_DISCORD_USER_ID must be a Discord user ID')
  const uploads = path.join(process.env.THREADDECK_DATA_DIR || path.join(homedir(), '.local/share/threaddeck'), 'uploads')
  const linked = id => Boolean(bot.store.getState().roots[id])
  async function thread(id) {
    if (!linked(id)) throw new Error('Unlinked thread')
    const channel = await bot.discord.channels.fetch(id)
    if (!channel?.isThread() || !channel.isSendable()) throw new Error('Thread unavailable')
    return channel
  }
  async function files(input) {
    return Promise.all(input.files.map(async file => {
      if (!/^[a-f0-9-]{36}$/.test(file.id)) throw new Error('Invalid upload')
      const metadata = JSON.parse(await readFile(path.join(uploads, `${file.id}.json`), 'utf8'))
      const relative = metadata.path || `${file.id}.bin`
      if (relative !== `${file.id}.bin` && !new RegExp(`^${file.id}\\.file\\.[a-z0-9]{1,12}$`, 'i').test(relative)) throw new Error('Invalid upload path')
      const filename = path.join(uploads, relative)
      const stat = await lstat(filename)
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 10 * 1024 * 1024 || metadata.name !== file.name) throw new Error('Invalid upload')
      return { path: filename, name: metadata.name, uri: pathToFileURL(filename).href }
    }))
  }
  async function catalog(threadId) {
    const sessionId = bot.store.getState().roots[threadId]
    const directory = result(await sessionDirectory(bot, sessionId))
    const entries = result(await readCatalog(bot, directory))
    return { entries: [
      ...entries.commands.filter(c => !SKIPPED_COMMANDS.has(c.name)).map(c => ({ kind: 'command', name: c.name, description: c.description })),
      ...entries.skills.map(s => ({ kind: 'skill', name: s.id, description: s.description })),
    ] }
  }
  async function route(input, threadId) {
    let kind = input.kind, name = input.name, text = input.text
    if (kind === 'prompt' && text.trimStart().startsWith('/')) {
      const match = text.trim().match(/^\/([\w.:-]+)(?:\s+([\s\S]*))?$/)
      if (!match) return { kind: input.delivery === 'queue' ? 'queue' : 'steer', text }
      kind = match[1].endsWith('-skill') ? 'skill' : 'command'
      name = kind === 'skill' ? match[1].slice(0, -6) : match[1]; text = match[2] || ''
    }
    if (kind === 'prompt') return { kind: input.delivery === 'queue' ? 'queue' : 'steer', text }
    const entries = (await catalog(threadId)).entries
    if (!entries.some(e => e.kind === kind && e.name === name)) throw new ChatError('invalid', 'Command or skill is unavailable in this project')
    if (kind === 'skill') {
      if (input.delivery === 'queue') throw new ChatError('invalid', 'Kimaki skill actions cannot be queued; choose Send now')
      return { kind: 'skill', id: name, arguments: text }
    }
    return { kind: 'command', name, arguments: text, queue: input.delivery === 'queue' }
  }
  const actor = () => ({ id: bot.discord.user.id, username: 'ThreadDeck local operator' })
  const bridge = createClientBridge({
    linked,
    async threads() { return { threads: Object.entries(bot.store.getState().roots).map(([threadId, sessionId]) => ({ threadId, sessionId })) } },
    async history(threadId, before) {
      await thread(threadId)
      return bot.discord.rest.get(`/channels/${threadId}/messages`, { query: new URLSearchParams({ limit: '50', ...(before && { before }) }) })
    },
    async validate(input) {
      try { await files(input) } catch { throw new ChatError('invalid', 'An attached file is unavailable. Remove it and attach it again.') }
      if (input.threadId) { await thread(input.threadId); await route(input, input.threadId) }
      else {
        if (input.kind !== 'prompt' || /^\/[\w.:-]+(?:\s|$)/.test(input.text.trimStart())) throw new ChatError('invalid', 'Start a conversation with a prompt before invoking commands')
        const project = await bot.db.query.channel_directories.findFirst({ where: { channel_id: input.projectId } })
        if (!project) throw new ChatError('invalid', 'Project is not registered locally')
      }
    },
    async create(input) {
      const project = await bot.db.query.channel_directories.findFirst({ where: { channel_id: input.projectId } })
      const created = result(await startSession(bot, { channelId: project.channel_id, directory: project.directory,
        route: { kind: 'steer', text: input.text }, author: actor(), messageId: input.requestId,
        startMessageId: null, showInput: false, run: false, threaddeckSetup: true }))
      if (memberId) await (await thread(created.threadId)).members.add(memberId).catch(() => {})
      return created
    },
    async publish(input, threadId, progress) {
      const channel = await thread(threadId)
      if (channel.archived) await channel.setArchived(false)
      const staged = await files(input)
      const shown = input.kind === 'prompt' ? input.text : `/${input.name}${input.kind === 'skill' ? '-skill' : ''}${input.text ? ` ${input.text}` : ''}`
      const payloads = markdownPayloads(`**ThreadDeck · local operator${input.delivery === 'queue' ? ' · queued' : ''}**\n\n${shown}`)
      for (const [index, payload] of payloads.entries()) {
        const nonce = createHash('sha256').update(`${input.requestId}:${index}`).digest('hex').slice(0, 24)
        const sent = await channel.send({ ...payload, flags: (payload.flags || 0) | SILENT_MESSAGE_FLAGS,
          files: index === 0 ? staged.map(f => ({ attachment: f.path, name: f.name })) : [], allowedMentions: { parse: [] }, nonce, enforceNonce: true })
        progress(sent.id)
      }
    },
    async dispatch(input, threadId, messageId) {
      const channel = await thread(threadId), sessionId = bot.store.getState().roots[threadId]
      const directory = result(await sessionDirectory(bot, sessionId))
      result(await runInSession(bot, { sessionId, threadId, threadName: channel.name, directory,
        route: await route(input, threadId), author: actor(), messageId, files: (await files(input)).map(f => ({ uri: f.uri, name: f.name })) }))
    },
    catalog,
    async abort(threadId) { result(await abort(bot, { threadId })) },
    async file(input) {
      const channel = await thread(input.threadId)
      if (!/^\d{17,20}$/.test(String(input.messageId)) || !/^\d{17,20}$/.test(String(input.attachmentId))) throw new Error('Invalid attachment')
      const message = await bot.discord.rest.get(`/channels/${channel.id}/messages/${input.messageId}`)
      const attachment = message.attachments?.find(a => a.id === input.attachmentId)
      if (!attachment || attachment.size > 10 * 1024 * 1024) throw new Error('Attachment unavailable or larger than 10 MiB')
      const url = new URL(attachment.url)
      if (url.protocol !== 'https:' || !['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname) || url.username || url.password || (url.port && url.port !== '443')) throw new Error('Unsafe attachment URL')
      const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20_000) })
      if (!response.ok || !response.body) throw new Error('Download unavailable')
      const buffers = []; let size = 0
      for await (const chunk of response.body) { size += chunk.length; if (size > 10 * 1024 * 1024) { await response.body.cancel().catch(() => {}); throw new Error('Attachment too large') } buffers.push(Buffer.from(chunk)) }
      return { name: attachment.filename, type: attachment.content_type || 'application/octet-stream', data: Buffer.concat(buffers).toString('base64') }
    },
  }, path.join(bot.dataDir, 'threaddeck-operations.sqlite'))
  void chmod(path.join(bot.dataDir, 'threaddeck-operations.sqlite'), 0o600).catch(() => {})
  const raw = packet => { if (packet.t?.startsWith('MESSAGE_')) bridge.ingest(packet.t, packet.d) }
  const disconnect = () => bridge.connection(false), reconnect = () => bridge.connection(true)
  bot.discord.on('raw', raw); bot.discord.on('shardDisconnect', disconnect); bot.discord.on('shardReady', reconnect); bot.discord.on('shardResume', reconnect)
  return { handle: bridge.handle, async stop() {
    bot.discord.off('raw', raw); bot.discord.off('shardDisconnect', disconnect); bot.discord.off('shardReady', reconnect); bot.discord.off('shardResume', reconnect)
    await bridge.stop()
  } }
}
