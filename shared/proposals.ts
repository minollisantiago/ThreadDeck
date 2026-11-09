import { z } from 'zod'
import { receiptSchema, threadIdSchema } from './chat'

export const proposalStatusSchema = z.enum(['inbox', 'progress', 'snoozed', 'done', 'dismissed'])
export const proposalInputSchema = z.object({
  projectId: threadIdSchema, key: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(160), summary: z.string().trim().min(1).max(2000),
  rationale: z.string().trim().min(1).max(10_000), prompt: z.string().trim().min(1).max(40_000),
  kind: z.enum(['observed', 'idea']), effort: z.enum(['small', 'medium', 'large', 'explore']),
  evidence: z.array(z.object({ label: z.string().trim().min(1).max(300), reference: z.string().trim().min(1).max(2000) }).strict()).min(1).max(30),
}).strict()
export const proposalApproachSchema = z.enum(['plan', 'investigate', 'implement'])
export const proposalLaunchSchema = z.object({
  id: z.uuid(), proposalId: z.uuid(), prompt: z.string(), approach: proposalApproachSchema,
  receipt: receiptSchema, createdAt: z.number(), resolvedAt: z.number().nullable(),
})
export const proposalSchema = proposalInputSchema.extend({
  id: z.uuid(), revision: z.uuid(), status: proposalStatusSchema, createdAt: z.number(), reviewedAt: z.number(), updatedAt: z.number(),
  snoozedUntil: z.number().nullable(), decisionReason: z.string().max(2000),
  session: z.object({ id: z.string(), threadId: threadIdSchema }).nullable(), launch: proposalLaunchSchema.nullable(),
})
export const proposalsResponseSchema = z.object({ proposals: z.array(proposalSchema), reviewedAt: z.number().nullable() })
export const proposalMutationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('ingest'), proposals: z.array(proposalInputSchema).max(100) }).strict(),
  z.object({ action: z.literal('decide'), id: z.uuid(), revision: z.uuid(), status: proposalStatusSchema.exclude(['progress']), snoozedUntil: z.number().int().positive().optional(), reason: z.string().trim().max(2000).default('') }).strict(),
  z.object({ action: z.literal('launch'), id: z.uuid(), revision: z.uuid(), requestId: z.uuid(), prompt: z.string().trim().min(1).max(40_000), approach: proposalApproachSchema }).strict(),
  z.object({ action: z.literal('reconcile'), id: z.uuid(), requestId: z.uuid() }).strict(),
  z.object({ action: z.literal('resolve'), id: z.uuid(), requestId: z.uuid(), checked: z.literal(true) }).strict(),
])
export type Proposal = z.infer<typeof proposalSchema>
export type ProposalInput = z.infer<typeof proposalInputSchema>
export type ProposalLaunch = z.infer<typeof proposalLaunchSchema>
export type ProposalMutation = z.infer<typeof proposalMutationSchema>
export type ProposalStatus = z.infer<typeof proposalStatusSchema>
export type ProposalApproach = z.infer<typeof proposalApproachSchema>
export const proposalStatuses: Record<ProposalStatus, string> = { inbox: 'Inbox', progress: 'In progress', snoozed: 'Snoozed', done: 'Done', dismissed: 'Dismissed' }
export const proposalApproaches: Record<ProposalApproach, string> = { plan: 'Plan first', investigate: 'Investigate only', implement: 'Implement scoped change' }
export function launchPrompt(prompt: string, approach: ProposalApproach) {
  const instruction = { plan: 'Plan first. Inspect the evidence and propose a focused scope before implementing.', investigate: 'Investigate only. Verify the evidence and report findings; do not change code.', implement: 'Implement only the scoped change below. Verify the evidence first and ask before expanding scope.' }[approach]
  return `${instruction}\n\n${prompt}`
}
export function pendingLaunch(proposal: Proposal) { return Boolean(proposal.launch && proposal.launch.resolvedAt === null && !(proposal.launch.receipt.state === 'submitted' && proposal.session)) }
