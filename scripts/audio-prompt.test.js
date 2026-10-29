import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import ffmpegPath from 'ffmpeg-static'
const mocks = vi.hoisted(() => ({ execFile: vi.fn() }))
vi.mock('node:child_process', () => ({ execFile: mocks.execFile }))
import { preparePromptAudio } from '../integrations/kimaki/audio-prompt.mjs'

const directories = []
afterEach(async () => { mocks.execFile.mockReset(); await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))) })
it('preserves formats already supported by Kimaki without invoking a converter', async () => {
  const file = { path: '/synthetic/voice.ogg', name: 'voice.ogg' }
  expect(await preparePromptAudio(file)).toBe(file)
  expect(mocks.execFile).not.toHaveBeenCalled()
})
it('normalizes WebM to private Ogg/Opus with bounded process execution and reuses the result', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'threaddeck-audio-')); directories.push(directory)
  const file = { path: path.join(directory, 'opaque.file.webm'), name: 'voice.webm' }
  await writeFile(file.path, 'webm input')
  mocks.execFile.mockImplementation((_command, args, _options, callback) => {
    void writeFile(args.at(-1), 'converted ogg').then(() => callback(null, '', ''))
  })
  const prepared = await preparePromptAudio(file)
  expect(prepared.name).toBe('voice.ogg')
  expect(await readFile(prepared.path, 'utf8')).toBe('converted ogg')
  expect((await stat(prepared.path)).mode & 0o777).toBe(0o600)
  expect(mocks.execFile).toHaveBeenCalledWith(ffmpegPath, expect.arrayContaining(['-f', 'matroska', '-vn', '-c:a', 'libopus']), expect.objectContaining({ timeout: 60_000, windowsHide: true }), expect.any(Function))
  await preparePromptAudio(file)
  expect(mocks.execFile).toHaveBeenCalledTimes(1)
  expect((await readdir(directory)).length).toBe(2)
})
it('fails clearly and removes partial output without altering the original file', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'threaddeck-audio-')); directories.push(directory)
  const file = { path: path.join(directory, 'opaque.file.webm'), name: 'voice.webm' }
  await writeFile(file.path, 'original bytes')
  mocks.execFile.mockImplementation((_command, _args, _options, callback) => callback(new Error('ENOENT')))
  await expect(preparePromptAudio(file)).rejects.toThrow('ffmpeg-static dependency')
  expect(await readdir(directory)).toEqual(['opaque.file.webm'])
  expect(await readFile(file.path, 'utf8')).toBe('original bytes')
})
