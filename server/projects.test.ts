import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it, vi } from 'vitest'
import { projectHandler, projectService } from './projects.ts'
import type { Registration } from './source.ts'

const temporary: string[] = [], servers: ReturnType<typeof createServer>[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
  await Promise.all(temporary.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})
async function fixture() {
  const home = await mkdtemp(path.join(tmpdir(), 'threaddeck-projects-')); temporary.push(home)
  const directory = path.join(home, 'projects'), repo = path.join(directory, 'repo with spaces')
  await mkdir(repo, { recursive: true }); await writeFile(path.join(repo, '.git'), 'gitdir: elsewhere')
  await mkdir(path.join(directory, '.hidden')); await mkdir(path.join(directory, 'node_modules')); await mkdir(path.join(directory, 'plain'))
  const registrations: Registration[] = []
  const list = vi.fn(async () => registrations)
  const add = vi.fn(async (directory: string, guild?: string) => { registrations.push({ directory, guildId: guild || '12345678901234567', channelId: '23456789012345678' }) })
  return { home, directory, repo, registrations, list, add, service: projectService(list, add, home) }
}
it('discovers immediate folders, prioritizes git repositories, and excludes dependencies and hidden folders', async () => {
  const { service, directory, repo } = await fixture()
  const result = await service.browse()
  expect(result.directory).toBe(directory)
  expect(result.entries.map(entry => [entry.name, entry.repository])).toEqual([['repo with spaces', true], ['plain', false]])
  expect((await service.browse(repo)).entries).toEqual([])
  expect(result.locations).toContain(directory)
})
it('registers canonical paths once and reuses existing registrations through symlinks', async () => {
  const { service, repo, directory, add } = await fixture()
  const alias = path.join(directory, 'alias'); await symlink(repo, alias)
  const [first, second] = await Promise.all([service.register({ directory: repo }), service.register({ directory: alias })])
  expect(first).toEqual(second); expect(add).toHaveBeenCalledExactlyOnceWith(repo, undefined)
  expect((await service.browse(directory)).entries.find(entry => entry.directory === alias)?.registered?.id).toBe(first.id)
  await service.register({ directory: repo }); expect(add).toHaveBeenCalledOnce()
})
it('requires a server choice when multiple guilds are registered', async () => {
  const { service, registrations, repo, add } = await fixture()
  registrations.push({ directory: '/other', guildId: '12345678901234567', channelId: 'a' }, { directory: '/another', guildId: '34567890123456789', channelId: 'b' })
  await expect(service.register({ directory: repo })).rejects.toThrow('Choose a Discord server')
  await expect(service.register({ directory: repo, guild: '45678901234567890' })).rejects.toThrow('already used')
  expect(add).not.toHaveBeenCalled()
  await service.register({ directory: repo, guild: '34567890123456789' })
  expect(add).toHaveBeenCalledWith(repo, '34567890123456789')
})
it('rejects relative paths and files before registering', async () => {
  const { service, repo, add } = await fixture()
  await expect(service.register({ directory: '--bad-option' })).rejects.toThrow('absolute')
  await expect(service.register({ directory: path.join(repo, '.git') })).rejects.toThrow('folder')
  expect(add).not.toHaveBeenCalled()
})
it('protects discovery and registration from cross-origin access and validates mutation bodies', async () => {
  const { service, repo, add } = await fixture()
  const server = createServer(); servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port; server.on('request', projectHandler(port, service))
  const base = `http://127.0.0.1:${port}/api/projects`
  expect((await fetch(`${base}/browse`, { headers: { Origin: 'https://evil.example' } })).status).toBe(403)
  expect((await fetch(`${base}/register`, { method: 'POST', headers: { 'Sec-Fetch-Site': 'cross-site' } })).status).toBe(403)
  expect((await fetch(`${base}/register`, { method: 'GET' })).status).toBe(405)
  expect((await fetch(`${base}/register`, { method: 'POST', body: '{}' })).status).toBe(415)
  expect((await fetch(`${base}/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'x'.repeat(9000) })).status).toBe(413)
  expect(add).not.toHaveBeenCalled()
  const browse = await fetch(`${base}/browse`); expect(browse.status).toBe(200); expect(browse.headers.get('cache-control')).toBe('no-store')
  const response = await fetch(`${base}/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ directory: repo }) })
  expect(response.status).toBe(200); expect((await response.json()).directory).toBe(repo)
})
