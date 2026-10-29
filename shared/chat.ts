import { z } from 'zod'

export const threadIdSchema = z.string().regex(/^\d{17,20}$/)
export const chatFileSchema = z.object({ id: z.uuid(), name: z.string().min(1).max(200), audioPrompt: z.boolean().optional() }).strict()
export const attachmentSchema = z.looseObject({ id: z.string(), filename: z.string(), size: z.number(), content_type: z.string().nullish(), width: z.number().nullable().optional(), height: z.number().nullable().optional() })
export const publishedMessageSchema = z.looseObject({
  id: z.string(), channel_id: z.string(), content: z.string().default(''), timestamp: z.string(), edited_timestamp: z.string().nullable().optional(),
  author: z.looseObject({ id: z.string(), username: z.string(), global_name: z.string().nullable().optional(), bot: z.boolean().optional() }),
  attachments: z.array(attachmentSchema).default([]), components: z.array(z.unknown()).default([]), embeds: z.array(z.unknown()).default([]),
})
export type PublishedMessage = z.infer<typeof publishedMessageSchema>
export const submitSchema = z.object({
  requestId: z.uuid(), threadId: threadIdSchema.optional(), projectId: threadIdSchema.optional(),
  kind: z.enum(['prompt', 'command', 'skill']).default('prompt'), name: z.string().min(1).max(200).optional(),
  text: z.string().max(50_000), delivery: z.enum(['send', 'queue']), files: z.array(chatFileSchema).max(10).default([]),
}).strict().refine(v => Boolean(v.threadId) !== Boolean(v.projectId), 'Choose a thread or project')
  .refine(v => v.text.trim().length > 0 || v.files.length > 0 || v.kind !== 'prompt', 'Prompt is empty')
  .refine(v => v.kind === 'prompt' || Boolean(v.name), 'Choose a command or skill')
  .refine(v => v.files.filter(file => file.audioPrompt).length <= 1, 'Choose one audio prompt')
  .refine(v => !v.files.some(file => file.audioPrompt) || v.kind === 'prompt' && !v.text.trimStart().startsWith('/'), 'Audio prompts cannot invoke commands or skills')
export type ChatSubmission = z.infer<typeof submitSchema>
export const receiptSchema = z.object({
  id: z.uuid(), state: z.enum(['accepted', 'creating', 'publishing', 'published', 'transcribing', 'dispatching', 'submitted', 'failed', 'unknown']),
  threadId: threadIdSchema.optional(), sessionId: z.string().optional(), messageIds: z.array(z.string()), updatedAt: z.number(), error: z.string().optional(),
})
export type OperationReceipt = z.infer<typeof receiptSchema>
export const chatInfoSchema = z.object({ protocol: z.literal(1), kimakiVersion: z.string(), capabilities: z.array(z.string()), actor: z.literal('local-operator') })
export type ChatInfo = z.infer<typeof chatInfoSchema>
export const historySchema = z.object({ messages: z.array(publishedMessageSchema), cursor: z.string(), before: z.string().nullable(), stale: z.boolean() })
export const changesSchema = z.object({ cursor: z.string(), resync: z.boolean(), stale: z.boolean(), changes: z.array(z.discriminatedUnion('type', [
  z.object({ type: z.literal('upsert'), message: publishedMessageSchema }), z.object({ type: z.literal('delete'), id: z.string() }),
])) })
export type MessageChange = z.infer<typeof changesSchema>['changes'][number]
export const catalogSchema = z.object({ entries: z.array(z.object({ kind: z.enum(['command', 'skill']), name: z.string(), description: z.string().optional() })) })
export type ChatCatalog = z.infer<typeof catalogSchema>

export class ChatError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = 'ChatError' }
}
