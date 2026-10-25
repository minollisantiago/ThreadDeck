import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
const require = createRequire(import.meta.url)
const { externalLink, chatExternalLink, mobileBounds } = require('../electron/policy.cjs')
const { appId, taskbarDetails } = require('../electron/taskbar.cjs')
const { colors, parseAppearance } = require('../electron/appearance.cjs')
const { readWindowState, fitWindowBounds, saveWindowState } = require('../electron/window-state.cjs')

test('window dimensions survive relaunch without turning the saved width into the minimum width', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'threaddeck-window-')), filename = path.join(directory, 'window-state.json')
  try {
    assert.equal(readWindowState(filename), null)
    const bounds = { x: 120, y: 60, width: 1380, height: 900 }
    saveWindowState(filename, bounds, true)
    assert.deepEqual(readWindowState(filename), { bounds, maximized: true })
    assert.deepEqual(fitWindowBounds(readWindowState(filename).bounds, { x: 0, y: 0, width: 1920, height: 1040 }), bounds)
    saveWindowState(filename, { ...bounds, width: 620 }, false)
    assert.equal(readWindowState(filename).bounds.width, 620)
    assert.equal(readWindowState(filename).maximized, false)
    writeFileSync(filename, 'corrupted JSON')
    assert.equal(readWindowState(filename), null)
    writeFileSync(filename, JSON.stringify({ version: 1, bounds: { ...bounds, width: -1 } }))
    assert.equal(readWindowState(filename), null)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
test('saved window bounds stay reachable after display removal or a smaller screen', () => {
  assert.deepEqual(fitWindowBounds({ x: 2400, y: 200, width: 1500, height: 1200 }, { x: 0, y: 0, width: 1280, height: 800 }), { x: 0, y: 0, width: 1280, height: 800 })
  assert.deepEqual(fitWindowBounds({ x: -1800, y: 20, width: 700, height: 900 }, { x: -1920, y: 0, width: 1920, height: 1040 }), { x: -1800, y: 20, width: 700, height: 900 })
  assert.deepEqual(fitWindowBounds({ x: 200, y: 20, width: 200, height: 200 }, { x: 0, y: 0, width: 360, height: 350 }), { x: 0, y: 0, width: 360, height: 350 })
})

test('startup appearance follows saved dashboard mode and falls back safely', () => {
  assert.equal(parseAppearance('"light"', 'dark'), 'light')
  assert.equal(parseAppearance('"dark"', 'light'), 'dark')
  for (const value of [null, 'null', '{}', '"system"', 'bad json']) assert.equal(parseAppearance(value, 'light'), 'light')
  assert.equal(colors.light, '#f4f3f6')
  assert.equal(colors.dark, '#101014')
})

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
test('explicit chat links open only credential-free HTTPS in the external browser', () => {
  for (const url of ['https://github.com/example/project', 'https://opencode.ai/v2/docs/']) assert.equal(chatExternalLink(url), true)
  for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'http://localhost', 'https://user:secret@example.com', 'discord://settings', 'not a URL']) assert.equal(chatExternalLink(url), false)
})
