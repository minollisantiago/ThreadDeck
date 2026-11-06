// @vitest-environment jsdom
import { useContext } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ProfileProvider } from '../components/profile-provider'
import { ProfileContext } from '../hooks/use-profile'
import { PublishedMessages } from './messages'
import { OutgoingMessage } from './outgoing-message'
import { publishedMessageSchema } from '../../shared/chat'

const profile = { id: '100000000000000021', username: 'sam', displayName: 'Sam', avatarUrl: 'https://cdn.discordapp.com/avatars/100000000000000021/abc.png' }
const base = { channel_id: '100000000000000001', timestamp: '2026-11-06T12:00:00Z' }
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals() })

function ProfileActions() {
  const identity = useContext(ProfileContext)!
  return <><button onClick={() => void identity.connect(profile.id)}>Choose profile</button><button onClick={() => void identity.useLocal()}>Clear profile</button></>
}

it.each(['accepted', 'submitted', 'unknown', 'failed'])('shares the selected photo with published and %s outgoing prompts without impersonating other authors', async state => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ profile: null })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ profile })))
  vi.stubGlobal('fetch', fetch)
  const messages = [
    publishedMessageSchema.parse({ ...base, id: '100000000000000101', author: { id: 'bot', username: 'Kimaki', bot: true }, content: '**ThreadDeck · local operator**\n\nMy published prompt' }),
    publishedMessageSchema.parse({ ...base, id: '100000000000000102', author: { id: 'another-person', username: 'Other person' }, content: 'Not the local user' }),
    publishedMessageSchema.parse({ ...base, id: '100000000000000103', author: { id: profile.id, username: 'Sam' }, content: 'My Discord prompt' }),
    publishedMessageSchema.parse({ ...base, id: '100000000000000104', author: { id: 'bot', username: 'Kimaki', bot: true }, content: 'Assistant response' }),
  ]
  const { container } = render(<ProfileProvider><ProfileActions /><PublishedMessages messages={messages} threadId={base.channel_id} preview={() => {}} /><OutgoingMessage text="Pending prompt" files={[]} state={state} queued={state === 'submitted'} restore={() => {}} canRestore /></ProfileProvider>)
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
  fireEvent.click(screen.getByRole('button', { name: 'Choose profile' }))
  await waitFor(() => expect(container.querySelectorAll('.chat-avatar img')).toHaveLength(3))
  for (const image of container.querySelectorAll('.chat-avatar img')) expect(image.getAttribute('src')).toBe(profile.avatarUrl)
  expect(screen.getByRole('region', { name: 'Messages from Other person' }).querySelector('img')).toBeNull()
  expect(container.querySelector('.assistant .chat-hush-avatar')).toBeTruthy()
  expect(screen.getAllByText('You', { exact: true })).toHaveLength(2)
  fireEvent.error(container.querySelector('.chat-outgoing .chat-avatar img')!)
  expect(container.querySelector('.chat-outgoing .chat-avatar')?.textContent).toBe('S')
  fireEvent.click(screen.getByRole('button', { name: 'Clear profile' }))
  await waitFor(() => expect(container.querySelectorAll('.chat-avatar img')).toHaveLength(0))
  expect(container.querySelector('.chat-outgoing .chat-avatar')?.textContent).toBe('Y')
  expect(fetch).toHaveBeenCalledTimes(2)
})
