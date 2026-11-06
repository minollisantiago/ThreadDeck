// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { publishedMessageSchema } from '../../shared/chat'
import { PublishedMessages } from './messages'
import { publishedMarkdown } from './published-markdown'

afterEach(cleanup)

// Discord fills in accent_color: null on Kimaki's unaccented table containers.
// Keep the REST response shape here, not just the outgoing Kimaki payload.
const table = publishedMessageSchema.parse({
  id: '100000000000000002', channel_id: '100000000000000001',
  timestamp: '2026-11-06T00:00:00Z', author: { id: 'bot', username: 'Kimaki', bot: true },
  components: [{ type: 17, id: 1, accent_color: null, spoiler: false, components: [
    { type: 10, id: 2, content: '**Option** **Synchronization runs**\n**What you see** A history of download attempts.' },
    { type: 14, id: 3, spacing: 1, divider: true },
    { type: 10, id: 4, content: '**Option** **Source revisions**\n**What you see** Saved versions of records.' },
  ] }],
})

it('renders Discord-returned Kimaki tables locally instead of hiding all rows behind a Discord link', () => {
  const { container } = render(<PublishedMessages messages={[table]} threadId={table.channel_id} discordUrl="https://discord.com/channels/1/2" preview={() => {}} />)
  expect(screen.queryByText(/Unsupported Discord content/)).toBeNull()
  expect(screen.getByText('Synchronization runs')).toBeTruthy()
  expect(screen.getByText('Source revisions')).toBeTruthy()
  expect(container.textContent).toContain('A history of download attempts.')
  expect(container.querySelectorAll('hr')).toHaveLength(1)
  expect(container.querySelector('.chat-container')?.getAttribute('style')).toBeNull()
  expect(screen.queryByRole('link', { name: 'Open in Discord' })).toBeNull()
})

it('preserves callout accents alongside unaccented containers', () => {
  const callout = { ...table, components: [{ type: 17, accent_color: 0x3b82f6, components: table.components }] }
  const { container } = render(<PublishedMessages messages={[callout]} threadId={table.channel_id} preview={() => {}} />)
  expect(container.querySelector('.chat-container')?.getAttribute('style')).toContain('#3b82f6')
  expect(screen.getByText('Synchronization runs')).toBeTruthy()
})

it('includes every published table row in copied Markdown', () => {
  expect(publishedMarkdown([table])).toBe('**Option** **Synchronization runs**\n**What you see** A history of download attempts.\n\n---\n\n**Option** **Source revisions**\n**What you see** Saved versions of records.')
})
