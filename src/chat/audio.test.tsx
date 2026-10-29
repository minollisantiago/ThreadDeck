// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AudioMessage } from './audio-message'
import { AudioRecorder, recordingExtension } from './audio-recorder'
import { PromptComposer } from './composer'
import { PublishedMessages } from './messages'
import { publishedMessageSchema } from '../../shared/chat'
import { discordAudioPeaks, sampleAudioPeaks, useRecordingWaveform } from './audio-waveform'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
function media() {
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) { this.dispatchEvent(new Event('pause')) })
  return vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) { this.dispatchEvent(new Event('play')); return Promise.resolve() })
}
it('loads audio only on demand, pauses the previous clip, seeks and changes speed', async () => {
  const play = media()
  const { container } = render(<><AudioMessage src="/a" name="a.ogg" duration={31} waveform="AAH/" /><AudioMessage src="/b" name="b.mp3" /></>)
  const elements = container.querySelectorAll('audio')
  expect(elements[0].getAttribute('src')).toBeNull()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Play a.ogg' })))
  expect(elements[0].getAttribute('src')).toBe('/a')
  expect(play).toHaveBeenCalledTimes(1)
  fireEvent.change(screen.getByLabelText('Seek a.ogg'), { target: { value: '8' } })
  expect(elements[0].currentTime).toBe(8)
  fireEvent.click(screen.getByRole('button', { name: 'Playback speed for a.ogg: 1×' }))
  expect(elements[0].playbackRate).toBe(1.5)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Play b.mp3' })))
  expect(screen.getByRole('button', { name: 'Play a.ogg' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Pause b.mp3' })).toBeTruthy()
})
it('keeps a download/retry path when playback fails', async () => {
  media().mockRejectedValueOnce(new Error('decoder unavailable'))
  render(<AudioMessage src="/a" name="a.ogg" />)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Play a.ogg' })))
  expect(screen.getByRole('alert').textContent).toContain('Retry or download')
  expect(screen.getByRole('link', { name: 'Download' }).getAttribute('href')).toBe('/a')
})
it('renders a Discord Ogg voice note as an audio bubble with optional forwarding', () => {
  media()
  const forward = vi.fn()
  const message = publishedMessageSchema.parse({ id: '100000000000000002', channel_id: '100000000000000001', timestamp: '2026-10-29T00:00:00Z', author: { id: 'human', username: 'Human' }, attachments: [{ id: '100000000000000003', filename: 'voice.ogg', size: 100, content_type: 'audio/ogg', duration_secs: 31 }] })
  render(<PublishedMessages messages={[message]} threadId={message.channel_id} preview={() => {}} forwardAudio={forward} />)
  expect(screen.getByLabelText('Remaining time for voice.ogg').textContent).toBe('0:31')
  fireEvent.click(screen.getByRole('button', { name: 'Use as prompt' }))
  expect(forward).toHaveBeenCalledWith('voice.ogg', expect.stringContaining('/attachments/100000000000000003'))
})
it('cycles playback speeds in the requested order and wraps back to 1× without a dropdown', () => {
  media()
  const { container } = render(<AudioMessage src="/a" name="a.ogg" />)
  const audio = container.querySelector('audio')!
  expect(screen.queryByRole('combobox')).toBeNull()
  for (const speed of [1.5, 1.75, 2, 1]) {
    fireEvent.click(screen.getByRole('button', { name: /Playback speed for a.ogg/ }))
    expect(screen.getByRole('button', { name: /Playback speed for a.ogg/ }).textContent).toBe(`${speed}×`)
    expect(audio.playbackRate).toBe(speed)
  }
})
it('adjusts real media volume, supports mute/restore and closes volume on Escape', () => {
  media()
  const { container } = render(<AudioMessage src="/a" name="a.ogg" />)
  const audio = container.querySelector('audio')!
  const button = screen.getByRole('button', { name: 'Adjust volume for a.ogg' })
  fireEvent.click(button)
  expect(screen.getByRole('slider', { name: 'Volume for a.ogg' }).getAttribute('aria-orientation')).toBe('vertical')
  fireEvent.change(screen.getByRole('slider', { name: 'Volume for a.ogg' }), { target: { value: '.35' } })
  expect(audio.volume).toBe(.35)
  fireEvent.click(screen.getByRole('button', { name: 'Mute a.ogg' }))
  expect(audio.volume).toBe(0)
  fireEvent.click(screen.getByRole('button', { name: 'Unmute a.ogg' }))
  expect(audio.volume).toBe(.35)
  fireEvent.keyDown(button, { key: 'Escape' })
  expect(screen.queryByRole('slider', { name: 'Volume for a.ogg' })).toBeNull()
  expect(document.activeElement).toBe(button)
})
it('samples real signal energy for recording previews and validates Discord waveform metadata', async () => {
  expect(sampleAudioPeaks(new Float32Array([0, 0, .25, -.25, .5, -.5, 1, -1]), 4)).toEqual([0, .25, .5, 1])
  expect(sampleAudioPeaks(new Float32Array(8), 4)).toEqual([0, 0, 0, 0])
  expect(discordAudioPeaks('AAH/')).toEqual([0, 1 / 255, 1])
  expect(discordAudioPeaks('%%%')).toEqual([])
  const close = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('AudioContext', class { state = 'running'; close = close; decodeAudioData = async () => ({ duration: 3, getChannelData: () => new Float32Array([0, .5, 1, .5]) }) })
  const blob = new Blob(['audio'])
  Object.defineProperty(blob, 'arrayBuffer', { value: async () => new ArrayBuffer(4) })
  const { result } = renderHook(() => useRecordingWaveform(blob))
  await waitFor(() => expect(result.current?.duration).toBe(3))
  expect(result.current?.peaks).toHaveLength(64)
  expect(close).toHaveBeenCalled()
})

class Recorder {
  static latest: Recorder
  static isTypeSupported = (type: string) => type.startsWith('audio/webm')
  state = 'inactive'
  mimeType = 'audio/webm;codecs=opus'
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor() { Recorder.latest = this }
  start() { this.state = 'recording' }
  stop() { this.state = 'inactive'; queueMicrotask(() => { this.ondataavailable?.({ data: new Blob(['recorded audio']) }); this.onstop?.() }) }
}
function microphone() {
  const stop = vi.fn(), stream = { getTracks: () => [{ stop }], getAudioTracks: () => [{ stop, onended: null }] }
  const getUserMedia = vi.fn().mockResolvedValue(stream)
  vi.stubGlobal('MediaRecorder', Recorder)
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
  vi.stubGlobal('URL', class extends URL { static createObjectURL = vi.fn(() => 'blob:recording'); static revokeObjectURL = vi.fn() })
  return { stop, stream, getUserMedia }
}
it('records true WebM bytes, attaches without dictation review, releases the mic and revokes preview URLs', async () => {
  media(); const { stop } = microphone(), onRecord = vi.fn().mockResolvedValue(undefined), onBusy = vi.fn()
  const { unmount } = render(<AudioRecorder enabled attached={false} onRecord={onRecord} onBusy={onBusy} />)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Record audio prompt' })))
  expect(screen.getByRole('status').textContent).toContain('Recording')
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Stop recording' })))
  expect(onRecord).toHaveBeenCalledTimes(1)
  const file: File = onRecord.mock.calls[0][0]
  expect(file.name).toMatch(/\.webm$/)
  expect(file.type).toBe('audio/webm;codecs=opus')
  expect(stop).toHaveBeenCalled()
  expect(onBusy).toHaveBeenLastCalledWith(false)
  expect(screen.getByRole('button', { name: 'Play Recording preview' })).toBeTruthy()
  expect(screen.queryByRole('combobox')).toBeNull()
  unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:recording')
})
it('cancels recording without uploading and releases late permission grants after navigation', async () => {
  media(); const { stop, getUserMedia, stream } = microphone(), onRecord = vi.fn()
  const first = render(<AudioRecorder enabled attached={false} onRecord={onRecord} onBusy={() => {}} />)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Record audio prompt' })))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel recording' })))
  expect(onRecord).not.toHaveBeenCalled(); expect(stop).toHaveBeenCalled()
  first.unmount()
  let grant!: (value: typeof stream) => void
  getUserMedia.mockImplementation(() => new Promise(resolve => { grant = resolve }))
  const second = render(<AudioRecorder enabled attached={false} onRecord={onRecord} onBusy={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: 'Record audio prompt' }))
  second.unmount()
  await act(async () => grant(stream))
  expect(stop.mock.calls.length).toBeGreaterThan(1)
  expect(onRecord).not.toHaveBeenCalled()
})
it('reports microphone denial and keeps real container extensions', async () => {
  microphone().getUserMedia.mockRejectedValueOnce(new Error('Permission denied'))
  render(<AudioRecorder enabled attached={false} onRecord={vi.fn()} onBusy={() => {}} />)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Record audio prompt' })))
  expect(screen.getByRole('alert').textContent).toContain('Permission denied')
  expect(recordingExtension('audio/ogg;codecs=opus')).toBe('ogg')
  expect(recordingExtension('audio/mp4')).toBe('m4a')
  expect(() => recordingExtension('video/webm')).toThrow()
})
it('retains a failed recording upload for retry without opening the microphone again', async () => {
  media(); const { getUserMedia } = microphone()
  const onRecord = vi.fn().mockRejectedValueOnce(new Error('Upload unavailable')).mockResolvedValueOnce(undefined)
  render(<AudioRecorder enabled attached={false} onRecord={onRecord} onBusy={() => {}} />)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Record audio prompt' })))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Stop recording' })))
  expect(screen.getByText('Recording not attached')).toBeTruthy()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry attachment' })))
  expect(screen.getByText('Ready to send')).toBeTruthy()
  expect(getUserMedia).toHaveBeenCalledTimes(1)
  expect(onRecord.mock.calls[1][0]).toBe(onRecord.mock.calls[0][0])
})
it('hides recording for an older bridge and disables send while a recording is live', async () => {
  microphone()
  const props = { draft: { text: 'Caption', files: [], head: 0, anchor: 0, revision: '' }, change: vi.fn(), expanded: false, toggle: vi.fn(), enabled: true, busy: false, pending: false, catalog: { entries: [] }, submit: vi.fn(), stop: vi.fn() }
  const { rerender } = render(<PromptComposer {...props} />)
  expect(screen.queryByRole('button', { name: 'Record audio prompt' })).toBeNull()
  rerender(<PromptComposer {...props} audioEnabled />)
  const record = screen.getByRole('button', { name: 'Record audio prompt' })
  expect(record.textContent).toBe('')
  expect(record.closest('.chat-composer-tools')).toBeTruthy()
  expect(record.parentElement?.nextElementSibling).toBe(screen.getByRole('button', { name: /Send/ }))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Record audio prompt' })))
  expect(screen.getByRole('button', { name: /Send/ }).hasAttribute('disabled')).toBe(true)
})
