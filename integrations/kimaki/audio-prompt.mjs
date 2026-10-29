// Local media preparation only. Provider selection/transcription stays in Kimaki.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { chmod, lstat, rename, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import ffmpegPath from 'ffmpeg-static'

const exec = promisify(execFile)
const direct = new Set(['.ogg', '.oga', '.opus', '.mp3', '.wav', '.m4a'])
const formats = { '.webm': 'matroska', '.mp4': 'mov', '.flac': 'flac' }
export function supportedAudioName(name) { return direct.has(path.extname(name).toLowerCase()) || Boolean(formats[path.extname(name).toLowerCase()]) }
export async function preparePromptAudio(file) {
  const extension = path.extname(file.name).toLowerCase()
  if (direct.has(extension)) return file
  const format = formats[extension]
  if (!format) throw new Error('Use Ogg, MP3, WAV, M4A, WebM, MP4 audio, or FLAC for an audio prompt')
  const output = `${file.path}.audio.ogg`
  const existing = await lstat(output).catch(() => null)
  if (!existing) {
    const temporary = `${file.path}.${randomUUID()}.ogg`
    try {
      await writeFile(temporary, '', { mode: 0o600, flag: 'wx' })
      if (!ffmpegPath) throw new Error('No packaged FFmpeg binary for this platform')
      await exec(ffmpegPath, ['-nostdin', '-y', '-hide_banner', '-loglevel', 'error', '-protocol_whitelist', 'file,pipe', '-f', format, '-i', file.path, '-vn', '-ac', '1', '-ar', '48000', '-c:a', 'libopus', '-b:a', '32k', temporary], { timeout: 60_000, maxBuffer: 64 * 1024, windowsHide: true })
      const stat = await lstat(temporary)
      if (!stat.size || stat.size > 10 * 1024 * 1024) throw new Error('Converted audio exceeds the 10 MiB limit or is empty')
      await chmod(temporary, 0o600)
      await rename(temporary, output)
    } catch (cause) {
      throw new Error('Could not convert this recording to Ogg/Opus. Check that the recording is valid and the ffmpeg-static dependency is installed with its binary download enabled.', { cause })
    } finally { await rm(temporary, { force: true }) }
  } else if (!existing.isFile() || existing.isSymbolicLink() || !existing.size || existing.size > 10 * 1024 * 1024) throw new Error('Converted audio is unavailable')
  return { ...file, path: output, name: `${path.parse(file.name).name}.ogg` }
}
