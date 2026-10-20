import { expect, it } from 'vitest'
import { completedResponseAt } from './source'

const response = { type: 'assistant', time: { completed: 90 }, finish: 'stop', content: [{ type: 'text', text: 'Your answer' }] }
it('uses the actual completed assistant response timestamp', () => {
  expect(completedResponseAt(response)).toBe(90)
  expect(completedResponseAt({ ...response, finish: 'length' })).toBe(90)
})
it('does not count user messages, tool steps, streaming responses or failures as unread answers', () => {
  for (const message of [undefined, { ...response, type: 'user' }, { ...response, finish: 'tool-calls' },
    { ...response, time: {} }, { ...response, error: { message: 'Failed' } },
    { ...response, content: [{ type: 'reasoning', text: 'Thinking' }] },
    { ...response, content: [{ type: 'text', text: ' ' }] }]) {
    expect(completedResponseAt(message)).toBeNull()
  }
})
