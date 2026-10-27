import { expect, it } from 'vitest'
import { publishedMessageSchema } from '../../shared/chat'
import { publishedMarkdown } from './published-markdown'

const message = publishedMessageSchema.parse({ id: '100000000000000002', channel_id: '100000000000000001', timestamp: '2026-10-24T00:00:00Z', author: { id: 'bot', username: 'Kimaki', bot: true } })
it('preserves published Markdown exactly and combines message continuations in order', () => {
  const first = '# Answer\n\n**Bold** and [a link](https://example.com).\n\n```ts\nconst x = 1\n```'
  const second = '| a | b |\n|---|---|\n| 1 | 2 |'
  expect(publishedMarkdown([{ ...message, content: first }, { ...message, content: second }])).toBe(`${first}\n\n${second}`)
})
it('includes nested component text, separators, accessories and embeds in display order', () => {
  const value = { ...message, content: 'Intro', components: [{ type: 17, components: [
    { type: 10, content: '> Callout' }, { type: 14 },
    { type: 9, components: [{ type: 10, content: '- Item' }], accessory: { type: 10, content: 'Accessory' } },
  ] }], embeds: [{ title: 'Embed title', description: '**Description**', fields: [{ name: 'Field', value: '`value`' }] }] }
  expect(publishedMarkdown([value])).toBe('Intro\n\n> Callout\n\n---\n\n- Item\n\nAccessory\n\nEmbed title\n\n**Description**\n\nField\n\n`value`')
})
it('omits attachment UI, unsupported interactions, malformed data and blank content', () => {
  expect(publishedMarkdown([{ ...message, content: '  ', components: [null, { type: 10, content: 5 }, { type: 2, label: 'Respond in Discord' }, { type: 13, file: { url: 'attachment://file.txt' } }], embeds: [null, { description: 5 }], attachments: [{ id: 'file', filename: 'file.txt', size: 10 }] }])).toBe('')
  expect(publishedMarkdown([])).toBe('')
})
it('bounds traversal of deeply nested components', () => {
  let value: unknown = { type: 10, content: 'Too deep' }
  for (let depth = 0; depth < 20; depth++) value = { type: 17, components: [value] }
  expect(publishedMarkdown([{ ...message, components: [value] }])).toBe('')
})
