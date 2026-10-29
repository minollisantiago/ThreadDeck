// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AttachmentRow, attachmentSize } from './attachment-row'
import { draftFileSchema, type Draft } from './drafts'
import { PublishedMessages } from './messages'
import { PromptComposer } from './composer'
import { OutgoingMessage } from './outgoing-message'
import { publishedMessageSchema } from '../../shared/chat'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('formats attachment sizes honestly, including empty and legacy attachments', () => {
  expect(attachmentSize(0)).toBe('0 B')
  expect(attachmentSize(1024)).toBe('1 KiB')
  expect(attachmentSize(2505 * 1024)).toBe('2.4 MiB')
  expect(attachmentSize()).toBe('—')
  expect(attachmentSize(-1)).toBe('—')
  expect(attachmentSize(Infinity)).toBe('—')
})

it('renders full filenames with accessible, icon-only ghost actions', async () => {
  const preview = vi.fn(), name = 'A_very_long_interactive_dashboard_filename.html'
  render(<AttachmentRow name={name} size={2048} url="/file" preview={preview} />)
  const download = screen.getByRole('link', { name: `Download ${name}` })
  expect(download.getAttribute('href')).toBe('/file')
  expect(download.getAttribute('download')).toBe(name)
  expect(download.textContent).toBe('')
  expect(download.className).toContain('hover:bg-secondary')
  const button = screen.getByRole('button', { name: 'Preview HTML' })
  expect(button.textContent).toBe('')
  fireEvent.click(button)
  expect(preview).toHaveBeenCalledOnce()
  await act(async () => { screen.getByText(name).focus() })
  expect((await screen.findByRole('tooltip')).textContent).toBe(name)
})

it('shows readiness or an unavailable warning without enabling removal during uploads', () => {
  const remove = vi.fn()
  const { rerender } = render(<AttachmentRow name="report.pdf" size={0} remove={remove} />)
  expect(screen.getByRole('img', { name: 'Ready to send' })).toBeTruthy()
  expect(screen.getByText('0 B')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Remove report.pdf' }))
  expect(remove).toHaveBeenCalledOnce()
  rerender(<AttachmentRow name="report.pdf" remove={remove} available={false} disabled />)
  expect(screen.getByRole('img', { name: 'Reattach this file after reload' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Remove report.pdf' }).hasAttribute('disabled')).toBe(true)
  expect(screen.getByText('—')).toBeTruthy()
})

it('uses quiet rows for published files and leaves screenshot thumbnails intact', () => {
  const message = publishedMessageSchema.parse({ id: '100000000000000007', channel_id: '100000000000000001', timestamp: new Date().toISOString(), author: { id: 'human', username: 'You' }, attachments: [
    { id: 'pdf', filename: 'report.pdf', size: 577 * 1024 },
    { id: 'html', filename: 'dashboard.html', size: 0 },
    { id: 'image', filename: 'screenshot.png', size: 2048, width: 800, height: 600 },
  ] })
  const preview = vi.fn()
  const { container } = render(<PublishedMessages threadId={message.channel_id} messages={[message]} preview={preview} />)
  expect(container.querySelectorAll('.chat-attachment-row')).toHaveLength(2)
  expect(container.querySelectorAll('.chat-image')).toHaveLength(1)
  expect(screen.getByRole('button', { name: 'Enlarge screenshot.png' })).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Download report.pdf' }).getAttribute('href')).toContain('/messages/100000000000000007/attachments/pdf')
  fireEvent.click(screen.getByRole('button', { name: 'Preview HTML' }))
  expect(preview).toHaveBeenCalledWith('dashboard.html', '/api/chat/threads/100000000000000001/messages/100000000000000007/attachments/html')
})

it('keeps file size in local draft and pending metadata without requiring it for older drafts', () => {
  const id = '550e8400-e29b-41d4-a716-446655440000'
  expect(draftFileSchema.parse({ id, name: 'report.pdf', size: 4096 }).size).toBe(4096)
  expect(draftFileSchema.parse({ id, name: 'report.pdf' }).size).toBeUndefined()
})

it('preserves the local upload size even when the server only returns an upload identity', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: '550e8400-e29b-41d4-a716-446655440000', name: 'report.pdf' }))))
  const change = vi.fn(), draft: Draft = { text: '', anchor: 0, head: 0, revision: '', files: [] }
  const { container } = render(<PromptComposer draft={draft} change={change} expanded={false} toggle={vi.fn()} enabled busy={false} pending={false} catalog={{ entries: [] }} submit={vi.fn()} stop={vi.fn()} />)
  fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [new File(['report bytes'], 'report.pdf', { type: 'application/pdf' })] } })
  await waitFor(() => expect(change).toHaveBeenCalledWith({ files: [expect.objectContaining({ name: 'report.pdf', size: 12, available: true })] }))
})

it('uses the same quiet rows for outgoing attachments without inventing download actions', () => {
  const { container } = render(<OutgoingMessage text="Review this file" files={[{ id: 'file', name: 'report.pdf', size: 1024 }]} state="accepted" queued={false} restore={vi.fn()} canRestore={false} />)
  expect(container.querySelectorAll('.chat-attachment-row')).toHaveLength(1)
  expect(screen.getByText('1 KiB')).toBeTruthy()
  expect(screen.queryByRole('link')).toBeNull()
})
