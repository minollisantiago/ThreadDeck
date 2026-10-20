import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
const require = createRequire(import.meta.url)
const { externalLink, mobileBounds } = require('../electron/policy.cjs')
const { appId, taskbarDetails } = require('../electron/taskbar.cjs')

test('taskbar icon and relaunch metadata share the shortcut app identity', () => {
  const details = taskbarDetails('C:\\Apps\\Thread Deck\\runtime', 43127, { exists: () => true, windowsDirectory: 'C:\\Windows' })
  assert.equal(details.appId, appId)
  assert.equal(details.appIconPath, 'C:\\Apps\\Thread Deck\\runtime\\ThreadDeck.ico')
  assert.equal(details.relaunchDisplayName, 'ThreadDeck')
  assert.equal(details.relaunchCommand, '"C:\\Windows\\System32\\wscript.exe" "C:\\Apps\\Thread Deck\\launch.vbs"')
  const fallback = taskbarDetails('C:\\Apps\\runtime', 43127, { exists: () => false, executable: 'C:\\Apps\\runtime\\electron.exe' })
  assert.ok(fallback.relaunchCommand.includes('main.cjs'))
  assert.ok(!fallback.relaunchCommand.includes('supervisor-lease'))
})

test('Windows app icon includes small and high-DPI versions of the favicon', () => {
  const icon = readFileSync(new URL('../electron/ThreadDeck.ico', import.meta.url))
  assert.equal(icon.readUInt16LE(2), 1)
  assert.equal(icon.readUInt16LE(4), 7)
  assert.deepEqual(Array.from({ length: 7 }, (_, index) => icon[6 + index * 16] || 256), [16, 24, 32, 48, 64, 128, 256])
})

test('narrow default fills available height without covering the taskbar', () => {
  assert.deepEqual(mobileBounds({ x: -1920, y: 20, width: 1920, height: 1040 }), { x: -1920, y: 20, width: 430, height: 1040 })
  assert.equal(mobileBounds({ x: 0, y: 0, width: 360, height: 800 }).width, 360)
})
test('only Discord thread links can leave the desktop shell', () => {
  for (const url of ['https://discord.com/channels/123/456', 'discord://-/channels/123/456']) assert.equal(externalLink(url), true)
  for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'https://discord.com.evil.test/channels/123', 'https://example.com', 'http://discord.com/channels/123', 'discord://settings', 'not a URL']) assert.equal(externalLink(url), false, url)
})
