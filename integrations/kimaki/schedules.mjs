// Runs inside the owning bot. Never opens a second scheduler database.
import { createHash } from 'node:crypto'
import { ChatError } from './threaddeck-core.js'
import { decodeTaskPayload, createTask, editTask, runTaskNow, deleteTask, parseSendAt } from './scheduler.js'

const iso = date => date instanceof Date ? date.toISOString() : String(date)
const revisionOf = row => createHash('sha256').update(JSON.stringify([row.payload_json, row.schedule_kind, row.cron_expr, row.timezone, iso(row.next_run_at), row.status])).digest('hex')
function checked(value, action) {
  if (!(value instanceof Error)) return value
  // A run error can follow an external side effect. Do not label it retryable.
  if (action !== 'run' && value.name === 'ConfigError') throw new ChatError('invalid', value.message)
  throw new ChatError('unavailable', 'Kimaki could not confirm the schedule operation')
}
export function scheduleAdapter(bot) {
  async function projects() { return new Set((await bot.db.query.channel_directories.findMany()).map(p => p.channel_id)) }
  async function rowFor(id) {
    const row = await bot.db.query.scheduled_tasks.findFirst({ where: { id } })
    if (!row || !(await projects()).has(row.channel_id)) throw new ChatError('not_found', 'Schedule is not registered to a local project')
    return row
  }
  return {
    async list() {
      const local = await projects()
      const rows = await bot.db.query.scheduled_tasks.findMany({ where: { status: { in: ['planned', 'running', 'failed'] } }, orderBy: { next_run_at: 'asc', id: 'asc' } })
      return { checkedAt: Date.now(), schedules: rows.filter(row => local.has(row.channel_id)).map(row => {
        const decoded = decodeTaskPayload(row.payload_json)
        const job = decoded instanceof Error ? null : decoded
        return {
          id: row.id, projectId: row.channel_id, status: row.status,
          kind: row.schedule_kind, expression: row.schedule_kind === 'cron' ? row.cron_expr || '' : iso(row.run_at || row.next_run_at), timezone: row.timezone || 'UTC',
          nextRunAt: iso(row.next_run_at), prompt: job?.send.prompt ?? null, preview: row.prompt_preview,
          threadId: job?.send.threadId ?? null, notifyOnly: job?.send.notifyOnly === true,
          agent: job?.send.agent ?? null, model: job?.send.model ?? null,
          preRun: job?.preRun ?? null, allowConcurrency: job?.allowConcurrency ?? false,
          lastError: job ? row.last_error : 'Routine payload is unreadable. Repair it using Kimaki before editing or running.',
          revision: revisionOf(row), editable: Boolean(job) && row.status === 'planned',
        }
      }) }
    },
    async mutate(input) {
      if (input.action === 'create') {
        if (!(await projects()).has(input.projectId)) throw new ChatError('invalid', 'Choose a registered local project')
        checked(parseSendAt({ value: input.sendAt, now: bot.clock.now() }), 'create')
        return checked(await createTask(bot, { send: { channelId: input.projectId, prompt: input.prompt, ...(input.agent && { agent: input.agent }), ...(input.model && { model: input.model }) }, options: { sendAt: input.sendAt, preRun: null, allowConcurrency: input.allowConcurrency } }), 'create')
      }
      const row = await rowFor(input.id)
      if (revisionOf(row) !== input.revision) throw new ChatError('conflict', 'This schedule changed. Refresh and inspect it before trying again.')
      if (input.action !== 'delete' && row.status !== 'planned') throw new ChatError('invalid', 'Only planned schedules can be edited or run')
      if (input.action === 'delete') return checked(await deleteTask(bot, input.id, current => revisionOf(current) === input.revision), 'delete')
      const job = decodeTaskPayload(row.payload_json)
      if (job instanceof Error) throw new ChatError('invalid', 'The routine payload is unreadable. Repair it in Kimaki first.')
      if (input.action === 'edit') {
        if (input.changes.sendAt !== undefined) checked(parseSendAt({ value: input.changes.sendAt, now: bot.clock.now() }), 'edit')
        return checked(await editTask(bot, { id: input.id, ...input.changes }, current => revisionOf(current) === input.revision), 'edit')
      }
      return { ...checked(await runTaskNow(bot, input.id, current => revisionOf(current) === input.revision), 'run'), projectId: row.channel_id }
    },
  }
}
