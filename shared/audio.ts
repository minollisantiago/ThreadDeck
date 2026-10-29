// Deliberate allowlist: never serve arbitrary active content inline as audio.
const types: Record<string, string> = { 'audio/ogg': 'audio/ogg', 'audio/opus': 'audio/ogg', 'application/ogg': 'audio/ogg', 'audio/mpeg': 'audio/mpeg', 'audio/mp3': 'audio/mpeg', 'audio/wav': 'audio/wav', 'audio/x-wav': 'audio/wav', 'audio/mp4': 'audio/mp4', 'audio/x-m4a': 'audio/mp4', 'audio/webm': 'audio/webm', 'audio/flac': 'audio/flac' }
const extensions: Record<string, string> = { ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', webm: 'audio/webm', flac: 'audio/flac' }
export function inlineAudioType(name: string, type?: string | null) {
  const mime = type?.split(';')[0].trim().toLowerCase()
  if (mime && mime !== 'application/octet-stream') return types[mime]
  return extensions[name.split('.').at(-1)?.toLowerCase() || '']
}
export function audioTime(seconds: number) {
  const safe = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`
}
