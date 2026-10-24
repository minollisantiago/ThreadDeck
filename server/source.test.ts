import { expect, it } from 'vitest'
import { completedResponseAt, rawSessionSchema } from './source'

const response = { type: 'assistant', time: { completed: 90 }, finish: 'stop', content: [{ type: 'text', text: 'Your answer' }] }
it('preserves the OpenCode session model reference including its variant', () => {
  const model = { id: 'fixture-model', providerID: 'fixture-provider', variant: 'high' }
  expect(rawSessionSchema.parse({ id: 's', location: { directory: '/fixture' }, time: { updated: 1 }, model }).model).toEqual(model)
})
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
