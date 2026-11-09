import { z } from 'zod'
import { threadIdSchema } from './chat.ts'

export const scheduleIdSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const revision = z.string().regex(/^[a-f0-9]{64}$/)
export const scheduleSchema = z.object({
  id: scheduleIdSchema, projectId: threadIdSchema,
  status: z.enum(['planned', 'running', 'failed']),
  kind: z.enum(['cron', 'at']), expression: z.string(), timezone: z.string(),
  nextRunAt: z.string(), prompt: z.string().nullable(), preview: z.string(),
  threadId: threadIdSchema.nullable(), notifyOnly: z.boolean(),
  agent: z.string().nullable(), model: z.string().nullable(),
  preRun: z.string().nullable(), allowConcurrency: z.boolean(), lastError: z.string().nullable(),
  revision, editable: z.boolean(),
})
export type Schedule = z.infer<typeof scheduleSchema>
export const schedulesResponseSchema = z.object({ schedules: z.array(scheduleSchema), checkedAt: z.number() })
const prompt = z.string().min(1).max(128 * 1024).refine(value => Boolean(value.trim()), 'Enter an instruction')
const sendAt = z.string().trim().min(1).max(200)
const agent = z.string().trim().max(200)
const model = z.string().trim().max(300).refine(value => !value || /^[^/\s]+\/.+$/.test(value), 'Use provider/model')
const changes = z.object({ prompt: prompt.optional(), sendAt: sendAt.optional(), agent: agent.optional(), model: model.optional(), allowConcurrency: z.boolean().optional() }).strict().refine(value => Object.values(value).some(v => v !== undefined), 'No changes to save')
const requestId = z.uuid()
export const scheduleMutationSchema = z.discriminatedUnion('action', [
  z.object({ requestId, action: z.literal('create'), projectId: threadIdSchema, prompt, sendAt, agent: agent.optional(), model: model.optional(), allowConcurrency: z.boolean().default(false) }).strict(),
  z.object({ requestId, action: z.literal('edit'), id: scheduleIdSchema, revision, changes }).strict(),
  z.object({ requestId, action: z.literal('run'), id: scheduleIdSchema, revision }).strict(),
  z.object({ requestId, action: z.literal('delete'), id: scheduleIdSchema, revision }).strict(),
])
export type ScheduleMutation = z.infer<typeof scheduleMutationSchema>
export const scheduleOperationSchema = z.object({
  id: requestId, action: z.enum(['create', 'edit', 'run', 'delete']),
  state: z.enum(['accepted', 'running', 'succeeded', 'failed', 'unknown']),
  updatedAt: z.number(), error: z.string().optional(),
  result: z.object({ routineId: scheduleIdSchema, ran: z.boolean().optional(), reason: z.string().optional(), threadId: z.string().nullable().optional(), sessionId: z.string().nullable().optional() }).optional(),
})
export type ScheduleOperation = z.infer<typeof scheduleOperationSchema>
export const schedulesCapability = 'schedules-v1'
export function scheduleTitle(schedule: Pick<Schedule, 'prompt' | 'preview'>) {
  const text = (schedule.prompt || schedule.preview).replace(/\s+/g, ' ').trim()
  return text.length > 70 ? `${text.slice(0, 67)}…` : text || 'Untitled schedule'
}
