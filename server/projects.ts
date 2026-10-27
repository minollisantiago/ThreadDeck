import { execFile } from 'node:child_process'
import { opendir, realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { registerProjectSchema, type ProjectBrowse } from '../shared/projects.ts'
import { source, type Registration } from './source.ts'
import { trustedRequest } from './http.ts'

const exec = promisify(execFile)
const toProject = (registration: Registration) => ({ id: registration.channelId, name: path.basename(registration.directory), directory: registration.directory, sessions: [] })
async function directoryPath(input: string) {
  if (!path.isAbsolute(input) || input.includes('\0')) throw new Error('Enter an absolute folder path on the machine running Kimaki.')
  const directory = await realpath(input)
  if (!(await stat(directory)).isDirectory()) throw new Error('Choose a folder, not a file.')
  return directory
}

export function projectService(registrations = () => source.projects(), add = async (directory: string, guild?: string) => {
  await exec('kimaki', ['project', 'add', directory, ...(guild ? ['--guild', guild] : [])], { timeout: 60_000, maxBuffer: 1024 * 1024 })
}, home = homedir()) {
  const pending = new Map<string, Promise<ReturnType<typeof toProject>>>()
  return {
    async browse(input?: string): Promise<ProjectBrowse> {
      const projects = await registrations()
      const locations = [...new Set([path.join(home, 'projects'), home, ...projects.map(p => path.dirname(p.directory))])]
      const directory = await directoryPath(input || await realpath(locations[0]).catch(() => home))
      const byDirectory = new Map(await Promise.all(projects.map(async p => [await realpath(p.directory).catch(() => p.directory), toProject(p)] as const)))
      const entries: ProjectBrowse['entries'] = []
      // One directory level only: never crawl repositories, dependencies or the whole disk.
      const folder = await opendir(directory)
      for await (const entry of folder) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
        const child = path.join(directory, entry.name)
        if (!entry.isDirectory() && !(entry.isSymbolicLink() && await stat(child).then(s => s.isDirectory()).catch(() => false))) continue
        const resolved = await realpath(child).catch(() => child)
        entries.push({ name: entry.name, directory: child, repository: await stat(path.join(child, '.git')).then(() => true).catch(() => false), registered: byDirectory.get(resolved) || null })
        if (entries.length >= 500) break
      }
      entries.sort((a, b) => Number(b.repository) - Number(a.repository) || a.name.localeCompare(b.name))
      return { directory, parent: path.dirname(directory) === directory ? null : path.dirname(directory), entries, registered: byDirectory.get(directory) || null, locations, guilds: [...new Set(projects.flatMap(p => p.guildId ? [p.guildId] : []))] }
    },
    async register(input: unknown) {
      const value = registerProjectSchema.parse(input), directory = await directoryPath(value.directory)
      if (pending.has(directory)) return pending.get(directory)!
      const task = (async () => {
        const projects = await registrations()
        const existing = await Promise.all(projects.map(async p => ({ project: p, directory: await realpath(p.directory).catch(() => p.directory) })))
        const known = existing.find(p => p.directory === directory)
        if (known) return toProject(known.project)
        const guilds = [...new Set(projects.flatMap(p => p.guildId ? [p.guildId] : []))]
        if (value.guild && !guilds.includes(value.guild)) throw new Error('Choose a server already used by your Kimaki projects.')
        if (guilds.length > 1 && !value.guild) throw new Error('Choose a Discord server for the new project.')
        await add(directory, value.guild || guilds[0])
        const added = (await registrations()).find(p => path.resolve(p.directory) === directory)
        if (!added) throw new Error('Registration could not be confirmed. Refresh projects before trying again.')
        return toProject(added)
      })()
      pending.set(directory, task)
      try { return await task } finally { pending.delete(directory) }
    },
  }
}

export function projectHandler(port: number, service = projectService()) {
  return (request: IncomingMessage, response: ServerResponse) => {
    if (request.url?.split('?')[0] !== '/api/projects/browse' && request.url?.split('?')[0] !== '/api/projects/register') return false
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff')
    const json = (status: number, value: unknown) => response.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(value))
    if (!trustedRequest(request, port) || request.headers['sec-fetch-site'] === 'cross-site') { json(403, { error: 'Local requests only' }); return true }
    void (async () => {
      const url = new URL(request.url!, 'http://localhost')
      if (url.pathname.endsWith('/browse') && request.method === 'GET') return json(200, await service.browse(url.searchParams.get('directory') || undefined))
      if (url.pathname.endsWith('/register') && request.method === 'POST') {
        if (request.headers['content-type']?.split(';')[0] !== 'application/json') return json(415, { error: 'JSON content type required' })
        const chunks: Buffer[] = []; let size = 0
        for await (const chunk of request.iterator({ destroyOnReturn: false })) {
          size += chunk.length
          if (size > 8192) { request.resume(); return json(413, { error: 'Request too large' }) }
          chunks.push(Buffer.from(chunk))
        }
        return json(200, await service.register(JSON.parse(Buffer.concat(chunks).toString('utf8'))))
      }
      json(405, { error: 'Method not allowed' })
    })().catch(error => {
      const message = error instanceof Error && !('code' in error) && error.name !== 'ZodError' ? error.message : 'Could not access or register this folder. Check the path, folder permissions and Kimaki connection, then refresh before retrying.'
      json(400, { error: message })
    })
    return true
  }
}
