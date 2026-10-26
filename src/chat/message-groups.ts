import { z } from 'zod'
import type { PublishedMessage } from '../../shared/chat'

const textComponent = z.looseObject({ type: z.number(), content: z.string().optional(), components: z.array(z.unknown()).optional() })
const operatorHeader = /^\*\*ThreadDeck · local operator( · queued)?\*\*(?:\r?\n|$)/
function firstText(components: unknown[], depth = 0): string | undefined {
  if (depth > 12) return
  for (const value of components) {
    const parsed = textComponent.safeParse(value)
    if (!parsed.success) continue
    if (parsed.data.type === 10) return parsed.data.content || ''
    if ([1, 9, 17].includes(parsed.data.type)) {
      const text = firstText(parsed.data.components || [], depth + 1)
      if (text !== undefined) return text
    }
  }
}
export function localOperatorPrompt(message: PublishedMessage) {
  // ThreadDeck publishes local prompts through Kimaki's bot identity. Those
  // prompts still separate interactions, even though the author ID is the same.
  const text = message.content || firstText(message.components) || ''
  const match = message.author.bot && operatorHeader.exec(text)
  return match ? { queued: Boolean(match[1]) } : null
}

export function displayPublishedMessage(message: PublishedMessage): PublishedMessage {
  if (!localOperatorPrompt(message)) return message
  const strip = (text: string) => text.replace(operatorHeader, '').replace(/^\r?\n/, '')
  if (message.content) return { ...message, content: strip(message.content) }
  let stripped = false
  function component(value: unknown, depth = 0): unknown {
    if (stripped || depth > 12) return value
    const parsed = textComponent.safeParse(value)
    if (!parsed.success) return value
    const item = parsed.data
    if (item.type === 10 && operatorHeader.test(item.content || '')) {
      stripped = true
      return { ...item, content: strip(item.content || '') }
    }
    if ([1, 9, 17].includes(item.type) && item.components) return { ...item, components: item.components.map(child => component(child, depth + 1)) }
    return value
  }
  return { ...message, components: message.components.map(value => component(value)) }
}

export function groupPublishedMessages(messages: PublishedMessage[]) {
  const groups: { id: string; role: 'operator' | 'assistant' | 'user'; messages: PublishedMessage[] }[] = []
  let previous: PublishedMessage | undefined
  for (const message of messages) {
    const prompt = localOperatorPrompt(message), role = prompt ? 'operator' : message.author.bot ? 'assistant' : 'user'
    if (previous && previous.author.id === message.author.id && groups[groups.length - 1].role === role && !prompt) groups[groups.length - 1].messages.push(message)
    else groups.push({ id: message.id, role, messages: [message] })
    previous = message
  }
  return groups
}
