import { useEffect, useState } from 'react'

export function sampleAudioPeaks(samples: Float32Array, bars = 64) {
  const peaks = Array.from({ length: bars }, (_, index) => {
    const start = Math.floor(index * samples.length / bars), end = Math.floor((index + 1) * samples.length / bars)
    let sum = 0
    for (let offset = start; offset < end; offset++) sum += samples[offset] ** 2
    return end > start ? Math.sqrt(sum / (end - start)) : 0
  })
  const maximum = Math.max(...peaks)
  return peaks.map(peak => maximum ? peak / maximum : 0)
}
export function discordAudioPeaks(value?: string | null) {
  if (!value || value.length > 344) return []
  try { return [...atob(value)].slice(0, 256).map(byte => byte.charCodeAt(0) / 255) } catch { return [] }
}
// Decode local preview bytes only. Published clips use Discord's waveform when
// available and never download/decode an entire thread just to draw a waveform.
export function useRecordingWaveform(blob?: Blob) {
  const [result, setResult] = useState<{ peaks: number[]; duration: number } | null>(null)
  useEffect(() => {
    setResult(null)
    if (!blob || typeof AudioContext === 'undefined') return
    let cancelled = false, context: AudioContext | undefined
    void (async () => {
      try {
        const bytes = await blob.arrayBuffer()
        if (cancelled) return
        context = new AudioContext()
        const audio = await context.decodeAudioData(bytes)
        if (!cancelled) setResult({ peaks: sampleAudioPeaks(audio.getChannelData(0)), duration: audio.duration })
      } catch { /* Playback stays usable if this browser cannot decode a preview waveform. */ }
      finally { if (context && context.state !== 'closed') await context.close().catch(() => {}) }
    })()
    return () => { cancelled = true; if (context && context.state !== 'closed') void context.close().catch(() => {}) }
  }, [blob])
  return result
}
