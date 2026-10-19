import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { OpenCode } from '@opencode/client'
import { Service } from '@opencode/client/service'
import { z } from 'zod'

const exec = promisify(execFile)
export const registrationSchema = z.object({
  directory: z.string(), channelId: z.string(), guildId: z.string().nullable(),
})
export type Registration = z.infer<typeof registrationSchema>
export const rawSessionSchema = z.object({
  id: z.string(), parentID: z.string().optional(), title: z.string().optional(),
  location: z.object({ directory: z.string() }),
  time: z.object({ updated: z.number(), archived: z.number().optional() }),
  outcome: z.enum(['succeeded', 'failed', 'interrupted']).optional(),
  metadata: z.object({ kimaki: z.object({
    threadId: z.string().optional(), channelId: z.string().optional(),
  }).passthrough().optional() }).passthrough().optional(),
})
export type RawSession = z.infer<typeof rawSessionSchema>

export interface Source {
  projects(): Promise<Registration[]>
  connect(): Promise<Connection>
}
export interface Connection {
  recent(): Promise<{ sessions: RawSession[]; limited: boolean }>
  active(): Promise<string[]>
  get(id: string): Promise<RawSession>
  attention(directory: string): Promise<{ input: string[]; permission: string[] }>
}

export const source: Source = {
  async projects() {
    const { stdout } = await exec('kimaki', ['project', 'list', '--json'], {
      timeout: 8_000, maxBuffer: 2 * 1024 * 1024,
    })
    return z.array(registrationSchema).parse(JSON.parse(stdout))
  },
  async connect() {
    const endpoint = await Service.discover({ file: process.env.KIMAKI_OPENCODE_SERVICE_FILE })
    if (!endpoint) throw new Error('OpenCode is unavailable')
    const client = OpenCode.make({ baseUrl: endpoint.url, headers: Service.headers(endpoint) })
    const options = () => ({ signal: AbortSignal.timeout(8_000) })
    return {
      async recent() {
        // Bounded recent inventory; active sessions are independently hydrated below.
        const page = await client.session.list({ limit: 300, order: 'desc' }, options())
        return { sessions: z.array(rawSessionSchema).parse(page.data), limited: Boolean(page.cursor.next) }
      },
      async active() { return Object.keys(await client.session.active(options())) },
      async get(id) { return rawSessionSchema.parse(await client.session.get({ sessionID: id }, options())) },
      async attention(directory) {
        const location = { directory }
        const [forms, permissions] = await Promise.all([
          client.form.list({ location }, options()),
          client.permission.request.list({ location }, options()),
        ])
        return { input: forms.data.map(f => f.sessionID), permission: permissions.data.map(p => p.sessionID) }
      },
    }
  },
}
