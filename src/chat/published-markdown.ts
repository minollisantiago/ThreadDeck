import { z } from 'zod'
import type { PublishedMessage } from '../../shared/chat'

const componentSchema = z.object({ type: z.number(), content: z.string().optional(), components: z.array(z.unknown()).optional(), accessory: z.unknown().optional() })
const embedSchema = z.object({ title: z.string().optional(), description: z.string().optional(), fields: z.array(z.object({ name: z.string(), value: z.string() })).optional() })

function componentText(value: unknown, depth = 0): string[] {
  if (depth > 12) return []
  const parsed = componentSchema.safeParse(value)
  if (!parsed.success) return []
  const item = parsed.data
  if (item.type === 10) return [item.content || '']
  if (item.type === 14) return ['---']
  if (![1, 9, 17].includes(item.type)) return []
  return [...(item.components || []).flatMap(child => componentText(child, depth + 1)), ...componentText(item.accessory, depth + 1)]
}

/** Copy the published text, not rendered DOM, so Markdown and code fences survive. */
export function publishedMarkdown(messages: PublishedMessage[]): string {
  return messages.flatMap(message => [
    message.content,
    ...message.components.flatMap(component => componentText(component)),
    ...message.embeds.flatMap(value => {
      const embed = embedSchema.safeParse(value)
      return embed.success ? [embed.data.title || '', embed.data.description || '', ...(embed.data.fields || []).flatMap(field => [field.name, field.value])] : []
    }),
  ]).filter(text => text.trim()).join('\n\n')
}
