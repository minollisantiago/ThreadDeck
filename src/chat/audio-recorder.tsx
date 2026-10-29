import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUp, Mic, Pause, Trash2 } from 'lucide-react'
import { audioTime } from '../../shared/audio'
import { TooltipHint } from '../components/ui/tooltip'
import { AudioMessage } from './audio-message'
import { AudioWaveform } from './audio-waveform'
import './audio.css'

const limit = 10 * 1024 * 1024, maxSeconds = 300
export const recordingTypes = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/mp4']
export function recordingExtension(type: string) {
  if (type.startsWith('audio/ogg')) return 'ogg'
  if (type.startsWith('audio/webm')) return 'webm'
  if (type.startsWith('audio/mp4')) return 'm4a'
  throw new Error('This browser did not produce a supported audio format')
}
export function AudioRecorder({ enabled, attached, onRecord, onBusy, onSubmit, submitLabel = 'Send recording', controls }: { enabled: boolean; attached: boolean; onRecord: (file: File) => Promise<void>; onBusy: (busy: boolean) => void; onSubmit?: () => void; submitLabel?: string; controls?: HTMLElement | null }) {
  const [state, setState] = useState<'idle' | 'starting' | 'recording' | 'paused' | 'saving' | 'ready' | 'failed'>('idle'), [seconds, setSeconds] = useState(0), [error, setError] = useState(''), [preview, setPreview] = useState('')
  const [peaks, setPeaks] = useState<number[]>([])
  const clock = useRef({ elapsed: 0, started: 0, paused: false }), submitOnStop = useRef(false)
  const graph = useRef<{ context: AudioContext; source: MediaStreamAudioSourceNode; analyser: AnalyserNode; samples: Float32Array<ArrayBuffer> } | null>(null)
  const saved = useRef<File | null>(null)
  const recorder = useRef<MediaRecorder | null>(null), stream = useRef<MediaStream | null>(null), generation = useRef(0), timer = useRef<ReturnType<typeof setInterval> | null>(null), url = useRef(''), attachedOnce = useRef(false)
  const callbacks = useRef({ onRecord, onBusy, onSubmit }); callbacks.current = { onRecord, onBusy, onSubmit }
  const supported = typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
  function release() {
    if (timer.current) clearInterval(timer.current); timer.current = null
    const current = graph.current; graph.current = null
    if (current) { current.source.disconnect(); if (current.context.state !== 'closed') void current.context.close().catch(() => {}) }
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null
  }
  function clearPreview() { if (url.current) URL.revokeObjectURL(url.current); url.current = ''; saved.current = null; setPreview('') }
  async function attach(file: File, token: number) {
    setState('saving'); setError(''); callbacks.current.onBusy(true)
    try {
      await callbacks.current.onRecord(file)
      if (token === generation.current) {
        setState('ready')
        if (submitOnStop.current) { submitOnStop.current = false; callbacks.current.onSubmit?.() }
      }
    }
    catch (cause) { if (token === generation.current) { setError(cause instanceof Error ? cause.message : 'Recording upload failed'); setState('failed') } }
    finally { if (token === generation.current) callbacks.current.onBusy(false) }
  }
  function cancel() {
    generation.current++; submitOnStop.current = false
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop(); recorder.current = null
    release(); clearPreview(); setState('idle'); callbacks.current.onBusy(false)
  }
  useEffect(() => () => { generation.current++; if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop(); release(); if (url.current) URL.revokeObjectURL(url.current) }, [])
  useEffect(() => {
    if (attached) attachedOnce.current = true
    else if (attachedOnce.current) { attachedOnce.current = false; clearPreview(); setState('idle') }
  }, [attached])
  useEffect(() => { if (!enabled && (state === 'recording' || state === 'paused' || state === 'starting')) cancel() }, [enabled, state])
  function elapsed() { return clock.current.elapsed + (clock.current.paused ? 0 : Date.now() - clock.current.started) }
  function togglePause() {
    const current = recorder.current
    if (!current) return
    if (current.state === 'recording') {
      clock.current.elapsed = elapsed(); clock.current.paused = true; current.pause(); setState('paused')
    } else if (current.state === 'paused') {
      clock.current.started = Date.now(); clock.current.paused = false; current.resume(); setState('recording')
    }
    setSeconds(Math.floor(elapsed() / 1000))
  }
  async function start() {
    if (!enabled || !supported || recorder.current) return
    const token = ++generation.current
    submitOnStop.current = false; setPeaks([])
    setState('starting'); setError(''); setSeconds(0); callbacks.current.onBusy(true)
    try {
      const input = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      if (token !== generation.current) { input.getTracks().forEach(track => track.stop()); return }
      stream.current = input
      // Meter the real microphone signal without connecting it to the speakers.
      if (typeof AudioContext !== 'undefined') {
        let context: AudioContext | undefined
        try {
          context = new AudioContext()
          const source = context.createMediaStreamSource(input), analyser = context.createAnalyser()
          analyser.fftSize = 512; source.connect(analyser)
          graph.current = { context, source, analyser, samples: new Float32Array(analyser.fftSize) }
          void context.resume().catch(() => {})
        } catch { if (context && context.state !== 'closed') void context.close().catch(() => {}) }
      }
      const mimeType = recordingTypes.find(type => MediaRecorder.isTypeSupported(type))
      const next = new MediaRecorder(input, { ...(mimeType && { mimeType }), audioBitsPerSecond: 32_000 })
      recorder.current = next
      const chunks: Blob[] = []; let size = 0, tooLarge = false
      next.ondataavailable = event => {
        size += event.data.size
        if (size > limit) { tooLarge = true; if (next.state !== 'inactive') next.stop() }
        else if (event.data.size) chunks.push(event.data)
      }
      next.onerror = () => { if (token === generation.current) { cancel(); setError('Recording failed. Check your microphone and try again.') } }
      next.onstop = () => {
        if (token !== generation.current) return
        setSeconds(Math.floor(elapsed() / 1000))
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
      clock.current = { elapsed: 0, started: Date.now(), paused: false }
      next.start(1000); setState('recording')
      timer.current = setInterval(() => {
        if (clock.current.paused) return
        const currentSeconds = Math.floor(elapsed() / 1000)
        setSeconds(currentSeconds)
        const meter = graph.current
        if (meter) {
          meter.analyser.getFloatTimeDomainData(meter.samples)
          const energy = Math.sqrt(meter.samples.reduce((sum, sample) => sum + sample * sample, 0) / meter.samples.length)
          setPeaks(previous => [...previous.slice(-63), Math.min(1, energy * 4)])
        }
        if (currentSeconds >= maxSeconds && next.state === 'recording') next.stop()
      }, 100)
      input.getAudioTracks().forEach(track => { track.onended = () => { if (token === generation.current && next.state !== 'inactive') next.stop() } })
    } catch (cause) { if (token === generation.current) { release(); recorder.current = null; setState('idle'); callbacks.current.onBusy(false); setError(cause instanceof Error ? `Microphone unavailable: ${cause.message}` : 'Microphone unavailable') } }
  }
  const trigger = state === 'idle' && !attached ? <TooltipHint label={supported ? 'Record audio prompt · up to 5 minutes' : 'Microphone recording is unavailable; attach an audio file instead'}><button className="chat-record-button" type="button" aria-label="Record audio prompt" disabled={!enabled || !supported} onClick={() => void start()}><Mic size={17} aria-hidden="true" /></button></TooltipHint> : null
  return <><div className="chat-recorder">
    {controls === undefined && trigger}
    {(state === 'starting' || state === 'recording' || state === 'paused') && <div className="chat-capture" role="group" aria-label="Audio recording" data-state={state}>
      <TooltipHint label="Discard recording"><button className="chat-capture-discard" type="button" aria-label="Discard recording" onClick={cancel}><Trash2 size={17} aria-hidden="true" /></button></TooltipHint>
      {state === 'starting' ? <span className="chat-capture-permission" role="status">Waiting for microphone permission…</span> : <>
        <div className="chat-audio-track" aria-label="Live recording waveform"><AudioWaveform peaks={Array<number>(Math.max(0, 64 - peaks.length)).fill(0).concat(peaks)} /></div>
        <span className="chat-capture-time" role="timer" aria-label="Recording duration" aria-live="off">{audioTime(seconds)}</span><span className="sr-only" role="status">{state === 'paused' ? 'Recording paused' : 'Recording'}</span>
        <TooltipHint label={state === 'paused' ? 'Resume recording' : 'Pause recording'}><button className="chat-capture-pause" type="button" aria-label={state === 'paused' ? 'Resume recording' : 'Pause recording'} onClick={togglePause}>{state === 'paused' ? <Mic size={17} aria-hidden="true" /> : <Pause size={17} aria-hidden="true" />}</button></TooltipHint>
        <TooltipHint label={submitLabel}><button className="chat-capture-submit" type="button" aria-label="Submit recording" disabled={!enabled} onClick={() => { if (recorder.current && recorder.current.state !== 'inactive') { submitOnStop.current = true; recorder.current.stop() } }}><ArrowUp size={17} aria-hidden="true" /></button></TooltipHint>
      </>}
    </div>}
    {preview && <div className="chat-recording-preview"><AudioMessage key={preview} src={preview} name="Recording preview" blob={saved.current || undefined} duration={seconds} preview /><div className="chat-recording-preview-status"><span role="status">{state === 'saving' ? 'Attaching recording…' : state === 'failed' ? 'Recording not attached' : 'Ready to send'}</span>{state === 'failed' && <><button type="button" disabled={!enabled} onClick={() => { if (saved.current) void attach(saved.current, generation.current) }}>Retry attachment</button><button type="button" onClick={cancel}>Discard recording</button></>}</div></div>}
    {error && <p className="chat-error" role="alert">{error}</p>}
  </div>{controls && createPortal(trigger, controls)}</>
}
