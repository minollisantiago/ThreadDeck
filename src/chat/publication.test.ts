import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { publishedMessageSchema } from '../../shared/chat'
import { isPublished, publicationNonce } from './publication'

const id = '550e8400-e29b-41d4-a716-446655440000'
it('matches the existing adapter nonce and preserves it through message parsing', async () => {
  const nonce = await publicationNonce(id)
  expect(nonce).toBe(createHash('sha256').update(`${id}:0`).digest('hex').slice(0, 24))
  const message = publishedMessageSchema.parse({ id: '100000000000000007', channel_id: '100000000000000001', timestamp: new Date().toISOString(), author: { id: 'bot', username: 'Kimaki', bot: true }, nonce })
  expect(isPublished({ nonce, messageIds: [] }, [message])).toBe(true)
  expect(isPublished({ nonce, messageIds: [] }, [{ ...message, nonce: 'other' }])).toBe(false)
  expect(isPublished({ nonce, messageIds: [] }, [{ ...message, author: { ...message.author, bot: false } }])).toBe(false)
  expect(isPublished({ messageIds: [message.id] }, [{ ...message, nonce: undefined }])).toBe(true)
  expect(isPublished({ messageIds: [] }, [message])).toBe(false)
})
