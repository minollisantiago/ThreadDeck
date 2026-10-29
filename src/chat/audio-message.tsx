import { useEffect, useId, useRef, useState } from 'react'
import { CornerUpRight, Pause, Play, Volume2, VolumeX } from 'lucide-react'
import { audioTime } from '../../shared/audio'
import { AudioWaveform, discordAudioPeaks, useRecordingWaveform } from './audio-waveform'
import { TooltipHint } from '../components/ui/tooltip'
import './audio.css'

let active: HTMLAudioElement | null = null
const playbackSpeeds = [1, 1.5, 1.75, 2]
export function AudioMessage({ src, name, duration: initialDuration, waveform, forward, blob, preview = false }: { src: string; name: string; duration?: number | null; waveform?: string | null; forward?: () => void; blob?: Blob; preview?: boolean }) {
  const audio = useRef<HTMLAudioElement>(null)
  const [loaded, setLoaded] = useState(false), [playing, setPlaying] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState('')
  const [elapsed, setElapsed] = useState(0), [duration, setDuration] = useState(initialDuration || 0), [speed, setSpeed] = useState(1)
  const [volume, setVolume] = useState(1), [volumeOpen, setVolumeOpen] = useState(false)
  const volumeGroup = useRef<HTMLDivElement>(null), volumeButton = useRef<HTMLButtonElement>(null), lastVolume = useRef(1), volumeId = useId()
  const decoded = useRecordingWaveform(blob)
  const points = decoded?.peaks || discordAudioPeaks(waveform), total = decoded?.duration || duration
  const progress = total ? Math.min(1, elapsed / total) : 0
  useEffect(() => {
    if (!volumeOpen) return
    const dismiss = (event: PointerEvent) => { if (!volumeGroup.current?.contains(event.target as Node)) setVolumeOpen(false) }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [volumeOpen])
  useEffect(() => { const element = audio.current; return () => { element?.pause(); if (active === element) active = null } }, [])
  async function toggle() {
    const element = audio.current
    if (!element) return
    if (!element.paused) { element.pause(); return }
    if (active && active !== element) active.pause()
    active = element; setError(''); setLoading(true)
    if (!loaded) { element.src = src; setLoaded(true) }
    element.playbackRate = speed; element.volume = volume
    try { await element.play() } catch { setError('Audio could not play. Retry or download the recording.'); setLoading(false) }
  }
  function changeVolume(value: number) {
    setVolume(value); if (value > 0) lastVolume.current = value
    if (audio.current) audio.current.volume = value
  }
  return <div className={`chat-audio${preview ? ' chat-audio-preview' : ''}`} aria-label={`Audio: ${name}`}>
    <audio ref={audio} preload="none" onPlay={() => { setPlaying(true); setLoading(false) }} onPause={() => { setPlaying(false); setLoading(false) }} onEnded={() => { setPlaying(false); setLoading(false) }} onWaiting={() => setLoading(true)} onPlaying={() => setLoading(false)} onTimeUpdate={() => setElapsed(audio.current?.currentTime || 0)} onDurationChange={() => { const value = audio.current?.duration; if (value && Number.isFinite(value)) setDuration(value) }} onError={() => { setError('Audio unavailable or unsupported. Retry or download it.'); setLoading(false); setPlaying(false); setLoaded(false) }} />
    <div className="chat-audio-controls"><button className="chat-audio-play" type="button" aria-label={`${playing ? 'Pause' : error ? 'Retry' : 'Play'} ${name}`} onClick={() => void toggle()}>{playing ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}</button>
      <div className="chat-audio-track" data-waveform={points.length ? 'ready' : 'unavailable'}><AudioWaveform peaks={points} progress={progress} /><input type="range" aria-label={`Seek ${name}`} aria-valuetext={`${audioTime(elapsed)} of ${audioTime(total)}`} min={0} max={total || 1} step="0.1" value={Math.min(elapsed, total || 1)} disabled={!loaded || !total} onChange={event => { if (audio.current) { audio.current.currentTime = Number(event.target.value); setElapsed(Number(event.target.value)) } }} /></div>
      <span className="chat-audio-time" aria-label={`Remaining time for ${name}`}>{loading ? '…' : audioTime(Math.max(0, total - elapsed))}</span>
      <TooltipHint label="Playback speed · click to cycle"><button className="chat-audio-speed" type="button" aria-label={`Playback speed for ${name}: ${speed}×`} onClick={() => { const next = playbackSpeeds[(playbackSpeeds.indexOf(speed) + 1) % playbackSpeeds.length]; setSpeed(next); if (audio.current) audio.current.playbackRate = next }}>{speed}×</button></TooltipHint>
      <div className="chat-audio-volume" ref={volumeGroup} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setVolumeOpen(false) }} onKeyDown={event => { if (event.key === 'Escape' && volumeOpen) { event.preventDefault(); event.stopPropagation(); setVolumeOpen(false); volumeButton.current?.focus() } }}>
        <TooltipHint label="Volume"><button ref={volumeButton} className="chat-audio-volume-button" type="button" aria-label={`Adjust volume for ${name}`} aria-expanded={volumeOpen} aria-controls={volumeId} onClick={() => setVolumeOpen(value => !value)}>{volume ? <Volume2 size={18} aria-hidden="true" /> : <VolumeX size={18} aria-hidden="true" />}</button></TooltipHint>
        {volumeOpen && <div className="chat-audio-volume-popover" id={volumeId} role="group" aria-label={`Volume controls for ${name}`}><button type="button" aria-label={`${volume ? 'Mute' : 'Unmute'} ${name}`} onClick={() => changeVolume(volume ? 0 : lastVolume.current)}>{volume ? <Volume2 size={16} aria-hidden="true" /> : <VolumeX size={16} aria-hidden="true" />}</button><input type="range" aria-label={`Volume for ${name}`} aria-orientation="vertical" aria-valuetext={`${Math.round(volume * 100)}%`} min="0" max="1" step="0.05" value={volume} onChange={event => changeVolume(Number(event.target.value))} /></div>}
      </div>
      {!preview && forward && <TooltipHint label="Use as prompt"><button className="chat-audio-forward" type="button" aria-label="Use as prompt" onClick={forward}><CornerUpRight size={16} aria-hidden="true" /></button></TooltipHint>}
    </div>{error && <p className="chat-error" role="alert">{error} <a href={src} download={name}>Download</a></p>}
  </div>
}
