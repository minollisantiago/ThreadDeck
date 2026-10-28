// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { Session, Snapshot } from '../../shared/model'
import { ChatWorkspace } from './workspace'

vi.mock('../components/desktop-titlebar', () => ({ DesktopTitlebar: () => null }))
vi.mock('./pane', () => ({ ConversationPane: ({ target }: { target: { session: Session } }) => <main data-testid="opened-session">{target.session.id}</main> }))

afterEach(() => { cleanup(); localStorage.clear(); delete window.threaddeckDesktop })
const session = (id: string): Session => ({ id, projectId: 'project', threadId: id, title: id, status: 'idle', agentCount: 0, updatedAt: 100, responseAt: 90, guildId: null })
const snapshot = (sessions: Session[]): Snapshot => ({ projects: [{ id: 'project', name: 'Project', directory: '/project', sessions }], health: 'connected', checkedAt: 100, lastSuccessAt: 100, attentionAvailable: true, inventoryLimited: false, message: null })

it('opens the exact notification thread after inventory arrives instead of restoring the previous thread', async () => {
  let navigate: (id: string) => void = () => {}
  const unsubscribe = vi.fn(), viewing = vi.fn(), receipts = vi.fn()
  window.threaddeckDesktop = { control: vi.fn(), onMaximized: () => () => {}, viewing, readReceipts: receipts, onOpenSession: callback => { navigate = callback; return unsubscribe } }
  localStorage.setItem('threaddeck:chat-last-session', 'old')
  localStorage.setItem('threaddeck:read-responses', JSON.stringify({ 'project:old': 90 }))
  const { rerender, unmount } = render(<ChatWorkspace snapshot={null}>Manager</ChatWorkspace>)
  act(() => navigate('notification'))
  rerender(<ChatWorkspace snapshot={snapshot([session('old'), session('notification')])}>Manager</ChatWorkspace>)
  await waitFor(() => expect(screen.getByTestId('opened-session').textContent).toBe('notification'))
  expect(viewing).toHaveBeenLastCalledWith('notification')
  expect(receipts).toHaveBeenCalledWith({ 'project:old': 90 })
  expect(localStorage.getItem('threaddeck:chat-last-session')).toBe('notification')
  unmount()
  expect(unsubscribe).toHaveBeenCalledOnce()
  expect(viewing).toHaveBeenLastCalledWith(null)
})

it('switches an already open workspace when the tray opens another thread', async () => {
  let navigate: (id: string) => void = () => {}
  window.threaddeckDesktop = { control: vi.fn(), onMaximized: () => () => {}, onOpenSession: callback => { navigate = callback; return () => {} } }
  localStorage.setItem('threaddeck:chat-last-session', 'old')
  render(<ChatWorkspace snapshot={snapshot([session('old'), session('other')])}>Manager</ChatWorkspace>)
  await waitFor(() => expect(screen.getByTestId('opened-session').textContent).toBe('old'))
  act(() => navigate('other'))
  await waitFor(() => expect(screen.getByTestId('opened-session').textContent).toBe('other'))
})
