import { ChatError, historySchema } from '../shared/chat.ts'
import { discordAttachmentUrl, publishedAttachments } from '../shared/discord-attachments.ts'
import type { ChatBridge } from './chat.ts'

const limit = 10 * 1024 * 1024

export async function readDiscordAttachment(bridge: ChatBridge, threadId: string, messageId: string, attachmentId: string, signal: AbortSignal, download: typeof fetch = fetch) {
  // Re-read the exact published message so signed URLs are fresh. This also
  // works with already-running bridges that only understand legacy attachments.
  const history = historySchema.parse(await bridge.call('snapshot', { threadId, before: (BigInt(messageId) + 1n).toString() }, signal))
  const message = history.messages.find(message => message.id === messageId && message.channel_id === threadId)
  const file = message && publishedAttachments(message).find(file => file.id === attachmentId)
  const reference = file && discordAttachmentUrl(file.url)
  if (!file || !reference || reference.id !== attachmentId) throw new ChatError('unlinked', 'Attachment is not part of this conversation message')
  if (file.size > limit) throw new ChatError('too_large', 'Attachment is larger than 10 MiB')
  const response = await download(reference.url, { redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]) })
  if (!response.ok || !response.body) throw new ChatError('unavailable', 'Attachment download unavailable')
  const length = response.headers.get('content-length')
  if (length && Number(length) > limit) { await response.body.cancel(); throw new ChatError('too_large', 'Attachment is larger than 10 MiB') }
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > limit) { await reader.cancel(); throw new ChatError('too_large', 'Attachment is larger than 10 MiB') }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  return { name: file.filename, type: file.content_type || response.headers.get('content-type') || 'application/octet-stream', bytes: Buffer.concat(chunks) }
}
