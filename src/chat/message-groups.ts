import { z } from 'zod'
import type { PublishedMessage } from '../../shared/chat'

const textComponent = z.object({ type: z.number(), content: z.string().optional(), components: z.array(z.unknown()).optional() })
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
function operatorPrompt(message: PublishedMessage) {
  // ThreadDeck publishes local prompts through Kimaki's bot identity. Those
  // prompts still separate interactions, even though the author ID is the same.
  const text = message.content || firstText(message.components) || ''
  return Boolean(message.author.bot) && /^\*\*ThreadDeck · local operator(?: · queued)?\*\*(?:\r?\n|$)/.test(text)
}

export function groupPublishedMessages(messages: PublishedMessage[]) {
  const groups: { id: string; messages: PublishedMessage[] }[] = []
  let previous: PublishedMessage | undefined
  for (const message of messages) {
    const prompt = operatorPrompt(message)
    if (previous && previous.author.id === message.author.id && Boolean(previous.author.bot) === Boolean(message.author.bot) && !prompt) groups[groups.length - 1].messages.push(message)
    else groups.push({ id: message.id, messages: [message] })
    previous = message
  }
  return groups
}
