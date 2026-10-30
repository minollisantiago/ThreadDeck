import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { expect, it, vi } from 'vitest'
const { installAudioPermissions } = createRequire(import.meta.url)('../electron/audio-permissions.cjs')
it('allows clipboard writes only from the trusted main frame, never clipboard reads', () => {
  let request, check
  const origin = 'http://127.0.0.1:43127'
  const contents = { getURL: () => origin, session: { setPermissionRequestHandler: fn => { request = fn }, setPermissionCheckHandler: fn => { check = fn } } }
  installAudioPermissions({ webContents: contents }, origin)
  const result = vi.fn()
  const details = { requestingUrl: origin, isMainFrame: true }
  request(contents, 'clipboard-sanitized-write', result, details)
  expect(result).toHaveBeenLastCalledWith(true)
  expect(check(contents, 'clipboard-sanitized-write', origin, details)).toBe(true)
  for (const override of [{ isMainFrame: false }, { requestingUrl: 'https://evil.example/' }, { requestingUrl: 'file:///preview.html' }, { requestingUrl: 'null' }]) {
    request(contents, 'clipboard-sanitized-write', result, { ...details, ...override })
    expect(result).toHaveBeenLastCalledWith(false)
    expect(check(contents, 'clipboard-sanitized-write', override.requestingUrl ?? origin, { ...details, ...override })).toBe(false)
  }
  for (const permission of ['clipboard-read', 'deprecated-sync-clipboard-read', 'notifications']) {
    request(contents, permission, result, details)
    expect(result).toHaveBeenLastCalledWith(false)
    expect(check(contents, permission, origin, details)).toBe(false)
  }
  for (const other of [null, { getURL: () => origin }]) {
    expect(check(other, 'clipboard-sanitized-write', origin, details)).toBe(false)
    request(other, 'clipboard-sanitized-write', result, details)
    expect(result).toHaveBeenLastCalledWith(false)
  }
  contents.getURL = () => 'https://evil.example/'
  expect(check(contents, 'clipboard-sanitized-write', origin, details)).toBe(false)
  request(contents, 'clipboard-sanitized-write', result, details)
  expect(result).toHaveBeenLastCalledWith(false)
})
it('ships the permission helper with the Windows desktop shell', async () => {
  expect(await readFile(new URL('./desktop.mjs', import.meta.url), 'utf8')).toContain("'audio-permissions.cjs'")
})
it('allows only audio from the trusted main frame and denies previews, camera and external origins', () => {
  let request, check
  const contents = { getURL: () => 'http://127.0.0.1:43127/', session: { setPermissionRequestHandler: fn => { request = fn }, setPermissionCheckHandler: fn => { check = fn } } }
  installAudioPermissions({ webContents: contents }, 'http://127.0.0.1:43127')
  const details = { requestingUrl: contents.getURL(), isMainFrame: true, mediaTypes: ['audio'] }
  const result = vi.fn()
  request(contents, 'media', result, details)
  expect(result).toHaveBeenLastCalledWith(true)
  for (const override of [{ isMainFrame: false }, { mediaTypes: ['video'] }, { mediaTypes: ['audio', 'video'] }, { requestingUrl: 'https://evil.example/' }, { requestingUrl: 'file:///preview.html' }]) {
    request(contents, 'media', result, { ...details, ...override }); expect(result).toHaveBeenLastCalledWith(false)
  }
  request(contents, 'notifications', result, details); expect(result).toHaveBeenLastCalledWith(false)
  request({}, 'media', result, details); expect(result).toHaveBeenLastCalledWith(false)
  expect(check(contents, 'media', contents.getURL(), { isMainFrame: true, mediaType: 'audio' })).toBe(true)
  expect(check(contents, 'media', contents.getURL(), { isMainFrame: false, mediaType: 'audio' })).toBe(false)
  expect(check(contents, 'media', contents.getURL(), { isMainFrame: true, mediaType: 'video' })).toBe(false)
})
