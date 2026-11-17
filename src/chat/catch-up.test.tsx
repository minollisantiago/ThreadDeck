// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { publishedMessageSchema } from '../../shared/chat'
import type { Project, Session, Snapshot } from '../../shared/model'
import { CatchUpPane, exchangePreview } from './catch-up'
import { useCatchUp } from './use-catch-up'
import { ChatWorkspace } from './workspace'
import { Dashboard } from '../App'

vi.mock('../components/desktop-titlebar', () => ({ DesktopTitlebar: () => null }))
vi.mock('./pane', () => ({ ConversationPane: ({ target }: { target: { session: Session } }) => <main data-testid="opened-session">{target.session.id}</main> }))
beforeEach(() => { vi.stubGlobal('innerWidth', 1600) })
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); delete window.threaddeckDesktop })
const session: Session = { id: 'session', projectId: 'project', threadId: '100000000000000001', guildId: null, title: 'Fix startup', status: 'input', agentCount: 0, responseAt: 100, updatedAt: 100 }
const project: Project = { id: 'project', name: 'ThreadDeck', directory: '/project', sessions: [session] }
const snapshot: Snapshot = { projects: [project], health: 'connected', checkedAt: Date.now(), lastSuccessAt: Date.now(), attentionAvailable: true, inventoryLimited: false, message: null }
const message = (id: string, content: string, bot = false) => publishedMessageSchema.parse({ id, channel_id: session.threadId, content, timestamp: '2026-11-17T00:00:00Z', author: { id: bot ? 'bot' : 'user', username: 'Operator', bot } })
function mockHistory() { vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ messages: [message('1', 'Please fix startup.'), message('2', 'Fixed the race; waiting for your review.', true)], cursor: 'cursor', before: null, stale: false }), { status: 200 }))) }

it('keeps summary-seen state independent of read receipts and retains its batch on navigation', () => {
  const { result, rerender, unmount } = renderHook(({ unread }) => useCatchUp([project], unread), { initialProps: { unread: new Set(['session']) } })
  expect(result.current.unseenCount).toBe(1)
  act(() => result.current.open())
  expect(result.current.unseenCount).toBe(0)
  expect(localStorage.getItem('threaddeck:read-responses')).toBeNull()
  act(() => result.current.leave())
  rerender({ unread: new Set() })
  expect(result.current.entries).toHaveLength(1)
  act(() => result.current.close())
  unmount()
  const next = renderHook(() => useCatchUp([project], new Set(['session'])))
  expect(next.result.current.unseenCount).toBe(0)
  expect(next.result.current.visible).toBe(false)
})

it('badges new responses after dismissal without interrupting the current view', () => {
  const { result, rerender } = renderHook(({ projects }) => useCatchUp(projects, new Set(['session'])), { initialProps: { projects: [project] } })
  act(() => result.current.open())
  act(() => result.current.close())
  rerender({ projects: [{ ...project, sessions: [{ ...session, responseAt: 200, updatedAt: 200 }] }] })
  expect(result.current.unseenCount).toBe(1)
  expect(result.current.visible).toBe(false)
  act(() => result.current.open())
  expect(result.current.unseenCount).toBe(0)
})

it('handles corrupt optional preferences and clears an already-visible badge for new activity', () => {
  localStorage.setItem('threaddeck:catch-up-seen', '[]')
  const { result, rerender } = renderHook(({ projects }) => useCatchUp(projects, new Set(['session'])), { initialProps: { projects: [project] } })
  act(() => result.current.open())
  rerender({ projects: [{ ...project, sessions: [{ ...session, responseAt: 200 }] }] })
  expect(result.current.entries[0].session.responseAt).toBe(200)
  expect(result.current.unseenCount).toBe(0)
})

it('extracts relayed operator prompts, rich callouts, and grouped responses without attributing prompts to agents', () => {
  const operator = message('2', '**ThreadDeck · local operator**\n\nFix startup.', true)
  const answer = { ...message('3', '', true), components: [{ type: 17, components: [{ type: 10, content: 'The startup race is fixed.' }] }] }
  const preview = exchangePreview([message('1', 'Older response', true), operator, answer, message('4', '-# Session footer', true)])
  expect(preview).toEqual({ user: 'Fix startup.', agent: 'The startup race is fixed.' })
  expect(exchangePreview([message('1', 'x'.repeat(600), true)]).agent).toHaveLength(440)
  expect(exchangePreview([])).toEqual({ user: null, agent: null })
})

it('renders project-grouped real excerpts and opens a thread in the workspace', async () => {
  mockHistory()
  const open = vi.fn()
  const { container } = render(<CatchUpPane entries={[{ session, project }]} open={open} connected />)
  expect(screen.getByRole('heading', { name: 'Pending review' })).toBeTruthy()
  expect(container.querySelector('.catch-up-metrics')).toBeNull()
  expect(container.querySelector('.catch-up-pane-toolbar')).toBeNull()
  expect(screen.queryByRole('button', { name: /close|dismiss|back to work/i })).toBeNull()
  expect(screen.getByRole('heading', { name: /# ThreadDeck.*1 thread/ })).toBeTruthy()
  await screen.findByText('Fixed the race; waiting for your review.')
  fireEvent.click(screen.getByRole('link', { name: 'Open thread' }))
  expect(open).toHaveBeenCalledWith(session)
})

it('shows retry and cached-connection notices instead of inventing a summary', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
  render(<CatchUpPane entries={[{ session, project }]} open={() => {}} connected={false} />)
  await screen.findByText('The latest exchange could not be loaded.')
  expect(screen.getByText(/Connection unavailable or stale/)).toBeTruthy()
  mockHistory()
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await screen.findByText('Fixed the race; waiting for your review.')
})

it('starts on unseen catch-up, dismisses to the last thread, and keeps the icon available without a badge', async () => {
  mockHistory()
  localStorage.setItem('threaddeck:chat-last-session', session.id)
  render(<ChatWorkspace snapshot={snapshot}><Dashboard snapshot={snapshot} /></ChatWorkspace>)
  await screen.findByRole('heading', { name: 'Pending review' })
  const button = screen.getByLabelText('Review summary', { selector: 'button' })
  expect(button.querySelector('.catch-up-badge')).toBeNull()
  expect(JSON.parse(localStorage.getItem('threaddeck:read-responses') || '{}')).toEqual({})
  expect(screen.getAllByRole('button', { name: /close.*summary|dismiss.*summary/i })).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Close review summary tab' }))
  await screen.findByTestId('opened-session')
  fireEvent.click(screen.getByLabelText('Review summary', { selector: 'button' }))
  await screen.findByRole('heading', { name: 'Pending review' })
})

it('restores the last chat after the overview has been seen and badges only newly unseen threads', async () => {
  mockHistory()
  localStorage.setItem('threaddeck:chat-last-session', session.id)
  localStorage.setItem('threaddeck:catch-up-seen', JSON.stringify({ [`project:${session.threadId}`]: 100 }))
  const { rerender } = render(<ChatWorkspace snapshot={snapshot}><Dashboard snapshot={snapshot} /></ChatWorkspace>)
  await screen.findByTestId('opened-session')
  const updated = { ...snapshot, projects: [{ ...project, sessions: [{ ...session, responseAt: 200 }] }] }
  rerender(<ChatWorkspace snapshot={updated}><Dashboard snapshot={updated} /></ChatWorkspace>)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Review summary (1 unseen thread)' }).querySelector('.catch-up-badge')?.textContent).toBe('1'))
  expect(screen.queryByRole('heading', { name: 'Pending review' })).toBeNull()
})

it('keeps mobile sidebar access in the tab strip without adding another summary close control', async () => {
  vi.stubGlobal('innerWidth', 390)
  mockHistory()
  render(<ChatWorkspace snapshot={snapshot}>Manager</ChatWorkspace>)
  await screen.findByRole('heading', { name: 'Pending review' })
  const toggle = screen.getByRole('button', { name: 'Toggle session sidebar' })
  expect(toggle.getAttribute('aria-expanded')).toBe('false')
  expect(screen.getAllByRole('button', { name: /close.*summary/i })).toHaveLength(1)
  fireEvent.click(toggle)
  expect(screen.getByRole('dialog', { name: 'Session manager' })).toBeTruthy()
})
