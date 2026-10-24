import type { z } from 'zod'
export class ChatRequestError extends Error { constructor(public code: string, message: string) { super(message) } }

export async function chatRequest<T>(url: string, schema: z.ZodType<T>, options?: RequestInit) {
  const response = await fetch(`/api/chat/${url}`, options)
  const value: unknown = await response.json()
  if (!response.ok) throw new ChatRequestError(typeof value === 'object' && value && 'code' in value ? String(value.code) : 'unavailable', typeof value === 'object' && value && 'error' in value ? String(value.error) : 'Chat request failed')
  return schema.parse(value)
}
export const jsonRequest = (value: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) })
