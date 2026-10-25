import { z } from 'zod'
import type { PublishedMessage } from './chat'

const resourceSchema = z.object({ url: z.string().nullish(), proxy_url: z.string().nullish(), attachment_id: z.string().nullish(), content_type: z.string().nullish(), width: z.number().nullish(), height: z.number().nullish() })
const componentSchema = z.object({ type: z.number(), components: z.array(z.unknown()).optional(), accessory: z.unknown().optional(), items: z.array(z.unknown()).optional(), media: z.unknown().optional(), file: z.unknown().optional(), name: z.string().optional(), size: z.number().nonnegative().optional() })

export function discordAttachmentUrl(value: unknown) {
  if (typeof value !== 'string') return undefined
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || !['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname) || url.username || url.password || (url.port && url.port !== '443')) return undefined
    const match = /^\/attachments\/(\d{17,20})\/(\d{17,20})\/([^/]+)$/.exec(url.pathname)
    if (!match) return undefined
    let name: string
    try { name = decodeURIComponent(match[3]) } catch { return undefined }
    return { url: url.href, channelId: match[1], id: match[2], name }
  } catch { return undefined }
}

// Components V2 resources are real attachments even when Discord's top-level
// attachments array is empty. media.id identifies the resource, NOT the file.
export function publishedAttachments(message: PublishedMessage): PublishedMessage['attachments'] {
  const files = new Map(message.attachments.map(file => [file.id, file]))
  function resource(value: unknown, name?: string, size = 0) {
    const parsed = resourceSchema.safeParse(value)
    if (!parsed.success) return
    const media = parsed.data, reference = discordAttachmentUrl(media.url) || discordAttachmentUrl(media.proxy_url)
    if (!reference || media.attachment_id && media.attachment_id !== reference.id) return
    const known = files.get(reference.id)
    files.set(reference.id, { id: reference.id, filename: name || reference.name, size, content_type: media.content_type, width: media.width, height: media.height, ...known, url: reference.url })
  }
  function component(value: unknown, depth = 0) {
    if (depth > 12) return
    const parsed = componentSchema.safeParse(value)
    if (!parsed.success) return
    const item = parsed.data
    if (item.type === 12) for (const entry of item.items || []) {
      const parsed = z.object({ media: z.unknown() }).safeParse(entry)
      if (parsed.success) resource(parsed.data.media)
    }
    if (item.type === 11) resource(item.media)
    if (item.type === 13) resource(item.file, item.name, item.size)
    if ([1, 9, 17].includes(item.type)) {
      for (const child of item.components || []) component(child, depth + 1)
      if (item.accessory) component(item.accessory, depth + 1)
    }
  }
  for (const item of message.components) component(item)
  for (const value of message.embeds) {
    const embed = z.object({ image: z.unknown().optional(), thumbnail: z.unknown().optional() }).safeParse(value)
    if (embed.success) { resource(embed.data.image); resource(embed.data.thumbnail) }
  }
  return [...files.values()]
}
