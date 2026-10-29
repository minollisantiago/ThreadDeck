import { expect, it } from 'vitest'
import { inlineAudioType } from '../shared/audio'
import { submitSchema } from '../shared/chat'
import { publishedAttachments } from '../shared/discord-attachments'
import { publishedMessageSchema } from '../shared/chat'

const file = { id: '7c18b13a-6d07-419d-b54f-e8024fc91673', name: 'voice.ogg', audioPrompt: true }
const input = { requestId: file.id, threadId: '100000000000000001', text: '', delivery: 'queue', files: [file] }
it('preserves explicit audio prompt selection and rejects multiple recordings or command invocations', () => {
  expect(submitSchema.parse(input).files).toEqual([file])
  expect(submitSchema.safeParse({ ...input, files: [file, file] }).success).toBe(false)
  expect(submitSchema.safeParse({ ...input, text: '/review' }).success).toBe(false)
  expect(submitSchema.safeParse({ ...input, kind: 'skill', name: 'research' }).success).toBe(false)
})
it('only serves allowlisted audio MIME types and uses extensions for missing generic metadata', () => {
  expect(inlineAudioType('voice.ogg', 'audio/ogg; codecs=opus')).toBe('audio/ogg')
  expect(inlineAudioType('voice.MP3', 'application/octet-stream')).toBe('audio/mpeg')
  expect(inlineAudioType('voice.ogg', 'text/html')).toBeUndefined()
  expect(inlineAudioType('voice.svg', 'image/svg+xml')).toBeUndefined()
})
it('collects immutable forwarded voice attachments without losing duration/waveform', () => {
  const attachment = { id: '100000000000000003', filename: 'voice.ogg', size: 100, url: 'https://cdn.discordapp.com/attachments/100000000000000001/100000000000000003/voice.ogg', content_type: 'audio/ogg', waveform: 'AAH/', duration_secs: 2 }
  const message = publishedMessageSchema.parse({ id: '100000000000000002', channel_id: input.threadId, timestamp: '2026-10-29T00:00:00Z', author: { id: 'human', username: 'Human' }, message_snapshots: [{ message: { attachments: [attachment] } }] })
  expect(publishedAttachments(message)).toEqual([attachment])
})
