// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ProjectBrowser } from './project-browser'
import type { ProjectBrowse } from '../../shared/projects'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const listing: ProjectBrowse = { directory: '/home/me/projects', parent: '/home/me', registered: null, locations: ['/home/me/projects'], guilds: [], entries: [{ name: 'new-repo', directory: '/home/me/projects/new-repo', repository: true, registered: null }] }
const project = { id: 'channel', name: 'new-repo', directory: listing.entries[0].directory, sessions: [] }
it('browses an unregistered repository, registers it explicitly, then opens its session draft', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json(listing)).mockResolvedValueOnce(Response.json({ ...listing, directory: project.directory, entries: [] })).mockResolvedValueOnce(Response.json(project))
  vi.stubGlobal('fetch', fetcher)
  const create = vi.fn(); render(<ProjectBrowser back={vi.fn()} close={vi.fn()} create={create} />)
  fireEvent.click(await screen.findByRole('button', { name: /new-repo.*Git repository/ }))
  await waitFor(() => expect((screen.getByRole('textbox', { name: 'Folder path' }) as HTMLInputElement).value).toBe(project.directory))
  fireEvent.click(screen.getByRole('button', { name: 'Add project & start session' }))
  await waitFor(() => expect(create).toHaveBeenCalledExactlyOnceWith(project))
  expect(fetcher.mock.calls[2]).toEqual(['/api/projects/register', expect.objectContaining({ method: 'POST', body: JSON.stringify({ directory: project.directory }) })])
})
it('starts in a registered folder without a mutation', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ ...listing, registered: project })); vi.stubGlobal('fetch', fetcher)
  const create = vi.fn(); render(<ProjectBrowser back={vi.fn()} close={vi.fn()} create={create} />)
  const button = await screen.findByRole('button', { name: 'Start session here' })
  fireEvent.click(button); expect(create).toHaveBeenCalledWith(project); expect(fetcher).toHaveBeenCalledOnce()
})
it('shows registration failure without automatically retrying and refreshes to recover', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json(listing)).mockResolvedValueOnce(Response.json({ error: 'Kimaki unavailable' }, { status: 503 })).mockResolvedValueOnce(Response.json({ ...listing, registered: project }))
  vi.stubGlobal('fetch', fetcher)
  const create = vi.fn(); render(<ProjectBrowser back={vi.fn()} close={vi.fn()} create={create} />)
  await waitFor(() => expect((screen.getByRole('button', { name: 'Add project & start session' }) as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'Add project & start session' }))
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Kimaki unavailable')
  expect(create).not.toHaveBeenCalled(); expect(fetcher).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByRole('button', { name: 'Refresh folders' }))
  expect(await screen.findByRole('button', { name: 'Start session here' })).toBeTruthy()
})
it('requires an explicit server selection when registered projects span multiple guilds', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ ...listing, guilds: ['12345678901234567', '23456789012345678'] })).mockResolvedValueOnce(Response.json(project))
  vi.stubGlobal('fetch', fetcher)
  render(<ProjectBrowser back={vi.fn()} close={vi.fn()} create={vi.fn()} />)
  const servers = await screen.findByRole('combobox', { name: 'Discord server' })
  const start = screen.getByRole('button', { name: 'Add project & start session' }) as HTMLButtonElement
  expect(start.disabled).toBe(true)
  fireEvent.change(servers, { target: { value: '23456789012345678' } })
  expect(start.disabled).toBe(false)
  fireEvent.click(start)
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ directory: listing.directory, guild: '23456789012345678' })
})
