import { z } from 'zod'

export const statusSchema = z.enum(['working', 'idle', 'error', 'input', 'permission'])
export type SessionStatus = z.infer<typeof statusSchema>
export const sessionSchema = z.object({
  id: z.string(), title: z.string(), projectId: z.string(), threadId: z.string(),
  guildId: z.string().nullable(), status: statusSchema, updatedAt: z.number(),
  agentCount: z.number(),
})
export type Session = z.infer<typeof sessionSchema>
export const projectSchema = z.object({
  id: z.string(), name: z.string(), directory: z.string(), sessions: z.array(sessionSchema),
})
export type Project = z.infer<typeof projectSchema>
export const snapshotSchema = z.object({
  projects: z.array(projectSchema),
  health: z.enum(['connected', 'stale', 'disconnected']),
  lastSuccessAt: z.number().nullable(), checkedAt: z.number(),
  attentionAvailable: z.boolean(), inventoryLimited: z.boolean(),
  message: z.string().nullable(),
})
export type Snapshot = z.infer<typeof snapshotSchema>

export function discordLinks(session: Pick<Session, 'guildId' | 'threadId'>) {
  if (!session.guildId || !/^\d{17,20}$/.test(session.guildId) || !/^\d{17,20}$/.test(session.threadId)) return null
  const route = `channels/${session.guildId}/${session.threadId}`
  return { app: `discord://-/${route}`, browser: `https://discord.com/${route}` }
}

export const isAttention = (status: SessionStatus) => ['input', 'permission', 'error'].includes(status)
export const isActive = (session: Session) => session.agentCount > 0 || isAttention(session.status)
