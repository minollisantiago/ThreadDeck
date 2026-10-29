import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Mic, Square } from 'lucide-react'
import { audioTime } from '../../shared/audio'
import { TooltipHint } from '../components/ui/tooltip'
import './audio.css'

const limit = 10 * 1024 * 1024, maxSeconds = 300
export const recordingTypes = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/mp4']
export function recordingExtension(type: string) {
  if (type.startsWith('audio/ogg')) return 'ogg'
  if (type.startsWith('audio/webm')) return 'webm'
  if (type.startsWith('audio/mp4')) return 'm4a'
  throw new Error('This browser did not produce a supported audio format')
}
export function AudioRecorder({ enabled, attached, onRecord, onBusy, controls }: { enabled: boolean; attached: boolean; onRecord: (file: File) => Promise<void>; onBusy: (busy: boolean) => void; controls?: HTMLElement | null }) {
  const [state, setState] = useState<'idle' | 'starting' | 'recording' | 'saving' | 'ready' | 'failed'>('idle'), [seconds, setSeconds] = useState(0), [error, setError] = useState(''), [preview, setPreview] = useState('')
  const saved = useRef<File | null>(null)
  const recorder = useRef<MediaRecorder | null>(null), stream = useRef<MediaStream | null>(null), generation = useRef(0), timer = useRef<ReturnType<typeof setInterval> | null>(null), url = useRef(''), attachedOnce = useRef(false)
  const callbacks = useRef({ onRecord, onBusy }); callbacks.current = { onRecord, onBusy }
  const supported = typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
  function release() { if (timer.current) clearInterval(timer.current); timer.current = null; stream.current?.getTracks().forEach(track => track.stop()); stream.current = null }
  function clearPreview() { if (url.current) URL.revokeObjectURL(url.current); url.current = ''; saved.current = null; setPreview('') }
  async function attach(file: File, token: number) {
    setState('saving'); setError(''); callbacks.current.onBusy(true)
    try { await callbacks.current.onRecord(file); if (token === generation.current) setState('ready') }
    catch (cause) { if (token === generation.current) { setError(cause instanceof Error ? cause.message : 'Recording upload failed'); setState('failed') } }
    finally { if (token === generation.current) callbacks.current.onBusy(false) }
  }
  function cancel() {
    generation.current++; if (recorder.current?.state === 'recording') recorder.current.stop(); recorder.current = null
    release(); clearPreview(); setState('idle'); callbacks.current.onBusy(false)
  }
  useEffect(() => () => { generation.current++; if (recorder.current?.state === 'recording') recorder.current.stop(); release(); if (url.current) URL.revokeObjectURL(url.current) }, [])
  useEffect(() => {
    if (attached) attachedOnce.current = true
    else if (attachedOnce.current) { attachedOnce.current = false; clearPreview(); setState('idle') }
  }, [attached])
  useEffect(() => { if (!enabled && (state === 'recording' || state === 'starting')) cancel() }, [enabled, state])
  async function start() {
    if (!enabled || !supported || recorder.current) return
    const token = ++generation.current
    setState('starting'); setError(''); setSeconds(0); callbacks.current.onBusy(true)
    try {
      const input = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      if (token !== generation.current) { input.getTracks().forEach(track => track.stop()); return }
      stream.current = input
      const mimeType = recordingTypes.find(type => MediaRecorder.isTypeSupported(type))
      const next = new MediaRecorder(input, { ...(mimeType && { mimeType }), audioBitsPerSecond: 32_000 })
      recorder.current = next
      const chunks: Blob[] = []; let size = 0, tooLarge = false
      next.ondataavailable = event => {
        size += event.data.size
        if (size > limit) { tooLarge = true; if (next.state === 'recording') next.stop() }
        else if (event.data.size) chunks.push(event.data)
      }
      next.onerror = () => { if (token === generation.current) { cancel(); setError('Recording failed. Check your microphone and try again.') } }
      next.onstop = () => {
        if (token !== generation.current) return
        release(); recorder.current = null
        if (tooLarge || !size) { setState('idle'); setError(tooLarge ? 'Recording exceeds 10 MiB. Record a shorter prompt.' : 'The recording was empty. Try again.'); callbacks.current.onBusy(false); return }
        void (async () => {
          try {
            const type = next.mimeType || chunks[0]?.type || ''
            const file = new File(chunks, `voice-${Date.now()}.${recordingExtension(type)}`, { type })
            clearPreview(); saved.current = file; url.current = URL.createObjectURL(file); setPreview(url.current)
            await attach(file, token)
          } catch (cause) { if (token === generation.current) { setError(cause instanceof Error ? cause.message : 'Recording upload failed'); setState('idle'); clearPreview() } }
          finally { if (token === generation.current) callbacks.current.onBusy(false) }
        })()
      }
      next.start(1000); setState('recording')
      const started = Date.now()
      timer.current = setInterval(() => { const elapsed = Math.floor((Date.now() - started) / 1000); setSeconds(elapsed); if (elapsed >= maxSeconds && next.state === 'recording') next.stop() }, 250)
      input.getAudioTracks().forEach(track => { track.onended = () => { if (token === generation.current && next.state === 'recording') next.stop() } })
    } catch (cause) { if (token === generation.current) { release(); recorder.current = null; setState('idle'); callbacks.current.onBusy(false); setError(cause instanceof Error ? `Microphone unavailable: ${cause.message}` : 'Microphone unavailable') } }
  }
  const trigger = state === 'idle' && !attached ? <TooltipHint label={supported ? 'Record audio prompt · up to 5 minutes' : 'Microphone recording is unavailable; attach an audio file instead'}><button className="chat-record-button" type="button" aria-label="Record audio prompt" disabled={!enabled || !supported} onClick={() => void start()}><Mic size={17} aria-hidden="true" /></button></TooltipHint> : null
  return <><div className="chat-recorder">
    {controls === undefined && trigger}
    {(state === 'starting' || state === 'recording') && <div className="chat-recording"><span role="status">{state === 'starting' ? 'Waiting for microphone permission…' : `Recording ${audioTime(seconds)} / 5:00`}</span><button type="button" onClick={cancel}>Cancel recording</button>{state === 'recording' && <button type="button" onClick={() => recorder.current?.stop()}><Square size={12} />Stop recording</button>}</div>}
    {preview && <div className="chat-recording"><audio controls src={preview} aria-label="Recording preview" /><span role="status">{state === 'saving' ? 'Attaching recording…' : state === 'failed' ? 'Recording not attached' : 'Ready to send'}</span>{state === 'failed' && <><button type="button" disabled={!enabled} onClick={() => { if (saved.current) void attach(saved.current, generation.current) }}>Retry attachment</button><button type="button" onClick={cancel}>Discard recording</button></>}</div>}
    {error && <p className="chat-error" role="alert">{error}</p>}
  </div>{controls && createPortal(trigger, controls)}</>
}
