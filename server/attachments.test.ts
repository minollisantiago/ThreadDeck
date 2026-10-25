import { expect, it, vi } from 'vitest'
import { readDiscordAttachment } from './attachments'

const threadId = '100000000000000001', messageId = '100000000000000002', attachmentId = '100000000000000003'
const url = `https://cdn.discordapp.com/attachments/${threadId}/${attachmentId}/review.html?ex=fresh-signature`
function setup(components: unknown[], attachments: unknown[] = [], channelId = threadId) {
  const bridge = { call: vi.fn(async () => ({ messages: [{ id: messageId, channel_id: channelId, timestamp: '2026-10-24T00:00:00Z', author: { id: 'bot', username: 'Kimaki' }, components, attachments }], cursor: 'fixture:0', before: null, stale: false })) }
  const download = vi.fn<typeof fetch>(async () => new Response('<html>safe preview</html>', { headers: { 'content-type': 'text/html' } }))
  const signal = new AbortController().signal
  return { bridge, download, signal, read: (id = attachmentId) => readDiscordAttachment(bridge, threadId, messageId, id, signal, download) }
}
it('downloads actual Components V2 HTML resources using the attachment ID, not the resource ID', async () => {
  const { bridge, download, signal, read } = setup([{ type: 17, components: [{ type: 13, name: 'review.html', size: 24, file: { id: '100000000000000099', attachment_id: attachmentId, url, content_type: 'text/html; charset=utf-8' } }] }])
  const file = await read()
  expect(file.name).toBe('review.html'); expect(file.type).toBe('text/html; charset=utf-8')
  expect(file.bytes.toString()).toBe('<html>safe preview</html>')
  expect(bridge.call).toHaveBeenCalledWith('snapshot', { threadId, before: '100000000000000003' }, signal)
  expect(download).toHaveBeenCalledWith(url, expect.objectContaining({ redirect: 'error', signal: expect.any(AbortSignal) }))
})
it('downloads component-only image galleries without requiring a bot restart or file RPC', async () => {
  const image = url.replace('review.html', 'screenshot.png')
  const { read, download } = setup([{ type: 12, items: [{ media: { attachment_id: attachmentId, url: image, content_type: 'image/png', width: 1440, height: 1050 } }] }])
  download.mockResolvedValueOnce(new Response(new Uint8Array([137, 80, 78, 71])))
  expect(await read()).toMatchObject({ name: 'screenshot.png', type: 'image/png' })
})
it('does not fetch arbitrary URLs, mismatched attachments, or another thread’s messages', async () => {
  for (const unsafe of ['https://evil.example/review.html', `http://cdn.discordapp.com/attachments/${threadId}/${attachmentId}/review.html`, `https://user:secret@cdn.discordapp.com/attachments/${threadId}/${attachmentId}/review.html`, url.replace(attachmentId, '100000000000000099')]) {
    const { read, download } = setup([{ type: 13, file: { attachment_id: attachmentId, url: unsafe }, name: 'review.html' }])
    await expect(read()).rejects.toThrow('Attachment is not part')
    expect(download).not.toHaveBeenCalled()
  }
  const { read, download } = setup([{ type: 13, file: { attachment_id: attachmentId, url }, name: 'review.html' }], [], '100000000000000088')
  await expect(read()).rejects.toThrow('Attachment is not part'); expect(download).not.toHaveBeenCalled()
})
it('enforces the attachment size limit even when a gallery omits size metadata', async () => {
  const { read, download } = setup([{ type: 12, items: [{ media: { attachment_id: attachmentId, url } }] }])
  download.mockResolvedValueOnce(new Response(new Uint8Array(10 * 1024 * 1024 + 1)))
  await expect(read()).rejects.toThrow('larger than 10 MiB')
})
