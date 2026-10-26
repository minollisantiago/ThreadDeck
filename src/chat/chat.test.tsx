// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { safePreview } from './html-preview'
import { PublishedMessages } from './messages'
import { publishedMessageSchema } from '../../shared/chat'
import { useDraft } from './drafts'
import { mergeMessages } from './use-conversation'
import { useUnread } from '../hooks/use-unread'
import type { Project } from '../../shared/model'
import { ChatMarkdown } from './markdown'
import { SessionRow } from '../components/session-row'
import { SessionNavigation } from './navigation'
import { ImagePreview } from './image-preview'

afterEach(() => { cleanup(); localStorage.clear() })
it('replaces image loading skeletons with the decoded preview or an explicit failure state', () => {
  const { rerender } = render(<ImagePreview src="/first.png" name="First image" />)
  expect(screen.getByRole('status', { name: 'Loading First image' })).toBeTruthy()
  fireEvent.load(screen.getByRole('img'))
  expect(screen.queryByRole('status')).toBeNull()
  rerender(<ImagePreview src="/second.png" name="Second image" />)
  expect(screen.getByRole('status', { name: 'Loading Second image' })).toBeTruthy()
  fireEvent.error(screen.getByRole('img'))
  expect(screen.getByText('Image preview unavailable')).toBeTruthy()
  expect(screen.queryByRole('status', { name: 'Loading Second image' })).toBeNull()
})
const message = publishedMessageSchema.parse({ id: '100000000000000002', channel_id: '100000000000000001', timestamp: '2026-10-24T00:00:00Z', author: { id: 'bot', username: 'Kimaki', bot: true }, content: 'Discord-visible text' })
it('renders one author header for a model interaction while preserving message identity, callouts, and edits', () => {
  const messages = [message, { ...message, id: '100000000000000003', content: 'Answer text', edited_timestamp: '2026-10-24T00:02:00Z' }, { ...message, id: '100000000000000004', content: '', components: [{ type: 17, components: [{ type: 10, content: 'Important callout' }] }] }, { ...message, id: '100000000000000005', content: '-# Session footer' }]
  const { container } = render(<PublishedMessages threadId={message.channel_id} messages={messages} preview={() => {}} />)
  expect(screen.getAllByText('Kimaki')).toHaveLength(1)
  expect(container.querySelectorAll('.chat-message-meta')).toHaveLength(1)
  expect(container.querySelectorAll('article[data-message-id]')).toHaveLength(4)
  expect(screen.getByText('Important callout')).toBeTruthy()
  expect(screen.getByText('Session footer', { exact: false })).toBeTruthy()
  expect(container.querySelector('[data-message-id="100000000000000003"] .chat-message-edited')?.textContent).toBe('edited')
  expect(container.querySelector('[data-message-id="100000000000000003"] time')?.getAttribute('datetime')).toBe(message.timestamp)
})
it('adds a new header for the next human interaction but not for live model continuations', () => {
  const { container, rerender } = render(<PublishedMessages threadId={message.channel_id} messages={[message]} preview={() => {}} />)
  const continued = { ...message, id: '100000000000000003', content: 'Live continuation' }
  rerender(<PublishedMessages threadId={message.channel_id} messages={[message, continued]} preview={() => {}} />)
  expect(container.querySelectorAll('.chat-message-meta')).toHaveLength(1)
  const prompt = { ...message, id: '100000000000000004', author: { id: 'human', username: 'Operator' }, content: 'Another question' }
  rerender(<PublishedMessages threadId={message.channel_id} messages={[message, continued, prompt, { ...message, id: '100000000000000005' }]} preview={() => {}} />)
  expect(container.querySelectorAll('.chat-message-meta')).toHaveLength(3)
  expect(screen.getAllByText('Kimaki')).toHaveLength(2)
})
it('attributes prompts relayed through Kimaki to the user instead of the model header', () => {
  const first = { ...message, content: '**ThreadDeck · local operator**\n\nFocus the input when I switch threads.' }
  const second = { ...message, id: '100000000000000003', content: '', components: [{ type: 10, content: '**ThreadDeck · local operator · queued**\n\nAlso focus after selecting a search result.' }] }
  const answer = { ...message, id: '100000000000000004', content: 'I will fix both navigation paths.' }
  const { container } = render(<PublishedMessages threadId={message.channel_id} messages={[first, second, answer, { ...answer, id: '100000000000000005', content: 'The model response continues here.' }]} preview={() => {}} />)
  expect(screen.getAllByText('You', { exact: true })).toHaveLength(2)
  expect(screen.getAllByText('Kimaki', { exact: true })).toHaveLength(1)
  expect(screen.queryByText('ThreadDeck · local operator', { exact: false })).toBeNull()
  expect(screen.getByText('Queued', { exact: true })).toBeTruthy()
  expect(container.querySelectorAll('.chat-message-group.user')).toHaveLength(2)
  expect(container.querySelector('.chat-message-group.assistant')?.querySelectorAll('article')).toHaveLength(2)
  expect(first.content).toContain('**ThreadDeck · local operator**')
})
it('displays literal HTML as text without executing or dropping it', () => {
  const { container } = render(<ChatMarkdown text={'<script>window.unsafe = true</script>'} />)
  expect(container.textContent).toContain('<script>window.unsafe = true</script>')
  expect(container.querySelector('script')).toBeNull()
})
it('keeps previews inert, removes active navigation and places restrictive CSP first', () => {
  const html = safePreview('<html><head><meta http-equiv="refresh" content="0;url=https://evil.example"><script>fetch("https://evil.example")</script><base href="https://evil.example"></head><body onload="alert(1)"><iframe src="https://evil.example"></iframe><h1>Safe heading</h1></body></html>')
  expect(html).not.toContain('<script'); expect(html).not.toContain('<iframe'); expect(html).not.toContain('<base'); expect(html).not.toContain('http-equiv="refresh"'); expect(html).not.toContain('onload')
  expect(html).toContain("default-src 'none'"); expect(html).toContain('Safe heading')
})
it('preserves real Tailwind stylesheets containing CSS property type syntax in HTML previews', () => {
  const html = safePreview('<!doctype html><html><head><style>@property --progress { syntax: "<percentage>"; inherits: false; initial-value: 100%; } body { font: 20px monospace; background: #e8ebee; }</style></head><body><h1>Styled attachment</h1></body></html>')
  expect(html).toContain('font: 20px monospace')
  expect(html).toContain('syntax: "<percentage>"')
  expect(html).toContain('<!doctype html>')
  expect(html).not.toContain('<script')
})
it('preserves Components V2 file/text order without rendering the attachment twice', () => {
  render(<PublishedMessages threadId={message.channel_id} preview={() => {}} discordUrl="https://discord.com/channels/1/2" messages={[{ ...message, content: '', attachments: [{ id: '100000000000000004', filename: 'study.html', size: 100, url: 'https://cdn.discordapp.com/study.html' }], components: [
    { type: 10, content: 'Before file' }, { type: 13, file: { url: 'attachment://study.html' } }, { type: 10, content: 'After file' },
  ] }]} />)
  expect(screen.getAllByText('study.html')).toHaveLength(1)
  expect(screen.getByText('Before file').compareDocumentPosition(screen.getByText('study.html')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(screen.getByText('study.html').compareDocumentPosition(screen.getByText('After file')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})
it('makes unsupported interactions explicit rather than simulating an answer', () => {
  render(<PublishedMessages messages={[{ ...message, components: [{ type: 2, label: 'Accept Always', custom_id: 'secret' }] }]} threadId={message.channel_id} discordUrl="https://discord.com/channels/1/2" preview={() => {}} />)
  expect(screen.getByText('Accept Always')).toBeTruthy(); expect(screen.getByRole('link', { name: 'Respond in Discord' }).getAttribute('href')).toBe('https://discord.com/channels/1/2')
  expect(screen.queryByRole('button', { name: 'Accept Always' })).toBeNull()
})
it('renders gallery attachments by Discord attachment identity even when signed URLs differ', () => {
  render(<PublishedMessages threadId={message.channel_id} preview={() => {}} discordUrl="https://discord.com/channels/1/2" messages={[{ ...message, attachments: [{ id: '100000000000000004', filename: 'preview.png', size: 100, content_type: 'image/png', url: 'https://cdn.discordapp.com/attachments/100000000000000001/100000000000000004/preview.png?ex=old' }], components: [{ type: 12, items: [{ media: { url: 'https://media.discordapp.net/attachments/100000000000000001/100000000000000004/preview.png?ex=new' }, description: 'Preview screenshot' }] }] }]} />)
  expect(screen.getByRole('button', { name: 'Enlarge preview.png' })).toBeTruthy()
  expect(screen.queryByText('View in Discord')).toBeNull()
  expect(screen.getAllByRole('img')).toHaveLength(1)
})
it('shows image attachments without MIME metadata as thumbnails, not generic downloads', () => {
  render(<PublishedMessages threadId={message.channel_id} preview={() => {}} messages={[{ ...message, attachments: [{ id: '100000000000000004', filename: 'preview.PNG', size: 100 }] }]} />)
  expect(screen.getByRole('button', { name: 'Enlarge preview.PNG' })).toBeTruthy()
})
it('renders Discord-hosted gallery images without separate attachment metadata', () => {
  const url = 'https://cdn.discordapp.com/attachments/100000000000000001/100000000000000004/preview.png'
  render(<PublishedMessages threadId={message.channel_id} preview={() => {}} discordUrl="https://discord.com/channels/1/2" messages={[{ ...message, components: [{ type: 12, items: [{ media: { url }, description: null }] }] }]} />)
  expect(screen.getByRole('img').getAttribute('src')).toBe(`/api/chat/threads/${message.channel_id}/messages/${message.id}/attachments/100000000000000004`)
  expect(screen.getByRole('button', { name: 'Enlarge preview.png' })).toBeTruthy()
  expect(screen.queryByText('View in Discord')).toBeNull()
})
it('renders actual Components V2 file resources even when Discord returns no top-level attachments', () => {
  const preview = vi.fn()
  render(<PublishedMessages threadId={message.channel_id} preview={preview} discordUrl="https://discord.com/channels/1/2" messages={[{ ...message, attachments: [], components: [{ type: 13, file: { id: '100000000000000009', attachment_id: '100000000000000004', url: `https://cdn.discordapp.com/attachments/${message.channel_id}/100000000000000004/review.html?ex=signed`, content_type: 'text/html; charset=utf-8' }, name: 'review.html', size: 240095 }] }]} />)
  fireEvent.click(screen.getByRole('button', { name: 'Preview HTML' }))
  expect(preview).toHaveBeenCalledWith('review.html', `/api/chat/threads/${message.channel_id}/messages/${message.id}/attachments/100000000000000004`)
  expect(screen.queryByText('View in Discord')).toBeNull()
})
it('does not load arbitrary external media or active formats inline', () => {
  render(<PublishedMessages threadId={message.channel_id} preview={() => {}} messages={[{ ...message, components: [{ type: 12, items: [{ media: { url: 'https://evil.example/preview.png' } }] }], attachments: [{ id: '100000000000000004', filename: 'unsafe.svg', size: 100, content_type: 'image/svg+xml' }] }]} />)
  expect(screen.queryByRole('img')).toBeNull()
})
it('does not overwrite a draft saved by another editor', () => {
  const id = crypto.randomUUID(), a = renderHook(() => useDraft(id)), b = renderHook(() => useDraft(id))
  act(() => a.result.current.save({ text: 'Saved in first window' }))
  act(() => b.result.current.save({ text: 'Unfinished in second window' }))
  expect(b.result.current.conflict).toBe(true)
  expect(localStorage.getItem(`threaddeck:chat-draft:v1:${id}`)).toContain('Saved in first window')
  expect(b.result.current.draft.text).toBe('Unfinished in second window')
  act(() => b.result.current.keep())
  expect(localStorage.getItem(`threaddeck:chat-draft:v1:${id}`)).toContain('Unfinished in second window')
})
it('updates read receipts across manager and conversation hooks in one window', () => {
  const session = { id: 'ses_1', threadId: '100000000000000001', projectId: 'p', guildId: null, title: 'Test', status: 'idle' as const, updatedAt: 1, agentCount: 0, responseAt: 50 }
  const projects: Project[] = [{ id: 'p', name: 'Project', directory: '/fixture', sessions: [session] }]
  const manager = renderHook(() => useUnread(projects)), pane = renderHook(() => useUnread(projects))
  expect(manager.result.current.unread.has(session.id)).toBe(true)
  act(() => pane.result.current.markRead(session))
  expect(manager.result.current.unread.has(session.id)).toBe(false)
})
it('opens linked sessions without prematurely acknowledging an unseen reply', () => {
  const session = { id: 'ses_test', title: 'Read after delivery', threadId: '100000000000000001', guildId: '100000000000000002', projectId: 'p', status: 'idle' as const, agentCount: 0, updatedAt: 1, responseAt: 50 }
  const open = vi.fn(), markRead = vi.fn()
  render(<SessionNavigation.Provider value={open}><SessionRow session={session} verified now={100} unread markRead={markRead} /></SessionNavigation.Provider>)
  fireEvent.click(screen.getByRole('link', { name: session.title }))
  expect(open).toHaveBeenCalledWith(session); expect(markRead).not.toHaveBeenCalled()
})
it('merges live revisions and deletes by Discord identity, not text', () => {
  const other = { ...message, id: '100000000000000003', content: message.content }
  const updated = { ...message, content: 'Edited text' }
  expect(mergeMessages([message, other], [updated], [other.id])).toEqual([updated])
})
