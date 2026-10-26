import { expect, it } from 'vitest'
import { publishedMessageSchema, type PublishedMessage } from '../../shared/chat'
import { groupPublishedMessages } from './message-groups'

function message(id: string, changes: Partial<PublishedMessage> = {}) {
  return publishedMessageSchema.parse({ id, channel_id: '100000000000000001', timestamp: '2026-10-25T00:00:00Z', author: { id: 'bot', username: 'Kimaki', bot: true }, content: `Message ${id}`, ...changes })
}
it('groups a whole model interaction including lengthy tool runs, callouts, and footers', () => {
  const messages = [message('1'), message('2', { timestamp: '2026-10-25T01:00:00Z' }), message('3', { content: '', components: [{ type: 17, components: [{ type: 10, content: 'A callout' }] }] }), message('4', { content: '-# Session footer' })]
  const groups = groupPublishedMessages(messages)
  expect(groups).toHaveLength(1)
  expect(groups[0]).toEqual({ id: '1', messages })
  expect(groups[0].messages[0]).toBe(messages[0])
})
it('starts a new header when authors change and never merges distinct bots', () => {
  const messages = [message('1'), message('2'), message('3', { author: { id: 'human', username: 'Operator' } }), message('4'), message('5', { author: { id: 'another-bot', username: 'Other agent', bot: true } })]
  expect(groupPublishedMessages(messages).map(group => group.messages.map(message => message.id))).toEqual([['1', '2'], ['3'], ['4'], ['5']])
})
it('starts a new interaction at local-operator prompts published through the same bot', () => {
  const messages = [message('1'), message('2', { content: '**ThreadDeck · local operator**\n\nNext prompt' }), message('3'), message('4', { content: '', components: [{ type: 17, components: [{ type: 10, content: '**ThreadDeck · local operator · queued**\n\nQueued prompt' }] }] }), message('5')]
  expect(groupPublishedMessages(messages).map(group => group.messages.map(message => message.id))).toEqual([['1'], ['2', '3'], ['4', '5']])
})
it('merges newly loaded history and live continuation messages without extra group boundaries', () => {
  const earlier = message('1'), existing = message('2'), continuation = message('3')
  expect(groupPublishedMessages([existing])).toHaveLength(1)
  expect(groupPublishedMessages([earlier, existing, continuation])).toEqual([{ id: '1', messages: [earlier, existing, continuation] }])
  expect(groupPublishedMessages([])).toEqual([])
})
