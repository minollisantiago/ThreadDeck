import { useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { audioTime } from '../../shared/audio'
import './audio.css'

let active: HTMLAudioElement | null = null
function waveformPoints(value?: string | null) {
  if (!value || value.length > 344) return []
  try { return [...atob(value)].slice(0, 256).filter((_, index) => index % 4 === 0).map(byte => Math.max(8, byte.charCodeAt(0) / 255 * 100)) } catch { return [] }
}
export function AudioMessage({ src, name, duration: initialDuration, waveform, forward }: { src: string; name: string; duration?: number | null; waveform?: string | null; forward?: () => void }) {
  const audio = useRef<HTMLAudioElement>(null)
  const [loaded, setLoaded] = useState(false), [playing, setPlaying] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState('')
  const [elapsed, setElapsed] = useState(0), [duration, setDuration] = useState(initialDuration || 0), [speed, setSpeed] = useState('1')
  const points = waveformPoints(waveform)
  useEffect(() => { const element = audio.current; return () => { element?.pause(); if (active === element) active = null } }, [])
  async function toggle() {
    const element = audio.current
    if (!element) return
    if (!element.paused) { element.pause(); return }
    if (active && active !== element) active.pause()
    active = element; setError(''); setLoading(true)
    if (!loaded) { element.src = src; setLoaded(true) }
    element.playbackRate = Number(speed)
    try { await element.play() } catch { setError('Audio could not play. Retry or download the recording.'); setLoading(false) }
  }
  return <div className="chat-audio" aria-label={`Audio: ${name}`}>
    <audio ref={audio} preload="none" onPlay={() => { setPlaying(true); setLoading(false) }} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setLoading(false) }} onWaiting={() => setLoading(true)} onPlaying={() => setLoading(false)} onTimeUpdate={() => setElapsed(audio.current?.currentTime || 0)} onDurationChange={() => { const value = audio.current?.duration; if (value && Number.isFinite(value)) setDuration(value) }} onError={() => { setError('Audio unavailable or unsupported. Retry or download it.'); setLoading(false); setPlaying(false); setLoaded(false) }} />
    <div className="chat-audio-controls"><button type="button" aria-label={`${playing ? 'Pause' : error ? 'Retry' : 'Play'} ${name}`} onClick={() => void toggle()}>{playing ? <Pause size={18} /> : <Play size={18} />}</button>
      <div className="chat-audio-track"><div className="chat-audio-waveform" aria-hidden="true">{points.map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div><input type="range" aria-label={`Seek ${name}`} min={0} max={duration || 1} step="0.1" value={Math.min(elapsed, duration || 1)} disabled={!loaded || !duration} onChange={event => { if (audio.current) { audio.current.currentTime = Number(event.target.value); setElapsed(Number(event.target.value)) } }} /></div>
      <span className="chat-audio-time">{audioTime(elapsed)} / {audioTime(duration)}</span><select aria-label={`Playback speed for ${name}`} value={speed} onChange={event => { setSpeed(event.target.value); if (audio.current) audio.current.playbackRate = Number(event.target.value) }}>{['1', '1.25', '1.5', '2'].map(value => <option key={value} value={value}>{value}×</option>)}</select>
    </div><div className="chat-audio-meta"><span>{loading ? 'Loading audio…' : name}</span><a href={src} download={name}>Download</a>{forward && <button type="button" onClick={forward}>Use as prompt</button>}</div>{error && <p className="chat-error" role="alert">{error}</p>}
  </div>
}
