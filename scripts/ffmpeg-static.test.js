import { expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import ffmpegPath from 'ffmpeg-static'
import { preparePromptAudio } from '../integrations/kimaki/audio-prompt.mjs'

it('converts real browser-format WebM to Ogg/Opus using the packaged binary without system PATH', async () => {
  expect(ffmpegPath).toBeTruthy()
  const exec = promisify(execFile), directory = await mkdtemp(path.join(tmpdir(), 'threaddeck-packaged-audio-'))
  const originalPath = process.env.PATH
  try {
    process.env.PATH = directory // No system ffmpeg or other executables are available.
    const input = path.join(directory, 'recording.webm')
    await exec(ffmpegPath, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.2', '-c:a', 'libopus', input], { timeout: 10_000 })
    const converted = await preparePromptAudio({ path: input, name: 'recording.webm' })
    const bytes = await readFile(converted.path)
    expect(bytes.subarray(0, 4).toString()).toBe('OggS')
    expect(bytes.includes(Buffer.from('OpusHead'))).toBe(true)
    await exec(ffmpegPath, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-i', converted.path, '-f', 'null', '-'], { timeout: 10_000 })
  } finally {
    if (originalPath === undefined) delete process.env.PATH
    else process.env.PATH = originalPath
    await rm(directory, { recursive: true, force: true })
  }
}, 20_000)
