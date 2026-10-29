import type { PublishedMessage } from '../../shared/chat'

// Match the nonce already used by Kimaki for the first Discord prompt chunk.
export async function publicationNonce(operationId: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${operationId}:0`))
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 24)
}

export function isPublished(operation: { nonce?: string; messageIds: string[] }, messages: PublishedMessage[]) {
  return messages.some(message => operation.messageIds.includes(message.id) || Boolean(operation.nonce && message.author.bot && message.nonce === operation.nonce))
}
