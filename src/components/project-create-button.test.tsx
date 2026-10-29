// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { Project } from '../../shared/model'
import { WorkspaceControls } from '../chat/navigation'
import { ProjectCreateButton } from './project-create-button'

afterEach(cleanup)
const project: Project = { id: 'project', name: 'ThreadDeck', directory: '/project', sessions: [{ id: 'session', threadId: '100000000000000001', guildId: null, projectId: 'project', title: 'Current thread', status: 'idle', agentCount: 0, updatedAt: 1 }] }

it('shows the project-specific session shortcut in the create tooltip', async () => {
  const create = vi.fn()
  render(<WorkspaceControls.Provider value={{ compact: true, find: vi.fn(), create, threadId: project.sessions[0].threadId }}><ProjectCreateButton project={project} /></WorkspaceControls.Provider>)
  const button = screen.getByRole('button', { name: 'New session in ThreadDeck' })
  expect(button.getAttribute('aria-keyshortcuts')).toBe('Control+Shift+N Meta+Shift+N')
  await act(async () => { button.focus() })
  const tooltip = await screen.findByRole('tooltip')
  expect(tooltip.textContent).toContain('Ctrl / ⌘+Shift+N')
  expect(tooltip.textContent).toContain('in this project')
  fireEvent.click(button)
  expect(create).toHaveBeenCalledWith(project)
})

it('does not imply that the global shortcut targets a non-current card', async () => {
  render(<WorkspaceControls.Provider value={{ compact: true, find: vi.fn(), create: vi.fn(), threadId: 'another-thread' }}><ProjectCreateButton project={project} /></WorkspaceControls.Provider>)
  const button = screen.getByRole('button', { name: 'New session in ThreadDeck' })
  expect(button.hasAttribute('aria-keyshortcuts')).toBe(false)
  await act(async () => { button.focus() })
  expect((await screen.findByRole('tooltip')).textContent).toContain('in the current project')
})
