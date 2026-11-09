// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Snapshot } from '../../shared/model'
import type { Schedule } from '../../shared/schedules'
import { ChatWorkspace } from '../chat/workspace'
import { ScheduleSidebar, ScheduleTabs } from './sidebar'
import { useDraft } from '../chat/drafts'
import { useSchedules } from './use-schedules'

vi.mock('../components/desktop-titlebar', () => ({ DesktopTitlebar: () => null }))
vi.mock('../chat/pane', () => ({ ConversationPane: function FixturePane() { const { draft, save } = useDraft('schedules-test-draft'); return <textarea aria-label="Conversation draft" value={draft.text} onChange={event => save({ text: event.target.value })} /> } }))
const projectId = '100000000000000001'
const task: Schedule = { id: 1, projectId, status: 'planned', kind: 'cron', expression: '0 12 * * 1', timezone: 'UTC', nextRunAt: '2027-01-04T12:00:00Z', prompt: 'Weekly backtest\n\n' + 'Full instruction '.repeat(30), preview: 'Weekly backtest...', threadId: null, notifyOnly: false, agent: 'build', model: null, preRun: null, allowConcurrency: false, lastError: null, revision: 'a'.repeat(64), editable: true }
const snapshot: Snapshot = { projects: [{ id: projectId, name: 'NaturalGas', directory: '/project', sessions: [{ id: 'session', threadId: '100000000000000002', guildId: null, projectId, title: 'Conversation', status: 'idle', agentCount: 0, updatedAt: 1 }] }], health: 'connected', checkedAt: Date.now(), lastSuccessAt: Date.now(), attentionAvailable: true, inventoryLimited: false, message: null }
let tasks: Schedule[], posted: Record<string, unknown>[], listError: string | null, receiptState: string
beforeEach(() => {
  tasks = [{ ...task }]; posted = []; listError = null; receiptState = 'succeeded'
  vi.stubGlobal('innerWidth', 1700)
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  vi.stubGlobal('fetch', vi.fn(async (input: string, options?: RequestInit) => {
    if (options?.method === 'POST') {
      const value = JSON.parse(String(options.body)); posted.push(value)
      if (value.action === 'edit') tasks = tasks.map(t => ({ ...t, ...value.changes, expression: value.changes.sendAt || t.expression }))
      if (value.action === 'create') tasks = [...tasks, { ...task, id: 2, prompt: value.prompt }]
      return Response.json({ id: value.requestId, action: value.action, state: 'accepted', updatedAt: 1 })
    }
    if (input.includes('/operations/')) return Response.json({ id: input.split('/').at(-1), action: posted.at(-1)?.action || 'edit', state: receiptState, updatedAt: 1, ...(receiptState === 'succeeded' ? { result: { routineId: posted.at(-1)?.action === 'create' ? 2 : 1 } } : {}) })
    if (listError) return Response.json({ error: listError }, { status: 503 })
    return Response.json({ schedules: tasks, checkedAt: Date.now() })
  }))
})
afterEach(() => { cleanup(); localStorage.clear(); delete window.threaddeckDesktop; vi.unstubAllGlobals(); vi.restoreAllMocks() })
function setup(value = snapshot) {
  return render(<ChatWorkspace snapshot={value}><ScheduleTabs /><ScheduleSidebar projects={value.projects} /></ChatWorkspace>)
}
async function schedules() { fireEvent.click(screen.getByRole('button', { name: 'Schedules' })); await screen.findByRole('button', { name: /^Weekly backtest/ }) }
it('reuses project tree rows, full saved prompts and the main pane', async () => {
  setup(); await schedules()
  expect(screen.getByRole('button', { name: 'Toggle schedules for NaturalGas' })).toBeTruthy()
  expect(document.querySelector('.schedule-instruction')?.textContent).toBe(task.prompt)
  const header = within(document.querySelector('.schedule-pane .chat-pane-header') as HTMLElement)
  expect(header.queryByRole('button', { name: 'Edit schedule' })).toBeNull()
  expect(header.queryByRole('button', { name: 'Toggle session sidebar' })).toBeNull()
  expect(header.getByRole('button', { name: 'Refresh schedules' })).toBeTruthy()
  expect(document.querySelector('.schedule-lede')).toBeNull()
  expect(within(screen.getByRole('region', { name: 'Actions' })).getAllByRole('button')).toHaveLength(3)
  expect(screen.getAllByText('Full saved prompt')).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Recurring' }))
  expect(screen.getByRole('button', { name: /^Weekly backtest/ })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'One-time' }))
  expect(screen.queryByRole('button', { name: /^Weekly backtest/ })).toBeNull()
})
it('edits losslessly and only sends changed fields, preserving legacy scheduling options', async () => {
  tasks = [{ ...task, timezone: 'America/New_York', preRun: 'echo existing' }]
  setup(); await schedules()
  fireEvent.click(screen.getAllByRole('button', { name: 'Edit schedule' })[0])
  const dialog = screen.getByRole('dialog', { name: 'Edit schedule' })
  expect(within(dialog).getByRole('textbox', { name: 'Instruction' }).getAttribute('maxlength')).toBe(String(128 * 1024))
  expect((within(dialog).getByRole('textbox', { name: 'Instruction' }) as HTMLTextAreaElement).value).toBe(task.prompt)
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'Agent' }), { target: { value: '' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))
  await waitFor(() => expect(posted).toHaveLength(1))
  expect(posted[0]).toMatchObject({ action: 'edit', id: 1, revision: task.revision, changes: { agent: '' } })
  expect(posted[0].changes).toEqual({ agent: '' })
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit schedule' })).toBeNull())
})
it('hides empty projects and filtered-out groups while keeping all projects available for creation', async () => {
  const emptyProject = { id: '100000000000000009', name: 'Empty project', directory: '/empty', sessions: [] }
  setup({ ...snapshot, projects: [...snapshot.projects, emptyProject] }); await schedules()
  expect(screen.queryByRole('button', { name: 'Toggle schedules for Empty project' })).toBeNull()
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search projects or schedules' }), { target: { value: emptyProject.name } })
  expect(screen.queryByRole('button', { name: /Toggle schedules for/ })).toBeNull()
  expect(screen.getByText('No matching schedules.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
  fireEvent.click(screen.getByRole('button', { name: 'One-time' }))
  expect(screen.queryByRole('button', { name: /Toggle schedules for/ })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'All' }))
  expect(screen.getByRole('button', { name: 'Toggle schedules for NaturalGas' })).toBeTruthy()
  tasks = []
  fireEvent.click(screen.getAllByRole('button', { name: 'Refresh schedules' })[0])
  await waitFor(() => expect(screen.queryByRole('button', { name: /Toggle schedules for/ })).toBeNull())
  expect(screen.getByText('No schedules yet. Use New schedule to add one.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'New schedule' }))
  const dialog = screen.getByRole('dialog', { name: 'New project schedule' })
  expect(within(dialog).getByRole('option', { name: 'Empty project' })).toBeTruthy()
})
it('retains editor drafts when refreshed data changes and protects dirty cancellation', async () => {
  setup(); await schedules()
  fireEvent.click(screen.getAllByRole('button', { name: 'Edit schedule' })[0])
  const dialog = screen.getByRole('dialog', { name: 'Edit schedule' })
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'Instruction' }), { target: { value: 'Unsaved instruction' } })
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  expect(confirm).toHaveBeenCalled(); expect(screen.getByRole('dialog', { name: 'Edit schedule' })).toBeTruthy()
  expect((within(dialog).getByRole('textbox', { name: 'Instruction' }) as HTMLTextAreaElement).value).toBe('Unsaved instruction')
  expect(posted).toHaveLength(0)
})
it('distinguishes an unsupported bridge from no schedules and disables writes', async () => {
  listError = 'Schedules need the updated local Kimaki bridge'
  setup(); fireEvent.click(screen.getByRole('button', { name: 'Schedules' }))
  await screen.findAllByText(listError)
  expect(screen.queryByText('No schedules yet')).toBeNull()
  expect((screen.getByRole('button', { name: 'New schedule' }) as HTMLButtonElement).disabled).toBe(true)
})
it('preserves the conversation draft and stops reporting a hidden chat as viewed', async () => {
  let notify: (id: string) => void = () => {}
  const viewing = vi.fn()
  window.threaddeckDesktop = { control: vi.fn(), onMaximized: () => () => {}, viewing, onOpenSession: callback => { notify = callback; return () => {} } }
  localStorage.setItem('threaddeck:chat-last-session', 'session')
  setup()
  const draft = await screen.findByRole('textbox', { name: 'Conversation draft' })
  fireEvent.change(draft, { target: { value: 'Keep this unsent prompt' } })
  await schedules()
  expect(viewing).toHaveBeenLastCalledWith(null)
  expect(screen.queryByRole('textbox', { name: 'Conversation draft' })).toBeNull()
  fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
  expect(screen.queryByRole('textbox', { name: 'Conversation draft' })).toBeNull()
  act(() => notify('session'))
  expect((await screen.findByRole('textbox', { name: 'Conversation draft' }) as HTMLTextAreaElement).value).toBe('Keep this unsent prompt')
  expect(viewing).toHaveBeenLastCalledWith('session')
})
it('confirms Run now and keeps an unresolved operation from being posted twice', async () => {
  receiptState = 'running'
  setup(); await schedules()
  fireEvent.click(screen.getByRole('button', { name: 'Run now' }))
  const dialog = screen.getByRole('dialog', { name: 'Run this schedule now?' })
  expect(posted).toHaveLength(0)
  fireEvent.click(within(dialog).getByRole('button', { name: 'Run now' }))
  await waitFor(() => expect(posted).toHaveLength(1))
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Run this schedule now?' })).toBeNull())
  expect((screen.getByRole('button', { name: 'Run now' }) as HTMLButtonElement).disabled).toBe(true)
  expect(localStorage.getItem('threaddeck:schedule-operation:v1')).toBe(posted[0].requestId)
})
it('keeps destructive deletion in Actions and requires explicit confirmation', async () => {
  setup(); await schedules()
  const actions = screen.getByRole('region', { name: 'Actions' })
  fireEvent.click(within(actions).getByRole('button', { name: 'Delete schedule…' }))
  expect(posted).toHaveLength(0)
  const dialog = screen.getByRole('dialog', { name: 'Delete this schedule?' })
  expect(within(dialog).getByRole('button', { name: 'Delete schedule' }).classList.contains('schedule-delete')).toBe(true)
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  expect(posted).toHaveLength(0)
  expect(screen.queryByRole('dialog', { name: 'Delete this schedule?' })).toBeNull()
  fireEvent.click(within(actions).getByRole('button', { name: 'Delete schedule…' }))
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Delete this schedule?' })).getByRole('button', { name: 'Delete schedule' }))
  await waitFor(() => expect(posted).toHaveLength(1))
  expect(posted[0]).toMatchObject({ action: 'delete', id: task.id })
})
it('shares thread-style filter tabs and slash search controls, including Escape and clear', async () => {
  setup(); await schedules()
  const filters = screen.getByRole('group', { name: 'Filter schedules' })
  expect(filters.classList.contains('session-filters')).toBe(true)
  fireEvent.click(within(filters).getByRole('button', { name: 'One-time' }))
  expect(filters.getAttribute('data-motion-direction')).toBe('right')
  fireEvent.click(within(filters).getByRole('button', { name: 'All' }))
  expect(filters.getAttribute('data-motion-direction')).toBe('left')
  const search = screen.getByRole('searchbox', { name: 'Search projects or schedules' })
  expect(search.getAttribute('aria-keyshortcuts')).toBe('/')
  expect(screen.getByRole('button', { name: 'Search shortcuts' }).textContent).toBe('/')
  fireEvent.keyDown(document.body, { key: '/' })
  expect(document.activeElement).toBe(search)
  fireEvent.change(search, { target: { value: 'Weekly' } })
  expect(screen.queryByRole('button', { name: 'Search shortcuts' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
  expect((search as HTMLInputElement).value).toBe('')
  fireEvent.change(search, { target: { value: 'Another query' } })
  fireEvent.keyDown(search, { key: 'Escape' })
  expect((search as HTMLInputElement).value).toBe('')
  expect(document.activeElement).not.toBe(search)
  fireEvent.click(screen.getByRole('button', { name: 'Search shortcuts' }))
  expect(document.activeElement).toBe(search)
})
it('ignores a late status response from a dismissed operation instead of unlocking a newer one', async () => {
  let hold = false, release!: (response: Response) => void
  let phase = 'succeeded'
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === 'POST') { const input = JSON.parse(String(options.body)); return Response.json({ id: input.requestId, action: 'create', state: 'accepted', updatedAt: 1 }) }
    if (url.includes('/operations/')) {
      if (hold) { hold = false; return new Promise<Response>(resolve => { release = resolve }) }
      return Response.json({ id: url.split('/').at(-1), action: 'create', state: phase, updatedAt: 1 })
    }
    return Response.json({ schedules: [], checkedAt: 1 })
  }))
  const { result } = renderHook(() => useSchedules())
  act(() => result.current.setSection('schedules'))
  await waitFor(() => expect(result.current.available).toBe(true))
  const input = { action: 'create' as const, projectId, prompt: 'A routine', sendAt: '0 12 * * 1', allowConcurrency: false }
  await act(async () => { await result.current.submit(input) })
  await waitFor(() => expect(result.current.operation?.state).toBe('succeeded'))
  const oldId = result.current.operationId!
  hold = true
  let check!: Promise<void>
  act(() => { check = result.current.checkOperation(oldId) })
  act(() => result.current.dismissOperation())
  phase = 'running'
  await act(async () => { await result.current.submit(input) })
  await waitFor(() => expect(result.current.operation?.state).toBe('running'))
  const newId = result.current.operationId
  await act(async () => { release(Response.json({ id: oldId, action: 'create', state: 'succeeded', updatedAt: 1 })); await check })
  expect(result.current.operation?.id).toBe(newId)
  expect(result.current.locked).toBe(true)
})
it('closes the original editor after a lost POST response is resolved by its receipt, without reposting', async () => {
  const real = globalThis.fetch
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === 'POST') {
      const input = JSON.parse(String(options.body)); posted.push(input)
      throw new Error('POST response lost after acceptance')
    }
    return real(url, options)
  }))
  setup(); await schedules()
  fireEvent.click(screen.getAllByRole('button', { name: 'Edit schedule' })[0])
  const dialog = screen.getByRole('dialog', { name: 'Edit schedule' })
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'Instruction' }), { target: { value: 'Keep track of this operation' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))
  await waitFor(() => expect(posted).toHaveLength(1))
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit schedule' })).toBeNull())
  expect(posted).toHaveLength(1)
  expect(screen.queryByText(/Delivery of this operation could not be confirmed/)).toBeNull()
})
